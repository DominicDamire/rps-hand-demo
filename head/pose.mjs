// Face orientation from the face-mesh landmarks, the head-rotation filter and the movement gains.
// Ported from mirror/head/pose.mjs on the hand-rig-workflow branch; WindowPose / windowFrustum / firstPersonOrigin
// (the historical "window" mode) were dropped, firstPersonRotation was added for the rps_hand first-person camera.
const clamp = (v, max) => Math.max(-max, Math.min(max, v));

// Face mesh coordinates: x right, y down (height units), z away (width units).
// A cheek/forehead/chin plane estimates orientation without depending on mouth shape.
// yaw > 0 when the user turns to THEIR right (the into-head axis tilts toward image right), pitch > 0 looking up.
export function facePose(points, aspect = 1) {
  if (!points || points.length < 455) return null;
  const sub = (a, b) => [a.x-b.x, (a.y-b.y)/aspect, a.z-b.z];
  const x = sub(points[454], points[234]), y = sub(points[152], points[10]);
  const n = [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]];
  if (n[2] < 0) n.forEach((_, i) => n[i] *= -1);
  if (Math.hypot(...n) < 1e-7) return null;
  const pose = {
    centerX: (points[33].x + points[263].x) / 2,
    centerY: (points[33].y + points[263].y) / 2,
    span: Math.hypot(...sub(points[263], points[33])),
    yaw: Math.atan2(n[0], n[2]),
    pitch: Math.atan2(n[1], Math.hypot(n[0], n[2])),
    // head tilt, from the line between the outer eye corners. Nothing computed this before, so every consumer of
    // `roll` was reading zero.
    roll: Math.atan2((points[263].y - points[33].y) / aspect, points[263].x - points[33].x)
  };
  return Object.values(pose).every(v => typeof v === 'boolean' || Number.isFinite(v)) ? pose : null;
}

// Eye offset (metres, camera frame or any consistent frame) scaled by three gains, bounded so a lean can never drift.
// depth/.45 was the branch's scale for its assumed 0.45 m distance; with metric positions pass depth = .45 (scale 1).
export function gentleHeadTranslation(offset, depth, lateralGain = 2, depthGain = 2, verticalGain = 2) {
  const scale=depth/.45;
  const gain=v=>Number.isFinite(v)?Math.max(0,Math.min(4,v)):2;
  const x=clamp(offset[0]*scale*gain(lateralGain),.50), y=clamp(offset[1]*scale*gain(verticalGain),.30);
  const z=clamp(offset[2]*scale*gain(depthGain),.50);
  // Lean is a bounded position offset, not velocity: holding still never drifts.
  return [x,y,z];
}

// Euler angles ('YXZ') for the rps_hand first-person camera: it looks along +z of the true frame (toward the phone and
// the opponent), so yaw pi is straight ahead; navigation yaw and the (gained) head yaw add to it. physicalYaw is
// negative for a right turn (see ViewPose), which turns the camera's forward vector toward -x = the user's right.
export function firstPersonRotation(yaw, pitch, navYaw = 0) { return [pitch, Math.PI + navYaw + yaw, 0]; }
// Forward direction of that camera (unit vector in the true frame), for tests and the HUD.
export function firstPersonForward(yaw, pitch, navYaw = 0) {
  const [rx, ry] = firstPersonRotation(yaw, pitch, navYaw);
  return [-Math.sin(ry) * Math.cos(rx), Math.sin(rx), -Math.cos(ry) * Math.cos(rx)];
}

export class ViewPose {
  constructor() { this.mode = 'head'; this.sensitivity=5; this.physicalYaw=0; this.physicalPitch=0; this.physicalRoll=0; this.neutral = null; this.latest = null; this.seen = -Infinity; this.yaw = 0; this.pitch = 0; }
  recenter() { this.neutral = null; this.latest = null; }
  receive(pose, now) {
    if (!pose) return;
    // Reacquisition uses a fresh neutral rather than jumping to an old offset.
    if (now - this.seen > 1500 && !this.preserveNeutral) this.neutral = null;
    this.latest = pose; this.seen = now;
    this.neutral ??= { ...pose };
  }
  update(now, dt) {
    let yaw = 0, pitch = 0, physicalYaw=0, physicalPitch=0;
    if (this.mode !== 'off' && this.latest && this.neutral && now - this.seen < 650) {
      // n points INTO the head (+z), opposite the viewing direction. With the
      // image mirrored, a positive plane yaw looks screen-right (negative camera yaw).
      physicalYaw=-(this.latest.yaw-this.neutral.yaw);
      physicalPitch=this.latest.pitch-this.neutral.pitch;
      this.physicalRoll=Math.max(-.35,Math.min(.35,((this.latest.roll??0)-(this.neutral.roll??0))*.7));   // damped: the eye-corner line is noisy
      const deadzone=v=>Math.sign(v)*Math.max(0,Math.abs(v)-.025);
      yaw=this.mode==='first'?deadzone(physicalYaw)*this.sensitivity:physicalYaw*.65;
      pitch=this.mode==='first'?deadzone(physicalPitch)*this.sensitivity*.6:physicalPitch*.65;
    }
    const fast=Math.max(Math.abs(physicalYaw-this.physicalYaw),Math.abs(physicalPitch-this.physicalPitch))>.06;
    const a = 1 - Math.exp(-Math.min(dt, .1) / (fast?.012:.03));
    this.physicalYaw+=(physicalYaw-this.physicalYaw)*a;
    this.physicalPitch+=(physicalPitch-this.physicalPitch)*a;
    this.yaw += (clamp(yaw, this.mode==='first'?Math.PI:.24) - this.yaw) * a;
    this.pitch += (clamp(pitch, this.mode==='first'?1.3:.18) - this.pitch) * a;
    if (this.mode === 'off') this.yaw = this.pitch = 0;
    return { yaw: this.yaw, pitch: this.pitch };
  }
}
