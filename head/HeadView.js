// Face tracker glue for rps_hand: captures frames, talks to head/worker.mjs, keeps the rotation (ViewPose) and position
// (SpatialPose) filters and reports the head in the CAMERA frame (x right, y down, z away, metres). It never touches a
// three.js camera: docs/index.html owns the views and converts to its own frame.
// Adapted from mirror/head/HeadView.js on the hand-rig-workflow branch (which drove the camera and read DOM controls).
import { ViewPose } from './pose.mjs';
import { SpatialPose, median } from './spatial.mjs';

export class HeadView {
  constructor({ hfov = Math.PI / 3, mode = 'first', interval = 33, workerUrl = new URL('./worker.mjs', import.meta.url), widths = [384, 512, 288], worker = null } = {}) {
    // `worker`: an object with the worker's message interface instead of a real Worker. The movement page passes one that
    // is fed by the phone over the data link (movement/remote.mjs), so the face tracking can run on the phone.
    // capture widths: the face detector misses some small faces at one resampling and finds them at another (measured on
    // test/seated_desk.jpg: missed at 384, found at 256 and 717), so the width cycles while no face is found
    this.hfov = hfov; this.interval = interval; this.widths = widths; this.widthIdx = 0;
    this.pose = new ViewPose(); this.pose.mode = mode; this.pose.preserveNeutral = true;   // a lost face keeps the saved centre
    this.spatial = new SpatialPose([1, 1, 1]);   // offsets stay in the camera frame
    this.busy = false; this.ready = false; this.failed = false; this.completedFrames = 0; this.error = null;
    this.lastCapture = -Infinity; this.lastTs = 0; this.captureAt = new Map();   // ts -> performance.now() at capture (latency)
    this.perf = { fps: 0, frames: 0, start: performance.now(), latency: 0, delegate: '' };
    this.latest = null;   // last worker result with a face: {centerX, centerY, span, yaw, pitch, fit}
    const fail = e => { this.failed = true; this.busy = false; this.error = e?.message || String(e); this.worker?.terminate(); clearTimeout(this.timer); };
    try { this.worker = worker || new Worker(workerUrl, { type: 'module' }); } catch (e) { fail(e); return; }
    this.worker.onerror = e => fail(e.message || 'worker error');
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'error') return fail(data.message);
      if (data.type === 'ready') { this.perf.delegate = data.delegate; this.ready = true; this.perf.start = performance.now(); clearTimeout(this.timer); return; }
      if (data.type !== 'pose') return;
      this.busy = false; this.completedFrames++;
      const now = performance.now(), cap = this.captureAt.get(data.ts); this.captureAt.delete(data.ts);
      if (cap != null) this.perf.latency = now - cap;
      this.perf.frames++;
      if (now - this.perf.start >= 1000) { this.perf.fps = Math.round(this.perf.frames * 1000 / (now - this.perf.start)); this.perf.frames = 0; this.perf.start = now; }
      if (data.pose) this.latest = data.pose; this.lastResult = data;
      if (!data.found) this.widthIdx = (this.widthIdx + 1) % this.widths.length;
      this.pose.receive(data.pose, now); this.spatial.receive(data.pose?.fit, now);
    };
    this.timer = setTimeout(() => fail('face worker init timeout'), 60000);
    addEventListener('pagehide', () => { this.worker?.terminate(); clearTimeout(this.timer); }, { once: true });
  }
  get mode() { return this.pose.mode; }
  set mode(m) { this.pose.mode = m; }
  wantsFrame(now) { return !this.failed && this.ready && !this.busy && this.pose.mode !== 'off' && !document.hidden && now - this.lastCapture >= this.interval; }
  // src: a <video> or <img>. The caller decides freshness (a still is re-tracked every interval). Returns true when a
  // frame was sent.
  async capture(src, now = performance.now()) {
    if (!this.wantsFrame(now)) return false;
    const W = src.videoWidth || src.naturalWidth || src.width, H = src.videoHeight || src.naturalHeight || src.height;
    if (!W || !H) return false;
    this.busy = true; this.lastCapture = now;
    try {
      const width = Math.min(this.widths[this.widthIdx], W);
      const frame = await createImageBitmap(src, { resizeWidth: width, resizeHeight: Math.round(width * H / W) });
      const ts = this.lastTs = Math.max(this.lastTs + 1, Math.floor(now));   // strictly increasing, as detectForVideo requires
      this.captureAt.set(ts, now);
      this.worker.postMessage({ frame, ts, hfov: this.hfov }, [frame]);
      return true;
    } catch (e) { this.busy = false; this.failed = true; this.error = e.message; this.worker.terminate(); return false; }
  }
  // samples: fitHead results captured while the user held still; scaleTo: a measured depth for the same moment
  // (rps_hand passes the hand's metric depth) -> the head's depth scale becomes scaleTo / median depth.
  calibrate(samples, scaleTo = null) {
    this.spatial.calibrate(samples, scaleTo);
    this.pose.neutral = { ...(this.pose.latest || samples[samples.length - 1]), yaw: median(samples.map(s => s.yaw)), pitch: median(samples.map(s => s.pitch)) };
    this.pose.yaw = this.pose.pitch = this.pose.physicalYaw = this.pose.physicalPitch = 0;
  }
  recenter() { this.pose.recenter(); this.spatial.recenter(); }
  // Per render frame. seen = a face within the last 650 ms; pos = filtered eye position in the camera frame (metres,
  // depth scale applied); offset = filtered displacement from the calibrated centre (same frame, for the gains);
  // yaw/pitch = gained, dead-zoned camera angles; physicalYaw/Pitch = the real head angles relative to the centre.
  update(now, dt) {
    const { yaw, pitch } = this.pose.update(now, dt);
    const offset = this.spatial.update(now, dt, true);   // eases back to the centre 650 ms after the face is lost
    const n = this.spatial.neutral;
    const pos = n ? n.map((v, i) => v * this.spatial.scale + offset[i]) : null;
    return { seen: !!n && now - this.spatial.seen < 650, pos, offset, yaw, pitch, physicalYaw: this.pose.physicalYaw, physicalPitch: this.pose.physicalPitch, latest: this.latest, scale: this.spatial.scale };
  }
  status(now) {
    return this.failed ? 'head: unavailable' + (this.error ? ' (' + this.error.slice(0, 40) + ')' : '') : !this.ready ? 'head: loading' : this.pose.mode === 'off' ? 'head: off'
      : now - this.spatial.seen > 650 ? 'head: no face' : `head ${this.perf.fps}fps ${Math.round(this.perf.latency)}ms`;
  }
}
