import * as THREE from 'three';
export function buildTips(rig){rig.root.updateMatrixWorld(true);const out={};for(const S of ['R','L'])for(const f of ['Thumb','Index','Middle','Ring','Pinky']){const j=rig.joints[S+f+'3'],origin=rig.rest[S+f+'3'].world,dir=origin.clone().sub(rig.rest[S+f+'2'].world).normalize(),points=[];let max=-Infinity;for(const m of rig.parts.filter(m=>!m.userData.hiddenThumbBase&&m.name.startsWith(S+f+'3__'))){const attr=m.geometry.attributes.position;for(let i=0;i<attr.count;i++){const v=new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(m.matrixWorld);const d=v.clone().sub(origin).dot(dir);points.push([v,d]);max=Math.max(max,d);}}if(!points.length)throw Error('Missing fingertip geometry: '+S+f);const tip=points.reduce((best,p)=>p[1]>best[1]?p:best,points[0])[0].clone();out[S+f]=j.worldToLocal(tip);}return out;}
export function tipWorld(rig,tips,side,finger){return rig.joints[side+finger+'3'].localToWorld(tips[side+finger].clone());}
// Preserve the original connected metacarpal and both outer thumb segments.
export function tuckThumb(rig){
 for(const S of ['R','L']){
  const j=rig.joints[S+'Thumb1'];
  if(!j.userData.raisedThumb){const shift=rig.rest[S+'Middle1'].world.clone().sub(rig.rest[S+'Hand'].world).normalize().multiplyScalar(.004);for(const k of [1,2,3])rig.rest[S+'Thumb'+k].world.add(shift);j.userData.raisedThumb=true;}
  j.position.copy(rig.rest[S+'Thumb1'].world).sub(rig.rest[S+'Hand'].world);
 }
 for(const m of rig.parts)if(/^[RL]Thumb1__/.test(m.name))m.userData.hiddenThumbBase=false;
 rig.root.updateMatrixWorld(true);
}
// Bounded fitting of true mesh endpoints, without moving joints apart or stretching bones.
export function fitPinch(rig,tips,side,values,basis,limits,finger='Index'){const names=['Thumb1','Thumb2','Thumb3',finger+'1',finger+'2',finger+'3'],start=structuredClone(values),work=structuredClone(values),hand=rig.joints[side+'Hand'];
 const update=()=>{for(const n of names){const q=basis(n),v=work[n];rig.joints[side+n].quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...v.map(x=>x*Math.PI/180),'XYZ'))).multiply(q.clone().invert());}hand.updateMatrixWorld(true);};
 const gap=()=>tipWorld(rig,tips,side,'Thumb').distanceToSquared(tipWorld(rig,tips,side,finger));
 const score=()=>gap()+names.reduce((s,n)=>s+work[n].reduce((v,a,i)=>v+(a-start[n][i])**2*1e-9,0),0);
 update();let best=score();const initial=Math.sqrt(gap());for(const step of [24,12,6,3,1.5,.75,.25])for(let pass=0;pass<2;pass++)for(const n of names)for(const axis of (n.endsWith('1')||n==='Thumb2'?[0,1]:[0])){const old=work[n][axis];let winner=old;const l=limits[n][axis],min=l.enabled?l.min:n.startsWith('Thumb')?-100:axis===0?0:-40,max=l.enabled?l.max:n.startsWith('Thumb')?100:axis===0?100:40;for(const sign of [-1,1]){work[n][axis]=Math.max(min,Math.min(max,old+sign*step));update();const next=score();if(next<best){best=next;winner=work[n][axis];}}work[n][axis]=winner;update();}
 return {angles:work,initial,gap:Math.sqrt(gap())};}

export function fitThumb(rig,tips,side,values,basis,limits,targets){const names=['Thumb1','Thumb2','Thumb3'],work=structuredClone(values),hand=rig.joints[side+'Hand'];
 const update=()=>{for(const n of names){const q=basis(n),v=work[n];rig.joints[side+n].quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...v.map(x=>x*Math.PI/180),'XYZ'))).multiply(q.clone().invert());}hand.updateMatrixWorld(true);};
 const gap=()=>tipWorld(rig,tips,side,'Thumb').distanceToSquared(targets[2]);
 const score=()=>gap()*6+rig.joints[side+'Thumb3'].getWorldPosition(new THREE.Vector3()).distanceToSquared(targets[1])*.35+rig.joints[side+'Thumb2'].getWorldPosition(new THREE.Vector3()).distanceToSquared(targets[0])*.15;
 update();const initial=Math.sqrt(gap());let best=score();for(const step of [32,16,8,4,2,1])for(let pass=0;pass<2;pass++)for(const n of names)for(const axis of (n==='Thumb3'?[0]:[0,1])){const old=work[n][axis],l=limits[n][axis];let winner=old;for(const sign of [-1,1]){work[n][axis]=Math.max(l.enabled?l.min:-120,Math.min(l.enabled?l.max:120,old+step*sign));update();const next=score();if(next<best){best=next;winner=work[n][axis];}}work[n][axis]=winner;update();}return {angles:work,initial,gap:Math.sqrt(gap())};}
