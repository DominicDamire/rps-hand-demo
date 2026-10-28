import {imagePalmSize} from './size-wall-depth.mjs';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export function validReference(r){return [2,3].includes(r?.version)&&Number.isFinite(r.size)&&r.size>0&&Number.isFinite(r.depth)&&r.depth>=.04&&r.depth<=4&&r.face?.raw>0&&r.face?.depth>0&&(r.version===2||(r.face.mode==='size'&&r.face.size>0));}
export function referenceDepth(lm,world,aspect,r,fallback){const size=imagePalmSize(lm,aspect);return validReference(r)&&size?Math.max(.04,Math.min(4,r.depth*r.size/size)):fallback;}
export class ExtendedReferenceCapture{
 constructor(){this.cancel();}
 cancel(){this.started=null;this.samples=[];this.last=null;this.label=null;}
 begin(now){this.cancel();this.started=now;}
 update(now,hands,face,aspect,rendered){
  if(this.started===null)return null;const elapsed=now-this.started;
  if(elapsed<5000)return {message:'Starting in '+Math.ceil((5000-elapsed)/1000)+' — extend one open hand below your visible face.'};
  if(elapsed>=6500){const samples=this.samples;this.cancel();if(samples.length<8)return {done:true,message:'Not captured. Keep your face and whole hand visible and still; try again.'};
   const size=median(samples.map(s=>s.size));if(samples.some(s=>Math.abs(s.size-size)/size>.2))return {done:true,message:'Hand moved during capture. Hold still and try again.'};
   const faceSample=samples[Math.floor(samples.length/2)].face;
   return {done:true,reference:{version:3,size,depth:median(samples.map(s=>s.depth)),face:{raw:faceSample.raw,size:median(samples.map(s=>s.face.size)),depth:median(samples.map(s=>s.face.depth)),mode:'size'}},message:'Reference captured for both hands and head. Move naturally.'};
  }
  const h=hands.find(h=>(!this.label||h.label===this.label)&&now-h.seen<250&&h.confidence>=.5&&h.landmarks?.length===21&&h.landmarks.every(p=>p.x>.01&&p.x<.99&&p.y>.01&&p.y<.99));
  if(h&&face?.raw>0&&face?.size>0&&face?.modelEyeSpan>0&&h.time!==this.last){const side=h.label==='Left'?'L':'R',points=rendered?.[side]?.result?.points,root=points?.[0],size=imagePalmSize(h.landmarks,aspect),depth=-root?.z;
   const spans=[[0,5],[0,9],[0,13],[0,17],[5,17]].map(([a,b])=>points?.[a]&&points?.[b]?Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y,points[a].z-points[b].z):NaN);
   const palmSpan=median(spans),headDepth=depth*size/palmSpan*face.modelEyeSpan/face.size;
   if(size&&palmSpan>0&&depth>=.04&&depth<=4&&headDepth>=.08&&headDepth<=4){this.label=h.label;this.last=h.time;this.samples.push({size,depth,face:{raw:face.raw,size:face.size,depth:headDepth}});}}
  return {message:'Hold still — capturing hand and face ('+this.samples.length+' samples).'};
 }
}
