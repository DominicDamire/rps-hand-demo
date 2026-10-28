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
import {createRoom} from './room.mjs';
import {hasGripSupport,pinTrackedEyes,poseHead,poseHand,fitPalmDistance,fitFinger,fingerTip,fingers,Surface,GripState} from './connected-rig.mjs?v=demo11d';
const $=id=>document.getElementById(id),V=()=>new T.Vector3(),notice=s=>$('notice').textContent=s;
for(const input of document.querySelectorAll('input[type=range]'))input.oninput=()=>input.nextElementSibling.value=input.value;
window.addEventListener('error',e=>notice('Runtime error: '+e.message));
const scene=new T.Scene();scene.background=new T.Color('#182331');const room=createRoom(scene);scene.add(new T.HemisphereLight(0xffffff,0x526980,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(1,2,-2);scene.add(light);
const camera=new T.PerspectiveCamera(60,1,.005,20),renderer=new T.WebGLRenderer({canvas:$('scene'),antialias:true,preserveDrawingBuffer:true}),orbit=new OrbitControls(camera,renderer.domElement);camera.layers.enable(1);
const rig=new DollRig(scene);await rig.ready;rig.tips=buildTips(rig);for(const mesh of rig.parts){mesh.material=mesh.material.clone();mesh.material.color.set(0xcacaca);mesh.material.map=null;if(/Thigh|Shin|Foot|^Hips__/.test(mesh.name))mesh.visible=false;}
const palmSurfaces=Object.fromEntries(['L','R'].map(S=>[S,new Surface(rig.parts.filter(m=>m.name.startsWith(S+'Hand__')),rig.joints[S+'Hand'])]));
const restPositions=Object.fromEntries(Object.entries(rig.joints).map(([n,j])=>[n,j.position.clone()]));
const eye=rig.eye.clone();rig.placeEyes(new T.Vector3(0,.5,-1),0);
const head=attachDollHead(rig),headSurface=new Surface(head.meshes,rig.joints.Head);
const can=new T.Mesh(new T.CylinderGeometry(.035,.035,.12,20),new T.MeshStandardMaterial({color:0xd59450,roughness:.5}));can.position.set(.22,.3,-1.18);scene.add(can);const canSurface=new Surface([can],can),surfaces=[headSurface,canSurface,...room.children.filter(m=>m.isMesh).map(m=>new Surface([m],m))];
const table=new T.Mesh(new T.BoxGeometry(.65,.045,.35),new T.MeshStandardMaterial({color:0x49687d}));table.position.set(0,.02,-1.28);scene.add(table);surfaces.push(new Surface([table],table));
const jointGroup=new T.Group();scene.add(jointGroup);const joints=Object.entries(rig.joints).filter(([n])=>!/Thigh|Shin|Foot|Root|Hips/.test(n)),dotGeo=new T.SphereGeometry(.0035,6,4),dotMat=new T.MeshBasicMaterial({color:0x8ee3bf});const dots=joints.map(()=>{const m=new T.Mesh(dotGeo,dotMat);jointGroup.add(m);return m;});
let pose=null,face=null,hands=null,source=null,stream=null,stopTracker=null,closePhone=null,remote=false,aspect=4/3,faceSpan=null,captureFov=60,lastSolve=0,dirty=true,handSeen=0,poseSeen=0,faceSeen=0,lastRender=0,frames=0,fps=0,fpsStart=performance.now(),sizeKey='';
const filters={L:new LandmarkJitter(),R:new LandmarkJitter()},grips={L:new GripState(),R:new GripState()};let diagnostics={};
for(const el of document.querySelectorAll('input,select'))el.addEventListener('input',()=>dirty=true);
function resetView(){$('scene').style.transform=$('viewMode').value==='front'?'scaleX(-1)':'';orbit.enabled=true;camera.layers.enable(1);const mode=$('viewMode').value;camera.position.set(mode==='side'?.9:mode==='left'?-.9:mode==='rear'?.8:0,.48,mode==='front'?-2.65:mode==='rear'?-.4:-1.5);orbit.target.set(0,.32,-1.5);camera.lookAt(orbit.target);orbit.update();}resetView();$('viewMode').onchange=resetView;
const options=()=>({...defaults,fullBody:true,poseModel:$('poseModel').value,handRate:30,faceRate:30,shoulderRate:30,uncappedTracking:true,trackerDelegate:$('trackerDelegate').value,trackingWidth:+$('trackingWidth').value});
function accept(data,frame){if(frame){source=frame;aspect=(frame.width||frame.w)/(frame.height||frame.h);}const now=performance.now();if(data.task==='pose'){pose=data.pose;poseSeen=now;}else if(data.task==='face'){face=data.face;faceSeen=now;}else if(data.landmarks){hands=data;handSeen=now;}dirty=true;paint();}
function paint(){const c=$('preview');c.width=480;c.height=Math.round(480/aspect);const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);if(source&&!remote&&source.getContext){ctx.save();ctx.translate(c.width,0);ctx.scale(-1,1);ctx.drawImage(source,0,0,c.width,c.height);ctx.restore();}drawUpperBody(ctx,pose,c.width,c.height);if(face)drawFace(ctx,face.points,c.width,c.height,face.matrix);ctx.strokeStyle='#8ee3bf';ctx.fillStyle='#effff5';for(const lm of hands?.landmarks||[]){for(let f=0;f<5;f++){ctx.beginPath();ctx.moveTo((1-lm[0].x)*c.width,lm[0].y*c.height);for(let k=1;k<=4;k++){const p=lm[f*4+k];ctx.lineTo((1-p.x)*c.width,p.y*c.height);}ctx.stroke();}for(const p of lm){ctx.beginPath();ctx.arc((1-p.x)*c.width,p.y*c.height,2.5,0,7);ctx.fill();}}}
function stats(s){$('fps').textContent=`CAM ${s.camera}\nHAND ${s.hands} · FACE ${s.face} · BODY ${s.pose}\nRENDER ${fps}`;$('metrics').textContent=`Hands ${s.hands} FPS · ${s.delegate?.hands||'loading'}; face ${s.face}; body ${s.pose}. ${Object.values(s.errors||{}).join(' · ')}`;}
function stop(){stopTracker?.();closePhone?.();stopTracker=closePhone=null;stream?.getTracks().forEach(t=>t.stop());stream=null;pose=face=hands=null;faceSpan=null;captureFov=60;dirty=true;grips.L.clear();grips.R.clear();}
$('stop').onclick=()=>{stop();notice('Camera disconnected');};$('start').onclick=async()=>{stop();remote=false;try{stream=await navigator.mediaDevices.getUserMedia({video:{...($('cameraSelect').value?{deviceId:{exact:$('cameraSelect').value}}:{facingMode:'user'}),width:{ideal:640},frameRate:{ideal:30}},audio:false});$('video').srcObject=stream;await $('video').play();stopTracker=startTracking($('video'),accept,stats,options);notice('Local inference. Connected fixed-size skeleton.');const devices=await navigator.mediaDevices.enumerateDevices();$('cameraSelect').replaceChildren(new Option('Default camera',''),...devices.filter(d=>d.kind==='videoinput').map(d=>new Option(d.label||'Camera',d.deviceId)));}catch(e){notice(e.message);}};
$('phone').onclick=()=>{stop();remote=true;closePhone=receivePhone((d,s)=>accept(d,{width:s.w,height:s.h}),notice,notice,(d,s)=>accept(d,{width:s.w,height:s.h}),options,stats);};
$('calibrate').onclick=()=>{if(face&&faceSpan){const foreshortening=Math.max(.45,Math.hypot(face.matrix[0],face.matrix[1]));captureFov=T.MathUtils.clamp(2*Math.atan(.063*foreshortening/(2*+$('distance').value*faceSpan))*180/Math.PI,25,110);}faceSpan=null;grips.L.clear();grips.R.clear();notice('Shared camera calibration updated from entered distance. Model dimensions remain fixed.');};$('release').onclick=()=>{grips.L.clear();grips.R.clear();};$('placeCan').onclick=()=>{can.position.copy(rig.joints.RHand.getWorldPosition(V())).add(new T.Vector3(0,.07,-.025));dirty=true;};
function projection(p,depth){const h=2*depth*Math.tan(captureFov*Math.PI/360);return new T.Vector3((.5-p.x)*h*aspect,(.5-p.y)*h+.5,-2+depth);}
function solve(now){
 rig.reset();let depth=+$('distance').value,eyePosition=new T.Vector3(0,.5,-2+depth),rotation=new T.Quaternion();
 if(face&&now-faceSeen<700){const avg=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});const a=avg(face.points[33],face.points[133]),b=avg(face.points[263],face.points[362]);if(a&&b){const span=Math.hypot((a.x-b.x)*aspect,a.y-b.y);faceSpan??=span;const foreshortening=Math.max(.45,Math.hypot(face.matrix[0],face.matrix[1]));depth=Math.max(.2,Math.min(3,.063*foreshortening/(2*Math.tan(captureFov*Math.PI/360)*Math.max(.01,span))));eyePosition=projection({x:(a.x+b.x)/2,y:(a.y+b.y)/2},depth);}rotation.setFromRotationMatrix(new T.Matrix4().fromArray(face.matrix));}
 rig.placeEyes(eyePosition,0);const e=new T.Euler().setFromQuaternion(rotation,'YXZ');poseHead(rig,{pitch:e.x,yaw:-e.y,roll:-e.z});rig.root.updateMatrixWorld(true);
 const pw=pose&&now-poseSeen<700?pose.world:null,pi=pose?.points,origin=pw?.[2]&&pw?.[5]?{x:(pw[2].x+pw[5].x)/2,y:(pw[2].y+pw[5].y)/2,z:(pw[2].z+pw[5].z)/2}:pw?.[0];
 const bodyPoint=i=>pw?.[i]&&origin&&pi?.[i]&&(pi[i].visibility??1)>.45?projection(pi[i],Math.max(.15,depth+pw[i].z-origin.z)):null;
 if(pw?.[11]&&pw?.[12]){const l=bodyPoint(11),r=bodyPoint(12);if(l&&r){const across=r.clone().sub(l),rest=rig.rest.RUpperArm.world.clone().sub(rig.rest.LUpperArm.world);rig.aim('Chest',rest,across);rig.root.updateMatrixWorld(true);}}
 poseHead(rig,{pitch:e.x,yaw:-e.y,roll:-e.z});rig.root.updateMatrixWorld(true);pinTrackedEyes(rig,eyePosition);rig.root.updateMatrixWorld(true);const mappedFace=head.update();headSurface.refresh();
 const fresh=hands&&now-handSeen<300?hands:null;diagnostics={handLabels:fresh?.handedness,poseKeys:Object.keys(pw||{}),fixedOffsets:0,scaleError:0,wrists:{},untrackedHands:[],assists:[],contacts:[]};
 for(const S of ['L','R']){
  const si=S==='L'?11:12,wi=S==='L'?15:16,ei=S==='L'?13:14;let target=bodyPoint(wi),hint=bodyPoint(ei)||rig.joints[S+'Forearm'].getWorldPosition(V()),points=null,lm=null,trackedWorld=null;
  const hi=fresh?.landmarks?.findIndex((lm,i)=>{if(pi?.[15]&&pi?.[16]){const d=j=>Math.hypot(lm[0].x-pi[j].x,lm[0].y-pi[j].y);return (d(15)<d(16)?'L':'R')===S;}return (fresh.handedness[i][0]?.categoryName==='Right'?'R':'L')===S;})??-1;
  for(const mesh of rig.parts)if(new RegExp('^'+S+'(Hand|Thumb|Index|Middle|Ring|Pinky)').test(mesh.name))mesh.visible=true;
  if(hi>=0){const filtered=filters[S].update(fresh.landmarks[hi],fresh.worldLandmarks[hi],+$('jitter').value,aspect);lm=filtered.lm;const world=trackedWorld=filtered.world;
   // One world frame: pose wrist depth anchors the hand; finger offsets stay wrist-relative.
   const wristDepth=target?target.z+2:depth;target=projection(lm[0],wristDepth);points=world.map((p,i)=>projection(lm[i],Math.max(.1,wristDepth+p.z-world[0].z)));if($('straightDepth').checked)points=reduceFalseDepthBends(points,lm,480,480/aspect,false);
  }
  if(!target){if(!points)diagnostics.untrackedHands.push(S);grips[S].clear();continue;}
  rig.reach(S+'UpperArm',S+'Forearm',S+'Hand',target,hint);rig.root.updateMatrixWorld(true);if(points){poseHand(rig,S,points);
   // Fit distance to the observed palm size using fixed model offsets. This is
   // perspective translation only; never scale the palm or finger bones.
   const origin=rig.joints[S+'Hand'].getWorldPosition(V()),offsets=[['Index',5],['Middle',9],['Ring',13],['Pinky',17]].map(([name,i])=>[i,rig.joints[S+name+'1'].getWorldPosition(V()).sub(origin)]),fitted=fitPalmDistance(lm,offsets,aspect,captureFov);if(fitted!==null){const fp=face?.points,nearFace=fp&&now-faceSeen<700&&$('mappedContact').checked&&[4,8,12,16,20].some(i=>lm[i].x>Math.min(fp[234].x,fp[454].x)-.025&&lm[i].x<Math.max(fp[234].x,fp[454].x)+.025&&lm[i].y>fp[10].y-(fp[152].y-fp[10].y)*.5&&lm[i].y<fp[152].y+.08);const handDepth=nearFace?T.MathUtils.clamp(fitted,depth-.08,depth+.08):fitted;target=projection(lm[0],handDepth);points=trackedWorld.map((p,i)=>projection(lm[i],Math.max(.1,handDepth+p.z-trackedWorld[0].z)));if($('straightDepth').checked)points=reduceFalseDepthBends(points,lm,480,480/aspect,false);rig.reach(S+'UpperArm',S+'Forearm',S+'Hand',target,hint);rig.root.updateMatrixWorld(true);poseHand(rig,S,points);}
  }
  let wrist=rig.joints[S+'Hand'].getWorldPosition(V());
  if(points&&face&&now-faceSeen<700&&$('assist').checked&&$('mappedContact').checked&&Math.abs(target.z-(-2+depth))<.3){
   // Camera overlap only nominates a contact region. The correction itself uses
   // the actual world-space doll surface and connected arm IK.
   const fp=face.points,inside=p=>p.x>Math.min(fp[234].x,fp[454].x)-.08&&p.x<Math.max(fp[234].x,fp[454].x)+.08&&p.y>fp[10].y-(fp[152].y-fp[10].y)*.55&&p.y<(pi?.[11]&&pi?.[12]?(pi[11].y+pi[12].y)/2:fp[152].y+.15);
   if([0,4,8,12,16,20].some(i=>inside(lm[i]))){
    const palmPoint=rig.joints[S+'Middle1'].getWorldPosition(V()).lerp(wrist,.45),palmLm={x:[0,5,9,13,17].reduce((sum,i)=>sum+lm[i].x,0)/5,y:[0,5,9,13,17].reduce((sum,i)=>sum+lm[i].y,0)/5},scalp=palmLm.y<fp[10].y+.025;
    let from=null,to=null,support=null;
    if(palmLm.y>fp[152].y-.025&&pi?.[11]&&pi?.[12]){const shoulderY=(pi[11].y+pi[12].y)/2,t=T.MathUtils.clamp((palmLm.y-fp[152].y)/Math.max(.03,shoulderY-fp[152].y),0,1),chin=mappedFace[152],bottom=rig.joints.Neck.getWorldPosition(V()).lerp(rig.joints.Chest.getWorldPosition(V()),.5),query=chin.clone().lerp(bottom,t);query.x+=(fp[152].x-palmLm.x)*.3;query.z=head.eye().z-.07;const hit=headSurface.closest(query);if(hit){support=hit;from=palmPoint;to=hit.point.clone().addScaledVector(hit.normal,.012);}}
    else if(scalp){const forehead=mappedFace[10],eyes=head.eye(),dy=(fp[10].y-palmLm.y)/Math.max(.01,fp[152].y-fp[10].y),query=forehead.clone().add(new T.Vector3(0,dy*.18,-.025));const hit=headSurface.closest(query);if(hit){support=hit;from=palmPoint;to=hit.point.clone().addScaledVector(hit.normal,.012);}}
    else{const cameraDots=projectFaceDots(fp,face.matrix,aspect);let best=Infinity;
     for(let f=0;f<5;f++){const p=lm[f*4+4];for(let i=0;i<cameraDots.length;i++){const q=cameraDots[i],d=Math.hypot((p.x-q.x)*aspect,p.y-q.y);if(d<best){best=d;from=fingerTip(rig,S,fingers[f]);to=mappedFace[i].clone();}}}
     if(best>.045){from=to=null;}
    }
    if(from&&to){const delta=to.clone().sub(from);diagnostics.assists.push({side:S,delta:delta.length(),scalp,palmY:palmLm.y,chin:fp[152].y});if(delta.length()<+$('wristCorrection').value/100){target.add(delta);rig.reach(S+'UpperArm',S+'Forearm',S+'Hand',target,hint);rig.root.updateMatrixWorld(true);poseHand(rig,S,points);wrist=rig.joints[S+'Hand'].getWorldPosition(V());
     if(support){const point=palmSurfaces[S].closest(support.point),fit=point?{delta:support.point.clone().addScaledVector(support.normal,.0005).sub(point.point)}:null;if(fit&&fit.delta.length()<.04){target.add(fit.delta);rig.reach(S+'UpperArm',S+'Forearm',S+'Hand',target,hint);rig.root.updateMatrixWorld(true);poseHand(rig,S,points);wrist=rig.joints[S+'Hand'].getWorldPosition(V());diagnostics.assists[diagnostics.assists.length-1].palmCorrection=fit.delta.length();}}
    }}

   }
  }
  diagnostics.wrists[S]=wrist.distanceTo(target)*1000;
  if(!points){diagnostics.untrackedHands.push(S);grips[S].clear();continue;}
  const palm=rig.joints[S+'Middle1'].getWorldPosition(V()).lerp(wrist,.45),range=+$('contactRange').value/100;
  let nearest=null,surface=null;for(const candidate of surfaces){const hit=candidate.closest(palm);if(hit&&(!nearest||hit.distance<nearest.distance)){nearest=hit;surface=candidate;}}
  // A table edge can be near the fingers while the palm remains farther away.
  for(const candidate of surfaces)for(const f of ['Thumb','Index','Middle']){const hit=candidate.closest(fingerTip(rig,S,f));if(hit&&(!nearest||hit.distance<nearest.distance)){nearest=hit;surface=candidate;}}
  const curl=fingers.slice(1).reduce((sum,f,i)=>sum+points[(i+1)*4+4].distanceTo(points[0])/Math.max(.001,points[(i+1)*4+1].distanceTo(points[0])),0)/4;
  let supported=false;
  for(const candidate of surfaces){const contacts=fingers.map(f=>({...candidate.closest(fingerTip(rig,S,f)),finger:f})).filter(c=>c.normal);if(hasGripSupport(contacts,range)){const hit=candidate.closest(palm);if(hit&&(!supported||hit.distance<nearest.distance)){supported=true;surface=candidate;nearest=contacts.reduce((a,b)=>a.distance<b.distance?a:b);}}}
  const held=grips[S].update({object:nearest&&range>0&&nearest.distance<range?surface.object:null,point:wrist,contact:nearest,closing:curl<1.75&&(supported||grips[S].held),now,enabled:$('magnet').checked,dwell:+$('dwell').value,range,movable:surface?.object===can});
  if(held){const grip=grips[S],hand=rig.joints[S+'Hand'];if(grip.object===can){grip.relative??=hand.matrixWorld.clone().invert().multiply(can.matrixWorld);const matrix=hand.matrixWorld.clone().multiply(grip.relative);matrix.decompose(can.position,can.quaternion,new T.Vector3());can.updateMatrixWorld(true);}else{const locked=grip.anchorWorld();rig.reach(S+'UpperArm',S+'Forearm',S+'Hand',locked,hint);rig.root.updateMatrixWorld(true);}}
  if($('assist').checked&&range>0){for(const f of fingers){const tip=fingerTip(rig,S,f);let closest=null;for(const c of surfaces){const hit=c.closest(tip);if(hit&&(!closest||hit.distance<closest.distance))closest=hit;}
    if(closest&&closest.distance<range){const goal=closest.point.clone().addScaledVector(closest.normal,.0005),gap=fitFinger(rig,S,f,goal);diagnostics.contacts.push({side:S,finger:f,gapMm:gap*1000});}
  }}
 }
 rig.root.updateMatrixWorld(true);for(const [n,j] of Object.entries(rig.joints)){diagnostics.fixedOffsets=Math.max(diagnostics.fixedOffsets,j.position.distanceTo(restPositions[n]));diagnostics.scaleError=Math.max(diagnostics.scaleError,j.scale.distanceTo(new T.Vector3(1,1,1)));}
 $('bodyStatus').textContent=`Fixed dimensions · wrist target error ${Object.entries(diagnostics.wrists).map(([s,d])=>s+': '+d.toFixed(1)+' mm').join(' / ')}`;
 $('contactStatus').textContent=diagnostics.contacts.length?diagnostics.contacts.map(c=>c.side+' '+c.finger+': '+c.gapMm.toFixed(1)+' mm target error').join(' · '):'No nearby fingertip surface. Move hand closer.';
 if(diagnostics.untrackedHands.length)$('bodyStatus').textContent+=' · Neutral fallback hand: '+diagnostics.untrackedHands.join(', ');
 if(grips.L.held||grips.R.held)$('contactStatus').textContent+=' · Grip held (opposing digit contact)';
 document.getElementById('diagnostics')?.replaceChildren(document.createTextNode(JSON.stringify(diagnostics)));
}
function loop(now){requestAnimationFrame(loop);if(now-lastRender<15)return;lastRender=now;if(dirty&&now-lastSolve>30){solve(now);lastSolve=now;dirty=false;}if(now-handSeen>400){grips.L.clear();grips.R.clear();}
 const rect=$('scene').parentElement.getBoundingClientRect(),key=rect.width+':'+rect.height;if(key!==sizeKey){sizeKey=key;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}if(camera.fov!==+$('viewFov').value){camera.fov=+$('viewFov').value;camera.updateProjectionMatrix();}
 jointGroup.visible=$('bodyDots').checked;head.dots.visible=$('faceDots').checked;joints.forEach(([name,j],i)=>{dots[i].position.copy(j.getWorldPosition(V()));const side=/^[LR](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(name)?name[0]:null;dots[i].visible=!side||rig.parts.some(m=>m.visible&&m.name.startsWith(side+'Hand__'));});
 if($('viewMode').value==='eyes'){orbit.enabled=false;camera.layers.disable(1);camera.position.copy(head.eye());camera.quaternion.copy(head.viewQuaternion());}else{orbit.enabled=true;camera.layers.enable(1);orbit.update();}
 renderer.render(scene,camera);frames++;if(now-fpsStart>1000){fps=Math.round(frames*1000/(now-fpsStart));frames=0;fpsStart=now;}
}requestAnimationFrame(loop);window.addEventListener('pagehide',stop);
$('savePng').onclick=()=>{const a=document.createElement('a');a.href=renderer.domElement.toDataURL();a.download='connected-view.png';a.click();};notice('Connected prototype ready. Original doll head, neck, torso, arms and hands; fixed dimensions. Camera and body share a world frame.');
if(new URLSearchParams(location.search).has('fixture')){const button=document.createElement('button');button.textContent='Run connected photo test';$('start').parentElement.append(button);const report=document.createElement('pre');report.id='diagnostics';$('metrics').after(report);button.onclick=async()=>{stop();remote=false;const image=new Image();image.src='./references/'+(['cheek','scalp','neck','temple','forward','mug'].includes(new URLSearchParams(location.search).get('fixture'))?new URLSearchParams(location.search).get('fixture'):'scalp')+'.jpg';await image.decode();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.round(640*image.height/image.width);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);stream=canvas.captureStream(30);$('video').srcObject=stream;await $('video').play();stopTracker=startTracking($('video'),accept,stats,options);notice('Internet photo test. Static input is not a live FPS benchmark.');};}
