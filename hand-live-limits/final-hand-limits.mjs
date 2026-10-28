import * as T from 'three';
import {reach,ContactLatch} from '../hand-pnp-photo/contact-direct.mjs?v=photo1';
import {hasVisibleCurl} from './curl-evidence.mjs';
const rad=Math.PI/180,names=['Thumb','Index','Middle','Ring','Pinky'];
export function finalHandLimits(){
 const latch=new ContactLatch();let lastSide=null;
 return function(chains,lengths,rig,side,palmQ,lm,width,height,cfg){
  if(lastSide!==side){latch.contact=null;latch.observation=null;lastSide=side;}
  const frames=[];
  const restAcross=rig.rest[side+'Index1'].world.clone().sub(rig.rest[side+'Pinky1'].world);
  for(let f=1;f<5;f++){
   const forward=rig.rest[side+names[f]+'2'].world.clone().sub(rig.rest[side+names[f]+'1'].world).normalize(),across=restAcross.clone().addScaledVector(forward,-restAcross.dot(forward)).normalize(),normal=new T.Vector3().crossVectors(across,forward).multiplyScalar(side==='R'?1:-1).normalize();
   frames[f]={forward:forward.applyQuaternion(palmQ),across:across.applyQuaternion(palmQ),normal:normal.applyQuaternion(palmQ)};
  }
  function baseAngles(f){const c=chains[f],d=c[1].clone().sub(c[0]).normalize(),b=frames[f];return {flex:Math.atan2(d.dot(b.normal),d.dot(b.forward))/rad,splay:Math.asin(T.MathUtils.clamp(d.dot(b.across),-1,1))/rad};}
  function rotateChildren(c,k,from,to){const q=new T.Quaternion().setFromUnitVectors(from,to),origin=c[k-1].clone();for(let j=k;j<4;j++)c[j].sub(origin).applyQuaternion(q).add(origin);}
  function capUpper(f,k,max){const c=chains[f],a=c[k-1].clone().sub(c[k-2]).normalize(),b=c[k].clone().sub(c[k-1]).normalize(),angle=a.angleTo(b),limit=max*rad;if(angle<=limit+1e-12)return;let axis=new T.Vector3().crossVectors(a,b);if(axis.lengthSq()<1e-12)axis.crossVectors(a,new T.Vector3(1,0,0));if(axis.lengthSq()<1e-12)axis.crossVectors(a,new T.Vector3(0,1,0));axis.normalize();rotateChildren(c,k,b,a.clone().applyAxisAngle(axis,limit));}
  function enforce(){
   if(!cfg.jointLimits)return;
   for(let f=1;f<5;f++){

    const c=chains[f],b=frames[f],a=baseAngles(f),limit=cfg.mcpLimits?.[f-1]??{extension:30,flexion:90,splay:25};
    const crossing=cfg.crossingFingers?.includes(f)&&Math.abs(a.flex)<(cfg.splayStart??45);
    const flex=T.MathUtils.clamp(a.flex,-limit.extension,limit.flexion),dirs=[1,2,3].map(k=>c[k].clone().sub(c[k-1]).normalize()),bend=Math.max(Math.abs(flex),dirs[0].angleTo(dirs[1])/rad,dirs[1].angleTo(dirs[2])/rad),start=cfg.splayStart??45,lock=cfg.splayLock??70,t=T.MathUtils.clamp((bend-start)/Math.max(1,lock-start),0,1),allowed=(crossing?(cfg.crossingSplay??40):limit.splay)*(1-t*t*(3-2*t)),splay=T.MathUtils.clamp(a.splay,-allowed,allowed);
    const target=b.forward.clone().multiplyScalar(Math.cos(flex*rad)*Math.cos(splay*rad)).addScaledVector(b.normal,Math.sin(flex*rad)*Math.cos(splay*rad)).addScaledVector(b.across,Math.sin(splay*rad));rotateChildren(c,1,dirs[0],target.normalize());
    // Final signed hinge projection, after every other positional correction.
    // Use the palm frame for curl sign; preserve all fixed segment lengths.
    const base=c[1].clone().sub(c[0]).normalize();
    const axis=b.across.clone().addScaledVector(base,-b.across.dot(base)).normalize().multiplyScalar(side==='R'?1:-1);
    for(let k=2;k<4;k++){
     const prev=c[k-1].clone().sub(c[k-2]).normalize(),dir=c[k].clone().sub(c[k-1]).normalize();
     if(cfg.upperHinge){
      const signed=Math.atan2(axis.dot(new T.Vector3().crossVectors(prev,dir)),prev.dot(dir));
      // #94 kept the unsigned curl. Restore that bend only when the tracked
      // projected finger is visibly folded; preserve the no-back limit elsewhere.
      const observedCurl=cfg.legacy94Assist&&hasVisibleCurl(lm,1+4*f,width/height);
      const forwardCurl=observedCurl&&signed<0?-signed:signed;
      const angle=T.MathUtils.clamp(forwardCurl,cfg.upperNoBack?0:-Math.PI,(k===2?(cfg.pipCap??110):(cfg.dipCap??80))*rad);
      rotateChildren(c,k,dir,prev.clone().applyAxisAngle(axis,angle).normalize());
     }else {
      if(cfg.upperNoBack){const signed=Math.atan2(axis.dot(new T.Vector3().crossVectors(prev,dir)),prev.dot(dir));if(signed<0)rotateChildren(c,k,dir,dir.clone().applyAxisAngle(axis,-signed));}
      capUpper(f,k,k===2?(cfg.pipCap??110):(cfg.dipCap??80));
     }
    }

   }
   // Thumb is not a finger hinge: retain opposition and sideways motion.
   // Only restrict negative flexion in its own rest frame.
   if(cfg.thumbBackLimit!=null){
    const c=chains[0],rest=rig.rest[side+'Thumb2'].world.clone().sub(rig.rest[side+'Thumb1'].world).normalize().applyQuaternion(palmQ);
    const across=restAcross.clone().applyQuaternion(palmQ).normalize();
    for(let k=1;k<4;k++){
     const prev=k===1?rest:c[k-1].clone().sub(c[k-2]).normalize(),dir=c[k].clone().sub(c[k-1]).normalize();
     const axis=across.clone().addScaledVector(prev,-across.dot(prev)).normalize().multiplyScalar(side==='R'?1:-1);
     if(axis.lengthSq()<1e-10)continue;
     const signed=Math.atan2(axis.dot(new T.Vector3().crossVectors(prev,dir)),prev.dot(dir));
     if(signed < -cfg.thumbBackLimit*rad)rotateChildren(c,k,dir,dir.clone().applyAxisAngle(axis,-cfg.thumbBackLimit*rad-signed));
    }
   }else if(cfg.thumbBackLimit===undefined){capUpper(0,2,cfg.thumbMcpCap??70);capUpper(0,3,cfg.thumbIpCap??80);}
  }
  const before=[1,2,3,4].map(baseAngles);enforce();
  // Thresholds are pixels at 1280 image height, so photo/video use one scale.
  const scale=1280/height,tip=latch.update(lm,lm,width*scale,height*scale,!!cfg.contactEnabled,cfg.contactEnterPx??55,cfg.contactReleasePx??75);
  let gap=null,iterations=0;
  if(tip){
   const finger=tip/4-1;
   // Prefer moving the thumb; keep the observed finger pose whenever reachable.
   for(let j=0;j<32;j++){reach(chains[0],lengths[0],chains[finger][3]);enforce();iterations++;gap=chains[0][3].distanceTo(chains[finger][3]);if(gap<.0001)break;}
   // If needed, share the displacement and reproject onto all joint limits.
   for(let j=0;j<80&&gap>.0001;j++){const target=chains[0][3].clone().add(chains[finger][3]).multiplyScalar(.5);reach(chains[finger],lengths[finger],target);reach(chains[0],lengths[0],target);enforce();iterations++;gap=chains[0][3].distanceTo(chains[finger][3]);}
  }
  enforce();if(tip)gap=chains[0][3].distanceTo(chains[tip/4-1][3]);
  return {before,after:[1,2,3,4].map(baseAngles),tip,gap,iterations,status:tip?(gap<=.001?'connected':'limited by reach/constraints'):'released',observedPixels:tip?Math.hypot((lm[4].x-lm[tip].x)*width*scale,(lm[4].y-lm[tip].y)*height*scale):Math.min(...[8,12,16,20].map(i=>Math.hypot((lm[4].x-lm[i].x)*width*scale,(lm[4].y-lm[i].y)*height*scale)))};
 };
}
