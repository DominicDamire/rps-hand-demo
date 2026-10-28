import * as T from 'three';
import {TipPairs} from './tip-pairs.mjs?v=predict1';
import {reach} from '../hand-pnp-photo/contact-direct.mjs?v=photo1';
import {finalHandLimits} from '../hand-live-limits/final-hand-limits.mjs?v=constraints3';
import {crossingFingers} from '../hand-live-limits/crossing.mjs?v=cross2';
const names=['Thumb','Index','Middle','Ring','Pinky'];
export function installTwoHandMagnets({container,rig,hands,rendered,aspect,config,isPaused}){
 const cfg={enabled:false,enter:45,release:70,confirm:80,maxShift:.12},matcher=new TipPairs(),caps={L:finalHandLimits(),R:finalHandLimits()};
 const panel=document.createElement('fieldset');panel.innerHTML='<legend>Fingertip magnets between hands</legend><label><input type="checkbox"> Join fingertips across both hands</label><p>Index to index, or up to five fingertip pairs at once. Each fingertip joins only one on the other hand. Pull apart to release. Pixels use a 1280-pixel-high image, matching the thumb contact controls.</p>';container.prepend(panel);
 panel.querySelector('input').onchange=e=>{cfg.enabled=e.target.checked;matcher.reset();};
 for(const [key,label,min,max,step,factor]of [['enter','Two-hand connect distance (px)',0,120,1,1],['release','Two-hand release distance (px)',0,180,1,1],['confirm','Two-hand contact confirmation (ms)',0,400,20,1],['maxShift','Maximum hand correction (cm)',0,25,1,100]]){const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type='number';i.min=min;i.max=max;i.step=step;i.value=cfg[key]*factor;i.onchange=()=>{cfg[key]=T.MathUtils.clamp(Number(i.value)||0,min,max)/factor;cfg.release=Math.max(cfg.enter,cfg.release);matcher.reset();};l.append(i);panel.append(l);}
 const archDirections=new Map();
 const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
 function update(now){
  const all=hands(),left=all.find(h=>h.label==='Left'),right=all.find(h=>h.label==='Right');
  if(isPaused()){matcher.reset();status.textContent='Two-hand magnets paused during calibration or gun handling.';return;}
  const pairs=matcher.update(left,right,aspect(),now,cfg);
  if(!pairs.length){archDirections.clear();status.textContent=cfg.enabled?'Bring fingertips on opposite hands together.':'Two-hand fingertip magnets off.';return;}
  if(!rendered.L||!rendered.R)return;
  const snapshots={},lengths={},chains={},quats={};
  for(const S of ['L','R']){snapshots[S]=rendered[S].result.points.map(p=>p.clone());chains[S]=names.map((_,f)=>snapshots[S].slice(1+4*f,5+4*f).map(p=>p.clone()));lengths[S]=chains[S].map(c=>[1,2,3].map(k=>c[k].distanceTo(c[k-1])));quats[S]=rig.joints[S+'Hand'].getWorldQuaternion(new T.Quaternion());}
  // First remove the shared position/depth error, then solve every participating
  // finger. Neither bone lengths nor the captured calibration are changed.
  const delta=new T.Vector3();for(const p of pairs)delta.add(snapshots.R[p.b].clone().sub(snapshots.L[p.a]));delta.multiplyScalar(.5/pairs.length).clampLength(0,cfg.maxShift);
  const shifts={L:delta,R:delta.clone().negate()};
  for(const S of ['L','R'])for(const c of chains[S])for(const p of c)p.add(shifts[S]);
  function enforce(S){const h=S==='L'?left:right;caps[S](chains[S],lengths[S],rig,S,quats[S],h.landmarks,aspect()*1280,1280,{...config,contactEnabled:false,crossingFingers:crossingFingers(h.landmarks,aspect())});}
  // Give opposing extended fingers room above their root-to-root line.
  // A reachable shared target avoids the straight-chain FABRIK singularity.
  const targets=new Map();
  const imageStraight=(h,f)=>{const b=1+4*f,p=h.landmarks;const dist=(i,j)=>Math.hypot((p[i].x-p[j].x)*aspect(),p[i].y-p[j].y);const total=dist(b,b+1)+dist(b+1,b+2)+dist(b+2,b+3);return total>1e-6&&dist(b,b+3)/total>.9;};
  function straightTo(chain,lengths,target){const direction=target.clone().sub(chain[0]).normalize();for(let k=1;k<4;k++)chain[k].copy(chain[k-1]).addScaledVector(direction,lengths[k-1]);}

  for(const pair of pairs){
   const l=pair.a/4-1,r=pair.b/4-1,L=chains.L[l],R=chains.R[r],key=pair.a+':'+pair.b;
   const target=L[3].clone().add(R[3]).multiplyScalar(.5),axis=R[0].clone().sub(L[0]),d=axis.length();
   const a=lengths.L[l].reduce((x,y)=>x+y,0),b=lengths.R[r].reduce((x,y)=>x+y,0);
   const ld=L[3].clone().sub(L[0]),rd=R[3].clone().sub(R[0]);
   if(l>0&&r>0&&d>1e-5&&imageStraight(left,l)&&imageStraight(right,r)&&ld.normalize().dot(rd.normalize())<-.3&&d<.98*(a+b)&&d>Math.abs(a-b)){
    axis.divideScalar(d);
    let up=new T.Vector3(0,1,0).addScaledVector(axis,-axis.y);
    if(up.lengthSq()<.01)up.set(0,0,1).addScaledVector(axis,-axis.z);
    up.normalize();
    archDirections.set(key,up.clone());
    const x=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-x*x));
    target.copy(L[0]).addScaledVector(axis,x).addScaledVector(up,height);
    targets.set(key,target);
   }
  }
  let gap=Infinity;
  for(let pass=0;pass<8;pass++){
   for(const pair of pairs){const l=pair.a/4-1,r=pair.b/4-1,target=targets.get(pair.a+':'+pair.b)??chains.L[l][3].clone().add(chains.R[r][3]).multiplyScalar(.5);reach(chains.L[l],lengths.L[l],target);reach(chains.R[r],lengths.R[r],target);}
   enforce('L');enforce('R');
   // Apply the straight contact last: the iterative solver and joint caps must
   // not buckle an explicitly straight tracked finger to reach this target.
   for(const pair of pairs){const target=targets.get(pair.a+':'+pair.b);if(target){const l=pair.a/4-1,r=pair.b/4-1;straightTo(chains.L[l],lengths.L[l],target);straightTo(chains.R[r],lengths.R[r],target);}}
   gap=Math.max(...pairs.map(p=>chains.L[p.a/4-1][3].distanceTo(chains.R[p.b/4-1][3])));if(gap<.0005)break;
  }
  enforce('L');enforce('R');
  for(const S of ['L','R']){
   const result=rendered[S].result,old=snapshots[S],p=[old[0].clone().add(shifts[S]),...chains[S].flat()];
   const savedQ=names.map(n=>[1,2,3].map(k=>rig.joints[S+n+k].getWorldQuaternion(new T.Quaternion())));
   const hand=rig.joints[S+'Hand'];hand.position.copy(hand.parent.worldToLocal(p[0].clone()));rig.refresh(hand);
   for(const [f,n]of names.entries())for(let k=1;k<=3;k++){const i=1+4*f+k-1,j=rig.joints[S+n+k],from=old[i+1].clone().sub(old[i]).normalize(),to=p[i+1].clone().sub(p[i]).normalize(),q=new T.Quaternion().setFromUnitVectors(from,to).multiply(savedQ[f][k-1]);j.position.copy(j.parent.worldToLocal(p[i].clone()));rig.setWorldQuat(S+n+k,q);rig.refresh(j);}
   result.points=p;result.twoHandContact={pairs:pairs.length,gap};
  }
  rig.root.updateMatrixWorld(true);status.textContent=pairs.length+' fingertip pair'+(pairs.length===1?'':'s')+' joined · maximum 3D gap '+(gap*1000).toFixed(1)+' mm'+(gap>.002?' (limited by reach/joint limits)':'');
 }
 return {update,reset:()=>matcher.reset(),cfg};
}
