import * as THREE from 'three';
const chains=[['Thumb',1],['Index',5],['Middle',9],['Ring',13],['Pinky',17]];
const scene=new THREE.Scene();scene.background=new THREE.Color('#182633');
scene.add(new THREE.HemisphereLight(0xffffff,0x34465b,2));
const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(1,3,-2);scene.add(light);
const viewer=new THREE.PerspectiveCamera(40,1,.01,30);viewer.position.set(0,1.45,-1.3);viewer.lookAt(0,1.38,-.2);viewer.layers.enable(1);
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#view'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
function resize(){const c=renderer.domElement;renderer.setSize(c.clientWidth,c.clientHeight,false);viewer.aspect=c.clientWidth/c.clientHeight;viewer.updateProjectionMatrix();}addEventListener('resize',resize);resize();
const cam=new THREE.PerspectiveCamera();cam.position.set(0,1.65,0);scene.add(cam);
const makeHand=right=>({visible:true,right,points:Array.from({length:21},()=>new THREE.Vector3()),group:new THREE.Group(),override:null});
const right=makeHand(true),left=makeHand(false);scene.add(right.group,left.group);
const ident=new THREE.Matrix4(), axis=new THREE.Vector3(1,0,0), orientation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
// Synthetic landmarks use the model's measured rest lengths, with independent proximal/middle/distal rotations.
function poseHand(rig,hand,pose,amount=1){
 const S=hand.right?'R':'L',rest=rig.rest,origin=rest[`${S}Hand`].world;
 const bendAxis=rest[`${S}Index1`].world.clone().sub(rest[`${S}Pinky1`].world).normalize();
 hand.points[0].set(hand.right?.24:-.24,1.27,-.30);
 for(const [name,a] of chains){
  const p=rest[`${S}${name}1`].world.clone().sub(origin).applyQuaternion(orientation).add(hand.points[0]);hand.points[a].copy(p);
  let angle=0;
  for(let k=1;k<=3;k++){
   const here=rest[`${S}${name}${k}`].world, next=rest[`${S}${name}${k+1}`]?.world;
   const d=next?next.clone().sub(here):here.clone().sub(rest[`${S}${name}${k-1}`].world).multiplyScalar(.8);
   const curl=pose==='fist'||pose==='single'&&name==='Index'||pose==='pinch'&&['Thumb','Index'].includes(name);
   if(curl)angle+=(k===1?.65:k===2?1.05:.75)*amount;
   d.applyAxisAngle(bendAxis,angle);
   if(pose==='spread')d.applyAxisAngle(new THREE.Vector3(0,0,1),(['Thumb','Index','Middle','Ring','Pinky'].indexOf(name)-2)*.13*amount);
   d.applyQuaternion(orientation);hand.points[a+k].copy(hand.points[a+k-1]).add(d);
  }
 }
}
function errors(body){let worst=0,wrist=0;
 for(const hand of [right,left]){if(!hand.visible)continue;const S=hand.right?'R':'L';wrist=Math.max(wrist,body.rig.joints[`${S}Hand`].getWorldPosition(new THREE.Vector3()).distanceTo(hand.points[0]));
 for(const [name,a] of chains)for(let k=1;k<=3;k++){
 const rest=body.rig.rest,here=rest[`${S}${name}${k}`].world,next=rest[`${S}${name}${k+1}`]?.world;
 const dir=next?next.clone().sub(here):here.clone().sub(rest[`${S}${name}${k-1}`].world);
 dir.transformDirection(body.rig.joints[`${S}${name}${k}`].matrixWorld);
 const target=hand.points[a+k].clone().sub(hand.points[a+k-1]);worst=Math.max(worst,dir.angleTo(target)*180/Math.PI);
 }}return {maxFingerDegrees:+worst.toFixed(4),maxWristMM:+(wrist*1000).toFixed(2)};}
async function check(label,path){
 const {setupBody}=await import(path);const body=setupBody({scene,camera:cam,handModel:right,handModelL:left,video:null});await body.rig.ready;
 const exported=[];
 const cases={};for(const pose of ['open','fist','spread','pinch','single']){poseHand(body.rig,right,pose);poseHand(body.rig,left,pose);body.update(1/60,performance.now(),{});cases[pose]=errors(body);
 if(label==='v90')exported.push({pose,root:body.rig.root.matrix.toArray(),joints:Object.fromEntries(Object.entries(body.rig.joints).map(([n,j])=>[n,j.matrix.toArray()]))});
 }
 if(label==='v90')document.querySelector('#blenderPoses').textContent=JSON.stringify(exported);
 // Check loss and reacquisition without altering the next pose, and calibration on an already bent hand.
 right.visible=left.visible=false;body.update(1/60,performance.now(),{});right.visible=left.visible=true;
 poseHand(body.rig,right,'open');poseHand(body.rig,left,'open');body.update(1/60,performance.now(),{});cases.reacquired=errors(body);
 if(label==='v90'){
  const heading=.35;
  for(const hand of [right,left]){poseHand(body.rig,hand,'fist');for(const p of hand.points)p.sub(cam.position).applyAxisAngle(new THREE.Vector3(0,1,0),heading).add(cam.position);}
  body.update(1/60,performance.now(),{heading,look:.2,lookPitch:.15,head:{pose:{physicalRoll:.1}}});cases.turnedHead=errors(body);
  // Return to the neutral scene after checking moving ancestors of the hand.
  body.update(1/60,performance.now(),{heading:0,look:0,lookPitch:0,head:{pose:{physicalRoll:0}}});
 }
 if(label==='v90'){body.recenter();poseHand(body.rig,right,'fist');poseHand(body.rig,left,'fist');body.update(1/60,performance.now(),{});cases.calibratedFist=errors(body);}
 let matrixUpdates=0;const original=THREE.Object3D.prototype.updateMatrix;
 THREE.Object3D.prototype.updateMatrix=function(){matrixUpdates++;return original.call(this);};
 for(let i=0;i<100;i++)body.update(1/60,i*16.67,{});
 matrixUpdates=0;const started=performance.now();for(let i=0;i<1000;i++)body.update(1/60,i*16.67,{});
 const updateMs=(performance.now()-started)/1000;THREE.Object3D.prototype.updateMatrix=original;
 const attachmentsFixed=Object.entries(body.rig.joints).filter(([n])=>/^[LR](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(n)).every(([n,j])=>{
  const parent=body.rig.report.joints[n].parent;
  const expected=body.rig.rest[n].world.clone().sub(body.rig.rest[parent].world);
  return j.position.distanceTo(expected)<1e-8&&j.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-8;
 });
 const result={label,attachmentsFixed,cases,updateMs:+updateMs.toFixed(4),matrixUpdatesPerFrame:matrixUpdates/1000};
 if(label!=='v90'){body.rig.root.removeFromParent();document.querySelector('#bodyBox')?.remove();}return {body,result};
}
try{
 const results=[];
 if(new URLSearchParams(location.search).has('compare'))for(const v of [76,80,88]){const {result}=await check('v'+v,`../../../baseline-v${v}/docs/movement/doll-body.mjs`);results.push(result);}
 const {body,result}=await check('v90','./doll-body.mjs?v=90');results.push(result);
 const pass=result.attachmentsFixed&&Object.values(result.cases).every(c=>c.maxFingerDegrees<.01&&c.maxWristMM<5);
 document.querySelector('#results').textContent=(pass?'PASS':'FAIL')+' — all 30 finger segments on both hands\n'+JSON.stringify(results,null,2);
 let photoMode=false;document.querySelector("#pose").onchange=()=>{photoMode=false;right.right=true;left.visible=true;body.recenter();viewer.position.set(0,1.45,-1.3);viewer.lookAt(0,1.38,-.2);};
 let animation=false;document.querySelector('#animate').onclick=()=>{photoMode=false;right.right=true;left.visible=true;body.recenter();viewer.position.set(0,1.45,-1.3);viewer.lookAt(0,1.38,-.2);animation=!animation;};
 let last=0;function frame(now){requestAnimationFrame(frame);if(now-last<16)return;last=now;
 const pose=animation?'fist':document.querySelector('#pose').value,amount=animation?(Math.sin(now*.003)+1)/2:1;
 if(!photoMode){poseHand(body.rig,right,pose,amount);poseHand(body.rig,left,pose,amount);}body.update(1/60,now,{});renderer.render(scene,viewer);}
 document.querySelector('#photos').onclick=async()=>{
  photoMode=true;animation=false;left.visible=false;
  const out=document.querySelector('#photoResults'),photo=document.querySelector('#trackingPhoto');out.textContent='Loading hand tracker…';photo.style.display='block';
  const worker=new Worker(new URL('./tracker.mjs?v=90',import.meta.url),{type:'module'});
  const request=data=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Tracker timeout')),45000);worker.onmessage=({data:r})=>{clearTimeout(timeout);if(r.type==='error')reject(Error(r.message));else resolve(r);};worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};worker.postMessage(data,data.bitmap?[data.bitmap]:[]);});
  let source;
  try{
   const {makeHandModel}=await import('./hand-model.mjs?v=90');source=makeHandModel(cam,false);source.drawMesh=false;
   await request({type:'init'});const checks=[];
   for(const name of ['count5.png','user_fist.jpg','raised_fist.jpg','peace.jpg','thumbs_up1.jpg']){
    photo.src=new URL('../test/'+name,import.meta.url);await photo.decode();
    let r;for(let attempt=0;attempt<4;attempt++){r=await request({type:'frame',bitmap:await createImageBitmap(photo),time:performance.now()});if(r.landmarks?.length)break;}
    if(!r.landmarks?.length){checks.push({photo:name,detected:false});continue;}
    source.hide();body.recenter();for(let settle=0;settle<5;settle++)source.update(r.landmarks[0],r.worldLandmarks[0],photo.naturalWidth,photo.naturalHeight);
    source.group.updateWorldMatrix(true,false);right.right=source.right;right.visible=source.visible;
    for(let i=0;i<21;i++)right.points[i].copy(source.points[i]).applyMatrix4(source.group.matrixWorld);
    body.update(1/60,performance.now(),{});checks.push({photo:name,detected:true,...errors(body)});
    const exported=JSON.parse(document.querySelector('#blenderPoses').textContent);
    exported.push({pose:'photo_'+name.split('.')[0],side:right.right?'R':'L',root:body.rig.root.matrix.toArray(),joints:Object.fromEntries(Object.entries(body.rig.joints).map(([n,j])=>[n,j.matrix.toArray()]))});
    document.querySelector('#blenderPoses').textContent=JSON.stringify(exported);
   }
   viewer.position.copy(right.points[9]).add(new THREE.Vector3(0,.06,-.6));viewer.lookAt(right.points[9]);
   out.textContent=(checks.every(r=>r.detected&&r.maxFingerDegrees<.01)?'PASS':'CHECK')+' — tracker → v80 hand placement → v90 doll\n'+JSON.stringify(checks,null,2);
  }catch(e){out.textContent='FAIL: '+e.message;}finally{worker.terminate();source?.group.removeFromParent();}
 };
 requestAnimationFrame(frame);
}catch(error){document.querySelector('#results').textContent='FAIL: '+error.stack;}
