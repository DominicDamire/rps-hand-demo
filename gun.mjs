// A pistol on a table that a tracked hand can pick up and fire, and a small shooting range. Used by the main page
// (docs/index.html) and by the movement page (docs/movement/shooter.mjs); everything is done in WORLD space.
//   pick up: close the hand (middle, ring, pinky curled) within GRAB_R of the grip
//   fire:    with the gun held, curl the index finger (straight -> bent past FIRE_ON degrees at the middle knuckle)
//   drop:    open the hand (middle, ring, pinky extended); the gun falls to the table or the floor
//   hand:    while held the drawn hand is a canonical gripping pose in gun space (palm on the back strap, fingers around
//            the front strap, thumb along the frame), turned to the tracked palm's orientation and put at the tracked
//            palm centre; the index slides from the frame onto the trigger with the tracked bend (handPose)
//   aim:     an impact dot marks where the barrel ray lands; the red-dot sight is collimated like a real one (the dot
//            shows in the window where the ray from the eye parallel to the barrel crosses the glass)
//   range:   five cans on the far edge of the table and three ring targets down the room; hits are counted, cans fly
// Layout: a `range` group at place.pos (the table-top centre) turned by place.yaw; in the group's frame the player is
// on the +z side and the targets are toward -z (three.js "forward"). The gun is a child of the range group while at
// rest and of the holding hand's group while held (world transform kept across the reparenting).
import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/GLTFLoader.js";

const GRAB_R = 0.2;         // metres from the palm centre to the grip to pick the gun up (0.15 asked for more precision than hand tracking gives)
const FIRE_ON = 50, FIRE_OFF = 40;   // index middle-knuckle bend (degrees) that fires / re-arms the trigger (a press, like a normal gun)
const FIRE_GAP = 0.12;      // seconds between shots
const GRIP = new THREE.Vector3(0, 0.045, 0.062);          // grip centre, gun space (y up, barrel -z): the pick-up point
const BARREL = new THREE.Vector3(0, 0, -1);
const MUZZLE = new THREE.Vector3(0, 0.124, -0.16);
const SIGHT = new THREE.Vector3(0, 0.143, 0.005);          // centre of the red-dot window, gun space
const SIGHT_R = 0.012;                                     // window radius: the dot is visible inside it
const V = () => new THREE.Vector3();
// The gripping hand, right hand, gun space (metres): palm on the back strap, middle/ring/pinky wrapped around the front
// strap under the trigger guard and curling to the left side, thumb along the left side of the frame, index resting
// along the frame above the trigger guard. Mirrored in x for a left hand.
const CANON_R = [
  [0.012, 0.005, 0.128],                                                          // 0 wrist (heel of the hand under the grip)
  [-0.004, 0.045, 0.118], [-0.022, 0.078, 0.095], [-0.028, 0.09, 0.06], [-0.026, 0.093, 0.03],   // thumb: base, knuckle, joint, tip (left side, pointing forward)
  [0.026, 0.084, 0.05], [0.022, 0.104, 0.024], [0.021, 0.107, 0.0], [0.02, 0.108, -0.022],      // index at rest: knuckle, then straight along the frame ABOVE the trigger guard
  [0.027, 0.05, 0.05], [0.02, 0.048, 0.018], [-0.01, 0.046, 0.02], [-0.025, 0.043, 0.036],       // middle: wraps the front strap under the trigger guard (guard bottom y ~0.06)
  [0.026, 0.032, 0.053], [0.019, 0.03, 0.022], [-0.01, 0.028, 0.024], [-0.025, 0.025, 0.04],     // ring
  [0.024, 0.014, 0.056], [0.017, 0.012, 0.03], [-0.006, 0.01, 0.031], [-0.02, 0.008, 0.043],     // pinky
].map(a => new THREE.Vector3(...a));
const PULL_R = [[0.02, 0.095, 0.03], [0.01, 0.096, 0.024], [0.0, 0.094, 0.021]].map(a => new THREE.Vector3(...a));   // index joints 6, 7, 8 with the finger on the trigger (trigger blade at y 0.065-0.106, z ~0.016)
const CANON_L = CANON_R.map(v => new THREE.Vector3(-v.x, v.y, v.z)), PULL_L = PULL_R.map(v => new THREE.Vector3(-v.x, v.y, v.z));
const PULL_FROM = 15, PULL_TO = 60;   // index middle-knuckle bend (degrees) from resting on the frame to fully on the trigger
const PALM_I = [0, 5, 9, 13, 17];
function palmBasis(pts, out) {   // orthonormal (along, across, cross) of a hand: wrist->middle knuckle, index->pinky knuckle, their cross product
  const a = out[0].subVectors(pts[9], pts[0]).normalize(), b = out[1].subVectors(pts[17], pts[5]); b.addScaledVector(a, -b.dot(a)).normalize(); out[2].crossVectors(a, b); return out;
}
const CB_R = palmBasis(CANON_R, [V(), V(), V()]), CB_L = palmBasis(CANON_L, [V(), V(), V()]);
const CC_R = PALM_I.reduce((c, i) => c.add(CANON_R[i]), V()).multiplyScalar(0.2), CC_L = PALM_I.reduce((c, i) => c.add(CANON_L[i]), V()).multiplyScalar(0.2);
export const fingersUp = pts => { const w = pts[0]; return [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => pts[tip].distanceTo(w) > pts[pip].distanceTo(w)); };

export async function makeGun({ scene, worldObjs = [], floorY = -0.28, place = { pos: new THREE.Vector3(0, -0.14, -0.3), yaw: Math.PI }, url = "gun.glb", hold = false }) {
  const range = new THREE.Group(); range.position.copy(place.pos); range.rotation.y = place.yaw; scene.add(range);
  const floorL = floorY - place.pos.y;   // the floor in the range group's frame
  // --- table --------------------------------------------------------------------------------------------------
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.75 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.6), wood); top.position.set(0, -0.02, 0); top.receiveShadow = true; top.castShadow = true; range.add(top);
  for (const [x, z] of [[-0.42, -0.27], [0.42, -0.27], [-0.42, 0.27], [0.42, 0.27]]) {
    const h = -0.04 - floorL; if (h <= 0.02) continue;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.04), wood); leg.position.set(x, -0.04 - h / 2, z); leg.castShadow = true; range.add(leg);
  }
  const marks = new THREE.Group(); scene.add(marks);

  // --- the range: cans on the far edge of the table, ring targets down the room ---------------------------------
  const CAN_R = 0.033, CAN_H = 0.11;
  const canGeo = new THREE.CylinderGeometry(CAN_R, CAN_R, CAN_H, 20), canMat = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.85, roughness: 0.35 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0xb04030, metalness: 0.2, roughness: 0.6 });
  const cans = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(canGeo, canMat); m.castShadow = true; m.name = "can";
    const band = new THREE.Mesh(new THREE.CylinderGeometry(CAN_R + 0.001, CAN_R + 0.001, 0.04, 20), lidMat); m.add(band);
    const rest = new THREE.Vector3(-0.28 + i * 0.14, CAN_H / 2, -0.24);
    m.position.copy(rest); range.add(m); cans.push({ m, rest, state: "up", vel: V(), spin: V(), downT: 0 });
  }
  const ringTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    const cols = ["#f4f1ea", "#1b1b1b", "#f4f1ea", "#1b1b1b", "#c8342a"]; cols.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(128, 128, 128 - i * 24, 0, Math.PI * 2); g.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const boards = [];
  for (const x of [-0.55, 0, 0.55]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.16, 40), new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.9, side: THREE.DoubleSide })); b.name = "board";
    b.position.set(x, 0.22, -2.0); b.castShadow = true; range.add(b); boards.push(b);   // faces +z, the player
    const h = 0.22 - 0.16 - floorL; if (h > 0.02) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 8), wood); pole.position.set(x, 0.22 - 0.16 - h / 2, -2.005); range.add(pole); }
  }
  const targets = [...worldObjs, top, ...cans.map(c => c.m), ...boards];   // what bullets can hit

  // --- the pistol ---------------------------------------------------------------------------------------------
  const gltf = await new GLTFLoader().loadAsync(url);
  const gun = gltf.scene; gun.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material) { o.material.envMapIntensity = 0.8; } } });
  for (const nm of ["Bullet_low", "Catridge_low"]) { const o = gun.getObjectByName(nm); if (o) o.visible = false; }   // the model's loose display cartridge
  const slide = gun.getObjectByName("Slide_low"), slide0 = slide ? slide.position.clone() : null;
  const trig = gun.getObjectByName("Trigger_low"), trig0 = trig ? trig.quaternion.clone() : null, _tq = new THREE.Quaternion(), _tx = new THREE.Vector3(1, 0, 0);   // the trigger pivots at its top: swing it back with the index
  const REST = { pos: new THREE.Vector3(0, 0.016, 0.02), quat: new THREE.Quaternion() };   // standing on the magazine at the near edge, barrel toward the targets (-z)
  gun.position.copy(REST.pos); gun.quaternion.copy(REST.quat); range.add(gun);

  // muzzle flash: additive sprite + a short light; the red dot: a small additive sprite placed on the sight glass
  const radial = (stops, size = 128) => { const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); for (const [k, col] of stops) gr.addColorStop(k, col); g.fillStyle = gr; g.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const flashTex = radial([[0, "rgba(255,255,230,1)"], [0.25, "rgba(255,200,90,0.9)"], [0.6, "rgba(255,120,30,0.35)"], [1, "rgba(255,80,0,0)"]]);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); flash.scale.setScalar(0.09); flash.visible = false; gun.add(flash); flash.position.copy(MUZZLE);
  const light = new THREE.PointLight(0xffb060, 0, 0.9, 2); scene.add(light);
  const dotTex = radial([[0, "rgba(255,40,40,1)"], [0.35, "rgba(255,30,30,0.95)"], [0.6, "rgba(255,0,0,0.35)"], [1, "rgba(255,0,0,0)"]], 64);
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true })); dot.scale.setScalar(0.006); dot.renderOrder = 20; dot.visible = false; scene.add(dot);
  const aim = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 })); aim.renderOrder = 21; aim.visible = false; scene.add(aim);
  const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 })); tracer.visible = false; scene.add(tracer);
  const markGeo = new THREE.CircleGeometry(0.012, 12), markMat = new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });

  // --- sound: a synthesized bang (WebAudio needs a user tap first; silent until then) --------------------------
  let actx = null;
  const unlock = () => { try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) { actx = null; } };
  addEventListener("pointerdown", unlock, { passive: true });
  function bang() {
    if (!actx || actx.state !== "running") return;
    const t = actx.currentTime, out = actx.destination;
    const n = actx.sampleRate * 0.25, buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (actx.sampleRate * 0.045));
    const src = actx.createBufferSource(); src.buffer = buf;
    const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    const gn = actx.createGain(); gn.gain.setValueAtTime(0.7, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(lp).connect(gn).connect(out); src.start(t); src.stop(t + 0.3);
    const osc = actx.createOscillator(), og = actx.createGain(); osc.type = "sine"; osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);
    og.gain.setValueAtTime(0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15); osc.connect(og).connect(out); osc.start(t); osc.stop(t + 0.16);
  }
  function clink() {   // a can hit
    if (!actx || actx.state !== "running") return;
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.08);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.2);
  }

  // --- state ---------------------------------------------------------------------------------------------------
  const st = { mode: "rest", holder: null, armed: true, shots: 0, hits: 0, kick: 0, slideT: 1, flashT: 0, lastSeen: 0, cool: 0, vel: V(), forced: false, dotOn: false, fireT: 0, pull: 0 };
  const ray = new THREE.Raycaster(); ray.far = 60;
  const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _q = new THREE.Quaternion(), _kq = new THREE.Quaternion(), _c = V(), _R = V(), _g = V(), _w = V(), _dir = V(), _a = V(), _b = V(), _e = V(), _ax = V(), _one = new THREE.Vector3(1, 1, 1), _qi = new THREE.Quaternion();
  const _tb = [V(), V(), V()], _mc = new THREE.Matrix4(), _mt = new THREE.Matrix4(), _hp = Array.from({ length: 21 }, V);
  const palmCentre = pts => { _c.set(0, 0, 0); for (const i of PALM_I) _c.add(pts[i]); return _c.multiplyScalar(0.2); };
  const bendDeg = (a, b, c) => { _a.subVectors(b, a).normalize(); _b.subVectors(c, b).normalize(); return Math.acos(Math.max(-1, Math.min(1, _a.dot(_b)))) * 180 / Math.PI; };
  const closed = h => !h.ext[1] && !h.ext[2] && !h.ext[3], open = h => h.ext[1] && h.ext[2] && h.ext[3];
  const setWorld = (obj, P, Q) => {   // world position + rotation -> the object's local transform under its current parent
    obj.parent.updateMatrixWorld(true); _m.compose(P, Q, _one); _mi.copy(obj.parent.matrixWorld).invert(); _m.premultiply(_mi); _m.decompose(obj.position, obj.quaternion, obj.scale);
  };
  function gripFrame(h) {   // rotation (gun space -> world) and the tracked palm centre: the canonical hand's palm basis turned onto the tracked palm's basis
    const cb = h.right ? CB_R : CB_L; palmBasis(h.pts, _tb);
    _mc.makeBasis(cb[0], cb[1], cb[2]); _mt.makeBasis(_tb[0], _tb[1], _tb[2]);
    _m.copy(_mt).multiply(_mc.clone().transpose()); _q.setFromRotationMatrix(_m);              // world = T * C^-1 (C orthonormal)
    _c.copy(palmCentre(h.pts)); _R.set(1, 0, 0).applyQuaternion(_q);                          // side axis of the gun in the world
  }
  function placeInHand(h) {
    gripFrame(h);
    if (st.kick > 1e-4) { _kq.setFromAxisAngle(_R, -st.kick); _q.premultiply(_kq); }         // recoil: muzzle up about the side axis
    _g.copy(h.right ? CC_R : CC_L).applyQuaternion(_q); _e.copy(_c).sub(_g);                  // the canonical palm centre lands on the tracked palm centre
    setWorld(gun, _e, _q);
  }
  const pullT = h => Math.min(1, Math.max(0, (bendDeg(h.pts[5], h.pts[6], h.pts[7]) - PULL_FROM) / (PULL_TO - PULL_FROM)));   // 0 = index resting on the frame, 1 = on the trigger
  function handPose(h, frameInv) {   // the 21 points the hand is drawn from while holding (world, or in the frame frameInv maps into): the canonical grip; the index slides onto the trigger with the tracked bend
    gripFrame(h); const canon = h.right ? CANON_R : CANON_L, pull = h.right ? PULL_R : PULL_L, cc = h.right ? CC_R : CC_L, t = pullT(h);
    for (let i = 0; i < 21; i++) _hp[i].copy(canon[i]).sub(cc).applyQuaternion(_q).add(_c);
    for (let k = 0; k < 3; k++) _hp[6 + k].copy(canon[6 + k]).lerp(pull[k], t).sub(cc).applyQuaternion(_q).add(_c);
    if (frameInv) for (const p of _hp) p.applyMatrix4(frameInv);
    return _hp;
  }
  function reparent(obj, parent) {   // keep the world transform
    obj.updateMatrixWorld(true); _m.copy(obj.matrixWorld); parent.updateMatrixWorld(true); obj.removeFromParent(); parent.add(obj);
    _mi.copy(parent.matrixWorld).invert(); _m.premultiply(_mi); _m.decompose(obj.position, obj.quaternion, obj.scale);
  }
  function aimDot() {   // the impact point of the barrel ray, drawn as a dot that grows with distance so it stays visible
    gun.updateMatrixWorld(true); _w.copy(MUZZLE).applyMatrix4(gun.matrixWorld); _dir.copy(BARREL).transformDirection(gun.matrixWorld);
    ray.set(_w, _dir); const hit = ray.intersectObjects(targets, true)[0];
    if (hit) { aim.position.copy(hit.point).addScaledVector(_dir, -0.004); aim.scale.setScalar(0.008 + 0.012 * hit.distance); aim.visible = true; }
    else { aim.position.copy(_w).addScaledVector(_dir, 4); aim.scale.setScalar(0.06); aim.visible = true; }
  }
  function redDot(camera) {   // collimated sight: the dot sits where the ray from the eye parallel to the barrel crosses the sight glass
    gun.updateMatrixWorld(true); _g.copy(SIGHT).applyMatrix4(gun.matrixWorld); _dir.copy(BARREL).transformDirection(gun.matrixWorld);
    _e.setFromMatrixPosition(camera.matrixWorld); const t = _a.subVectors(_g, _e).dot(_dir);
    if (t <= 0.02) { st.dotOn = false; dot.visible = false; return; }                          // the window must be in front of the eye
    _w.copy(_e).addScaledVector(_dir, t);                                                      // on the glass plane, along the barrel from the eye
    const off = _w.distanceTo(_g), k = 1 - off / SIGHT_R;
    st.dotOn = off < SIGHT_R; dot.visible = st.dotOn; if (st.dotOn) { dot.position.copy(_w); dot.material.opacity = 0.5 + 0.5 * Math.min(1, k * 3); }
  }
  function fire(externalRay) {
    st.shots++; st.kick = 0.16; st.slideT = 0; st.flashT = 0.06; bang();
    gun.updateMatrixWorld(true); _w.copy(MUZZLE).applyMatrix4(gun.matrixWorld); _dir.copy(BARREL).transformDirection(gun.matrixWorld);
    if(externalRay){_w.copy(externalRay.from);_dir.copy(externalRay.direction).normalize();}
    light.position.copy(_w); light.intensity = 6; flash.material.rotation = Math.random() * Math.PI * 2; flash.visible = true;
    ray.set(_w, _dir); const hit = ray.intersectObjects(targets, true)[0]; st.lastRay = { from: _w.toArray().map(x => +x.toFixed(3)), dir: _dir.toArray().map(x => +x.toFixed(3)), at: hit ? hit.point.toArray().map(x => +x.toFixed(3)) : null, dist: hit ? +hit.distance.toFixed(3) : null };
    const pts = tracer.geometry.attributes.position; pts.setXYZ(0, _w.x, _w.y, _w.z);
    if (hit) {
      pts.setXYZ(1, hit.point.x, hit.point.y, hit.point.z);
      let o = hit.object; while (o && o.name !== "can" && o.name !== "board") o = o.parent; st.lastHit = o ? o.name : hit.object.name || hit.object.type;
      const can = o && o.name === "can" ? cans.find(c => c.m === o) : null;
      if (can && can.state === "up") {   // knock it over (velocities in the range group's frame)
        range.getWorldQuaternion(_qi).invert();
        can.state = "flying"; can.vel.copy(_dir).applyQuaternion(_qi).multiplyScalar(2.2); can.vel.y += 1.4; can.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(9); st.hits++; clink();
      } else if (o && o.name === "board") st.hits++;
      if (!can) {   // a bullet mark on what was hit
        const m = new THREE.Mesh(markGeo, markMat); const nrm = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : _dir.clone().negate();
        m.position.copy(hit.point).addScaledVector(nrm, 0.0015); m.lookAt(_a.copy(hit.point).add(nrm)); marks.add(m); if (marks.children.length > 40) marks.remove(marks.children[0]);
      }
    } else { _a.copy(_w).addScaledVector(_dir, 6); pts.setXYZ(1, _a.x, _a.y, _a.z); }
    pts.needsUpdate = true; tracer.visible = true; tracer.material.opacity = 0.8;
  }
  function stepCans(dt, now) {   // in the range group's frame (y up)
    for (const c of cans) {
      if (c.state === "flying") {
        c.vel.y -= 9.8 * dt; c.m.position.addScaledVector(c.vel, dt);
        _q.setFromAxisAngle(_ax.copy(c.spin).normalize(), c.spin.length() * dt); c.m.quaternion.premultiply(_q);
        const onTable = Math.abs(c.m.position.x) < 0.45 && Math.abs(c.m.position.z) < 0.3, ground = (onTable ? 0 : floorL) + CAN_R;
        if (c.m.position.y <= ground && c.vel.y < 0) {
          c.m.position.y = ground; c.state = "down"; c.downT = now;
          _a.set(c.vel.x, 0, c.vel.z); if (_a.lengthSq() < 1e-6) _a.set(0, 0, 1); _a.normalize();   // lie down along the direction it flew
          c.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _a);
        }
      } else if (c.state === "down" && now - c.downT > 5000) { c.state = "up"; c.m.position.copy(c.rest); c.m.quaternion.identity(); }   // stands back up
    }
  }
  function testShootAt(p) {   // tests only, gun at rest: point the barrel at a world point and fire (iterated: the muzzle moves with the rotation about the gun origin)
    const P = new THREE.Vector3(...p); gun.updateMatrixWorld(true); _a.setFromMatrixPosition(gun.matrixWorld); _a.y += MUZZLE.y;
    for (let k = 0; k < 25; k++) { _dir.subVectors(P, _a).normalize(); _q.setFromUnitVectors(BARREL, _dir); _e.setFromMatrixPosition(gun.matrixWorld); setWorld(gun, _e, _q); gun.updateMatrixWorld(true); _a.copy(MUZZLE).applyMatrix4(gun.matrixWorld); }
    fire();
  }
  function drop() {
    if (trig) trig.quaternion.copy(trig0);
    reparent(gun, range); st.mode = "falling"; st.holder = null; st.cool = 0.8; st.vel.set(0, 0, 0);
  }

  return {
    obj: gun, range, table: top, get state() { return st; }, fireNow: fire, fireFrom: (from,direction)=>fire({from,direction}), testShootAt, handPose, get marks() { return marks.children.length; }, get cans() { return cans.map(c => c.state); },
    get sight() { gun.updateMatrixWorld(true); const g = SIGHT.clone().applyMatrix4(gun.matrixWorld), d = BARREL.clone().transformDirection(gun.matrixWorld); return { g: g.toArray(), d: d.toArray() }; },
    hud() { const sc = st.shots ? ` · ${st.hits}/${st.shots} hits` : ""; return st.mode === "held" ? `gun held${st.dotOn ? " · ON TARGET" : ""}${sc}` : `gun on the table${sc}`; },
    update(dt, hands, now, camera) {   // hands: [{ key, group, pts (WORLD Vector3[21]), right, ext: [index, middle, ring, pinky extended] }]
      // effects
      if (st.kick > 0) st.kick = Math.max(0, st.kick - st.kick * Math.min(1, dt * 16) - dt * 0.2);
      if (slide) { st.slideT = Math.min(1, st.slideT + dt / 0.09); const back = st.slideT < 0.4 ? st.slideT / 0.4 : 1 - (st.slideT - 0.4) / 0.6; slide.position.copy(slide0).z += 0.014 * Math.max(0, back); }
      if (st.flashT > 0) { st.flashT -= dt; if (st.flashT <= 0) { flash.visible = false; light.intensity = 0; } else light.intensity *= 0.8; }
      if (tracer.visible) { tracer.material.opacity -= dt * 12; if (tracer.material.opacity <= 0) tracer.visible = false; }
      st.cool = Math.max(0, st.cool - dt); stepCans(dt, now);
      const holder = st.holder && hands.find(h => h.key === st.holder);
      if (st.mode === "held") {
        if (holder) {
          st.lastSeen = now; placeInHand(holder);
          st.pull = pullT(holder); if (trig) { _tq.setFromAxisAngle(_tx, -0.35 * st.pull); trig.quaternion.copy(trig0).multiply(_tq); }   // the trigger follows the finger
          const bend = bendDeg(holder.pts[5], holder.pts[6], holder.pts[7]);
          if (st.armed && bend > FIRE_ON && now - st.fireT > FIRE_GAP * 1000) { st.armed = false; st.fireT = now; fire(); } else if (!st.armed && bend < FIRE_OFF) st.armed = true;
          if (open(holder)) drop();
        } else if (now - st.lastSeen > 1000) drop();
        if (st.mode === "held") { aimDot(); if (camera) redDot(camera); else { dot.visible = false; st.dotOn = false; } } else { dot.visible = aim.visible = false; st.dotOn = false; }
        return;
      }
      dot.visible = aim.visible = false; st.dotOn = false;
      if (st.mode === "falling") {   // in the range group's frame
        st.vel.y -= 9.8 * dt; gun.position.addScaledVector(st.vel, dt);
        const onTable = Math.abs(gun.position.x) < 0.45 && Math.abs(gun.position.z) < 0.3, ground = (onTable ? 0 : floorL) + 0.016;
        if (gun.position.y <= ground) { gun.position.y = ground; gun.quaternion.copy(REST.quat); st.mode = "rest"; }
        return;
      }
      // rest: a closing hand at the grip picks it up
      if (st.cool > 0) return;
      gun.updateMatrixWorld(true); _g.copy(GRIP).applyMatrix4(gun.matrixWorld);
      for (const h of hands) {
        const near = palmCentre(h.pts).distanceTo(_g) < GRAB_R;
        if ((near && closed(h)) || (hold && !st.forced)) {   // armed at once unless the index is already curled (then it arms when the finger straightens)
          st.forced = true; st.mode = "held"; st.holder = h.key; st.armed = bendDeg(h.pts[5], h.pts[6], h.pts[7]) < FIRE_ON; st.lastSeen = now; reparent(gun, h.group); placeInHand(h); break;
        }
      }
    },
  };
}
