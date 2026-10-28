import {fitOneHandPalmSweep,fitPalmSweep} from './palm-sweep-depth.mjs?v=touch2.4.7';
import {PairedSweep,fitPairedSweep,pairedSweepDepth} from './paired-sweep.mjs?v=touch2.4.7';
import {imagePalmSize} from './size-wall-depth.mjs';
import {OneHandSweep,sweepEndpoints} from './one-hand-sweep.mjs?v=touch2.4.7';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export function sweepFailure(samples,aspect){
 const {early,late}=sweepEndpoints(samples);
 if(early.length<3||late.length<3)return 'Missing endpoint hand frames: start '+early.length+'/3, neck '+late.length+'/3.';
 if(early.filter(s=>s.face?.handDepth>0).length<3)return 'Face or rendered hand missing at the extended start. Keep both visible during the countdown.';
 if(late.filter(s=>s.face?.neckDepth>0).length<3)return 'Face missing at the neck endpoint. Keep the hand below the face at the finish.';
 const start=median(early.map(s=>imagePalmSize(s.landmarks,aspect))),end=median(late.map(s=>imagePalmSize(s.landmarks,aspect)));
 if(!(start>end*1.05&&end>0))return 'Palm did not become smaller from camera to neck. Keep the same open-hand orientation throughout.';
 return 'The current model places the extended hand behind the neck endpoint. Capture not applied; previous mapping kept.';
}
export function fitSweep(samples,aspect){
 const {early,late}=sweepEndpoints(samples);
 if(early.length<3||late.length<3)return null;
 const start=median(early.map(s=>imagePalmSize(s.landmarks,aspect))),end=median(late.map(s=>imagePalmSize(s.landmarks,aspect)));
 if(!(start>end*1.05&&end>0))return null;
 const depths=late.map(s=>s.face?.neckDepth).filter(d=>Number.isFinite(d)&&d>.04&&d<4);if(depths.length<3)return null;
 const starts=early.map(s=>s.face?.handDepth).filter(d=>Number.isFinite(d)&&d>.04&&d<4);if(starts.length<3)return null;
 const startDepth=median(starts),endDepth=median(depths);if(endDepth<=startDepth+.005)return null;
 return {version:2,startDepth,endDepth,face:late.find(s=>s.face?.neckDepth>0).face,startSize:start,endSize:end};
}
export function sweepDepth(lm,aspect,fit,fallback){
 const size=imagePalmSize(lm,aspect);if(!fit||!size)return fallback;
 const t=(fit.startSize/size-1)/(fit.startSize/fit.endSize-1);
 return Math.max(.04,Math.min(4,fit.startDepth+t*(fit.endDepth-fit.startDepth)));
}
export function installExperiment({container,getHead,getHandDistance=()=>0,getFocal=()=>1,onReference=()=>{}}){
 const panel=document.createElement('section');panel.style.display='block';panel.innerHTML=`<h2>Sweep calibration</h2><p><b>One-hand method:</b> Hold one extended open hand still during the five-second countdown, palm facing yourself. The start is captured automatically. Then move back toward your shoulder/neck for eight seconds, ONE WAY ONLY. Finish at your neck. Keep your face visible at the start and finish. No return sweep or second hand.</p><p><b>New two-hand test:</b> Extend both hands near the camera, index fingertips touching and pointing toward each other. Hold through the countdown, then move both hands back to the bottom of your neck over eight seconds. Keep the same contact and hand orientation throughout. One way only. The face is not required for this contact-based fit.</p><button id="pairedSweep">Record two-hand sweep (8 seconds)</button><br><button id="touchSweep">Record 8-second sweep to neck</button> <button id="touchReset">Reset capture</button><p id="touchStatus" role="status" aria-live="polite">Ready. No capture yet.</p><progress id="touchProgress" max="8" value="0" aria-label="Sweep recording progress" style="width:100%"></progress>`;container.prepend(panel);
 const $=id=>panel.querySelector('#'+id),oneCapture=new OneHandSweep(),pairCapture=new PairedSweep();let capture=oneCapture,active=null,timer=null,latest={hands:[],face:null,aspect:1};
 function cancel(){clearInterval(timer);timer=null;capture.cancel();$('touchSweep').disabled=false;$('pairedSweep').disabled=false;}
 function tick(){const result=capture.update(performance.now(),latest.hands,latest.face,latest.aspect,getHandDistance()/100);if(!result)return;$('touchStatus').textContent=result.message;$('touchProgress').value=result.progress;
  if(result.done){const paired=capture===pairCapture;cancel();if(result.samples){
   let fit=null;
   if(paired)fit=fitPalmSweep(result.samples.flatMap(s=>['L','R'].map(side=>({observation:s.values[side].observation,depth:s.values[side].depth}))));
   else{const {early,late}=sweepEndpoints(result.samples);fit=fitOneHandPalmSweep(early,late,latest.aspect);}

   if(fit){active=fit;onReference(fit);$('touchStatus').textContent='Sweep saved. One angle-corrected palm-size estimate drives both hands. Rear limit: neck reference + 30 model cm. No orientation-to-depth regression.';}
   else $('touchStatus').textContent='Capture not applied: need visible palm surfaces at the start and neck, and a clear near-to-far size change. Previous reference kept.';
  }}
 }
 function begin(which){cancel();capture=which;capture.begin(performance.now());$('touchSweep').disabled=true;$('pairedSweep').disabled=true;$('touchProgress').value=0;timer=setInterval(tick,100);tick();}
 $('touchSweep').onclick=()=>begin(oneCapture);
 $('pairedSweep').onclick=()=>begin(pairCapture);
 $('touchReset').onclick=()=>{cancel();active=null;onReference(null);$('touchProgress').value=0;$('touchStatus').textContent='Capture reset.';};
 return {get active(){return !!active;},get fit(){return active;},get recording(){return capture.started!==null;},get faceReference(){return active?.face;},cancel,
 depth(side,lm,world,base,aspect){return base;},
 observe(hands,rendered,aspect){const head=getHead(),now=performance.now();let face=null;
  if(head?.face&&now-head.seen<1000&&head.depth>0){const sample=hands.find(h=>(!capture.label||h.label===capture.label)&&now-h.seen<350),points=rendered[sample?.label==='Left'?'L':'R']?.result?.points;
   const offset=points?[0,5,9,13,17].reduce((sum,i)=>sum+points[i].z-points[0].z,0)/5:0;
   // Store the base reference; the independent manual offset is applied once,
   // after sweep depth evaluation, both before and after recording.
   const manual=getHandDistance()/100;
   face={raw:Math.abs(head.face.matrix[14])/100,depth:head.depth,neckDepth:head.depth+offset-manual,handDepth:points?-points[0].z-manual:null};
  }latest={hands:hands.map(h=>({...h,focal:getFocal(aspect),points:rendered[h.label==='Left'?'L':'R']?.result?.points.map(p=>[p.x,p.y,p.z])})),face,aspect};
 }
 };
}
