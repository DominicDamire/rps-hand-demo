// One MediaPipe task per worker (two tasks in one worker fail with "ModuleFactory not set"): tracker.mjs?task=face runs the
// Face Landmarker (head pose matrix + blendshapes), tracker.mjs?task=pose the Pose Landmarker lite (shoulders).
import { FilesetResolver, FaceLandmarker, PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1', MODELS = 'https://storage.googleapis.com/mediapipe-models/';
const params = new URLSearchParams(self.location.search), TASK = params.get('task') || 'face', REQUESTED = params.get('delegate') || 'auto';
let tracker;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(MP + '/wasm', true);
      const opts = TASK === 'face'
        ? { baseOptions: { modelAssetPath: MODELS + 'face_landmarker/face_landmarker/float16/latest/face_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true }
        : { baseOptions: { modelAssetPath: MODELS + 'pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task', delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 };
      const Cls = TASK === 'face' ? FaceLandmarker : PoseLandmarker, delegates = REQUESTED === 'auto' ? ['GPU', 'CPU'] : [REQUESTED]; let delegate;
      for (delegate of delegates) { try { opts.baseOptions.delegate = delegate; tracker = await Cls.createFromOptions(files, opts); break; } catch (e) { if (delegate === delegates.at(-1)) throw e; } }
      self.postMessage({ type: 'ready', task: TASK, delegate });
    } else if (data.type === 'frame') {
      try {
        const t0 = performance.now(), out = { type: 'result', task: TASK, time: data.time };
        if (TASK === 'face') {
          const f = tracker.detectForVideo(data.bitmap, data.time);
          if (f.facialTransformationMatrixes?.length) {
            // Head orientation and eye direction only. Lip, mouth and jaw values
            // are intentionally discarded and never reach the model.
            const b = {}; for (const c of f.faceBlendshapes?.[0]?.categories || []) if (/^eyeLook|^eyeBlink/.test(c.categoryName)) b[c.categoryName] = c.score;
            const L = f.faceLandmarks[0], pts = new Float32Array(L.length * 2); L.forEach((q, i) => { pts[2 * i] = q.x; pts[2 * i + 1] = q.y; });
            out.face = { matrix: Array.from(f.facialTransformationMatrixes[0].data), blend: b, pts };
          } else out.face = null;
        } else {
          const p = tracker.detectForVideo(data.bitmap, data.time);
          out.pose = p.landmarks?.length ? { img: [p.landmarks[0][11], p.landmarks[0][12]].map(q => [q.x, q.y, q.visibility]), world: [p.worldLandmarks[0][11], p.worldLandmarks[0][12]].map(q => [q.x, q.y, q.z]), all: p.landmarks[0].slice(0, 17).map(q => [q.x, q.y, q.visibility]), arms: p.worldLandmarks[0].slice(11, 17).map(q => [q.x, q.y, q.z, p.landmarks[0][p.worldLandmarks[0].indexOf(q)]?.visibility ?? 1]) } : null;
        }
        out.ms = performance.now() - t0; self.postMessage(out);
      } finally { data.bitmap.close(); }
    }
  } catch (e) { self.postMessage({ type: 'error', task: TASK, message: String(e) }); }
};
