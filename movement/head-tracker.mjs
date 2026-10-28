import { FilesetResolver, FaceLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import { facePose } from '../head/pose.mjs';


// ?delegate=CPU on the worker URL forces the CPU (XNNPACK) delegate; default GPU first, CPU fallback
const DELEGATES=new URLSearchParams(self.location.search).get('delegate')==='CPU'?['CPU']:['GPU','CPU'];
let tracker;
try {
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm', true);
  const opts = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false };
  let delegate;
  for(delegate of DELEGATES){
    try {opts.baseOptions.delegate=delegate;tracker=await FaceLandmarker.createFromOptions(files,opts);break;}
    catch(e){if(delegate===DELEGATES[DELEGATES.length-1])throw e;}
  }
  postMessage({ type: 'ready', delegate });
} catch (e) { postMessage({ type: 'error', message: e.message }); }

onmessage = ({ data }) => {
  const { frame, ts, hfov=Math.PI/3 } = data;
  if (!frame) return;
  try {
    const result = tracker.detectForVideo(frame, ts);
    const points=result.faceLandmarks[0],aspect=frame.width/frame.height,base=facePose(points,aspect);
    // Walking needs orientation, not a fitted metric head position. A valid
    // face must not disappear when the unrelated spatial fit rejects it.
    postMessage({type:'pose',ts,pose:base,found:!!base,width:frame.width});
  } catch (e) { postMessage({ type: 'error', message: e.message }); }
  finally { frame.close(); }
};
