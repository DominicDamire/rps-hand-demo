import * as T from 'three';

// Match lateral landmark positions as well as segment directions. The four
// knuckles stay attached to the fixed palm; a single rotation at each MCP moves
// its whole chain, preserving lengths and internal bends. No finger ordering
// constraint: the observed tip order is allowed to reverse when fingers cross.
export function fitFingerSpacing(chains,rig,side,palmQ,lm,width,height,cfg={}){
 if(!cfg.fingerSpacing)return null;
 const focal=cfg.imageFocal??1/(2*Math.tan(Math.PI/6)),aspect=width/height;
 const project=p=>new T.Vector2(p.x/Math.max(.001,-p.z)*focal,-p.y/Math.max(.001,-p.z)*focal);
 const image=p=>new T.Vector2((p.x-.5)*aspect,p.y-.5);
 const modelBases=[1,2,3,4].map(f=>project(chains[f][0])),imageBases=[5,9,13,17].map(i=>image(lm[i]));
 const axis=modelBases[0].clone().sub(modelBases[3]),observedAxis=imageBases[0].clone().sub(imageBases[3]);
 if(axis.length()<1e-5||observedAxis.length()<.012)return null;
 const scale=axis.length()/observedAxis.length();axis.normalize();observedAxis.normalize();
 const mean=a=>a.reduce((v,p)=>v.add(p),new T.Vector2()).multiplyScalar(.25);
 const modelCentre=mean(modelBases),imageCentre=mean(imageBases);
 const across=rig.rest[side+'Index1'].world.clone().sub(rig.rest[side+'Pinky1'].world).normalize().applyQuaternion(palmQ);
 const along=rig.rest[side+'Middle1'].world.clone().sub(rig.rest[side+'Hand'].world).normalize().applyQuaternion(palmQ);
 const normal=new T.Vector3().crossVectors(across,along).normalize();
 const maximum=(cfg.spacingRange??30)*Math.PI/180,results=[];
 const targetsByFinger=[1,2,3,4].map(f=>[1,2,3].map(k=>image(lm[1+4*f+k]).sub(imageCentre).dot(observedAxis)*scale));
 // The mechanical finger shells are narrower than the photographed fingers.
 // When parallel neighbouring fingers are together, match shell-to-shell spacing
 // instead of leaving the same human centre-line gap between thinner shells.
 const pairs=[];
 if(cfg.adjacentFingers){
  rig.spacingWidths??={};
  if(!rig.spacingWidths[side])rig.spacingWidths[side]=['Index','Middle','Ring','Pinky'].map(name=>{
   const bone=rig.rest[side+name+'3'].world.clone().sub(rig.rest[side+name+'2'].world).normalize();
   const lateral=rig.rest[side+'Index1'].world.clone().sub(rig.rest[side+'Pinky1'].world);lateral.addScaledVector(bone,-lateral.dot(bone)).normalize();
   let lo=Infinity,hi=-Infinity;
   for(const m of rig.parts.filter(m=>m.parent.name===side+name+'2')){
    const a=m.geometry.attributes.position,matrix=m.userData.directRestMatrix??m.matrix;
    for(let i=0;i<a.count;i++){const x=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(matrix).dot(lateral);lo=Math.min(lo,x);hi=Math.max(hi,x);}
   }
   return Number.isFinite(hi-lo)?hi-lo:0;
  });
  for(let f=1;f<4;f++){
   const a=1+4*f,b=a+4,u=image(lm[a+3]).sub(image(lm[a])),v=image(lm[b+3]).sub(image(lm[b]));
   if(u.lengthSq()<1e-8||v.lengthSq()<1e-8)continue;
   const parallel=u.angle()-v.angle(),cos=Math.cos(parallel);if(cos<Math.cos(20*Math.PI/180))continue;
   const direction=u.normalize().add(v.normalize()).normalize(),lateral=new T.Vector2(-direction.y,direction.x);
   const palmWidth=imageBases[0].distanceTo(imageBases[3]);
   const baseOrder=image(lm[b]).sub(image(lm[a])).dot(lateral),tipOrder=image(lm[b+3]).sub(image(lm[a+3])).dot(lateral);
   if(baseOrder*tipOrder<=0)continue; // Never uncross fingers to make a contact.
   const gap=Math.max(...[1,2].map(k=>Math.abs(image(lm[b+k]).sub(image(lm[a+k])).dot(lateral))))/palmWidth;
   const threshold=cfg.adjacentThreshold??.38,strength=1-T.MathUtils.smoothstep(gap,threshold-.04,threshold+.04);
   if(strength<=0)continue;
   const depth=Math.max(.02,-(chains[f][2].z+chains[f+1][2].z)*.5);
   const distance=(rig.spacingWidths[side][f-1]+rig.spacingWidths[side][f])*.5*focal/depth;
   if(distance>0)pairs.push({a:f-1,b:f,distance,strength});
  }
  // Solve a group together so closing one pair does not reopen its neighbour.
  const raw=targetsByFinger.map(t=>t.slice());
  for(let iteration=0;iteration<24;iteration++)for(const pair of pairs)for(let k=0;k<3;k++){
   const a=targetsByFinger[pair.a],b=targetsByFinger[pair.b],original=raw[pair.b][k]-raw[pair.a][k];
   const desired=Math.sign(original)*(Math.abs(original)*(1-pair.strength)+Math.min(Math.abs(original),pair.distance)*pair.strength);
   const correction=(b[k]-a[k]-desired)*.5;a[k]+=correction;b[k]-=correction;
  }
 }
 for(let f=1;f<5;f++){
  const c=chains[f],original=c.map(p=>p.clone()),base=c[0],d=original[1].clone().sub(base).normalize();
  const upper=cfg.crossingFingers?.includes(f)?0:Math.max(d.angleTo(original[2].clone().sub(original[1]).normalize()),original[2].clone().sub(original[1]).normalize().angleTo(original[3].clone().sub(original[2]).normalize()))*180/Math.PI;
  // Keep the established fist driver. Spacing assistance fades as joints curl.
  const bend=Math.max(Math.asin(T.MathUtils.clamp(Math.abs(d.dot(normal)),0,1))*180/Math.PI,upper);
  const weight=1-T.MathUtils.smoothstep(bend,35,70);
  if(weight<=0){results.push({finger:f,angle:0,weight});continue;}
  const targets=targetsByFinger[f-1];
  function error(angle){
   let sum=0;for(let k=1;k<4;k++){
    const v=original[k].clone().sub(base).applyAxisAngle(normal,angle).add(base);
    const delta=project(v).sub(modelCentre).dot(axis)-targets[k-1];sum+=delta*delta*(k===3?2:1);
   }return sum;
  }
  let best=0,bestError=error(0);
  for(let i=-60;i<=60;i++){const a=maximum*i/60,e=error(a);if(e<bestError){best=a;bestError=e;}}
  const before=error(0),angle=best*weight;
  for(let k=1;k<4;k++)c[k].sub(base).applyAxisAngle(normal,angle).add(base);
  results.push({finger:f,angle:angle*180/Math.PI,weight,before,after:error(angle)});
 }
 return results;
}
