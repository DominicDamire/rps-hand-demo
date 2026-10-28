import * as T from 'three';
// Frozen calibration scale, applied after articulation. Scaling about the
// camera preserves every point's perspective projection and palm spacing.
export function resetHandScale(rig,side){
 const hand=rig.joints[side+'Hand'];hand.userData.captureBaseScale??=hand.scale.clone();
 hand.scale.copy(hand.userData.captureBaseScale);hand.updateWorldMatrix(false,true);
}
export function applyHandScale(rig,side,result,scale=1){
 if(!(scale>0)||scale===1)return result;
 const hand=rig.joints[side+'Hand'],position=hand.getWorldPosition(new T.Vector3()).multiplyScalar(scale);
 hand.position.copy(hand.parent.worldToLocal(position));hand.scale.multiplyScalar(scale);hand.updateWorldMatrix(false,true);
 for(const p of result.points)p.multiplyScalar(scale);
 if(Number.isFinite(result.contactGap))result.contactGap*=scale;
 return result;
}

export function translateHand(rig,side,result,delta){
 const hand=rig.joints[side+'Hand'],d=new T.Vector3().fromArray(delta),target=hand.getWorldPosition(new T.Vector3()).add(d);
 hand.position.copy(hand.parent.worldToLocal(target));hand.updateWorldMatrix(false,true);for(const p of result.points)p.add(d);return result;
}
export function palmSurface(rig,side,palm){
 const ray=new T.Raycaster(new T.Vector3(),palm.clone().normalize(),.01,4),hits=[];
 for(const mesh of rig.parts){if(!mesh.isMesh||!mesh.name.startsWith(side+'Hand'))continue;
  mesh.updateWorldMatrix(true,false);const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],sides=materials.map(m=>m.side);
  try{materials.forEach(m=>m.side=T.DoubleSide);hits.push(...ray.intersectObject(mesh,false));}finally{materials.forEach((m,i)=>m.side=sides[i]);}
 }
 return hits.filter(h=>h.point.distanceTo(palm)<.08).sort((a,b)=>a.distance-b.distance).at(-1)?.point??null;
}
