import {rearPlaneCorrection} from './neck-sweep.mjs?v=touch2.4.10-final';
import {palmObservation,PalmSweepDepth} from './palm-sweep-depth.mjs?v=touch2.4.10-final';
const palmDepth=new PalmSweepDepth();
import {TrackingJitter} from './tracking-jitter.mjs?v=touch2.4.10-final';
const trackingJitter=new TrackingJitter();
import {OuterCollision} from './outer-collision.mjs?v=touch2.4.10-final';
import {HandContactAssist} from './hand-contact-assist.mjs?v=touch2.4.10-final';
import {installExperiment} from './experiment.mjs?v=touch2.4.10-final';
let depthExperiment=null;
import {imagePalmSize,sizeDepth,wallShift} from './size-wall-depth.mjs?v=alien18.4';
import {palmSize} from './palm-distance.mjs?v=alien13';
import {createRoom} from './room.mjs?v=demo9';
import {supportedContact} from './surface-contact.mjs?v=demo9';
import {fitHeadGrip} from './head-grip.mjs?v=demo9';
import {startTracking,defaults as trackingDefaults} from './tracking-session.mjs?v=alien18.4';
import {installCombinedUI} from './combined-ui.mjs?v=touch2.4.10-final';
import {CombinedHead} from './head-model.mjs?v=touch2.4.10-final';
import {directDriver} from './direct.mjs?v=touch2.4.10-final';
import {reduceFalseDepthBends} from './depth-lines.mjs?v=touch2.4.10-final';
import {cameraFrame,cameraUV,cameraPosition,fitPalmDepth,liftCameraLandmarks} from './projection.mjs?v=8-final';
import {buildTips,tipWorld,fitPinch,fitThumb} from './contact.mjs?v=8-final';
import {FIST,AngleLimiter,alignment,poseAlignment,ClosureTracker,thumbFistWeight,thumbContact,closure,referencePose,Settler,depthEstimate,positionAt,straightJoints,pinchDistance} from './motion.mjs?v=8-final';
import {receivePhone} from './video-link.mjs?v=shared-phone1';
import * as THREE from 'three';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/controls/OrbitControls.js';
import {DollRig} from '../doll/DollRig.js?v=hand-lab-1';
import {FINGERS,JOINTS,blankAngles,emptyProfile,features,matchPose,clampAngles,validateProfile,lockedAxis,constrainJoint,constrainAngles,directionAngles} from './profile.mjs?v=8-final';
const $=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x)),RAD=Math.PI/180,KEY='hand-lines-experimental-v1';
let profile=emptyProfile();try{const saved=localStorage.getItem(KEY);if(saved)profile=validateProfile(JSON.parse(saved));}catch{$('notice').textContent='Saved profile could not be read. Import your JSON backup to recover it.';}
let lastStatsTime=0,lastPreviewTime=-Infinity,combined=null,liveSession=null,getCombinedOptions=()=>trackingDefaults,trackingStats=null;
let captureAspect=4/3;let allHands=[];const recentHands=new Map(),depthStates={},distanceGains={};let closePhone=null,tips=null,straight={},pinching=false,pinchFinger=null,contactHold=null,contactAngles=null;const tipDots={};let thumbGap=null;
let side='R',selected='Index1',editing=false,latest=null,editBase=null,frozenFeature=null,frozenCapture=null,savedId=null,angles=blankAngles(),epoch=0,stream=null,phoneActive=false,phoneFrame=document.createElement('canvas'),worker=null,workerReady=null,request=null,inflight=false,lastVideo=-1,sampleSource=null;
let neutralSplay=profile.calibration.neutralSplay;
const closureState=new ClosureTracker();let thumbReference=0;let curls=[0,0,0,0],posePreview=false,depthScale=profile.calibration.depthScale,lastDepth=null,lastTracking=0;
const filters=Object.fromEntries(JOINTS.map(n=>[n,new Settler()])),positionFilter=new Settler(),curlFilter=new Settler(),thumbFilters=Object.fromEntries(['Thumb1','Thumb2','Thumb3'].map(n=>[n,new Settler()]));
const finalFilters=Object.fromEntries(JOINTS.map(n=>[n,new AngleLimiter()]));let displayedAngles=null;
let smoothPalmQ=null,previousPalmQ=null,heldPalmQ=null,palmQuiet=0;
const palmQ=new THREE.Quaternion(),frozenPalm=new THREE.Quaternion(),basisCache={},jointDots={};
const notice=t=>$('notice').textContent=t;
const scene=new THREE.Scene();scene.background=new THREE.Color('#182331');
const perspectiveCamera=new THREE.PerspectiveCamera(60,1,.01,20),orthographicCamera=new THREE.OrthographicCamera(-.5,.5,.5,-.5,.01,20);let camera=perspectiveCamera;
const room=new THREE.Group();scene.add(room);

const renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.12;controls.maxDistance=1.4;
scene.add(new THREE.HemisphereLight(0xffffff,0x526980,2));const lamp=new THREE.DirectionalLight(0xffffff,2);lamp.position.set(1,2,1);scene.add(lamp);
const rig=new DollRig(scene,{url:new URL('../doll.glb?v=hand-lab-1',import.meta.url).href,report:new URL('../doll-report.json?v=hand-lab-1',import.meta.url).href,headLayer:false});
const markerGroup=new THREE.Group();scene.add(markerGroup);
const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(5*4*2*3),3));const modelLines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({color:0x8ee3bf,depthTest:false,transparent:true,opacity:.85}));modelLines.frustumCulled=false;modelLines.renderOrder=99;scene.add(modelLines);
const gizmo=new THREE.Group();scene.add(gizmo);
for(const [dir,color] of [[new THREE.Vector3(1,0,0),0xff676e],[new THREE.Vector3(0,1,0),0x61e599],[new THREE.Vector3(0,0,1),0x669eff]])gizmo.add(new THREE.ArrowHelper(dir,new THREE.Vector3(),.043,color,.009,.005));
function resize(){const c=$('scene');renderer.setSize(c.clientWidth,c.clientHeight,false);camera.aspect=c.clientWidth/c.clientHeight;if(camera.isOrthographicCamera){camera.left=-.5*camera.aspect;camera.right=.5*camera.aspect;camera.top=.5;camera.bottom=-.5;}camera.updateProjectionMatrix();updateCameraFrame();}new ResizeObserver(resize).observe($('scene'));
function updateCameraFrame(){const f=cameraFrame(captureAspect,camera.aspect),guide=$('cameraFrame');guide.style.width=(100*f.width)+'%';guide.style.height=(100*f.height)+'%';guide.hidden=!$('spatial').checked;}
function placeFromCamera(dt){if(!$('spatial').checked||editing||!latest)return;const lm=latest.landmarks,uv=cameraUV(lm[0],captureAspect,camera.aspect),q=rig.joints[side+'Hand'].quaternion,samples=[['Index1',5],['Middle1',9],['Ring1',13],['Pinky1',17]].map(([n,i])=>({uv:cameraUV(lm[i],captureAspect,camera.aspect),offset:rig.rest[side+n].world.clone().sub(rig.rest[side+'Hand'].world).applyQuaternion(q).toArray()}));
 const desired=fitPalmDepth(uv,samples,camera.aspect,lastDepth||.5),depth=positionFilter.step([desired],dt,.002)[0],pos=cameraPosition(uv,depth,camera.aspect);rig.root.position.fromArray(pos).sub(rig.rest[side+'Hand'].world);rig.root.updateMatrixWorld(true);
 $('spatialState').textContent='Camera-aligned wrist · distance estimate '+((lastDepth||depth)*depthScale).toFixed(2)+' m · matches the frame outline';
}
function frameBasis(wrist,index,middle,pinky){const y=middle.clone().sub(wrist).normalize(),x=index.clone().sub(pinky);x.addScaledVector(y,-x.dot(y)).normalize();const z=new THREE.Vector3().crossVectors(x,y).normalize();return new THREE.Matrix4().makeBasis(x,y,z);}
function restBasis(S){const r=rig.rest;return frameBasis(r[S+'Hand'].world,r[S+'Index1'].world,r[S+'Middle1'].world,r[S+'Pinky1'].world);}
function jointBasis(n){const key=side+n;if(basisCache[key])return basisCache[key];const r=rig.rest,k=+n.slice(-1),finger=n.slice(0,-1),here=r[key].world;
 const z=(k<3?r[side+finger+(k+1)].world.clone().sub(here):here.clone().sub(r[side+finger+(k-1)].world)).normalize();
 const x=r[side+'Index1'].world.clone().sub(r[side+'Pinky1'].world);x.addScaledVector(z,-x.dot(z)).normalize();const y=new THREE.Vector3().crossVectors(z,x).normalize();
 return basisCache[key]=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
const cheekOffsets={},renderedHands={},sizeReferences={};
const landmarkFilters={},filteredFrames={};
let modelPalmSpan=null,lastWallZ=-.6,headWallCorners=null;
const wallBox=new THREE.Box3();
function headBackWall(){
 if(!combined?.loaded||!combined.group.visible)return lastWallZ;
 const bone=combined.bones.head;bone.updateWorldMatrix(true,false);
 if(!headWallCorners){
  const box=new THREE.Box3(),inverse=bone.matrixWorld.clone().invert();
  for(const sample of combined.contactSamples||[])if(sample.region==='head')box.expandByPoint(sample.mesh.getVertexPosition(sample.i,new THREE.Vector3()).applyMatrix4(sample.mesh.matrixWorld).applyMatrix4(inverse));
  if(box.isEmpty())return lastWallZ;
  headWallCorners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])headWallCorners.push(new THREE.Vector3(x,y,z));
 }
 lastWallZ=Math.min(...headWallCorners.map(p=>p.clone().applyMatrix4(bone.matrixWorld).z));return lastWallZ;
}
// Sweep placement is independent of head sliders and live head movement.
// Head contact is an explicit optional collision pass, never a depth wall.
function keepHandBeforeWall(S,result){result.wallClearance=0;result.wallLimited=false;return result;}
const relaxedStates={};
function relaxedPoints(points,S,q,dt){
 const o=getCombinedOptions(),range=(o.contactThreshold||0)/100,state=relaxedStates[S]??={amount:0,q:q.clone()};
 if(o.relaxedPalm&&range&&!depthExperiment?.recording)headBackWall(); // bounds only; never translates a hand
 let near=false;if(!depthExperiment?.recording&&o.relaxedPalm&&range&&combined?.group.visible&&headWallCorners){const box=new THREE.Box3().setFromPoints(headWallCorners.map(p=>p.clone().applyMatrix4(combined.bones.head.matrixWorld)));near=points.some(p=>box.distanceToPoint(p)<range);}
 state.amount+=((near?1:0)-state.amount)*(1-Math.exp(-Math.min(dt,.1)/.12));if(state.amount<.001)return points;
 state.q.slerp(q,1-Math.exp(-Math.min(dt,.1)/.06));q.slerp(state.q,state.amount);
 const p=points.map(v=>v.clone());for(let f=0;f<5;f++)for(let k=1;k<=3;k++){const id=1+4*f+k-1,name=S+FINGERS[f]+k,rest=k<3?rig.rest[S+FINGERS[f]+(k+1)].world.clone().sub(rig.rest[name].world):tips[S+FINGERS[f]].clone(),length=points[id+1].distanceTo(points[id]),direction=points[id+1].clone().sub(points[id]).normalize().lerp(rest.normalize().applyQuaternion(q),state.amount).normalize();p[id+1].copy(p[id]).addScaledVector(direction,length);}
 return p;
}
const outerCollision=new OuterCollision(),contactAssist=new HandContactAssist();
function shiftRenderedHand(S,delta){
 const result=renderedHands[S]?.result;if(!result)return;
 const hand=rig.joints[S+'Hand'],target=hand.getWorldPosition(new THREE.Vector3()).add(delta);
 hand.position.copy(hand.parent.worldToLocal(target));hand.updateWorldMatrix(false,true);
 for(const point of result.points)point.add(delta);result.wallClearance+=delta.z;
 if(interactionShifts[S])interactionShifts[S].add(delta);
}
const interactionShifts={L:new THREE.Vector3(),R:new THREE.Vector3()};
function applyHandInteractions(now){
 interactionShifts.L.set(0,0,0);interactionShifts.R.set(0,0,0);
 const options=getCombinedOptions(),status=$('handContactStatus');
 if(!options.handsTouch&&!options.outerCollision&&!options.headCollision){contactAssist.reset();if(status.textContent!=='Contact assistance and outer collisions off.')status.textContent='Contact assistance and outer collisions off.';return;}
 if(depthExperiment?.recording){contactAssist.reset();status.textContent='Recording: contact and collision corrections paused.';return;}
 const packet=label=>{const h=allHands.find(h=>h.label===label),r=renderedHands[label==='Left'?'L':'R'];return h&&r?{...h,seen:h.seen,lm:h.landmarks,points:r.result.points.map(p=>p.toArray())}:null;};
 const left=packet('Left'),right=packet('Right');
 const fit=contactAssist.update({left,right,aspect:captureAspect,now,enabled:options.handsTouch&&!editing,rangePercent:options.touchRange,confirmMs:options.touchConfirm,maxSideChange:options.touchSideLimit/100,indexOnly:!!$('indexContactOnly')?.checked,assumeIndexContact:false});
 if(fit){shiftRenderedHand('L',new THREE.Vector3().fromArray(fit.A));shiftRenderedHand('R',new THREE.Vector3().fromArray(fit.B));}
 if(options.outerCollision||options.headCollision){
  const visible={L:!!left&&rig.parts.some(m=>m.name.startsWith('LHand')&&m.visible),R:!!right&&rig.parts.some(m=>m.name.startsWith('RHand')&&m.visible)};
  outerCollision.resolve(combined,rig,visible,shiftRenderedHand,!!fit,+$('fingerThickness').value+':'+$('tipInset').value+':'+visible.L+':'+visible.R,{head:options.headCollision,hands:options.outerCollision});
 }
 const gap=fit?new THREE.Vector3().fromArray(fit.pair.a).add(interactionShifts.L).distanceTo(new THREE.Vector3().fromArray(fit.pair.b).add(interactionShifts.R)):null;
 status.textContent=fit?'Contact corrected; model contact-point gap '+(gap*1000).toFixed(1)+' mm'+(gap>fit.pair.surfaceGap+.003?' — outer collision separation prevents this pair closing.':'.')+' Sweep calibration unchanged.':contactAssist.status;
 if(options.outerCollision||options.headCollision)status.textContent+=' Outer collisions ON: '+outerCollision.last.head+' head / '+outerCollision.last.hands+' hand corrections.';
}
function cameraPoints(world,lm){const points=rawSizePoints(world,lm);return $('falseDepth')?.checked?reduceFalseDepthBends(points,lm,$('preview').width,$('preview').height,!camera.isOrthographicCamera):points;}
function rawSizePoints(world,lm){
 if(!modelPalmSpan){const spans=[];for(const S of ['R','L'])for(const [a,b] of [['Hand','Index1'],['Hand','Middle1'],['Hand','Ring1'],['Hand','Pinky1'],['Index1','Pinky1']])spans.push(rig.rest[S+a].world.distanceTo(rig.rest[S+b].world));spans.sort((a,b)=>a-b);modelPalmSpan=(spans[4]+spans[5])/2;}
 const size=imagePalmSize(lm,captureAspect),frame=cameraFrame(captureAspect,camera.aspect),focal=1/(2*Math.tan(Math.PI/6)*frame.height);
 const baseDepth=sizeDepth(size,{size:modelPalmSpan*focal,depth:1},depthStates[side]?.depth||.5),depth=baseDepth;depthStates[side]={depth};
 const length=rig.rest[side+'Middle1'].world.distanceTo(rig.rest[side+'Hand'].world),observed=Math.max(.01,Math.hypot(world[9].x-world[0].x,world[9].y-world[0].y,world[9].z-world[0].z));
 // Relative MediaPipe Z still describes finger articulation, never root distance.
 return liftCameraLandmarks(lm,world,captureAspect,camera.aspect,Math.max(.04,depth+(getCombinedOptions().handDistance||0)/100),length/observed).map(p=>new THREE.Vector3().fromArray(p).add(new THREE.Vector3(0,(getCombinedOptions().handHeight||0)/100,0)));
}
function solveRaw(world,lm){const pts=cameraPoints(world,lm);
 palmQ.setFromRotationMatrix(frameBasis(pts[0],pts[5],pts[9],pts[17]).multiply(restBasis(side).invert()));
 const hand=rig.joints[side+'Hand'];hand.quaternion.copy(palmQ);rig.root.updateMatrixWorld(true);const result=blankAngles();
 for(const [f,fi] of FINGERS.map((f,i)=>[f,i]))for(let k=1;k<=3;k++){
  const n=f+k,j=rig.joints[side+n],a=1+fi*4+k-1,b=a+1;rig.refresh(j);
  const dir=pts[b].clone().sub(pts[a]);if(dir.lengthSq()<1e-10)continue;
  dir.applyQuaternion(j.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
  const qb=jointBasis(n);dir.applyQuaternion(qb.clone().invert());
  result[n]=constrainJoint(n,directionAngles(n,dir.toArray(),angles[n][0]),profile.limits[side][n]);
  j.quaternion.copy(qb).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...result[n].map((v,i)=>(v+currentAlignment(n)[i])*RAD),'XYZ'))).multiply(qb.clone().invert());rig.refresh(j);

 }
 return result;
}
function stabilizePalm(dt){const tolerance=(+$('stability').value)*RAD;if(!smoothPalmQ){smoothPalmQ=palmQ.clone();previousPalmQ=palmQ.clone();return;}if(heldPalmQ&&palmQ.angleTo(heldPalmQ)<=tolerance*2.5){palmQ.copy(heldPalmQ);return;}heldPalmQ=null;palmQuiet=tolerance>0&&palmQ.angleTo(previousPalmQ)<tolerance?palmQuiet+dt:0;previousPalmQ.copy(palmQ);smoothPalmQ.slerp(palmQ,1-Math.exp(-dt/(smoothPalmQ.angleTo(palmQ)>.12?.025:.08)));if(palmQuiet>.3)heldPalmQ=smoothPalmQ.clone();palmQ.copy(smoothPalmQ);}
function currentAlignment(n){const a=poseAlignment(n,posePreview?1:$('reference').checked?thumbReference:0);return contactHold&&n.startsWith('Thumb')?a.map((v,i)=>lockedAxis(n,i)?contactHold.angles[n][i]:v):a;}
function modelAngles(n){if(posePreview)return FIST[n];const fixed=currentAlignment(n);if(contactAngles)return contactAngles[n].map((v,i)=>lockedAxis(n,i)?fixed[i]:v);const v=angles[n].map((x,i)=>x+fixed[i]);if(n.startsWith('Thumb')&&$('reference').checked){const t=thumbReference;v[0]=v[0]*(1-t)+FIST[n][0]*t;for(let i=1;i<3;i++)v[i]=fixed[i]+(lockedAxis(n,i)?0:angles[n][i]*(1-t));}return v;}

function applyAngles(renderDt=null){if(!rig.loaded)return;angles=constrainAngles(angles,profile.limits[side]);rig.joints[side+'Hand'].quaternion.copy(editing?frozenPalm:($('follow').checked||$('spatial').checked)?palmQ:new THREE.Quaternion());
 for(const n of JOINTS){const qb=jointBasis(n);let v=modelAngles(n);
 if(renderDt!==null){v=editing||(!stream&&!phoneActive)?finalFilters[n].seed(v):finalFilters[n].step(v,renderDt,pinching&&(n.startsWith('Thumb')||n.startsWith(pinchFinger))?0:+$('changeThreshold').value,+$('changeSpeed').value);v=v.map((x,i)=>lockedAxis(n,i)&&!n.startsWith('Thumb')?currentAlignment(n)[i]:x);(displayedAngles??={})[n]=[...v];}
rig.joints[side+n].quaternion.copy(qb).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...v.map(x=>x*RAD),'XYZ'))).multiply(qb.clone().invert());}
 rig.root.updateMatrixWorld(true);
}
function configureSide(){contactHold=null;pinchFinger=null;pinching=false;closureState.reset();thumbReference=0;displayedAngles=null;for(const f of Object.values(finalFilters))f.reset();for(const f of Object.values(thumbFilters))f.reset();for(const f of Object.values(filters))f.reset();positionFilter.reset();curlFilter.reset();smoothPalmQ=previousPalmQ=heldPalmQ=null;palmQuiet=0;for(const m of rig.parts)m.visible=!m.userData.hiddenThumbBase&&m.name.startsWith(side)&&/^(R|L)(Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name);angles=blankAngles();palmQ.identity();frozenPalm.identity();applyAngles();resetView();renderControls();}
function resetView(){if(!rig.loaded)return;updateCameraFrame();room.visible=$('spatial').checked;controls.enabled=!$('spatial').checked;if($('spatial').checked){camera.fov=60;camera.up.set(0,1,0);camera.position.set(0,0,0);controls.target.set(0,0,-1);camera.lookAt(controls.target);camera.updateProjectionMatrix();if(!latest&&!editing){palmQ.setFromRotationMatrix(restBasis(side).invert());rig.joints[side+'Hand'].quaternion.copy(palmQ);rig.root.position.copy(rig.rest[side+'Hand'].world).negate().add(new THREE.Vector3(0,-.1,-.5));}return;}rig.root.position.set(0,0,0);camera.fov=38;camera.updateProjectionMatrix();const r=rig.rest,w=r[side+'Hand'].world,m=r[side+'Middle1'].world,b=restBasis(side),normal=new THREE.Vector3().setFromMatrixColumn(b,2);
 const q=rig.joints[side+'Hand'].getWorldQuaternion(new THREE.Quaternion()),along=m.clone().sub(w).applyQuaternion(q);normal.applyQuaternion(q);controls.target.copy(w).addScaledVector(along,.7);camera.up.copy(along).normalize();camera.position.copy(controls.target).addScaledVector(normal,.42);controls.update();}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(profile));return true;}catch{notice('Browser storage is full or unavailable. Your work is still open — export JSON now.');return false;}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);}
function updateMode(){for(const id of ['save','undo','zero','saveLimits','clearLimits','resume'])$(id).disabled=!editing;$('edit').disabled=editing||!latest;$('side').disabled=editing;$('detected').disabled=editing;$('follow').disabled=editing||$('spatial').checked;if($('spatial').checked)$('follow').checked=true;
 $('mode').textContent=editing?'FROZEN / EDITING':stream||phoneActive?'LIVE CAMERA':latest?'IMAGE PREVIEW':'LIVE PREVIEW';$('editHelp').textContent=editing?'Edit the selected joint. Saved corrections affect the fingers, not the wrist.':'Values are movement relative to your saved alignment. Locked sideways and twist read zero.';renderControls();}
function drawPreview(source,landmarks){if(stream&&$('video').readyState>=2)source=$('video');const previewRate=stream?60:(getCombinedOptions().overlayRate||30);if(performance.now()-lastPreviewTime<1000/previewRate&&!sampleSource)return;lastPreviewTime=performance.now();const aspect=(source.videoWidth||source.width||source.naturalWidth)/(source.videoHeight||source.height||source.naturalHeight);if(aspect!==captureAspect){captureAspect=aspect;updateCameraFrame();}const c=$('preview'),previewWidth=Math.min(1920,source.videoWidth||source.width||source.naturalWidth),previewHeight=Math.max(1,Math.round(previewWidth/aspect));if(c.width!==previewWidth)c.width=previewWidth;if(c.height!==previewHeight)c.height=previewHeight;const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);
 combined?.overlay(ctx,c.width,c.height);if(!getCombinedOptions().overlayRate||!landmarks)return;for(const current of ($('bothHands').checked&&allHands.length?allHands.map(h=>h.landmarks):[landmarks])){landmarks=current;ctx.lineWidth=2;ctx.strokeStyle='#86edbb';ctx.fillStyle='#f0ffee';const point=i=>[(1-landmarks[i].x)*c.width,landmarks[i].y*c.height];
 for(let f=0;f<5;f++){let prev=0;for(let j=1;j<=4;j++){const idx=1+f*4+j-1;ctx.beginPath();ctx.moveTo(...point(prev));ctx.lineTo(...point(idx));ctx.stroke();prev=idx;}}
 for(let i=0;i<21;i++){ctx.beginPath();ctx.arc(...point(i),i%4===0?4:2.5,0,Math.PI*2);ctx.fill();}
}
}
function ensureWorker(){if(workerReady)return workerReady;worker=new Worker(new URL('./tracker.mjs?v=alien18.4&task=hands&delegate=GPU',import.meta.url),{type:'module'});
 workerReady=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Tracker loading timed out')),45000);worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);resolve();return;}if(data.type==='error'){if(request){request.reject(Error(data.message));request=null;}else{clearTimeout(timer);reject(Error(data.message));}return;}if(request&&data.type==='result'){request.resolve(data);request=null;}};worker.onerror=e=>{clearTimeout(timer);if(request){request.reject(Error(e.message));request=null;}reject(Error(e.message));};worker.postMessage({type:'init'});});return workerReady;}
async function detectAuxFrame(frame,time,task){
 const bitmap=await createImageBitmap(frame),w=new Worker(new URL('./tracker.mjs?v=alien18.4&task='+task+'&delegate=GPU',import.meta.url),{type:'module'});
 let sent=false;
 try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Face image tracker timed out')),60000);const finish=(f,v)=>{clearTimeout(timer);f(v);};w.onerror=e=>finish(reject,Error(e.message));w.onmessage=({data})=>{if(data.type==='ready'){sent=true;w.postMessage({type:'frame',bitmap,time},[bitmap]);}else if(data.type==='result')finish(resolve,data);else if(data.type==='error')finish(reject,Error(data.message));};w.postMessage({type:'init'});});}finally{if(!sent)bitmap.close();w.terminate();}
}
async function detect(source){if(inflight||editing)return;inflight=true;const token=epoch;
 try{await ensureWorker();if(token!==epoch||editing)return;const frame=document.createElement('canvas'),w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;if(!w||!h)return;
 frame.width=480;frame.height=Math.round(h/w*480);frame.getContext('2d').drawImage(source,0,0,frame.width,frame.height);const bitmap=await createImageBitmap(frame);if(token!==epoch||editing){bitmap.close();return;}
 const data=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{request=null;reject(Error('Tracker response timed out'));},10000);request={resolve:d=>{clearTimeout(timer);resolve(d);},reject:e=>{clearTimeout(timer);reject(e);}};worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);});
 const auxiliary=await Promise.all(['face','pose'].map(task=>detectAuxFrame(frame,data.time,task)));if(token!==epoch)return;for(const result of auxiliary)combined.receive(result);acceptTracking(data,frame,token);
 }catch(e){notice(e.message);}finally{inflight=false;}
}
function acceptTracking(data,frame,token=epoch){if($('reduceShake')?.checked)data=trackingJitter.filter(data);
 if(diagnostic){diagnostic.frames.push({face:combined?.face,shoulders:combined?.pose,performance:trackingStats,elapsedMs:performance.now()-diagnostic.started,width:frame.width,height:frame.height,inferenceMs:data.inferenceMs,landmarks:data.landmarks,worldLandmarks:data.worldLandmarks,handedness:data.handedness,projection:$('cameraProjection').value,view:$('viewMode').value,contactEnabled:$('tipContact').checked,depthCorrectionEnabled:$('falseDepth').checked});}
 if(token!==epoch||editing)return;const desired=$('detected').value;let idx=desired==='first'?0:data.handedness?.findIndex(h=>h[0]?.categoryName===desired);
 if(desired==='first'&&latest&&data.landmarks?.length>1){let best=Infinity;data.landmarks.forEach((points,i)=>{const d=Math.hypot(points[0].x-latest.landmarks[0].x,points[0].y-latest.landmarks[0].y);if(d<best){best=d;idx=i;}});}

 allHands=(data.landmarks||[]).map((landmarks,i)=>({landmarks,world:data.worldLandmarks?.[i],label:data.handedness?.[i]?.[0]?.categoryName,confidence:data.handedness?.[i]?.[0]?.score??0,time:data.time,seen:performance.now()})).filter(h=>h.world?.length===21).slice(0,2);
 const stamp=performance.now();for(const h of allHands)recentHands.set(h.label,{...h,seen:stamp});
 const grace=+$('trackingGrace').value;for(const [label,h] of recentHands){if(stamp-h.seen>grace)recentHands.delete(label);else if(!allHands.some(v=>v.label===label))allHands.push(h);}allHands=allHands.slice(0,2);
 const primary=allHands.find(h=>h.label===data.handedness?.[idx]?.[0]?.categoryName)||allHands[0];
 const lm=primary?.landmarks,world=primary?.world;drawPreview(frame,lm);
 if(!world||world.length!==21){latest=null;$('captureState').textContent='No selected hand detected. Keep the hand in view.';$('matchState').textContent='No pose matched';updateMode();return;}
 if($('bothHands').checked){const label=primary?.label;if(label==='Left'||label==='Right')side=label==='Left'?'L':'R';}latest={landmarks:lm,world};$('captureState').textContent='Direct lines · '+Math.round(data.inferenceMs)+' ms inference';
 $('edit').disabled=true;$('resume').disabled=true;
}
function stopCamera(){palmDepth.reset();depthExperiment?.cancel();contactAssist.reset();for(const s of ['L','R']){delete relaxedStates[s];}lastWallZ=-.6;for(const key of Object.keys(depthStates))delete depthStates[key];liveSession?.();liveSession=null;combined?.reset();trackingStats=null;if($('liveFps'))$('liveFps').textContent='CAM — FPS\nHAND — · FACE — · BODY —';allHands=[];recentHands.clear();closureState.reset();if(!editing){thumbReference=0;contactAngles=null;}epoch++;straight={};pinching=false;pinchFinger=null;contactHold=null;for(const f of Object.values(thumbFilters))f.reset();lastTracking=0;smoothPalmQ=previousPalmQ=heldPalmQ=null;palmQuiet=0;for(const f of Object.values(filters))f.reset();positionFilter.reset();curlFilter.reset();posePreview=false;closePhone?.();closePhone=null;phoneActive=false;stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;if(!editing){latest=null;updateMode();}$('captureState').textContent=editing?'Frozen frame · camera disconnected':'Camera disconnected';}
async function startCamera(){try{stopCamera();editing=false;sampleSource=null;latest=null;notice('Opening camera…');const id=$('cameraSelect').value;stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(id?{deviceId:{exact:id}}:{}),width:{ideal:640},height:{ideal:480},frameRate:{ideal:+getCombinedOptions().cameraFps}}});$('video').srcObject=stream;await $('video').play();lastVideo=-1;await listCameras();liveSession=startTracking($('video'),(data,frame)=>{if(data.task==='hands')acceptTracking(data,frame);else{combined.receive(data);drawPreview(frame,latest?.landmarks);}},showTrackingStats,getCombinedOptions);notice('Combined DEMO: hands, face and shoulders share this camera. GPU preferred; actual rates below.');updateMode();}catch(e){stopCamera();notice('Camera could not start: '+e.message);}}
async function listCameras(){const current=$('cameraSelect').value,devices=await navigator.mediaDevices.enumerateDevices();$('cameraSelect').replaceChildren(new Option('Default camera',''));for(const d of devices.filter(d=>d.kind==='videoinput'))$('cameraSelect').add(new Option(d.label||'Camera '+($('cameraSelect').options.length),d.deviceId));$('cameraSelect').value=current;}
$('phone').onclick=()=>{stopCamera();editing=false;sampleSource=null;latest=null;updateMode();const token=epoch;try{closePhone=receivePhone(async received=>{liveSession?.();liveSession=null;if(token!==epoch){received.getTracks().forEach(t=>t.stop());return;}try{stream=received;phoneActive=true;$('video').srcObject=received;$('video').muted=true;await $('video').play();if(token!==epoch)return;liveSession=startTracking($('video'),(data,frame)=>{if(data.task==='hands')acceptTracking(data,frame,token);else{combined.receive(data);drawPreview(frame,latest?.landmarks);}},showTrackingStats,getCombinedOptions);notice('PHONE VIDEO → PC TRACKING → PC RENDERING. Phone does not calculate landmarks.');updateMode();}catch(e){stopCamera();notice('Received video could not start: '+e.message);}},notice,message=>{stopCamera();notice(message);});}catch(e){notice(e.message);}};
$('start').onclick=startCamera;$('stop').onclick=stopCamera;
async function loadImage(url){stopCamera();editing=false;latest=null;updateMode();const img=new Image();img.src=url;await img.decode();sampleSource=img;notice('Image input — direct segment tracking.');await detect(img);}
$('sample').onclick=()=>loadImage(new URL('./references/cheek.jpg',import.meta.url).href).catch(e=>notice(e.message));
$('imageInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;const url=URL.createObjectURL(file);try{await loadImage(url);}catch(e){notice(e.message);}finally{URL.revokeObjectURL(url);e.target.value='';}};
$('edit').onclick=()=>{if(!latest||editing)return;epoch++;if(displayedAngles)contactAngles=clone(displayedAngles);editing=true;editBase=clone(angles);frozenFeature=[...latest.feature];frozenCapture=$('preview').toDataURL('image/jpeg',.82);frozenPalm.copy(rig.joints[side+'Hand'].quaternion);savedId=null;$('poseName').value='';notice('Pose frozen. Tracking is paused; edit any joint, name the pose, then save.');updateMode();};
$('resume').onclick=()=>{epoch++;contactAngles=null;posePreview=false;for(const f of Object.values(filters))f.reset();editing=false;savedId=null;updateMode();notice('Live matching uses your saved examples and enabled limits.');if(sampleSource&&!stream)detect(sampleSource);};
$('undo').onclick=()=>{contactAngles=null;angles=clone(editBase);applyAngles();renderControls();notice('Restored the pose captured when editing began.');};
$('side').onchange=()=>{side=$('side').value;latest=null;configureSide();updateMode();if(sampleSource)detect(sampleSource);};
$('spatial').onchange=()=>{resetView();updateMode();if(!editing&&sampleSource)detect(sampleSource);};
$('reference').onchange=()=>{for(const f of Object.values(filters))f.reset();applyAngles();if(!editing&&sampleSource)detect(sampleSource);};
$('thumbFistTolerance').oninput=()=>{$('thumbFistValue').textContent=Math.round(+$('thumbFistTolerance').value*100)+'% of palm width';};
for(const id of ['changeThreshold','changeSpeed'])$(id).oninput=()=>{$(id+'Value').textContent=$(id).value+(id==='changeSpeed'?'°/s':'°');};
$('stability').oninput=()=>{$('stabilityValue').textContent=$('stability').value+'°';for(const f of Object.values(filters))f.reset();};
$('calibrateDepth').onclick=()=>{const d=+$('distance').value;if(!lastDepth||!latest)return notice('Show your hand to the camera first.');if(d<.15||d>1.5)return notice('Enter a distance between 0.15 and 1.5 metres.');depthScale=d/lastDepth;profile.calibration.depthScale=depthScale;persist();positionFilter.reset();notice('Depth calibrated at '+d.toFixed(2)+' m.');if(!editing&&sampleSource)detect(sampleSource);};
$('calibrateStraight').onclick=()=>{if(!latest||editing)return notice('In live mode, hold your fingers straight and together, then click this button.');for(const n of JOINTS)neutralSplay[side][n]=latest.raw[n][1];profile.calibration.neutralSplay=neutralSplay;persist();for(const f of Object.values(filters))f.reset();notice('Straight-finger sideways neutral captured for this hand.');if(sampleSource)detect(sampleSource);};
$('photoPreview').onclick=()=>{epoch++;editing=true;posePreview=false;thumbReference=0;curls=[0,0,0,0];angles=blankAngles();contactAngles=blankAngles();
 const z=rig.rest[side+'Middle1'].world.clone().sub(rig.rest[side+'Hand'].world).normalize().applyQuaternion(jointBasis('Thumb1').clone().invert());contactAngles.Thumb1=directionAngles('Thumb1',z.toArray());
 for(const n of JOINTS)if(!n.startsWith('Thumb'))contactAngles[n]=alignment(n);
 frozenPalm.setFromRotationMatrix(restBasis(side).invert());rig.root.position.copy(rig.rest[side+'Hand'].world).negate().add(new THREE.Vector3(0,-.065,-.3));editBase=clone(angles);frozenFeature=null;savedId=null;applyAngles();updateMode();$('save').disabled=true;notice('Photo reference: fingers together, two straight thumb segments. This is a model preview, not camera calibration.');};
$('referencePreview').onclick=()=>{epoch++;contactAngles=null;editing=true;posePreview=true;curls=[1,1,1,1];angles=blankAngles();for(const n of JOINTS)angles[n][0]=FIST[n][0];frozenPalm.identity();if($('spatial').checked){const q=new THREE.Quaternion().setFromRotationMatrix(restBasis(side)).invert();frozenPalm.copy(q);rig.root.position.copy(rig.rest[side+'Hand'].world).negate().add(new THREE.Vector3(0,-.07,-.27));}editBase=clone(angles);frozenFeature=null;savedId=null;applyAngles();updateMode();$('save').disabled=true;$('undo').disabled=true;$('zero').disabled=true;notice('Screenshot reference preview. Resume tracking to capture your own input.');};
$('follow').onchange=()=>{applyAngles();};$('viewReset').onclick=resetView;
$('usePoses').onchange=()=>{if(!editing&&sampleSource)detect(sampleSource);};
$('tolerance').value=profile.tolerance;$('toleranceValue').textContent=profile.tolerance.toFixed(2);$('tolerance').oninput=()=>{profile.tolerance=+$('tolerance').value;$('toleranceValue').textContent=profile.tolerance.toFixed(2);persist();if(!editing&&sampleSource)detect(sampleSource);};
function renderLibrary(){const list=$('library');list.replaceChildren();$('poseCount').textContent=profile.poses.length;
 if(!profile.poses.length){const p=document.createElement('p');p.className='empty';p.textContent='No examples yet. Freeze a pose and save your correction.';list.append(p);}
 for(const pose of profile.poses){const row=document.createElement('div');row.className='saved';const button=document.createElement('button');button.textContent=pose.name+' · '+(pose.side==='R'?'Right':'Left');button.onclick=()=>loadPose(pose);const del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label','Delete '+pose.name);del.onclick=()=>{profile.poses=profile.poses.filter(p=>p.id!==pose.id);if(savedId===pose.id)savedId=null;persist();renderLibrary();};row.append(button,del);list.append(row);}}
function loadPose(pose){epoch++;contactAngles=null;posePreview=false;curls=[0,0,0,0];editing=true;side=pose.side;$('side').value=side;configureSide();savedId=pose.id;contactAngles=pose.solvedAngles?clone(pose.solvedAngles):null;curls=pose.referenceCurl||[0,0,0,0];thumbReference=pose.thumbReference??Math.min(...curls);if(pose.referenceEnabled!=null)$('reference').checked=pose.referenceEnabled;angles=clone(pose.angles);editBase=clone(angles);frozenFeature=[...pose.features];frozenCapture=pose.capture;frozenPalm.identity();if($('spatial').checked){frozenPalm.setFromRotationMatrix(restBasis(side).invert());rig.root.position.copy(rig.rest[side+'Hand'].world).negate().add(new THREE.Vector3(0,-.07,-.35));}$('poseName').value=pose.name;applyAngles();
 if(pose.capture){const img=new Image();img.onload=()=>{$('preview').getContext('2d').clearRect(0,0,$('preview').width,$('preview').height);$('preview').getContext('2d').drawImage(img,0,0,$('preview').width,$('preview').height);};img.src=pose.capture;}
 notice('Editing saved pose “'+pose.name+'”. Save updates this example.');updateMode();}
$('save').onclick=()=>{const name=$('poseName').value.trim();if(!editing||!frozenFeature)return notice('Freeze a tracked pose first.');if(!name)return notice('Give this pose a name, such as Fist.');if(!savedId&&profile.poses.length>=100)return notice('This profile already has 100 examples. Export it and remove an example first.');
 const pose={id:savedId||crypto.randomUUID(),name,side,features:[...frozenFeature],angles:clone(angles),...(contactAngles?{solvedAngles:clone(contactAngles)}:{}),referenceCurl:[...curls],thumbReference:contactHold?.thumbReference??thumbReference,referenceEnabled:$('reference').checked,capture:frozenCapture};const at=profile.poses.findIndex(p=>p.id===pose.id);if(at>=0)profile.poses[at]=pose;else profile.poses.push(pose);savedId=pose.id;if(persist())notice('Saved “'+name+'”. Resume live to test recognition, or export JSON.');renderLibrary();};
function controlAngles(n){const fixed=currentAlignment(n),actual=editing?modelAngles(n):displayedAngles?.[n]||modelAngles(n);return actual.map((v,i)=>lockedAxis(n,i)?0:v-fixed[i]);}
function renderControls(){if(!rig.loaded)return;
 $('jointName').textContent=selected.replace(/\d$/,'')+' · '+jointLabel(selected);for(const n of JOINTS){const b=$('joint-'+n);b.setAttribute('aria-pressed',String(n===selected));b.querySelector('small').textContent=controlAngles(n).map(v=>Math.round(v)).join(' / ');}
 for(let i=0;i<3;i++){const v=controlAngles(selected)[i];$('angle'+i).value=v;$('number'+i).value=v.toFixed(1);$('angle'+i).disabled=$('number'+i).disabled=!editing||posePreview||lockedAxis(selected,i);
 const locked=lockedAxis(selected,i),l=locked?{enabled:true,min:0,max:0}:profile.limits[side][selected][i];$('enabled'+i).checked=l.enabled;$('min'+i).value=l.min;$('max'+i).value=l.max;for(const id of ['enabled','min','max'])$(id+i).disabled=!editing||posePreview||locked;}
}
function jointLabel(n){const k=+n.slice(-1);return n.startsWith('Thumb')?['CMC','MCP','IP'][k-1]:['MCP','PIP','DIP'][k-1];}
for(const f of FINGERS){const label=document.createElement('div');label.className='finger';label.textContent=f;$('joints').append(label);for(let k=1;k<=3;k++){const n=f+k,b=document.createElement('button');b.id='joint-'+n;b.setAttribute('aria-label','Select '+f+' '+jointLabel(n));b.innerHTML=jointLabel(n)+'<small>0 / 0 / 0</small>';b.onclick=()=>{selected=n;renderControls();};$('joints').append(b);}}
for(let i=0;i<3;i++){const axis=['X · Bend','Y · Sideways','Z · Twist'][i],row=document.createElement('div');row.className='angleRow';row.innerHTML=`<label for="angle${i}">${axis}</label><input id="number${i}" type="number" min="-180" max="180" step="0.1" aria-label="${axis} degrees"><input id="angle${i}" type="range" min="-180" max="180" step="0.1" aria-label="${axis}">`;$('axes').append(row);
 const edit=e=>{if(!editing)return;const v=Number(e.target.value);if(!Number.isFinite(v))return;angles[selected][i]=Math.max(-180,Math.min(180,v));if(contactAngles)contactAngles[selected][i]=angles[selected][i]+currentAlignment(selected)[i];applyAngles();renderControls();};$('angle'+i).oninput=edit;$('number'+i).oninput=e=>{if(!editing||e.target.value===''||!Number.isFinite(e.target.valueAsNumber))return;angles[selected][i]=Math.max(-180,Math.min(180,e.target.valueAsNumber));if(contactAngles)contactAngles[selected][i]=angles[selected][i]+currentAlignment(selected)[i];applyAngles();$('angle'+i).value=angles[selected][i];};$('number'+i).onchange=edit;
 const limit=document.createElement('div');limit.className='limitRow';limit.innerHTML=`<label><input id="enabled${i}" type="checkbox" aria-label="Enable ${axis} limit">${'XYZ'[i]}</label><input id="min${i}" type="number" min="-180" max="180" aria-label="${axis} minimum"><span>to</span><input id="max${i}" type="number" min="-180" max="180" aria-label="${axis} maximum">`;$('limits').append(limit);
 const setLimit=()=>{const min=+$('min'+i).value,max=+$('max'+i).value;if(!Number.isFinite(min)||!Number.isFinite(max)||min< -180||max>180||min>max){notice('Limits must be between −180° and 180°, with minimum ≤ maximum.');renderControls();return;}profile.limits[side][selected][i]={enabled:$('enabled'+i).checked,min,max};applyAngles();renderControls();$('limitState').textContent='Limits changed. Click Save my limits to keep them.';};for(const id of ['enabled','min','max'])$(id+i).onchange=setLimit;
}
$('zero').onclick=()=>{contactAngles=null;angles[selected]=[0,0,0];applyAngles();renderControls();};$('saveLimits').onclick=()=>{if(persist())notice('Your joint limits are saved and will apply in live mode.');$('limitState').textContent='Limits saved for '+(side==='R'?'right':'left')+' hand.';};$('clearLimits').onclick=()=>{profile.limits[side][selected]=[0,1,2].map(()=>({enabled:false,min:-180,max:180}));renderControls();$('limitState').textContent='Selected limits cleared. Save my limits to keep this.';};
$('export').onclick=()=>{const json=JSON.stringify(profile,null,2);$('jsonText').value=json;$('jsonDetails').open=true;download(new Blob([json],{type:'application/json'}),'hand-poses.json');notice('Exported your poses and limits. Keep this JSON as a backup.');};
function importText(text){if(text.length>20000000)throw Error('Profile is too large');const incoming=validateProfile(JSON.parse(text));profile=incoming;neutralSplay=profile.calibration.neutralSplay;depthScale=profile.calibration.depthScale;positionFilter.reset();$('tolerance').value=profile.tolerance;$('toleranceValue').textContent=profile.tolerance.toFixed(2);savedId=null;persist();applyAngles();renderLibrary();renderControls();notice('Imported '+profile.poses.length+' pose examples and joint limits.');if(!editing&&sampleSource)detect(sampleSource);}
$('import').onchange=async e=>{try{if(e.target.files[0])importText(await e.target.files[0].text());}catch(err){notice('Import rejected: '+err.message);}finally{e.target.value='';}};
$('importPaste').onclick=()=>{try{importText($('jsonText').value);}catch(e){notice('Import rejected: '+e.message);}};
$('png').onclick=()=>{renderDemo();const c=document.createElement('canvas');c.width=1400;c.height=850;const ctx=c.getContext('2d');ctx.fillStyle='#10151d';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#edf6ff';ctx.font='bold 25px system-ui';ctx.fillText('Hand Pose Lab — '+($('poseName').value||'Live comparison'),28,42);ctx.font='16px system-ui';ctx.fillText(editing?'Frozen input and corrected model':'Latest tracked frame and model',28,74);const fit=(img,x,y,w,h)=>{const a=img.width/img.height;let iw=w,ih=w/a;if(ih>h){ih=h;iw=h*a;}if(img===$('scene')&&$('viewMode').value!=='first'){ctx.save();ctx.translate(x+(w+iw)/2,y+(h-ih)/2);ctx.scale(-1,1);ctx.drawImage(img,0,0,iw,ih);ctx.restore();}else ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);};fit($('preview'),24,100,510,710);fit($('scene'),560,100,810,710);c.toBlob(blob=>{if(blob)download(blob,'hand-pose-comparison.png');});};
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let pointer=null;renderer.domElement.addEventListener('pointerdown',e=>pointer=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!pointer||Math.hypot(e.clientX-pointer[0],e.clientY-pointer[1])>5)return;const rect=renderer.domElement.getBoundingClientRect();mouse.set(1-(e.clientX-rect.left)/rect.width*2,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(markerGroup.children.filter(m=>m.visible))[0];if(hit){selected=hit.object.userData.joint;renderControls();}});
await rig.ready;
tips=buildTips(rig);const drivers={R:directDriver(rig,tips),L:directDriver(rig,tips)};const driveDirect=(...args)=>{args[0]=placePalmBeforeFingers(relaxedPoints(args[0],args[1],args[2],args[3]),args[1],args[2]);return keepHandBeforeWall(args[1],drivers[args[1]](...args));};let directResult=null;
function directOptions(lm){const attach=$('tipContact').checked?+$('contactAttach').value:0;return {staticInput:!!sampleSource,projectionAspect:captureAspect,projectionFocal:1/(2*Math.tan(Math.PI/6)*cameraFrame(captureAspect,camera.aspect).height),confirmDegrees:0,noiseDegrees:0,smoothingMs:0,movementThresholdMm:0,upperCoupling:+$('upperCoupling').value,lockUpper:$('lockUpper').checked,contactPixels:attach,contactReleasePixels:Math.max(attach,+$('contactRelease').value),handSize:+$('handSize').value,thickness:+$('fingerThickness').value,tipInset:+$('tipInset').value,lm,width:$('preview').width,height:$('preview').height};}
for(const f of FINGERS){const dot=new THREE.Mesh(new THREE.SphereGeometry(.002,12,8),new THREE.MeshBasicMaterial({color:0xffd56a,depthTest:false}));dot.userData.joint=f+'3';dot.renderOrder=101;markerGroup.add(dot);tipDots[f]=dot;}

for(const n of JOINTS){const dot=new THREE.Mesh(new THREE.SphereGeometry(.003,10,8),new THREE.MeshBasicMaterial({color:0x8ee3bf,depthTest:false}));dot.userData.joint=n;dot.renderOrder=100;markerGroup.add(dot);jointDots[n]=dot;}
configureSide();renderLibrary();updateMode();resize();notice('Direct Lines ready. Connect camera or Connect iPhone camera. Connected rigid hand. Original tracked directions; no automatic resizing.');
let timingAt=0,timingTotal=0,timingCount=0;
const wallTest=new URLSearchParams(location.search).has('fixture')?document.createElement('p'):null;if(wallTest)$('directSettings').prepend(wallTest);
let sceneFrames=0,sceneWindow=performance.now(),measuredScene=0,lastPaint=0,lastControls=0;function loop(now){requestAnimationFrame(loop);if(stream&&!editing)drawPreview($('video'),latest?.landmarks);if(+getCombinedOptions().handRate===0){latest=null;allHands=[];}
 if(now-lastPaint<1000/(getCombinedOptions().sceneRate||60)-1)return;const renderDt=lastPaint?(now-lastPaint)/1000:1/60;lastPaint=now;if(stream&&$('video').readyState>=2)drawPreview($('video'),latest?.landmarks);const calculationStart=performance.now();if(getCombinedOptions().rawOnly){measuredScene=0;sceneFrames=0;sceneWindow=now;$('scene').style.visibility='hidden';$('calculationTiming').textContent='RAW: model calculations and 3D rendering OFF. Read tracking FPS on camera preview.';return;}$('scene').style.visibility='';if(sampleSource&&combined){combined.seen=combined.poseSeen=now;}combined?.update(renderDt,captureAspect,camera,+$('phoneDistance').value/100,+$('depthGain').value);sceneFrames++;if(now-sceneWindow>=1000){measuredScene=Math.round(sceneFrames*1000/(now-sceneWindow));sceneFrames=0;sceneWindow=now;}if(latest){const pts=cameraPoints(latest.world,latest.landmarks);palmQ.setFromRotationMatrix(frameBasis(pts[0],pts[5],pts[9],pts[17]).multiply(restBasis(side).invert()));directResult=driveDirect(pts,side,palmQ,renderDt,directOptions(latest.landmarks));renderedHands[side]={result:directResult,time:now};$('directStatus').textContent=directResult.wallLimited?'Hand at head back-wall limit':directResult.surfaceGap!=null?'Selected hand/head surface gap: '+(directResult.surfaceGap*1000).toFixed(1)+' mm':directResult.contact?'Estimated contact · remaining tip gap '+(directResult.contactGap*1000).toFixed(1)+' mm':'Fixed hand proportions · tracked segment directions';}renderOtherHand(renderDt);applyPalmPlacement();depthExperiment?.observe(allHands,renderedHands,captureAspect);applyHandInteractions(now);if(wallTest)wallTest.textContent='Test wrist coordinates: '+Object.entries(renderedHands).map(([s,h])=>s+' '+h.result.points[0].toArray().map(v=>(v*1000).toFixed(2)).join(', ')).join(' / ');if(controls.enabled)controls.update();rig.root.updateMatrixWorld(true);markerGroup.visible=gizmo.visible=$('dots').checked&&!!latest;
 for(const n of JOINTS){const dot=jointDots[n];dot.visible=true;dot.position.setFromMatrixPosition(rig.joints[side+n].matrixWorld);dot.material.color.setHex(n===selected?0xffc56e:0x8ee3bf);dot.scale.setScalar(n===selected?1.7:1);}
 for(const [i,f] of FINGERS.entries())tipDots[f].position.copy(directResult?directResult.points[4+i*4]:tipWorld(rig,tips,side,f));
 modelLines.visible=false;let lineIndex=0;const linePoints=lineGeometry.attributes.position;
 for(const f of FINGERS){const chain=[rig.joints[side+'Hand'].getWorldPosition(new THREE.Vector3()),...['1','2','3'].map(k=>jointDots[f+k].position),tipDots[f].position];for(let i=0;i<4;i++)for(const v of [chain[i],chain[i+1]])linePoints.setXYZ(lineIndex++,v.x,v.y,v.z);}linePoints.needsUpdate=true;

 if(!editing&&now-lastControls>100){lastControls=now;renderControls();}
 if(pinching&&!editing)$('contactState').textContent=(contactHold?'Contact held · ':'Closing contact · ')+'thumb–'+pinchFinger.toLowerCase()+' gap '+(tipDots.Thumb.position.distanceTo(tipDots[pinchFinger].position)*1000).toFixed(1)+' mm';
 const j=rig.joints[side+selected];gizmo.position.setFromMatrixPosition(j.matrixWorld);gizmo.quaternion.copy(j.parent.getWorldQuaternion(new THREE.Quaternion())).multiply(jointBasis(selected));const modelMs=performance.now()-calculationStart;const submitStart=performance.now();renderDemo();timingTotal+=modelMs;timingCount++;if(now-timingAt>500){$('calculationTiming').textContent='PC model CPU: '+(timingTotal/timingCount).toFixed(2)+' ms/frame · render submission CPU: '+(performance.now()-submitStart).toFixed(2)+' ms (not GPU time)';timingAt=now;timingTotal=timingCount=0;}
}requestAnimationFrame(loop);addEventListener('pagehide',()=>{stopCamera();worker?.terminate();});

const stabilityControls=document.createElement('section');
stabilityControls.innerHTML='<h2>Tracking stability</h2><label>Remove small finger jiggle (degrees)<input id="fingerNoise" type="range" min="0" max="4" step="0.25" value="1"><output>1</output></label><label>Direction smoothing (milliseconds, 0 = off)<input id="directionSmoothing" type="range" min="0" max="250" step="5" value="90"><output>90</output></label><label>Movement threshold (estimated millimetres)<input id="movementThreshold" type="range" min="0" max="8" step="0.25" value="0"><output>0</output></label><label>Confirm sudden jumps above (degrees, 0 = off)<input id="confirmJump" type="range" min="0" max="30" step="1" value="8"><output>8</output></label><label><input id="lockUpper" type="checkbox" checked> Keep PIP and DIP in each finger’s bending plane</label><label>Link PIP and DIP bending (0 = independent, 1 = equal bends)<input id="upperCoupling" type="range" min="0" max="1" step="0.05" value="0"><output>0</output></label><label><input id="falseDepth" type="checkbox" checked> Reduce false depth bends on visibly straight fingers</label><p>Jiggle and movement thresholds hold tiny changes. Smoothing eases accepted directions. Jump confirmation rejects a one-frame direction flip. The plane lock prevents sideways movement on the upper two joints.</p><h2>Thumb and fingertip contact</h2><label>Attach when tips are within (camera pixels)<input id="contactAttach" type="range" min="0" max="40" step="1" value="8"><output>8</output></label><label>Release after tips separate beyond (camera pixels)<input id="contactRelease" type="range" min="1" max="60" step="1" value="12"><output>12</output></label><p>These distances apply when “Fit nearby thumb and fingertip” is enabled. A larger attach value closes a wider visible gap; release should normally be larger than attach.</p>';
$('directSettings').prepend(stabilityControls);
const scalePanel=document.createElement('section');scalePanel.innerHTML='<h2>One-time overall scale</h2><p>This captures only one fixed overall scale. It never resizes individual fingers.</p>';$('recalibrateSize').textContent='Capture scale from next clear palm';scalePanel.append($('recalibrateSize'));const scaleStatus=document.createElement('p');scaleStatus.id='scaleStatus';scaleStatus.textContent='Optional: face an open palm toward the camera, then press once.';scalePanel.append(scaleStatus);$('directSettings').append(scalePanel);
const guide=document.createElement('section');guide.className='trackingGuide';guide.innerHTML='<h2>What every option changes</h2><div class="tableScroll"><table><thead><tr><th>Option</th><th>What it changes</th><th>Effect and tradeoff</th></tr></thead><tbody><tr><td>Projection</td><td>Perspective depth or constant apparent size</td><td>Perspective looks like a game camera. Orthographic makes distance easier to compare.</td></tr><tr><td>Mirror / first person</td><td>Which side of the hand the camera views</td><td>Mirror matches the preview. First person shows the player’s viewpoint.</td></tr><tr><td>Both hands</td><td>Renders up to two detected hands</td><td>More complete testing; costs more screen space.</td></tr><tr><td>Small jiggle</td><td>Minimum direction change accepted</td><td>Higher is steadier but can ignore delicate motion.</td></tr><tr><td>Confirm jumps</td><td>Checks large changes against the next camera measurement</td><td>Rejects single-frame flips; adds one frame of delay to a large change.</td></tr><tr><td>PIP/DIP plane lock</td><td>Stops sideways and twist motion at upper finger joints</td><td>More anatomical and stable; disabling follows noisy 3D directions more literally.</td></tr><tr><td>False-depth correction</td><td>Uses straight-looking 2D lines when MediaPipe depth bends them</td><td>Keeps open fingers straight; disable to inspect raw depth.</td></tr><tr><td>Contact attach/release</td><td>When thumb contact fitting starts and stops</td><td>Larger attach closes bigger gaps. A larger release prevents contact flicker.</td></tr><tr><td>Finger thickness</td><td>Visual width of every phalange</td><td>Does not alter tracked centre lines.</td></tr><tr><td>Tip inset</td><td>Moves the tracked endpoint inside the visible fingertip</td><td>Helps visible skin touch; too high creates overlap.</td></tr><tr><td>Tracking-loss grace</td><td>How long the last hand survives missing detection</td><td>Helps claps and occlusion; too high leaves a ghost hand.</td></tr><tr><td>Phone distance</td><td>Reference distance used for perspective placement</td><td>Set it near the real phone-to-hand distance before calibration.</td></tr><tr><td>Depth sensitivity</td><td>Strength of forward/back movement</td><td>Zero locks depth; higher values follow estimated depth more strongly.</td></tr><tr><td>First-person camera</td><td>Position, yaw, pitch and field of view</td><td>Changes only the game-style viewpoint, not tracked joint angles.</td></tr><tr><td>Overall scale capture</td><td>One fixed size reference from a clear palm</td><td>Does not resize individual bones during tracking.</td></tr></tbody></table></div>';$('directSettings').append(guide);
guide.querySelector('tbody').insertAdjacentHTML('beforeend','<tr><td>Direction smoothing</td><td>Time used to ease each accepted segment direction</td><td>Higher looks softer but follows deliberate motion later. Zero follows accepted measurements immediately.</td></tr><tr><td>Movement threshold</td><td>Estimated endpoint movement required before a segment changes</td><td>Helps positional noise; high values can hide small poses.</td></tr><tr><td>Linked PIP/DIP bending</td><td>Blends the tip-joint bend toward the middle-joint bend while the plane lock is on</td><td>One produces equal bends; zero leaves both tracked independently.</td></tr><tr><td>Save starting settings</td><td>Stores every control in this panel in your browser</td><td>Your chosen setup returns on the next visit. Restore defaults resets the controls.</td></tr>');
const uiStyle=document.createElement('style');uiStyle.textContent='main{grid-template-columns:minmax(360px,420px) 1fr!important}.trackingGuide table{width:100%;border-collapse:collapse;font-size:12px}.trackingGuide th,.trackingGuide td{border:1px solid #365069;padding:7px;text-align:left;vertical-align:top}.trackingGuide th{color:#91edc7}.tableScroll{overflow-x:auto}@media(max-width:800px){main{grid-template-columns:1fr!important}}';document.head.append(uiStyle);
for(const input of stabilityControls.querySelectorAll('input[type="range"]'))input.oninput=()=>input.nextElementSibling.value=input.value;
$('contactAttach').addEventListener('input',()=>{if(+$('contactRelease').value<+$('contactAttach').value){$('contactRelease').value=$('contactAttach').value;$('contactRelease').nextElementSibling.value=$('contactRelease').value;}});
const startFields=['fingerNoise','directionSmoothing','movementThreshold','confirmJump','upperCoupling','contactAttach','contactRelease','fingerThickness','tipInset','trackingGrace','eyeX','eyeY','eyeZ','eyeYaw','eyePitch','eyeFov','phoneDistance','depthGain'];
const booleanStartFields=['falseDepth','lockUpper'];
$('startStatus').textContent='Defaults: zero smoothing, jiggle threshold and jump delay, 8/12 px contact, 1.3× thickness, 2 mm inset, 250 ms tracking grace.';
let diagnostic=null,diagnosticTimer=null;
const recordingControls=document.createElement('section');
recordingControls.innerHTML='<h2>Report a tracking problem</h2><label>What went wrong?<input id="recordSymptom" placeholder="Which finger, pose and camera view?"></label><button id="recordTracking">Record 12 seconds</button> <button id="finishRecording" disabled>Stop and download</button><p id="recordStatus">Records tracking coordinates and settings, without camera images or audio. Hold the difficult pose and slowly turn front → side → front.</p>';
$('directSettings').append(recordingControls);
function finishDiagnostic(){if(!diagnostic)return;clearTimeout(diagnosticTimer);const result=diagnostic;diagnostic=null;delete result.started;download(new Blob([JSON.stringify(result)],{type:'application/json'}),'combined-tracking-v19.json');$('recordTracking').disabled=false;$('finishRecording').disabled=true;$('recordStatus').textContent='Downloaded '+result.frames.length+' camera measurements. Send the JSON with the symptom you observed.';}
$('recordTracking').onclick=()=>{if((!stream&&!phoneActive)||sampleSource){$('recordStatus').textContent='Connect the live phone or computer camera first.';return;}diagnostic={version:19,started:performance.now(),symptom:$('recordSymptom').value,settings:{...Object.fromEntries(startFields.map(id=>[id,+$(id).value])),...Object.fromEntries(booleanStartFields.map(id=>[id,$(id).checked]))},view:$('viewMode').value,frames:[]};$('recordTracking').disabled=true;$('finishRecording').disabled=false;$('recordStatus').textContent='Recording for 12 seconds… Hold the pose, then slowly turn the hand.';diagnosticTimer=setTimeout(finishDiagnostic,12000);};
$('finishRecording').onclick=finishDiagnostic;
function restoreStart(values){for(const id of booleanStartFields)if(typeof values[id]==='boolean')$(id).checked=values[id];for(const id of startFields){const el=$(id),value=Number(values[id]);if(Number.isFinite(value)&&value>=Number(el.min)&&value<=Number(el.max)){el.value=value;el.nextElementSibling.value=value;}}}
restoreStart({fingerNoise:0,directionSmoothing:0,confirmJump:0,depthGain:1});
try{const saved=JSON.parse(localStorage.getItem('brother-demo-start')||'null');if(saved)restoreStart(saved);}catch{}
$('saveStart').onclick=()=>{try{localStorage.setItem('brother-demo-start',JSON.stringify({...Object.fromEntries(startFields.map(id=>[id,+$(id).value])),...Object.fromEntries(booleanStartFields.map(id=>[id,$(id).checked]))}));$('startStatus').textContent='Starting settings saved in this browser.';}catch{$('startStatus').textContent='Browser storage unavailable.';}};
$('resetStart').onclick=()=>{restoreStart({fingerNoise:1,directionSmoothing:35,movementThreshold:.5,confirmJump:12,upperCoupling:0,contactAttach:8,contactRelease:12,lockUpper:true,falseDepth:true,fingerThickness:.9,tipInset:5,trackingGrace:1000,eyeX:0,eyeY:0,eyeZ:-1.2,eyeYaw:180,eyePitch:0,eyeFov:60,phoneDistance:40,depthGain:1});$('startStatus').textContent='Defaults restored. Save to use on next visit.';};

const secondLineGeometry=new THREE.BufferGeometry();secondLineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(120),3));const secondLines=new THREE.LineSegments(secondLineGeometry,new THREE.LineBasicMaterial({color:0x79bbff,depthTest:false}));secondLines.frustumCulled=false;scene.add(secondLines);
function renderOtherHand(dt){
 for(const m of rig.parts)if(m.name.startsWith(side)&&/^[RL](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name))m.visible=!!latest;
 const other=side==='R'?'L':'R',extra=$('bothHands').checked&&allHands.length>1?allHands.find(h=>h.landmarks!==latest?.landmarks):null;
 for(const m of rig.parts)if(m.name.startsWith(other)&&/^[RL](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name))m.visible=!!extra;
 secondLines.visible=false;if(!extra)return;
 const originalSide=side;side=other;const pts=cameraPoints(extra.world,extra.landmarks),q=new THREE.Quaternion().setFromRotationMatrix(frameBasis(pts[0],pts[5],pts[9],pts[17]).multiply(restBasis(side).invert()));
 const result=driveDirect(pts,side,q,dt,directOptions(extra.landmarks));renderedHands[side]={result,time:performance.now()};side=originalSide;
 let n=0;for(let f=0;f<5;f++){const ids=[0,1+f*4,2+f*4,3+f*4,4+f*4];for(let k=0;k<4;k++)for(const i of [ids[k],ids[k+1]]){const v=result.points[i];secondLineGeometry.attributes.position.setXYZ(n++,v.x,v.y,v.z);}}secondLineGeometry.attributes.position.needsUpdate=true;
}
function setViewMode(){const desired=$('cameraProjection').value==='constant'?orthographicCamera:perspectiveCamera;if(camera!==desired){camera=desired;controls.object=camera;for(const s of ['R','L'])delete depthStates[s];resize();}const first=$('viewMode').value==='first';
 if(first){camera.position.set(+$('eyeX').value,+$('eyeY').value,+$('eyeZ').value);const yaw=+$('eyeYaw').value*RAD,pitch=+$('eyePitch').value*RAD;const dir=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));camera.up.set(0,1,0);camera.lookAt(camera.position.clone().add(dir));camera.fov=+$('eyeFov').value;}
 else{camera.position.set(0,0,0);camera.up.set(0,1,0);camera.lookAt(0,0,-1);camera.fov=60;}
 camera.updateProjectionMatrix();$('scene').style.transform=first?'none':'scaleX(-1)';$('cameraFrame').style.display=first||camera.isOrthographicCamera?'none':'';}

$('cameraProjection').onchange=setViewMode;$('viewMode').onchange=setViewMode;const originalReset=$('viewReset').onclick;$('viewReset').onclick=()=>{originalReset();setViewMode();};

$('recalibrateSize').onclick=()=>{for(const s of ['R','L']){drivers[s]=directDriver(rig,tips);delete depthStates[s];delete distanceGains[s];}$('scaleStatus').textContent='Ready. Hold one open palm toward the camera; the next clear frame becomes the fixed overall scale.';};

for(const id of ['eyeX','eyeY','eyeZ','eyeYaw','eyePitch','eyeFov'])$(id).oninput=()=>{$(id).nextElementSibling.value=$(id).value;setViewMode();};
$('resetCamera').onclick=()=>{restoreStart({eyeX:0,eyeY:0,eyeZ:-1.2,eyeYaw:180,eyePitch:0,eyeFov:60});setViewMode();};

$('phoneDistance').oninput=()=>{$('phoneDistance').nextElementSibling.value=$('phoneDistance').value;$('eyeZ').value=-$('phoneDistance').value/100;$('eyeZ').nextElementSibling.value=$('eyeZ').value;setViewMode();};
$('depthGain').oninput=()=>{$('depthGain').nextElementSibling.value=$('depthGain').value;};
$('calibrateDistance').onclick=()=>{if(!latest||camera.isOrthographicCamera){$('depthCalibrationStatus').textContent='Use perspective and show a hand next to your face first.';return;}const metres=+$('phoneDistance').value/100;let count=0;for(const s of ['R','L'])if(depthStates[s]?.depth){distanceGains[s]=metres/depthStates[s].depth;count++;}$('eyeZ').value=-metres;$('eyeZ').nextElementSibling.value=-metres;setViewMode();$('depthCalibrationStatus').textContent='Calibrated '+count+' hand(s) at '+$('phoneDistance').value+' cm. Recalibrate if you move the phone.';};

const readCombinedOptions=installCombinedUI();getCombinedOptions=()=>({...readCombinedOptions(),holistic:false,handPriority:false,depthSmooth:0,headSmooth:0});
restoreStart({fingerThickness:.9,tipInset:5,fingerNoise:0,directionSmoothing:0,movementThreshold:0,confirmJump:0});
if($('sizeDepth'))$('sizeDepth').checked=false;
for(const id of ['sizeDepth','restGap','nearDistance','demoJitter','fingerNoise','directionSmoothing','movementThreshold','confirmJump','upperCoupling','falseDepth','phoneDistance','depthGain']){const el=$(id);if(el)el.closest('label').style.display='none';}
for(const id of ['captureRestSize','sizeStatus','calibrateDistance','depthCalibrationStatus','alignCheeks'])if($(id))$(id).style.display='none';
restoreStart({fingerNoise:0,directionSmoothing:0,movementThreshold:0,confirmJump:0,lockUpper:true,upperCoupling:0,depthGain:1,phoneDistance:40,eyeX:0,eyeY:0,eyeZ:-1.2,eyeYaw:180,eyePitch:0,eyeFov:60});
$('trackingGrace').value=1000;$('trackingGrace').nextElementSibling.value=1000;
for(const id of ['tipContact','contact','reference','usePoses']){$(id).checked=false;}
$('falseDepth').checked=true;$('lockUpper').checked=true;
combined=new CombinedHead(scene,getCombinedOptions);
$('centerHead').onclick=()=>combined.center();
$('renderScale').addEventListener('input',()=>renderer.setPixelRatio(+$('renderScale').value));
renderer.setPixelRatio(+getCombinedOptions().renderScale);
const handCalibrate=$('calibrateDistance').onclick;
$('calibrateDistance').onclick=()=>{
 if(!latest||performance.now()-combined.seen>600||!combined.face||camera.isOrthographicCamera){$('depthCalibrationStatus').textContent='Use perspective. Show your face and hands beside your cheeks in the same frame.';return;}
 for(const s of ['R','L'])delete cheekOffsets[s];handCalibrate();const ok=combined.calibrate(+$('phoneDistance').value/100,captureAspect,camera.aspect);
 $('depthCalibrationStatus').textContent=ok?'Hands and face share '+$('phoneDistance').value+' cm reference. Head size stays fixed. Check cheek contact and adjust Face depth offset if needed. Recalibrate after moving the phone.':'Head model is still loading; retry when ready.';
};
function showTrackingStats(s){trackingStats=s;lastStatsTime=performance.now();$('liveFps').textContent=`CAM ${s.camera||0} FPS
HAND ${s.hands||0} · FACE ${s.face||0} · BODY ${s.pose||0}`;const o=getCombinedOptions();$('combinedStatus').textContent=`Camera: ${s.camera||0} ${s.cameraCounter||"observed"} FPS · fallback reads ${s.capturePolls||0}/s (requested ${o.cameraFps}) · camera reports ${s.cameraSettings?.frameRate?.toFixed?.(1)||'?'}
Hands: ${s.hands||0} FPS · ${s.delegate?.hands||'loading'} · ${Math.round(s.ms?.hands||0)} ms
Face/head: ${s.face||0} FPS · ${s.delegate?.face||'off/loading'} · shoulders: ${s.pose||0} FPS · ${s.delegate?.pose||'off/loading'}
Scene: ${measuredScene} measured FPS (target ${o.sceneRate})${Object.keys(s.errors||{}).length?' · '+JSON.stringify(s.errors):''}`;}
window.combinedLab={version:19,get head(){return combined;},get metrics(){return trackingStats;},get handResult(){return directResult;},get scene(){return scene;}};
notice('Sweep 2.4.10 ready. Record one front-to-neck sweep; tracking runs on the PC.');
combined.ready.then(()=>{if(combined.error)notice('Head model failed to load: '+combined.error);});

const fixtureName=new URLSearchParams(location.search).get('fixture');
const fixtures={cheek:'./references/cheek.jpg',scalp:'./references/scalp.jpg',forward:'./references/forward.jpg',seated:'../test/seated_desk.jpg',crossed:'../test/crossed_hands.jpg',gesture:'../test/gesture67.webm'};
if(fixtures[fixtureName]){
 const button=document.createElement('button');button.className='row';button.textContent='Run combined tracking fixture';$('start').parentElement.after(button);
 button.onclick=async()=>{
  stopCamera();editing=false;sampleSource=null;let source,cleanup;
  if(fixtureName==='gesture'){source=document.createElement('video');source.src=fixtures[fixtureName];source.muted=true;source.loop=true;source.playsInline=true;await source.play();cleanup=()=>source.pause();}
  else{const img=new Image();img.src=fixtures[fixtureName];await img.decode();const c=document.createElement('canvas');c.width=640;c.height=Math.round(640*img.height/img.width);const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);const synthetic=c.captureStream(60),timer=setInterval(()=>ctx.drawImage(img,0,0,c.width,c.height),1000/60);source=document.createElement('video');source.muted=true;source.srcObject=synthetic;await source.play();cleanup=()=>{clearInterval(timer);synthetic.getTracks().forEach(t=>t.stop());};}
  const end=startTracking(source,(data,frame)=>{if(data.task==='hands')acceptTracking(data,frame);else{combined.receive(data);drawPreview(frame,latest?.landmarks);}},showTrackingStats,getCombinedOptions);liveSession=()=>{end();cleanup();};notice('TEST FIXTURE — model inference on a reference image/video; not a live camera FPS benchmark.');
 };
}

setInterval(()=>{if(lastStatsTime&&performance.now()-lastStatsTime>1800){$('liveFps').textContent='CAM 0 FPS · no fresh frames\nHAND 0 · FACE 0 · BODY 0';}},500);

$('alignCheeks').onclick=()=>{
 if(!combined?.group.visible||!combined.asset){$('depthCalibrationStatus').textContent='Show your face and index fingertips touching your cheeks first.';return;}
 combined.asset.updateWorldMatrix(true,true);combined.asset.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingSphere();o.computeBoundingBox();}});
 let count=0;for(const s of ['R','L']){const entry=renderedHands[s];if(!entry||performance.now()-entry.time>250)continue;const tip=entry.result.points[8],ray=new THREE.Raycaster(new THREE.Vector3(),tip.clone().normalize()),hit=ray.intersectObject(combined.asset,true)[0];if(!hit||Math.abs(hit.point.z-tip.z)>.5)continue;(cheekOffsets[s]??=new THREE.Vector3()).add(hit.point.clone().sub(tip));count++;}
 $('depthCalibrationStatus').textContent=count?'Aligned '+count+' hand(s) to the face surface. Fixed position offset applied; finger lengths unchanged. Recalibrate distance to reset.':'No face surface under the model index tips. Place index fingertips over your cheeks and retry.';
};

const demoContacts={};
function demoContactAdjust(points,lm){
 if(camera.isOrthographicCamera)return;const o=getCombinedOptions(),origin=points[0].clone();
 if(o.demoMatch>0){const samples=points.slice(1).map((p,k)=>({uv:cameraUV(lm[k+1],captureAspect,camera.aspect),offset:p.clone().sub(origin).toArray()}));const depth=fitPalmDepth(cameraUV(lm[0],captureAspect,camera.aspect),samples,camera.aspect,-origin.z);const target=new THREE.Vector3().fromArray(cameraPosition(cameraUV(lm[0],captureAspect,camera.aspect),depth,camera.aspect));const delta=target.sub(origin).multiplyScalar(o.demoMatch);for(const p of points)p.add(delta);}
 if(!o.demoContact||!combined?.group.visible)return;
 const previous=demoContacts[side];if(previous&&(previous.lm===lm||performance.now()-previous.time<80)){if(previous.delta)for(const p of points)p.add(previous.delta);return;}
 combined.group.updateMatrixWorld(true);combined.group.traverse(m=>{if(m.isSkinnedMesh){m.skeleton.update();}});
 const ray=new THREE.Raycaster(),zero=new THREE.Vector3();let best=null;
 for(const i of [4,8,12,16,20,5,9,13,17].sort((a,b)=>points[a].distanceToSquared(combined.position)-points[b].distanceToSquared(combined.position)).slice(0,3)){for(const blend of [0,.16,.32]){const aim=points[i].clone();if(combined.position){aim.x+=(combined.position.x-aim.x)*blend;aim.y+=(combined.position.y-aim.y)*blend;}ray.set(zero,aim.normalize());const hit=ray.intersectObject(combined.group,true)[0];if(!hit)continue;const delta=hit.point.clone().sub(points[i]);delta.z+=o.demoPadding/1000;if(Math.abs(delta.z)>o.demoReach/100||Math.hypot(delta.x,delta.y)>o.demoSide/100)continue;if(!best||delta.lengthSq()<best.lengthSq())best=delta;break;}}

 if(best){best.multiplyScalar(o.demoContact);for(const p of points)p.add(best);}demoContacts[side]={lm,delta:best,time:performance.now()};
}

function demoAdjust(points,lm){demoContactAdjust(points,lm);}
// Separate depth buffer for hands: preserves their coordinates and perspective size.
function renderDemo(){
 // Hands and bust share the depth buffer: contact must be spatial, not an overlay.
 for(const m of rig.parts)m.layers.set(0);
 camera.layers.set(0);renderer.autoClear=true;renderer.render(scene,camera);
}

function demoNearFace(lm){if(!getCombinedOptions().demoGrip||!combined?.group.visible||!combined.depth||!combined.face)return false;const f=combined.face.points,left=Math.min(f[234].x,f[454].x),right=Math.max(f[234].x,f[454].x),top=f[10].y,bottom=f[152].y,pad=(right-left)*.15;return [0,4,8,12,16,20].some(i=>lm[i].x>left-pad&&lm[i].x<right+pad&&lm[i].y>top-(right-left)*.65&&lm[i].y<bottom+(bottom-top)*.75);}
function fitDemoGrip(p,chains,lengths,hinges,lm){
 contactAnchors[side]=null;
 if(!demoNearFace(lm))return;
 combined.group.updateMatrixWorld(true);
 const stamp=`${combined.seen}:${combined.poseSeen}`;
 if(combined.contactStamp!==stamp){
  combined.group.traverse(m=>{if(m.isSkinnedMesh){m.skeleton.update();}});
  combined.surfacePoints=(combined.contactSamples||[]).map(({mesh,i,region})=>({region,point:mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)}));
  combined.surfaceTriangles=[];
  combined.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;
   const vertices=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
   const index=mesh.geometry.index,count=index?index.count:vertices.length;
   for(let i=0;i<count;i+=3)combined.surfaceTriangles.push(new THREE.Triangle(...[0,1,2].map(k=>vertices[index?index.getX(i+k):i+k])));
  });
  combined.contactStamp=stamp;
 }
 const face=combined.face.points,faceWidth=Math.abs(face[454].x-face[234].x),candidates=[];
 // Select a contact anchor; never pull every finger into the face.
 for(let f=0;f<5;f++)candidates.push({part:FINGERS[f]+'3',source:chains[f][3],landmark:lm[4+4*f]});
 const palm=p[0].clone();for(const c of chains)palm.add(c[0]);palm.multiplyScalar(1/6);
 const palmLm={x:lm[0].x,y:lm[0].y};for(const i of [1,5,9,13,17]){palmLm.x+=lm[i].x;palmLm.y+=lm[i].y;}palmLm.x/=6;palmLm.y/=6;
 candidates.push({part:'Hand',source:palm,landmark:palmLm});
 const ray=new THREE.Raycaster(),origin=new THREE.Vector3();let best=null;
 for(const candidate of candidates){
  const uv=cameraUV(candidate.landmark,captureAspect,camera.aspect),aim=new THREE.Vector3().fromArray(cameraPosition(uv,combined.depth,camera.aspect));
  ray.set(origin,aim.clone().normalize());
  let target=null,screenError=Infinity;
  const region=candidate.region||(candidate.landmark.y>face[152].y+faceWidth*.08?'neck':'head');
  const projectedAim=aim.clone().project(camera);let faceId=null,bodyPointId=null,faceGap=Infinity;
  if(region==='head'&&combined.cameraLandmarks?.length){
   combined.cameraLandmarks.forEach((dot,i)=>{const d=Math.hypot(candidate.landmark.x-dot.x,(candidate.landmark.y-dot.y)/captureAspect);if(d<faceGap){faceGap=d;faceId=i;}});
   target=combined.mappedLandmarks?.[faceId]?.clone();screenError=faceGap;
   const above=candidate.landmark.y<face[10].y;
   if(faceGap>faceWidth*(above?.65:.3))continue;
  }else{
   for(const i of [11,12]){const dot=combined.pose?.points?.[i];if(!dot||!combined.mappedShoulders?.[i])continue;const d=Math.hypot(candidate.landmark.x-dot.x,(candidate.landmark.y-dot.y)/captureAspect);if(d<faceWidth*.4&&d<screenError){screenError=d;bodyPointId=i;target=combined.mappedShoulders[i].clone();}}
   for(const sample of bodyPointId===null?combined.surfacePoints||[]:[]||[]){
    if(sample.region!==region)continue;
    const v=sample.point,screen=v.clone().project(camera),d=Math.hypot((screen.x-projectedAim.x)*camera.aspect,screen.y-projectedAim.y);
    if(d<screenError){screenError=d;target=v.clone();}
   }
   faceGap=screenError;if(screenError>faceWidth*.6)continue;
  }
  if(!target)continue;
  const score=faceGap+target.distanceTo(candidate.source)*.005;
  if(!best||score<best.score)best={score,source:candidate.source,target,part:candidate.part,faceId,bodyPointId};

 }
 if(new URLSearchParams(location.search).has('fixture')){let d=document.getElementById('contactDiagnostic');if(!d){d=document.createElement('pre');d.id='contactDiagnostic';d.style.whiteSpace='pre-wrap';d.style.fontSize='11px';document.body.append(d);}d.textContent=JSON.stringify({samples:combined.surfacePoints?.length,neckSamples:combined.surfacePoints?.filter(s=>s.region==='neck').length,best:best?{source:best.source.toArray(),target:best.target.toArray(),score:best.score}:null});}
 if(best){combined.highlightFaceId=best.faceId;combined.highlightBodyId=best.bodyPointId;contactAnchors[side]=best;fitHeadGrip(p,chains,lengths,hinges,[{source:best.source,target:best.target}],getCombinedOptions().demoGrip);}
}

const contactAnchors={};
function fitDemoMeshContact(points,handSide,lm){
 const anchor=contactAnchors[handSide];if(!anchor||!demoNearFace(lm))return null;
 const q=new THREE.Vector3(),nearby=(combined.surfaceTriangles||[]).filter(t=>t.closestPointToPoint(anchor.target,q).distanceTo(anchor.target)<.04);
 const hand=rig.joints[handSide+'Hand'];
 let contactTriangle=null,closest=Infinity;
 for(const t of nearby){const d=t.closestPointToPoint(anchor.target,q).distanceToSquared(anchor.target);if(d<closest){closest=d;contactTriangle=t;}}
 if(!contactTriangle)return null;
 const surfaceTarget=contactTriangle.closestPointToPoint(anchor.target,new THREE.Vector3()),outward=contactTriangle.getNormal(new THREE.Vector3());

 const vertices=[];
 for(const mesh of rig.parts){
  if(mesh.parent!==rig.joints[handSide+anchor.part])continue;
  const position=mesh.geometry.attributes.position,step=Math.max(1,Math.floor(position.count/128));
  for(let i=0;i<position.count;i+=step)vertices.push(new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld));
 }
 const fit=supportedContact(vertices,surfaceTarget,outward);if(!fit)return null;
 const delta=fit.delta.multiplyScalar(getCombinedOptions().demoGrip);
 const position=hand.getWorldPosition(new THREE.Vector3()).add(delta);
 hand.position.copy(hand.parent.worldToLocal(position));rig.refresh(hand);rig.root.updateMatrixWorld(true);
 for(const point of points)point.add(delta);
 const gap=fit.source.clone().add(delta).distanceTo(fit.target);
 if(new URLSearchParams(location.search).has('fixture')){
  const d=document.getElementById('contactDiagnostic');if(d)d.textContent=JSON.stringify({part:anchor.part,triangles:nearby.length,handVertices:vertices.length,facePointId:anchor.faceId,surfaceGapBeforeMm:fit.gapBefore*1000,surfaceGapAfterMm:gap*1000});
 }
 return gap;
}

window.addEventListener('pagehide',()=>{liveSession?.();closePhone?.();stream?.getTracks().forEach(track=>track.stop());});

if($('captureRestSize'))$('captureRestSize').onclick=()=>{
 if(!allHands.length||!combined?.depth)return notice('Show your face and hand first.');
 for(const hand of allHands){const size=palmSize(hand.landmarks,hand.world,captureAspect);if(!size)continue;
  const S=hand.landmarks===latest?.landmarks?side:(side==='R'?'L':'R');
  sizeReferences[S]={size,depth:Math.max(.08,combined.depth-+$('restGap').value/100)};
 }
 notice('Resting hand size captured. Move toward the camera to reduce distance; physical model size stays fixed.');
};

// Keep legacy inputs for internal compatibility; present only active controls.
{
 const panel=$('directSettings');
 const jiggle=document.createElement('details');jiggle.className='settingTab';jiggle.open=true;jiggle.innerHTML='<summary>Jiggle</summary><p>Zero follows estimates immediately. High values hold small changes or add delay.</p>';
 for(const [id,max,value] of [['fingerNoise',15,1],['directionSmoothing',500,25],['confirmJump',90,0],['depthSmooth',500,25],['headSmooth',500,0]]){const e=$(id);e.max=max;e.value=value;e.nextElementSibling.value=value;const label=e.closest('label');label.style.display='block';jiggle.append(label);}
 const view=document.createElement('button');view.textContent='Explore in 3D — rotate / pan / zoom';let explore=false;
 view.onclick=()=>{explore=!explore;controls.enabled=explore;controls.enablePan=true;controls.maxDistance=8;if(explore){controls.target.set(0,0,-(combined?.depth||.5));$('scene').style.transform='none';$('cameraFrame').style.display='none';}else setViewMode();view.textContent=explore?'Return to camera mirror':'Explore in 3D — rotate / pan / zoom';};panel.prepend(view,jiggle);
 const allowed=new Set(['handsTouch','outerCollision','headCollision','relaxedPalm','handDistance','handHeight','headSide','contactThreshold','headHeight','headSize','headBack','fingerThickness','tipInset','lockBody','turnGain','moveGain','neckShare','trackingGrace','faceGrace','showHead','mappedFaceDots','fingerNoise','directionSmoothing','confirmJump','depthSmooth','headSmooth']);
 for(const label of panel.querySelectorAll('label')){const input=label.querySelector('input,select');if(input&&!allowed.has(input.id))label.style.display='none';}
 for(const el of panel.querySelectorAll('p,small,button'))if(el!==view&&!jiggle.contains(el)&&el.id!=='calculationTiming')el.style.display='none';
 for(const d of panel.querySelectorAll('details')){if(d===jiggle)continue;const visible=[...d.querySelectorAll('label')].some(l=>l.style.display!=='none');if(!visible)d.style.setProperty('display','none','important');}
 for(const id of ['detected','side'])$(id).closest('label').style.setProperty('display','none','important');
 $('lockUpper').checked=true;$('falseDepth').checked=true;$('bothHands').checked=true;$('detected').value='first';
}

// The requested direct mode has no custom temporal jiggle filter or scan.
for(const id of ['fingerNoise','directionSmoothing','confirmJump','movementThreshold','depthSmooth','headSmooth']){const input=$(id);if(input){input.value=0;input.closest('label').style.display='none';}}
for(const d of $('directSettings').querySelectorAll('details'))if(d.querySelector('summary')?.textContent==='Jiggle')d.style.setProperty('display','none','important');
const pipelineInfo=document.createElement('p');pipelineInfo.textContent='Fixed hand geometry and camera projection set the depth scale. One front-to-neck sweep saves the rear reference with a fixed 10-degree phone-tilt assumption. Edge-on palms hold the last reliable depth.';$('directSettings').prepend(pipelineInfo);

depthExperiment=installExperiment({container:$('directSettings'),getHead:()=>combined,getFocal:aspect=>1/(2*Math.tan(Math.PI/6)*cameraFrame(aspect,camera.aspect).height),onReference:fit=>{palmDepth.reset();if(combined)combined.neckFitScale=fit?.headScale??1;},getNeckReference:(hand,points,aspect)=>{if(!points)return null;const palm=[0,5,9,13,17].reduce((v,i)=>v.add(points[i]),new THREE.Vector3()).multiplyScalar(.2);return combined?.neckReference(palm,1/(2*Math.tan(Math.PI/6)*cameraFrame(aspect,camera.aspect).height));},onBegin:()=>{controls.enabled=false;$('cameraProjection').value='perspective';$('viewMode').value='mirror';setViewMode();palmDepth.reset();}});

$('relaxedPalm').checked=false;$('contactThreshold').value=0;$('contactThreshold').nextElementSibling.value=0;

const handContactStatus=document.createElement('p');handContactStatus.id='handContactStatus';handContactStatus.setAttribute('role','status');$('outerCollision').closest('label').after(handContactStatus);
const contactPanel=document.createElement('section');contactPanel.style.display='block';contactPanel.innerHTML='<h2>Optional contact</h2><p>Off by default. These optional corrections do not calibrate depth. Enable contact matching to close touching finger lines; enable outer collisions to protect the two hands. Hand/head collisions are separate and off by default so moving the head does not push your hands. Finger joints within one hand use bending limits, not self-collision.</p>';
contactPanel.append($('handsTouch').closest('label'),$('outerCollision').closest('label'),$('headCollision').closest('label'),handContactStatus);$('touchProgress').closest('section').after(contactPanel);
for(const id of ['touchRange','touchConfirm','touchSideLimit']){const label=$(id).closest('label');label.style.display='block';contactPanel.append(label);}
if(wallTest){wallTest.style.display='block';contactPanel.after(wallTest);}

const indexLabel=document.createElement('label');indexLabel.style.display='block';indexLabel.innerHTML='<input id="indexContactOnly" type="checkbox"> Match index fingertips only';contactPanel.prepend(indexLabel);

const shakeLabel=document.createElement('label');shakeLabel.innerHTML='<input id="reduceShake" type="checkbox" checked> Reduce tracking shake';$('directSettings').prepend(shakeLabel);$('reduceShake').onchange=()=>{trackingJitter.reset();palmDepth.reset();};

function placePalmBeforeFingers(points,s,q){
 const h=allHands.find(h=>h.label===(s==='L'?'Left':'Right'));if(!h)return points;
 const measurement=points.map(p=>p.clone()),wrist=points[0],base=-wrist.z;if(!(base>0))return points;
 for(const [id,name] of [[5,'Index1'],[9,'Middle1'],[13,'Ring1'],[17,'Pinky1']])measurement[id].copy(rig.rest[s+name].world).sub(rig.rest[s+'Hand'].world).applyQuaternion(q).add(wrist);
 const focal=1/(2*Math.tan(Math.PI/6)*cameraFrame(captureAspect,camera.aspect).height),o=palmObservation(h.landmarks,measurement,captureAspect,focal);
 const saved=depthExperiment?.recording?null:depthExperiment?.fit;
 const depth=palmDepth.update(s,h.confidence>=.5?o:null,saved,base,h.time),delta=wrist.clone().multiplyScalar((depth-base)/base);
 return points.map(p=>p.clone().add(delta));
}
function applyPalmPlacement(){
 const saved=depthExperiment?.recording?null:depthExperiment?.fit;if(!saved)return;
 for(const s of ['L','R']){
  const result=renderedHands[s]?.result,h=allHands.find(h=>h.label===(s==='L'?'Left':'Right'));if(!result||!h)continue;
  const excess=rearPlaneCorrection(result.points.map(v=>v.toArray()),saved.farDepth,saved.phoneTilt);
  if(excess>0){const wrist=result.points[0],z=-wrist.z;shiftRenderedHand(s,wrist.clone().multiplyScalar(-Math.min(excess,z-.04)/z));result.wallLimited=true;}
 }
}

// Depth offsets and old capture coefficients cannot override this estimator.
for(const [id,value] of Object.entries({handsTouch:false,outerCollision:false,headCollision:false,relaxedPalm:false,lockUpper:true,falseDepth:true,bothHands:true,handDistance:0,handHeight:0,contactThreshold:0,fingerNoise:0,directionSmoothing:0,confirmJump:0,movementThreshold:0,depthSmooth:0,headSmooth:0})){
 const e=$(id);if(!e)continue;if(e.type==='checkbox')e.checked=value;else{e.value=value;if(e.nextElementSibling?.tagName==='OUTPUT')e.nextElementSibling.value=value;}
}
for(const id of ['handDistance','handHeight','relaxedPalm','contactThreshold'])$(id)?.closest('label')?.style.setProperty('display','none','important');

$('cameraProjection').value='perspective';$('viewMode').value='mirror';setViewMode();
