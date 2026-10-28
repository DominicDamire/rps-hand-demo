import {calibratedReference} from './reference-scale.mjs?v=sizecheck2';
import {fitNeckSweep} from './neck-sweep.mjs?v=sizecheck2';
import {StableCapture,contactCheck} from './capture-check.mjs?v=sizecheck2';
export function installExperiment({container,getHead,getFocal=()=>1,onReference=()=>{},onBegin=()=>{},getNeckReference=()=>null}){
 const panel=document.createElement('section');panel.style.display='block';
 panel.innerHTML=`<h2>Fresh calibration: near → neck → check</h2>
 <p>Keep the phone and head still. Open one hand, palm facing you, fully visible. Capture near first. Then move at your own pace and rest the hand gently against the front of your neck, just below the jaw. Capture neck only when ready. Each capture waits for 2 steady seconds of usable tracking; there is no countdown deadline.</p>
 <button id="touchSweep">1. Capture near pose</button> <button id="captureNeck" disabled>2. Capture neck pose</button> <button id="checkContact" disabled>3. Check touching index fingertips</button> <button id="touchReset">Reset capture</button>
 <label><input id="useSweepReference" type="checkbox" checked> Apply calibration / compare before and after</label>
 <label><input id="useShoulderDistance" type="checkbox"> Use camera-to-shoulders distance</label>
 <label>Phone lens to shoulder centre (cm)<input id="shoulderDistance" type="number" min="10" max="250" step="1" value="50"></label>
 <p>Shoulder distance sets world scale after capture. Scaling size and distance together preserves the mirror image. Depth uses raw wrist/base-knuckle spacing and a fixed model reference, then the captured scale. No angle correction or PnP. Edge-on palms hold the last usable depth. Absolute centimetres remain estimates.</p>
 <p id="touchStatus" role="status" aria-live="polite">No calibration yet. Capture the near pose first.</p>
 <progress id="touchProgress" max="2" value="0" aria-label="Valid steady capture seconds" style="width:100%"></progress>
 <p id="captureResult" role="status">No correction applied.</p>`;
 container.prepend(panel);const $=id=>panel.querySelector('#'+id),capture=new StableCapture();
 let stage=null,label=null,near=null,baseFit=null,active=null,timer=null,latest={hands:[],rendered:{},aspect:1},checks=[],verifyPending=false;
 function message(s){$('touchStatus').textContent=s;}
 function apply(){active=calibratedReference(baseFit,$('useSweepReference').checked,$('useShoulderDistance').checked,+$('shoulderDistance').value);onReference(active);}
 function cancel(){stage=null;clearInterval(timer);timer=null;capture.reset();$('touchSweep').disabled=false;$('captureNeck').disabled=!near;$('checkContact').disabled=!baseFit;}
 function begin(which){cancel();stage=which;capture.reset();checks=[];
  if(which==='near'){near=null;label=null;baseFit=null;active=null;onReference(null);$('captureResult').textContent='Fresh capture: previous correction cleared.';}
  if(which!=='check')onBegin();
  $('touchSweep').disabled=true;$('captureNeck').disabled=true;$('checkContact').disabled=true;$('touchProgress').value=0;
  message(which==='check'?'Touch index fingertips. This checks the model gap without pulling hands together.':'Waiting for a steady '+which+' pose.');timer=setInterval(tick,80);
 }
 function tick(){
  const now=performance.now();
  const fresh=latest.hands.filter(h=>now-h.seen<350);
  if(stage==='check'){
   const c=contactCheck(fresh,latest.rendered,latest.aspect),key=fresh.map(h=>h.time).join('/');
   if(c.error){checks=[];message(c.error);return;}
   if(checks.at(-1)?.key===key)return;
   checks.push({...c,key});$('touchProgress').value=Math.min(2,checks.length/10);
   if(checks.length<20){message('Checking contact: '+checks.length+'/20 frames.');return;}
   const mm=checks.map(c=>c.distance*1000).sort((a,b)=>a-b)[10];cancel();
   message('Contact check '+(mm<=15?'passed':'needs improvement')+': median tracked model-tip gap '+mm.toFixed(1)+' mm. No snapping applied. This does not measure absolute camera distance.');return;
  }
  const h=fresh.find(h=>!label||h.label===label);let reason='';
  if(!h)reason='Waiting for the same hand to be visible.';
  else if(h.confidence<.5)reason='Hand label uncertain.';
  else if(!h.points?.every(p=>p.every(Number.isFinite)))reason='Waiting for reliable front-facing hand points.';
  else if(![0,5,9,13,17].every(i=>h.landmarks[i].x>=0&&h.landmarks[i].x<=1&&h.landmarks[i].y>=0&&h.landmarks[i].y<=1))reason='Move the wrist and knuckles fully inside the camera picture.';
  else if(!h.face)reason='Keep the face visible for the reference.';
  else if(stage==='neck'&&!h.face.neckContact)reason='Waiting for a visible neck reference below the jaw.';
  if(h&&!reason&&!label)label=h.label;
  const r=capture.update(now,h,reason);message(r.message);$('touchProgress').value=r.progress;if(!r.done)return;
  if(stage==='near'){label=h.label;near=r.samples;cancel();message('Near reference captured. Move the same hand to your neck at your own pace, then press 2.');return;}
  const samples=[...near.slice(-5).map((s,i)=>({...s,elapsed:-900+i*100})),...r.samples.slice(-5).map((s,i)=>({...s,elapsed:7200+i*100}))];
  const outcome=fitNeckSweep(samples);cancel();if(!outcome.fit){message('Not applied: '+outcome.error);return;}
  verifyPending=true;baseFit=outcome.fit;$('useSweepReference').checked=true;apply();$('checkContact').disabled=false;
  const offset=active.headOffset.map(v=>(v*100).toFixed(1)).join(', ');
  $('captureResult').textContent='Applied: hands ×'+active.handScale.toFixed(3)+'; head ×'+active.headScale.toFixed(3)+'; head XYZ offset '+offset+' cm. Fitted endpoint residual '+(baseFit.contactResidual*1000).toFixed(1)+' mm. Check the visible result; this residual is not a physical accuracy measurement.';
  message('Calibration applied. Compare before/after, then use step 3 to test both hands.');
 }
 $('touchSweep').onclick=()=>begin('near');$('captureNeck').onclick=()=>begin('neck');$('checkContact').onclick=()=>begin('check');
 $('touchReset').onclick=()=>{cancel();near=null;baseFit=null;active=null;label=null;onReference(null);$('captureNeck').disabled=true;$('checkContact').disabled=true;$('captureResult').textContent='No correction applied.';message('Reset. Capture the near pose first.');};
 for(const id of ['useSweepReference','useShoulderDistance','shoulderDistance'])$(id).onchange=()=>{cancel();apply();message(!baseFit?'Capture near and neck before applying a distance.':!active?'Before: calibration disabled.':$('useShoulderDistance').checked&&!baseFit.shoulderDistance?'No shoulders in capture; distance not applied.':'After: calibration applied. World scale '+(active.handScale/baseFit.handScale).toFixed(3)+'×; mirror appearance is preserved by shared scaling.');};
 return {get active(){return !!active;},get fit(){return active;},get recording(){return stage==='near'||stage==='neck';},get checking(){return stage==='check';},cancel,
 observe(hands,rendered,aspect){
  const head=getHead(),now=performance.now();let face=null;
  if(head?.face?.points&&now-head.seen<350){const p=head.face.points;if([10,152,234,454].every(i=>p[i]&&Number.isFinite(p[i].x)&&Number.isFinite(p[i].y)))face={top:p[10].y,bottom:p[152].y,left:Math.min(p[234].x,p[454].x),right:Math.max(p[234].x,p[454].x)};}
  if(verifyPending&&active&&head){
   const h=hands.find(h=>h.label===label),points=rendered[label==='Left'?'L':'R']?.result?.points;
   if(h&&points){const ref=getNeckReference(h,points,aspect);if(ref){
    const gap=Math.hypot(...ref.palm.map((v,i)=>v-(ref.neck[i]*active.headScale+active.headOffset[i])));
    $('captureResult').textContent+=' Rendered neck-reference gap: '+(gap*1000).toFixed(1)+' mm.';
    if(gap>.03)message('Correction applied, but the rendered neck check failed. Do not treat this capture as accurate.');
    verifyPending=false;
   }}
  }
  latest={aspect,rendered,hands:hands.map(h=>{const result=rendered[h.label==='Left'?'L':'R']?.result,points=result?.points;const f=face?{...face}:null;if(f&&stage==='neck'&&h.label===label&&points)f.neckContact=getNeckReference(h,points,aspect);return {...h,aspect,focal:getFocal(aspect),points:points?.map(p=>[p.x,p.y,p.z]),face:f};})};
 }
 };
}
