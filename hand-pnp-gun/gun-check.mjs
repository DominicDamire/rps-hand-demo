import * as T from 'three';
import {DollRig} from '../doll/DollRig.js';
import {fitPhotoHand} from '../hand-pnp-photo/photo-hand.mjs?v=palm4';
import {directDriver} from '../hand-pnp-photo/direct.mjs?v=rotation3';
import {AlignedGun} from './gun.mjs?v=gun3';
import {GripRig} from '../gun-lab/grip-rig.mjs?v=4';
import {loadProvidedProfile} from '../gun-lab/presets.mjs?v=2';
import {applyHandScale,resetHandScale} from '../hand-pnp-photo/calibrated-hand-scale.mjs';
export async function checkGun(){
 const scene=new T.Scene(),rig=new DollRig(scene,{headLayer:false});await rig.ready;fitPhotoHand(rig,{preservePalmRelief:true});
 const profile=await loadProvidedProfile(),source=await new GripRig(new T.Scene(),profile).ready,tips={};
 for(const s of ['R','L'])for(const [i,f]of ['Thumb','Index','Middle','Ring','Pinky'].entries())tips[s+f]=rig.photoReference.targets[s][4+4*i].clone().sub(rig.photoReference.targets[s][3+4*i]);
 const lab=new AlignedGun(scene,rig,tips,directDriver(rig,tips),source,profile),checks={maxFixedGripError:0,maxLowerFingerError:0,maxBoneError:0,poses:0};
 for(const s of ['R','L']){
  let gunBind,lowerBind;
  for(const yaw of [0,.6,1.5,2.5,Math.PI])for(const index of [0,.5,1])for(const thumb of [0,1]){
   const q=new T.Quaternion().setFromEuler(new T.Euler(.2,yaw,.1)),w=new T.Vector3(.03,-.05,-.5),out=lab.pose(s,q,w,index,thumb),inv=q.clone().invert();
   const matrix=new T.Matrix4().makeRotationFromQuaternion(inv).multiply(new T.Matrix4().makeTranslation(...w.clone().negate().toArray())).multiply(lab.visual.matrixWorld);
   gunBind??=matrix.clone();checks.maxFixedGripError=Math.max(checks.maxFixedGripError,...matrix.elements.map((v,i)=>Math.abs(v-gunBind.elements[i])));
   const local=out.points.slice(9).map(p=>p.clone().sub(w).applyQuaternion(inv));lowerBind??=local;
   checks.maxLowerFingerError=Math.max(checks.maxLowerFingerError,...local.map((p,i)=>p.distanceTo(lowerBind[i])));
   for(let f=0;f<5;f++)for(let k=1;k<4;k++){const i=1+f*4+k,expected=rig.photoReference.targets[s][i].distanceTo(rig.photoReference.targets[s][i-1]);checks.maxBoneError=Math.max(checks.maxBoneError,Math.abs(out.points[i].distanceTo(out.points[i-1])-expected));}
   checks.poses++;
  }
  lab.controller.held=true;lab.owner=s==='R'?'Right':'Left';resetHandScale(rig,s);
  const q=new T.Quaternion(),out=lab.pose(s,q,new T.Vector3(0,0,-.5),.3,.6),before=lab.visual.matrix.clone();lab.scaleVisual(s,1.7);applyHandScale(rig,s,out,1.7);
  const expected=new T.Matrix4().makeScale(1.7,1.7,1.7).multiply(before);if(expected.elements.some((v,i)=>Math.abs(v-lab.visual.matrix.elements[i])>1e-10))throw Error('Calibration separated gun');
  resetHandScale(rig,s);lab.release();
 }
 const world=(curl)=>{const p=Array.from({length:21},()=>({x:0,y:0,z:0}));p[0]={x:0,y:-.1,z:0};for(let f=0;f<5;f++){const a=(f>1?curl:10)*Math.PI/180,j=1+f*4;p[j]={x:f*.02,y:0,z:0};p[j+1]={x:f*.02,y:.03,z:0};p[j+2]={x:f*.02,y:.03+.03*Math.cos(a),z:.03*Math.sin(a)};p[j+3]={x:f*.02,y:.03+.06*Math.cos(a),z:.06*Math.sin(a)};}return p;};
 for(const t of [0,50,100,150])lab.observe({landmarks:[],world:world(80),label:'Right'},t);
 if(!lab.controller.held)throw Error('No pickup');lab.observe(null,180);if(!lab.controller.held||lab.input)throw Error('Tracking loss did not hold/disarm');
 for(const t of [300,350,400,450,500,550])lab.observe({landmarks:[],world:world(0),label:'Right'},t);
 if(lab.controller.held)throw Error('No release');
 checks.pickupReleaseAndLoss=true;checks.passed=checks.maxFixedGripError<1e-9&&checks.maxLowerFingerError<1e-9&&checks.maxBoneError<1e-9;if(!checks.passed)throw Error(JSON.stringify(checks));return checks;
}
