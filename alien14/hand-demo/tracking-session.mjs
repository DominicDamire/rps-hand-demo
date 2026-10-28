// One fresh camera frame per task, at most one inference in flight per worker.
export const defaults = {cameraFps:30,handRate:30,faceRate:30,shoulderRate:30,trackingWidth:480,trackerDelegate:'GPU',overlayRate:30,handPriority:false,uncappedTracking:true,fullBody:false,poseModel:'lite'};
export function startTracking(video, onResult, onStats, getOptions=()=>defaults,captureOptions={}) {
 let stopped=false,handle=null,rafHandle=null,lastCallback=-Infinity,serial=0,lastTime=-1,windowStart=performance.now(),cameraFrames=0,cameraCallbacks=0,lastPresented=null,handStreak=0,lastAccepted=-Infinity,lastClockProgress=performance.now(),capturePolls=0;
 const stats={camera:0,hands:0,face:0,pose:0,delegate:{},ms:{},errors:{}};
 const slots=['hands','face','pose'].map(task=>({task,worker:null,ready:false,busy:false,sent:-Infinity,next:0,count:0,last:-Infinity,canvas:document.createElement('canvas')}));
 function startWorker(s){
  const opts={...defaults,...getOptions()};s.delegate=opts.trackerDelegate;s.fullBody=!!opts.fullBody;s.poseModel=opts.poseModel;
  const url=new URL('./tracker.mjs?v=demo10',import.meta.url);url.searchParams.set('task',s.task);url.searchParams.set('delegate',s.delegate);url.searchParams.set('fullBody',s.fullBody?'1':'0');url.searchParams.set('poseModel',s.poseModel||'lite');
  const w=s.worker=new Worker(url,{type:'module'});
  s.timer=setTimeout(()=>{if(!s.ready){stats.errors[s.task]='Tracker initialization timed out';w.terminate();s.busy=false;}},60000);
  w.onerror=e=>{clearTimeout(s.timer);stats.errors[s.task]=e.message;s.busy=false;s.ready=false;};
  w.onmessage=({data})=>{if(stopped||s.worker!==w)return;
   if(data.type==='ready'){clearTimeout(s.timer);s.ready=true;stats.delegate[s.task]=data.delegate;return;}
   s.busy=false;
   if(data.type==='error'){stats.errors[s.task]=data.message;return;}
   if(data.type==='result'){delete stats.errors[s.task];s.count++;stats.ms[s.task]=data.inferenceMs??data.ms;onResult(data,s.canvas);}
  };w.postMessage({type:'init'});
 }
 const enabled=(s,o)=>+(s.task==='hands'?o.handRate:s.task==='face'?o.faceRate:o.shoulderRate)>0;
 async function dispatch(s,now,opts){
  s.busy=true;s.sent=now;const w=s.worker,width=s.task==='hands'?+opts.trackingWidth:Math.min(320,+opts.trackingWidth);
  try{const c=s.canvas;c.width=width;c.height=Math.max(1,Math.round(width*video.videoHeight/video.videoWidth));if(captureOptions.copyPreview!==false)c.getContext('2d').drawImage(video,0,0,c.width,c.height);
   const time=Math.max(now,s.last+.001);s.last=time;
   let bitmap;try{bitmap=await createImageBitmap(captureOptions.copyPreview===false?video:c,{resizeWidth:c.width,resizeHeight:c.height,resizeQuality:'low'});}catch{}
   if(stopped||s.worker!==w){bitmap?.close();return;}
   if(bitmap)w.postMessage({type:'frame',bitmap,time},[bitmap]);else{if(captureOptions.copyPreview===false)c.getContext('2d').drawImage(video,0,0,c.width,c.height);const image=c.getContext('2d').getImageData(0,0,c.width,c.height);w.postMessage({type:'frame',image,time},[image.data.buffer]);}
  }catch(e){s.busy=false;stats.errors[s.task]=String(e);}
 }
 function tick(now,metadata,force=false){
  if(stopped)return;
  if(video.readyState<2||!video.videoWidth||document.hidden)return;
  const frameTime=metadata?.mediaTime??video.currentTime;
  if(frameTime===lastTime&&!force)return;if(frameTime!==lastTime){lastClockProgress=now;lastTime=frameTime;}lastAccepted=now;if(force)capturePolls++;else cameraCallbacks++;const presented=metadata?.presentedFrames;if(!force)cameraFrames+=Number.isFinite(presented)&&lastPresented!==null?Math.max(1,presented-lastPresented):1;if(Number.isFinite(presented))lastPresented=presented;serial++;
  const opts={...defaults,...getOptions()},due=[];
  for(const s of slots){
   if(!enabled(s,opts)){if(s.worker){s.worker.terminate();clearTimeout(s.timer);s.worker=null;s.ready=s.busy=false;}stats[s.task]=0;continue;}
   if(s.worker&&(s.delegate!==opts.trackerDelegate||s.fullBody!==!!opts.fullBody||s.poseModel!==opts.poseModel)){s.worker.terminate();clearTimeout(s.timer);s.worker=null;s.ready=s.busy=false;}
   if(!s.worker)startWorker(s);
   const rate=+(s.task==='hands'?opts.handRate:s.task==='face'?opts.faceRate:opts.shoulderRate);
   if(s.rate!==rate){s.rate=rate;s.next=now;}
   if(s.ready&&!s.busy&&(opts.uncappedTracking||now>=s.next-1))due.push(s);
  }
  if(opts.handPriority&&slots.some(s=>s.busy))return;
  let chosen=due;if(opts.handPriority){
   const hand=due.find(s=>s.task==='hands'),face=due.find(s=>s.task==='face'),pose=due.find(s=>s.task==='pose');
   // Keep hands first, then a face turn after two hands. Shoulders get an occasional bounded turn.
   const aux=pose&&now-pose.sent>=1000?pose:face||pose;
   chosen=[hand&&(handStreak<2||!aux)?hand:aux||hand].filter(Boolean);
  }
  for(const s of chosen){s.next=Math.max(s.next+1000/s.rate,now);handStreak=s.task==='hands'?handStreak+1:0;dispatch(s,now,opts);}
 }
 // Original standalone capture pattern: RAF drives work; video callbacks are not a gate.
 function fallbackTick(now){if(stopped)return;
  const stalled=now-lastClockProgress>250;
  if(!stalled||now-lastAccepted>=33)tick(now,undefined,stalled);
  rafHandle=requestAnimationFrame(fallbackTick);
 }
 // Initialization and telemetry must not depend on delivery of the first video callback.
 for(const s of slots)if(enabled(s,{...defaults,...getOptions()}))startWorker(s);
 const reportTimer=setInterval(()=>{const now=performance.now(),opts={...defaults,...getOptions()};
  if(now-windowStart>=950){const seconds=(now-windowStart)/1000;stats.camera=Math.round(cameraFrames/seconds);stats.cameraCallbacks=Math.round(cameraCallbacks/seconds);stats.capturePolls=capturePolls;capturePolls=0;stats.cameraCounter='video-clock updates';cameraFrames=0;cameraCallbacks=0;for(const s of slots){stats[s.task]=Math.round(s.count/seconds);s.count=0;}windowStart=now;onStats({...stats,requested:opts.cameraFps,cameraSettings:video.srcObject?.getVideoTracks()[0]?.getSettings()});}
 },1000);

 rafHandle=requestAnimationFrame(fallbackTick);
 return ()=>{stopped=true;clearInterval(reportTimer);if(video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(handle);cancelAnimationFrame(rafHandle);for(const s of slots){clearTimeout(s.timer);s.worker?.terminate();}};
}
