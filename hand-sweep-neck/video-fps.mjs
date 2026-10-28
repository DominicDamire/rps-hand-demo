// Counts delivered video frames, never RAF/currentTime ticks or requested FPS.
export function measureVideoFrames(video){
 let handle,closed=false,count=0,last=null,start=performance.now();
 const quality=()=>video.getVideoPlaybackQuality?.().totalVideoFrames;
 let baseline=quality();
 function frame(now,meta){if(closed)return;const n=meta.presentedFrames;count+=Number.isFinite(n)&&last!==null?Math.max(0,n-last):1;last=n;handle=video.requestVideoFrameCallback(frame);}
 const callbacks=typeof video.requestVideoFrameCallback==='function';
 if(callbacks)handle=video.requestVideoFrameCallback(frame);
 return {read(){const now=performance.now(),seconds=(now-start)/1000;start=now;let frames=count;count=0;
 if(!callbacks){const n=quality();frames=Number.isFinite(n)&&Number.isFinite(baseline)?Math.max(0,n-baseline):null;baseline=n;}
 return {fps:frames===null?null:Math.round(frames/Math.max(.001,seconds)),source:callbacks?'presented video frames':'decoded video frames'};
 },stop(){closed=true;if(handle!==undefined)video.cancelVideoFrameCallback?.(handle);}};
}
