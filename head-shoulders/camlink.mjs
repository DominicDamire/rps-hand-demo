// Phone-as-camera link. The PC page (this side) registers "rpsh-cam-<code>" at PeerJS's free broker, shows the code and a
// QR of camera.html?cam=<code>, and waits for the phone to CALL it with its camera stream (WebRTC media, no server of
// ours). The returned MediaStream is used exactly like a local webcam, so the page's own tracker runs on the PC GPU.
// Requires window.Peer (peerjs.min.js) and window.QRCode (qrcode.min.js) loaded by classic <script> tags.
const ICE = { iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
] };
const rnd = () => String(Math.floor(100 + Math.random() * 900));
function camCode(fresh = false) {
  let c = null;
  try { c = fresh ? null : localStorage.getItem("rpsh_cam3"); if (!c) { c = rnd(); localStorage.setItem("rpsh_cam3", c); } } catch { c = rnd(); }
  return c;
}
async function keepAwake() { try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch {} }

// PC: resolves with the phone's MediaStream. onStatus(text) gets progress; the overlay shows code + QR until linked.
// onReplace(stream): a later call from the phone (it re-dials after a drop) hands the new stream here instead.
// One peer per page: Stop/Start and a second "Phone as camera" press keep the code the phone already has, so the
// phone reconnects on its own; after a reload the same code is retried while the broker forgets the old page.
let live = null;   // { peer, code, call, take(stream) | null, replace(stream) | null }
export function phoneCamera(onStatus = () => {}, onReplace = null) {
  return new Promise(resolve => {
    let code = camCode(), sameTries = 0, freshTries = 0;
    const box = document.createElement("div");
    box.id = "camlink";
    box.style.cssText = "position:fixed;inset:0;z-index:50;display:grid;place-items:center;text-align:center;background:rgba(10,14,20,.94);color:#fff;font:16px/1.4 system-ui,sans-serif";
    box.innerHTML = `<div><div style="color:#9aa4b8">On the phone: scan this, or open <b>camera.html</b> and enter the code</div><div id="camCode" style="font-size:72px;font-weight:800;letter-spacing:6px;margin:8px 0">---</div><div id="camQr" style="display:inline-block;background:#fff;padding:12px;border-radius:12px"></div><div id="camUrl" style="color:#9aa4b8;margin-top:8px;font-size:13px"></div><div id="camState" style="margin-top:10px;color:#a9edc7">registering…</div><div style="color:#9aa4b8;margin-top:6px;font-size:13px">Already scanned? Keep the phone page open: it reconnects to this code by itself.</div></div>`;
    document.body.appendChild(box);
    const state = t => { box.querySelector("#camState").textContent = t; onStatus(t); };
    const show = () => {
      const url = new URL("camera.html?cam=" + code, location.href).href;
      box.querySelector("#camCode").textContent = code; box.querySelector("#camUrl").textContent = url;
      const q = box.querySelector("#camQr"); q.innerHTML = ""; try { new QRCode(q, { text: url, width: 200, height: 200 }); } catch (e) { console.warn("qr", e); }
    };
    const take = stream => { state("phone camera connected"); box.remove(); resolve(stream); };
    if (live && !live.peer.destroyed) {   // this page already holds a code: keep it, close the old call so the phone re-dials
      code = live.code; live.take = take; live.replace = onReplace;
      try { live.call?.close(); } catch {} live.call = null;
      show(); state("waiting for the phone… (camera " + code + ", the phone reconnects by itself)");
      return;
    }
    const register = () => {
      const p = new Peer("rpsh-cam-" + code, { config: ICE });
      p.on("open", () => { live = { peer: p, code, call: null, take, replace: onReplace }; show(); state("waiting for the phone… (camera " + code + ")"); keepAwake(); });
      p.on("disconnected", () => setTimeout(() => { if (!p.dead && !p.destroyed) p.reconnect(); }, 1500));
      p.on("error", e => {
        if (e.type === "unavailable-id") {
          p.dead = true; p.destroy();
          if (sameTries++ < 6) { state("code " + code + " still held by the previous page, retrying…"); setTimeout(register, 1500); }   // a reload: the broker drops the old page within seconds; keep the code the phone has
          else if (freshTries++ < 10) { code = camCode(true); sameTries = 0; state("code taken, switching to " + code); setTimeout(register, 300); }
          else state("cannot register with the broker, reload");
        }
        else if (e.type === "network" || e.type === "server-error") { p.dead = true; p.destroy(); state("broker unreachable, retrying…"); setTimeout(register, 3000); }
        else if (e.type !== "peer-unavailable") console.warn("cam peer error", e);
      });
      addEventListener("pagehide", () => { try { p.destroy(); } catch {} });   // release the id the moment the tab closes
      p.on("call", call => {
        if (live) live.call = call;
        call.answer(); state("phone found, connecting…");
        const pc = call.peerConnection;
        pc?.addEventListener("iceconnectionstatechange", () => {
          const st = pc.iceConnectionState;
          if (st === "checking") state("phone found, connecting… (negotiating)");
          else if (st === "failed") state("phone found but the connection failed on this network (ICE); the phone retries…");
        });
        call.on("stream", stream => {
          if (live?.take) { const t = live.take; live.take = null; t(stream); }
          else if (live?.replace) { onStatus("phone camera reconnected"); live.replace(stream); }
        });
        call.on("close", () => { if (live && live.call === call) live.call = null; onStatus("phone camera disconnected, waiting for it to re-call…"); });
      });
    };
    register();
  });
}

// Phone: open the front camera and call the PC with it. Retries until the PC answers; re-calls if the link drops.
export async function sendCamera(code, video, onStatus = () => {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
  if (video) { video.srcObject = stream; video.muted = true; await video.play().catch(() => {}); }
  keepAwake();
  const p = new Peer(undefined, { config: ICE });
  let tries = 0, call = null;
  const dial = () => {
    tries++; onStatus(tries === 1 ? "calling PC " + code + "…" : `waiting for PC ${code}… (${tries}) is the alien page open with ?cam on the PC?`);
    call = p.call("rpsh-cam-" + code, stream);
    if (!call) { setTimeout(dial, 3000); return; }
    let opened = false;
    call.on("stream", () => {});   // the PC sends nothing back
    call.peerConnection?.addEventListener("connectionstatechange", () => {
      const st = call.peerConnection.connectionState;
      if (st === "connected") { opened = true; onStatus("streaming to PC " + code); }
      if (st === "failed" || st === "disconnected" || st === "closed") { if (opened) { opened = false; onStatus("link dropped, re-calling…"); setTimeout(dial, 2000); } }
    });
    call.on("close", () => { if (opened) { opened = false; setTimeout(dial, 2000); } });
    setTimeout(() => { if (!opened) { try { call.close(); } catch {} dial(); } }, 6000);
  };
  p.on("open", dial);
  p.on("error", e => { if (e.type === "peer-unavailable") return; onStatus("error: " + (e.type || e)); });
  return stream;
}
