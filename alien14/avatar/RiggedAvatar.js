import * as T from 'three';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/GLTFLoader.js';   // rps-hand: the movement page's import map only maps "three"
// Copied from tagirz500/hands-lapse (hand-rig-workflow branch, mirror/avatar). One addition: update() takes a
// `facing` yaw (radians) so the body, head and relaxed arms turn with the game heading; the torso lean limit is relative to it.
const V=a=>new T.Vector3().fromArray(a);
const identity=new T.Quaternion();

// All joint translations stay in their bind pose. Tracking rotates bones only.
export class RiggedAvatar {
  constructor(scene,playerCamera,status){
    this.object=new T.Group();scene.add(this.object);this.bones={};this.bind={};this.meshes=[];
    this.playerCamera=playerCamera;this.bodyVisible=true;this.smoothed={};this.correctiveTargets={};
    this.ready=new GLTFLoader().loadAsync(new URL('./upper-body.glb?v=recline5',import.meta.url).href).then(gltf=>{
      this.object.add(gltf.scene);this.object.updateMatrixWorld(true);
      gltf.scene.traverse(o=>{
        if(o.isBone){this.bones[o.name]=o;this.bind[o.name]={q:o.getWorldQuaternion(new T.Quaternion()),p:o.getWorldPosition(new T.Vector3()),local:o.quaternion.clone()};}
        if(o.isSkinnedMesh){
          this.meshes.push(o);o.frustumCulled=false;
          const positions=o.geometry.attributes.position,mask=new Float32Array(positions.count);
          for(let i=0;i<mask.length;i++)mask[i]=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld).y>-.145?1:0;
          o.geometry.setAttribute('headMask',new T.BufferAttribute(mask,1));
          const uniforms={hideHead:{value:0},hideBody:{value:0}};
          o.material.onBeforeCompile=shader=>{
            Object.assign(shader.uniforms,uniforms);
            shader.vertexShader='attribute float headMask; varying float vHeadMask;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHeadMask=headMask;');
            shader.fragmentShader='uniform float hideHead; uniform float hideBody; varying float vHeadMask;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif ((hideHead>.5 && vHeadMask>.5)||(hideBody>.5 && vHeadMask<.5)) discard;');
          };
          o.material.customProgramCacheKey=()=> 'connected-avatar-v1';
          o.onBeforeRender=(renderer,world,camera)=>{uniforms.hideHead.value=camera===this.playerCamera?1:0;uniforms.hideBody.value=this.bodyVisible?0:1;o.material.uniformsNeedUpdate=true;};
        }
      });
      this.eyeLocal=this.bones.Head.worldToLocal(new T.Vector3());
      this.loaded=true;if(status)status.textContent='Connected upper-body rig · '+Object.keys(this.bones).length+' bones';
      return this;
    }).catch(e=>{if(status)status.textContent='Avatar could not load: '+e.message;throw e;});
  }
  rotate(name,delta){
    const bone=this.bones[name];
    const parent=bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(delta.clone().multiply(this.bind[name].q)));
    bone.updateMatrixWorld(true);
  }
  arm(side,joints,camera,bodyRotation){
    const key=side.toLowerCase(),elbow=joints?.[key+'Elbow'],wrist=joints?.[key+'Wrist'];
    if(!elbow||!wrist)return;
    const upper=side+'UpperArm',fore=side+'Forearm';
    const start=this.bones[upper].getWorldPosition(new T.Vector3());
    const a=this.bind[fore].p.clone().sub(this.bind[upper].p);
    const b=V([side==='Left'?-.145:.145,-.195,-.025]);
    const target=V(wrist).add(camera.position),guide=V(elbow).add(camera.position).sub(start);
    const direction=target.clone().sub(start),distance=T.MathUtils.clamp(direction.length(),Math.abs(a.length()-b.length())+.001,a.length()+b.length()-.001);
    if(direction.lengthSq()<1e-10)return;
    direction.normalize();guide.addScaledVector(direction,-guide.dot(direction));
    if(guide.lengthSq()<1e-8){guide.set(0,0,-1).applyQuaternion(bodyRotation);guide.addScaledVector(direction,-guide.dot(direction));}
    if(guide.lengthSq()<1e-8)guide.set(1,0,0).addScaledVector(direction,-direction.x);
    guide.normalize();
    const along=(a.lengthSq()-b.lengthSq()+distance*distance)/(2*distance);
    const bend=start.clone().addScaledVector(direction,along).addScaledVector(guide,Math.sqrt(Math.max(0,a.lengthSq()-along*along)));
    const end=start.clone().addScaledVector(direction,distance);
    const upperDirection=bend.clone().sub(start).normalize(),foreDirection=end.sub(bend).normalize();
    const upperDelta=new T.Quaternion().setFromUnitVectors(a.clone().normalize(),upperDirection);
    const foreDelta=new T.Quaternion().setFromUnitVectors(b.clone().normalize(),foreDirection);
    this.rotate(upper,upperDelta);this.rotate(fore,foreDelta);
    const restNormal=new T.Vector3().crossVectors(a,b).normalize();
    const bendNormal=new T.Vector3().crossVectors(upperDirection,foreDirection),bendStrength=bendNormal.length();bendNormal.normalize();
    for(const [name,axis,delta] of [[upper,upperDirection,upperDelta],[fore,foreDirection,foreDelta]]){
      if(!this.bones[name+'Twist'])continue;
      const reference=restNormal.clone().applyQuaternion(delta);
      const angle=Math.atan2(axis.dot(new T.Vector3().crossVectors(reference,bendNormal)),reference.dot(bendNormal));
      // Elbow-plane twist is inferred; no invisible palm orientation is claimed.
      const twist=T.MathUtils.clamp(angle,-.8,.8)*Math.min(1,bendStrength/.2);
      this.rotate(name+'Twist',new T.Quaternion().setFromAxisAngle(axis,twist).multiply(delta));
    }
    this.correctiveTargets[side+'ElbowFlex']=(1-upperDirection.dot(foreDirection))*.5;
    this.correctiveTargets[side+'ShoulderRaise']=T.MathUtils.clamp((upperDirection.y+.8)/1.8,0,1);
  }
  update(camera,head,joints,bodyVisible=true,dt=1,facing=0){
    if(!this.loaded)return;this.bodyVisible=bodyVisible;
    const F=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),facing);   // the game heading: joints are given as world-axis offsets already turned by it
    this.object.position.set(0,0,0);
    for(const [name,bone] of Object.entries(this.bones))bone.quaternion.copy(this.bind[name].local);
    this.object.updateMatrixWorld(true);
    const tracked=!!joints;
    const bodyRotation=F.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),(head?.pose?.physicalYaw??0)*.2));
    if(joints?.leftShoulder&&joints?.rightShoulder&&joints?.leftHip&&joints?.rightHip){
      const x=V(joints.rightShoulder).sub(V(joints.leftShoulder)).normalize();
      const y=V(joints.leftShoulder).add(V(joints.rightShoulder)).sub(V(joints.leftHip)).sub(V(joints.rightHip)).normalize();
      const z=new T.Vector3().crossVectors(x,y).normalize();x.crossVectors(y,z).normalize();
      if(z.lengthSq()>.5){const local=F.clone().invert().multiply(new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)));const angle=identity.angleTo(local);if(angle>.7)local.slerp(identity,1-.7/angle);bodyRotation.copy(F).multiply(local);}
    }
    this.rotate('Spine',identity.clone().slerp(bodyRotation,.4));this.rotate('Chest',bodyRotation);
    const headRotation=F.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(head?.pose?.physicalPitch??0,head?.pose?.physicalYaw??0,head?.pose?.physicalRoll??0,'YXZ')));
    this.rotate('Neck',bodyRotation.clone().slerp(headRotation,.5));this.rotate('Head',headRotation);
    // Move the entire skeleton so its eyes follow the player. Never stretch a neck.
    const eyes=this.bones.Head.localToWorld(this.eyeLocal.clone());
    this.object.position.copy(camera.position).sub(eyes);this.object.updateMatrixWorld(true);
    for(const side of ['Left','Right']){
      const shoulder=joints?.[side.toLowerCase()+'Shoulder'];
      if(shoulder){
        const name=side+'Clavicle',start=this.bones[name].getWorldPosition(new T.Vector3());
        const rest=this.bind[side+'UpperArm'].p.clone().sub(this.bind[name].p).normalize();
        const target=V(shoulder).add(camera.position).sub(start).normalize();
        const swing=new T.Quaternion().setFromUnitVectors(rest.clone().applyQuaternion(bodyRotation),target);
        const angle=identity.angleTo(swing);if(angle>.25)swing.slerp(identity,1-.25/angle);
        this.rotate(name,swing.multiply(bodyRotation));
      }
      const key=side.toLowerCase(),sign=side==='Left'?-1:1;
      const usable=joints?.[key+'Elbow']&&joints?.[key+'Wrist'];
      this.arm(side,usable?joints:{[key+'Elbow']:V([sign*.24,-.50,.075]).applyQuaternion(F).toArray(),[key+'Wrist']:V([sign*.25,-.71,-.02]).applyQuaternion(F).toArray()},camera,bodyRotation);   // relaxed arms hang in the facing frame
    }
    // Blend body acquisition/loss while keeping the head responsive and lengths fixed.
    for(const [name,bone] of Object.entries(this.bones)){
      const side=name.startsWith('Left')?'left':name.startsWith('Right')?'right':null;
      const missingArm=side&&name.includes('Arm')&&(!joints?.[side+'Elbow']||!joints?.[side+'Wrist']);
      const tau=['Head','Neck'].includes(name)?.012:tracked&&!missingArm?.055:.3;
      const previous=this.smoothed[name];
      if(previous)bone.quaternion.copy(previous.slerp(bone.quaternion,1-Math.exp(-dt/tau)));
      this.smoothed[name]=bone.quaternion.clone();
    }
    this.object.updateMatrixWorld(true);
    this.object.position.add(camera.position.clone().sub(this.bones.Head.localToWorld(this.eyeLocal.clone())));
    this.object.updateMatrixWorld(true);
    for(const mesh of this.meshes)for(const [name,index] of Object.entries(mesh.morphTargetDictionary??{})){
      const target=this.correctiveTargets[name]??0;
      mesh.morphTargetInfluences[index]+=(target-mesh.morphTargetInfluences[index])*(1-Math.exp(-dt/.08));
    }
  }
}
