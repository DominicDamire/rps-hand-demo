import {RenderClock} from './render-clock.mjs?v=90';
import {TrackingScheduler,freshHead} from './tracking-scheduler.mjs?v=90';
import {ThumbJoystick,measureThumb} from './thumb-joystick.mjs?v=90';
import {setupThumbstick} from './thumbstick.mjs?v=90';

import {HeadLook,bodyDisplacement} from './head-look.mjs?v=90';
import {DustMap} from './map.mjs?v=90';
import {HeadView} from '../head/HeadView.js';
import * as THREE from 'three';
import {setupUI} from './ui.mjs?v=90';
import {phoneCamera} from './camlink.mjs?v=90';   // ?cam: the phone streams its camera to this page over WebRTC and the tracker runs here
import {SwipeController,measurePointer,selectLeftHand} from './swipe.mjs?v=90';
import {makeHandModel,view as handView} from './hand-model.mjs?v=90';
import {createNet} from './net.mjs?v=90';
import {setupShooter} from './shooter.mjs?v=90';
import {setupBody} from './doll-body.mjs?v=90';   // the ball-joint doll; the old skinned avatar is body.mjs, kept for reference
import {startRemote,shimVideoSize} from './remote.mjs?v=90';   // ?cam = the phone runs the trackers and sends the landmarks here (works on any network); &video=1 keeps the old WebRTC camera stream   // The upper-body rig + body tracker (docs/avatar, docs/body from hands-lapse), joined to the tracked right hand   // Table + pistol + shooting range + mirror in the map, the right hand picks up and fires (docs/gun.mjs)   // lobbies / quick match: the same broker + WebRTC data channels as the main page   // the right hand as the rigged arm model, in front of the eye
const $=id=>document.getElementById(id);const CAM=new URLSearchParams(location.search).has('cam');   // ?cam: the phone streams its camera here
const trackingUI=setupUI();const stick=setupThumbstick($('thumbstick'),$('stickKnob'));
const trackingLog=[];
$('saveTracking').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:90,frames:trackingLog},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='thumb-tracking-v90.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const held=new ThumbJoystick();held.fistCentre=new URLSearchParams(location.search).get('fistcentre')==='1';let inputMode='poses',fingerMode='index',trackedHand=null,resting=false,singleRole='stick',singleChir=0;   // with ONE hand in view: 'stick' (the joystick takes it) or 'model' (the 3D hand / gun takes it), from the thumb's side of the palm
const scheduler=new TrackingScheduler();const swipe=new SwipeController();const headLook=new HeadLook();headLook.recenterPitch=new URLSearchParams(location.search).get('level')!=='0';   // the view eases level again when the face is lost, instead of staying stuck looking at the floor
let lookDemo=0;
const renderClock=new RenderClock();
const renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:false});renderer.setPixelRatio(Math.min(1,Math.sqrt(900000/(innerWidth*innerHeight))));
const scene=new THREE.Scene();scene.background=new THREE.Color('#25394a');scene.fog=new THREE.FogExp2('#25394a',.018);
const camera=new THREE.PerspectiveCamera(65,1,.05,200);camera.position.set(0,1.65,7);scene.add(camera);const handModel=makeHandModel(camera);window.handModel=handModel;const handModelL=makeHandModel(camera,false);window.handModelL=handModelL;   // The joystick hand is drawn too (the doll's left arm follows it)
const remote={group:new THREE.Group(),eye:new THREE.Group(),seen:-Infinity,target:{p:new THREE.Vector3(),pitch:0,yaw:0}};remote.group.visible=false;scene.add(remote.group);remote.group.add(remote.eye);
{const skin=new THREE.MeshStandardMaterial({color:0xd9a58a,roughness:.7}),body=new THREE.Mesh(new THREE.CapsuleGeometry(.18,1.05,4,10),new THREE.MeshStandardMaterial({color:0x7d8fa6,roughness:.8}));body.position.y=-.95;remote.group.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),skin);remote.eye.add(head);}
remote.hand=makeHandModel(remote.eye,false);
let net=null,lastSent=0;
function onRemote(pkt){if(!Array.isArray(pkt.p)||!Array.isArray(pkt.r))return;remote.target.p.fromArray(pkt.p);remote.target.pitch=pkt.r[0];remote.target.yaw=pkt.r[1];
 if(!remote.group.visible){remote.group.position.copy(remote.target.p);remote.group.rotation.y=remote.target.yaw;remote.eye.rotation.x=remote.target.pitch;remote.group.visible=true;}
 if(pkt.h)remote.hand.setPoints(pkt.h,pkt.o);else remote.hand.hide();remote.seen=performance.now();}
function renderRooms(list){const box=$('rooms');box.textContent=list.length?'':'open lobbies: none (create one or QUICK MATCH)';
 for(const r of list){const row=document.createElement('div');row.innerHTML=`<span>Lobby ${r.k} · host ${r.host}</span>`;const b=document.createElement('button');b.className='primary';b.textContent='JOIN';b.onclick=()=>net.joinRoom(r.k);row.appendChild(b);box.appendChild(row);}}
function ensureNet(){if(net)return net;net=createNet({status:t=>$('net').textContent=t,hands:onRemote,rooms:renderRooms,
 matched:role=>{$('online').textContent='Online: matched';$('lobby').hidden=true;if(role==='guest')dustMap.move(camera.position,1.2,0);},
 lost:()=>{$('online').textContent='Online';remote.group.visible=false;remote.hand.hide();}},'rpsh-dust-');net.start();window.mv={camera,remote,net};return net;}
$('online').onclick=()=>{ensureNet();if(net.opp)return;const l=$('lobby');l.hidden=!l.hidden;if(!l.hidden)net.listRooms();};
$('closeLobby').onclick=()=>$('lobby').hidden=true;$('refresh').onclick=()=>{$('rooms').textContent='searching…';ensureNet().listRooms();};
$('quick').onclick=()=>{$('rooms').textContent='looking for a player…';ensureNet().quickMatch();};$('create').onclick=()=>ensureNet().createRoom();
scene.background=new THREE.Color('#abc9d9');scene.fog=new THREE.Fog('#abc9d9',90,180);
{const q=new URLSearchParams(location.search),r=+q.get('reach'),d=q.get('drop');if(r>0)handView.reach=r;if(d!==null&&Number.isFinite(+d))handView.drop=+d;}window.handView=handView;   // ?reach=1 restores the old 1:1 arm
const dustMap=new DustMap(scene);const shooter=setupShooter({scene,camera,dustMap,handModel});window.shooter=shooter;window.dustMap=dustMap;const bodyRig=setupBody({scene,camera,handModel,handModelL,video:$('cam'),getRemote:()=>phoneLink});window.bodyRig=bodyRig;window.headLook=headLook;window.movementBuild=90;
dustMap.load().then(()=>{camera.position.copy(dustMap.spawn);$('mapStatus').textContent='Auto-step on';}).catch(e=>{$('mapStatus').textContent='Map failed to load';$('error').textContent=e.message;});
function resize(){renderer.setPixelRatio(Math.min(1,Math.sqrt(900000/(innerWidth*innerHeight))));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();handView.aspect=camera.aspect;}addEventListener('resize',resize);resize();
let head=null,lastHeadVideo=-1,lastFrameTime=0,lastHUD=-Infinity,phoneLink=null;const hf={n:0,t:performance.now()},dbg=window.dbg=window.dbg||{};let headSeen=false;
// Jump on a right-hand tap: a tap = the thumb tip meets
// the index tip while the other three fingers stay up (a fist, and the gun grip, also bring those tips together,
// so without that condition every fist would be a jump). Rising edge only: hold the pinch and you jump once.
const jump={h:0,v:0,applied:0,pinched:false,taps:0};
function pinchTap(hm,now){if(!hm.visible)return;const p=hm.points,palm=p[0].distanceTo(p[9])||1;const close=p[4].distanceTo(p[8])<.3*palm,up=[12,16,20].every(t=>p[t].distanceTo(p[0])>p[t-2].distanceTo(p[0]));const pinch=close&&up;if(pinch&&!jump.pinched&&jump.h===0){jump.v=3.6;jump.h=1e-4;jump.taps++;}jump.pinched=pinch;}window.jump=jump;const walkF={x:0,z:0};const LABELS=new URLSearchParams(location.search).get('labels')==='1';
let walkReason='START CAMERA';
let worker=null,stream=null,running=false,busy=false,lastVideo=-1,lastResult=0,demo=false,demoRun=null;
function status(text,active=false){$('status').textContent=text;$('lamp').classList.toggle('on',active);}
function apply(sample,time){const r=swipe.update(sample,time);const step=bodyDisplacement(r.dx,r.dz,headLook.heading);dustMap.move(camera.position,step.x,step.z);$('gestureStats').textContent=r.active?'MOVE engaged · relax index to release':'Hands free · movement off';status(r.status,r.active);return r;}
function stop(){stick.reset();held.reset();trackedHand=null;lookDemo=0;headLook.resetLook();head?.worker?.terminate();if(head)clearTimeout(head.timer);head=null;$('headStatus').textContent='Head: camera off';running=false;busy=false;worker?.terminate();worker=null;if(!CAM){stream?.getTracks().forEach(t=>t.stop());stream=null;}$('cam').srcObject=null;swipe.reset();handModel.hide();handModelL?.hide();trackingUI.camera(false);$('start').textContent='Start camera';}
async function start(){
 if(running){stop();status('Paused · camera off');return;}
 stop();demo=false;demoRun=null;$('demoControls').classList.remove('visible');$('error').textContent='';$('start').disabled=true;status('Starting camera…');
 try{
  const params=new URLSearchParams(location.search),useCam=params.has('cam'),useVideo=params.has('video');
  if(!useCam&&!navigator.mediaDevices?.getUserMedia)throw Error('Camera access needs HTTPS or localhost.');
  const takeCam=s=>{stream=s;$('cam').srcObject=s;$('cam').play().catch(()=>{});};
  if(useCam&&!useVideo){   // the phone tracks and sends numbers: no peer-to-peer connection, so it works on any network
   phoneLink=await startRemote({onStatus:t=>status(t)});shimVideoSize($('cam'),phoneLink.size);
   trackingUI.camera(true);$('previewImage').style.aspectRatio=phoneLink.size.w+'/'+phoneLink.size.h;status('Loading motion tracking…');
  }else{
   stream=useCam?(stream?.active?stream:await phoneCamera(t=>status(t),takeCam)):await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:60}}});
   $('cam').srcObject=stream;await $('cam').play();trackingUI.camera(true);$('previewImage').style.aspectRatio=$('cam').videoWidth+'/'+$('cam').videoHeight;status('Loading motion tracking…');
  }
  worker=phoneLink?phoneLink.handWorker:new Worker(new URL('./tracker.mjs?v=90',import.meta.url),{type:'module'});   // the shim answers 'ready' as soon as the phone speaks
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Tracker loading timed out. Check your connection and retry.')),45000);worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);resolve();}else if(data.type==='error'){clearTimeout(timer);reject(Error(data.message));}};worker.postMessage({type:'init'});});
  worker.onerror=e=>{stop();status('Tracking stopped');$('error').textContent=e.message;};
  worker.onmessage=({data})=>{busy=false;{const t=performance.now();hf.n++;if(t-hf.t>=1000){dbg.handFps=Math.round(hf.n*1000/(t-hf.t));hf.n=0;hf.t=t;}}   // Hand tracker rate, shown in the HUD
   if(data.type==='error'){stop();status('Tracking stopped');$('error').textContent=data.message;return;}if(data.type!=='result')return;
    lastResult=performance.now();if(lastResult-data.time>450){held.receive(null,lastResult);apply(null,lastResult);handModel.hide();handModelL.hide();trackingUI.draw([],$('cam').videoWidth,$('cam').videoHeight,false,{tip:fingerMode==='index'?8:4,centre:held.centre,viewScale:held.scale,scale:held.effectiveScale,reason:held.reason});walkReason='TRACKING TOO OLD · '+Math.round(lastResult-data.time)+' ms';status(walkReason);return;}
    const n=data.landmarks?.length||0;
    let handIndex=inputMode==='index'?selectLeftHand(data):n===1?0:n===2?(data.landmarks[0][0].x>data.landmarks[1][0].x?0:1):-1;   // two hands: the physical left (image right, unmirrored) is the joystick, the other one the model
    let modelIndex=n===2&&handIndex>=0?1-handIndex:-1;
    if(n===1){const w=data.worldLandmarks[0],ax=w[5].x-w[0].x,ay=w[5].y-w[0].y,az=w[5].z-w[0].z,bx=w[17].x-w[0].x,by=w[17].y-w[0].y,bz=w[17].z-w[0].z,tx=w[4].x-w[0].x,ty=w[4].y-w[0].y,tz=w[4].z-w[0].z;
      singleChir+=.25*(Math.sign(tx*(ay*bz-az*by)+ty*(az*bx-ax*bz)+tz*(ax*by-ay*bx))-singleChir);   // One hand alone: the thumb's side of the palm says which hand it is (+ = physical right; the same test as hand-model.mjs - the tracker's label said "Right" for the author's right fist)
      if(singleChir>.3)singleRole='model';else if(singleChir<-.3)singleRole='stick';if(inputMode==='touch')singleRole='model';   // the physical RIGHT hand is the 3D hand that takes the gun, the physical left stays the joystick; the screen thumbstick never needs a tracked hand
      if(singleRole==='model'){modelIndex=0;handIndex=-1;}}
    window.dbg=Object.assign(window.dbg||{},{hands:n,label:data.handedness?.map(h=>h[0]?(h[0].categoryName+':'+h[0].score.toFixed(2)):'?'),handIndex,modelIndex,wl:window.dbgWL&&n?data.worldLandmarks[0].map(p=>[p.x,p.y,p.z]):undefined});
    if(resting){held.receive(null,lastResult);swipe.reset();handModel.hide();handModelL.hide();walkReason='RESTING';return;}
    const label=handIndex>=0?data.handedness?.[handIndex]?.[0]?.categoryName:null;
    trackedHand=label;
    {const lab=(data.landmarks||[]).map((_,i)=>i===handIndex?'JOYSTICK':i===modelIndex?'3D HAND':'');trackingUI.hands(data.landmarks,lab);}
    if(modelIndex>=0)handModel.update(data.landmarks[modelIndex],data.worldLandmarks[modelIndex],$('cam').videoWidth,$('cam').videoHeight);else handModel.hide();
    if(handIndex>=0)handModelL.update(data.landmarks[handIndex],data.worldLandmarks[handIndex],$('cam').videoWidth,$('cam').videoHeight);else handModelL.hide();   // the steering hand keeps steering AND is shown
    pinchTap(handModel,performance.now());
    if(inputMode==='index'){
      const sample=handIndex>=0?measurePointer(data.landmarks[handIndex],data.worldLandmarks[handIndex],$('cam').videoWidth/$('cam').videoHeight):null;
      const result=apply(sample,data.time);trackingUI.draw(handIndex>=0?[data.landmarks[handIndex]]:[],$('cam').videoWidth,$('cam').videoHeight,result.active);
    }else if(inputMode==='poses'){
      const sample=handIndex>=0?measureThumb(data.landmarks[handIndex],data.worldLandmarks[handIndex],$('cam').videoWidth/$('cam').videoHeight,fingerMode):null;
      held.receive(sample,lastResult);
      trackingLog.push({time:lastResult,captureTime:data.time,point:sample?.point??null,rest:sample?.rest??false,centre:held.centre,raw:held.raw,x:held.x,z:held.z,reason:held.reason});while(trackingLog.length>450||trackingLog.length&&lastResult-trackingLog[0].time>15000)trackingLog.shift();
      const active=!!held.direction;walkReason=handIndex<0?'SHOW YOUR LEFT HAND':held.reason;
      $('gestureStats').textContent=`${fingerMode.toUpperCase()} X ${held.x.toFixed(2)} · Y ${(-held.z).toFixed(2)} · raw X ${held.raw.x.toFixed(2)} Y ${(-held.raw.z).toFixed(2)} · hand ${dbg.handFps||0} fps · tracker ${Math.round(data.inferenceMs||0)} ms · hands ${n}${n===1?' (show both: left steers, right is the model)':''}`;
      trackingUI.draw(handIndex>=0?[data.landmarks[handIndex]]:[],$('cam').videoWidth,$('cam').videoHeight,active,{tip:fingerMode==='index'?8:4,centre:held.centre,viewScale:held.scale,scale:held.effectiveScale,active,x:held.x,z:held.z,reason:held.reason},{joy:handIndex>=0?data.landmarks[handIndex]:null,model:modelIndex>=0?data.landmarks[modelIndex]:null,head:headSeen,labels:LABELS});
      status(active?fingerMode.toUpperCase()+' · '+held.direction:walkReason,active);
    }
  };
  head=new HeadView({mode:$('headEnabled').checked?'first':'off',interval:66,widths:[288,384,512],workerUrl:new URL('./head-tracker.mjs?v=90',import.meta.url),worker:phoneLink?phoneLink.headWorker:null});window.head=head;head.pose.sensitivity=1.5;headLook.gain=+$('headGain').value;lastHeadVideo=-1;lastVideo=-1;running=true;lastResult=performance.now();$('start').textContent='Stop camera';status('Left hand: joystick · right hand: model');
 }catch(e){stop();status('Camera not started');$('error').textContent=e.name==='NotAllowedError'?'Camera access was declined. Allow camera access in your browser, then retry.':e.message;}
 finally{$('start').disabled=false;}
}
$('start').onclick=start;
$('rest').onclick=()=>{resting=!resting;held.receive(null,performance.now());stick.reset();swipe.reset();demoRun=null;lookDemo=0;headLook.resetLook();head?.recenter();$('rest').textContent=resting?'Resume':'Rest';$('rest').setAttribute('aria-pressed',String(resting));walkReason=resting?'RESTING':'THUMB READY';status(walkReason);};
$('centerHead').onclick=()=>{head?.recenter();headLook.resetLook();swipe.reset();bodyRig?.recenter();};
$('headEnabled').onchange=()=>{if(head)head.mode=$('headEnabled').checked?'first':'off';headLook.resetLook();head?.recenter();camera.rotation.y=headLook.heading;};
$('turnMode').onchange=()=>{headLook.mode=$('turnMode').value;headLook.resetLook();head?.recenter();};
$('headThreshold').oninput=()=>{headLook.deadzoneDegrees=+$('headThreshold').value;$('thresholdValue').textContent=$('headThreshold').value+'°';};
$('lookGain').oninput=()=>{headLook.lookGain=+$('lookGain').value;$('lookGainValue').textContent=headLook.lookGain+'×';};
headLook.lookGain=+$('lookGain').value;headLook.smooth=.12;   // the page's calmer head look, applied at startup (the class keeps its own defaults for its tests)
$('headGain').oninput=()=>{if(head)head.pose.sensitivity=1.5;headLook.gain=+$('headGain').value;};
$('reset').onclick=()=>{stick.reset();held.reset();headLook.heading=0;headLook.resetLook();lookDemo=0;head?.recenter();camera.position.copy(dustMap.spawn);camera.rotation.set(0,0,0);swipe.reset();demoRun=null;status('View reset · ready');};
function controlsChanged(){held.reset();swipe.reset();demoRun=null;trackingUI.clear();$('hint').textContent='Choose Index or Thumb in the joystick panel. Move that finger around the circle to walk. The circle follows your fist as you reposition. Open palm stops and clears the circle; close your hand to place a fresh one. Centre or folded finger stops. Head controls turn your view.';status('Start camera · finger joystick ready');}
$('movementMode').onchange=()=>{inputMode=$('movementMode').value;stick.reset();held.reset();trackedHand=null;swipe.reset();demo=false;demoRun=null;$('demoControls').classList.remove('visible');$('stickZone').hidden=inputMode!=='touch';$('hint').textContent=inputMode==='touch'?'Drag thumbstick to walk; release to stop.':inputMode==='poses'?'Thumb up/down in the preview: forward/back. Left/right: sideways. Centre or tucked fist stops.':'Left index out: move your hand to walk. Bend index to release.';};
document.querySelectorAll('[data-finger]').forEach(button=>button.onclick=()=>{
 fingerMode=button.dataset.finger;inputMode='poses';$('movementMode').value='poses';stick.reset();swipe.reset();held.reset();demo=false;demoRun=null;$('stickZone').hidden=true;$('demoControls').classList.remove('visible');
 document.querySelectorAll('[data-finger]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 $('fingerHelp').textContent=fingerMode==='index'?'Index tip steers · fist follows · open palm resets':'Thumb tip steers · fist follows · open palm resets';trackingUI.clear();status('Show '+fingerMode+' to place circle');
});
$('centerThumb').onclick=()=>{held.reset();status('Show '+fingerMode+' to place circle');};
$('joystickSize').oninput=()=>{held.setSize(+$('joystickSize').value);$('joystickSizeValue').textContent=Math.round(held.size*100)+'%';};
$('gain').oninput=()=>held.speed=+$('gain').value;
const VIEW=['viewFov','phoneFov','handDist','handHeight','handTilt'];
try{const saved=JSON.parse(localStorage.getItem('move.view2')||'{}');for(const id of VIEW)if(saved[id]!=null)$(id).value=saved[id];}catch{}
function applyView(){camera.fov=+$('viewFov').value;camera.updateProjectionMatrix();handView.camFov=camera.fov;handView.aspect=camera.aspect;handView.phoneFov=+$('phoneFov').value;handView.dist=+$('handDist').value;handView.height=+$('handHeight').value;handView.tilt=+$('handTilt').value;
 $('viewFovValue').textContent=camera.fov+'°';$('phoneFovValue').textContent=handView.phoneFov+'°';$('handDistValue').textContent=handView.dist.toFixed(2)+' m';$('handHeightValue').textContent=handView.height.toFixed(2)+' m';$('handTiltValue').textContent=handView.tilt+'°';
 try{localStorage.setItem('move.view2',JSON.stringify(Object.fromEntries(VIEW.map(id=>[id,$(id).value]))));}catch{}}
for(const id of VIEW)$(id).oninput=applyView;applyView();
$('demo').onclick=()=>{stop();demo=true;demoRun=null;$('demoControls').classList.add('visible');status('Demo · choose a movement below');};
document.querySelectorAll('[data-look]').forEach(b=>b.onclick=()=>{lookDemo=+b.dataset.look;if(!lookDemo)headLook.speed=0;});
document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>{swipe.reset();demoRun={direction:b.dataset.demo,start:performance.now()};});
document.addEventListener('visibilitychange',()=>{held.reset();swipe.reset();demoRun=null;if(document.hidden&&running&&!CAM)stop();});
addEventListener('pagehide',stop);
function frame(now){
 requestAnimationFrame(frame);
 const dt=lastFrameTime?Math.min(.1,(now-lastFrameTime)/1000):1/60;lastFrameTime=now;
 if(head&&!resting){const pose=head.update(now,dt),valid=head.mode!=='off'&&freshHead(head.lastResult,now);
  headSeen=valid;if(now-lastHUD>=100)trackingUI.face(head.latest,valid);{const L=valid?head.latest:null;if(L&&L.span>0){const f=1/(2*Math.tan(handView.phoneFov*Math.PI/360)),d=Math.min(2,Math.max(.18,f*.09/L.span)),asp=($('cam').videoWidth/$('cam').videoHeight)||4/3;handView.eye=[(L.centerX-.5)*d/f,-(L.centerY-.5)*d/(f*asp),d];}else handView.eye=null;}   // the tracked eye (phone frame) places the hand: outer-eye span 90 mm
 const rawYaw=valid&&head.pose.neutral?-(head.pose.latest.yaw-head.pose.neutral.yaw):0;const viewYaw=headLook.update(rawYaw,dt,valid,head.lastResult?.ts);const rawPitch=valid&&head.pose.neutral?head.pose.latest.pitch-head.pose.neutral.pitch:0;const viewPitch=headLook.updatePitch(rawPitch,dt,valid);if(valid)camera.rotation.set(viewPitch,viewYaw,0,'YXZ');if(now-lastHUD>=100)$('headStatus').textContent=(head.failed?'Head error: '+head.error:!head.ready?'Head loading…':head.mode==='off'?'Head off':valid?'Head tracking · '+head.perf.fps+' fps':'Face not tracked')+(head.lastResult?` · age ${Math.max(0,Math.round(now-head.lastResult.ts))}ms`:'')+(valid?` · yaw ${(rawYaw*180/Math.PI).toFixed(0)}° · pitch ${(rawPitch*180/Math.PI).toFixed(0)}° · ${headLook.state}${headLook.state==='HOLD TO TURN'?' '+Math.round(headLook.progress*100)+'%':''}`:' · turn stopped');}
 if(demo&&!resting){camera.rotation.set(0,headLook.update(lookDemo*.35,dt),0,'YXZ');}

 if(demo&&demoRun&&!resting){const elapsed=now-demoRun.start,t=Math.max(0,Math.min(1,(elapsed-180)/180));const d=demoRun.direction;apply({x:.5+(d.includes('right')?.25:d.includes('left')?-.25:0)*t,z:.5+(d.includes('forward')?-.18:d.includes('backward')?.18:0)*t,pinch:.8,extended:true,pointing:true},now);if(elapsed>1050){demoRun=null;apply(null,now);status('Demo complete · choose another movement');}}
 if(inputMode==='touch'&&!document.hidden&&!demo&&!resting){const v=stick.vector,step=bodyDisplacement(v.x*held.speed*Math.min(.05,dt),v.z*held.speed*Math.min(.05,dt),headLook.heading);dustMap.move(camera.position,step.x,step.z);const moving=Math.hypot(v.x,v.z)>.001;status(moving?'WALKING · release to stop':'Thumbstick ready · drag to walk',moving);$('gestureStats').textContent=moving?'Walking '+Math.round(Math.hypot(v.x,v.z)*100)+'%':'Stopped';}
 if(running&&!resting){
  const movement=held.step(now,dt);
  // Joystick smoothing: the joystick's own
  // output jumps as the finger jitters. A 120 ms low-pass on the walking vector removes that without adding lag you
  // can feel, and the default gain slider starts lower.
  {const k=1-Math.exp(-Math.min(.1,dt)/.12);walkF.x+=(movement.dx-walkF.x)*k;walkF.z+=(movement.dz-walkF.z)*k;if(!held.direction&&Math.hypot(walkF.x,walkF.z)<1e-4){walkF.x=walkF.z=0;}}
  const world=bodyDisplacement(walkF.x,walkF.z,headLook.heading),beforeX=camera.position.x,beforeZ=camera.position.z;dustMap.move(camera.position,world.x,world.z);if(held.direction){walkReason=!dustMap.ready?'MAP LOADING':Math.hypot(camera.position.x-beforeX,camera.position.z-beforeZ)<.00001?'BLOCKED BY MAP':'MOVING';}
  if(inputMode!=='touch'&&now-lastResult>450){held.receive(null,now);swipe.update(null,now);trackingUI.draw([],$('cam').videoWidth,$('cam').videoHeight,false,{tip:fingerMode==='index'?8:4,centre:held.centre,viewScale:held.scale,scale:held.effectiveScale,reason:held.reason});handModel.hide();handModelL.hide();walkReason='WAITING FOR TRACKING';status(walkReason);}
  if(!phoneLink){const v=$('cam');   // with the phone tracking there is nothing to capture here; results arrive over the link
  // The two trackers live in separate workers and each already refuses a second frame while it is busy, so they
  // run side by side instead of taking turns. Sharing one turn meant the hand (13 ms) waited for the face (85 ms) every
  // other frame and both crawled at 6 fps; independently the hand keeps up with the camera and the face runs at its own
  // pace.
  const ready=v.readyState>=2;
  if(ready&&!!head?.wantsFrame(now)&&v.currentTime!==lastHeadVideo){lastHeadVideo=v.currentTime;head.capture(v,now);}
  if(ready&&inputMode!=='touch'&&!busy&&v.currentTime!==lastVideo){lastVideo=v.currentTime;busy=true;const capture=now,owner=worker;createImageBitmap(v,{resizeWidth:640,resizeHeight:Math.round(640*v.videoHeight/v.videoWidth),resizeQuality:'low'}).then(bitmap=>{if(worker!==owner||!running){bitmap.close();return;}owner.postMessage({type:'frame',bitmap,time:capture},[bitmap]);}).catch(e=>{busy=false;status('Frame unavailable');$('error').textContent=e.message;});}}
 }
 if(now-lastHUD>=100){lastHUD=now;
 $('position').innerHTML=`${['N','NE','E','SE','S','SW','W','NW'][Math.round(((-camera.rotation.y*180/Math.PI)%360+360)%360/45)%8]} · ${((-camera.rotation.y*180/Math.PI%360+360)%360).toFixed(0)}°<br>X ${camera.position.x.toFixed(1)} · Z ${camera.position.z.toFixed(1)}`;
 $('turnIndicator').textContent=(running||demo)?headLook.state+(headLook.state==='HOLD TO TURN'?' '+Math.round(headLook.progress*100)+'%':''):'Head control paused';
 $('walkIndicator').textContent=resting?'RESTING · TAP RESUME':inputMode==='poses'?(!running?'START CAMERA':held.direction?fingerMode.toUpperCase()+' '+held.direction+' · '+walkReason:'STOP · '+walkReason):inputMode==='index'?'INDEX STROKES':'SCREEN THUMBSTICK';
 $('turnIndicator').style.color=headLook.state.includes('BODY')?'#ffdf75':'#b8ebd1';
 const dot=$('joystickDot');dot.style.transform=`translate(${held.x*30}px,${held.z*30}px)`;$('joystickState').textContent=resting?'REST':held.direction||held.reason;
 }
 if(remote.group.visible){const k=Math.min(1,dt*12);remote.group.position.lerp(remote.target.p,k);remote.group.rotation.y+=(remote.target.yaw-remote.group.rotation.y)*k;remote.eye.rotation.x+=(remote.target.pitch-remote.eye.rotation.x)*k;if(now-remote.seen>3000){remote.group.visible=false;remote.hand.hide();}}
 if(net?.opp?.open&&now-lastSent>=50){lastSent=now;const h=handModel.visible?handModel.points.flatMap(p=>[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)]):null;net.sendHands({t:'h',p:[+camera.position.x.toFixed(2),+camera.position.y.toFixed(2),+camera.position.z.toFixed(2)],r:[+camera.rotation.x.toFixed(3),+camera.rotation.y.toFixed(3)],h,o:handModel.offset,ts:Math.round(now)});}
 if(jump.h>0||jump.v>0){const s=Math.min(.05,dt);jump.v-=9.8*s;jump.h=Math.max(0,jump.h+jump.v*s);if(jump.h===0)jump.v=0;}
 camera.position.y+=jump.h-jump.applied;jump.applied=jump.h;   // apply the CHANGE: adding the height every frame made it climb and never land
 // Capture and control input keep running at camera speed. Limit only the expensive 3D work.
 const drawDt=renderClock.step(now);if(drawDt===null)return;
 bodyRig?.update(drawDt,now,{head,heading:headLook.heading,look:headLook.look,lookPitch:headLook.pitch});
 if(phoneLink&&bodyRig&&bodyRig.told!==bodyRig.wants()){bodyRig.told=bodyRig.wants();phoneLink.link.sendJSON('c',{body:bodyRig.told?1:0});}   // the phone only runs its pose tracker when the body is actually shown   // the rig's eyes follow the camera, its body faces the heading, its right arm reaches our hand
 shooter?.update(drawDt,now);
 const drawStart=performance.now();renderer.render(scene,camera);
 window.movementPerf={build:90,drawMs:performance.now()-drawStart,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}controlsChanged();requestAnimationFrame(frame);
if(new URLSearchParams(location.search).has('cam')){$('start').textContent='Connect phone camera';start();}   // phone-as-camera mode: no local permission prompt, connect right away
{const b=$('phoneCam');if(b)b.onclick=()=>{const u=new URL(location.href);u.searchParams.set('cam','');location.href=u.href;};}
