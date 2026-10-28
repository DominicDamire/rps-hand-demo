import {drawFace,drawShoulders} from './face-overlay.mjs?v=20';
import * as T from 'three';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/GLTFLoader.js';
import {cameraUV,cameraPosition} from './projection.mjs';
import {faceReference,calibratedDepth,eyeCenter,eyeCenters} from './head-depth.mjs?v=20';
const outline=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
export class CombinedHead {
 constructor(scene,options){
  this.options=options;this.group=new T.Group();this.group.name='CombinedBlackHeadAndShoulders';this.group.visible=false;scene.add(this.group);this.bones={};this.rest=new Map();this.face=null;this.pose=null;this.seen=0;this.poseSeen=0;this.depthRef=null;this.neutral=new T.Quaternion();this.smoothed=new T.Quaternion();this.position=null;
  this.ready=new GLTFLoader().loadAsync(new URL('../head-shoulders/alien.glb',import.meta.url).href).then(g=>{
   this.asset=g.scene;this.group.add(g.scene);g.scene.traverse(o=>{if(o.isBone){const n=o.name.toLowerCase();if(n.includes('eye'))(this.bones.eyes??=[]).push(o);else if(n.includes('head'))this.bones.head=o;else if(n.includes('neck'))this.bones.neck=o;else if(n.includes('root'))this.bones.root=o;}if(o.isMesh){o.frustumCulled=false;for(const mat of Array.isArray(o.material)?o.material:[o.material]){mat.color?.set(0xcacaca);mat.map=null;mat.roughness=.65;mat.needsUpdate=true;}}});
   scene.updateMatrixWorld(true);for(const b of [this.bones.root,this.bones.neck,this.bones.head,...(this.bones.eyes||[])])if(b)this.rest.set(b,b.getWorldQuaternion(new T.Quaternion()));
   const eyes=this.bones.eyes;if(!this.bones.head||eyes?.length!==2)throw Error('Alien head/eye bones were not found');
   this.restEyeSpan=eyes[0].getWorldPosition(new T.Vector3()).distanceTo(eyes[1].getWorldPosition(new T.Vector3()));this.loaded=true;
  }).catch(e=>{this.error=e.message;});
 }
 receive(data){if(data.task==='face'){this.face=data.face;this.seen=performance.now();}if(data.task==='pose'){this.pose=data.pose;this.poseSeen=performance.now();}}
 reset(){this.face=this.pose=null;this.group.visible=false;this.position=null;}
 center(){if(this.face)this.neutral=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().fromArray(this.face.matrix));this.shoulderNeutral=null;}
 calibrate(metres,aspect,viewAspect){
  if(!this.face||performance.now()-this.seen>600||!this.loaded)return false;
  this.depthRef=faceReference(this.face);if(!this.depthRef)return false;this.metres=metres;this.position=null;this.anchor=null;
  const centers=eyeCenters(this.face.points);if(!centers)return false;const eyePoints=centers.map(p=>new T.Vector3().fromArray(cameraPosition(cameraUV(p,aspect,viewAspect),metres,viewAspect)));
  const m=this.face.matrix,foreshortening=Math.max(.4,Math.hypot(m[0],m[1]));this.fixedScale=eyePoints[0].distanceTo(eyePoints[1])/(this.restEyeSpan*foreshortening);this.fixedScale=Math.max(.01,Math.min(2,this.fixedScale));return true;
 }
 setWorld(b,q){if(!b)return;b.parent.updateWorldMatrix(true,false);b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));b.updateWorldMatrix(false,true);}
 update(dt,aspect,camera,metres,depthGain){
  const o=this.options(),fresh=this.face&&performance.now()-this.seen<900&&o.faceRate>0;this.group.visible=!!(o.showHead&&fresh&&this.loaded);if(!this.group.visible)return;
  if(!this.depthRef)this.calibrate(metres,aspect,camera.aspect);
  let depth=calibratedDepth(faceReference(this.face),this.depthRef,this.metres,depthGain);if(!depth)return;
  depth=Math.max(.08,depth-o.faceOffset/100);this.depth=depth;
  this.group.scale.setScalar(this.fixedScale*o.headSize);
  const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().fromArray(this.face.matrix));if(this.neutral)q.multiply(this.neutral.clone().invert());
  const e=new T.Euler().setFromQuaternion(q,'YXZ');e.x*=o.turnGain;e.y*=o.turnGain;e.z*=o.turnGain;q.setFromEuler(e);
  const alpha=o.headSmooth>0?1-Math.exp(-dt/(o.headSmooth/1000)):1;this.smoothed.slerp(q,alpha);
  let roll=0,yaw=0;
  if(!o.lockBody&&o.shoulderRate>0&&this.pose&&performance.now()-this.poseSeen<900){const p=this.pose.points,w=this.pose.world,a=p[12],b=p[11];if(a.visibility>.4&&b.visibility>.4){const s={roll:-Math.atan2(b.y-a.y,b.x-a.x),yaw:Math.atan2(w[11].z-w[12].z,w[11].x-w[12].x)};this.shoulderNeutral??=s;roll=s.roll-this.shoulderNeutral.roll;yaw=s.yaw-this.shoulderNeutral.yaw;}}
  const rootQ=new T.Quaternion().setFromEuler(new T.Euler(0,yaw,roll,'YXZ'));if(this.bones.root)this.setWorld(this.bones.root,rootQ.multiply(this.rest.get(this.bones.root)));
  const neckQ=new T.Quaternion().identity().slerp(this.smoothed,o.neckShare);this.setWorld(this.bones.neck,neckQ.multiply(this.rest.get(this.bones.neck)));this.setWorld(this.bones.head,this.smoothed.clone().multiply(this.rest.get(this.bones.head)));
  const eyes=this.face.eyes||{},gx=((eyes.eyeLookInLeft||0)-(eyes.eyeLookOutLeft||0)+(eyes.eyeLookOutRight||0)-(eyes.eyeLookInRight||0))*.2,gy=-((eyes.eyeLookUpLeft||0)+(eyes.eyeLookUpRight||0)-(eyes.eyeLookDownLeft||0)-(eyes.eyeLookDownRight||0))*.12;
  for(const b of this.bones.eyes)this.setWorld(b,this.smoothed.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(gy,gx,0))).multiply(this.rest.get(b)));
  const uv=cameraUV(eyeCenter(this.face.points),aspect,camera.aspect),target=camera.isOrthographicCamera?new T.Vector3((uv.x-.5)*camera.aspect,.5-uv.y,-depth):new T.Vector3().fromArray(cameraPosition(uv,depth,camera.aspect));
  this.anchor??=target.clone();target.sub(this.anchor).multiplyScalar(o.moveGain).add(this.anchor);this.position??=target.clone();this.position.lerp(target,alpha);
  this.group.updateMatrixWorld(true);const midpoint=this.bones.eyes.reduce((v,b)=>v.add(b.getWorldPosition(new T.Vector3())),new T.Vector3()).multiplyScalar(.5);this.group.position.add(this.position.clone().sub(midpoint));this.group.updateMatrixWorld(true);
 }
 overlay(ctx,w,h){const o=this.options();if(!o.overlayRate)return;
  const line=(points,color,closed=false)=>{ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo']((1-p.x)*w,p.y*h));if(closed)ctx.closePath();ctx.stroke();};
  if(this.face&&o.faceRate>0&&performance.now()-this.seen<900){const p=this.face.points;drawFace(ctx,p,w,h,this.face.matrix);}

  if(this.pose&&o.shoulderRate>0&&performance.now()-this.poseSeen<900)drawShoulders(ctx,this.pose,this.face,w,h);
 }
}
