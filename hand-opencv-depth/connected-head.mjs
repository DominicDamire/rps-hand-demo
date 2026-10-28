import * as T from 'three';
import {Surface} from './connected-rig.mjs?v=demo11d';
import neutral from './neutral-face.mjs';

// Bind neutral decorative landmarks once to the original rigid doll head.
// Tracking rotates its existing joints; this never replaces or resizes geometry.
export function attachDollHead(rig) {
 const head=rig.joints.Head, meshes=rig.parts.filter(m=>/^(Head|Neck|Chest|LClavicle|RClavicle)__/.test(m.name));
 const headMeshes=meshes.filter(m=>m.name.startsWith('Head__'));
 const eye=()=>head.localToWorld(rig.eyeInHead.clone());
 const mean=(a,b)=>new T.Vector3(...neutral[a]).add(new T.Vector3(...neutral[b])).multiplyScalar(.5);
 const a=mean(33,133),b=mean(263,362),mid=a.clone().add(b).multiplyScalar(.5),scale=.063/a.distanceTo(b);
 const surface=new Surface(headMeshes,head),ray=new T.Raycaster(),eyeRest=eye(),local=neutral.map(p=>{
  const n=new T.Vector3(...p).sub(mid).multiplyScalar(scale);
  ray.set(new T.Vector3(eyeRest.x+n.x,eyeRest.y+n.y,eyeRest.z-.5),new T.Vector3(0,0,1));
  const hit=ray.intersectObjects(headMeshes,false)[0];
  const point=hit?.point||surface.closest(eyeRest.clone().add(new T.Vector3(n.x,n.y,-n.z)))?.point;if(!point)throw new Error('Original head surface is unavailable');return head.worldToLocal(point.clone());
 });
 const dots=new T.Points(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(468*3),3)),new T.PointsMaterial({color:0x8ee3bf,size:.002}));
 rig.root.parent.add(dots);dots.layers.set(1);
 return {meshes,dots,eye,viewQuaternion:()=>head.getWorldQuaternion(new T.Quaternion()),update:()=>{
  const points=local.map(p=>head.localToWorld(p.clone()));points.forEach((p,i)=>dots.geometry.attributes.position.setXYZ(i,p.x,p.y,p.z));dots.geometry.attributes.position.needsUpdate=true;return points;
 }};
}
