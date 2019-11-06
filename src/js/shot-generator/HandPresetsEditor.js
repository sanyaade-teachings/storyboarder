const { remote } = require('electron')
const { useState, useEffect, useMemo, forwardRef, useRef } = React = require('react')
const { connect } = require('react-redux')
const path = require('path')
const fs = require('fs-extra')
const classNames = require('classnames')
const prompt = require('electron-prompt')
const LiquidMetal = require('liquidmetal')
const THREE = require('three')
window.THREE = THREE

// for pose harvesting (maybe abstract this later?)
const { machineIdSync } = require('node-machine-id')
const pkg = require('../../../package.json')
const request = require('request')

const { FixedSizeGrid } = require('react-window')

const h = require('../utils/h')

const {
  updateObject,
  createHandPosePreset,

  getSceneObjects
} = require('../shared/reducers/shot-generator')

const ModelLoader = require('../services/model-loader')

require('../vendor/three/examples/js/utils/SkeletonUtils')

const defaultPosePresets = require('../shared/reducers/shot-generator-presets/hand-poses.json')
const presetsStorage = require('../shared/store/presetsStorage')

const comparePresetNames = (a, b) => {
  var nameA = a.name.toUpperCase()
  var nameB = b.name.toUpperCase()

  if (nameA < nameB) {
    return -1
  }
  if (nameA > nameB) {
    return 1
  }
  return 0
}

const comparePresetPriority = (a, b) => b.priority - a.priority

const searchPresetsForTerms = (presets, terms) => {
  const matchAll = terms == null || terms.length === 0

  return presets
    .sort(comparePresetNames)
    .filter(preset => {
      if (matchAll) return true

      return (
        (LiquidMetal.score(preset.name, terms) > 0.8) ||
        (preset.keywords && LiquidMetal.score(preset.keywords, terms) > 0.8)
      )
    })
    .sort(comparePresetPriority)
}

const shortId = id => id.toString().substr(0, 7).toLowerCase()

const GUTTER_SIZE = 5
const ITEM_WIDTH = 68
const ITEM_HEIGHT = 132

const IMAGE_WIDTH = ITEM_WIDTH
const IMAGE_HEIGHT = 100

const ThumbnailRenderer = require('./ThumbnailRenderer')

const filepathFor = model => 
  ModelLoader.getFilepathForModel(
    { model: model.id, type: model.type },
    { storyboarderFilePath: null })

const CHARACTER_MODEL = { id: 'adult-male', type: 'character' }

const setupRenderer = ({ thumbnailRenderer, attachments, preset }) => {
  if (!thumbnailRenderer.getGroup().children.length) {
    let modelData = attachments[filepathFor(CHARACTER_MODEL)].value

    let group = THREE.SkeletonUtils.clone(modelData.scene.children[0])
    let child = group.children[1]

    let material = new THREE.MeshToonMaterial({
      color: 0xffffff,
      emissive: 0x0,
      specular: 0x0,
      skinning: true,
      shininess: 0,
      flatShading: false,
      morphNormals: true,
      morphTargets: true,
      map: modelData.scene.children[0].children[1].material.map
    })
    material.map.needsUpdate = true

    child.material = material
    thumbnailRenderer.getGroup().add(group)
    group.rotation.y = Math.PI/20

    // uncomment to test a simple box
    //
    // let box = new THREE.Mesh(
    //   new THREE.BoxGeometry( 1, 1, 1 ),
    //   new THREE.MeshToonMaterial({
    //     color: 0xcccccc,
    //     emissive: 0x0,
    //     specular: 0x0,
    //     shininess: 0,
    //     flatShading: false
    //   })
    // )
    // thumbnailRenderer.getGroup().add(box)
  }

  // setup thumbnail renderer
  let mesh = thumbnailRenderer.getGroup().children[0].children[1]
  let pose = preset.state.skeleton
  let skeleton = mesh.skeleton
  skeleton.pose()
  for (let name in pose) {
    let bone = skeleton.getBoneByName(name)
    if (bone) {
      bone.rotation.x = pose[name].rotation.x
      bone.rotation.y = pose[name].rotation.y
      bone.rotation.z = pose[name].rotation.z

      if (name === 'Hips') {
        bone.rotation.x += Math.PI / 2.0
      }
    }
  }
}

const HandPresetsEditorItem = React.memo(({ style, id, handPosePresetId, preset, updateObject, attachments, thumbnailRenderer }) => {
  const src = path.join(remote.app.getPath('userData'), 'presets', 'handPoses', `${preset.id}.jpg`)

  const onPointerDown = event => {
    event.preventDefault()

    let handPosePresetId = preset.id
    let handSkeleton = preset.state.handSkeleton

    updateObject(id, { handPosePresetId, handSkeleton })
  }

  useMemo(() => {
    let hasRendered = fs.existsSync(src)

    if (!hasRendered) {
      thumbnailRenderer.current = thumbnailRenderer.current || new ThumbnailRenderer()
      setupRenderer({
        thumbnailRenderer: thumbnailRenderer.current,
        attachments,
        preset
      })
      thumbnailRenderer.current.render()
      let dataURL = thumbnailRenderer.current.toDataURL('image/jpg')
      thumbnailRenderer.current.clear()

      fs.ensureDirSync(path.dirname(src))

      fs.writeFileSync(
        src,
        dataURL.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      )
    }
  }, [src])

  let className = classNames({
    'thumbnail-search__item--selected': handPosePresetId === preset.id
  })

  return h(['div.thumbnail-search__item', {
    style,
    className,
    onPointerDown,
    'data-id': preset.id,
    title: preset.name
  }, [
    ['figure', { style: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT }}, [
      ['img', { src, style: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT } }]
    ]],
    ['div.thumbnail-search__name', {
      style: {
        width: ITEM_WIDTH,
        height: ITEM_HEIGHT - IMAGE_HEIGHT - GUTTER_SIZE
      },
    }, preset.name]
  ]])
})

const ListItem = React.memo(({ data, columnIndex, rowIndex, style }) => {
  let { id, handPosePresetId, updateObject, attachments, thumbnailRenderer } = data
  let preset = data.presets[columnIndex + (rowIndex * 4)]

  if (!preset) return h(['div', { style }])

  return h([
    HandPresetsEditorItem,
    {
      style,
      id, handPosePresetId, attachments, updateObject,
      preset,

      thumbnailRenderer
    }
  ])
})

const HandPresetsEditor = connect(
  state => ({
    attachments: state.attachments,

    handPosePresets: state.presets.handPoses,
  }),
  {
    updateObject,
    createHandPosePreset,
    withState: (fn) => (dispatch, getState) => fn(dispatch, getState())
  }
)(
React.memo(({
  id,
  handPosePresetId,

  handPosePresets,
  attachments,

  updateObject,
  createHandPosePreset,
  withState
}) => {
  const thumbnailRenderer = useRef()

  const [ready, setReady] = useState(false)
  const [terms, setTerms] = useState(null)
  // !!!!!Should be intialized somewhere else
 // handPosePresets = []
  const presets = useMemo(() => searchPresetsForTerms(Object.values(handPosePresets), terms), [handPosePresets, terms])

  useEffect(() => {
    if (ready) return

    let filepath = filepathFor(CHARACTER_MODEL)
    if (attachments[filepath] && attachments[filepath].value) {
      setTimeout(() => {
        setReady(true)
      }, 100) // slight delay for snappier character selection via click
    }
  }, [attachments])


  const onChange = event => {
    event.preventDefault()
    setTerms(event.currentTarget.value)
  }

  const onCreateHandPosePreset = event => {
    event.preventDefault()

    // show a prompt to get the desired preset name
    let win = remote.getCurrentWindow()
    prompt({
      title: 'Preset Name',
      label: 'Select a Preset Name',
      value: `HandPose ${shortId(THREE.Math.generateUUID())}`,
    }, win).then(name => prompt({   
        title: 'Hand chooser',
        lable: 'Select which hand to save',   
        type: 'select',
        selectOptions: { 
            'LeftHand': 'LeftHand',
            'RightHand': 'RightHand',
        }}, win).then(handName => {
            if (name != null && name != '' && name != ' ') {
              withState((dispatch, state) => {
                // get the latest skeleton data
                let sceneObject = getSceneObjects(state)[id]
                let skeleton = sceneObject.skeleton
                let model = sceneObject.model
                let handSkeleton = {}
        
                let skeletonKeys = Object.keys(skeleton)
                for(let i = 0; i < skeletonKeys.length; i++) {
                    let key = skeletonKeys[i]
                    if(key.includes(handName)) {
                        handSkeleton[key] = skeleton[key]
                    }
                }
                // create a preset out of it
                let newPreset = {
                  id: THREE.Math.generateUUID(),
                  name,
                  keywords: name, // TODO keyword editing
                  state: {
                    handSkeleton: handSkeleton || {}
                  },
                  priority: 0
                }
            
                // add it to state
                createHandPosePreset(newPreset)
            
                // save to server
                // for pose harvesting (maybe abstract this later?)
                request.post('https://storyboarders.com/api/create_pose', {
                  form: {
                    name: name,
                    json: JSON.stringify(skeleton),
                    model_type: model,
                    storyboarder_version: pkg.version,
                    machine_id: machineIdSync()
                  }
                })
            
                // select the preset in the list
                updateObject(id, { handPosePresetId: newPreset.id })
            
                // get updated state (with newly created pose preset)
                withState((dispatch, state) => {
                  // ... and save it to the presets file
                  let denylist = Object.keys(defaultPosePresets)
                  let filteredPoses = Object.values(state.presets.handPoses)
                    .filter(pose => denylist.includes(pose.id) === false)
                    .reduce(
                      (coll, pose) => {
                        coll[pose.id] = pose
                        return coll
                      },
                      {}
                    )
                  presetsStorage.saveHandPosePresets({ handPoses: filteredPoses })
                })
              })
            }
    }).catch(err =>
      console.error(err)
    ))
  }

  // via https://reactjs.org/docs/forwarding-refs.html
  const innerElementType = forwardRef(({ style, ...rest }, ref) => {
    return h([
      'div',
      {
        ref,
        style: {
          ...style,
          width: 288, // cut off the right side gutter
          position: 'relative',
          overflow: 'hidden'
        },
        ...rest
      },
    ])
  })

  return h(
    ['div.thumbnail-search.column', ready && [
      ['div.row', { style: { padding: '6px 0' } }, [
        ['div.column', { style: { flex: 1 }}, [
          ['input', {
            placeholder: 'Search for a pose …',
            onChange
          }],
        ]],
        ['div.column', { style: { marginLeft: 5 }}, [
          ['a.button_add[href=#]', {
            style: { width: 30, height: 34 },
            onPointerDown: onCreateHandPosePreset
          }, '+']
        ]]
      ]],
      ['div.thumbnail-search__list', [
        FixedSizeGrid,
        {
          columnCount: 4,
          columnWidth: ITEM_WIDTH + GUTTER_SIZE,

          rowCount: Math.ceil(presets.length / 4),
          rowHeight: ITEM_HEIGHT,

          width: 288,
          height: 363,

          innerElementType,

          itemData: {
            presets,

            id: id,
            handPosePresetId: handPosePresetId,

            attachments,
            updateObject,

            thumbnailRenderer
          },
          children: ListItem
        }
      ]]
    ]]
  )
}))

module.exports = HandPresetsEditor
