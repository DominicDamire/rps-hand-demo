import {sharedWrists} from './shared-wrists.mjs?v=demo12.2';
import {poseDirectArm} from './direct-arms.mjs?v=demo12';
import * as T from 'three';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/controls/OrbitControls.js';
import {buildTips} from './contact.mjs';
import {DollRig} from '../doll/DollRig.js';
import {startTracking,defaults} from './tracking-session.mjs?v=demo10';
import {receivePhone} from './phone-link.mjs?v=demo10';
import {drawFace,drawUpperBody,projectFaceDots} from './face-overlay.mjs?v=demo9';
import {attachDollHead} from './connected-head.mjs?v=demo11g';
import {reduceFalseDepthBends} from './depth-lines.mjs';
import {LandmarkJitter} from './landmark-jitter.mjs';
import {poseHand,GripState} from './connected-rig.mjs?v=demo11d';
const $=id=>document.getElementById(id),V=()=>new T.Vector3(),notice=s=>$('notice').textContent=s;
for(const input of document.querySelectorAll('input[type=range]'))input.oninput=()=>input.nextElementSibling.value=input.value;
window.addEventListener('error',e=>notice('Runtime error: '+e.message));
const scene=new T.Scene();scene.background=new T.Color('#182331');scene.add(new T.HemisphereLight(0xffffff,0x526980,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(1,2,-2);scene.add(light);
const camera=new T.PerspectiveCamera(60,1,.005,20),renderer=new T.WebGLRenderer({canvas:$('scene'),antialias:true,preserveDrawingBuffer:true}),orbit=new OrbitControls(camera,renderer.domElement);camera.layers.enable(1);
const rig=new DollRig(scene);await rig.ready;rig.tips=buildTips(rig);for(const mesh of rig.parts){mesh.material=mesh.material.clone();mesh.material.color.set(0xcacaca);mesh.material.map=null;if(/Thigh|Shin|Foot|^Hips__/.test(mesh.name))mesh.visible=false;}
const restPositions=Object.fromEntries(Object.entries(rig.joints).map(([n,j])=>[n,j.position.clone()]));
const eye=rig.eye.clone();rig.placeEyes(new T.Vector3(0,.5,-1),0);
const head=attachDollHead(rig);
const jointGroup=new T.Group();scene.add(jointGroup);const joints=Object.entries(rig.joints).filter(([n])=>!/Thigh|Shin|Foot|Root|Hips/.test(n)),dotGeo=new T.SphereGeometry(.0035,6,4),dotMat=new T.MeshBasicMaterial({color:0x8ee3bf});const dots=joints.map(()=>{const m=new T.Mesh(dotGeo,dotMat);jointGroup.add(m);return m;});
let pose=null,face=null,hands=null,source=null,stream=null,stopTracker=null,closePhone=null,remote=false,aspect=4/3,faceSpan=null,captureFov=60,lastSolve=0,dirty=true,handSeen=0,poseSeen=0,faceSeen=0,lastRender=0,frames=0,fps=0,fpsStart=performance.now(),sizeKey='';
const filters={L:new LandmarkJitter(),R:new LandmarkJitter()},grips={L:new GripState(),R:new GripState()};let diagnostics={};
for(const el of document.querySelectorAll('input,select'))el.addEventListener('input',()=>dirty=true);
function resetView(){$('scene').style.transform=$('viewMode').value==='front'?'scaleX(-1)':'';orbit.enabled=true;camera.layers.enable(1);const mode=$('viewMode').value;camera.position.set(mode==='side'?.9:mode==='left'?-.9:mode==='rear'?.8:0,.48,mode==='front'?-2.65:mode==='rear'?-.4:-1.5);orbit.target.set(0,.32,-1.5);camera.lookAt(orbit.target);orbit.update();}resetView();$('viewMode').onchange=resetView;
const options=()=>({...defaults,fullBody:true,poseModel:$('poseModel').value,handRate:30,faceRate:30,shoulderRate:30,uncappedTracking:true,trackerDelegate:$('trackerDelegate').value,trackingWidth:+$('trackingWidth').value});
function accept(data,frame){if(frame){source=frame;aspect=(frame.width||frame.w)/(frame.height||frame.h);}const now=performance.now();if(data.task==='pose'){pose=data.pose;poseSeen=now;}else if(data.task==='face'){face=data.face;faceSeen=now;}else if(data.landmarks){hands=data;handSeen=now;}dirty=true;paint();}
function paint(){const c=$('preview');c.width=480;c.height=Math.round(480/aspect);const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);if(source&&!remote&&source.getContext){ctx.save();ctx.translate(c.width,0);ctx.scale(-1,1);ctx.drawImage(source,0,0,c.width,c.height);ctx.restore();}drawUpperBody(ctx,sharedWrists(pose,performance.now()-handSeen<300?hands:null).pose,c.width,c.height);if(face)drawFace(ctx,face.points,c.width,c.height,face.matrix);ctx.strokeStyle='#8ee3bf';ctx.fillStyle='#effff5';for(const lm of hands?.landmarks||[]){for(let f=0;f<5;f++){ctx.beginPath();ctx.moveTo((1-lm[0].x)*c.width,lm[0].y*c.height);for(let k=1;k<=4;k++){const p=lm[f*4+k];ctx.lineTo((1-p.x)*c.width,p.y*c.height);}ctx.stroke();}for(const p of lm){ctx.beginPath();ctx.arc((1-p.x)*c.width,p.y*c.height,2.5,0,7);ctx.fill();}}}
function stats(s){$('fps').textContent=`CAM ${s.camera}\nHAND ${s.hands} · FACE ${s.face} · BODY ${s.pose}\nRENDER ${fps}`;$('metrics').textContent=`Hands ${s.hands} FPS · ${s.delegate?.hands||'loading'}; face ${s.face}; body ${s.pose}. ${Object.values(s.errors||{}).join(' · ')}`;}
function stop(){stopTracker?.();closePhone?.();stopTracker=closePhone=null;stream?.getTracks().forEach(t=>t.stop());stream=null;pose=face=hands=null;faceSpan=null;captureFov=60;smoothHead=null;shoulderAnchor=null;dirty=true;grips.L.clear();grips.R.clear();}
$('stop').onclick=()=>{stop();notice('Camera disconnected');};$('start').onclick=async()=>{stop();remote=false;try{stream=await navigator.mediaDevices.getUserMedia({video:{...($('cameraSelect').value?{deviceId:{exact:$('cameraSelect').value}}:{facingMode:'user'}),width:{ideal:640},frameRate:{ideal:30}},audio:false});$('video').srcObject=stream;await $('video').play();stopTracker=startTracking($('video'),accept,stats,options);notice('Local inference. Connected fixed-size skeleton.');const devices=await navigator.mediaDevices.enumerateDevices();$('cameraSelect').replaceChildren(new Option('Default camera',''),...devices.filter(d=>d.kind==='videoinput').map(d=>new Option(d.label||'Camera',d.deviceId)));}catch(e){notice(e.message);}};
$('phone').onclick=()=>{stop();remote=true;closePhone=receivePhone((d,s)=>accept(d,{width:s.w,height:s.h}),notice,notice,(d,s)=>accept(d,{width:s.w,height:s.h}),options,stats);};
$('calibrate').onclick=()=>{if(face&&faceSpan){const foreshortening=Math.max(.45,Math.hypot(face.matrix[0],face.matrix[1]));captureFov=T.MathUtils.clamp(2*Math.atan(.063*foreshortening/(2*+$('distance').value*faceSpan))*180/Math.PI,25,110);}faceSpan=null;shoulderAnchor=null;grips.L.clear();grips.R.clear();notice('Shared camera calibration updated from entered distance. Model dimensions remain fixed.');};$('release').onclick=()=>{grips.L.clear();grips.R.clear();};

let neutralHead=new T.Quaternion(),smoothHead=null,shoulderAnchor=null,bodyDepth=1;
$('centerHead').onclick=()=>{if(face)neutralHead.setFromRotationMatrix(new T.Matrix4().fromArray(face.matrix));smoothHead=null;dirty=true;};
function applyHead(rotation,now){
 const q=rotation.clone().multiply(neutralHead.clone().invert());
 const e=new T.Euler().setFromQuaternion(q,'YXZ'),gain=+$('turnGain').value;
 // Convert the face basis to the doll facing -Z; mirror is applied once by the view.
 const target=new T.Quaternion().setFromEuler(new T.Euler(-e.x*gain,e.y*gain,-e.z*gain,'YXZ'));
 const ms=+$('headSmooth').value,alpha=ms?1-Math.exp(-Math.max(1,now-lastSolve)/ms):1;
 smoothHead??=target.clone();smoothHead.slerp(target,alpha);
 rig.setWorldQuat('Neck',new T.Quaternion().slerp(smoothHead,+$('neckShare').value));
 rig.joints.Neck.updateWorldMatrix(false,true);rig.setWorldQuat('Head',smoothHead);rig.root.updateMatrixWorld(true);
}

function projection(p,depth){const h=2*depth*Math.tan(captureFov*Math.PI/360);return new T.Vector3((.5-p.x)*h*aspect,(.5-p.y)*h+.5,-2+depth);}
function solve(now){
 rig.reset();let depth=+$('distance').value,eyePosition=new T.Vector3(0,.5,-2+depth),rotation=new T.Quaternion();
 if(face&&now-faceSeen<700){const avg=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});const a=avg(face.points[33],face.points[133]),b=avg(face.points[263],face.points[362]);if(a&&b){const span=Math.hypot((a.x-b.x)*aspect,a.y-b.y);faceSpan??=span;const foreshortening=Math.max(.45,Math.hypot(face.matrix[0],face.matrix[1]));depth=Math.max(.2,Math.min(3,.063*foreshortening/(2*Math.tan(captureFov*Math.PI/360)*Math.max(.01,span))));eyePosition=projection({x:(a.x+b.x)/2,y:(a.y+b.y)/2},depth);}rotation.setFromRotationMatrix(new T.Matrix4().fromArray(face.matrix));}
 rig.placeEyes(new T.Vector3(0,.5,-2+ +$('distance').value),0);
 const fused=sharedWrists(pose,now-handSeen<300?hands:null);
 const pw=pose&&now-poseSeen<700?pose.world:null,pi=fused.pose?.points,origin=pw?.[2]&&pw?.[5]?{x:(pw[2].x+pw[5].x)/2,y:(pw[2].y+pw[5].y)/2,z:(pw[2].z+pw[5].z)/2}:pw?.[0];
 const visibleShoulders=pi?.[11]&&pi?.[12]&&(pi[11].visibility??1)>.45&&(pi[12].visibility??1)>.45&&now-poseSeen<700;
 if(visibleShoulders){
  const span=Math.hypot((pi[12].x-pi[11].x)*aspect,pi[12].y-pi[11].y);
  const width=rig.rest.RUpperArm.world.distanceTo(rig.rest.LUpperArm.world);
  const worldAcross=pw?.[12]&&pw?.[11]?new T.Vector3(pw[12].x-pw[11].x,pw[12].y-pw[11].y,pw[12].z-pw[11].z):null;
  const foreshorten=worldAcross?Math.max(.3,Math.hypot(worldAcross.x,worldAcross.y)/Math.max(.001,worldAcross.length())):1;
  bodyDepth=T.MathUtils.clamp(width*foreshorten/(2*Math.tan(captureFov*Math.PI/360)*Math.max(.01,span)),.2,3);
 }
 const shoulderZ=pw?.[11]&&pw?.[12]?(pw[11].z+pw[12].z)/2:0;
 const bodyPoint=i=>pw?.[i]&&pi?.[i]&&now-poseSeen<700&&(pi[i].visibility??1)>.45?projection(pi[i],Math.max(.15,bodyDepth+pw[i].z-shoulderZ)):null;
 if(visibleShoulders){const l=bodyPoint(11),r=bodyPoint(12);if(l&&r){
  const across=r.clone().sub(l),rest=rig.rest.RUpperArm.world.clone().sub(rig.rest.LUpperArm.world);
  const q=new T.Quaternion().setFromUnitVectors(rest.normalize(),across.normalize()),e=new T.Euler().setFromQuaternion(q,'YXZ'),g=+$('shoulderTurn').value;
  rig.setWorldQuat('Chest',new T.Quaternion().setFromEuler(new T.Euler(e.x*g,e.y*g,e.z*g,'YXZ')));rig.root.updateMatrixWorld(true);
  const target=l.clone().lerp(r,.5);shoulderAnchor??=target.clone();target.sub(shoulderAnchor).multiplyScalar(+$('shoulderMove').value).add(shoulderAnchor);
  const current=rig.joints.LUpperArm.getWorldPosition(V()).lerp(rig.joints.RUpperArm.getWorldPosition(V()),.5);
  rig.root.position.add(target.sub(current));rig.root.updateMatrixWorld(true);
 }}
 applyHead(rotation,now);head.update();
 const fresh=hands&&now-handSeen<300?hands:null;diagnostics={handLabels:fresh?.handedness,poseKeys:Object.keys(pw||{}),fixedOffsets:0,scaleError:0,wrists:{},untrackedHands:[],assists:[],contacts:[]};
 for(const S of ['L','R']){
  const si=S==='L'?11:12,ei=S==='L'?13:14,wi=S==='L'?15:16;
  const shoulder=bodyPoint(si),elbow=bodyPoint(ei),wrist=bodyPoint(wi);
  if(!shoulder||!elbow||!wrist){diagnostics.untrackedHands.push(S);continue;}
  const chestInverse=rig.joints.Chest.getWorldQuaternion(new T.Quaternion()).invert();
  const faceFront=head.eye().applyQuaternion(chestInverse).z-.03;
  poseDirectArm(rig,S,shoulder,elbow,wrist,faceFront);
  const hi=fused.map[S];
  if(hi>=0){
   const lm=fresh.landmarks[hi],world=fresh.worldLandmarks[hi];
   const points=world.map((p,i)=>projection(lm[i],Math.max(.1,wrist.z+2+p.z-world[0].z)));
   poseHand(rig,S,points);
  }else diagnostics.untrackedHands.push(S);
  diagnostics.wrists[S]=rig.joints[S+'Hand'].getWorldPosition(V()).distanceTo(wrist)*1000;
 }
 rig.root.updateMatrixWorld(true);for(const [n,j] of Object.entries(rig.joints)){diagnostics.fixedOffsets=Math.max(diagnostics.fixedOffsets,j.position.distanceTo(restPositions[n]));diagnostics.scaleError=Math.max(diagnostics.scaleError,j.scale.distanceTo(new T.Vector3(1,1,1)));}
 $('bodyStatus').textContent=`Fixed dimensions · wrist target error ${Object.entries(diagnostics.wrists).map(([s,d])=>s+': '+d.toFixed(1)+' mm').join(' / ')}`;
 $('contactStatus').textContent=diagnostics.contacts.length?diagnostics.contacts.map(c=>c.side+' '+c.finger+': '+c.gapMm.toFixed(1)+' mm target error').join(' · '):'Direct directions. Contact, grip and depth fitting disabled.';
 if(diagnostics.untrackedHands.length)$('bodyStatus').textContent+=' · Neutral fallback hand: '+diagnostics.untrackedHands.join(', ');
 if(grips.L.held||grips.R.held)$('contactStatus').textContent+=' · Grip held (opposing digit contact)';
 document.getElementById('diagnostics')?.replaceChildren(document.createTextNode(JSON.stringify(diagnostics)));
}
function loop(now){requestAnimationFrame(loop);if(now-lastRender<15)return;lastRender=now;if(dirty){solve(now);lastSolve=now;dirty=false;}if(now-handSeen>400){grips.L.clear();grips.R.clear();}
 const rect=$('scene').parentElement.getBoundingClientRect(),key=rect.width+':'+rect.height;if(key!==sizeKey){sizeKey=key;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}if(camera.fov!==+$('viewFov').value){camera.fov=+$('viewFov').value;camera.updateProjectionMatrix();}
 jointGroup.visible=$('bodyDots').checked;head.dots.visible=$('faceDots').checked;joints.forEach(([name,j],i)=>{dots[i].position.copy(j.getWorldPosition(V()));const side=/^[LR](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(name)?name[0]:null;dots[i].visible=!side||rig.parts.some(m=>m.visible&&m.name.startsWith(side+'Hand__'));});
 if($('viewMode').value==='eyes'){orbit.enabled=false;camera.layers.disable(1);camera.position.copy(head.eye());camera.quaternion.copy(head.viewQuaternion());}else{orbit.enabled=true;camera.layers.enable(1);orbit.update();}
 renderer.render(scene,camera);frames++;if(now-fpsStart>1000){fps=Math.round(frames*1000/(now-fpsStart));frames=0;fpsStart=now;}
}requestAnimationFrame(loop);window.addEventListener('pagehide',stop);
$('savePng').onclick=()=>{const a=document.createElement('a');a.href=renderer.domElement.toDataURL();a.download='connected-view.png';a.click();};notice('Demo 12.2: direct arm directions; forward-only limits; no contact assistance or smoothing. Fixed dimensions.');
if(new URLSearchParams(location.search).has('fixture')){const button=document.createElement('button');button.textContent='Run connected photo test';$('start').parentElement.append(button);const report=document.createElement('pre');report.id='diagnostics';$('metrics').after(report);button.onclick=async()=>{stop();remote=false;const image=new Image();image.src='./references/'+(['cheek','scalp','neck','temple','forward','mug'].includes(new URLSearchParams(location.search).get('fixture'))?new URLSearchParams(location.search).get('fixture'):'scalp')+'.jpg';await image.decode();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.round(640*image.height/image.width);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);stream=canvas.captureStream(30);$('video').srcObject=stream;await $('video').play();stopTracker=startTracking($('video'),accept,stats,options);notice('Internet photo test. Static input is not a live FPS benchmark.');};}
