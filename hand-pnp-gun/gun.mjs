import * as T from 'three';
import {GripRig} from '../gun-lab/grip-rig.mjs?v=4';
import {loadProvidedProfile} from '../gun-lab/presets.mjs?v=2';
import {GripController,heldAngles} from '../gun-lab/held-pose.mjs?v=4';
import {tipWorld} from '../hand-pnp-photo/contact.mjs?v=photo1';
const fingers=['Thumb','Index','Middle','Ring','Pinky'];
export class AlignedGun {
 constructor(scene,rig,tips,driver,source,profile){
  Object.assign(this,{scene,rig,tips,driver,source,profile});
  this.controller=new GripController();this.sourceTips={};
  for(const f of fingers){const key=profile.side+f,axis=source.rig.rest[key+'3'].world.clone().sub(source.rig.rest[key+'2'].world).normalize();let best=null,d=-Infinity;for(const m of source.rig.parts.filter(m=>m.parent===source.rig.joints[key+'3'])){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.userData.gripRest??m.matrix),t=v.dot(axis);if(t>d){d=t;best=v;}}}this.sourceTips[key]=best;}
  this.lastLM=null;this.owner=null;this.input=null;this.lastTime=0;
  this.visual=new T.Group();this.visual.add(source.model.clone(true));scene.add(this.visual);
  this.trigger=this.visual.getObjectByName('Trigger_low');this.triggerRest=this.trigger?.quaternion.clone();
  this.park();
 }
 park(){this.visual.matrixAutoUpdate=true;this.visual.position.set(.14,-.17,-.55);this.visual.rotation.set(0,Math.PI/2,0);this.visual.scale.setScalar(this.profile.gun.scale);this.visual.updateMatrixWorld(true);}
 release(){this.controller.reset();this.owner=null;this.input=null;this.lastLM=null;this.park();}
 observe(h,now){
  if(!h||now-this.lastTime>1000&&this.lastLM===h.landmarks){this.controller.lose();this.input=null;return;}
  if(this.owner&&h.label!==this.owner)return;
  if(this.lastLM===h.landmarks)return;
  this.lastLM=h.landmarks;this.lastTime=now;
  this.input=this.controller.update(h.world,now,this.profile,h.label);if(this.input.valid)this.lastPoseInput=this.input;
  if(this.input.picked)this.owner=h.label;
  if(this.input.dropped){this.owner=null;this.park();}
 }
 pose(side,q,wrist,index,thumb,dt=0){
  const pull=Math.max(0,Math.min(1,index*this.profile.trigger.gain));
  this.source.pose(heldAngles(this.profile,index,thumb),pull);
  const sr=this.source.rig,S=this.profile.side;
  sr.root.updateWorldMatrix(true,true);
  const sourcePalm=sr.joints[S+'Hand'].getWorldQuaternion(new T.Quaternion());
  const rotation=new T.Matrix4().makeRotationFromQuaternion(q).multiply(new T.Matrix4().makeScale(side===S?1:-1,1,1)).multiply(new T.Matrix4().makeRotationFromQuaternion(sourcePalm.invert()));
  const origin=sr.joints[S+'Middle1'].getWorldPosition(new T.Vector3());
  const target=this.rig.rest[side+'Middle1'].world.clone().sub(this.rig.rest[side+'Hand'].world).applyQuaternion(q).add(wrist);
  // Keep the supplied placement anchored to the middle knuckle. Moving the
  // aligned wrist pivot inside the palm must not shift the gun away from the grip.
  const map=p=>p.sub(origin).applyMatrix4(rotation).add(target),points=[wrist.clone()];
  for(const f of fingers){for(let k=1;k<=3;k++)points.push(map(sr.joints[S+f+k].getWorldPosition(new T.Vector3())));points.push(map(tipWorld(sr,this.sourceTips,S,f)));}
  const result=this.driver(points,side,q,dt,{fitImage:false,lockUpper:false,noiseDegrees:0,smoothingMs:0,thickness:this.profile.thickness,tipInset:0,authoredIndex:pull,authoredThumb:thumb});
  const transform=new T.Matrix4().makeTranslation(...target.toArray()).multiply(rotation).multiply(new T.Matrix4().makeTranslation(...origin.clone().negate().toArray()));
  this.source.gun.updateWorldMatrix(true,true);
  this.visual.matrixAutoUpdate=false;this.visual.matrix.copy(transform).multiply(this.source.gun.matrixWorld);this.visual.matrixWorldNeedsUpdate=true;this.visual.updateMatrixWorld(true);
  if(this.trigger)this.trigger.quaternion.copy(this.triggerRest).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-.25*pull));
  return result;
 }
 drive(side,q,result,dt){
  const h=this.hands?.().find(h=>h.label===(side==='R'?'Right':'Left'));
  const selected=this.owner??this.hands?.().find(h=>h.label==='Right')?.label??this.hands?.()[0]?.label;
  if(h?.label!==selected)return result;
  this.observe(h,performance.now());
  const input=this.input??this.lastPoseInput;
  if(!this.controller.held||!input?.valid||h?.label!==this.owner)return result;
  return this.pose(side,q,result.points[0],input.index,input.thumb,dt);
 }
 scaleVisual(side,scale){if(this.controller.held&&this.owner===(side==='R'?'Right':'Left')){this.visual.matrix.premultiply(new T.Matrix4().makeScale(scale,scale,scale));this.visual.matrixWorldNeedsUpdate=true;}}
 endPreview(){this.previewResult=null;this.preview=false;this.release();}
}
export async function installGunLab({scene,rig,tips,driver,hands,stop}){
 const profile=await loadProvidedProfile(),source=await new GripRig(new T.Scene(),profile).ready;
 const lab=new AlignedGun(scene,rig,tips,driver,source,profile);lab.hands=hands;
 const panel=document.createElement('section');panel.id='gunPanel';panel.innerHTML=`<h2>Gun pickup &amp; grip</h2><p>Close the middle, ring and little fingers to pick up. Open them to release. Straighten the index once, then bend it to fire.</p><p>Gun placement and finger stops use your saved grip. The lower three fingers stay fixed while held; thumb and index move between your supplied poses.</p><p id="gunStatus" role="status">Gun ready for pickup · connect camera or inspect the grip</p><p id="gunScore">0 shots · 0 hits</p><button id="gunRelease">Return gun</button><h3>Inspect saved stops</h3><div class="row"><button id="gunInspect">Released index</button><button id="gunPressed">Pressed index</button></div><div class="row"><button id="gunThumbUp">Thumb up</button><button id="gunThumbIn">Thumb wrapped</button></div><label>Index<input id="gunIndex" type="range" min="0" max="1" step=".01" value="0"></label><label>Thumb<input id="gunThumb" type="range" min="0" max="1" step=".01" value="1"></label><p>Green lines are the model joints. In a held grip, the saved stops intentionally limit the fingers.</p>`;
 document.getElementById('directSettings').prepend(panel);
 const $=id=>document.getElementById(id);
 let shots=0,hits=0,lastFired=null,flashUntil=0;
 const targets=new T.Group();scene.add(targets);
 for(const [x,y,z]of [[-.3,.1,-1.5],[0,.17,-2],[.35,.05,-2.5]]){const disk=new T.Mesh(new T.CircleGeometry(.13,32),new T.MeshBasicMaterial({color:0xb9834e,side:T.DoubleSide}));disk.position.set(x,y,z);targets.add(disk);const bull=new T.Mesh(new T.CircleGeometry(.04,24),new T.MeshBasicMaterial({color:0xffe3a0,side:T.DoubleSide}));bull.position.z=.002;disk.add(bull);}
 const tracer=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color:0xffdc89}));tracer.visible=false;scene.add(tracer);
 function inspect(){stop();lab.preview=true;lab.controller.reset();lab.owner=null;for(const m of rig.parts)m.visible=m.name.startsWith('R')&&/^R(Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name);}
 $('gunInspect').onclick=()=>{$('gunIndex').value=0;inspect();};$('gunPressed').onclick=()=>{$('gunIndex').value=1;inspect();};$('gunThumbUp').onclick=()=>{$('gunThumb').value=0;inspect();};$('gunThumbIn').onclick=()=>{$('gunThumb').value=1;inspect();};
 for(const id of ['gunIndex','gunThumb'])$(id).oninput=()=>{if(!lab.preview)inspect();};
 $('gunRelease').onclick=()=>lab.endPreview();
 const r=rig.rest,x=r.RIndex1.world.clone().sub(r.RPinky1.world),y=r.RMiddle1.world.clone().sub(r.RHand.world).normalize();x.addScaledVector(y,-x.dot(y)).normalize();
 const previewQ=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,new T.Vector3().crossVectors(x,y))).invert();
 // A three-quarter inspection angle makes the gun and finger clearance visible.
 previewQ.premultiply(new T.Quaternion().setFromEuler(new T.Euler(-.3,-.65,Math.PI/2)));
 lab.tick=(now,all)=>{
  targets.visible=!lab.preview;
  if(lab.preview){for(const m of rig.parts)m.visible=m.name.startsWith('R')&&/^R(Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name);lab.previewResult=lab.pose('R',previewQ,new T.Vector3(-.05,-.03,-.4),+$('gunIndex').value,+$('gunThumb').value);$('gunStatus').textContent='GRIP INSPECTION · index '+Math.round(+$('gunIndex').value*100)+'% · thumb '+Math.round(+$('gunThumb').value*100)+'%';}
  else{
   if(!all.length||now-lab.lastTime>300){lab.controller.lose();lab.input=null;}
   $('gunStatus').textContent=lab.controller.held?(lab.input?'HELD · index '+Math.round(lab.input.index*100)+'% · thumb '+Math.round(lab.input.thumb*100)+'% · grip stops active':'HELD · tracking paused; release index after returning'):'Gun ready for pickup · close the three lower fingers to pick up';
   if(lab.input?.fired&&lastFired!==lab.input){lastFired=lab.input;shots++;lab.visual.updateWorldMatrix(true,true);const from=lab.visual.localToWorld(source.muzzle.clone()),direction=new T.Vector3(0,0,-1).transformDirection(lab.visual.matrixWorld),ray=new T.Raycaster(from,direction,0,10);targets.updateMatrixWorld(true);const hit=ray.intersectObjects(targets.children,true)[0];if(hit)hits++;tracer.geometry.setFromPoints([from,hit?.point??from.clone().addScaledVector(direction,5)]);tracer.visible=true;flashUntil=now+90;$('gunScore').textContent=shots+' shots · '+hits+' hits';}
  }
  if(now>flashUntil)tracer.visible=false;
 };
 return lab;
}
