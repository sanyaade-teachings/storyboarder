const THREE = require('three')
require( 'three-instanced-mesh' )(THREE);

class HelperBonesPool
{
    constructor(poolSize)
    {
        this.poolSize = poolSize;
        this.avaibleBones = [];
        this.usedBones = {};
        let material = new THREE.MeshBasicMaterial({
            color: 0x008888,    
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.5,
            flatShading: true})
        let bufferGeometry = new THREE.CylinderBufferGeometry( 0.2, 0.2, 0.8, 6 );
        this.instancedMesh = new THREE.InstancedMesh(bufferGeometry, material, poolSize, true, true, false)
        this.defaultPosition = new THREE.Vector3(5000, 5000, 5000);
        this.defaultColor = new THREE.Color();
        this.defaultColor.setHSL( 0.2 , 0.5 , 0.5 );
        for ( var i = 0 ; i < poolSize; i ++ )
        {
            this.addBone(i);
        }
    }
    
    //Private?
    addBone(id)
    {
        let rot = new THREE.Euler(0,0,0)
        let quat = new THREE.Quaternion().setFromEuler( rot )
        let scale = 0;
        this.avaibleBones.push({
            id: id,
            position: this.defaultPosition.clone(),
            rotation: rot,
            quaternion: quat,
            scale: new THREE.Vector3( scale, scale, scale )
        })
        this.updateInstancedBone(this.avaibleBones[ id ], this.defaultColor);
    }

    resetBone(bone)
    {
        bone.position.copy(thdefault);
        bone.rotation.set(0, 0, 0);
        bone.quaternion.set(0, 0, 0, 0);
        bone.scale.set(0, 0, 0);
        this.updateInstancedBone(bone, this.defaultColor);
    }

    updateInstancedBone(bone, color = null)
    {
        let id = bone.id;
        this.instancedMesh.setPositionAt( id , bone.position );
        this.instancedMesh.setQuaternionAt( id , bone.quaternion );
        this.instancedMesh.setScaleAt( id , bone.scale );
        if(color)
        {
            this.instancedMesh.setColorAt( id , color );
        }
    }

    takeBone()
    {
        if(this.avaibleBones.length === 0)
        {
            this.addBone(this.poolSizes);
            this.poolSize++;
        }
        let bone = this.avaibleBones.shift();
        this.usedBones[bone.id] = bone;
        return bone;
    }

    returnBone(bone)
    {
        if(!bone.id)
        {
            return;
        }
        let usedBone = this.usedBones[bone.id];
        if(!usedBone)
        {
            return;
        }
        this.avaibleBones.unshift(usedBone);
        this.usedBones[bone.id] = null;
        delete this.usedBones[bone.id];
        
    }

    takeBones(amountOfBones)
    {
        let bones = [];
        for(let i = 0; i < amountOfBones; i++)
        {
            bones.push(this.takeBone());
        }
        return bones;
    }

    returnBones(arrayOfBones)
    {
        for(let i = 0; i < arrayOfBones.length; i++)
        {
            this.returnBone(arrayOfBones[i]);
        }
    }
}
module.exports = HelperBonesPool;
