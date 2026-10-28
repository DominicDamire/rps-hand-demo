// Phone side: camera -> MediaPipe HandLandmarker (in a Web Worker) -> 21 joints per hand in metres, in a gravity-levelled
// frame with the phone camera at the origin looking down -z. Emits one packet per tracker frame through `onHands`.
// Compact port of the RPS Hand pipeline: image-landmark back-projection at world-model depth,
// error-adaptive smoothing, nearest-slot assignment, tilt levelling.
const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
export const PARENT = {1:0,2:1,3:2,4:3, 5:0,6:5,7:6,8:7, 9:0,10:9,11:10,12:11, 13:0,14:13,15:14,16:15, 17:0,18:17,19:18,20:19};
export const PALM = [0, 5, 9, 13, 17];
export const CONNECTIONS = Object.entries(PARENT).map(([j, p]) => [+p, +j]).concat([[5, 9], [9, 13], [13, 17], [2, 5]]);
const HOLD_MS = 250;

// --- tilt: level the room to gravity ---
let pitch = 0, tiltOn = false;
addEventListener("deviceorientation", e => { if (e.beta == null) return; pitch = (90 - e.beta) * Math.PI / 180; tiltOn = true; });
let tiltGranted = false;
addEventListener("pointerdown", () => {
  if (tiltGranted || typeof DeviceOrientationEvent === "undefined" || !DeviceOrientationEvent.requestPermission) return;
  DeviceOrientationEvent.requestPermission().then(r => { tiltGranted = r === "granted"; }).catch(() => {});
});
export const tilt = () => ({ pitch, tiltOn });

// Hand position: world landmarks are metric and camera-oriented but centred on the hand; image landmarks say where each
// joint appears. Solve the translation T (3 unknowns, linear least squares, exact for a pinhole camera of HFOV).
function locate(world, image, W, H, hfov) {
  const k = 2 * Math.tan(hfov / 2), n = 21, xu = new Float32Array(n), yv = new Float32Array(n);
  let Sx = 0, Sy = 0, Sxx = 0, Sbu = 0, Sbv = 0, Sxb = 0;
  for (let i = 0; i < n; i++) {
    xu[i] = (image[i].x - 0.5) * k; yv[i] = (image[i].y - 0.5) * k * H / W;
    const bu = world[i].x - xu[i] * world[i].z, bv = world[i].y - yv[i] * world[i].z;
    Sx += xu[i]; Sy += yv[i]; Sxx += xu[i] * xu[i] + yv[i] * yv[i]; Sbu += bu; Sbv += bv; Sxb += xu[i] * bu + yv[i] * bv;
  }
  const Tz = (Sxb - (Sx * Sbu + Sy * Sbv) / n) / (Sxx - (Sx * Sx + Sy * Sy) / n);
  const Tx = (Sx * Tz - Sbu) / n, Ty = (Sy * Tz - Sbv) / n;
  // each joint where the camera sees it, at world-model depth; -> GL (y up, z toward the camera), true positions
  const a = new Float32Array(63);
  for (let i = 0; i < n; i++) { const z = world[i].z + Tz; a[3*i] = xu[i] * z; a[3*i+1] = -yv[i] * z; a[3*i+2] = -z; }
  if (tiltOn) { const c = Math.cos(pitch), s = Math.sin(pitch); for (let i = 0; i < n; i++) { const y = a[3*i+1], z = a[3*i+2]; a[3*i+1] = c * y - s * z; a[3*i+2] = s * y + c * z; } }
  return a;
}

// Error-adaptive smoothing: inside the tracker's noise it smooths hard, beyond it follows one to one (no lag).
const NOISE = { xy: [0.003, 0.015], z: [0.008, 0.030] }, A_MIN = 0.12, VMAX_REL = 2.0;
class HandFilter {
  constructor() { this.x = null; this.t = 0; }
  push(x, t) {
    if (!this.x) { this.x = Float32Array.from(x); this.t = t; return; }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const pd = [0, 0, 0]; for (const i of PALM) for (let k = 0; k < 3; k++) pd[k] += (x[3 * i + k] - this.x[3 * i + k]) / PALM.length;
    const lim = VMAX_REL * dt; x = Float32Array.from(x);
    for (let j = 0; j < 21; j++) {   // a joint cannot teleport relative to the palm (occlusion spikes)
      const r = [0, 1, 2].map(k => x[3 * j + k] - this.x[3 * j + k] - pd[k]), n = Math.hypot(...r);
      if (n > lim) for (let k = 0; k < 3; k++) x[3 * j + k] = this.x[3 * j + k] + pd[k] + r[k] * lim / n;
    }
    const gain = (e, [d0, d1]) => Math.max(A_MIN, Math.min(1, (e - d0) / (d1 - d0)));
    for (let j = 0; j < 21; j++) {
      const o = 3 * j, gxy = gain(Math.hypot(x[o] - this.x[o], x[o + 1] - this.x[o + 1]), NOISE.xy), gz = gain(Math.abs(x[o + 2] - this.x[o + 2]), NOISE.z);
      for (let k = 0; k < 3; k++) this.x[o + k] += (k === 2 ? gz : gxy) * (x[o + k] - this.x[o + k]);
    }
  }
}

const WORKER_SRC = `
import { FilesetResolver, HandLandmarker } from "${MP}/vision_bundle.mjs";
let lm;
const pack = r => r.landmarks.map((landmarks, i) => ({ landmarks, world: r.worldLandmarks[i], name: r.handedness[i]?.[0]?.categoryName ?? "?" }));
onmessage = async e => {
  if (e.data.init) {
    const vision = await FilesetResolver.forVisionTasks("${MP}/wasm", true);
    for (const delegate of ["GPU", "CPU"]) {
      try { lm = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: ${JSON.stringify(MODEL)}, delegate }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.4 }); postMessage({ ready: true, delegate }); return; }
      catch (err) { console.warn(delegate + " failed", err); }
    }
    postMessage({ ready: false }); return;
  }
  const t = performance.now(), r = lm.detectForVideo(e.data.frame, e.data.ts); e.data.frame.close();
  postMessage({ id: e.data.id, ms: performance.now() - t, hands: pack(r) });
};`;

async function makeWorker() {
  const w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })), { type: "module" });
  const ready = await new Promise((res, rej) => { w.onmessage = e => res(e.data); w.onerror = e => rej(e.message || "worker error"); w.postMessage({ init: true }); setTimeout(() => rej("worker init timeout"), 60000); });
  if (!ready.ready) throw new Error("hand tracker could not start");
  const waiting = new Map(); let id = 0;
  w.onmessage = e => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
  return { where: "worker/" + ready.delegate, async detect(src, ts) {
    const frame = await createImageBitmap(src);
    return new Promise(res => { const my = ++id; waiting.set(my, res); w.postMessage({ id: my, frame, ts }, [frame]); });
  } };
}

// opts: { video, hfov, onHands(pkt), onStats(text), overlay(canvas) }
export async function startTracker(opts) {
  const { video, hfov = 60 * Math.PI / 180 } = opts;
  const W = video.videoWidth || video.naturalWidth, H = video.videoHeight || video.naturalHeight;
  const tracker = await makeWorker();
  const slots = [{ key: "Right", filt: new HandFilter(), lastSeen: -1e9, img: [0, 0], name: "?", lm: null }, { key: "Left", filt: new HandFilter(), lastSeen: -1e9, img: [0, 0], name: "?", lm: null }];
  const centre = lm => PALM.reduce((c, i) => [c[0] + lm[i].x / PALM.length, c[1] + lm[i].y / PALM.length], [0, 0]);
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ov = opts.overlay, octx = ov?.getContext("2d");
  let ts = 0, inflight = false, lastT = -1, stat = { ms: 0, n: 0, lat: 0, t: performance.now() }, hold = HOLD_MS, lastRecv = 0;
  const still = !!video.naturalWidth;
  const pump = async () => {
    if (inflight || (!still && video.currentTime === lastT)) return;
    inflight = true; lastT = video.currentTime;
    const cap = performance.now(); ts = Math.max(ts + 1, Math.floor(cap));
    const r = await tracker.detect(video, ts); inflight = false;
    const recv = performance.now(); hold = Math.max(HOLD_MS, 2.5 * (recv - lastRecv)); lastRecv = recv;
    stat.ms += r.ms; stat.lat += recv - cap; stat.n++;
    // nearest-slot assignment (MediaPipe's Left/Right label flickers)
    const free = slots.slice(), out = [];
    const dets = r.hands.map(h => ({ h, c: centre(h.landmarks) })).sort((a, b) => a.c[0] - b.c[0]);
    for (const d of dets) {
      let best = null, bd = 0.25;
      for (const s of free) if (recv - s.lastSeen < hold) { const dd = dist2(d.c, s.img) + (s.name !== d.h.name ? 0.08 : 0); if (dd < bd) { bd = dd; best = s; } }
      if (!best) best = free.find(s => recv - s.lastSeen >= hold && s.name === d.h.name) || free.find(s => recv - s.lastSeen >= hold) || null;
      if (!best) continue;
      free.splice(free.indexOf(best), 1);
      const raw = locate(d.h.world, d.h.landmarks, W, H, hfov);
      best.filt.push(raw, cap / 1000); best.lastSeen = recv; best.img = d.c; best.name = d.h.name; best.lm = d.h.landmarks;
      out.push({ n: best.key, a: Array.from(best.filt.x, v => Math.round(v * 10000) / 10000) });
    }
    if (octx) {   // green skeleton on the camera
      if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
      octx.clearRect(0, 0, W, H); octx.lineWidth = Math.max(2, W / 240); octx.strokeStyle = "#78ff78"; octx.lineCap = "round";
      for (const h of r.hands) { octx.beginPath(); for (const [a, b] of CONNECTIONS) { octx.moveTo(h.landmarks[a].x * W, h.landmarks[a].y * H); octx.lineTo(h.landmarks[b].x * W, h.landmarks[b].y * H); } octx.stroke(); }
    }
    opts.onHands?.({ t: "h", who: "me", hands: out, ts: Math.round(cap), p: tiltOn ? pitch : 0, fw: W, fh: H });
    if (recv - stat.t > 1000) { opts.onStats?.(`tracker ${(stat.ms / stat.n).toFixed(0)} ms | ${stat.n} fps | latency ${(stat.lat / stat.n).toFixed(0)} ms | hands ${r.hands.length} | ${tracker.where} | tilt ${tiltOn ? (pitch * 180 / Math.PI).toFixed(0) + "°" : "off"}`); stat = { ms: 0, n: 0, lat: 0, t: recv }; }
  };
  const useRvfc = !still && typeof video.requestVideoFrameCallback === "function";
  if (useRvfc) { const onFrame = () => { pump(); video.requestVideoFrameCallback(onFrame); }; video.requestVideoFrameCallback(onFrame); }
  else { const loop = () => { pump(); requestAnimationFrame(loop); }; loop(); }
  return { where: tracker.where };
}
