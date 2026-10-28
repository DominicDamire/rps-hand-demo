import * as T from 'three';
import neutral from './neutral-face.mjs';
export function bindFaceDots(asset,eyes){
 asset.updateWorldMatrix(true,true);
 const eyePoints=eyes.map(b=>b.getWorldPosition(new T.Vector3())).sort((a,b)=>a.x-b.x),mid=eyePoints[0].clone().add(eyePoints[1]).multiplyScalar(.5),ac=(i,j)=>new T.Vector3(...neutral[i]).add(new T.Vector3(...neutral[j])).multiplyScalar(.5),a=ac(33,133),b=ac(263,362),canonicalMid=a.clone().add(b).multiplyScalar(.5),span=eyePoints[0].distanceTo(eyePoints[1]),scale=span/a.distanceTo(b),xAxis=eyePoints[1].clone().sub(eyePoints[0]).normalize(),up=new T.Vector3(0,1,0);up.addScaledVector(xAxis,-up.dot(xAxis)).normalize();const front=new T.Vector3().crossVectors(xAxis,up).normalize();
 const triangles=[];
 asset.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const vertices=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld)),index=mesh.geometry.index,count=index?index.count:vertices.length;for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);triangles.push({mesh,ids,triangle:new T.Triangle(...ids.map(j=>vertices[j]))});}});
 return neutral.map(v=>{
  const local=new T.Vector3(...v).sub(canonicalMid),origin=mid.clone().addScaledVector(xAxis,local.x*scale).addScaledVector(up,local.y*scale).addScaledVector(front,span*10),ray=new T.Ray(origin,front.clone().negate()),hit=new T.Vector3();let selected=null,point=null,best=Infinity;
  for(const record of triangles){if(ray.intersectTriangle(record.triangle.a,record.triangle.b,record.triangle.c,false,hit)){const distance=origin.distanceToSquared(hit);if(distance<best){best=distance;selected=record;point=hit.clone();}}}
  if(!selected){const query=mid.clone().addScaledVector(xAxis,local.x*scale).addScaledVector(up,local.y*scale).addScaledVector(front,local.z*scale);for(const record of triangles){record.triangle.closestPointToPoint(query,hit);const distance=query.distanceToSquared(hit);if(distance<best){best=distance;selected=record;point=hit.clone();}}}
  return {...selected,weights:selected.triangle.getBarycoord(point,new T.Vector3())};
 });
}
export function updateFaceDots(bindings){
 const cache=new Map();for(const {mesh} of bindings)if(!cache.has(mesh)){mesh.skeleton.update();cache.set(mesh,Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld)));}
 return bindings.map(({mesh,ids,weights})=>{const v=cache.get(mesh);return v[ids[0]].clone().multiplyScalar(weights.x).addScaledVector(v[ids[1]],weights.y).addScaledVector(v[ids[2]],weights.z);});
}
