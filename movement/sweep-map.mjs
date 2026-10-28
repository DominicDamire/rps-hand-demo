import * as T from 'three';
import {DustMap} from './map.mjs?v=90';
import {setupShooter} from './shooter.mjs?v=map9';
import {ThumbJoystick,measureThumb} from './thumb-joystick.mjs?v=90';
import {bodyDisplacement} from './head-look.mjs?v=90';
import {AlignedGun} from '../hand-pnp-gun/gun.mjs?v=gun3';
import {GripRig} from '../gun-lab/grip-rig.mjs?v=4';
import {loadProvidedProfile} from '../gun-lab/presets.mjs?v=2';
export async function installMapLab({scene,renderer,rig,tips,driver,head,hands,aspect,stop}){
 const world=new T.Scene();world.background=new T.Color('#abc9d9');world.fog=new T.Fog('#abc9d9',90,180);world.add(new T.HemisphereLight(0xffffff,0x526980,2));
 const avatar=new T.Group();world.add(avatar);avatar.add(scene);
 const camera=new T.PerspectiveCamera(90,1,.01,200),player=new T.Vector3(),map=new DustMap(world),joystick=new ThumbJoystick();
 const panel=document.createElement('section');panel.innerHTML='<h2>First-person camera and movement</h2><label>Field of view <input id="mapFov" type="range" min="50" max="120" value="90"><output>90°</output></label><button id="mapCentre">Centre tracked eyes</button><label>Movement finger <select id="mapFinger"><option value="index">Index</option><option value="thumb">Thumb</option></select></label><label>Walking speed <input id="mapSpeed" type="range" min=".2" max="4" step=".1" value="1.2"></label><p>Left hand: original movement joystick. Right hand: close the lower three fingers to pick up; straighten and curl index to fire; open lower fingers to release. Arrow buttons also walk; Q/E turn.</p><div id="mapArrows"><button data-walk="forward">↑</button><button data-walk="left">←</button><button data-walk="back">↓</button><button data-walk="right">→</button></div><p id="mapStatus" role="status">Loading the range…</p><p>Eye position follows the calibrated face estimate, including forward/back movement. FOV changes only this view, not Sweep calibration.</p>';
 document.getElementById('directSettings').append(panel);panel.style.setProperty('display','block','important');
 const $=id=>panel.querySelector('#'+id),status=$('mapStatus');$('mapFov').oninput=()=>{$('mapFov').nextElementSibling.value=$('mapFov').value+'°';};
 let neutral=null,last=performance.now(),lastHand=null,yaw=0,lastShot=null,walkX=0,walkZ=0,pressed=null,ready=false;
 $('mapCentre').onclick=()=>{neutral=null;joystick.reset();};
 for(const b of panel.querySelectorAll('[data-walk]')){b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);pressed=b.dataset.walk};b.onpointerup=b.onpointercancel=()=>pressed=null;}
 const keys=new Set();addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE'].includes(e.code)){keys.add(e.code);e.preventDefault();}});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();pressed=null;joystick.reset();});
 const profile=await loadProvidedProfile(),source=new GripRig(new T.Scene(),profile);await source.ready;
 const gun=new AlignedGun(scene,rig,tips,driver,source,profile);gun.hands=hands;
 const dummy={group:new T.Group(),visible:false,points:[],right:true};
 const range=setupShooter({scene:world,camera,dustMap:map,handModel:dummy,hud:()=>{}});
 map.load().then(async()=>{player.copy(map.spawn);await range.ready;range.gun.obj.visible=false;ready=true;status.textContent='Range ready · connect camera and calibrate Sweep.';}).catch(e=>status.textContent='Map load failed: '+e.message);
 function drive(s,q,result,dt){const result2=gun.drive(s,q,result,dt);if(gun.controller.held&&gun.owner===(s==='R'?'Right':'Left'))gun.anchor=result2.points[0].clone();return result2;}
 function render(){
  const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
  const fresh=hands().filter(h=>now-h.seen<450),left=fresh.find(h=>h.label==='Left');
  if(left&&left.time!==lastHand){lastHand=left.time;joystick.receive(measureThumb(left.landmarks,left.world,aspect(),$('mapFinger').value),now);}else if(!left)joystick.receive(null,now);
  joystick.speed=+$('mapSpeed').value;const movement=joystick.step(now,dt),k=1-Math.exp(-dt/.12);walkX+=(movement.dx-walkX)*k;walkZ+=(movement.dz-walkZ)*k;
  yaw+=((keys.has('KeyQ')?1:0)-(keys.has('KeyE')?1:0))*dt*1.4;
  const dx=walkX+((keys.has('ArrowRight')||pressed==='right'?1:0)-(keys.has('ArrowLeft')||pressed==='left'?1:0))*dt*joystick.speed;
  const dz=walkZ+((keys.has('ArrowDown')||pressed==='back'?1:0)-(keys.has('ArrowUp')||pressed==='forward'?1:0))*dt*joystick.speed;
  const step=bodyDisplacement(dx,dz,yaw);if(ready)map.move(player,step.x,step.z);
  scene.updateMatrixWorld(true);if(gun.controller.held&&gun.anchor){const wrist=rig.joints[(gun.owner==='Right'?'R':'L')+'Hand'].getWorldPosition(new T.Vector3()),delta=wrist.sub(gun.anchor);gun.visual.matrix.elements[12]+=delta.x;gun.visual.matrix.elements[13]+=delta.y;gun.visual.matrix.elements[14]+=delta.z;gun.visual.matrixWorldNeedsUpdate=true;gun.anchor.add(delta);}const eyes=head.bones.eyes;
  const tracked=head.group.visible&&eyes?.length===2;
  const eye=tracked?eyes[0].getWorldPosition(new T.Vector3()).add(eyes[1].getWorldPosition(new T.Vector3())).multiplyScalar(.5):neutral?.clone()??new T.Vector3(0,0,-.5);
  if(tracked&&!neutral)neutral=eye.clone();
  const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI+yaw);
  avatar.quaternion.copy(rotation);avatar.position.copy(player).sub((neutral??eye).clone().applyQuaternion(rotation));avatar.updateMatrixWorld(true);
  camera.position.copy(eye).applyQuaternion(rotation).add(avatar.position);camera.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),yaw).multiply(head.smoothed??new T.Quaternion());camera.fov=+$('mapFov').value;camera.aspect=renderer.domElement.width/renderer.domElement.height;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const hidden=[];for(const m of [head.faceDots,head.contactDot])if(m){hidden.push([m,m.layers.mask]);m.layers.set(1);}if(head.asset)head.asset.traverse(m=>{if(m.isMesh){hidden.push([m,m.layers.mask]);m.layers.set(1);}});
  // Reflector includes the bust, while the eye camera excludes its inside surface.
  if(range?.mirror){range.mirror.userData.eyeMeshes=hidden;const original=range.mirror.onBeforeRender;if(!range.mirror.userData.eyeLayers){range.mirror.userData.eyeLayers=true;range.mirror.onBeforeRender=function(...args){for(const [m]of this.userData.eyeMeshes)m.layers.set(0);try{return original.apply(this,args)}finally{for(const [m]of this.userData.eyeMeshes)m.layers.set(1)}};}}
  if(!fresh.some(h=>h.label===gun.owner)){gun.controller.lose();gun.input=null;}
  if(ready){
   range.gun.update(dt,[],now,camera);range.gun.obj.visible=false;
   if(!gun.controller.held){const parked=new T.Matrix4().makeTranslation(map.spawn.x,map.spawn.y-map.eye+1.34,map.spawn.z-.45).multiply(new T.Matrix4().makeScale(profile.gun.scale,profile.gun.scale,profile.gun.scale));gun.visual.matrixAutoUpdate=false;gun.visual.matrix.copy(avatar.matrixWorld).invert().multiply(parked);gun.visual.updateMatrixWorld(true);}
   if(gun.input?.fired&&lastShot!==gun.input){lastShot=gun.input;const from=gun.visual.localToWorld(source.muzzle.clone()),direction=new T.Vector3(0,0,-1).transformDirection(gun.visual.matrixWorld);range.gun.fireFrom(from,direction);}
   status.textContent=(gun.controller.held?'Gun held · ':'Gun on table · ')+range.gun.state.shots+' shots · '+range.gun.state.hits+' hits · '+(tracked?'Eye tracking':head.error?'Head load error: '+head.error:!head.loaded?'Loading head model':'Waiting for face tracking');
  }
  const canvas=renderer.domElement;canvas.style.transform='none';document.getElementById('cameraFrame').style.display='none';
  try{renderer.autoClear=true;renderer.render(world,camera);}finally{for(const [m,mask]of hidden)m.layers.mask=mask;avatar.position.set(0,0,0);avatar.quaternion.identity();avatar.updateMatrixWorld(true);}
 }
 addEventListener('pagehide',()=>{gun.release();keys.clear();});
 return {drive,render,gun,camera,map,scale:(s,k)=>{gun.scaleVisual(s,k);if(gun.owner===(s==='R'?'Right':'Left'))gun.anchor?.multiplyScalar(k)}};
}
