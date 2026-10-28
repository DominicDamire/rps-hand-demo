import * as T from 'three';
import {heldAngles} from '../gun-lab/held-pose.mjs?v=4';
import {tipWorld} from '../hand-pnp-photo/contact.mjs?v=photo1';
import {directDriver} from '../hand-live-limits/hand-driver.mjs?v=cross2';
const names=['Thumb','Index','Middle','Ring','Pinky'];
// Keep the final hand's geometry and lengths. The saved grip supplies the
// contact endpoints and roll; free-hand fitting/constraints never run here.
export function savedGripDriver(rig,tips,source,{preserveDirections=false}={}){
 const render=directDriver(rig,tips),skinLengths=new Map();
 function skinLength(name){
  if(skinLengths.has(name))return skinLengths.get(name);
  const axis=tips[name].clone().normalize();let length=tips[name].length();
  for(const mesh of rig.parts.filter(m=>m.parent===rig.joints[name+'3'])){const a=mesh.geometry.attributes.position,matrix=mesh.userData.directRestMatrix??mesh.matrix;for(let i=0;i<a.count;i++)length=Math.max(length,new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(matrix).dot(axis));}
  skinLengths.set(name,length);return length;
 }
 function solve(points,side,palmQ,options){
  const p=points.map(v=>v.clone()),audit=[];
  for(const [f,n]of names.entries()){
   const key=side+n,b=1+4*f,base=rig.rest[key+'1'].world.clone().sub(rig.rest[side+'Hand'].world).applyQuaternion(palmQ).add(p[0]);
   const lengths=[rig.rest[key+'2'].world.distanceTo(rig.rest[key+'1'].world),rig.rest[key+'3'].world.distanceTo(rig.rest[key+'2'].world),skinLength(key)],chain=[base.clone()];
   for(let k=0;k<3;k++)chain.push(chain[k].clone().addScaledVector(points[b+k+1].clone().sub(points[b+k]).normalize(),lengths[k]));
   const weight=preserveDirections?0:f===0?T.MathUtils.clamp(options.authoredThumb??1,0,1):f===1?T.MathUtils.clamp(options.authoredIndex??0,0,1):1;
   const target=chain[3].clone().lerp(points[b+3],weight),before=chain[3].distanceTo(target),total=lengths.reduce((s,v)=>s+v,0);
   const planar=weight>0?fitPlanarContact(chain,lengths,target,f===0?70:110,80):null;
   if(planar){for(let k=0;k<4;k++)chain[k].copy(planar[k]);}
   else if(weight>0&&base.distanceTo(target)<total-1e-6){
    for(let pass=0;pass<160;pass++){
     chain[3].copy(target);for(let k=2;k>=0;k--){const d=chain[k].clone().sub(chain[k+1]).normalize();chain[k].copy(chain[k+1]).addScaledVector(d,lengths[k]);}
     chain[0].copy(base);for(let k=1;k<4;k++){const d=chain[k].clone().sub(chain[k-1]).normalize();chain[k].copy(chain[k-1]).addScaledVector(d,lengths[k-1]);}
     // Adapt contact within the final hand's upper-joint ranges.
     for(const [k,max]of [[2,f===0?70:110],[3,80]]){const a=chain[k-1].clone().sub(chain[k-2]).normalize(),b=chain[k].clone().sub(chain[k-1]).normalize(),angle=a.angleTo(b),cap=max*Math.PI/180;if(angle>cap){const axis=new T.Vector3().crossVectors(a,b).normalize(),to=a.clone().applyAxisAngle(axis,cap),q=new T.Quaternion().setFromUnitVectors(b,to),pivot=chain[k-1];for(let j=k;j<4;j++)chain[j].sub(pivot).applyQuaternion(q).add(pivot);}}
     if(chain[3].distanceTo(target)<1e-7)break;
    }
   }
   audit.push({finger:n,weight,beforeMm:before*1000,gapMm:chain[3].distanceTo(target)*1000,reachable:base.distanceTo(target)<total,target:target.toArray(),skinLength:lengths[2]});
   for(let k=0;k<3;k++)p[b+k].copy(chain[k]);
   // The tracking point sits inside the visible fingertip. Solve skin contact,
   // then convert back to the unchanged tracking-bone length for rendering.
   p[b+3].copy(chain[2]).addScaledVector(chain[3].clone().sub(chain[2]).normalize(),tips[key].length());
  }
  return {points:p,audit};
 }
 const endpoints=new Map(),sourceTips={};
 for(const n of names){const key=source.profile.side+n,axis=source.rig.rest[key+'3'].world.clone().sub(source.rig.rest[key+'2'].world).normalize();let best=null,d=-Infinity;for(const mesh of source.rig.parts.filter(m=>m.parent===source.rig.joints[key+'3'])){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.userData.gripRest??mesh.matrix),t=v.dot(axis);if(t>d){d=t;best=v;}}}sourceTips[key]=best;}
 function endpoint(side,index,thumb){
  source.pose(heldAngles(source.profile,index/source.profile.trigger.gain,thumb),index);const sr=source.rig,S=source.profile.side,q=sr.joints[S+'Hand'].getWorldQuaternion(new T.Quaternion()),rotation=new T.Matrix4().makeScale(side===S?1:-1,1,1).multiply(new T.Matrix4().makeRotationFromQuaternion(q.invert())),origin=sr.joints[S+'Middle1'].getWorldPosition(new T.Vector3()),target=rig.rest[side+'Middle1'].world.clone().sub(rig.rest[side+'Hand'].world),map=p=>p.sub(origin).applyMatrix4(rotation).add(target),points=[new T.Vector3()];
  for(const n of names){for(let k=1;k<=3;k++)points.push(map(sr.joints[S+n+k].getWorldPosition(new T.Vector3())));points.push(map(tipWorld(sr,sourceTips,S,n)));}return solve(points,side,new T.Quaternion(),{authoredIndex:index,authoredThumb:thumb});
 }
 return function(points,side,palmQ,dt,options){
  if(!endpoints.has(side)){
   endpoints.set(side,{released:endpoint(side,0,1),pressed:endpoint(side,1,1),raised:endpoint(side,0,0)});
   source.pose(heldAngles(source.profile,(options.authoredIndex??0)/source.profile.trigger.gain,options.authoredThumb??1),options.authoredIndex??0);
  }
  const poses=endpoints.get(side),p=[points[0].clone()],audit=[];
  for(const [f,n]of names.entries()){
   const b=1+4*f,key=side+n,weight=f===0?T.MathUtils.clamp(options.authoredThumb??1,0,1):f===1?T.MathUtils.clamp(options.authoredIndex??0,0,1):1,from=f===0?poses.raised:poses.released,to=f===1?poses.pressed:poses.released;
   p[b]=rig.rest[key+'1'].world.clone().sub(rig.rest[side+'Hand'].world).applyQuaternion(palmQ).add(p[0]);
   for(let k=0;k<3;k++){const a=from.points[b+k+1].clone().sub(from.points[b+k]).normalize(),z=to.points[b+k+1].clone().sub(to.points[b+k]).normalize(),q=new T.Quaternion().slerp(new T.Quaternion().setFromUnitVectors(a,z),weight),length=k<2?rig.rest[key+(k+2)].world.distanceTo(rig.rest[key+(k+1)].world):tips[key].length();p[b+k+1]=p[b+k].clone().addScaledVector(a.applyQuaternion(q).applyQuaternion(palmQ),length);}
   const target=new T.Vector3().fromArray(from.audit[f].target).lerp(new T.Vector3().fromArray(to.audit[f].target),weight).applyQuaternion(palmQ).add(p[0]);
   audit.push({finger:n,weight,target:target.toArray(),skinLength:skinLength(key),reachable:from.audit[f].reachable&&to.audit[f].reachable,atStop:weight===0||weight===1});
  }
  const result=render(p,side,palmQ,dt,{fitImage:false,fitAngles:false,lockUpper:false,baseSplay:false,noiseDegrees:0,smoothingMs:0,thickness:1,tipInset:0});
  const sr=source.rig,S=source.profile.side,sourcePalm=sr.joints[S+'Hand'].getWorldQuaternion(new T.Quaternion()),mapRotation=new T.Matrix4().makeRotationFromQuaternion(palmQ).multiply(new T.Matrix4().makeScale(side===S?1:-1,1,1)).multiply(new T.Matrix4().makeRotationFromQuaternion(sourcePalm.invert()));
  const across=rig.rest[side+'Index1'].world.clone().sub(rig.rest[side+'Pinky1'].world),sourceAcross=sr.rest[S+'Index1'].world.clone().sub(sr.rest[S+'Pinky1'].world);
  for(const [f,n]of names.entries())for(let k=1;k<=3;k++){
   const name=side+n+k,src=S+n+k,i=1+4*f+k-1,j=rig.joints[name],axis=(k<3?rig.rest[side+n+(k+1)].world.clone().sub(rig.rest[name].world):tips[side+n].clone()).normalize(),srcAxis=(k<3?sr.rest[S+n+(k+1)].world.clone().sub(sr.rest[src].world):sr.rest[src].world.clone().sub(sr.rest[S+n+(k-1)].world)).normalize();
   const srcX=sourceAcross.clone().addScaledVector(srcAxis,-sourceAcross.dot(srcAxis)).normalize().applyQuaternion(sr.joints[src].getWorldQuaternion(new T.Quaternion())).transformDirection(mapRotation);
   const from=points[i+1].clone().sub(points[i]).normalize(),to=result.points[i+1].clone().sub(result.points[i]).normalize();srcX.applyQuaternion(new T.Quaternion().setFromUnitVectors(from,to));srcX.addScaledVector(to,-srcX.dot(to)).normalize();
   const restX=across.clone().addScaledVector(axis,-across.dot(axis)).normalize(),restFrame=new T.Matrix4().makeBasis(restX,axis,new T.Vector3().crossVectors(restX,axis)),worldFrame=new T.Matrix4().makeBasis(srcX,to,new T.Vector3().crossVectors(srcX,to));
   j.position.copy(j.parent.worldToLocal(result.points[i].clone()));rig.setWorldQuat(name,new T.Quaternion().setFromRotationMatrix(worldFrame.multiply(restFrame.invert())));rig.refresh(j);
  }
  rig.root.updateMatrixWorld(true);for(const [f,a]of audit.entries()){const b=1+4*f,tip=result.points[b+2].clone().addScaledVector(result.points[b+3].clone().sub(result.points[b+2]).normalize(),a.skinLength);a.renderedGapMm=tip.distanceTo(new T.Vector3().fromArray(a.target))*1000;}result.savedGripAudit=audit;return result;
 };
}

// Solve a three-bone hinge chain against the authored contact point. Choosing
// the bend nearest the saved directions prevents an arbitrary elbow/finger flip.
function fitPlanarContact(initial,lengths,target,maxPip,maxDip){
 const base=initial[0],offset=target.clone().sub(base),distance=offset.length();if(distance<1e-8)return null;
 const observed=[0,1,2].map(k=>initial[k+1].clone().sub(initial[k]).normalize()),normal=new T.Vector3().crossVectors(observed[0],observed[1]);if(normal.lengthSq()<1e-10)normal.crossVectors(observed[1],observed[2]);
 const along=offset.normalize();normal.addScaledVector(along,-normal.dot(along));if(normal.lengthSq()<1e-10)return null;normal.normalize();
 const [a,b,c]=lengths,rad=Math.PI/180;let best=null;
 function candidate(degrees){
  if(degrees<0||degrees>maxDip)return;
  const dip=degrees*rad,combined=Math.sqrt(b*b+c*c+2*b*c*Math.cos(dip)),cos=(distance*distance-a*a-combined*combined)/(2*a*combined);if(cos< -1||cos>1)return;
  const beta=Math.atan2(c*Math.sin(dip),b+c*Math.cos(dip)),theta=Math.acos(cos),pip=theta-beta;if(pip<0||pip>maxPip*rad)return;
  const start=-Math.atan2(combined*Math.sin(theta),a+combined*Math.cos(theta)),dirs=[start,start+pip,start+pip+dip].map(angle=>along.clone().applyAxisAngle(normal,angle));
  const score=dirs.reduce((sum,v,k)=>sum+v.distanceToSquared(observed[k]),0);if(best&&score>=best.score-1e-12)return;
  const chain=[base.clone()];for(let k=0;k<3;k++)chain.push(chain[k].clone().addScaledVector(dirs[k],lengths[k]));best={score,degrees,chain};
 }
 for(let degrees=0;degrees<=maxDip;degrees++)candidate(degrees);
 if(!best)return null;for(const step of [.1,.01]){const centre=best.degrees;for(let k=-10;k<=10;k++)candidate(centre+k*step);}return best.chain;
}
