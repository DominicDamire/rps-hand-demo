// Request and verify 60 FPS; some camera/browser paths accept constraints but
// silently deliver 30. Keep a supported fallback instead of reporting a fake 60.
export async function openCamera(video,media=navigator.mediaDevices){
 const fps=video.frameRate?.ideal??60;
 if(fps>=60){for(const size of [{width:video.width,height:video.height},{width:{ideal:640},height:{ideal:480}}]){
  try{
   const constraints={...video,...size,frameRate:{min:59,ideal:60,max:60}};
   const stream=await media.getUserMedia({audio:false,video:constraints});
   const track=stream.getVideoTracks?.()[0];
   let actual=track?.getSettings?.().frameRate;
   if(actual&&actual<59&&track.applyConstraints){
    try{await track.applyConstraints(constraints);}catch(e){if(!['OverconstrainedError','ConstraintNotSatisfiedError'].includes(e.name)){stream.getTracks().forEach(t=>t.stop());throw e;}}
    actual=track.getSettings?.().frameRate;
   }
   if(!actual||actual>=59)return stream;
   stream.getTracks().forEach(t=>t.stop());
  }catch(e){if(!['OverconstrainedError','ConstraintNotSatisfiedError'].includes(e.name))throw e;}
 }}
 return media.getUserMedia({audio:false,video});
}
