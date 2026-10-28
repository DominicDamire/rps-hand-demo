// The phone side of "phone as camera": the phone runs the trackers on its own camera and sends the landmarks to the PC
// through the broker link (link.mjs). No video leaves the phone, so no peer-to-peer connection and no relay is needed -
// which is the whole point: the WebRTC video path (camlink.mjs) only completes when both devices can reach each other
// directly, and every free TURN relay it could fall back on is dead (it worked on one phone, not on another).
// Extra: the phone does the inference, so the PC only draws, and the link carries about 0.5 KB per hand frame.
import { connectLink, packHands } from "./link.mjs?v=90";

const HFOV = Math.PI / 3;

export async function startPhone(code, video, onStatus = () => {}) {
  onStatus("opening the camera…");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
  video.srcObject = stream; video.muted = true; await video.play().catch(() => {});
  try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch {}

  onStatus("connecting to PC " + code + "…");
  const link = await connectLink(code, { onStatus: t => onStatus(t), subscribeTo: "c",   // only the PC's control topic: subscribing to everything would echo our own frames back
    onMessage: (kind, payload) => { if (kind !== "c") return; try { const d = JSON.parse(payload.toString()); if (typeof d.body === "number") setBody(!!d.body); } catch {} } });
  onStatus("connected · loading tracking…");

  let wantBody = new URLSearchParams(location.search).get("body") === "1";   // off until the PC asks: with "head only" there is nothing to drive
  const dbg = window.rpshPhone = { face: null, body: null, get ready() { return ready; }, get fps() { return fps; }, get err() { return err; } };   // diagnostics for the author's phone
  const hand = new Worker(new URL("./tracker.mjs?v=90", import.meta.url), { type: "module" });
  const head = new Worker(new URL("./head-tracker.mjs?v=90", import.meta.url), { type: "module" });
  let bodyW = null;   // started a few seconds later: the hand and the face matter more and three models at once stall a phone
  const ready = { hand: false, head: false, body: false };
  const WIDTHS = [288, 384, 512]; let widthIdx = 0;   // the face detector misses some faces at one size and finds them at another
  const HEAD_EVERY = 100, BODY_EVERY = 260;   // ms between face and body frames; the hand is sent as fast as it comes back
  let handBusy = false, headBusy = false, bodyBusy = false, lastVideo = -1, lastHeadVideo = -1, lastHeadAt = -Infinity, lastBody = -Infinity;
  let frames = 0, fps = 0, since = performance.now(), sent = 0, err = null, ts = 0, stopped = false;

  hand.onerror = e => { err = "hand tracker: " + (e.message || "error"); };
  head.onerror = e => { err = "face tracker: " + (e.message || "error"); };
  hand.onmessage = ({ data }) => {
    if (data.type === "ready") { ready.hand = true; note(); return; }
    if (data.type === "error") { err = "hand tracker: " + data.message; handBusy = false; return; }
    if (data.type !== "result") return;
    handBusy = false; frames++; sent += 1;
    link.send("h", packHands(data));
  };
  head.onmessage = ({ data }) => {
    if (data.type === "ready") { ready.head = true; note(); return; }
    if (data.type === "error") { err = "face tracker: " + data.message; headBusy = false; return; }
    if (data.type !== "pose") return;
    headBusy = false;
    if (!data.found) widthIdx = (widthIdx + 1) % WIDTHS.length;
    dbg.face = { found: !!data.found, w: data.width, at: Math.round(performance.now()) };
    link.sendJSON("f", { p: data.pose ? round(data.pose) : null, f: data.found ? 1 : 0, w: data.width });
  };
  hand.postMessage({ type: "init" });
  function setBody(on) {
    wantBody = on;
    if (!on) { bodyW?.terminate(); bodyW = null; ready.body = false; bodyBusy = false; return; }
    if (bodyW) return;
    try {
      bodyW = new Worker(new URL("../body/worker.mjs?v=90", import.meta.url), { type: "module" });
      bodyW.onerror = () => { bodyW = null; };
      bodyW.onmessage = ({ data }) => {
        if (data.type === "ready") { ready.body = true; return; }
        if (data.type === "error") { bodyW?.terminate(); bodyW = null; bodyBusy = false; return; }
        if (data.type !== "pose") return;
        bodyBusy = false; dbg.body = { found: !!data.pose, at: Math.round(performance.now()) }; link.sendJSON("b", { p: data.pose ? trim(data.pose) : null });
      };
    } catch { bodyW = null; }
  }
  if (wantBody) setTimeout(() => setBody(true), 3000);

  const round = p => ({ centerX: +p.centerX.toFixed(5), centerY: +p.centerY.toFixed(5), span: +p.span.toFixed(5), yaw: +p.yaw.toFixed(4), pitch: +p.pitch.toFixed(4), roll: +(p.roll ?? 0).toFixed(4) });
  const r4 = a => Array.isArray(a) ? a.map(v => +v.toFixed(4)) : a;   // an upperBodyPose sample, small enough to send
  const trim = s => ({ joints: Object.fromEntries(Object.entries(s.joints).map(([k, v]) => [k, r4(v)])), width: s.width == null ? null : +s.width.toFixed(4),
    shoulder: r4(s.shoulder), hip: r4(s.hip), hipsTracked: s.hipsTracked, evidence: s.evidence, headAnchored: s.headAnchored, partial: s.partial });
  function note() {
    const state = err ? err : !ready.hand ? "loading hand tracking…" : !ready.head ? "loading face tracking…" : `sending to PC ${code} · ${fps} fps${link.connected ? "" : " · link lost, reconnecting…"}`;
    onStatus(state);
  }

  async function grab(width) {
    const W = video.videoWidth, H = video.videoHeight;
    return createImageBitmap(video, { resizeWidth: width, resizeHeight: Math.round(width * H / W), resizeQuality: "low" });
  }
  async function loop() {
    if (stopped) return;
    requestAnimationFrame(loop);
    const now = performance.now();
    if (now - since >= 1000) { fps = Math.round(frames * 1000 / (now - since)); frames = 0; since = now; note(); link.sendJSON("p", { w: video.videoWidth, h: video.videoHeight, fps, hand: ready.hand ? 1 : 0, head: ready.head ? 1 : 0 }); }
    if (!video.videoWidth || document.hidden) return;
    // All three run side by side. Each worker refuses a new frame while it is busy, so they cannot queue up; the hand is
    // sent every camera frame it can take, the face and the body at their own intervals. Taking turns made the fast hand
    // tracker wait for the slow face one and everything crawled.
    try {
      if (ready.hand && !handBusy && video.currentTime !== lastVideo) {
        handBusy = true; lastVideo = video.currentTime; const bitmap = await grab(480); hand.postMessage({ type: "frame", bitmap, time: now }, [bitmap]);
      }
      if (ready.head && !headBusy && now - lastHeadAt >= HEAD_EVERY && video.currentTime !== lastHeadVideo) {
        headBusy = true; lastHeadAt = now; lastHeadVideo = video.currentTime;
        const frame = await grab(Math.min(WIDTHS[widthIdx], video.videoWidth)); ts = Math.max(ts + 1, Math.floor(now)); head.postMessage({ frame, ts, hfov: HFOV }, [frame]);
      }
      if (ready.body && bodyW && !bodyBusy && now - lastBody >= BODY_EVERY) {
        bodyBusy = true; lastBody = now; const frame = await grab(Math.min(384, video.videoWidth)); bodyW.postMessage({ frame, ts: now });
      }
    } catch (e) { handBusy = headBusy = bodyBusy = false; err = e.message; note(); }
  }
  requestAnimationFrame(loop);
  const shut = () => { stopped = true; hand.terminate(); head.terminate(); bodyW?.terminate(); link.close(); };
  addEventListener("pagehide", shut, { once: true });
  return { link, stream, stop: shut };
}
