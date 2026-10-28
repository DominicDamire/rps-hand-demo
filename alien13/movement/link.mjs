// Phone <-> PC data link over a public MQTT broker (WebSocket), and the packing of tracking results.
//
// Why not WebRTC: camlink.mjs sends the phone's CAMERA to the PC peer-to-peer, which needs a direct path between the two
// devices. Every free TURN relay it could fall back on is gone (2026-09-11: openrelay.metered.ca answers but rejects its
// own credentials, eu-0/us-0.turn.peerjs.com and freeturn.tel no longer resolve), so on anything but one shared Wi-Fi the
// connection stops at "negotiating". A broker link is a plain outgoing WebSocket from each side, so it works on mobile
// data, on guest Wi-Fi and across networks. Instead of video we send what the game actually needs: the phone runs the
// trackers and publishes the landmarks (about 0.5 KB per hand frame), which is also less to carry than video.
//
// Measured 2026-09-11 (Edge, this PC, 1.2 KB messages at 15 Hz): broker.hivemq.com 82-102 ms, broker.emqx.io 202-302 ms.
// Nothing is stored on the broker (no retained messages) and no image ever leaves the phone, but the landmark numbers do
// pass through a public server, so treat the link as public.
const BROKERS = [
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
];
const MQTT_JS = new URL("../vendor/mqtt.min.js", import.meta.url).href;
const CODE_KEY = "rpsh_cam3";   // the same code camlink.mjs uses, so a phone that has one keeps it
const S = 8000;                 // int16 scale: +-4.09 for normalized landmarks and for metres

export function linkCode(fresh = false) {
  const rnd = () => String(Math.floor(100 + Math.random() * 900));
  try { let c = fresh ? null : localStorage.getItem(CODE_KEY); if (!c) { c = rnd(); localStorage.setItem(CODE_KEY, c); } return c; } catch { return rnd(); }
}

let mqttLoad = null;
function loadMqtt() {
  if (window.mqtt) return Promise.resolve(window.mqtt);
  mqttLoad ??= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = MQTT_JS;
    s.onload = () => window.mqtt ? res(window.mqtt) : rej(Error("mqtt.js did not load"));
    s.onerror = () => rej(Error("mqtt.js could not be fetched")); document.head.appendChild(s);
  });
  return mqttLoad;
}

// Connects to EVERY broker that answers and keeps them all. Trying them one at a time looked simpler but broke the link
// whenever the two devices happened to pick different brokers: they were each connected, each "working", and neither ever
// heard the other. The sender publishes on all of them; the receiver follows whichever one delivered last and ignores the
// copies, so a broker that goes quiet costs at most 1.5 s.
// onMessage(kind, payload): kind is the last topic segment ("h" hands, "f" face, "b" body, "p" phone status).
export async function connectLink(code, { onMessage = () => {}, onStatus = () => {}, subscribe = true, subscribeTo = "#" } = {}) {
  const mqtt = await loadMqtt();
  const base = "rpsh1/" + code;
  const clients = new Array(BROKERS.length).fill(null);
  let dead = false, from = -1, fromAt = -Infinity, connectedCount = 0;
  let readyResolve, readyReject, finished = 0;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  onStatus("connecting to relay…");
  BROKERS.forEach((url, i) => {
    let settled = false, everConnected = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      finished++;
      if (finished === BROKERS.length && !clients.some(Boolean)) readyReject(Error("no relay reachable; check Internet access or try another network"));
    };
    let c;
    try { c = mqtt.connect(url, { connectTimeout: 8000, keepalive: 20, reconnectPeriod: 3000, clean: true, clientId: "rpsh_" + Math.random().toString(36).slice(2, 10) }); }
    catch { return finish(); }
    c.on("connect", () => {
      if (dead) { c.end(true); return; }
      if (subscribe || subscribeTo !== "#") c.subscribe(base + "/" + subscribeTo, { qos: 0 });
      clients[i] = c;
      const firstConnection = connectedCount === 0;
      if (!everConnected) { everConnected = true; connectedCount++; }
      finish();
      readyResolve();
      if (firstConnection) onStatus("relay connected");
    });   // the phone takes only "c", the PC's control topic: subscribing to everything would echo its own frames back
    c.on("message", (topic, payload) => {
      if (dead) return;
      const now = performance.now();
      if (from !== i) { if (now - fromAt < 1500) return; from = i; }   // one broker at a time; switch only when the current one goes quiet
      fromAt = now;
      onMessage(topic.slice(topic.lastIndexOf("/") + 1), payload);
    });
    c.on("error", () => finish());
    c.on("close", () => finish());
    setTimeout(finish, 9000);
  });
  await ready;
  return {
    code, base,
    get connected() { return clients.some(c => c?.connected); },
    get broker() { return from >= 0 ? new URL(BROKERS[from]).hostname : clients.findIndex(Boolean) >= 0 ? new URL(BROKERS[clients.findIndex(Boolean)]).hostname : "none"; },
    send(kind, payload) { if (dead) return; for (const c of clients) if (c?.connected) try { c.publish(base + "/" + kind, payload, { qos: 0 }); } catch {} },
    sendJSON(kind, obj) { this.send(kind, JSON.stringify(obj)); },
    close() { dead = true; for (const c of clients) try { c?.end(true); } catch {} },
  };
}

// ---- packing -------------------------------------------------------------------------------------------------------
// hands: [nHands][per hand: right, score*255][int16 x,y,z * 21 image, then * 21 world, per hand]
export function packHands(result) {
  const n = Math.min(2, result.landmarks?.length || 0);
  const buf = new ArrayBuffer(1 + 2 * n + 2 * 126 * n), v = new DataView(buf);
  v.setUint8(0, n);
  for (let h = 0; h < n; h++) {
    const cat = result.handedness?.[h]?.[0];
    v.setUint8(1 + 2 * h, cat?.categoryName === "Right" ? 1 : 0);
    v.setUint8(2 + 2 * h, Math.round(Math.min(1, Math.max(0, cat?.score ?? 0)) * 255));
  }
  let o = 1 + 2 * n;
  const put = p => { for (const k of ["x", "y", "z"]) { v.setInt16(o, Math.max(-32767, Math.min(32767, Math.round((p[k] || 0) * S))), true); o += 2; } };
  for (let h = 0; h < n; h++) { for (const p of result.landmarks[h]) put(p); for (const p of result.worldLandmarks[h]) put(p); }
  return new Uint8Array(buf);
}

export function unpackHands(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = v.getUint8(0);
  const handedness = [], landmarks = [], worldLandmarks = [];
  for (let h = 0; h < n; h++) handedness.push([{ categoryName: v.getUint8(1 + 2 * h) ? "Right" : "Left", score: v.getUint8(2 + 2 * h) / 255 }]);
  let o = 1 + 2 * n;
  const get = () => { const p = { x: v.getInt16(o, true) / S, y: v.getInt16(o + 2, true) / S, z: v.getInt16(o + 4, true) / S }; o += 6; return p; };
  for (let h = 0; h < n; h++) {
    const a = [], b = [];
    for (let i = 0; i < 21; i++) a.push(get());
    for (let i = 0; i < 21; i++) b.push(get());
    landmarks.push(a); worldLandmarks.push(b);
  }
  return { handedness, landmarks, worldLandmarks };
}

export const bytes = s => typeof s === "string" ? s : new TextDecoder().decode(s);
