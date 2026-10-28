// PC side: the fruit arena. Hands arrive as 21 joints per hand (metres, phone camera at the origin looking -z) and are
// real colliders: a sphere per joint plus the palm. Fruits are bodies with a radius. What a contact does depends on the
// hand and its speed: fast pass = SLICE along the plane of the movement; fist at speed = CRUSH; extended fingertip at
// low speed = POKE a hole (three holes burst it); anything slower = PUSH. Juice and points scale with impact speed.
import * as THREE from "three";
import { PARENT, PALM } from "./tracker.mjs";

export const RULES = { slice: 0.9, crush: 0.6, poke: 0.2, gravity: 4.0, spawnEvery: 1100 };   // m/s thresholds (a comfortable swipe is ~1 m/s)
for (const k of Object.keys(RULES)) { const q = new URLSearchParams(location.search).get(k); if (q) RULES[k] = +q; }   // ?slice=1.2 etc.
const KINDS = {
  watermelon: { R: 0.09, color: 0xffffff, flesh: 0xe53935, stripes: true, points: 3, scale: [1, 1, 1] },
  orange:     { R: 0.055, color: 0xff8f00, flesh: 0xffb74d, points: 1, scale: [1, 1, 1] },
  apple:      { R: 0.05, color: 0xd32f2f, flesh: 0xfff3c4, points: 1, scale: [1, 0.95, 1] },
  lemon:      { R: 0.045, color: 0xfdd835, flesh: 0xfff59d, points: 1, scale: [1.25, 0.85, 0.85] },
  kiwi:       { R: 0.042, color: 0x6d4c41, flesh: 0x8bc34a, points: 2, scale: [1.2, 0.85, 0.85] },
};
const V = () => new THREE.Vector3();
const TIPS = { 4: 0, 8: 0, 12: 1, 16: 2, 20: 3 };   // tip joint -> index into fingersUp (thumb shares index's slot: never a poke)

function stripeTex() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const g = c.getContext("2d");
  g.fillStyle = "#43a047"; g.fillRect(0, 0, 256, 128); g.fillStyle = "#1b5e20";
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 32 + 8, 0); g.bezierCurveTo(i * 32 - 6, 40, i * 32 + 22, 90, i * 32 + 8, 128); g.lineTo(i * 32 + 18, 128); g.bezierCurveTo(i * 32 + 32, 90, i * 32 + 4, 40, i * 32 + 18, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function fingersUp(pts) { const w = pts[0]; return [[8, 6], [12, 10], [16, 14], [20, 18]].map(([t, p]) => pts[t].distanceTo(w) > pts[p].distanceTo(w)); }

export function createGame({ canvas, hfov = 60 * Math.PI / 180, onHud }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const LITE = new URLSearchParams(location.search).get("lite") === "1";   // ?lite=1: no shadows, 1x pixels (weak PCs, tests)
  renderer.setPixelRatio(LITE ? 1 : Math.min(devicePixelRatio, 2)); renderer.localClippingEnabled = true; renderer.shadowMap.enabled = !LITE;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x141a26); scene.fog = new THREE.Fog(0x141a26, 1.5, 4);
  const world = new THREE.Group(); world.scale.x = -1; scene.add(world);   // mirror, like the phone's own view
  const camera = new THREE.PerspectiveCamera(50, 1, 0.03, 8);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a4560, 1.4));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(0.5, 1.2, 0.8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.1, far: 6 }); scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0x1e2636, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.75; floor.receiveShadow = true; scene.add(floor);
  let frameW = 480, frameH = 640, pitch = 0;

  // --- hands (capsules) --------------------------------------------------------------------------------------------
  const skin = new THREE.MeshStandardMaterial({ color: 0xdead8f, roughness: 0.6 });
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1), sph = new THREE.SphereGeometry(1, 12, 8), UP = new THREE.Vector3(0, 1, 0);
  const BONES = Object.entries(PARENT).map(([j, p]) => ({ a: +p, b: +j, r: +j <= 4 ? 0.011 : +p === 0 ? 0.014 : 0.009 })).concat([[5, 9], [9, 13], [13, 17]].map(([a, b]) => ({ a, b, r: 0.014 })));
  const JOINT_R = Array.from({ length: 21 }, (_, i) => BONES.find(b => b.b === i)?.r ?? 0.02);
  const hands = new Map();   // "Right"/"Left" -> { group, bones, joints, pts, vel, prev, t, ext, fist }
  function makeHand() {
    const group = new THREE.Group(); world.add(group);
    const mk = g => { const m = new THREE.Mesh(g, skin); m.castShadow = true; group.add(m); return m; };
    return { group, bones: BONES.map(b => ({ ...b, mesh: mk(cyl) })), joints: JOINT_R.map(() => mk(sph)), pts: null, vel: null, prev: null, t: 0, ext: [0, 0, 0, 0], fist: false };
  }
  function drawHand(h) {
    for (const b of h.bones) { const d = h.pts[b.b].clone().sub(h.pts[b.a]), L = d.length(); b.mesh.position.copy(h.pts[b.a]).addScaledVector(d, 0.5); b.mesh.scale.set(b.r, L, b.r); b.mesh.quaternion.setFromUnitVectors(UP, d.normalize()); }
    h.joints.forEach((m, i) => { m.position.copy(h.pts[i]); m.scale.setScalar(JOINT_R[i]); });
    h.group.visible = true;
  }
  let handDepth = -0.35, handX = 0, handY = -0.1;   // where the player's hands are: fruits are thrown there
  function feed(pkt) {     // one packet from the phone
    if (pkt.fw) { if (frameW !== pkt.fw || frameH !== pkt.fh) { frameW = pkt.fw; frameH = pkt.fh; fit(true); } pitch = pkt.p || 0; }
    const now = performance.now(), seen = new Set();
    for (const hd of pkt.hands || []) {
      let h = hands.get(hd.n); if (!h) { h = makeHand(); hands.set(hd.n, h); }
      const pts = Array.from({ length: 21 }, (_, i) => new THREE.Vector3(hd.a[3 * i], hd.a[3 * i + 1], hd.a[3 * i + 2]));
      if (h.pts && now - h.t < 400) {   // joint velocities from consecutive packets, lightly smoothed
        const dt = Math.max(0.01, (pkt.ts - h.ts) / 1000);
        h.vel = h.vel || pts.map(() => V());
        pts.forEach((p, i) => { const v = p.clone().sub(h.pts[i]).divideScalar(dt); h.vel[i].lerp(v, 0.8); });
      } else h.vel = pts.map(() => V());
      h.prev = h.pts && now - h.t < 400 ? h.pts : pts; h.pts = pts; h.t = now; h.ts = pkt.ts; h.ext = fingersUp(pts); h.fist = h.ext.filter(Boolean).length <= 1; seen.add(hd.n);
      const pc = PALM.reduce((c, i) => c.add(pts[i]), V()).multiplyScalar(1 / PALM.length);   // where the hands are: fruits are thrown there
      handDepth += 0.05 * (pc.z - handDepth); handX += 0.05 * (pc.x - handX); handY += 0.05 * (pc.y - handY);
    }
    for (const [k, h] of hands) if (!seen.has(k) && now - h.t > 400) h.group.visible = false;
  }

  // --- fruits ------------------------------------------------------------------------------------------------------
  const stripes = stripeTex();
  const fruits = [], halves = [], holesMat = new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 1 });
  const geoCache = {};
  const geo = k => geoCache[k] ||= new THREE.SphereGeometry(KINDS[k].R, 28, 18);
  const state = { score: 0, combo: 0, comboT: 0, missed: 0, sliced: 0, crushed: 0, poked: 0, running: true, speed: 0 };
  function spawn(kind = null, pos = null, vel = null) {
    const k = kind || Object.keys(KINDS)[Math.floor(Math.random() * 5)], K = KINDS[k];
    const mat = new THREE.MeshStandardMaterial({ color: K.color, roughness: 0.55, map: K.stripes ? stripes : null });
    const mesh = new THREE.Mesh(geo(k), mat); mesh.castShadow = true; mesh.scale.set(...K.scale); world.add(mesh);
    const x = pos ? pos.x : handX + (Math.random() - 0.5) * 0.5, y0 = handY - 0.55, apex = handY + 0.08 + Math.random() * 0.15;
    mesh.position.copy(pos || new THREE.Vector3(x, y0, handDepth + (Math.random() - 0.5) * 0.08));
    const f = { kind: k, K, mesh, vel: vel ? vel.clone() : new THREE.Vector3((handX - x) * 0.5 + (Math.random() - 0.5) * 0.15, Math.sqrt(2 * RULES.gravity * (apex - y0)), 0), spin: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4), holes: 0, lastHit: -1e9, born: performance.now() };
    fruits.push(f); return f;
  }
  function remove(f) { world.remove(f.mesh); f.dead = true; }
  // --- juice -------------------------------------------------------------------------------------------------------
  const MAXP = 3000, pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pVel = [], pLife = new Float32Array(MAXP);
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.012, vertexColors: true, transparent: true, opacity: 0.95 })); world.add(points);
  let pHead = 0; for (let i = 0; i < MAXP; i++) { pVel.push(V()); pPos[3 * i + 1] = -99; }
  function juice(at, color, n, dir = null, speed = 1) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = pHead; pHead = (pHead + 1) % MAXP;
      pPos[3 * i] = at.x; pPos[3 * i + 1] = at.y; pPos[3 * i + 2] = at.z; pCol[3 * i] = c.r; pCol[3 * i + 1] = c.g; pCol[3 * i + 2] = c.b;
      pVel[i].set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.4 + Math.random() * 0.8 * speed);
      if (dir) pVel[i].addScaledVector(dir, 0.5 * speed); pLife[i] = 0.5 + Math.random() * 0.4;
    }
  }
  // --- the four things a hand can do to a fruit -------------------------------------------------------------------
  function hit(f, p, v, hand, joint) {
    const now = performance.now(); if (now - f.lastHit < 150) return null; f.lastHit = now;
    const speed = v.length(); state.speed = speed;
    let what;
    if (hand.fist && speed > RULES.crush) what = "crush";
    else if (speed > RULES.slice) what = "slice";
    else if (joint in TIPS && joint !== 4 && hand.ext[TIPS[joint]] && speed > RULES.poke) what = "poke";
    else what = "push";
    if (what === "push") { f.vel.addScaledVector(v, 0.5); return what; }
    if (what === "poke") {
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), holesMat); hole.position.copy(f.mesh.worldToLocal(p.clone())); f.mesh.add(hole);
      f.holes++; juice(p, f.K.flesh, 12, v.clone().normalize(), 0.6); score(1, now);
      if (f.holes >= 3) { juice(f.mesh.position, f.K.flesh, 50, null, 1.2); remove(f); score(2, now); state.poked++; }
      return what;
    }
    if (what === "crush") { juice(f.mesh.position, f.K.flesh, 40 + Math.min(60, speed * 20), v.clone().normalize(), 1 + speed * 0.3); remove(f); score(f.K.points + 2, now); state.crushed++; return what; }
    slice(f, p, v, now); return what;
  }
  function slice(f, p, v, now) {
    const c = f.mesh.position, n = v.clone().cross(c.clone().sub(p)); if (n.lengthSq() < 1e-6) n.set(0, 0, 1).cross(v); if (n.lengthSq() < 1e-8) n.set(0, 1, 0); n.normalize();
    for (const s of [1, -1]) {
      const ns = n.clone().multiplyScalar(s);
      const mat = f.mesh.material.clone(); const plane = new THREE.Plane(ns, -ns.dot(c)); mat.clippingPlanes = [plane]; mat.clipShadows = true;
      const half = new THREE.Mesh(f.mesh.geometry, mat); half.position.copy(c); half.quaternion.copy(f.mesh.quaternion); half.scale.copy(f.mesh.scale); half.castShadow = true;
      const capR = f.K.R * 0.98, cap = new THREE.Mesh(new THREE.CircleGeometry(capR, 32), new THREE.MeshStandardMaterial({ color: f.K.flesh, roughness: 0.7, side: THREE.DoubleSide }));
      const nLocal = ns.clone().applyQuaternion(f.mesh.quaternion.clone().invert()).normalize();   // plane normal in the fruit's own frame
      cap.position.set(0, 0, 0); cap.lookAt(nLocal.clone().multiplyScalar(-1)); half.add(cap);   // the cap faces the cut side
      if (f.K.kind === "watermelon" || f.kind === "watermelon") { for (let i = 0; i < 10; i++) { const seed = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), holesMat); seed.position.set((Math.random() - 0.5) * capR * 1.2, (Math.random() - 0.5) * capR * 1.2, 0.002); cap.add(seed); } }
      for (const child of f.mesh.children) half.add(child.clone());   // holes already poked stay on the halves
      world.add(half);
      halves.push({ mesh: half, plane, nLocal, vel: f.vel.clone().addScaledVector(ns, 0.45).addScaledVector(v, 0.25), spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), born: now });
    }
    juice(p, f.K.flesh, 25 + Math.min(40, v.length() * 12), v.clone().normalize(), 1 + v.length() * 0.2);
    remove(f); score(f.K.points, now); state.sliced++;
  }
  function score(n, now) { state.combo = now - state.comboT < 700 ? state.combo + 1 : 1; state.comboT = now; state.score += n * (state.combo >= 3 ? 2 : 1); }

  // --- collisions: every joint sphere (+ the palm) against every fruit -----------------------------------------------
  const palmC = V(), _ab = V(), _ac = V();
  function segDist(a, b, c) {   // distance from point c to segment ab
    _ab.subVectors(b, a); _ac.subVectors(c, a); const L2 = _ab.lengthSq(); const t = L2 > 1e-9 ? Math.max(0, Math.min(1, _ac.dot(_ab) / L2)) : 0;
    return _ac.addScaledVector(_ab, -t).length();
  }
  function collide() {
    for (const [, h] of hands) {
      if (!h.pts || !h.group.visible || !h.vel) continue;
      palmC.set(0, 0, 0); for (const i of PALM) palmC.add(h.pts[i]); palmC.multiplyScalar(1 / PALM.length);
      const pv = V(); for (const i of PALM) pv.add(h.vel[i]); pv.multiplyScalar(1 / PALM.length);
      for (const f of fruits) {
        if (f.dead) continue;
        const R = f.K.R * Math.max(...f.K.scale);
        let done = false;
        for (let j = 0; j < 21 && !done; j++) if (segDist(h.prev ? h.prev[j] : h.pts[j], h.pts[j], f.mesh.position) < R + JOINT_R[j]) { hit(f, h.pts[j], h.vel[j], h, j); done = true; }
        if (!done && palmC.distanceTo(f.mesh.position) < R + 0.03) hit(f, palmC, pv, h, -1);
      }
    }
  }

  // --- view: the mirror, one to one with the phone's frame, letterboxed --------------------------------------------
  function fit(force) {
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
    if (!force && canvas.width === (w * pr | 0) && canvas.height === (h * pr | 0)) return;
    renderer.setSize(w, h, false);
    const fa = frameW / frameH, rw = w / h > fa ? h * fa : w, rh = w / h > fa ? h : w / fa, rx = (w - rw) / 2, ry = (h - rh) / 2;
    renderer.setScissorTest(false); renderer.clear(); renderer.setViewport(rx, ry, rw, rh); renderer.setScissor(rx, ry, rw, rh); renderer.setScissorTest(true);
    camera.aspect = fa; camera.fov = 2 * Math.atan(Math.tan(hfov / 2) * frameH / frameW) * 180 / Math.PI; camera.updateProjectionMatrix();
  }

  let prev = performance.now(), nextSpawn = performance.now() + 1500;
  function loop() {
    const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (state.running && now > nextSpawn) { spawn(); nextSpawn = now + RULES.spawnEvery; }
    for (const f of fruits) { if (f.dead) continue; f.vel.y -= RULES.gravity * dt; f.mesh.position.addScaledVector(f.vel, dt); f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt; if (f.mesh.position.y < handY - 0.7) { remove(f); state.missed++; } }
    for (const hf of halves) { hf.vel.y -= RULES.gravity * dt; hf.mesh.position.addScaledVector(hf.vel, dt); hf.mesh.rotation.x += hf.spin.x * dt; hf.mesh.rotation.y += hf.spin.y * dt; hf.plane.normal.copy(hf.nLocal).applyQuaternion(hf.mesh.quaternion).normalize(); hf.plane.constant = -hf.plane.normal.dot(hf.mesh.position); if (hf.mesh.position.y < -0.8 || now - hf.born > 3000) { world.remove(hf.mesh); hf.dead = true; } }
    for (let i = fruits.length - 1; i >= 0; i--) if (fruits[i].dead) fruits.splice(i, 1);
    for (let i = halves.length - 1; i >= 0; i--) if (halves[i].dead) halves.splice(i, 1);
    for (let i = 0; i < MAXP; i++) if (pLife[i] > 0) { pLife[i] -= dt; pVel[i].y -= 3 * dt; pPos[3 * i] += pVel[i].x * dt; pPos[3 * i + 1] += pVel[i].y * dt; pPos[3 * i + 2] += pVel[i].z * dt; if (pLife[i] <= 0) pPos[3 * i + 1] = -99; }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    for (const [, h] of hands) if (h.group.visible && h.pts) drawHand(h);
    collide();
    onHud?.(state);
    fit(false); camera.position.set(0, 0, 0); camera.lookAt(0, Math.sin(pitch), -Math.cos(pitch));
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
  const dbg = { spawn, hit, fruits, halves, hands, state, KINDS, RULES, handDepth: () => handDepth, vec: (x, y, z) => new THREE.Vector3(x, y, z),
    // simulate a joint passing through a fruit: p = contact point, v = velocity, fist/ext describe the hand
    strike(f, p, v, { fist = false, ext = [1, 1, 1, 1], joint = 8 } = {}) { return hit(f, new THREE.Vector3(...p), new THREE.Vector3(...v), { fist, ext }, joint); } };
  return { feed, state, dbg };
}
