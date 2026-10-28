import {acceptPersonHand} from './person-hand.mjs?v=alien16.3';
const MP='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';let tracker,draw,maskCanvas,imageMode=false;const gpuCanvas=new OffscreenCanvas(1,1);
self.onmessage=async({data})=>{try{
 if(data.type==='init'){
  imageMode=data.runningMode==='IMAGE';const api=await import(MP+'/vision_bundle.mjs'),files=await api.FilesetResolver.forVisionTasks(MP+'/wasm',true);
  let delegate;for(delegate of ['GPU','CPU']){try{tracker=await api.HolisticLandmarker.createFromOptions(files,{canvas:gpuCanvas,baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task',delegate},runningMode:imageMode?'IMAGE':'VIDEO',outputFaceBlendshapes:false,outputPoseSegmentationMasks:true,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minFaceSuppressionThreshold:.5,minHandLandmarksConfidence:.5,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minPoseSuppressionThreshold:.5});break;}catch(e){if(delegate==='CPU')throw e;}}
  maskCanvas=new OffscreenCanvas(1,1);draw=new api.DrawingUtils(maskCanvas.getContext('2d'),gpuCanvas.getContext('webgl2'));
  self.postMessage({type:'ready',task:'holistic',delegate});
 }else if(data.type==='frame'){
  const source=data.bitmap||data.image,start=performance.now();
  let output;try{const receive=r=>{
   const posePoints=r.poseLandmarks?.[0],mask=r.poseSegmentationMasks?.[0];
   let segmentation=null;
   if(mask){
    // Render GPU confidence to RGBA8 before readback: FLOAT/RED readPixels
    // returns zeros on some ANGLE drivers. DrawingUtils uses Google's shader.
    maskCanvas.width=mask.width;maskCanvas.height=mask.height;
    draw.drawConfidenceMask(mask,[0,0,0,255],[255,255,255,255]);
    const rgba=maskCanvas.getContext('2d').getImageData(0,0,mask.width,mask.height).data;
    const values=new Float32Array(mask.width*mask.height);for(let i=0;i<values.length;i++)values[i]=rgba[4*i]/255;
    segmentation={width:mask.width,height:mask.height,values};
   }
   const hands=[];let rejected=0;
   for(const [label,lm,w] of [['Left',r.leftHandLandmarks?.[0],r.leftHandWorldLandmarks?.[0]],['Right',r.rightHandLandmarks?.[0],r.rightHandWorldLandmarks?.[0]]]){if(!lm?.length)continue;if(w?.length===21&&acceptPersonHand(lm,posePoints,segmentation))hands.push({label,lm,w});else rejected++;}
   const maskBytes=segmentation?Uint8Array.from(segmentation.values,v=>Math.round(Math.max(0,Math.min(1,v))*255)):null;
   output={type:'result',task:'holistic',time:data.time,inferenceMs:performance.now()-start,landmarks:hands.map(h=>h.lm),worldLandmarks:hands.map(h=>h.w),handedness:hands.map(h=>[{categoryName:h.label}]),pose:posePoints?{points:Object.fromEntries(posePoints.map((p,i)=>[i,p])),world:Object.fromEntries((r.poseWorldLandmarks?.[0]||[]).map((p,i)=>[i,p]))}:null,maskAvailable:!!mask,rejected,segmentation:maskBytes?{width:mask.width,height:mask.height,values:maskBytes}:null};
  };if(imageMode)tracker.detect(source,receive);else tracker.detectForVideo(source,data.time,receive);
   output.inferenceMs=performance.now()-start;self.postMessage(output,output.segmentation?[output.segmentation.values.buffer]:[]);
  }finally{source.close?.();}
 }
}catch(e){self.postMessage({type:'error',task:'holistic',message:String(e)});}};
