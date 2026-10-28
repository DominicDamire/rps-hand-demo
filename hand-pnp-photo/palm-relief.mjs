import * as T from 'three';
const fingers=['Thumb','Index','Middle','Ring','Pinky'];
// The screenshot constrains XY, not depth. Keep the original model's depth
// relief instead of turning the wrist and all knuckles into a flat PnP target.
export function restorePalmRelief(rig,old,oldTips,sectionAt){
 const {targets,report}=rig.photoReference;
 for(const s of ['R','L']){
  const pts=targets[s],origin=pts[0],normal=new T.Vector3().fromArray(report[s].centrePlane);
  const offsets=pts.map((p,i)=>{if(!i)return 0;const f=fingers[Math.floor((i-1)/4)],k=(i-1)%4+1;const v=k<4?old[s+f+k]:old[s+f+'3'].clone().add(oldTips[s+f]);return v.clone().sub(origin).dot(normal);});
  if(s==='L')for(let i=0;i<21;i++)offsets[i]=-report.R.depthOffsets[i];
  const snapshots=new Map();
  for(const m of rig.parts.filter(m=>m.name.startsWith(s)&&/^[RL](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name))){
   const a=m.geometry.attributes.position,vs=Array.from({length:a.count},(_,i)=>new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld));
   const match=m.name.match(/^[RL](Thumb|Index|Middle|Ring|Pinky)([123])__/);
   for(const v of vs){
    let d=0;
    if(match){const i=1+fingers.indexOf(match[1])*4+Number(match[2])-1,axis=pts[i+1].clone().sub(pts[i]);const t=T.MathUtils.clamp(v.clone().sub(pts[i]).dot(axis)/axis.lengthSq(),0,1);d=offsets[i]+t*(offsets[i+1]-offsets[i]);}
    else if(m.name.startsWith(s+'Hand__palm')){
     let sum=0;for(const i of [0,1,5,9,13,17]){const delta=v.clone().sub(pts[i]);delta.addScaledVector(normal,-delta.dot(normal));const w=1/Math.max(1e-16,delta.lengthSq()**2);sum+=w;d+=w*offsets[i];}d/=sum;
    }
    v.addScaledVector(normal,d);
   }
   snapshots.set(m,vs);
  }
  for(let i=0;i<21;i++)pts[i].addScaledVector(normal,offsets[i]);
  for(let i=0;i<21;i++){if(i&&i%4===0)continue;const name=i===0?s+'Hand':s+fingers[Math.floor((i-1)/4)]+((i-1)%4+1);rig.rest[name].world.copy(pts[i]);}
  for(let i=0;i<21;i++){if(i&&i%4===0)continue;const name=i===0?s+'Hand':s+fingers[Math.floor((i-1)/4)]+((i-1)%4+1),j=rig.joints[name];j.position.copy(pts[i]);const parent=rig.rest[j.parent.name];if(parent)j.position.sub(parent.world);}
  rig.root.updateMatrixWorld(true);
  for(const [m,vs]of snapshots){const inverse=m.parent.matrixWorld.clone().invert(),a=m.geometry.attributes.position;for(let i=0;i<vs.length;i++){const p=vs[i].applyMatrix4(inverse);a.setXYZ(i,p.x,p.y,p.z);}a.needsUpdate=true;m.geometry.computeVertexNormals();m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();}
  report[s].depthOffsets=offsets;report[s].points=pts.map(p=>p.toArray());
 }
 // Rebind the joints to the actual paired triangle surfaces. Interpolating a
 // curved shell can differ slightly from interpolating its control-point depths.
 const geometry=new Map();for(const m of rig.parts.filter(m=>/^[RL](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name))){const a=m.geometry.attributes.position;geometry.set(m,Array.from({length:a.count},(_,i)=>new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld)));}
 for(const s of ['R','L']){
  const r=report[s],normal=new T.Vector3(...r.centrePlane),x=new T.Vector3(...r.cameraRight),y=new T.Vector3(...r.cameraUp),pts=targets[s];
  for(let i=0;i<21;i++){
   const prefix=i===0?s+'Hand__palm':s+fingers[Math.floor((i-1)/4)];let best=null;
   for(const [m,vs]of geometry){if(!m.name.startsWith(prefix))continue;const pair=sectionAt(m,vs,pts[i],x,y,normal);if(pair&&(!best||pair[1]-pair[0]>best[1]-best[0]))best=pair;}
   if(!best)throw Error('Missing palm thickness surfaces at '+s+i);
   const correction=(best[0]+best[1])/2-pts[i].dot(normal);pts[i].addScaledVector(normal,correction);r.depthOffsets[i]+=correction;
  }
  for(let i=0;i<21;i++){if(i&&i%4===0)continue;const n=i===0?s+'Hand':s+fingers[Math.floor((i-1)/4)]+((i-1)%4+1);rig.rest[n].world.copy(pts[i]);}
  for(let i=0;i<21;i++){if(i&&i%4===0)continue;const n=i===0?s+'Hand':s+fingers[Math.floor((i-1)/4)]+((i-1)%4+1),j=rig.joints[n];j.position.copy(pts[i]);if(rig.rest[j.parent.name])j.position.sub(rig.rest[j.parent.name].world);}
  r.points=pts.map(p=>p.toArray());r.wristAnchorShiftMm=pts[0].distanceTo(old[s+'Hand'])*1000;
 }
 rig.root.updateMatrixWorld(true);
 for(const [m,vs]of geometry){const inverse=m.parent.matrixWorld.clone().invert(),a=m.geometry.attributes.position;for(let i=0;i<vs.length;i++){const p=vs[i].applyMatrix4(inverse);a.setXYZ(i,p.x,p.y,p.z);}a.needsUpdate=true;m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();}
 rig.root.updateMatrixWorld(true);
}
