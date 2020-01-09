import { remote } from 'electron'
import React, { useState, useEffect, useMemo, forwardRef, useRef, useCallback } from 'react'
import { connect } from 'react-redux'
import prompt from 'electron-prompt'
import * as THREE from 'three'
window.THREE = THREE

// for pose harvesting (maybe abstract this later?)
import { machineIdSync } from 'node-machine-id'
import pkg from '../../../../../package.json'
import request from 'request'
import { FixedSizeGrid } from 'react-window'
import {
  updateObject,
  createPosePreset,
  getSceneObjects
} from '../../../shared/reducers/shot-generator'

import defaultPosePresets from '../../../shared/reducers/shot-generator-presets/poses.json'
import presetsStorage from '../../../shared/store/presetsStorage'

import { comparePresetNames, comparePresetPriority } from '../../utils/searchPresetsForTerms' 
import { NUM_COLS, GUTTER_SIZE, ITEM_WIDTH, ITEM_HEIGHT, CHARACTER_MODEL } from './ItemSettings'
import ListItem from './ListItem'
import { filepathFor } from '../../utils/filepathFor'
import deepEqualSelector from './../../../utils/deepEqualSelector'
import SearchList from '../SearchList/index.js'
const shortId = id => id.toString().substr(0, 7).toLowerCase()

const getAttachmentM = deepEqualSelector([(state) => state.attachments], (attachments) => { 
    let filepath = filepathFor(CHARACTER_MODEL)
    return !attachments[filepath] ? undefined : attachments[filepath].status
})
const PosePresetsEditor = connect(
  state => ({
    attachmentStatus: getAttachmentM(state),
    posePresets: state.presets.poses,
  }),
  {
    updateObject,
    createPosePreset,
    withState: (fn) => (dispatch, getState) => fn(dispatch, getState())
  }
)(
React.memo(({
  id,

  posePresets,
  attachmentStatus,

  updateObject,
  createPosePreset,
  withState
}) => {
  const thumbnailRenderer = useRef()

  const sortedAttachament = useRef([])
  const getAttachment = () => {
    let attachment 
    withState((dispatch, state) => {
      let filepath = filepathFor(CHARACTER_MODEL)
      attachment = state.attachments[filepath].value
    })
   
    return attachment
  }
  const [attachment, setAttachment] = useState(getAttachment())

  const [ready, setReady] = useState(false)
  const [results, setResult] = useState([])

  const presets = useMemo(() => {
    console.log(posePresets)
    if(!posePresets) return
    let sortedPoses = Object.values(posePresets).sort(comparePresetNames).sort(comparePresetPriority)
    sortedAttachament.current = sortedPoses.map((preset, index) => {
      return {
        value: preset.name + "|" + preset.keywords,
        id: index
      }
    })
    setResult(sortedPoses)
    return sortedPoses
  }, [posePresets])

  const getPosePresetId = () => {
    let posePresetId
    withState((dispatch, state) => {
      posePresetId = getSceneObjects(state)[id].posePresetId
    })
    return posePresetId
  }


  useEffect(() => {
    if (ready) return
    if (attachmentStatus === "Success" && !attachment) {
      let attachment = getAttachment()
      setAttachment(attachment)
      setTimeout(() => {
        setReady(true)
      }, 100) // slight delay for snappier character selection via click
    }
  }, [attachmentStatus])


  const saveFilteredPresets = useCallback(filteredPreset => {
    let objects = []
    for(let i = 0; i < filteredPreset.length; i++) {
      objects.push(presets[filteredPreset[i].id])
    }
    setResult(objects)
  }, [presets])

  const onCreatePosePreset = event => {
    event.preventDefault()

    // show a prompt to get the desired preset name
    let win = remote.getCurrentWindow()
    prompt({
      title: 'Preset Name',
      label: 'Select a Preset Name',
      value: `Pose ${shortId(THREE.Math.generateUUID())}`
    }, win).then(name => {
      if (name != null && name != '' && name != ' ') {
        withState((dispatch, state) => {
          // get the latest skeleton data
          let sceneObject = getSceneObjects(state)[id]
          let skeleton = sceneObject.skeleton
          let model = sceneObject.model

          // create a preset out of it
          let newPreset = {
            id: THREE.Math.generateUUID(),
            name,
            keywords: name, // TODO keyword editing
            state: {
              skeleton: skeleton || {}
            },
            priority: 0
          }

          // add it to state
          createPosePreset(newPreset)

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
          updateObject(id, { posePresetId: newPreset.id })

          // get updated state (with newly created pose preset)
          withState((dispatch, state) => {
            // ... and save it to the presets file
            let denylist = Object.keys(defaultPosePresets)
            let filteredPoses = Object.values(state.presets.poses)
              .filter(pose => denylist.includes(pose.id) === false)
              .reduce(
                (coll, pose) => {
                  coll[pose.id] = pose
                  return coll
                },
                {}
              )
            presetsStorage.savePosePresets({ poses: filteredPoses })
          })
        })
      }
    }).catch(err =>
      console.error(err)
    )
  }

  const innerElementType = forwardRef(({ style, ...rest }, ref) => {
    style.width = 288
    let newStyle = {
      width:288,
      position:'relative',
      overflow:'hidden',
      ...style
    }
    return <div
        ref={ref}
        style={newStyle}
        {...rest}/>
  })

  return presets && <div className="thumbnail-search column">
      <div className="row" style={{ padding: "6px 0" } }> 
        <SearchList label="Search for a pose …" list={ sortedAttachament.current } onSearch={ saveFilteredPresets }/>
        <div className="column" style={{ marginLeft: 5 }}> 
          <a className="button_add" href="#"
            style={{ width: 30, height: 34 }}
            onPointerDown={ onCreatePosePreset }
          >+</a>
        </div>
      </div> 
      
      <div className="thumbnail-search__list">
       <FixedSizeGrid 
          columnCount={ NUM_COLS }
          columnWidth={ ITEM_WIDTH + GUTTER_SIZE }

          rowCount={ Math.ceil(presets.length / 4) }
          rowHeight={ ITEM_HEIGHT }
          width={ 288 }
          height={ 363 }
          innerElementType={ innerElementType }
          itemData={{
            presets:results,

            id: id,
            posePresetId: getPosePresetId(),

            attachment,
            updateObject,

            thumbnailRenderer
          }}
          children={ ListItem }/>
      </div>
    </div> 
}))

export default PosePresetsEditor
