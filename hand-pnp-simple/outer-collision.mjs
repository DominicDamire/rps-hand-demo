import * as T from 'three';
import {ConvexGeometry} from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/geometries/ConvexGeometry.js';
import {convexPenetration,frontClearance,separateHandShells} from './convex-contact.mjs?v=pnpsimple2';
const groups=['Hand',...['Thumb','Index','Middle','Ring','Pinky'].flatMap(f=>[1,2,3].map(i=>f+i))];
function hull(points,node){if(points.length<4)return null;const geometry=new ConvexGeometry(points),p=geometry.attributes.position,n=geometry.attributes.normal,vertices=[],normals=[],seen=new Set(),directions=new Set();
 for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i),key=v.toArray().map(x=>x.toFixed(6)).join(',');if(!seen.has(key)){seen.add(key);vertices.push(v);}const normal=new T.Vector3().fromBufferAttribute(n,i),nk=normal.toArray().map(x=>x.toFixed(3)).join(',');if(!directions.has(nk)){directions.add(nk);normals.push(normal);}}
 geometry.dispose();return {node,vertices,normals};}
function world(h){h.node.updateWorldMatrix(true,false);const normalMatrix=new T.Matrix3().getNormalMatrix(h.node.matrixWorld),vertices=h.vertices.map(v=>v.clone().applyMatrix4(h.node.matrixWorld).toArray()),normals=h.normals.map(v=>v.clone().applyMatrix3(normalMatrix).normalize().toArray());const bounds=[0,1,2].map(i=>[Math.min(...vertices.map(v=>v[i])),Math.max(...vertices.map(v=>v[i]))]);return {vertices,normals,bounds};}
export class OuterCollision{
 constructor(){this.head=[];this.hand={L:[],R:[]};this.shape=null;this.last={head:0,hands:0};}
 build(head,rig,shape,enabled){
  if(enabled.head&&!this.head.length&&head?.loaded){head.group.updateWorldMatrix(true,true);for(const bone of [head.bones.head,head.bones.neck,head.bones.root]){if(!bone)continue;const inverse=bone.matrixWorld.clone().invert(),points=[];
   head.asset.traverse(mesh=>{if(!mesh.isSkinnedMesh||/eye|teeth|tongue/i.test(mesh.name))return;const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    for(let i=0;i<ids.count;i++){let weight=0,eye=0;for(let k=0;k<4;k++){const b=mesh.skeleton.bones[ids.getComponent(i,k)],w=weights.getComponent(i,k);if(b===bone)weight+=w;if(head.bones.eyes.includes(b))eye+=w;}if(weight>=.15&&eye<.5)points.push(mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));}
   });const h=hull(points,bone);if(h)this.head.push(h);}}
  if(this.shape!==shape){for(const side of ['L','R']){this.hand[side]=[];for(const group of groups){const node=rig.joints[side+group];node.updateWorldMatrix(true,false);const inverse=node.matrixWorld.clone().invert(),points=[];
    for(const mesh of rig.parts){if(mesh.parent!==node||mesh.userData.hiddenThumbBase)continue;mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)points.push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));}
    const h=hull(points,node);if(h)this.hand[side].push(h);
   }}this.shape=shape;}
 }
 resolve(head,rig,visible,shift,paired,shape,enabled={head:true,hands:true}){
  this.build(head,rig,shape,enabled);const worldHead=enabled.head&&head?.group.visible?this.head.map(world):[],sides=['L','R'].filter(s=>visible[s]);let headHits=0,handHits=0;
  // Each piece is an exterior convex shell. Never collide parts of the SAME hand.
  for(let pass=0;pass<4;pass++){
   let moved=false;
   for(const side of (paired&&sides.length===2?[]:sides)){const shells=this.hand[side].map(world);let best=null;for(const a of shells)for(const b of worldHead){const hit=convexPenetration(a,b);if(hit&&(!best||hit.depth>best.depth))best=hit;}
    if(best&&best.depth>.00005){const delta=new T.Vector3().fromArray(best.delta);shift(side,delta);headHits++;moved=true;}}
   if(enabled.hands&&sides.length===2){const hit=separateHandShells(this.hand.L.map(world),this.hand.R.map(world));
    if(hit){const delta=new T.Vector3().fromArray(hit.delta).multiplyScalar(.5);shift('L',delta);shift('R',delta.clone().negate());handHits++;moved=true;}}

   if(paired&&sides.length===2&&worldHead.length){const z=frontClearance([...this.hand.L.map(world),...this.hand.R.map(world)],worldHead);if(z){const delta=new T.Vector3(0,0,z);shift('L',delta);shift('R',delta);headHits++;moved=true;}}
   if(!moved)break;
  }
  // Final head barrier after pair/hand separation. It also catches a tracker
  // jump completely through the face, which overlap-only tests would miss.
  if(worldHead.length){
   const batches=paired&&sides.length===2?[sides]:sides.map(s=>[s]);
   for(const batch of batches){const z=frontClearance(batch.flatMap(s=>this.hand[s].map(world)),worldHead);if(z){for(const side of batch)shift(side,new T.Vector3(0,0,z));headHits++;}}
  }
  // Head correction can introduce a new hand overlap. Resolve it once for
  // the full compounds, then move both forward together if the head needs room.
  if(enabled.hands&&sides.length===2){const hit=separateHandShells(this.hand.L.map(world),this.hand.R.map(world));if(hit){const d=new T.Vector3().fromArray(hit.delta).multiplyScalar(.5);shift('L',d);shift('R',d.clone().negate());handHits++;}
   if(worldHead.length){const z=frontClearance([...this.hand.L.map(world),...this.hand.R.map(world)],worldHead);if(z){for(const side of sides)shift(side,new T.Vector3(0,0,z));headHits++;}}
  }
  const remaining=worldHead.length?sides.reduce((n,s)=>n+this.hand[s].map(world).filter(a=>worldHead.some(b=>convexPenetration(a,b))).length,0):0;
  this.last={head:headHits,hands:handHits,remaining};return this.last;
 }
}
