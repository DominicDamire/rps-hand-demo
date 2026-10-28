export function videoSourceActive(video){
 if(video.paused||video.ended||video.readyState<2||!video.videoWidth||!video.videoHeight)return false;
 if(video.srcObject?.getVideoTracks){
  const tracks=video.srcObject.getVideoTracks();
  if(!tracks.some(t=>t.readyState==='live'&&t.enabled!==false&&!t.muted))return false;
 }else if(video.srcObject===null&&!video.currentSrc)return false;
 return true;
}

// Identity comes from delivered/decoded frames. Media time is a last-resort
// fallback only when the browser supplies neither frame counter.
export function createFrameSource(video){
 let id=0,presented=null,decoded=null,media=null,lastFrameAt=-Infinity,evidence='none',lastCallbackAt=-Infinity,pendingDecoded=null,pendingMedia=null;
 return {
  get id(){return id;},get lastFrameAt(){return lastFrameAt;},get evidence(){return evidence;},
  observe(now,metadata){
   if(!videoSourceActive(video))return false;
   let fresh=false;
   const n=video.getVideoPlaybackQuality?.().totalVideoFrames;
   if(metadata){
    lastCallbackAt=now;
    if(Number.isFinite(metadata.presentedFrames)){
     fresh=presented===null||metadata.presentedFrames!==presented;presented=metadata.presentedFrames;
   }else fresh=true;
    if(pendingDecoded!==null&&n===pendingDecoded){fresh=false;pendingDecoded=null;}
    if(pendingMedia!==null&&metadata.mediaTime===pendingMedia){fresh=false;pendingMedia=null;}
    evidence='presented video frames';
   }else if(Number.isFinite(n)){
    fresh=decoded===null?n>0:n!==decoded;if(fresh){pendingDecoded=n;evidence='decoded video frames';}
   }else if(now-lastCallbackAt>250&&Number.isFinite(video.currentTime)){
    fresh=media===null||video.currentTime!==media;if(fresh){pendingMedia=video.currentTime;evidence='media-clock estimate';}
   }
   if(Number.isFinite(n))decoded=n;
   media=video.currentTime;
   if(fresh){id++;lastFrameAt=now;}
   return fresh;
  },
  state(now){return !videoSourceActive(video)?'inactive':!id?'waiting':now-lastFrameAt>1000?'stalled':'live';}
 };
}
