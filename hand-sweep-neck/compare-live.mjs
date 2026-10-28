import * as THREE from 'three';
import {DollRig} from '../doll/DollRig.js';
import {fitPhotoHand} from '../hand-pnp-photo/photo-hand.mjs';
import {buildTips} from './contact.mjs';
import {directDriver as lineDriver} from './archive-102-driver.mjs';
import {directDriver as currentDriver} from '../hand-live-limits/hand-driver.mjs';
import {finalConfig} from '../hand-range/settings.mjs';
import {copyImageLines} from './line-copy.mjs';
import {cameraFrame,liftCameraLandmarks} from './projection.mjs';
import {imagePalmSize,sizeDepth} from './size-wall-depth.mjs';
import {palmObservation,PalmSweepDepth} from './palm-sweep-depth.mjs';
import {startTracking,defaults} from './tracking-session.mjs';
import {openCamera} from '../shared-phone/camera-capture.mjs';
import {receivePhone} from './video-link.mjs';

const $=id=>document.getElementById(id),video=$('video'),preview=$('preview'),previewContext=preview.getContext('2d'),canvas=$('scene');
const status=message=>$('status').textContent=message;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.autoClear=false;
const depthSolver=new PalmSweepDepth(),depthStates={};
const reference=await(await fetch(new URL('../hand-live-limits/hand-reference.json',import.meta.url))).json();
const kinds=['lines','current'],views=[];
let stream=null,session=null,closePhone=null,token=0,captureAspect=4/3,modelPalmSpan=0,sceneFps=0,sceneFrames=0,sceneClock=performance.now(),lastTracking=0,measured=null;
const lastResults={};
const setVisible=(view,side,visible)=>{for(const mesh of view.rig.parts)if(mesh.name.startsWith(side+'Hand')||/^[LR](Thumb|Index|Middle|Ring|Pinky)/.test(mesh.name)&&mesh.name[0]===side)mesh.visible=visible;};

function extendShellTips(rig,extra){
 rig.root.updateMatrixWorld(true);
 for(const side of ['L','R'])for(const [f,name]of ['Thumb','Index','Middle','Ring','Pinky'].entries()){
  const a=rig.photoReference.targets[side][3+4*f],b=rig.photoReference.targets[side][4+4*f],axis=b.clone().sub(a).normalize(),target=a.distanceTo(b)*(1+extra[f]);
  const meshes=rig.parts.filter(m=>m.name.startsWith(side+name+'3__'));let max=0;
  for(const m of meshes){const attr=m.geometry.attributes.position;for(let i=0;i<attr.count;i++)max=Math.max(max,new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(m.matrixWorld).sub(a).dot(axis));}
  if(!(max>0))continue;const ratio=target/max;
  for(const m of meshes){m.geometry=m.geometry.clone();const attr=m.geometry.attributes.position,inv=m.matrixWorld.clone().invert();for(let i=0;i<attr.count;i++){const v=new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(m.matrixWorld),d=v.clone().sub(a).dot(axis);if(d>0)v.addScaledVector(axis,d*(ratio-1));v.applyMatrix4(inv);attr.setXYZ(i,v.x,v.y,v.z);}attr.needsUpdate=true;m.geometry.computeVertexNormals();m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();}
 }
}
function frameBasis(wrist,index,middle,pinky){const y=middle.clone().sub(wrist).normalize(),x=index.clone().sub(pinky);x.addScaledVector(y,-x.dot(y)).normalize();return new THREE.Matrix4().makeBasis(x,y,new THREE.Vector3().crossVectors(x,y).normalize());}
function handBasis(rig,side){const r=rig.rest;return frameBasis(r[side+'Hand'].world,r[side+'Index1'].world,r[side+'Middle1'].world,r[side+'Pinky1'].world);}
function visibleHand(view,side){return view.rig.parts.some(mesh=>mesh.name.startsWith(side+'Hand')&&mesh.visible);}

for(const kind of kinds){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#192838');
 scene.add(new THREE.HemisphereLight(0xffffff,0x526980,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(1,2,1);scene.add(light);
 const camera=new THREE.PerspectiveCamera(60,1,.01,20);
 const rig=new DollRig(scene,{url:new URL('../doll.glb?v=hand-lab-1',import.meta.url).href,report:new URL('../doll-report.json?v=hand-lab-1',import.meta.url).href,headLayer:false});
 await rig.ready;
 fitPhotoHand(rig,{referencePoints:reference.points});extendShellTips(rig,reference.shellTipExtraFractions);
 for(const mesh of rig.parts){
  if(!/^[LR](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(mesh.name)){mesh.visible=false;continue;}
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){material.color.set('#65764a');material.roughness=.7;material.metalness=0;}
  mesh.visible=false;
 }
 const tips=buildTips(rig);
 for(const side of ['R','L'])for(const [f,name]of ['Thumb','Index','Middle','Ring','Pinky'].entries())tips[side+name].copy(rig.photoReference.targets[side][4+4*f]).sub(rig.photoReference.targets[side][3+4*f]);
 views.push({kind,scene,camera,rig,tips,drivers:{R:(kind==='lines'?lineDriver:currentDriver)(rig,tips),L:(kind==='lines'?lineDriver:currentDriver)(rig,tips)}});
}
const rest=views[0].rig.rest,spans=[];
for(const side of ['R','L'])for(const [a,b]of [['Hand','Index1'],['Hand','Middle1'],['Hand','Ring1'],['Hand','Pinky1'],['Index1','Pinky1']])spans.push(rest[side+a].world.distanceTo(rest[side+b].world));
spans.sort((a,b)=>a-b);modelPalmSpan=(spans[4]+spans[5])/2;

function resize(){const w=Math.max(2,Math.round(canvas.clientWidth)),h=Math.max(2,Math.round(canvas.clientHeight));renderer.setSize(w,h,false);for(const view of views){view.camera.aspect=w/2/h;view.camera.updateProjectionMatrix();}}
new ResizeObserver(resize).observe(canvas);resize();status('Ready. Connect a camera or your iPhone.');

function placePoints(world,lm,side,time){
 const aspect=views[0].camera.aspect,frame=cameraFrame(captureAspect,aspect),focal=1/(2*Math.tan(Math.PI/6)*frame.height),size=imagePalmSize(lm,captureAspect);
 const base=sizeDepth(size,{size:modelPalmSpan*focal,depth:1},depthStates[side]||.5);depthStates[side]=base;
 const length=rest[side+'Middle1'].world.distanceTo(rest[side+'Hand'].world),observed=Math.max(.01,Math.hypot(world[9].x-world[0].x,world[9].y-world[0].y,world[9].z-world[0].z));
 const points=liftCameraLandmarks(lm,world,captureAspect,aspect,Math.max(.04,base),length/observed).map(p=>new THREE.Vector3().fromArray(p));
 const q=new THREE.Quaternion().setFromRotationMatrix(frameBasis(points[0],points[5],points[9],points[17]).multiply(handBasis(views[0].rig,side).invert()));
 const measurement=points.map(p=>p.clone()),wrist=points[0];
 for(const [id,name]of [[5,'Index1'],[9,'Middle1'],[13,'Ring1'],[17,'Pinky1']])measurement[id].copy(rest[side+name].world).sub(rest[side+'Hand'].world).applyQuaternion(q).add(wrist);
 const observation=palmObservation(lm,measurement,captureAspect,focal),depth=depthSolver.update(side,observation,null,-wrist.z,time),delta=wrist.clone().multiplyScalar((depth+wrist.z)/-wrist.z);
 return {points:points.map(p=>p.add(delta)),q,focal};
}

function accept(data,frame){
 if(data.task!=='hands')return;
 captureAspect=frame.width/frame.height||captureAspect;
 preview.width=frame.width;preview.height=frame.height;
 previewContext.drawImage(frame,0,0,preview.width,preview.height);
 const seen=new Set(),time=Number.isFinite(data.time)?data.time:performance.now(),dt=lastTracking?Math.max(.001,Math.min(.1,(time-lastTracking)/1000)):1/30;lastTracking=time;
 for(let i=0;i<(data.landmarks?.length||0);i++){
  const lm=data.landmarks[i],world=data.worldLandmarks?.[i];if(lm?.length!==21||world?.length!==21)continue;
  const label=data.handedness?.[i]?.[0]?.categoryName,side=label==='Left'?'L':label==='Right'?'R':null;
  if(!side||seen.has(side))continue;seen.add(side);
  const {points,q,focal}=placePoints(world,lm,side,time),aspect=views[0].camera.aspect;
  for(const view of views){
   const options={noiseDegrees:0,smoothingMs:0,postCaps:false,postCoupling:0,lockUpper:false,baseSplay:false,thickness:1,tipInset:0,fitAngles:view.kind==='current',copyLines:view.kind==='lines',viewAspect:aspect,lineDepth:false,lineContact:false,lm,width:frame.width,height:frame.height};
   let input=points;
   if(view.kind==='lines')input=copyImageLines(lm,Math.max(.04,-points[0].z),captureAspect,aspect).map(p=>new THREE.Vector3().fromArray(p));
   else Object.assign(options,{postCaps:true,postCoupling:finalConfig.legacy94Coupling,experiment:{...finalConfig,legacy94Assist:true,imageFocal:focal}});
   try{lastResults[view.kind+side]=view.drivers[side](input,side,q.clone(),dt,options);setVisible(view,side,true);}catch(error){console.error(view.kind+' hand solve failed',error);status(view.kind+' solver: '+error.message);}
  }
  previewContext.strokeStyle='#9ee6c8';previewContext.lineWidth=1.5;
  for(let f=0;f<5;f++){const ids=[0,1+4*f,2+4*f,3+4*f,4+4*f];previewContext.beginPath();ids.forEach((id,j)=>{const p=lm[id],x=p.x*frame.width,y=p.y*frame.height;j?previewContext.lineTo(x,y):previewContext.moveTo(x,y);});previewContext.stroke();}
 }
 for(const view of views)for(const side of ['R','L'])if(!seen.has(side))setVisible(view,side,false);
 status(seen.size?`${seen.size} hand${seen.size===1?'':'s'} in both views · same tracked frame`:'No hand detected in the current frame.');
}

function paint(now){requestAnimationFrame(paint);sceneFrames++;if(now-sceneClock>=1000){sceneFps=Math.round(sceneFrames*1000/(now-sceneClock));sceneClock=now;sceneFrames=0;showStats();}
 const w=canvas.width,h=canvas.height,half=Math.floor(w/2);renderer.setScissorTest(true);
 for(let i=0;i<2;i++){renderer.setViewport(i*half,0,i? w-half:half,h);renderer.setScissor(i*half,0,i? w-half:half,h);renderer.clear(true,true,true);renderer.render(views[i].scene,views[i].camera);}
 renderer.setScissorTest(false);
}
requestAnimationFrame(paint);
function showStats(){const n=v=>Number.isFinite(v)?Math.round(v):'—',live=measured?.sourceState==='live';$('stats').textContent=live?`Camera ${n(measured.camera)} FPS · hand results ${n(measured.hands)}/s\nHand inference ${n(measured.ms?.hands)} ms · frame to result ${n(measured.age?.hands)} ms\nScene ${sceneFps} FPS · 1 tracker · 2 renders`:`${measured?.sourceState==='stalled'?'Video stalled':'Tracking off / waiting for video'}\nScene ${sceneFps} FPS`;}
function onStats(stats){measured=stats;showStats();if(stats.errors?.hands)status('Hand tracker: '+stats.errors.hands);}
function startSession(){session=startTracking(video,accept,onStats,()=>({...defaults,cameraFps:60,handRate:60,faceRate:0,shoulderRate:0,trackingWidth:480,uncappedTracking:true,freshFrames:true}));}
function stop(){token++;session?.();session=null;closePhone?.();closePhone=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;measured=null;depthSolver.reset();for(const side of ['R','L'])delete depthStates[side];lastTracking=0;for(const view of views)for(const side of ['R','L'])setVisible(view,side,false);status('Camera disconnected.');showStats();}
async function playStream(received,active){
 if(!active()){received.getTracks().forEach(t=>t.stop());return;}
 session?.();session=null;stream=received;video.srcObject=received;video.muted=true;
 for(let attempt=0;attempt<2;attempt++)try{await video.play();break;}catch(error){if(!active())return;if(error.name!=='AbortError'||attempt)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
 if(!active())return;startSession();status('Video connected. Tracking hands for both versions.');
}
async function listCameras(){try{const old=$('cameraSelect').value,devices=await navigator.mediaDevices.enumerateDevices();$('cameraSelect').replaceChildren(new Option('Default camera',''));for(const device of devices.filter(d=>d.kind==='videoinput'))$('cameraSelect').add(new Option(device.label||'Camera '+$('cameraSelect').length,device.deviceId));$('cameraSelect').value=old;}catch{}}
listCameras();
$('connect').onclick=async()=>{stop();const id=++token;try{status('Opening camera…');const device=$('cameraSelect').value;await playStream(await openCamera({...(device?{deviceId:{exact:device}}:{}),width:{ideal:640},height:{ideal:480},frameRate:{ideal:60,max:60}}),()=>id===token);await listCameras();}catch(error){stop();status('Camera could not start: '+error.message);}};
$('disconnect').onclick=stop;
$('phone').onclick=()=>{stop();const id=++token;try{closePhone=receivePhone(received=>playStream(received,()=>id===token).catch(error=>{if(id===token){stop();status('Received video could not start: '+error.message);}}),status,message=>{if(id===token){stop();status(message);}});}catch(error){status(error.message);}};
if(location.hostname==='127.0.0.1'||location.hostname==='localhost')window.__compareQA={accept:(data,frame)=>accept(data,frame),results:lastResults,views};
