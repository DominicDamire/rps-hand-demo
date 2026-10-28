import { TriggerTracker } from "./trigger.mjs";
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export function bend(p, a, b, c) {
  const u = p[b].map((v, i) => v - p[a][i]),
    v = p[c].map((v, i) => v - p[b][i]),
    d = Math.hypot(...u) * Math.hypot(...v);
  return d < 1e-10
    ? null
    : (Math.acos(clamp(u.reduce((s, x, i) => s + x * v[i], 0) / d, -1, 1)) *
        180) /
        Math.PI;
}
export function observation(points) {
  if (!Array.isArray(points) || points.length !== 21) return null;
  const p = points.map((v) => (Array.isArray(v) ? v : [v?.x, v?.y, v?.z]));
  if (p.some((v) => v.length !== 3 || v.some((x) => !Number.isFinite(x))))
    return null;
  const lower = [9, 13, 17].map((i) => bend(p, i, i + 1, i + 2)),
    thumb = [bend(p, 1, 2, 3), bend(p, 2, 3, 4)];
  if ([...lower, ...thumb].some((v) => v === null)) return null;
  const signal = thumbSignal(p, thumb);
  if (!Number.isFinite(signal)) return null;
  return {
    points: p,
    lower,
    gripping: lower.every((v) => v > 45),
    open: lower.every((v) => v < 28),
    // Measure the thumb against the palm's long axis, not wrist-to-thumb-base:
    // that diagonal is already bent even when a real thumb is fully raised.
    thumbSignal: signal,
    thumb: clamp((signal - 20) / 45),
  };
}
function thumbSignal(p, bends) {
  const palm = p[9].map((v, i) => v - p[0][i]);
  const axis = p[4].map((v, i) => v - p[1][i]);
  const length = Math.hypot(...palm) * Math.hypot(...axis);
  if (length < 1e-10) return NaN;
  const angle =
    (Math.acos(
      clamp(palm.reduce((s, v, i) => s + v * axis[i], 0) / length, -1, 1),
    ) *
      180) /
    Math.PI;
  return 0.65 * angle + 0.35 * (bends[0] + bends[1]);
}
// Only these two degrees of freedom can change while held. All other angles,
// including sideways/twist, come from the user's supplied endpoint poses.
export function heldAngles(profile, index, thumb) {
  const a = structuredClone(profile.angles),
    pull = clamp(index * profile.trigger.gain),
    curl = clamp(thumb);
  for (let k = 1; k <= 3; k++) {
    const n = "Index" + k,
      limit = profile.indexPressed?.[n] ?? [
        profile.angles["Middle" + k][0],
        ...profile.angles[n].slice(1),
      ];
    a[n] = profile.angles[n].map(
      (start, i) => start + (limit[i] - start) * pull,
    );
  }
  // Paired presets constrain every thumb axis to the supplied endpoint range.
  // A legacy single-pose profile holds the base and only extends outer hinges.
  if (profile.thumbOpen) {
    for (let k = 1; k <= 3; k++) {
      const n = "Thumb" + k;
      a[n] = profile.angles[n].map(
        (end, i) =>
          profile.thumbOpen[n][i] + (end - profile.thumbOpen[n][i]) * curl,
      );
    }
  } else
    for (const k of [2, 3])
      a["Thumb" + k][1] = profile.angles["Thumb" + k][1] * curl;
  return a;
}
export class GripController {
  constructor() {
    this.trigger = new TriggerTracker();
    this.thumbCalibration = {};
    this.reset();
  }
  reset() {
    this.held = false;
    this.candidate = null;
    this.since = 0;
    this.last = null;
    this.lastLabel = null;
    this.thumb = 1;
    this.lastThumbSignal = null;
    this.trigger.reset();
  }
  update(world, time, profile, label = "single") {
    const o = observation(world);
    let picked = false,
      dropped = false;
    if (!o || !Number.isFinite(o.thumbSignal) || !Number.isFinite(time)) {
      this.trigger.reset();
      this.candidate = null;
      this.last = null;
      this.lastThumbSignal = null;
      return {
        valid: false,
        held: this.held,
        fired: false,
        picked,
        dropped,
        index: 0,
        thumb: this.thumb,
      };
    }
    const gap =
      this.last === null ||
      time - this.last > 250 ||
      time <= this.last ||
      label !== this.lastLabel;
    if (gap) {
      this.trigger.reset();
      this.candidate = null;
    }
    const dt = gap ? 0 : time - this.last;
    this.last = time;
    this.lastLabel = label;
    const action =
      !this.held && o.gripping ? "pick" : this.held && o.open ? "drop" : null;
    if (action !== this.candidate) {
      this.candidate = action;
      this.since = time;
    }
    if (action && time - this.since >= (action === "pick" ? 120 : 220)) {
      this.held = action === "pick";
      picked = this.held;
      dropped = !this.held;
      this.candidate = null;
      this.trigger.reset();
    }
    const alpha = gap
      ? 1
      : 1 - Math.exp(-dt / Math.max(1, profile.trigger.smoothing));
    this.lastThumbSignal = o.thumbSignal;
    const { raised, wrapped } = this.thumbCalibration;
    const calibrated =
      Number.isFinite(raised) &&
      Number.isFinite(wrapped) &&
      Math.abs(wrapped - raised) >= 10;
    const thumbValue = calibrated
      ? clamp((o.thumbSignal - raised) / (wrapped - raised))
      : o.thumb;
    this.thumb += (thumbValue - this.thumb) * alpha;
    const t =
      this.held && !picked
        ? this.trigger.update(world, time, profile.trigger)
        : { value: 0, fired: false, pressed: false };
    return {
      valid: true,
      held: this.held,
      picked,
      dropped,
      index: t.value,
      thumb: this.thumb,
      fired: t.fired,
      pressed: t.pressed,
      armed: this.trigger.armed,
      observation: o,
    };
  }
  lose() {
    this.trigger.reset();
    this.candidate = null;
    this.last = null;
    this.lastThumbSignal = null;
  }
  calibrateThumb(endpoint, time) {
    if (!["raised", "wrapped"].includes(endpoint))
      throw Error("Unknown thumb pose");
    if (
      this.last === null ||
      !Number.isFinite(this.lastThumbSignal) ||
      time - this.last > 250
    )
      throw Error("Show one clear hand to the camera first.");
    const next = { ...this.thumbCalibration, [endpoint]: this.lastThumbSignal };
    if (
      Number.isFinite(next.raised) &&
      Number.isFinite(next.wrapped) &&
      Math.abs(next.wrapped - next.raised) < 10
    )
      throw Error(
        "Those poses look too similar. Raise the thumb fully, then wrap it and capture again.",
      );
    this.thumbCalibration = next;
    return Number.isFinite(next.raised) && Number.isFinite(next.wrapped);
  }
}
