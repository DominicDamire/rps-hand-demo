import {FilesetResolver,PoseLandmarker} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import {upperBodyPose} from './pose.mjs?v=edge8';
import {paddingPlan,unpadLandmarks,trackFeatureTranslation} from '../head/edge.mjs?v=edge8';
let tracker,lastSeen=-Infinity,lastCenter={x:.5,y:.5},lastImage=null,lastWorld=null,previousGray=null;
const motionIds=[0,2,5,7,8,11,12,13,14,15,16,23,24];
function grayscale(frame){
  if(typeof OffscreenCanvas==='undefined')return null;
  try{
    const width=192,height=Math.max(96,Math.round(width*frame.height/frame.width));
    const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;ctx.drawImage(frame,0,0,width,height);
    const rgba=ctx.getImageData(0,0,width,height).data,data=new Uint8Array(width*height);
    for(let i=0,j=0;i<rgba.length;i+=4,j++)data[j]=(rgba[i]*3+rgba[i+1]*6+rgba[i+2])*.1;
    return {width,height,data};
  }catch{return null;}
}
function center(points){
  const visible=motionIds.map(i=>points?.[i]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
  return visible.length?{x:visible.reduce((s,p)=>s+p.x,0)/visible.length,y:visible.reduce((s,p)=>s+p.y,0)/visible.length}:lastCenter;
}
try{
  const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',true);
  let delegate;
  for(delegate of ['GPU','CPU']){
    try{
      tracker=await PoseLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate},
        runningMode:'VIDEO',numPoses:1,outputSegmentationMasks:false,
        minPoseDetectionConfidence:.35,minPosePresenceConfidence:.35,minTrackingConfidence:.35
      });break;
    }catch(e){if(delegate==='CPU')throw e;}
  }
  postMessage({type:'ready',delegate});
}catch(e){postMessage({type:'error',message:e.message});}
onmessage=({data:{frame,ts}})=>{
  if(!frame)return;
  try{
    const start=performance.now(),currentGray=grayscale(frame);
    let result=tracker.detectForVideo(frame,ts),image=result.landmarks[0],world=result.worldLandmarks[0],pose=upperBodyPose(image,world),recoveredByPadding=false,recoveredByMotion=false;
    // Retry against a padded image whenever a tracked upper body reaches a hard
    // camera edge. Padding makes a half-visible shoulder/arm look like an
    // ordinary partial person to the detector instead of an invalid crop.
    if(!pose&&typeof OffscreenCanvas!=='undefined'&&ts-lastSeen<1400&&(lastCenter.x<.35||lastCenter.x>.65||lastCenter.y<.35||lastCenter.y>.65)){
      const plan=paddingPlan(lastCenter.x,lastCenter.y,frame.width,frame.height);
      const padded=new OffscreenCanvas(plan.width,plan.height),ctx=padded.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,plan.width,plan.height);ctx.drawImage(frame,plan.x,plan.y);
      result=tracker.detectForVideo(padded,ts+.01);image=result.landmarks[0];world=result.worldLandmarks[0];
      if(image){image=unpadLandmarks(image,plan,frame.width,frame.height);pose=upperBodyPose(image,world);recoveredByPadding=!!pose;}
    }
    // If the pose detector skips a frame, visible texture on the remaining head
    // or arm advances the last skeleton. Correlation stops naturally when those
    // pixels leave the image, so this cannot manufacture indefinite tracking.
    if(!pose&&ts-lastSeen<320&&lastImage&&lastWorld&&previousGray&&currentGray){
      const motion=trackFeatureTranslation(previousGray,currentGray,lastImage,{anchorIds:motionIds,search:32});
      if(motion){image=lastImage.map(p=>({...p,x:p.x+motion.dx/currentGray.width,y:p.y+motion.dy/currentGray.height}));world=lastWorld;pose=upperBodyPose(image,world);recoveredByMotion=!!pose;}
    }
    if(pose){lastSeen=ts;lastCenter=center(image);lastImage=image;lastWorld=world;previousGray=currentGray;}
    postMessage({type:'pose',ts,inferenceMs:performance.now()-start,
      pose,landmarksDetected:!!image,recoveredByPadding,recoveredByMotion});
  }catch(e){postMessage({type:'error',message:e.message});}
  finally{frame.close();}
};
