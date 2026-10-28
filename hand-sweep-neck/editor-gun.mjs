import {batchGun} from './gun-batching.mjs?v=1';
import * as T from 'three';
import {AlignedGun} from '../hand-pnp-gun/gun.mjs?v=grip1';
import {GripRig} from '../gun-lab/grip-rig.mjs?v=4';
import {loadProvidedProfile} from '../gun-lab/presets.mjs?v=2';
import {validateProfile} from '../gun-lab/profile.mjs?v=2';
import {observation,bend} from '../gun-lab/held-pose.mjs?v=4';
import {savedGripDriver} from '../hand-range/saved-grip.mjs?v=authored2';
import {installGunSettings} from '../hand-range/gun-settings.mjs?v=grip1';
import {BodyGunState} from './gun-state.mjs?v=aimrelease1';
const V=()=>new T.Vector3(),rad=Math.PI/180;
export async function installEditorGun({scene,rig,tips,head,hands,renderedHands,alwaysHeld=false}){
 const original=await loadProvidedProfile();let profile=structuredClone(original);
 try{const saved=JSON.parse((localStorage.getItem('editor-gun-grip-v1')||localStorage.getItem('gun-grip-lab-v2')));if(saved)profile=validateProfile(saved);}catch{}
 const source=await new GripRig(new T.Scene(),profile).ready;
 const gun=new AlignedGun(scene,rig,tips,savedGripDriver(rig,tips,source,{preserveDirections:true}),source,profile),state=new BodyGunState();
 batchGun(gun.visual);
 const cfg={pickRadius:.22,pickMs:100,dropMs:200,pickBend:40,holdBend:25,indexFree:55,aimEnabled:!alwaysHeld,alignHip:false,lockThumb:true,aimEnter:.12,aimExit:.17,depthEnter:.09,depthExit:.13,chestX:-.13,chestY:-.30,chestZ:.08,lookDown:.02};
 const panel=document.createElement('section');panel.id='editorGun';
 panel.innerHTML='<h2>Chest holster and aiming</h2><p>Right hand: make a fist near the gun to pick it up. Your index can be curled, and you do not need to look down. Keep these three curled to hold. Relax them to return the gun to your chest. Straighten the index to re-arm, then curl it to shoot.</p><p>Aim by bringing the held hand close to your right eye, including camera depth. Move it away to leave aim mode. Aim distances use your exact entered values; zero disables entry. Entry must satisfy both the entry and release distances. In aim mode the grip aligns with your head direction and the camera moves to the right eye.</p>';
 if(alwaysHeld){panel.querySelector('h2').textContent='Palm-driven gun movement';panel.querySelectorAll('p')[1].textContent='This movement lab has no head, targets or automatic eye-aim mode. The tracked palm controls the wrist orientation. Saved finger poses wrap the grip; the optional wrist alignment offset starts off.';}
 if(alwaysHeld)panel.querySelector('p').textContent='Held-gun lab: show your right hand to drive the saved grip directly. Pickup and release gestures are bypassed. Straighten the index to re-arm, then curl it to shoot. The hand uses the current original-photo proportions and fingertip shells.';
 const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
 function field(key,label,min,max,step,factor=1){if(alwaysHeld&&['pickRadius','pickMs','pickBend','holdBend','chestX','chestY','chestZ'].includes(key))return;const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type='number';const aimField=['aimEnter','aimExit','depthEnter','depthExit'].includes(key);i.min=aimField?0:min;if(!aimField)i.max=max;i.step=aimField?'any':step;i.value=cfg[key]*factor;i.oninput=()=>{if(i.value===''||!Number.isFinite(i.valueAsNumber))return;cfg[key]=(aimField?Math.max(0,i.valueAsNumber):T.MathUtils.clamp(i.valueAsNumber,min,max))/factor;};l.append(i);panel.append(l);}
 for(const a of [['pickRadius','Pickup radius (cm)',5,25,1,100],['pickMs','Hold grip to pick up (ms)',50,800,25],['pickBend','Minimum lower-finger curl to pick up (degrees)',35,100,1],['holdBend','Minimum lower-finger curl to keep holding (degrees)',15,70,1],['chestX','Holster left / right (cm)',-35,35,1,100],['chestY','Holster below eyes (cm)',-60,-15,1,100],['chestZ','Holster forward (cm)',-10,30,1,100],['aimEnter','Aim enter distance (cm)',5,35,1,100],['aimExit','Aim release distance (cm)',8,50,1,100],['depthEnter','Aim depth tolerance (cm)',5,25,1,100],['depthExit','Aim depth release (cm)',10,35,1,100]])field(...a);
 const toggle=document.createElement('label');toggle.innerHTML='<input type="checkbox" checked> Enable right-eye aim mode';toggle.querySelector('input').checked=cfg.aimEnabled;toggle.querySelector('input').disabled=alwaysHeld;toggle.querySelector('input').onchange=e=>cfg.aimEnabled=e.target.checked;panel.append(toggle);
 for(const [key,label]of [['alignHip','Apply optional wrist alignment offset (changes tracked wrist angle)'],['lockThumb','Keep thumb at saved wrapped grip while holding']]){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.checked=cfg[key];i.onchange=()=>cfg[key]=i.checked;l.append(i,label);panel.append(l);}
 // A fixed hand-local gun frame: barrel follows wrist-to-middle-knuckle,
 // not the current head rotation. Calibration replaces this frame only once.
 const handForward=rig.rest.RMiddle1.world.clone().sub(rig.rest.RHand.world).normalize();
 const handRight=rig.rest.RIndex1.world.clone().sub(rig.rest.RPinky1.world);handRight.addScaledVector(handForward,-handRight.dot(handForward)).normalize();
 const handBack=handForward.clone().negate(),handUp=new T.Vector3().crossVectors(handBack,handRight).normalize();
 const defaultHip=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(handRight,handUp,handBack)),hipReference=defaultHip.clone();
 const hipTrim={pitch:0,yaw:0,roll:0};let lastHandQ=null,lastHandTime=-Infinity;
 try{const saved=JSON.parse(localStorage.getItem('editor-hip-alignment-v1'));if(Array.isArray(saved?.quaternion)&&saved.quaternion.length===4&&saved.quaternion.every(Number.isFinite)&&Math.hypot(...saved.quaternion)>.001)hipReference.fromArray(saved.quaternion).normalize();for(const k of Object.keys(hipTrim))if(Number.isFinite(saved?.[k]))hipTrim[k]=T.MathUtils.clamp(saved[k],-180,180);}catch{}
 const hipStatus=document.createElement('p');hipStatus.textContent='By default, hip fire preserves the tracked wrist angle. Optional alignment below rotates the held wrist; enable it only if you want that correction. Head direction is sampled only when capturing neutral.';
 const saveHip=()=>{try{localStorage.setItem('editor-hip-alignment-v1',JSON.stringify({quaternion:hipReference.toArray(),...hipTrim}));}catch{hipStatus.textContent='Alignment applied for this session; browser storage is unavailable.';}};
 const trimFields=[];for(const [key,label]of [['pitch','Gun alignment up / down (degrees)'],['yaw','Gun alignment left / right (degrees)'],['roll','Gun alignment roll (degrees)']]){const l=document.createElement('label'),i=document.createElement('input');i.type='number';i.min=-180;i.max=180;i.step=1;i.value=hipTrim[key];i.setAttribute('aria-label',label);i.oninput=()=>{if(!Number.isFinite(i.valueAsNumber))return;hipTrim[key]=T.MathUtils.clamp(i.valueAsNumber,-180,180);saveHip();};l.append(label,i);panel.append(l);trimFields.push([key,i]);}
 const neutral=document.createElement('button');neutral.textContent='Set this wrist pose as forward';neutral.onclick=()=>{if(!state.held||state.aim||!lastHandQ||performance.now()-lastHandTime>500){hipStatus.textContent='Hold the gun with a tracked hand outside close-eye aim, then capture neutral.';return;}hipReference.copy(lastHandQ).invert().multiply(headQ);for(const [k,i]of trimFields){hipTrim[k]=0;i.value=0;}saveHip();hipStatus.textContent='Neutral saved. Turn your hand to aim; moving your head alone does not steer hip fire.';};panel.append(neutral);
 const resetHip=document.createElement('button');resetHip.textContent='Reset wrist alignment';resetHip.onclick=()=>{hipReference.copy(defaultHip);for(const[k,i]of trimFields){hipTrim[k]=0;i.value=0;}saveHip();hipStatus.textContent='Default hand-forward alignment restored.';};panel.append(resetHip,hipStatus);
 const triggerPanel=installGunSettings(gun,panel);triggerPanel.querySelectorAll('p')[1].textContent=alwaysHeld?'The gun attaches directly to your tracked right hand. The trigger uses your saved endpoints.':'Pickup requires the chest holster gesture described above. The index trigger and thumb use the saved endpoints.';
 const grip=document.createElement('section');grip.id='editorGrip';grip.innerHTML='<h2>Edit locked gun grip</h2><p>These controls change the saved grip only. Middle, ring and little fingers stay locked while holding. The index moves between saved trigger endpoints. The thumb stays wrapped by default; turn off the thumb lock in Gun to track it. Preview the stops, move individual joints, then save.</p>';
 let waitingForLiveHand=alwaysHeld;
 const previewLabel=document.createElement('label');previewLabel.innerHTML='<input type="checkbox"> Preview grip without tracking';grip.append(previewLabel);const previewInput=previewLabel.querySelector('input');previewInput.checked=alwaysHeld;
 const endpoint=document.createElement('select');endpoint.setAttribute('aria-label','Grip endpoint');for(const [value,text]of [['angles','Released index / wrapped thumb'],['indexPressed','Pressed index'],['thumbOpen','Raised thumb']])endpoint.add(new Option(text,value));grip.append(endpoint);
 const finger=document.createElement('select');finger.setAttribute('aria-label','Grip finger');for(const name of ['Thumb','Index','Middle','Ring','Pinky'])finger.add(new Option(name,name));grip.append(finger);
 const joint=document.createElement('select');joint.setAttribute('aria-label','Grip joint');for(let i=1;i<=3;i++)joint.add(new Option(i===1?'Base joint':i===2?'Middle joint':'Tip joint',i));grip.append(joint);
 const sliders=[];function rebuild(){gun.profile=profile;source.configure(profile);gun.driver=savedGripDriver(rig,tips,source,{preserveDirections:true});}
 function target(){const name=finger.value+joint.value;const bank=profile[endpoint.value]??= {};if(endpoint.value!=='angles'){const f=endpoint.value==='indexPressed'?'Index':'Thumb';for(let k=1;k<=3;k++)bank[f+k]??=[...profile.angles[f+k]];}bank[name]??=[...profile.angles[name]];return bank[name];}
 function updateFields(){const restricted=endpoint.value==='indexPressed'?'Index':endpoint.value==='thumbOpen'?'Thumb':null;if(restricted)finger.value=restricted;finger.disabled=!!restricted;sliders.forEach((s,k)=>{s.value=target()[k];s.nextElementSibling.value=s.value;});}
 for(const [axis,label]of ['Bend / local X','Side / local Y','Twist / local Z'].entries()){const l=document.createElement('label'),s=document.createElement('input'),o=document.createElement('output');l.textContent=label;s.type='range';s.min=-180;s.max=180;s.step=1;s.setAttribute('aria-label',label);s.oninput=()=>{target()[axis]=+s.value;o.value=s.value;rebuild();gripStatus.textContent='Unsaved grip changes - active in preview and live holding. Press Save grip to keep them.';};l.append(s,o);grip.append(l);sliders.push(s);}
 for(const s of [endpoint,finger,joint])s.onchange=updateFields;updateFields();
 for(const [name,fn]of [['Save grip',()=>{try{profile=validateProfile(profile);rebuild();const json=JSON.stringify(profile);localStorage.setItem('editor-gun-grip-v1',json);if(localStorage.getItem('editor-gun-grip-v1')!==json)throw Error('Storage read-back failed');localStorage.setItem('gun-grip-lab-v2',json);gripStatus.textContent='Grip saved and verified. Live holding uses these same finger stops; the index moves between the saved trigger endpoints.';}catch(e){gripStatus.textContent='Grip could not be saved: '+e.message;}}],['Restore supplied grip',()=>{Object.assign(profile,structuredClone(original));rebuild();updateFields();localStorage.removeItem('editor-gun-grip-v1');localStorage.removeItem('gun-grip-lab-v2');gripStatus.textContent='Original supplied grip restored.';}]]){const b=document.createElement('button');b.textContent=name;b.onclick=fn;grip.append(b);}
 const gripStatus=document.createElement('p');grip.append(gripStatus);
 function loadSavedGrip(){try{const raw=localStorage.getItem('gun-grip-lab-v2')||localStorage.getItem('editor-gun-grip-v1');if(!raw){gripStatus.textContent='No saved grip in this browser.';return;}profile=validateProfile(JSON.parse(raw));localStorage.setItem('editor-gun-grip-v1',JSON.stringify(profile));rebuild();updateFields();gripStatus.textContent='Saved gun-editor grip loaded for preview and live pickup.';}catch(e){gripStatus.textContent='Could not load grip: '+e.message;}}
 const loadGrip=document.createElement('button');loadGrip.textContent='Load saved gun-editor grip';loadGrip.onclick=loadSavedGrip;grip.append(loadGrip);
 addEventListener('storage',e=>{if(['gun-grip-lab-v2','editor-gun-grip-v1'].includes(e.key)&&e.newValue)gripStatus.textContent='A grip changed in another tab. Use Load saved gun-editor grip to apply it.';});
 // Sight rail is parallel to the barrel. The red point lies on the shot ray.
 const glass=gun.visual.getObjectByName('Sight_glass_low');glass.geometry.computeBoundingBox();glass.updateWorldMatrix(true,false);const sightLocal=glass.geometry.boundingBox.getCenter(V()).applyMatrix4(glass.matrixWorld).applyMatrix4(gun.visual.matrixWorld.clone().invert());
 glass.material=new T.MeshBasicMaterial({color:0xcceeff,transparent:true,opacity:.06,depthWrite:false,side:T.DoubleSide});
 const targets=new T.Group();scene.add(targets);targets.visible=false;let targetsPlaced=false,hits=0;
 for(const [x,y,z]of [[0,0,-3],[-.7,.2,-4],[.8,-.15,-5]]){const disk=new T.Mesh(new T.CircleGeometry(.25,40),new T.MeshBasicMaterial({color:0xe34c4c,side:T.DoubleSide}));disk.position.set(x,y,z);const bull=new T.Mesh(new T.CircleGeometry(.07,24),new T.MeshBasicMaterial({color:0xffeeee,side:T.DoubleSide}));bull.position.z=.002;disk.add(bull);targets.add(disk);}
 const resetTargets=document.createElement('button');resetTargets.textContent='Place targets in front of me';resetTargets.onclick=()=>{targetsPlaced=false;};if(!alwaysHeld)panel.append(resetTargets);
 const dot=new T.Mesh(new T.SphereGeometry(.05,10,8),new T.MeshBasicMaterial({color:0xff2424,depthTest:false}));dot.renderOrder=10;scene.add(dot);dot.visible=false;
 const tracer=new T.Line(new T.BufferGeometry().setFromPoints([V(),V()]),new T.LineBasicMaterial({color:0xffc05a}));scene.add(tracer);tracer.visible=false;
 let lastSample=null,lastFresh=0,shots=0,flash=0,aimPose=null;
 const holster=V(),eye=V(),forward=new T.Vector3(0,0,1),headQ=new T.Quaternion(),bodyQ=new T.Quaternion();
 function release(){state.reset();gun.controller.reset();gun.owner=null;gun.input=null;aimPose=null;}
 gun.release=release;previewInput.onchange=()=>{release();};
 function body(){head.group.updateWorldMatrix(true,true);const eyes=head.bones.eyes;if(!head.group.visible||eyes?.length!==2)return false;
  headQ.copy(head.smoothed).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI));forward.set(0,0,-1).applyQuaternion(headQ);
  const right=new T.Vector3(1,0,0).applyQuaternion(headQ),mid=eyes[0].getWorldPosition(V()).add(eyes[1].getWorldPosition(V())).multiplyScalar(.5);
  const named=eyes.find(b=>/right|[._-]r$/i.test(b.name));eye.copy((named??eyes.reduce((a,b)=>a.getWorldPosition(V()).dot(right)>b.getWorldPosition(V()).dot(right)?a:b)).getWorldPosition(V()));
  // Holster follows torso yaw, not the nod used to look down at it.
  const yaw=Math.atan2(-forward.x,-forward.z);bodyQ.setFromAxisAngle(new T.Vector3(0,1,0),yaw);
  if(!targetsPlaced){targets.position.copy(eye);targets.quaternion.copy(headQ);targets.visible=true;targets.updateMatrixWorld(true);targetsPlaced=true;}
  holster.copy(mid).add(new T.Vector3(cfg.chestX,cfg.chestY,-cfg.chestZ).applyQuaternion(bodyQ));return true;
 }
 function park(){gun.visual.matrixAutoUpdate=true;gun.visual.position.copy(holster);gun.visual.quaternion.copy(bodyQ).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2));gun.visual.scale.setScalar(profile.gun.scale);gun.visual.updateMatrixWorld(true);}
 function tick(now){
  const hasHead=!alwaysHeld&&body(),h=hands().find(h=>h.label==='Right'),entry=renderedHands.R;aimPose=null;
  if(waitingForLiveHand&&h&&!h.predicted&&entry){waitingForLiveHand=false;previewInput.checked=false;}
  if(previewInput.checked){
   const q=new T.Quaternion().setFromEuler(new T.Euler(-.3,-.65,Math.PI/2));gun.pose('R',q,new T.Vector3(-.05,-.03,-.4),endpoint.value==='indexPressed'?1:0,endpoint.value==='thumbOpen'?0:1,1/60);
   for(const m of rig.parts)if(/^R(Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name))m.visible=true;
   gun.visual.visible=true;dot.visible=false;status.textContent=waitingForLiveHand?'Grip preview - show your right hand to start live holding':'Grip preview - live pickup paused';return;
  }
  const fresh=h&&!h.predicted&&now-h.seen<300&&entry&&now-entry.time<300;
  if(fresh&&h.landmarks!==lastSample){lastSample=h.landmarks;lastFresh=now;const o=observation(h.world),wrist=entry.result.points[0],p=o?.points;
   const event=state.step({time:now,valid:!!o&&(hasHead||alwaysHeld),near:alwaysHeld||wrist.distanceTo(holster)<cfg.pickRadius,lookingDown:forward.y< -cfg.lookDown,open:!alwaysHeld&&!!o?.open,grip:alwaysHeld||!!o&&o.lower.every(v=>v>(state.held?cfg.holdBend:cfg.pickBend)),indexFree:!!p&&(bend(p,5,6,7)??180)<cfg.indexFree,eyeDistance:wrist.distanceTo(eye),eyeDepth:wrist.clone().sub(eye).dot(forward)},{...cfg,aimEnabled:cfg.aimEnabled&&hasHead});
   if(event.picked){gun.controller.reset();gun.controller.held=true;gun.owner='Right';}
   if(event.dropped)release();
   if(state.held){gun.input=gun.controller.update(h.world,now,profile,'Right');gun.controller.held=true;}else gun.input=null;
  }else if(!fresh||now-lastFresh>350){state.step({time:now,valid:false},cfg);gun.controller.lose();gun.input=null;if(!state.held)release();}
  gun.visual.visible=hasHead||alwaysHeld&&!!entry;
  if(state.held&&entry){
   let q=state.aim?new T.Quaternion():rig.joints.RHand.getWorldQuaternion(new T.Quaternion()),wrist=state.aim?V():entry.result.points[0].clone(),input=gun.input??{index:0,thumb:1};
   if(!state.aim&&fresh){lastHandQ=q.clone();lastHandTime=performance.now();}
   let result=gun.pose('R',q,wrist,input.index,cfg.lockThumb?1:input.thumb,1/60);
   if(!state.aim&&cfg.alignHip){
    const gunLocal=q.clone().invert().multiply(gun.visual.getWorldQuaternion(new T.Quaternion()));
    const trim=new T.Quaternion().setFromEuler(new T.Euler(hipTrim.pitch*rad,hipTrim.yaw*rad,hipTrim.roll*rad));
    const desired=q.clone().multiply(hipReference).multiply(trim);
    q.copy(desired).multiply(gunLocal.invert());
    result=gun.pose('R',q,wrist,input.index,cfg.lockThumb?1:input.thumb,1/60);
   }
   if(state.aim){
    const gunRotation=gun.visual.getWorldQuaternion(new T.Quaternion());q.premultiply(headQ.clone().multiply(gunRotation.invert()));
    result=gun.pose('R',q,wrist,input.index,cfg.lockThumb?1:input.thumb,1/60);
   }
   if(state.aim){
    const sightPoint=gun.visual.localToWorld(sightLocal.clone()),offset=eye.clone().addScaledVector(forward,.16).sub(sightPoint);wrist.add(offset);
    result=gun.pose('R',q,wrist,input.index,cfg.lockThumb?1:input.thumb,1/60);
    // Final optic transform depends only on the head, never on tracked hand
    // orientation or articulation. Trigger animation remains a child transform.
    const aimScale=gun.visual.getWorldScale(V()),aimPosition=eye.clone().addScaledVector(forward,.16).sub(sightLocal.clone().multiply(aimScale).applyQuaternion(headQ));
    gun.visual.matrixAutoUpdate=false;gun.visual.matrix.compose(aimPosition,headQ,aimScale);gun.visual.matrixWorldNeedsUpdate=true;gun.visual.updateMatrixWorld(true);
    aimPose={position:eye.clone().addScaledVector(forward,.12),quaternion:headQ.clone(),fov:35};
   }
   entry.result=result;gun.visual.updateMatrixWorld(true);
   const from=gun.visual.localToWorld(source.muzzle.clone()),barrel=new T.Vector3(0,0,-1).transformDirection(gun.visual.matrixWorld);
   const aimTarget=gun.visual.localToWorld(sightLocal.clone()).addScaledVector(barrel,20),direction=aimTarget.clone().sub(from).normalize();
   dot.position.copy(aimTarget);dot.visible=true;
   if(input.fired&&input!==lastFired){lastFired=input;shots++;const hit=new T.Raycaster(from,direction,0,30).intersectObjects(targets.children,true)[0];if(hit)hits++;tracer.geometry.setFromPoints([from,hit?.point??aimTarget]);tracer.visible=true;flash=now+100;}
   api.shotRay={origin:from.toArray(),direction:direction.toArray(),target:aimTarget.toArray()};
  }else {park();dot.visible=false;}
  if(now>flash)tracer.visible=false;
  status.textContent=(hasHead||alwaysHeld)?(state.held?(state.aim?'AIM - right eye':alwaysHeld?'HELD - following tracked palm':'HELD - raise toward right eye')+' · '+shots+' shots · '+hits+' hits':state.armed?'Ready: make a fist near the gun':'HOLSTERED - make a fist next to the gun'):'Show your face to place the chest holster';
  
 }
 let lastFired=null;
 const api={panel,grip,tick,release,gun,state,cfg,getAim:()=>aimPose,getStats:()=>({shots,held:state.held,aim:state.aim,holster:holster.toArray(),eye:eye.toArray()}),shotRay:null};return api;
}
