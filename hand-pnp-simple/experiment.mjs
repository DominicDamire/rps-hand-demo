import {calibratedReference} from './reference-scale.mjs?v=pnpsimple2';
import {fitNeckSweep} from './neck-sweep.mjs?v=pnpsimple2';
import {OneHandSweep} from './one-hand-sweep.mjs?v=pnpsimple2';

export function installExperiment({container,getHead,getFocal=()=>1,onReference=()=>{},onBegin=()=>{},getNeckReference=()=>null}){
 const panel=document.createElement('section');panel.style.display='block';
 panel.innerHTML=`<h2>PnP Simple · sweep calibration</h2>
 <p>Keep your phone and head still. Extend one open hand toward the camera, palm facing you. Keep the whole hand inside the picture.</p>
 <p>Press Record and hold still for the <b>5-second countdown</b>. Then move the hand <b>back to your neck for 8 seconds, one way</b>. Finish with the palm gently against your neck just below the jaw, keeping the hand and face visible. Hold there for the final second. No upward sweep or return movement.</p>
 <p>PnP continuously fits palm rotation and position. The sweep calibrates both hands and the head/neck/shoulders together. Optional shoulder distance sets their shared scale. No contact snapping, collision pushes or rear wall. Camera intrinsics remain approximate.</p>
 <label><input id="useSweepReference" type="checkbox" checked> Use saved sweep calibration</label><label><input id="useShoulderDistance" type="checkbox"> Use camera-to-shoulders distance</label><label>Phone lens to shoulder centre (cm)<input id="shoulderDistance" type="number" min="10" max="250" step="1" value="50"></label><p>Optional measured reference at the finishing pose. Scales hands and bust together without changing their camera alignment. Requires a sweep with visible shoulders. Turning it off restores the original sweep scale. This changes world units, not apparent size in the camera mirror. It requires a successful sweep first.</p>
 <button id="touchSweep">Record sweep to neck (8 seconds)</button> <button id="touchReset">Reset capture</button>
 <p id="touchStatus" role="status" aria-live="polite">Ready. OpenCV palm pose fitting is active; record to save your neck reference.</p>
 <progress id="touchProgress" max="8" value="0" aria-label="Sweep recording progress" style="width:100%"></progress>`;
 container.prepend(panel);
 const $=id=>panel.querySelector('#'+id),capture=new OneHandSweep();
 let active=null,baseFit=null,timer=null,latest={hands:[],face:null,aspect:1};
 function cancel(){const wasRecording=capture.started!==null;clearInterval(timer);timer=null;capture.cancel();$('touchSweep').disabled=false;if(wasRecording)$('touchStatus').textContent='Recording cancelled. Previous reference kept.';}
 function tick(){
  const result=capture.update(performance.now(),latest.hands,latest.face);if(!result)return;
  $('touchStatus').textContent=result.message;$('touchProgress').value=result.progress;
  if(!result.done)return;cancel();
  if(result.samples){const {fit,error}=fitNeckSweep(result.samples);
   if(fit){baseFit=fit;active=calibratedReference(baseFit,$('useSweepReference').checked,$('useShoulderDistance').checked,+$('shoulderDistance').value);onReference(active);$('touchStatus').textContent='Saved for both hands. Both hands and the head/neck/shoulders calibrated together at the finishing palm. Hand size and depth share a fixed correction, preserving camera alignment. The fitted transform stays fixed during tracking. Keep the phone in this position.';}
   else $('touchStatus').textContent='Capture not applied. '+error+' Previous reference kept.';
  }
 }
 $('touchSweep').onclick=()=>{cancel();onBegin();capture.begin(performance.now());$('touchSweep').disabled=true;$('touchProgress').value=0;timer=setInterval(tick,100);tick();};
 $('touchReset').onclick=()=>{cancel();baseFit=null;active=null;onReference(null);$('touchProgress').value=0;$('touchStatus').textContent='Capture reset. Live PnP remains active; no saved sweep reference.';};
 for(const id of ['useSweepReference','useShoulderDistance','shoulderDistance'])$(id).onchange=()=>{cancel();active=calibratedReference(baseFit,$('useSweepReference').checked,$('useShoulderDistance').checked,+$('shoulderDistance').value);onReference(active);$('touchStatus').textContent=!baseFit?'Record a sweep to apply this reference.':!active?'Saved sweep disabled; live estimation continues.':$('useShoulderDistance').checked&&!baseFit.shoulderDistance?'Shoulder distance unavailable in this capture. Record again with shoulders visible. Original sweep scale kept.':'Reference applied to both hands and bust. '+(active.distanceReference?'Camera-to-shoulders: '+$('shoulderDistance').value+' cm; world scale '+(active.handScale/baseFit.handScale).toFixed(3)+'×. Camera appearance stays the same.':'Original sweep scale.');};
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
