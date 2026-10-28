// The PC side of "phone as camera" over the broker link: the phone (phone.mjs) runs the trackers and sends landmarks,
// and this turns them back into exactly the worker messages app.mjs and HeadView already expect, so the rest of the page
// does not know the difference. Nothing here needs a peer-to-peer connection, so it works on mobile data and across
// networks, unlike the WebRTC video path in camlink.mjs (kept for one shared Wi-Fi: open the page with &video=1).
import { connectLink, unpackHands, linkCode } from "./link.mjs?v=90";

function shim() {   // looks enough like a Worker for app.mjs / HeadView
  let fn = null, pending = null;   // the phone can say "ready" before the page attaches its handler: replay it
  const w = {
    onerror: null, postMessage() {}, terminate() {},   // the link outlives Stop/Start, so terminate does nothing
    get onmessage() { return fn; },
    set onmessage(f) { fn = f; if (f && pending) { const d = pending; pending = null; queueMicrotask(() => f({ data: d })); } },
    deliver(data) { if (fn) fn({ data }); else if (data.type === "ready") pending = data; },
  };
  return w;
}

let live = null;   // one link per page, kept across Stop/Start so the phone never has to reconnect

export async function startRemote({ onStatus = () => {}, fresh = false } = {}) {
  if (live && live.link.connected && !fresh) { live.overlay?.remove(); return live; }
  const code = linkCode();
  const url = new URL("camera.html?v=90&cam=" + code, location.href).href;
  const box = document.createElement("div");
  box.id = "camlink";
  box.style.cssText = "position:fixed;inset:0;z-index:50;display:grid;place-items:center;text-align:center;background:rgba(10,14,20,.94);color:#fff;font:16px/1.4 system-ui,sans-serif";
  box.innerHTML = `<div><div style="color:#9aa4b8">On the phone: scan this, or open <b>camera.html</b> and enter the code</div>
    <div id="camCode" style="font-size:72px;font-weight:800;letter-spacing:6px;margin:8px 0">${code}</div>
    <div id="camQr" style="display:inline-block;background:#fff;padding:12px;border-radius:12px"></div>
    <div id="camUrl" style="color:#9aa4b8;margin-top:8px;font-size:13px">${url}</div>
    <div id="camState" style="margin-top:10px;color:#a9edc7">starting…</div>
    <div style="margin-top:6px;color:#6f7c90;font-size:12px">The phone tracks your hands and face and sends the numbers here.<br>Any network: same Wi-Fi, mobile data, or both.</div></div>`;
  document.body.appendChild(box);
  const state = t => { const el = box.querySelector("#camState"); if (el) el.textContent = t; onStatus(t); };
  try { new QRCode(box.querySelector("#camQr"), { text: url, width: 200, height: 200 }); } catch (e) { console.warn("qr", e); }

  const hand = shim(), head = shim();
  const size = { w: 640, h: 480 };
  let started = false, lastSeen = 0, phoneFps = 0, resolveFirst = null;
  const first = new Promise(res => { resolveFirst = res; });

  // Results are stamped a few ms in the past. The page compares them with the animation frame's timestamp, which is the
  // time the frame was scheduled - a message that lands between that moment and the frame callback would otherwise look
  // like it came from the future, and the page's freshness test (now >= ts) would throw the face away every time.
  const stamp = () => performance.now() - 8;
  const onMessage = (kind, payload) => {
    lastSeen = performance.now();
    if (!started) {   // the first word from the phone: let the page's own "worker is ready" waits through
      started = true; hand.deliver({ type: "ready", delegate: "phone" }); head.deliver({ type: "ready", delegate: "phone" });
      state("phone connected"); box.remove(); resolveFirst?.();
    }
    try {
      if (kind === "h") {
        const r = unpackHands(payload instanceof Uint8Array ? payload : new Uint8Array(payload));
        hand.deliver({ type: "result", inferenceMs: 0, time: stamp(), handedness: r.handedness, landmarks: r.landmarks, worldLandmarks: r.worldLandmarks });
      } else if (kind === "f") {
        const d = JSON.parse(payload.toString());
        head.deliver({ type: "pose", ts: Math.floor(stamp()), pose: d.p || null, found: !!d.f, width: d.w || 288 });
      } else if (kind === "b") {
        const d = JSON.parse(payload.toString()); live?.onBody?.(d.p || null);
      } else if (kind === "p") {
        const d = JSON.parse(payload.toString());
        if (d.w > 0) { size.w = d.w; size.h = d.h; } phoneFps = d.fps || 0;
      }
    } catch (e) { console.warn("link message", kind, e); }
  };

  const link = await connectLink(code, { onStatus: state, onMessage });
  state("waiting for the phone… (camera " + code + ")");
  live = { code, link, handWorker: hand, headWorker: head, size, overlay: box, first, onBody: null,
    get connected() { return link.connected; }, get seenAgo() { return performance.now() - lastSeen; }, get fps() { return phoneFps; },
    close() { try { box.remove(); } catch {} link.close(); live = null; } };
  await first;
  return live;
}

// The page reads $('cam').videoWidth/videoHeight in a dozen places; with no video of our own, report the phone's size.
export function shimVideoSize(el, size) {
  for (const [k, get] of [["videoWidth", () => size.w], ["videoHeight", () => size.h], ["readyState", () => 4]])
    try { Object.defineProperty(el, k, { get, configurable: true }); } catch {}
}
