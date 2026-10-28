const MP='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
let tracker;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const {FilesetResolver,HandLandmarker}=await import(MP+'/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks(MP+'/wasm',true);
      const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.45};
      try{tracker=await HandLandmarker.createFromOptions(files,options);}catch{options.baseOptions.delegate='CPU';tracker=await HandLandmarker.createFromOptions(files,options);}
      self.postMessage({type:'ready'});
    }else if(data.type==='frame'){
      try{const started=performance.now();const r=tracker.detectForVideo(data.bitmap,data.time);self.postMessage({type:'result',inferenceMs:performance.now()-started,time:data.time,handedness:r.handedness,landmarks:r.landmarks,worldLandmarks:r.worldLandmarks});}finally{data.bitmap.close();}
    }
  }catch(e){self.postMessage({type:'error',message:String(e)});}
};
