import * as T from 'three';
import {DollRig} from '../doll/DollRig.js';
import {fitPhotoHand} from './photo-hand.mjs?v=palm4';
import {directDriver} from './direct.mjs?v=motion5';
import {fingerPlane} from './stability.mjs';
export async function checkMotion(originalDriver=null){
 const make=async()=>{const rig=new DollRig(new T.Scene(),{headLayer:false});await rig.ready;fitPhotoHand(rig,{preservePalmRelief:true});const tips={};for(const s of ['R','L'])for(const [f,name]of ['Thumb','Index','Middle','Ring','Pinky'].entries())tips[s+name]=rig.photoReference.targets[s][4+f*4].clone().sub(rig.photoReference.targets[s][3+f*4]);return {rig,tips};};
 const {rig,tips}=await make(),drive=directDriver(rig,tips),other=originalDriver?await make():null,oldDrive=other?originalDriver(other.rig,other.tips):null;
 const vertices=rig.parts.map(m=>Array.from(m.geometry.attributes.position.array)),checks={poses:0,maxHingeError:0,maxLengthError:0,maxImageInfluence:0,maxOriginalDifference:0};
 for(const s of ['R','L'])for(let frame=0;frame<36;frame++){
  const ref=rig.photoReference.targets[s],q=new T.Quaternion().setFromEuler(new T.Euler(.2,frame*.08,-.1)),w=new T.Vector3(.02,-.03,-.6);
  const points=ref.map((p,i)=>{const v=p.clone().sub(ref[0]);if(i&&i%4!==1)v.add(new T.Vector3(Math.sin(i+frame)*.02,Math.cos(i-frame)*.012,Math.sin(i*2+frame)*.025));return v.applyQuaternion(q).add(w);});
  const options={noiseDegrees:0,smoothingMs:0,lockUpper:true,thickness:1,tipInset:0,contactPixels:0,lm:points.map(()=>({x:.1,y:.2}))};
  const a=drive(points,s,q,1/60,options),b=drive(points,s,q,1/60,{...options,lm:points.map(()=>({x:.9,y:.8}))});
  if(oldDrive){const old=oldDrive(points,s,q,1/60,options);checks.maxOriginalDifference=Math.max(checks.maxOriginalDifference,...a.points.map((p,i)=>p.distanceTo(old.points[i])));}
  checks.maxImageInfluence=Math.max(checks.maxImageInfluence,...a.points.map((p,i)=>p.distanceTo(b.points[i])));
  for(let f=0;f<5;f++)for(let k=1;k<4;k++){const i=1+f*4+k;checks.maxLengthError=Math.max(checks.maxLengthError,Math.abs(a.points[i].distanceTo(a.points[i-1])-ref[i].distanceTo(ref[i-1])));}
  const across=rig.rest[s+'Index1'].world.clone().sub(rig.rest[s+'Pinky1'].world);
  for(const [f,name]of ['Thumb','Index','Middle','Ring','Pinky'].entries()){if(!f)continue;const i=1+f*4,base=a.points[i+1].clone().sub(a.points[i]).normalize(),rest=rig.rest[s+name+'2'].world.clone().sub(rig.rest[s+name+'1'].world).normalize(),hinge=fingerPlane(rest,across,q,base);for(const k of [2,3])checks.maxHingeError=Math.max(checks.maxHingeError,Math.abs(a.points[i+k].clone().sub(a.points[i+k-1]).normalize().dot(hinge)));}
  checks.poses++;
 }
 checks.geometryUnchanged=rig.parts.every((m,j)=>Array.from(m.geometry.attributes.position.array).every((v,i)=>v===vertices[j][i]));
 checks.passed=checks.geometryUnchanged&&checks.maxHingeError<1e-8&&checks.maxLengthError<1e-8&&checks.maxImageInfluence<1e-8&&checks.maxOriginalDifference<1e-8;return checks;
}
