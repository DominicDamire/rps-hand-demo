import {measureVideoFrames} from './video-fps.mjs?v=15.3';
import {createFrameSource,videoSourceActive} from './frame-source.mjs?v=1';
// One fresh camera frame per task, at most one inference in flight per worker.
export const defaults = {cameraFps:30,handRate:30,faceRate:30,shoulderRate:30,trackingWidth:480,trackerDelegate:'GPU',overlayRate:30,handPriority:false,uncappedTracking:true,fullBody:false,poseModel:'lite'};
export function startTracking(video, onResult, onStats, getOptions=()=>defaults,captureOptions={}) {
 let stopped=false,handle=null,rafHandle=null,windowStart=performance.now(),cameraCallbacks=0,handStreak=0,capturePolls=0;
 const frameMeter=measureVideoFrames(video),source=createFrameSource(video);
 const stats={camera:0,hands:0,face:0,pose:0,delegate:{},ms:{},age:{},detections:{},errors:{}};
 const slots=['hands','face','pose'].map(task=>({task,worker:null,ready:false,busy:false,sent:-Infinity,next:0,count:0,frameId:-1,resultAt:-Infinity,last:-Infinity,canvas:document.createElement('canvas')}));
 function startWorker(s){
  const opts={...defaults,...getOptions()};s.delegate=opts.trackerDelegate;s.fullBody=!!opts.fullBody;s.poseModel=opts.poseModel;s.partialHands=!!opts.partialHands;
  const url=new URL('./tracker.mjs?v=eyegaze1',import.meta.url);url.searchParams.set('task',s.task);url.searchParams.set('partialHands',s.partialHands?'1':'0');url.searchParams.set('delegate',s.delegate);url.searchParams.set('fullBody',s.fullBody?'1':'0');url.searchParams.set('poseModel',s.poseModel||'lite');
  const w=s.worker=new Worker(url,{type:'module'});
  s.timer=setTimeout(()=>{if(!s.ready){stats.errors[s.task]='Tracker initialization timed out';w.terminate();s.busy=false;}},60000);
  w.onerror=e=>{clearTimeout(s.timer);stats.errors[s.task]=e.message;s.busy=false;s.ready=false;};
  w.onmessage=({data})=>{if(stopped||s.worker!==w)return;
   if(data.type==='ready'){clearTimeout(s.timer);s.ready=true;stats.delegate[s.task]=data.delegate;return;}
   s.busy=false;
   if(data.type==='error'){stats.errors[s.task]=data.message;return;}
   if(data.type==='result'){if(source.state(performance.now())!=='live')return;delete stats.errors[s.task];s.count++;s.resultAt=performance.now();stats.ms[s.task]=data.inferenceMs??data.ms;stats.age[s.task]=performance.now()-s.sent;stats.detections[s.task]=(data.landmarks||data.faceLandmarks||data.poseLandmarks||[]).length;onResult(data,s.canvas);
    // Reuse no old frames: start the newest one after a slow hand result,
    // without waiting an additional camera interval or queuing any work.
    const o={...defaults,...getOptions()};source.observe(performance.now());
    if(s.task==='hands'&&o.freshFrames&&enabled(s,o)&&!document.hidden&&videoSourceActive(video)&&source.id!==s.frameId&&(o.uncappedTracking||performance.now()>=s.next-1)){
     const now=performance.now();s.next=now+1000/(+o.handRate);dispatch(s,now,o);
    }
   }
  };w.postMessage({type:'init'});
 }
 const enabled=(s,o)=>+(s.task==='hands'?o.handRate:s.task==='face'?o.faceRate:o.shoulderRate)>0;
 async function dispatch(s,now,opts){
  s.busy=true;s.sent=now;s.frameId=source.id;s.frameTime=video.currentTime;const w=s.worker,width=s.task==='hands'?+opts.trackingWidth:Math.min(320,+opts.trackingWidth);
  try{const c=s.canvas;c.width=width;c.height=Math.max(1,Math.round(width*video.videoHeight/video.videoWidth));if(captureOptions.copyPreview!==false)c.getContext('2d').drawImage(video,0,0,c.width,c.height);
   const time=Math.max(now,s.last+.001);s.last=time;
   let bitmap;try{bitmap=await createImageBitmap(captureOptions.copyPreview===false?video:c,{resizeWidth:c.width,resizeHeight:c.height,resizeQuality:'low'});}catch{}
   if(stopped||s.worker!==w||!videoSourceActive(video)){bitmap?.close();s.busy=false;return;}
   if(bitmap)w.postMessage({type:'frame',bitmap,time},[bitmap]);else{if(captureOptions.copyPreview===false)c.getContext('2d').drawImage(video,0,0,c.width,c.height);const image=c.getContext('2d').getImageData(0,0,c.width,c.height);w.postMessage({type:'frame',image,time},[image.data.buffer]);}
  }catch(e){s.busy=false;stats.errors[s.task]=String(e);}
 }
 function tick(now,metadata){
  if(stopped)return;
  if(!videoSourceActive(video)||document.hidden)return;
  if(source.observe(now,metadata)){if(metadata)cameraCallbacks++;else capturePolls++;}
  if(source.state(now)!=='live')return;
  const opts={...defaults,...getOptions()},due=[];
  for(const s of slots){
   if(!enabled(s,opts)){if(s.worker){s.worker.terminate();clearTimeout(s.timer);s.worker=null;s.ready=s.busy=false;}stats[s.task]=0;continue;}
   if(s.worker&&(s.delegate!==opts.trackerDelegate||s.fullBody!==!!opts.fullBody||s.poseModel!==opts.poseModel||s.partialHands!==!!opts.partialHands)){s.worker.terminate();clearTimeout(s.timer);s.worker=null;s.ready=s.busy=false;}
   if(!s.worker)startWorker(s);
   const rate=+(s.task==='hands'?opts.handRate:s.task==='face'?opts.faceRate:opts.shoulderRate);
   if(s.rate!==rate){s.rate=rate;s.next=now;}
   if(s.ready&&!s.busy&&s.frameId!==source.id&&source.id>0&&(opts.uncappedTracking||now>=s.next-1))due.push(s);
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
 // RAF can discover new decoded frames when browser frame callbacks are absent.
 function fallbackTick(now){if(stopped)return;tick(now);rafHandle=requestAnimationFrame(fallbackTick);}
 // Initialization and telemetry must not depend on delivery of the first video callback.
 for(const s of slots)if(enabled(s,{...defaults,...getOptions()}))startWorker(s);
 const reportTimer=setInterval(()=>{const now=performance.now(),opts={...defaults,...getOptions()};
  if(now-windowStart>=950){
   const seconds=(now-windowStart)/1000,measured=frameMeter.read(),state=source.state(now),live=state==='live';
   stats.sourceState=state;stats.sourceAgeMs=Number.isFinite(source.lastFrameAt)?now-source.lastFrameAt:null;
   stats.camera=live?measured.fps:0;stats.cameraCounter=measured.source;
   if(live&&!measured.fps&&source.evidence==='media-clock estimate'){stats.camera=Math.round(capturePolls/seconds);stats.cameraCounter='media-clock estimate';}
   if(live&&!measured.fps&&source.evidence==='decoded video frames'){stats.camera=Math.round(capturePolls/seconds);stats.cameraCounter='decoded frame observations';}
   stats.cameraCallbacks=Math.round(cameraCallbacks/seconds);stats.capturePolls=Math.round(capturePolls/seconds);capturePolls=cameraCallbacks=0;
   for(const s of slots){stats[s.task]=live?Math.round(s.count/seconds):0;s.count=0;if(!live||now-s.resultAt>1500||!enabled(s,opts)){stats.ms[s.task]=null;stats.age[s.task]=null;stats.detections[s.task]=0;}}
   windowStart=now;onStats({...stats,ms:{...stats.ms},age:{...stats.age},detections:{...stats.detections},requested:opts.cameraFps,cameraSettings:video.srcObject?.getVideoTracks?.()[0]?.getSettings?.()});
  }
 },1000);

 function videoTick(now,meta){if(stopped)return;tick(now,meta);handle=video.requestVideoFrameCallback(videoTick);}
 if(video.requestVideoFrameCallback)handle=video.requestVideoFrameCallback(videoTick);
 rafHandle=requestAnimationFrame(fallbackTick);
 return ()=>{stopped=true;frameMeter.stop();clearInterval(reportTimer);if(video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(handle);cancelAnimationFrame(rafHandle);for(const s of slots){clearTimeout(s.timer);s.worker?.terminate();}};
}
