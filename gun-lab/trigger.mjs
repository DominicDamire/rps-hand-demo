const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function indexBends(points) {
  if (!Array.isArray(points) || points.length !== 21) return null;
  const p = points.map((v) => (Array.isArray(v) ? v : [v?.x, v?.y, v?.z]));
  if (p.some((v) => v.length !== 3 || v.some((x) => !Number.isFinite(x))))
    return null;
  const bend = (a, b, c) => {
    const u = p[b].map((x, i) => x - p[a][i]),
      v = p[c].map((x, i) => x - p[b][i]),
      d = Math.hypot(...u) * Math.hypot(...v);
    return d < 1e-10
      ? null
      : (Math.acos(clamp(u.reduce((s, x, i) => s + x * v[i], 0) / d, -1, 1)) *
          180) /
          Math.PI;
  };
  const result = [bend(0, 5, 6), bend(5, 6, 7), bend(6, 7, 8)];
  return result.some((x) => x === null) ? null : result;
}
export class TriggerTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.value = 0;
    this.armed = false;
    this.down = false;
    this.last = null;
    this.bends = null;
    this.renderedBends = null;
  }
  update(points, time, settings) {
    const bends = indexBends(points);
    if (!bends || !Number.isFinite(time)) {
      this.reset();
      return { valid: false, value: 0, pressed: false, fired: false };
    }
    if (this.last !== null && (time <= this.last || time - this.last > 250))
      this.reset();
    const dt = this.last === null ? 0 : time - this.last,
      raw = clamp(
        (bends[1] - settings.released) / (settings.pressed - settings.released),
        0,
        1,
      );
    const alpha =
      this.last === null || settings.smoothing === 0
        ? 1
        : 1 - Math.exp(-dt / settings.smoothing);
    this.value += (raw - this.value) * alpha;
    this.renderedBends = bends.map((v, i) =>
      this.renderedBends
        ? this.renderedBends[i] + (v - this.renderedBends[i]) * alpha
        : v,
    );
    this.last = time;
    this.bends = bends;
    let fired = false;
    if (this.value <= settings.off) {
      this.down = false;
      this.armed = true;
    }
    if (this.armed && this.value >= settings.on) {
      this.down = true;
      this.armed = false;
      fired = true;
    }
    return {
      valid: true,
      value: this.value,
      pressed: this.down,
      fired,
      bends,
      renderedBends: this.renderedBends,
    };
  }
  stale(time) {
    if (this.last !== null && time - this.last > 250) {
      this.reset();
      return true;
    }
    return false;
  }
}
