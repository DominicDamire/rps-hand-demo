// Networking for RPS Hand. No server of ours: PeerJS's free public broker only introduces two browsers to each
// other (signalling); the hand streams and game messages then go browser-to-browser over WebRTC data channels.
// Roles:  player  = a phone with the camera (tracks, streams its hands); PeerJS id rpsh-<code>
//         screen  = a PC browser that shows the 3D view; PeerJS id rpsh-s-<screen code>. The SCREEN shows its code
//                   (and a QR of ?pair=<code>) and waits; the PHONE dials it (PC LINK, or the QR opens ?pair=).
// Lobbies with no backend: a host claims the PeerJS id "rpsh-room-<k>" (first free k). Anyone can discover open
// rooms by probing those ids (a connect + {t:"probe"} answered with the room's info), and join by sending
// {t:"join", code}; the host then dials the joiner's own player id and both continue over player ids.
// Quick match = join the first open room, else open one and wait. Limit: ROOMS probes per listing.
// Requires window.Peer (peerjs.min.js loaded by a classic <script> before this module).

const ICE = { iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },   // free public TURN relay for strict mobile NATs
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
] };
const ROOMS = 8;                 // ids rpsh-room-1..8 are probed for the lobby list
const PROBE_MS = 2500;
const CODE_LEN = 3;              // owner: 3 digits are enough to type across the room
const rnd = () => String(Math.floor(10 ** (CODE_LEN - 1) + Math.random() * 9 * 10 ** (CODE_LEN - 1)));
let wake = null;
async function keepAwake() {     // a sleeping phone drops the broker socket and its code; ask the screen to stay on while online
  try { if (!wake && navigator.wakeLock) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") keepAwake(); });

function stored(store, key, fresh = false) {   // a short numeric code kept in this browser (localStorage) or this tab (sessionStorage)
  let c = null;
  try { c = fresh ? null : store.getItem(key); if (!c) { c = rnd(); store.setItem(key, c); } } catch { c = rnd(); }
  return c;
}
export const myCode = (fresh = false) => stored(sessionStorage, "rpsh_code" + CODE_LEN, fresh);   // the phone's id: per tab, so two tabs never fight over it
export const screenCode = (fresh = false) => stored(localStorage, "rpsh_screen" + CODE_LEN, fresh); // the screen's code: per browser, so its QR survives a reload

// cb: { status(text), hands(pkt, from), game(msg, from), matched(role), lost(who), rooms(list), roomOpen(k),
//       screenReady(code), linked(phoneCode), unlinked() }
export function createNet(cb) {
  let code = myCode();
  const net = { get code() { return code; }, peer: null, opp: null, screen: null, phone: null, host: false, room: null, stats: { sent: 0, recv: 0 } };
  const say = t => cb.status?.(t);

  function wire(conn, who) {                                  // attach a data connection as the opponent or the screen
    conn.on("data", m => {
      net.stats.recv++;
      if (m?.t === "h") { cb.hands?.(m, who); if (who === "opp" && net.screen?.open) net.screen.send({ ...m, who: "opp" }); }
      else if (m?.t === "g") { cb.game?.(m, who); if (who === "opp" && net.screen?.open) net.screen.send(m); }
    });
    conn.on("close", () => { if (net[who] === conn) { net[who] = null; cb.lost?.(who); say(who === "opp" ? "opponent left" : "screen disconnected"); } });
    conn.on("error", e => console.warn("conn error", who, e));
  }
  function becomeOpp(conn, role) { net.opp = conn; wire(conn, "opp"); net.host = role === "host"; say("matched (" + role + ")"); cb.matched?.(role); }

  let retries = 0;
  function ensurePeer() {                                     // the player's own peer, id rpsh-<code>
    if (net.peer && !net.peer.destroyed) return net.peer;
    const p = net.peer = new Peer("rpsh-" + code, { config: ICE });
    p.on("open", () => { retries = 0; say("online as " + code); keepAwake(); });
    p.on("disconnected", () => {                              // broker socket dropped (phone slept, network blip): come back, unless we are replacing this peer
      if (p.dead || p.destroyed) return;
      say("reconnecting to the broker…"); setTimeout(() => { if (!p.dead && !p.destroyed) p.reconnect(); }, 1500);
    });
    p.on("error", e => {
      if (e.type === "peer-unavailable") return;              // a probe or a dial to an absent id; handled by timeouts
      console.warn("peer error", e);
      if (e.type === "unavailable-id") {                        // this code is registered elsewhere (another tab, a stale page): take a new one right away
        p.dead = true; p.destroy(); code = myCode(true);
        if (retries++ < 8) { say("code taken, switching to " + code); setTimeout(ensurePeer, 500); } else say("cannot register with the broker");
      } else if (e.type === "network" || e.type === "server-error") { p.dead = true; say("broker unreachable, retrying…"); p.destroy(); setTimeout(ensurePeer, 3000); }
    });
    p.on("connection", conn => {
      conn.on("open", () => {
        conn.once("data", m => {
          if (m?.t === "hello" && m.role === "player") { conn.send({ t: "hello", role: "player", code }); becomeOpp(conn, "guest"); }
        });
      });
    });
    return p;
  }
  const whenOpen = f => (net.peer?.open ? f() : ensurePeer().once("open", f));

  // --- PC screen: register its own id, show its code, wait for a phone -----------------------------------------
  net.becomeScreen = () => {
    let sc = screenCode(), tries = 0;
    const register = () => {
      const p = net.peer = new Peer("rpsh-s-" + sc, { config: ICE });
      p.on("open", () => { say("screen " + sc + ": waiting for a phone…"); cb.screenReady?.(sc); keepAwake(); });
      p.on("disconnected", () => setTimeout(() => { if (!p.dead && !p.destroyed) p.reconnect(); }, 1500));
      p.on("error", e => {
        if (e.type === "unavailable-id") {                     // an earlier load of this screen still holds the code (up to ~1 min): keep the number, wait it out
          p.dead = true; p.destroy();
          if (tries++ < 30) { say("screen " + sc + " busy (an older page of this screen is still registered), retrying… " + tries); cb.screenReady?.(sc); setTimeout(register, 2000); }
          else { sc = screenCode(true); tries = 0; register(); }
        }
        else if (e.type === "network" || e.type === "server-error") { say("broker unreachable, retrying…"); p.destroy(); setTimeout(register, 3000); }
        else if (e.type !== "peer-unavailable") console.warn("screen peer error", e);
      });
      p.on("connection", conn => conn.on("open", () => conn.once("data", m => {
        if (m?.t !== "hello" || m.role !== "player") return;
        if (net.phone?.open) { conn.close(); return; }          // one phone per screen
        net.phone = conn; conn.send({ t: "hello", role: "screen", code: sc }); say("linked to phone " + m.code); cb.linked?.(m.code);
        conn.on("data", d => { net.stats.recv++; if (d?.t === "h") cb.hands?.(d, d.who || "me"); else if (d?.t === "g") cb.game?.(d, "player"); });
        conn.on("close", () => { if (net.phone === conn) { net.phone = null; say("screen " + sc + ": phone disconnected, waiting…"); cb.unlinked?.(sc); } });
      })));
    };
    register();
    return sc;
  };

  // --- phone: dial a screen by its code, keep trying until it answers, re-dial if it drops -------------------------
  net.linkScreen = sc => {
    let tries = 0, stop = false;
    net.unlinkScreen = () => { stop = true; try { net.screen?.close(); } catch {} net.screen = null; };
    const dial = () => whenOpen(() => {
      if (stop || net.screen?.open) return;
      tries++; say(tries === 1 ? "linking to screen " + sc + "…" : `waiting for screen ${sc}… (${tries}) is the SCREEN page open on the PC?`);
      const conn = net.peer.connect("rpsh-s-" + sc, { reliable: true });
      let opened = false;
      conn.on("open", () => { opened = true; conn.send({ t: "hello", role: "player", code }); net.screen = conn; wire(conn, "screen"); say("PC linked (screen " + sc + ")"); try { localStorage.setItem("rpsh_last_screen", sc); } catch {} });
      conn.on("close", () => { if (!stop) setTimeout(dial, 3000); });
      setTimeout(() => { if (!opened && !stop) { try { conn.close(); } catch {} dial(); } }, 4000);
    });
    dial();
  };

  // --- rooms --------------------------------------------------------------------------------------------------
  net.createRoom = (k = 1) => {                               // claim the first free room id and wait there
    if (net.room) return;
    if (k > ROOMS) { say("all " + ROOMS + " lobbies are taken, try again later"); return; }
    const id = "rpsh-room-" + k, room = new Peer(id, { config: ICE });
    room.on("open", () => {
      net.room = { peer: room, k, open: true }; say("lobby " + k + " open, waiting for a player… (your code " + code + ")"); cb.roomOpen?.(k);
      room.on("connection", c => c.on("open", () => c.once("data", m => {
        if (m?.t === "probe") { c.send({ t: "room", k, host: code, open: !!net.room?.open && !net.opp }); setTimeout(() => c.close(), 300); return; }
        if (m?.t === "join" && m.code && net.room?.open && !net.opp) {
          net.room.open = false;
          const conn = net.peer.connect("rpsh-" + m.code, { reliable: true });   // talk over player ids from now on
          conn.on("open", () => { conn.send({ t: "hello", role: "player", code }); becomeOpp(conn, "host"); net.leaveRoom(); });
          setTimeout(() => c.close(), 1500);
        }
      })));
    });
    room.on("error", e => { if (e.type === "unavailable-id") { room.destroy(); net.createRoom(k + 1); } else if (e.type !== "peer-unavailable") console.warn("room error", e); });
  };
  net.leaveRoom = () => { if (net.room) { net.room.peer.destroy(); net.room = null; } };

  net.listRooms = () => new Promise(res => whenOpen(() => {   // probe every room id; open rooms answer within PROBE_MS
    const found = [], conns = [];
    for (let k = 1; k <= ROOMS; k++) {
      const c = net.peer.connect("rpsh-room-" + k, { reliable: true }); conns.push(c);
      c.on("open", () => c.send({ t: "probe" }));
      c.on("data", m => { if (m?.t === "room") found.push(m); });
    }
    setTimeout(() => { for (const c of conns) try { c.close(); } catch {} const list = found.filter(r => r.open && r.host !== code).sort((a, b) => a.k - b.k); cb.rooms?.(list); res(list); }, PROBE_MS);
  }));

  net.joinRoom = k => whenOpen(() => {                        // knock on a room; its host dials our player id back
    say("joining lobby " + k + "…");
    const c = net.peer.connect("rpsh-room-" + k, { reliable: true });
    c.on("open", () => c.send({ t: "join", code }));
    setTimeout(() => { if (!net.opp) { say("lobby " + k + " did not answer"); try { c.close(); } catch {} } }, 8000);
  });

  net.quickMatch = async () => {                              // first open room, else open one and wait
    if (net.opp) return;
    say("looking for a player…");
    const list = await net.listRooms();
    if (list.length) net.joinRoom(list[0].k); else net.createRoom();
  };

  net.sendHands = pkt => {                                    // pkt: { t:"h", who:"me", hands:[{n, a:[63], m}], ts }
    for (const c of [net.opp, net.screen]) if (c?.open) { c.send(pkt); net.stats.sent++; }
  };
  net.sendGame = (msg, screenOnly = false) => { for (const c of (screenOnly ? [net.screen] : [net.opp, net.screen])) if (c?.open) c.send({ t: "g", ...msg }); };
  net.start = () => ensurePeer();
  return net;
}
