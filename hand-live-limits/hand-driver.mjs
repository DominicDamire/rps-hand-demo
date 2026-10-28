import {reduceFalseDepthBends} from '../hand-sweep-neck/depth-lines.mjs?v=touch2.4.18-final';
import {crossingFingers} from './crossing.mjs?v=cross2';
import {fitFingerSpacing} from './finger-spacing.mjs?v=cross2';
import {HandJitterFilter} from './jitter.mjs?v=jitter1';
import {finalHandLimits} from './final-hand-limits.mjs?v=legacy94';
import {PalmFlipGuard} from '../hand-pnp-photo/palm-flip.mjs?v=flip22';
import {limitBaseSplay} from '../hand-pnp-photo/base-splay-limit.mjs?v=photo1';
import * as T from 'three';
import {DirectionStabilizer,fingerPlane,constrainFinger} from '../hand-pnp-photo/stability.mjs?v=photo1';
import {ContactLatch,fitContact} from '../hand-pnp-photo/contact-direct.mjs?v=photo1';
const FINGERS=['Thumb','Index','Middle','Ring','Pinky'];
export function directDriver(rig,tips){
 const matrices=new Map(rig.parts.map(m=>{m.userData.directRestMatrix??=m.matrix.clone();return [m,m.userData.directRestMatrix];}));let contact=null,lastSide=null,lastShape='';
 const flipGuard=new PalmFlipGuard();let acceptedPose=null;const fingerGuards=new Map();
 const finalLimits=finalHandLimits(),jitter=new HandJitterFilter();
 const finalStabilizer=new DirectionStabilizer();const stabilizer=new DirectionStabilizer(),contactLatch=new ContactLatch();
 return function(points,side,palmQ,dt,{fingerFlipDegrees=0,palmFlipDegrees=0,staticInput=false,confirmDegrees=0,noiseDegrees=1,smoothingMs=0,movementThresholdMm=0,postCaps=false,postCoupling=0,thumbOpposition=0,upperCoupling=0,lockUpper=true,baseSplay=true,contactPixels=0,contactReleasePixels=12,thickness=1,tipInset=0,lm,rays,width,height,fitImage=false,fitAngles=false,experiment={}}){
  if(lastSide!==side){jitter.reset();contact=null;finalStabilizer.values.clear();finalStabilizer.fast.clear();lastSide=side;lastShape='';flipGuard.reset();acceptedPose=null;fingerGuards.clear();}
  experiment={...experiment,crossingFingers:experiment.fingerSpacing&&experiment.allowCrossing!==false?crossingFingers(lm,width/height):[]};
  const palmFlipRejected=flipGuard.update(palmQ.toArray(),lm,performance.now(),palmFlipDegrees,staticInput);
  if(palmFlipRejected&&acceptedPose){const wrist=points[0];points=acceptedPose.offsets.map(p=>p.clone().add(wrist));palmQ.copy(acceptedPose.q);}
  else acceptedPose={q:palmQ.clone(),offsets:points.map(p=>p.clone().sub(points[0]))};
  const p=points.map(v=>v.clone()),chains=[],lengths=[],inversePalm=palmQ.clone().invert();
  // #94 changed only finger-relative depth, leaving Sweep's wrist/palm alone.
  if(experiment.legacy94Assist){const gain=experiment.legacy94Depth??.5;for(let f=0;f<5;f++){const b=1+4*f,z=p[b].z;for(let k=1;k<4;k++)p[b+k].z=z+(p[b+k].z-z)*gain;}}
  // Keep rigid attachments; copy only segment directions from the earlier direct tracker.
  for(let f=0;f<5;f++){
   const name=side+FINGERS[f],base=rig.rest[name+'1'].world.clone().sub(rig.rest[side+'Hand'].world).applyQuaternion(palmQ).add(p[0]);
   // The thumb metacarpal can oppose around the palm base. Its fixed reach
   // follows the observed CMC ray rather than freezing the open-hand spread.
   if(fitImage&&f===0)base.copy(pointOnRay(p[0],rays?.[1]??points[1].clone().normalize(),rig.rest[name+'1'].world.distanceTo(rig.rest[side+'Hand'].world),points[1]));
   if(f===0&&thumbOpposition>0){const observed=points[1].clone().sub(p[0]).normalize(),rest=base.clone().sub(p[0]);base.copy(rest.clone().normalize().lerp(observed,thumbOpposition).normalize().multiplyScalar(rest.length()).add(p[0]));}
   const chain=[base],lens=[];
   for(let k=1;k<=3;k++){const rest=k<3?rig.rest[name+(k+1)].world.clone().sub(rig.rest[name+k].world):tips[name].clone();const length=rest.length()+(k===3?tipInset/1000:0),i=1+4*f+k-1;let dir=points[i+1].clone().sub(points[i]);if(dir.lengthSq()<1e-10)dir=rest.clone().applyQuaternion(palmQ);const movementNoise=Math.atan2(Math.max(0,movementThresholdMm)/1000,Math.max(.001,length))*180/Math.PI;dir.normalize().applyQuaternion(inversePalm);let guard=fingerGuards.get(name+k);if(!guard){guard=new PalmFlipGuard(true);fingerGuards.set(name+k,guard);}if(guard.update(dir.toArray(),lm,performance.now(),fingerFlipDegrees,staticInput))dir.fromArray(guard.accepted);dir=stabilizer.update(name+k,dir,dt,Math.max(noiseDegrees,movementNoise),{observation:lm,confirmDegrees,smoothingMs}).applyQuaternion(palmQ);lens.push(length);chain.push(chain[k-1].clone().addScaledVector(dir,length));}
   chains.push(chain);lengths.push(lens);
  }
  contact=contactLatch.update(lm,lm,width,height,!fitImage&&contactPixels>0,contactPixels,contactReleasePixels);
  // Upper joints of the four fingers are hinges: no added sideways or twist.
  // Establish the allowed plane before solving fingertip contact inside it.
  const restAcross=rig.rest[side+'Index1'].world.clone().sub(rig.rest[side+'Pinky1'].world);
  function restrictBase(f,post=false){
   const chain=chains[f],name=side+FINGERS[f],before=chain[1].clone().sub(chain[0]).normalize(),rest=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize();
   // A fist can have a 40-degree base and a 90-degree middle joint.
   // Folded upper joints also lock base splay, without locking forward flexion.
   const middle=chain[2].clone().sub(chain[1]).normalize(),tip=chain[3].clone().sub(chain[2]).normalize();
   const upperBend=experiment.crossingFingers.includes(f)?0:Math.max(before.angleTo(middle),middle.angleTo(tip))*180/Math.PI;
   const local=before.clone().applyQuaternion(inversePalm),after=new T.Vector3().fromArray((post?limitPostSplay:limitBaseSplay)(local.toArray(),rest.toArray(),restAcross.toArray(),post?(experiment.splayLock??70):70,upperBend,experiment.splayStart)).applyQuaternion(palmQ);
   const correction=new T.Quaternion().setFromUnitVectors(before,after);for(let k=1;k<4;k++)chain[k].sub(chain[0]).applyQuaternion(correction).add(chain[0]);
  }
  if(baseSplay&&!fitImage)for(let f=1;f<5;f++)restrictBase(f);
  const hinges=new Map();
  if(lockUpper&&!fitImage)for(let f=1;f<5;f++){
   const chain=chains[f],baseDirection=chain[1].clone().sub(chain[0]).normalize();
   const name=side+FINGERS[f],restDirection=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize();
   const hinge=fingerPlane(restDirection,restAcross,palmQ,baseDirection);hinges.set(f,hinge);
   if(lockUpper)constrainFinger(chain,lengths[f],hinge,upperCoupling);
  }
  let contactGap=contact?fitContact(chains[0],chains[contact/4-1],lengths[0],lengths[contact/4-1],hinges.get(contact/4-1)):null;
  // A fingertip contact solve must also respect the MCP sideways limit.
  if(contact)for(let f=1;f<5;f++){if(baseSplay)restrictBase(f);if(lockUpper){const name=side+FINGERS[f],rest=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize(),base=chains[f][1].clone().sub(chains[f][0]).normalize(),hinge=fingerPlane(rest,restAcross,palmQ,base);hinges.set(f,hinge);constrainFinger(chains[f],lengths[f],hinge,upperCoupling);}}
  if(contact)contactGap=chains[0][3].distanceTo(chains[contact/4-1][3]);
  // Fit fixed-length segments to the actual image rays. Raw world depth only
  // chooses between the two geometrically possible bends; it cannot move XY.
  if(fitImage)for(let f=0;f<5;f++)for(let k=1;k<4;k++){
   const observed=points[1+4*f+k],ray=rays?.[1+4*f+k]??observed.clone().normalize();
   chains[f][k]=pointOnRay(chains[f][k-1],ray,lengths[f][k-1],observed);
  }
  if(fitAngles)for(let f=0;f<5;f++)for(let k=1;k<4;k++){
   const i=1+4*f+k, a=lm[i-1],b=lm[i],aspect=width/height,focal=experiment.imageFocal??1/(2*Math.tan(Math.PI/6));
   const delta=new T.Vector2((b.x-a.x)*aspect/focal,-(b.y-a.y)/focal);
   chains[f][k]=angleEndpoint(chains[f][k-1],delta,lengths[f][k-1],(p[i].z-p[i-1].z)*(f>0&&k===1&&experiment.proximalDepth!==undefined&&(!experiment.proximalGate||visibleBend(lm,1+4*f,width/height)>25)?experiment.proximalDepth/(experiment.depthHint??.5):1));
  }

  const fitPoints=[p[0].toArray(),...chains.flatMap(c=>c.map(v=>v.toArray()))];
  // Optional depth assistance runs after 2D fitting, before all final constraints.
  if(experiment.depthScaleEnabled||experiment.straightDepth){
   let adjusted=[p[0].clone(),...chains.flatMap(c=>c.map(v=>v.clone()))];
   if(experiment.depthScaleEnabled)for(let f=0;f<5;f++){const b=1+4*f,z=adjusted[b].z;for(let k=1;k<4;k++)adjusted[b+k].z=z+(adjusted[b+k].z-z)*experiment.depthScale;}
   if(experiment.straightDepth)adjusted=reduceFalseDepthBends(adjusted,lm,width,height,true);
   for(let f=0;f<5;f++)for(let k=1;k<4;k++){const i=1+4*f+k,d=adjusted[i].clone().sub(adjusted[i-1]);if(d.lengthSq()>1e-12)chains[f][k].copy(chains[f][k-1]).addScaledVector(d.normalize(),lengths[f][k-1]);}
  }
  // Optional assists run after image fitting so their effects are not overwritten.
  const palmAcross=rig.rest[side+'Index1'].world.clone().sub(rig.rest[side+'Pinky1'].world).normalize();
  const palmAlong=rig.rest[side+'Middle1'].world.clone().sub(rig.rest[side+'Hand'].world).normalize();
  const palmNormal=new T.Vector3().crossVectors(palmAcross,palmAlong).normalize().multiplyScalar(side==='R'?1:-1).applyQuaternion(palmQ);
  const baseBefore=[],baseAfter=[];
  for(let f=1;f<5;f++){
   const c=chains[f],name=side+FINGERS[f],forward=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize().applyQuaternion(palmQ);
   const d=c[1].clone().sub(c[0]).normalize(),signed=Math.atan2(d.dot(palmNormal),d.dot(forward));baseBefore.push(signed*180/Math.PI);
   if(experiment.backLimit!==undefined&&signed < -experiment.backLimit*Math.PI/180){
    const lateral=new T.Vector3().crossVectors(forward,palmNormal).normalize(),sideAmount=d.dot(lateral),radius=Math.sqrt(Math.max(0,1-sideAmount*sideAmount)),angle=-experiment.backLimit*Math.PI/180;
    const target=forward.clone().multiplyScalar(radius*Math.cos(angle)).addScaledVector(palmNormal,radius*Math.sin(angle)).addScaledVector(lateral,sideAmount).normalize();
    const rot=new T.Quaternion().setFromUnitVectors(d,target);for(let k=1;k<4;k++)c[k].sub(c[0]).applyQuaternion(rot).add(c[0]);
   }
   const nd=c[1].clone().sub(c[0]).normalize();baseAfter.push(Math.atan2(nd.dot(palmNormal),nd.dot(forward))*180/Math.PI);
   if(experiment.postPlane>0){
    const hinge=fingerPlane(forward.clone().applyQuaternion(inversePalm),restAcross,palmQ,nd),dirs=[1,2,3].map(k=>c[k].clone().sub(c[k-1]).normalize());
    for(let k=2;k<4;k++){const planar=dirs[k-1].clone().addScaledVector(hinge,-dirs[k-1].dot(hinge));if(planar.lengthSq()>1e-8)dirs[k-1].lerp(planar.normalize(),experiment.postPlane).normalize();c[k].copy(c[k-1]).addScaledVector(dirs[k-1],lengths[f][k-1]);}
   }
  }
  // Matched ordering experiment: apply the existing upper-joint hinge AFTER fitting.
  if(experiment.postHinge)for(let f=1;f<5;f++){
   const name=side+FINGERS[f],rest=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize(),base=chains[f][1].clone().sub(chains[f][0]).normalize(),hinge=fingerPlane(rest,restAcross,palmQ,base);
   constrainFinger(chains[f],lengths[f],hinge,0);
  }
  if(postCaps)for(let f=1;f<5;f++){
   const c=chains[f],d=[1,2,3].map(k=>c[k].clone().sub(c[k-1]).normalize());
   let axis=new T.Vector3().crossVectors(d[0],d[1]);if(axis.lengthSq()<1e-9)continue;axis.normalize();
   const pip=Math.min((experiment.pipCap??110)*Math.PI/180,d[0].angleTo(d[1]));
   let dip=Math.min((experiment.dipCap??80)*Math.PI/180,d[1].angleTo(d[2]));dip=dip*(1-postCoupling)+pip*.65*postCoupling;
   const next=d[0].clone().applyAxisAngle(axis,pip),last=next.clone().applyAxisAngle(axis,dip);
   c[2].copy(c[1]).addScaledVector(next,lengths[f][1]);c[3].copy(c[2]).addScaledVector(last,lengths[f][2]);
  }


  if(experiment.signedUpper)for(let f=1;f<5;f++){
   const c=chains[f],name=side+FINGERS[f],forward=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize().applyQuaternion(palmQ),axis=new T.Vector3().crossVectors(forward,palmNormal).normalize(),original=[1,2,3].map(k=>c[k].clone().sub(c[k-1]).normalize());
   let prev=original[0].clone();for(let k=2;k<4;k++){
    const input=original[k-1],angle=Math.atan2(axis.dot(new T.Vector3().crossVectors(original[k-2],input)),original[k-2].dot(input)),bounded=T.MathUtils.clamp(angle,-(experiment.upperBack??10)*Math.PI/180,(k===2?110:80)*Math.PI/180),target=prev.clone().applyAxisAngle(axis,bounded).normalize(),dir=input.clone().lerp(target,experiment.signedUpper).normalize();
    c[k].copy(c[k-1]).addScaledVector(dir,lengths[f][k-1]);prev=dir;
   }
  }
  if(experiment.postContact){
   const palmPixels=Math.hypot((lm[9].x-lm[0].x)*width,(lm[9].y-lm[0].y)*height);
   const distance=i=>Math.hypot((lm[4].x-lm[i].x)*width,(lm[4].y-lm[i].y)*height);
   const tip=[8,12,16,20].sort((a,b)=>distance(a)-distance(b))[0];
   if(distance(tip)<experiment.postContact*palmPixels){const f=tip/4-1;fitContact(chains[0],chains[f],lengths[0],lengths[f],null);}
  }
  if(experiment.postSmoothMs)for(let f=0;f<5;f++){
   const c=chains[f],dirs=[1,2,3].map(k=>c[k].clone().sub(c[k-1]).normalize());
   for(let k=1;k<4;k++){const dir=finalStabilizer.update(side+f+':'+k,dirs[k-1].applyQuaternion(inversePalm),dt,0,{smoothingMs:experiment.postSmoothMs}).applyQuaternion(palmQ);c[k].copy(c[k-1]).addScaledVector(dir,lengths[f][k-1]);}
  }

  const spacingAudit=fitFingerSpacing(chains,rig,side,palmQ,lm,width,height,experiment);
  jitter.filterFingers(chains,lengths,palmQ,dt,experiment);

  // Final sideways constraint: image fitting, contact, and smoothing cannot undo it.
  // Rotate the complete connected finger at MCP; preserve bone lengths and upper bends.
  const baseSplayAudit=[];
  for(let f=1;f<5;f++){
   const c=chains[f],name=side+FINGERS[f],rest=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize();
   const across=restAcross.clone().addScaledVector(rest,-restAcross.dot(rest)).normalize(),normal=new T.Vector3().crossVectors(across,rest).normalize();
   const dirs=[1,2,3].map(k=>c[k].clone().sub(c[k-1]).normalize()),local=dirs[0].clone().applyQuaternion(inversePalm);
   const upperBend=Math.max(dirs[0].angleTo(dirs[1]),dirs[1].angleTo(dirs[2]))*180/Math.PI;
   const bend=Math.max(Math.abs(Math.atan2(local.dot(normal),local.dot(rest)))*180/Math.PI,upperBend);
   const before=Math.asin(T.MathUtils.clamp(local.dot(across),-1,1))*180/Math.PI;
   if(experiment.postBaseSplay)restrictBase(f,true);
   const after=c[1].clone().sub(c[0]).normalize().applyQuaternion(inversePalm);
   baseSplayAudit.push({finger:FINGERS[f],bend,upperBend,before,after:Math.asin(T.MathUtils.clamp(after.dot(across),-1,1))*180/Math.PI});
  }
  // Later assists cannot bypass the requested base backward limit.
  for(let f=1;f<5;f++){
   const c=chains[f],name=side+FINGERS[f],forward=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize().applyQuaternion(palmQ),dir=c[1].clone().sub(c[0]).normalize();
   let angle=Math.atan2(dir.dot(palmNormal),dir.dot(forward));
   if(experiment.backLimit!==undefined&&angle < -experiment.backLimit*Math.PI/180){
    const lateral=new T.Vector3().crossVectors(forward,palmNormal).normalize(),sideAmount=dir.dot(lateral),radius=Math.sqrt(Math.max(0,1-sideAmount*sideAmount));angle=-experiment.backLimit*Math.PI/180;
    const target=forward.clone().multiplyScalar(radius*Math.cos(angle)).addScaledVector(palmNormal,radius*Math.sin(angle)).addScaledVector(lateral,sideAmount).normalize(),rot=new T.Quaternion().setFromUnitVectors(dir,target);
    for(let k=1;k<4;k++)c[k].sub(c[0]).applyQuaternion(rot).add(c[0]);
   }
   const after=c[1].clone().sub(c[0]).normalize();baseAfter[f-1]=Math.atan2(after.dot(palmNormal),after.dot(forward))*180/Math.PI;
  }
  const finalAudit=lm?finalLimits(chains,lengths,rig,side,palmQ,lm,width,height,experiment):{status:'authored grip',after:[],tip:null,gap:null,observedPixels:0};
  // Palm filtering is a rigid transform of the complete solved hand. Relative
  // joint angles, bone lengths and final fingertip contact remain unchanged.
  const filteredPalm=jitter.filterPalm(palmQ,dt,experiment);
  if(experiment.palmJitter){
   const delta=filteredPalm.clone().multiply(palmQ.clone().invert());
   for(const c of chains)for(const v of c)v.sub(p[0]).applyQuaternion(delta).add(p[0]);
   for(const hinge of hinges.values())hinge.applyQuaternion(delta);
   palmQ.copy(filteredPalm);
  }
  if(experiment.postRoll)for(let f=1;f<5;f++){
   const name=side+FINGERS[f],rest=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize(),d=chains[f][1].clone().sub(chains[f][0]).normalize();hinges.set(f,fingerPlane(rest,restAcross,palmQ,d));
  }
  for(let f=0;f<5;f++)for(let k=0;k<4;k++)p[1+4*f+k].copy(chains[f][k]);
  rig.root.position.set(0,0,0);rig.root.updateMatrixWorld(true);const hand=rig.joints[side+'Hand'];hand.position.copy(hand.parent.worldToLocal(p[0].clone()));rig.setWorldQuat(side+'Hand',palmQ);rig.refresh(hand);
  const shape=side+':'+thickness+':'+tipInset,shapeChanged=shape!==lastShape||rig.directShape?.[side]!==shape;
  for(let f=0;f<5;f++)for(let k=1;k<=3;k++){
   const name=side+FINGERS[f]+k,j=rig.joints[name],i=1+4*f+k-1,rest=k<3?rig.rest[side+FINGERS[f]+(k+1)].world.clone().sub(rig.rest[name].world):tips[side+FINGERS[f]].clone(),axis=rest.clone().normalize();
   const target=p[i+1].clone().sub(p[i]).normalize();j.position.copy(j.parent.worldToLocal(p[i].clone()));const facing=axis.clone().applyQuaternion(palmQ),q=new T.Quaternion().setFromUnitVectors(facing,target).multiply(palmQ);
   if(hinges.has(f)){
    // Two axes specify roll as well as direction, including fully curled tips.
    const restX=restAcross.clone().addScaledVector(axis,-restAcross.dot(axis)).normalize(),worldX=hinges.get(f).clone().addScaledVector(target,-hinges.get(f).dot(target)).normalize();
    const restFrame=new T.Matrix4().makeBasis(restX,axis,new T.Vector3().crossVectors(restX,axis));
    const worldFrame=new T.Matrix4().makeBasis(worldX,target,new T.Vector3().crossVectors(worldX,target));
    q.setFromRotationMatrix(worldFrame.multiply(restFrame.invert()));
   }
   rig.setWorldQuat(name,q);rig.refresh(j);
   // Geometry transforms are changed ONLY by the user's thickness/inset controls.
   if(shapeChanged){const rot=new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),axis));const shapeMatrix=rot.clone().multiply(new T.Matrix4().makeScale(thickness,thickness,1+(k===3?tipInset/1000/rest.length():0))).multiply(rot.clone().invert());for(const m of rig.parts)if(m.parent===j){m.matrixAutoUpdate=false;m.matrix.copy(shapeMatrix).multiply(matrices.get(m));m.matrixWorldNeedsUpdate=true;}}
  }
  lastShape=shape;rig.directShape??={};rig.directShape[side]=shape;rig.root.updateMatrixWorld(true);return {points:p,contact,contactGap,palmFlipRejected,baseBefore,baseAfter,baseSplayAudit,fitPoints,finalAudit,spacingAudit};
 };
}

export function pointOnRay(base,ray,length,hint){
 const along=base.dot(ray),closest=ray.clone().multiplyScalar(along);
 const discriminant=length*length-closest.distanceToSquared(base);
 if(discriminant>=-1e-12){
  const root=Math.sqrt(Math.max(0,discriminant));
  const candidates=[along-root,along+root].filter(t=>t>0).map(t=>ray.clone().multiplyScalar(t));
  candidates.sort((a,b)=>a.distanceToSquared(hint)-b.distanceToSquared(hint));
  if(candidates.length)return candidates[0];
 }
 // Inconsistent observations cannot intersect a fixed-length bone. Preserve
 // bone length and expose projection residual instead of silently stretching.
 return closest.sub(base).normalize().multiplyScalar(length).add(base);
}

function angleEndpoint(base,delta,L,dzHint){
 const d=-base.z, ux=base.x/d,uy=base.y/d;let best=null;
 // Search depth only; every candidate projects along the observed 2D segment.
 for(let step=0;step<=160;step++){
  const dz=-L+2*L*step/160,t=d-dz;if(t<=.001)continue;
  const ax=t*delta.x,ay=t*delta.y,bx=ux*(t-d),by=uy*(t-d);
  const A=ax*ax+ay*ay,B=2*(ax*bx+ay*by),C=bx*bx+by*by+dz*dz-L*L,D=B*B-4*A*C;
  if(A<1e-16||D<0)continue;
  for(const alpha of [(-B+Math.sqrt(D))/(2*A),(-B-Math.sqrt(D))/(2*A)]){
   if(alpha<=0)continue;const score=((dz-dzHint)/L)**2+.12*(alpha-1)**2;
   if(!best||score<best.score)best={score,p:new T.Vector3((ux+alpha*delta.x)*t,(uy+alpha*delta.y)*t,-t)};
  }
 }
 return best?.p??base.clone().add(new T.Vector3(delta.x,delta.y,0).normalize().multiplyScalar(L));
}

function visibleBend(lm,b,aspect){
 const dirs=[0,1,2].map(k=>new T.Vector2((lm[b+k+1].x-lm[b+k].x)*aspect,lm[b+k+1].y-lm[b+k].y).normalize());
 return Math.max(...[0,1].map(k=>Math.acos(T.MathUtils.clamp(dirs[k].dot(dirs[k+1]),-1,1))*180/Math.PI));
}

// Experimental configurable fade; same math as the original 65-to-70 degree limiter.
function limitPostSplay(direction,forwardInput,acrossInput,lock=70,upper=0,start=lock-5){
 const v=new T.Vector3().fromArray(direction).normalize(),forward=new T.Vector3().fromArray(forwardInput).normalize(),across=new T.Vector3().fromArray(acrossInput);
 across.addScaledVector(forward,-across.dot(forward)).normalize();const normal=new T.Vector3().crossVectors(across,forward).normalize();
 const f=v.dot(forward),n=v.dot(normal),a=v.dot(across),r=Math.hypot(f,n),bend=Math.max(Math.abs(Math.atan2(n,f))*180/Math.PI,upper);
 if(r<1e-8||bend<=start)return direction.slice();
 const t=T.MathUtils.clamp((bend-start)/Math.max(.001,lock-start),0,1),angle=Math.atan2(a,r)*(1-t*t*(3-2*t));
 return forward.multiplyScalar(f/r*Math.cos(angle)).addScaledVector(normal,n/r*Math.cos(angle)).addScaledVector(across,Math.sin(angle)).toArray();
}
