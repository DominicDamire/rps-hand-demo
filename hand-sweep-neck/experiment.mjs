import {fitNeckSweep} from './neck-sweep.mjs?v=touch2.4.18-final';
import {OneHandSweep} from './one-hand-sweep.mjs?v=touch2.4.18-final';

export function installExperiment({container,getHead,getFocal=()=>1,onReference=()=>{},onBegin=()=>{},getNeckReference=()=>null}){
 const panel=document.createElement('section');panel.style.display='block';
 panel.innerHTML=`<h2>Front-to-neck sweep · 2.4.18</h2>
 <p>Keep your phone and head still. Extend one open hand toward the camera, palm facing you. Keep the whole hand inside the picture.</p>
 <p>Press Record and hold still for the <b>5-second countdown</b>. Then move the hand <b>back to your neck for 8 seconds, one way</b>. Finish with the palm gently against your neck just below the jaw, keeping the hand and face visible. Hold there for the final second. No upward sweep or return movement.</p>
 <p>The finish jointly fits both hands and the head, neck and shoulders. The wrist and base knuckles estimate depth. Wrist and base knuckles control all hand placement; finger curl only changes articulation. Hand model size and depth change together. The palm surface targets the neck surface without an added gap. The two hands share one fixed scale. The neck reference leaves 30 model cm of space behind it. The phone is assumed to lean back about 10 degrees; this angle is not measured. No extra calibration step.</p>
 <button id="touchSweep">Record sweep to neck (8 seconds)</button> <button id="touchReset">Reset capture</button>
 <p id="touchStatus" role="status" aria-live="polite">Ready. Corrected palm-size depth is active; record to save your neck reference.</p>
 <progress id="touchProgress" max="8" value="0" aria-label="Sweep recording progress" style="width:100%"></progress>`;
 container.prepend(panel);
 const $=id=>panel.querySelector('#'+id),capture=new OneHandSweep();
 let active=null,timer=null,latest={hands:[],face:null,aspect:1};
 function cancel(){const wasRecording=capture.started!==null;clearInterval(timer);timer=null;capture.cancel();$('touchSweep').disabled=false;if(wasRecording)$('touchStatus').textContent='Recording cancelled. Previous reference kept.';}
 function tick(){
  const result=capture.update(performance.now(),latest.hands,latest.face);if(!result)return;
  $('touchStatus').textContent=result.message;$('touchProgress').value=result.progress;
  if(!result.done)return;cancel();
  if(result.samples){const {fit,error}=fitNeckSweep(result.samples);
   if(fit){active=fit;onReference(fit);$('touchStatus').textContent='Saved for both hands. Both hands and the head/neck/shoulders calibrated together at the finishing palm. Hand size and depth share a fixed correction, preserving camera alignment. The fitted transform stays fixed during tracking. Keep the phone in this position.';}
   else $('touchStatus').textContent='Capture not applied. '+error+' Previous reference kept.';
  }
 }
 $('touchSweep').onclick=()=>{cancel();onBegin();capture.begin(performance.now());$('touchSweep').disabled=true;$('touchProgress').value=0;timer=setInterval(tick,100);tick();};
 $('touchReset').onclick=()=>{cancel();active=null;onReference(null);$('touchProgress').value=0;$('touchStatus').textContent='Capture reset. Corrected palm-size depth remains active; no captured rear limit.';};
 return {get active(){return !!active;},get fit(){return active;},get recording(){return capture.started!==null;},cancel,
 observe(hands,rendered,aspect){
  const head=getHead(),now=performance.now();let face=null;
  if(head?.face?.points&&now-head.seen<350){const p=head.face.points;
   if([10,152,234,454].every(i=>p[i]&&Number.isFinite(p[i].x)&&Number.isFinite(p[i].y)))face={top:p[10].y,bottom:p[152].y,left:Math.min(p[234].x,p[454].x),right:Math.max(p[234].x,p[454].x)};
  }
  if(face&&capture.started!==null&&now-capture.started>=12000){const h=hands.find(h=>h.label===capture.label&&now-h.seen<350);
   if(h)face.neckContact=getNeckReference(h,rendered[h.label==='Left'?'L':'R']?.result?.points,aspect);
  }
  latest={hands:hands.map(h=>({...h,aspect,focal:getFocal(aspect),points:rendered[h.label==='Left'?'L':'R']?.result?.points.map(p=>[p.x,p.y,p.z])})),face,aspect};
 }
 };
}
