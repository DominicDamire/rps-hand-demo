// Synthesized game sounds. Everything is made with WebAudio oscillators
// and noise, so there is nothing to download and nothing to keep in the repo. gun.mjs keeps its own bang/clink.
// The browser only allows audio after a gesture, so ensure() is called from the Start button and from the first punch.
let ctx = null, master = null;

export function ensure() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    if (!master) { master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
  } catch { ctx = null; }
  return !!ctx && ctx.state === "running";
}
export const running = () => !!ctx && ctx.state === "running";
export function volume(v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); }

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    const n = Math.floor(ctx.sampleRate * 1.2); noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4; return s;
}
// a shaped burst of filtered noise
function burst({ gain = 0.4, attack = 0.004, decay = 0.15, type = "bandpass", from = 1200, to = 400, q = 1 }) {
  if (!running()) return;
  const t = ctx.currentTime, src = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type; f.Q.value = q; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + decay);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + attack + decay + 0.02);
}
function tone({ gain = 0.3, from = 180, to = 60, decay = 0.18, type = "sine", delay = 0 }) {
  if (!running()) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(master); o.start(t); o.stop(t + decay + 0.02);
}
const c01 = v => Math.max(0, Math.min(1, v));

// v: how hard, 0..1
export const whoosh = (v = 0.6) => burst({ gain: 0.05 + 0.16 * c01(v), attack: 0.05, decay: 0.13, from: 500, to: 1600, q: 0.7 });
export const punch = (v = 0.6) => { const s = c01(v); burst({ gain: 0.2 + 0.4 * s, attack: 0.002, decay: 0.07 + 0.06 * s, from: 900, to: 120, q: 0.8 }); tone({ gain: 0.25 + 0.45 * s, from: 130 - 30 * s, to: 38, decay: 0.14 + 0.1 * s }); };
export const tap = (v = 0.4) => burst({ gain: 0.06 + 0.18 * c01(v), attack: 0.001, decay: 0.035, type: "highpass", from: 2200, to: 1400, q: 0.5 });
export const step = (v = 0.5) => burst({ gain: 0.05 + 0.1 * c01(v), attack: 0.002, decay: 0.08, type: "lowpass", from: 1100, to: 180, q: 0.6 });
export const grab = () => { burst({ gain: 0.12, attack: 0.001, decay: 0.05, type: "highpass", from: 2600, to: 1200 }); tone({ gain: 0.08, from: 420, to: 260, decay: 0.07, type: "square" }); };
export const clink = (v = 0.5) => tone({ gain: 0.1 + 0.2 * c01(v), from: 1900, to: 850, decay: 0.17, type: "triangle" });
