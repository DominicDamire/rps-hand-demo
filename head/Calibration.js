// Guided seated/standing setup dialog (DOM ids as on the branch: calibration, setup-*, body-mode, head-mode, the four
// sensitivity sliders and their outputs). Adapted from mirror/head/Calibration.js on the hand-rig-workflow branch for
// rps_hand: no camera ownership (the page already has the camera), no auto-open unless asked, the FOV field writes the
// page's shared HFOV through onHfov (one HFOV for hands and head), and the "measured distance" is replaced by this rule:
// while the centre is captured, the hand tracker's metric depth (handDepth()) is sampled and the head's depth scale
// becomes hand depth / head depth, so hands and head share one depth scale. Without a visible hand the scale is 1.
import {NeutralCapture,median} from './spatial.mjs';
const $=id=>document.getElementById(id);
export class Calibration{
 constructor(head=null,body=null,{autoOpen=true,video=null,onHfov=null,handDepth=null,onCalibrated=null}={}){
  this.head=head;this.body=body;this.video=video;this.onHfov=onHfov;this.handDepth=handDepth;this.onCalibrated=onCalibrated;
  this.dialog=$('calibration');this.stage='closed';
  $('setup-start').onclick=()=>this.begin();
  $('setup-skip').onclick=()=>this.close();
  $('setup-retry').onclick=()=>this.begin();
  $('setup-next').onclick=()=>this.next();
  $('setup-finish').onclick=()=>this.close();
  const opener=$('setup-open');if(opener)opener.onclick=()=>this.open();
  this.dialog.addEventListener('cancel',()=>this.close());
  $('setup-start').disabled=false;$('setup-loading').hidden=true;
  if(autoOpen)this.open();else this.stage='setup';
 }
 attach(head,body){this.head=head;this.body=body;$('setup-start').disabled=false;$('setup-loading').hidden=true;}
 open(){
  this.stage='setup';$('setup-mode').value=$('body-mode').value==='standing'?'standing':'seated';
  this.wasPaused=this.head?.mode==='off';
  if(this.wasPaused){$('head-mode').value='first';$('head-mode').dispatchEvent(new Event('change'));}
  $('setup-loading').hidden=true;
  this.render();this.dialog.showModal();
 }
 begin(){
  if(!this.head){$('setup-loading').hidden=false;$('setup-loading').textContent='Head tracking is not available on this page.';return;}
  const fov=$('setup-fov');if(!fov.reportValidity()||!fov.value)return;
  const distance=$('setup-distance');this.distance=distance&&distance.value?Number(distance.value)/100:null;
  const hfov=Number(fov.value)*Math.PI/180;this.head.hfov=hfov;this.onHfov?.(hfov);
  $('body-mode').value=$('setup-mode').value;$('body-mode').dispatchEvent(new Event('change'));
  this.capture=new NeutralCapture();this.handSamples=[];this.stage='center';this.lastSample=-1;this.ranges=[0,0,0];this.rangeSamples=[[],[],[]];this.render();
 }
 next(){
  if(this.stage==='side'){this.stage='depth';this.render();}
  else if(this.stage==='depth'){
   // Conservative recommendations: observed comfortable lean maps to 15cm.
   // Never amplify tiny/noisy motion; skipped axes retain the existing setting.
   for(const [axis,id,out] of [[0,'lateral-sensitivity','lateral-gain'],[2,'depth-sensitivity','depth-gain']]){
    if(this.ranges[axis]>.035){const gain=Math.max(.5,Math.min(4,Math.round(.15/this.ranges[axis]*4)/4));$(id).value=gain;$(out).textContent=gain+'×';}
   }
   this.stage='done';this.render();
  }
 }
 close(){
  this.stage='closed';this.dialog.close();
  if(this.wasPaused){$('head-mode').value='off';$('head-mode').dispatchEvent(new Event('change'));}
 }
 render(){
  for(const id of ['setup-intro','setup-live','setup-complete'])$(id).hidden=true;
  $('setup-start').hidden=this.stage!=='setup';$('setup-next').hidden=!['side','depth'].includes(this.stage);
  $('setup-retry').hidden=!['side','depth','done'].includes(this.stage);$('setup-finish').hidden=this.stage!=='done';
  $('setup-skip').textContent=this.stage==='setup'?'Skip setup':'Close setup';
  if(this.stage==='setup'){$('setup-intro').hidden=false;$('setup-title').textContent='Set up your seated view';return;}
  if(this.stage==='done'){
   $('setup-title').textContent='Ready to play';$('setup-complete').hidden=false;
   const scale=this.head?.spatial?.scale;
   $('setup-result').textContent=`Your center is saved${scale&&Math.abs(scale-1)>1e-6?` (head depth scaled ${scale.toFixed(2)}× to the hands)`:''}. Left/right ${$('lateral-sensitivity').value}× · forward/back ${$('depth-sensitivity').value}×. Head turn and up/down remain separately adjustable.`;
   return;
  }
  $('setup-live').hidden=false;
  $('setup-title').textContent=this.stage==='center'?'Find your comfortable center':this.stage==='side'?'Lean gently left and right':'Lean gently forward and back';
  $('setup-instruction').textContent=this.stage==='center'?'Keep the phone still. Face forward and relax in your usual playing position for a moment. Hold one hand up beside your face so the head depth can be matched to the hands.':this.stage==='side'?'Keep looking toward the screen and lean each way as far as feels comfortable. Then continue.':'Move your head nearer and farther from the screen without turning. Then continue.';
  $('setup-next').textContent=this.stage==='depth'?'Use this range':'Continue';
 }
 update(now){
  if(!['center','side','depth'].includes(this.stage))return;
  const video=this.video||this.head.video,canvas=$('setup-camera');
  const vw=video?.videoWidth||video?.naturalWidth,vh=video?.videoHeight||video?.naturalHeight;
  if(canvas&&vw&&vh&&(video.readyState==null||video.readyState>=2)){const height=Math.round(canvas.width*vh/vw);if(canvas.height!==height)canvas.height=height;const ctx=canvas.getContext('2d');ctx.save();ctx.translate(canvas.width,0);ctx.scale(-1,1);ctx.drawImage(video,0,0,canvas.width,canvas.height);ctx.restore();}
  const fit=this.head.spatial.latest,stamp=this.head.spatial.seen;
  const status=$('setup-feedback');
  if(this.stage==='center'){
   const done=this.capture.add(fit,stamp,now);$('setup-progress').value=this.capture.progress(now);
   if(stamp!==this.lastSample&&now-stamp<=300){this.lastSample=stamp;const hd=this.handDepth?.();if(Number.isFinite(hd)&&hd>.1)this.handSamples.push(hd);if(!this.capture.started)this.handSamples=[];}
   const hands=this.handSamples.length;
   status.textContent=now-stamp>300?'Keep your whole face visible; waiting for a clear view.':`Hold still · ${Math.round(this.capture.progress(now)*100)}%${hands?' · hand seen (depth matched)':' · no hand: head depth from the eye span'}${this.body?.pose.neutral?' · shoulders ready':''}`;
   if(done){
    const depths=this.capture.samples.map(s=>s.position[2]).sort((a,b)=>a-b),headDepth=depths[Math.floor(depths.length/2)];
    const distance=hands>=8?median(this.handSamples):this.distance,scale=distance?distance/headDepth:1;
    if(scale<.4||scale>2.5){this.stage='setup';this.render();$('setup-loading').hidden=false;$('setup-loading').textContent=`The hand depth (${distance.toFixed(2)} m) differs too much from the head estimate (${headDepth.toFixed(2)} m). Hold the hand beside your face, or lower it to skip the depth match.`;return;}
    this.head.calibrate(this.capture.samples,distance);this.body?.pose.recenter($('body-mode').value);this.onCalibrated?.(scale);this.stage='side';this.render();
   }
  }else{
   if(now-stamp<300&&stamp!==this.lastSample){
    this.lastSample=stamp;const axis=this.stage==='side'?0:2,values=this.rangeSamples[axis];
    values.push(Math.abs(this.head.spatial.target[axis]));
    // Ignore isolated spikes when selecting a comfortable movement extent.
    const sorted=[...values].sort((a,b)=>a-b);this.ranges[axis]=values.length>=8?sorted[Math.floor((sorted.length-1)*.9)]:0;
   }
   const extent=this.ranges[this.stage==='side'?0:2];$('setup-progress').value=Math.min(1,extent/.08);
   status.textContent=now-stamp>300?'Face lost; move back into view.':extent>.035?'Comfortable movement detected. Continue when ready.':'Make a small comfortable lean, or continue to keep the current sensitivity.';
  }
 }
}
