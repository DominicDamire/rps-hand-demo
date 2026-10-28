import * as T from 'three';
import {DollRig} from '../doll/DollRig.js';
import {fitPhotoHand,surfaceSection} from './photo-hand.mjs?v=palm4';
import {solvePalmPose} from './palm-pnp.mjs?v=palm4';
import {loadCV} from './opencv-core.mjs';
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,(a.reduce((s,v,i)=>s+v*b[i],0)-1)/2)))*180/Math.PI;
export async function checkRotation(){
 const cv=await loadCV(),rig=new DollRig(new T.Scene(),{headLayer:false});await rig.ready;fitPhotoHand(rig,{preservePalmRelief:true});
 const ids=[0,5,9,13,17],checks={frames:0,maxAngle:0,maxTranslation:0,maxStep:0,failures:[],depthOffsets:{}};
 for(const side of ['R','L'])for(const aspect of [.7,4/3,1.8])for(const depth of [.3,.8]){
  const ref=rig.photoReference.targets[side],model=ids.map(i=>ref[i].clone().sub(ref[0]).toArray());checks.depthOffsets[side]=ids.map(i=>rig.photoReference.report[side].depthOffsets[i]);
  let previous=null;
  for(let degrees=0;degrees<=360;degrees+=5){
   const m=new T.Matrix4().makeRotationFromEuler(new T.Euler(.2,degrees*Math.PI/180,.15)),e=m.elements,R=[e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]],translation=new T.Vector3(.015,-.04,depth),focal=.8660254;
   const lm=Array.from({length:21},()=>({x:.5,y:.5,z:0}));
   model.forEach((p,j)=>{const v=new T.Vector3(...p).applyMatrix4(m).add(translation);lm[ids[j]]={x:.5+focal/aspect*v.x/v.z,y:.5+focal*v.y/v.z};});
   const fit=solvePalmPose(cv,model,lm,aspect,focal,previous);
   if(!fit){checks.failures.push([side,aspect,depth,degrees,'no fit']);continue;}
   const error=angle(R,fit.matrix),step=previous?angle(previous.matrix,fit.matrix):0;
   checks.maxAngle=Math.max(checks.maxAngle,error);checks.maxStep=Math.max(checks.maxStep,step);checks.maxTranslation=Math.max(checks.maxTranslation,new T.Vector3(...fit.translation).distanceTo(translation));
   if(error>.01)checks.failures.push([side,aspect,depth,degrees,error]);
   previous=fit;checks.frames++;
  }
 }
 checks.maxCentreErrorMm=0;checks.missingCentres=[];
 for(const s of ['R','L']){const r=rig.photoReference.report[s],x=new T.Vector3(...r.cameraRight),y=new T.Vector3(...r.cameraUp),z=new T.Vector3(...r.centrePlane);for(const [i,p]of rig.photoReference.targets[s].entries()){const prefix=i===0?s+'Hand__palm':s+['Thumb','Index','Middle','Ring','Pinky'][Math.floor((i-1)/4)];let best=null;for(const m of rig.parts.filter(m=>m.name.startsWith(prefix))){const a=m.geometry.attributes.position,vs=Array.from({length:a.count},(_,k)=>new T.Vector3().fromBufferAttribute(a,k).applyMatrix4(m.matrixWorld));const pair=surfaceSection(m,vs,p,x,y,z);if(pair&&(!best||pair[1]-pair[0]>best[1]-best[0]))best=pair;}if(best)checks.maxCentreErrorMm=Math.max(checks.maxCentreErrorMm,Math.abs((best[0]+best[1])/2-p.dot(z))*1000);else checks.missingCentres.push(s+i);}}
 checks.passed=!checks.failures.length&&!checks.missingCentres.length&&checks.maxCentreErrorMm<.00001;return checks;
}
