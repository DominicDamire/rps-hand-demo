// Rigged hand for the movement page. Everything up to the wrapper at the end is copied VERBATIM (by
// make_hand_model.py) from ../index.html (each block found by its first line), the main page's skinned-arm driver, so both pages
// show the same hand; change it there and regenerate. Lines: PARENT/PALM, V, palmCentre, THUMB..., meshPts,
// collision (segClosest/solidHand), CHAINS, poseFK, boneFrame, frameDir, palmRefs, cutArm, loadRigSide/loadRig, makeRigSkin.
import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/GLTFLoader.js";
const Q = new URLSearchParams(location.search);
const FINGER_FAT = Q.get("fat") ? +Q.get("fat") : 1.3;   // width scale of the rigged hand (as the main page)
const FIT_EXACT = Q.get("fit") === "exact";
const COLLIDE = Q.get("col") !== "0";
const PALMS_ONLY = Q.get("arms") !== "1";   // default: hand from the wrist only
const STUB = +Q.get("stub") || 0.08;
const F_Q = (Q.get("fist") || "").split(",").map(Number);

const PARENT = {1:0,2:1,3:2,4:3, 5:0,6:5,7:6,8:7, 9:0,10:9,11:10,12:11, 13:0,14:13,15:14,16:15, 17:0,18:17,19:18,20:19};

const PALM = [0, 5, 9, 13, 17];

const V = () => new THREE.Vector3();

const palmCentre = pts => { const c = V(); for (const i of PALM) c.add(pts[i]); return c.multiplyScalar(1 / PALM.length); };

const THUMB = new Set([1, 2, 3, 4]);

const _y = V(), _x = V(), _z = V(), _r = V(), _n = V(), _l = V(), _u = V(), _d = V(), _q = V();

function meshPts(pts) {
  const out = pts.map(p => p.clone());
  _l.subVectors(pts[17], pts[5]).normalize();
  for (const m of [5, 9, 13, 17]) {
    _d.subVectors(pts[m], pts[0]); if (_d.lengthSq() < 1e-8) continue; _d.normalize();                    // metacarpal direction (well defined even when the finger is folded)
    _q.copy(_l).addScaledVector(_d, -_l.dot(_d)); if (_q.lengthSq() < 0.05) continue; _q.normalize();   // sideways axis of this finger
    for (const j of [m + 1, m + 2]) out[j].addScaledVector(_q, -_r.subVectors(out[j], pts[m]).dot(_q));
  }
  return out;
}

const FINGER_RAD = 0.0075;           // finger radius in metres at hand scale 1 (axis-to-axis 15 mm = fingers touching)

const PALM_HALF = 0.011;             // half thickness of the palm slab, metres at scale 1

const _pa = V(), _pb = V(), _sd = V(), _r1 = V(), _r2 = V(), _pu = V(), _pv = V(), _ray = V();

function segClosest(a1, a2, b1, b2) {   // closest points between segments a1a2 and b1b2 -> [ta, tb] (Ericson, Real-Time Collision Detection 5.1.9)
  _r1.subVectors(a2, a1); _r2.subVectors(b2, b1); _sd.subVectors(a1, b1);
  const A = _r1.dot(_r1), E = _r2.dot(_r2), F = _r2.dot(_sd); let t1 = 0, t2 = 0;
  if (A <= 1e-12 && E <= 1e-12) return [0, 0];
  if (A <= 1e-12) t2 = Math.min(1, Math.max(0, F / E));
  else { const C = _r1.dot(_sd); if (E <= 1e-12) t1 = Math.min(1, Math.max(0, -C / A)); else { const B = _r1.dot(_r2), den = A * E - B * B; t1 = den !== 0 ? Math.min(1, Math.max(0, (B * F - C * E) / den)) : 0; t2 = (B * t1 + F) / E; if (t2 < 0) { t2 = 0; t1 = Math.min(1, Math.max(0, -C / A)); } else if (t2 > 1) { t2 = 1; t1 = Math.min(1, Math.max(0, (B - C) / A)); } } }
  return [t1, t2];
}

function solidHand(out, s, nOut, st) {   // out: 21 joints after FK (metres); s: hand scale; nOut: unit palm normal pointing to the palm side; st: per-hand memory
  const R = FINGER_RAD * s, chains = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20], [1, 2, 3, 4]];
  const fixed = new Set([0, 1, 5, 9, 13, 17]), len = {};
  for (const ch of chains) for (let k = 1; k < 4; k++) len[ch[k]] = out[ch[k]].distanceTo(out[ch[k - 1]]);
  const segs = []; for (const ch of chains) for (let k = 1; k < 4; k++) segs.push([ch[k - 1], ch[k], ch]);
  _pu.subVectors(out[9], out[0]); const Lp = _pu.length(); _pu.normalize();                 // along the palm, wrist -> middle knuckle
  _pv.subVectors(out[17], out[5]).normalize();                                              // across the palm, index -> pinky knuckle
  const v5 = _sd.subVectors(out[5], out[0]).dot(_pv) - R, v17 = _sd.subVectors(out[17], out[0]).dot(_pv) + R;   // the slab spans the knuckles (an abducted thumb beside the palm is not lifted)
  const minD = PALM_HALF * s + R;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < segs.length; i++) for (let k = i + 1; k < segs.length; k++) {         // capsule vs capsule, different fingers only
      const [a1, a2, ca] = segs[i], [b1, b2, cb] = segs[k]; if (ca === cb) continue;
      const [ta, tb] = segClosest(out[a1], out[a2], out[b1], out[b2]);
      _pa.copy(out[a1]).lerp(out[a2], ta); _pb.copy(out[b1]).lerp(out[b2], tb); _sd.subVectors(_pa, _pb); const d = _sd.length();
      if (d >= 2 * R || d < 1e-6) continue;
      // Crossed or side by side? Fingers keep their knuckle order across the palm unless they cross. A pair whose order at
      // the contact is swapped (index found on the pinky side of the middle, the thumb found over the fingers) IS
      // crossing: the picture fixes where each finger is and the tracker's depth is the uncertain part, so the pair moves
      // apart along the ray from the phone, one finger in front of the other. In front: the tracked depth order when it
      // is clear (3 mm), else the order remembered for this pair, else the later chain (middle over index, thumb over the
      // fingers). Side by side (order kept): the plain push apart, as fingers pressed together.
      const crossed = (_pb.dot(_pv) - _pa.dot(_pv)) * (out[cb[0]].dot(_pv) - out[ca[0]].dot(_pv)) < 0;
      if (crossed) {
        _ray.copy(_pa).add(_pb).normalize(); const sz = _sd.dot(_ray), lat2 = _sd.lengthSq() - sz * sz, key = "o" + i + "_" + k;
        let sign = Math.abs(sz) >= 0.003 ? Math.sign(sz) : st && st[key] || 1; if (st) st[key] = sign;
        const zt = sign * Math.sqrt(Math.max(0, 4 * R * R - lat2));                          // depth gap that makes the pair just touch
        _sd.copy(_ray).multiplyScalar((zt - sz) * 0.5);                                      // half the depth move each way
      } else _sd.multiplyScalar((2 * R - d) / d * 0.5);                                      // half the overlap each way
      if (!fixed.has(a1)) out[a1].addScaledVector(_sd, 1 - ta); if (!fixed.has(a2)) out[a2].addScaledVector(_sd, ta);
      if (!fixed.has(b1)) out[b1].addScaledVector(_sd, -(1 - tb)); if (!fixed.has(b2)) out[b2].addScaledVector(_sd, -tb);
    }
    for (const ch of chains) for (let k = 1; k < 4; k++) {                                     // palm slab: joints over the palm stay outside it
      const j = ch[k]; _sd.subVectors(out[j], out[0]); const u = _sd.dot(_pu), v = _sd.dot(_pv), h = _sd.dot(nOut);
      if (u > -0.2 * Lp && u < 0.9 * Lp && v > v5 && v < v17 && h < minD) out[j].addScaledVector(nOut, minD - h);
    }
    for (const ch of chains) for (let k = 1; k < 4; k++) {                                     // bones keep their length
      const j = ch[k], p = ch[k - 1]; _sd.subVectors(out[j], out[p]); const d = _sd.length(); if (d < 1e-9) continue;
      const c = (d - len[j]) / d; if (fixed.has(p)) out[j].addScaledVector(_sd, -c); else { out[j].addScaledVector(_sd, -0.5 * c); out[p].addScaledVector(_sd, 0.5 * c); }
    }
  }
}   // default: rigged drive (fixed hand volume, only the joints bend); ?fit=exact stretches to the tracked lengths

const CHAINS = { palm: [1, 5, 9, 13, 17], thumb: [2, 3, 4], index: [6, 7, 8], middle: [10, 11, 12], ring: [14, 15, 16], pinky: [18, 19, 20] };

const CHAIN_OF = {}; for (const [k, js] of Object.entries(CHAINS)) for (const j of js) CHAIN_OF[j] = k;

const THUMB_Z = Q.get("tz") !== "0";        // thumb bones take their depth from their length (see poseFK)

const HYPER = { mcp: 25, pip: 8, dip: 8 };   // degrees of backward bend allowed at each finger joint

const FIST = F_Q.length === 3 ? { mcp: F_Q[0], pip: F_Q[1], dip: F_Q[2] } : { mcp: 85, pip: 100, dip: 60 };

const _b = V(), _c = V(), _e = V(), _pw = V();

function poseFK(pts, bind, chirRight, scale, st, grip) {   // st: per-hand smoothing state for the joint angles; grip: hand locked on the gun
  const s = scale ?? pts[0].distanceTo(pts[9]) / bind[0].distanceTo(bind[9]), out = pts.map(p => p.clone());
  _l.subVectors(pts[17], pts[5]).normalize();
  const Lp = _pw.subVectors(pts[9], pts[0]).length(); _pw.normalize();                                     // along the palm
  const vLo = _d.subVectors(pts[5], pts[0]).dot(_l) - 0.1 * Lp, vHi = _d.subVectors(pts[17], pts[0]).dot(_l) + 0.1 * Lp;   // across-palm extent of the palm
  _u.subVectors(pts[5], pts[0]); _n.subVectors(pts[17], pts[0]); _n.crossVectors(_u, _n).normalize(); if (!chirRight) _n.negate();   // now points OUT of the palm
  const seg = (j, dir) => out[j].copy(out[PARENT[j]]).addScaledVector(dir, s * bind[j].distanceTo(bind[PARENT[j]]));
  for (const j of [1, 5, 9, 13, 17]) seg(j, _d.subVectors(pts[j], pts[0]).normalize());   // palm: tracked directions, scan lengths
  // Thumb: the picture fixes where each joint is, but the tracker under-reads the thumb's tilt toward or away from the
  // phone (a thumbs-up leaning forward barely moved). So each thumb bone keeps its picture direction and takes its depth
  // from its known length: |depth| = sqrt(L^2 - picture^2); the sign from the tracker when it is clear (over 25 % of the
  // bone), else the sign remembered for that bone. A picture longer than the bone is left as tracked. ?tz=0 disables.
  for (const j of [2, 3, 4]) {
    _d.subVectors(pts[j], pts[PARENT[j]]);
    if (THUMB_Z && !grip) {   // (the gripping hand's points are exact, no depth guess)
      _r.copy(pts[PARENT[j]]).normalize(); const L = s * bind[j].distanceTo(bind[PARENT[j]]), dz = _d.dot(_r);   // ray from the phone (origin) through the joint
      _b.copy(_d).addScaledVector(_r, -dz); const lp = _b.length();                                                     // the picture part
      if (lp > 1e-6 && lp < 0.98 * L) {
        const key = "tz" + j; let sign = Math.abs(dz) > 0.25 * L ? Math.sign(dz) : (st && st[key]) || Math.sign(dz) || 1; if (st) st[key] = sign;
        _d.copy(_b).addScaledVector(_r, sign * Math.sqrt(L * L - lp * lp));
      }
    }
    seg(j, _d.normalize());
  }
  for (const m of [5, 9, 13, 17]) {
    // bending plane of this finger: contains the metacarpal direction, perpendicular to the across-palm axis. The sideways
    // axis comes from the metacarpal (always well defined), NOT from knuckle->tip, which is ~zero for a folded finger and
    // made the "remove sideways bend" step erase the bend itself (folded fingers came out straight).
    let prev = _c.subVectors(pts[m], pts[0]).normalize();                                                    // metacarpal direction
    // Flexion axis of this finger, fixed ONCE at the knuckle: curl = rotation of the segment about this axis toward the
    // palm. Using it for PIP and DIP too keeps the sense consistent after the knuckle has bent 90 deg (deciding "backward"
    // per joint from the palm normal became ambiguous there and clamped real curls, so fists had straight phalanges).
    _b.copy(_n).addScaledVector(prev, -_n.dot(prev)).normalize();                                             // toward the palm, perpendicular to the metacarpal
    _q.crossVectors(prev, _b).normalize();                                                                    // signed flexion axis (also the sideways axis)
    // curl index: tip close to the knuckle (relative to the finger's tracked length) = a closing fist; the tracker cannot see
    // the middle and end joints then and under-reads their bend, so the fist angles take over as the tip approaches
    const fLen = pts[m].distanceTo(pts[m + 1]) + pts[m + 1].distanceTo(pts[m + 2]) + pts[m + 2].distanceTo(pts[m + 3]);
    let closeness = Math.min(1, Math.max(0, (0.75 - pts[m + 3].distanceTo(pts[m]) / Math.max(1e-6, fLen)) / 0.4));   // 0 at tip 75 % out, 1 at 35 %
    // A fingertip OVER the palm (in the picture, and not far in front of it) is a folded finger. The tracker cannot see how
    // deep a hidden finger sits and reads a closed fist as a loose hook 4-5 cm off the palm (measured on the victory and
    // peace stills); a hovering hook over the palm is rare, a fist is not, so the fist angles take over there.
    _d.subVectors(pts[m + 3], pts[0]); const uT = _d.dot(_pw), vT = _d.dot(_l), hT = Math.abs(_d.dot(_n));
    const c01 = x => Math.min(1, Math.max(0, x));
    const fold = c01((0.95 * Lp - uT) / (0.15 * Lp)) * c01((uT - 0.05 * Lp) / (0.1 * Lp)) * c01((0.6 * Lp - hT) / (0.15 * Lp)) * (vT > vLo && vT < vHi ? 1 : 0);
    closeness = grip ? 0 : Math.max(closeness, fold);   // the gripping hand's points are exact: no fist prior
    const lock = false, FA = FIST;
    for (const [j, lim, fist] of [[m + 1, HYPER.mcp, FA.mcp], [m + 2, HYPER.pip, FA.pip], [m + 3, HYPER.dip, FA.dip]]) {
      _d.subVectors(pts[j], pts[j - 1]).normalize();
      // the knuckle is a two-axis joint: it bends AND spreads (that is how fingers cross); the middle and end joints are hinges
      let side = j === m + 1 && !lock ? Math.max(-0.64, Math.min(0.64, _d.dot(_q))) : 0;   // sideways component at the knuckle, within +-40 degrees
      if (st && side) { const k = "s" + j, prevS = st[k]; if (prevS != null) { const a = Math.min(1, Math.max(0.12, Math.abs(side - prevS) / 0.2)); side = prevS + a * (side - prevS); } st[k] = side; }
      _d.addScaledVector(_q, -_d.dot(_q)); if (_d.lengthSq() < 1e-10) _d.copy(prev); _d.normalize();   // the bend part, in the finger's plane
      _b.crossVectors(_q, prev).normalize();                                          // curl direction at this joint (rotating prev about the flexion axis)
      let flex = Math.atan2(_d.dot(_b), _d.dot(prev)) * 180 / Math.PI;             // > 0 = curl toward the palm, < 0 = hyperextension
      flex = lock ? fist : Math.max(flex, closeness * fist);                          // never less curled than the fist prior says for this closeness; locked on the grip
      if (flex < -lim) flex = -lim;
      if (st) { const k = "f" + j, prevF = st[k]; if (prevF != null) { const a = Math.min(1, Math.max(0.12, Math.abs(flex - prevF) / 12)); flex = prevF + a * (flex - prevF); } st[k] = flex; }   // hold still on a held pose (12 deg per frame = full speed)
      const a = flex * Math.PI / 180; _d.copy(prev).multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a));
      if (side) _d.multiplyScalar(Math.sqrt(1 - side * side)).addScaledVector(_q, side);   // put the knuckle's spread back
      seg(j, _d); prev = _e.copy(_d);
    }
  }
  if (COLLIDE) solidHand(out, s, _n, st);
  // anchor: tracked palm centre
  const c0 = palmCentre(pts), c1 = palmCentre(out); _r.subVectors(c0, c1); for (const p of out) p.add(_r);
  if (window.dbg) { window.dbg.fk = out; window.dbg.fkIn = pts; window.dbg.bind = bind; }   // tests: the tracked points and what the skin gets
  return out;
}

function boneFrame(pts, j, s, out) {
  const a = pts[PARENT[j]], b = pts[j];
  _y.subVectors(b, a); const L = Math.max(_y.length(), 1e-6); _y.multiplyScalar(1 / L);
  _l.subVectors(pts[17], pts[5]).normalize();                                                          // across the palm, index -> pinky
  _u.subVectors(pts[5], pts[0]); _n.subVectors(pts[17], pts[0]); _n.crossVectors(_u, _n).normalize();   // palm normal
  // twist reference: fingers bend about the across-palm axis, the thumb about the palm normal; blend to the other one as a bone
  // approaches its reference (continuous, so a pose never makes the skin snap)
  const p = THUMB.has(j) ? _n : _l, q = THUMB.has(j) ? _l : _n, k = Math.min(1, Math.max(0, (Math.abs(p.dot(_y)) - 0.7) / 0.25));
  _r.copy(p).multiplyScalar(1 - k).addScaledVector(q, k);
  _x.copy(_r).addScaledVector(_y, -_r.dot(_y)).normalize(); _z.crossVectors(_x, _y);
  out.makeBasis(_x.multiplyScalar(s), _y.multiplyScalar(L), _z.multiplyScalar(s)); out.setPosition(a);
  return out;
}

const _fa = V(), _fy = V();

function frameDir(a, dir, L, s, refPrimary, refSecondary, out) {   // origin a, unit direction dir, length L, width scale s
  _y.copy(dir); const k = Math.min(1, Math.max(0, (Math.abs(refPrimary.dot(_y)) - 0.7) / 0.25));
  _r.copy(refPrimary).multiplyScalar(1 - k).addScaledVector(refSecondary, k);
  _x.copy(_r).addScaledVector(_y, -_r.dot(_y)).normalize(); _z.crossVectors(_x, _y);
  out.makeBasis(_x.multiplyScalar(s), _y.multiplyScalar(L), _z.multiplyScalar(s)); out.setPosition(a); return out;
}

function palmRefs(pts) { _l.subVectors(pts[17], pts[5]).normalize(); _u.subVectors(pts[5], pts[0]); _n.subVectors(pts[17], pts[0]); _n.crossVectors(_u, _n).normalize(); }

function cutArm(geo, wrist, elbow, handBone) {
  const pos = geo.attributes.position, n = pos.count, e = elbow.clone().sub(wrist).normalize(), far = new Uint8Array(n), _v = V();
  for (let v = 0; v < n; v++) far[v] = _v.set(pos.getX(v), pos.getY(v), pos.getZ(v)).sub(wrist).dot(e) > STUB ? 1 : 0;
  const idx = geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i), keep = [];
  for (let t = 0; t < idx.length; t += 3) if (!(far[idx[t]] && far[idx[t + 1]] && far[idx[t + 2]])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  // boundary edges of what is kept (used by one triangle only), matched by position so UV seams do not split the loop
  const key = v => `${Math.round(pos.getX(v) * 1e4)},${Math.round(pos.getY(v) * 1e4)},${Math.round(pos.getZ(v) * 1e4)}`;
  const edges = new Map();
  for (let t = 0; t < keep.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = keep[t + k], b = keep[t + (k + 1) % 3], ka = key(a), kb = key(b), e = ka < kb ? ka + "|" + kb : kb + "|" + ka;
    const r = edges.get(e); if (r) r.n++; else edges.set(e, { a, b, n: 1 });
  }
  const loops = [...edges.values()].filter(r => r.n === 1); if (!loops.length) { geo.setIndex(keep); return; }
  // group boundary edges into loops (connected by position), cap each loop with a fan from its centroid
  const adj = new Map(); for (const r of loops) for (const [u, w] of [[key(r.a), r], [key(r.b), r]]) { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(w); }
  const seen = new Set(), caps = [];
  for (const r0 of loops) {
    if (seen.has(r0)) continue; const group = [], stack = [r0]; seen.add(r0);
    while (stack.length) { const r = stack.pop(); group.push(r); for (const u of [key(r.a), key(r.b)]) for (const w of adj.get(u)) if (!seen.has(w)) { seen.add(w); stack.push(w); } }
    if (group.length >= 3) caps.push(group);
  }
  const attrs = Object.entries(geo.attributes), add = caps.length, out = {};
  for (const [name, at] of attrs) { const arr = new at.array.constructor(at.array.length + add * at.itemSize); arr.set(at.array); out[name] = new THREE.BufferAttribute(arr, at.itemSize, at.normalized); }
  caps.forEach((group, c) => {
    const v = n + c, cx = V(), vs = new Set(); for (const r of group) { vs.add(r.a); vs.add(r.b); }
    for (const u of vs) cx.add(new THREE.Vector3(pos.getX(u), pos.getY(u), pos.getZ(u))); cx.multiplyScalar(1 / vs.size);
    const first = group[0].a;   // the new vertex copies the first loop vertex's attributes (uv, weights), then gets the centroid position
    for (const [name, at] of attrs) for (let k = 0; k < at.itemSize; k++) out[name].setComponent(v, k, at.getComponent(first, k));
    out.position.setXYZ(v, cx.x, cx.y, cx.z);
    if (out.skinIndex) { out.skinIndex.setXYZW(v, handBone, 0, 0, 0); out.skinWeight.setXYZW(v, 1, 0, 0, 0); }
    for (const r of group) keep.push(r.b, r.a, v);   // opposite winding to the kept triangle across the edge: the cap faces outward
  });
  for (const [name, at] of Object.entries(out)) geo.setAttribute(name, at);
  geo.setIndex(keep);
  if (out.normal) { const nm = geo.attributes.normal; for (let c = 0; c < add; c++) { let sx = 0, sy = 0, sz = 0; for (const r of caps[c]) { sx += nm.getX(r.a); sy += nm.getY(r.a); sz += nm.getZ(r.a); } const L = Math.hypot(sx, sy, sz) || 1; nm.setXYZ(n + c, sx / L, sy / L, sz / L); } }
}

async function loadRigSide(base, side) {
  const [gltf, meta] = await Promise.all([new GLTFLoader().loadAsync(`${base}_${side}.glb`), fetch(`${base}_${side}.json`).then(r => r.json())]);
  let src; gltf.scene.traverse(o => { if (o.isSkinnedMesh) src = o; });
  gltf.scene.updateMatrixWorld(true);
  const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);   // into the glTF scene space, where the JSON joints live
  const norm = n => String(n).replace(/[.\s]/g, "");   // exporters drop dots from bone names (Pointy.001 -> Pointy001)
  const names = src.skeleton.bones.map(b => b.name), byName = {}; names.forEach((n, i) => byName[norm(n)] = i);
  const restHeads = src.skeleton.bones.map(b => b.getWorldPosition(new THREE.Vector3()));   // where each bone really starts in the rest pose
  const bind = meta.joints.map(q => new THREE.Vector3(...q));
  const edges = []; for (const [k, name] of Object.entries(meta.bones)) { const m = k.match(/^(\d+)-(\d+)$/); if (m && name && byName[norm(name)] != null) edges.push({ j: +m[2], i: byName[norm(name)] }); }
  const extra = {}; for (const key of ["hand", "forearm", "arm"]) { const nm = meta.bones[key], e = meta.extra?.[nm] || meta.extra?.[key]; if (nm && byName[norm(nm)] != null && e) extra[key] = { i: byName[norm(nm)], head: new THREE.Vector3(...e.head), tail: new THREE.Vector3(...e.tail) }; }
  if (PALMS_ONLY && extra.forearm && extra.hand) cutArm(geo, extra.hand.head, extra.forearm.head, extra.hand.i);
  let material = null;
  if (Q.get("mat") === "plain") material = new THREE.MeshStandardMaterial({ color: 0xbfb8b0, roughness: 0.8, metalness: 0 });   // neutral clay: judge geometry without the texture
  else if (src.material?.isMeshStandardMaterial) {   // skin look: physical material, AO from the packed texture, slight sheen, no metalness glint
    const m = src.material, pm = new THREE.MeshStandardMaterial({ map: m.map, normalMap: m.normalMap, normalScale: m.normalScale?.clone() ?? new THREE.Vector2(1, 1), roughnessMap: m.roughnessMap, metalness: 0, roughness: m.roughness ?? 1, color: m.color });   // standard, not physical: half the shader cost on a phone
    if (m.roughnessMap) { pm.aoMap = m.roughnessMap; pm.aoMapIntensity = 0.6; }   // glTF packs AO in R of the same image
    pm.envMapIntensity = 0.45; material = pm;
  }
  return { rig: true, geo, names, material, bind, edges, extra, restHeads, hand: meta.hand };
}

async function loadRig(base) {
  const [L, R] = await Promise.all([loadRigSide(base, "L"), loadRigSide(base, "R")]);
  return { rig: true, order: [], material: null, L, R, mirroredIsLeft: true };   // right tracked hand -> R variant, left -> L
}

const CHIR_RIGHT = 1;    // sign of (thumb tip - wrist) . ((5-0) x (17-0)) for a right hand: the thumb sits on the palm side, and for a right hand that cross product points out of the palm

function makeRigSkin(variant, color) {
  const bones = variant.names.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; return b; });
  const inv = variant.names.map(() => new THREE.Matrix4());   // identity for undriven bones (they keep their rest place)
  const bind = variant.bind; palmRefs(bind);
  const bindL = new THREE.Vector3().copy(_l), bindN = new THREE.Vector3().copy(_n);
  const dir0 = bind[9].clone().sub(bind[0]).normalize();
  const handRest0 = frameDir(bind[0], dir0, bind[0].distanceTo(bind[9]), 1, bindL, bindN, new THREE.Matrix4()), handRestInv = handRest0.clone().invert();
  const dirB = V();
  for (const e of variant.edges) {
    const head = variant.restHeads[e.i], p = PARENT[e.j];
    e.off = head.distanceTo(bind[p]) > 0.01 ? head.clone().applyMatrix4(handRestInv) : null;   // bone head away from the joint: remember it in the palm's frame
    const a = e.off ? head : bind[p]; dirB.subVectors(bind[e.j], a); const L = dirB.length(); dirB.normalize();
    inv[e.i].copy(frameDir(a, dirB, L, 1, THUMB.has(e.j) ? bindN : bindL, THUMB.has(e.j) ? bindL : bindN, new THREE.Matrix4())).invert();
  }
  const rest = {};   // hand / forearm / arm rest frames: origin at the rest head, direction head->tail
  for (const [key, ex] of Object.entries(variant.extra)) {
    const d = ex.tail.clone().sub(ex.head), L = d.length(); d.normalize(); rest[key] = { i: ex.i, L };
    inv[ex.i].copy(frameDir(ex.head, d, L, 1, key === "hand" ? bindL : bindN, key === "hand" ? bindN : bindL, new THREE.Matrix4())).invert();
  }
  // bones the tracker does not drive (root, helpers, upper arm when absent) ride rigidly with the palm: same rest frame as the hand bone
  const driven = new Set([...variant.edges.map(e => e.i), ...Object.values(rest).map(r => r.i)]);
  const handRest = rest.hand ? inv[rest.hand.i] : frameDir(bind[0], dir0, bind[0].distanceTo(bind[9]), 1, bindL, bindN, new THREE.Matrix4()).invert();
  const riders = []; variant.names.forEach((n, i) => { if (!driven.has(i)) { inv[i].copy(handRest); riders.push(i); } });
  const mesh = new THREE.SkinnedMesh(variant.geo, variant.material ? variant.material.clone() : new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  mesh.add(...bones); mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
  mesh.castShadow = false; mesh.frustumCulled = false; mesh.visible = false;
  const L0 = bind[0].distanceTo(bind[9]); const bindLen = {}; for (const [k, js] of Object.entries(CHAINS)) bindLen[k] = js.reduce((t, j) => t + bind[j].distanceTo(bind[PARENT[j]]), 0);
  const ratio = {}; const M = new THREE.Matrix4(), dirW = V(), o = V();
  const fwd = V(), armDir = V();
  return { mesh, update(tracked, chirRight, elbow, shoulder, grip) {
    // rigged (default): the mesh keeps its own proportions at one size (the hand's palm ratio, settled slowly); only the joints bend
    ratio.n = (ratio.n || 0) + 1; const scNow = tracked[0].distanceTo(tracked[9]) / L0;
    ratio.size = ratio.size == null ? scNow : ratio.size + Math.max(0.01, 1 / ratio.n) * (scNow - ratio.size);
    const pts = FIT_EXACT ? meshPts(tracked) : poseFK(tracked, bind, chirRight, ratio.size, ratio, grip), sc = FIT_EXACT ? scNow : ratio.size;
    for (const [k, js] of Object.entries(CHAINS)) {
      if (!FIT_EXACT) { ratio[k] = sc * FINGER_FAT; continue; }
      const r = js.reduce((t, j) => t + pts[j].distanceTo(pts[PARENT[j]]), 0) / bindLen[k];   // exact: thickness = the chain's PEAK measured length
      ratio[k] = Math.min(1.6 * sc, Math.max(0.6 * sc, ratio[k] == null ? r : Math.max(r, ratio[k] * 0.999)));
    }
    palmRefs(pts); dirW.subVectors(pts[9], pts[0]).normalize();
    const handM = rest.hand ? bones[rest.hand.i].matrix : M;
    frameDir(pts[0], dirW, (rest.hand ? rest.hand.L : L0) * sc, ratio.palm, _l, _n, handM); if (rest.hand) bones[rest.hand.i].matrixWorldNeedsUpdate = true;
    for (const e of variant.edges) {
      if (e.off) {   // this bone starts inside the palm: carry its rest head with the palm, point it at the tracked joint
        o.copy(e.off).applyMatrix4(handM); dirB.subVectors(pts[e.j], o); const L = dirB.length(); dirB.normalize();
        frameDir(o, dirB, L, ratio[CHAIN_OF[e.j]], THUMB.has(e.j) ? _n : _l, THUMB.has(e.j) ? _l : _n, bones[e.i].matrix);
      } else boneFrame(pts, e.j, ratio[CHAIN_OF[e.j]], bones[e.i].matrix);
      bones[e.i].matrixWorldNeedsUpdate = true;
    }
    for (const i of riders) { bones[i].matrix.copy(handM); bones[i].matrixWorldNeedsUpdate = true; }
    if (rest.forearm) {   // forearm: toward the tracked elbow when the pose gives one (wrist bend up to 80 deg), else straight behind the wrist
      fwd.copy(dirW);
      if (elbow) {
        fwd.subVectors(pts[0], elbow).normalize(); const c = fwd.dot(dirW), lim = Math.cos(80 * Math.PI / 180);
        if (c < lim) { const ang = Math.acos(Math.max(-1, Math.min(1, c))) - 80 * Math.PI / 180; _r.crossVectors(fwd, dirW); if (_r.lengthSq() > 1e-6) fwd.applyAxisAngle(_r.normalize(), ang); }   // clamp the wrist bend
      }
      o.copy(pts[0]).addScaledVector(fwd, -rest.forearm.L * sc); frameDir(o, fwd, rest.forearm.L * sc, ratio.palm, _n, _l, bones[rest.forearm.i].matrix); bones[rest.forearm.i].matrixWorldNeedsUpdate = true;
      if (rest.arm) {
        armDir.copy(fwd); if (elbow && shoulder) armDir.subVectors(elbow, shoulder).normalize();
        o.addScaledVector(armDir, -rest.arm.L * sc); frameDir(o, armDir, rest.arm.L * sc, ratio.palm, _n, _l, bones[rest.arm.i].matrix); bones[rest.arm.i].matrixWorldNeedsUpdate = true;
      }
    }
    mesh.visible = true;
  } };
}

// --- first-person wrapper ---------------------------------------------------------------------------
// The joints are kept in the PHONE's frame (origin at the phone, x right, y up, z toward the phone: the main page's
// GL frame, which the driver assumes when it casts rays from the phone through the joints). The hand group IS that
// frame seen from the eye: the eye looks at the phone from `dist` metres away and `height` metres above it, so the
// group sits at (0, -height, -dist) in the eye's frame, turned half a turn about the vertical axis. A proper rotation,
// so the right hand stays a right hand and appears on the right.
// Joint depths come from the world model + one translation (locate, as the main page); the picture fixes x/y exactly.
export const view = { phoneFov: 60, dist: 0.6, height: 0, tilt: 0, smooth: 0.5, eye: null, reach: 1.15, drop: 5, near: 0.28, far: 0.52 };
// near/far: the hand is kept between these distances from the eye. Without a limit, holding the hand right up to the
// phone threw it far away and tiny (the depth is inverted on purpose: toward the phone = away from you), and you
// could not see your own hands. reach 1.35 and drop 5 deg keep them big and in frame while still reaching the table.
// drop: degrees the whole hand is swung DOWN about the eye, so it rests low in the frame the way a shooter's viewmodel
// does instead of sitting in the middle of the screen (reference CS:GO screenshots: that is how much view the hand
// should take). It is an angle, not a distance, so the hand keeps the same place in the frame however far out it is.   // reach: the hand's distance from the eye is multiplied by this (the shape is not stretched, the whole hand moves), so a
// comfortable half-extended arm reaches the table 0.55 m away - without it the hand could never get further from the eye
// than the eye-to-phone distance (0.6 m) and the gun on the table was out of reach   // sliders write here; eye = [x, y up, distance] of the tracked eye behind the phone (phone frame, metres), set by the app when the head is seen
// The eye is FIXED (the slider distance, or the tracked head): a hand brought toward the face comes close to the eye and
// the gun's sight fills the view, as on the main page. (Before, the eye retreated to keep the hand 0.25 m ahead, so a
// hand near the face moved AWAY - aiming works by bringing the gun to the eye.) The hand is only kept from
// passing behind the eye: if any point would be closer than MIN_AHEAD, the whole hand is pushed toward the phone.
const MIN_AHEAD = 0.12;
function locate(world, image, W, H) {
  const k = 2 * Math.tan(view.phoneFov * Math.PI / 360), n = 21;
  const xu = new Float32Array(n), yv = new Float32Array(n);
  let Sx = 0, Sy = 0, Sxx = 0, Sbu = 0, Sbv = 0, Sxb = 0;
  for (let i = 0; i < n; i++) {
    xu[i] = (image[i].x - 0.5) * k; yv[i] = (image[i].y - 0.5) * k * H / W;
    const bu = world[i].x - xu[i] * world[i].z, bv = world[i].y - yv[i] * world[i].z;
    Sx += xu[i]; Sy += yv[i]; Sxx += xu[i] * xu[i] + yv[i] * yv[i]; Sbu += bu; Sbv += bv; Sxb += xu[i] * bu + yv[i] * bv;
  }
  const Tz = (Sxb - (Sx * Sbu + Sy * Sbv) / n) / (Sxx - (Sx * Sx + Sy * Sy) / n);
  return [Tz, xu, yv];
}
let rigPromise = null;   // one download of arm_L/arm_R for every hand on the page (the player's and the other player's)
export function makeHandModel(parent, lights = true) {   // sync: the rig loads in the background, update() shows it once it is there
  const group = new THREE.Group(); group.rotation.y = Math.PI; parent.add(group);   // the phone's frame, seen from the eye (position set per update)
  if (lights) {   // the map is unlit; the skin needs light (once per page: the lights are global); on the eye, not the turned group
    parent.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
    const lamp = new THREE.DirectionalLight(0xffffff, 1.4); lamp.position.set(-0.3, 0.6, 0.2); lamp.target.position.set(0, 0, -1); parent.add(lamp, lamp.target);   // from over the shoulder toward the view (the target rides with the eye; the default target is the world origin, which lit the hand from wherever the player stood)
  }
  let skinR = null, skinL = null, chir = 0;   // both sides, chosen by the thumb's side of the palm as the main page does (the label flickers, the geometry does not)
  rigPromise ??= loadRig("../arm");
  const ready = rigPromise.then(rig => { skinR = makeRigSkin(rig.R, 0xd9a58a); skinL = makeRigSkin(rig.L, 0xd9a58a); group.add(skinR.mesh, skinL.mesh); }).catch(e => console.warn("hand mesh unavailable:", e));
  const pts = Array.from({ length: 21 }, () => new THREE.Vector3()), q = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0), _w = new THREE.Vector3(), _c = new THREE.Vector3();
  const offset = [0, 0.6];   // [height, dist] the group is placed with (sent to the other player so their copy lands in the same place)
  let shown = false;
  function drive() {   // the rig follows pts
    shown = true; if (!skinR) return;
    _u.subVectors(pts[5], pts[0]); _n.subVectors(pts[17], pts[0]); _n.crossVectors(_u, _n).normalize();
    chir += 0.2 * (Math.sign(_r.subVectors(pts[4], pts[0]).dot(_n)) - chir);
    const right = model.right, on = right ? skinR : skinL, off = right ? skinL : skinR;
    const src = model.override ? model.override() : pts;   // shooter.mjs: the gripping pose while the gun is held
    off.mesh.visible = false; on.update(src, right, undefined, undefined, !!model.override);
    // doll-body.mjs draws the hand with the doll's own parts instead; this model stays the source of the 21 points
    // (the gun grip, the punching and the doll's fingers all read them), it simply is not drawn.
    if (model.drawMesh === false) on.mesh.visible = false;
  }
  const model = { group, ready, points: pts, offset, override: null, drawMesh: true, get visible() { return shown; }, get right() { return chir * CHIR_RIGHT >= 0; },
    update(image, world, W, H) {   // from the tracker: picture + world landmarks -> the phone's GL frame
      const [Tz, xu, yv] = locate(world, image, W, H); if (!Number.isFinite(Tz) || Tz <= 0.05) return;
      q.setFromAxisAngle(ax, view.tilt * Math.PI / 180);
      const a = shown ? view.smooth : 1;   // one-pole smoothing; the main page's error-adaptive filter if this jitters
      for (let i = 0; i < 21; i++) {
        const z = Math.max(0.05, world[i].z + Tz);
        _w.set(xu[i] * z, -yv[i] * z, -z).applyQuaternion(q);   // x right, y up, z toward the phone; tilt levelled
        pts[i].lerp(_w, a);
      }
      const ex = view.eye ? view.eye[0] : 0, ey = view.eye ? view.eye[1] : view.height, D = view.eye ? view.eye[2] : view.dist;
      // Where the hand goes, so that it is ALWAYS in the picture (it must stay in view without having
      // to stretch it out in front of the screen to be able to see it).
      // The group is turned 180 degrees about y, so a tracked point (x, y, z) lands at (-x, y, -z) + group.position in
      // the eye's frame. Placing it by its raw offset from the eye failed: that offset collapses to nothing when the
      // hand is held back at about the eye-to-phone distance, which left the direction undefined and threw the hand
      // somewhere out of frame. Instead the palm is put along the direction the PHONE sees it - always defined - at a
      // forward distance taken from the tracked depth and then clamped to [near, far], and the direction itself is held
      // inside a cone a little narrower than the camera's. The hand's own shape is never touched: the group moves.
      _c.set((pts[0].x + pts[5].x + pts[17].x) / 3, (pts[0].y + pts[5].y + pts[17].y) / 3, (pts[0].z + pts[5].z + pts[17].z) / 3);
      const zc = Math.max(0.05, -_c.z);                 // how far the palm is from the phone
      const keep = view.keepIn ?? 0.8, tv = Math.tan((view.camFov ?? 65) * Math.PI / 360) * keep, th = tv * (view.aspect ?? 1.6);
      const tanX = Math.max(-th, Math.min(th, _c.x / zc)), tanY = Math.max(-tv, Math.min(tv, _c.y / zc));
      const ahead = Math.min(view.far ?? 0.6, Math.max(view.near ?? 0.3, (D + _c.z) * (view.reach || 1)));
      let px = -tanX * ahead, py = tanY * ahead - ey, pz = -ahead;
      if (view.drop) { const a = -view.drop * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), y2 = py * c - pz * sn; pz = py * sn + pz * c; py = y2; }
      offset[0] = -py; offset[1] = -pz;
      group.position.set(px + _c.x, py - _c.y, pz + _c.z);   // put the palm exactly at (px, py, pz)
      window.dbg = Object.assign(window.dbg || {}, { model: pts, offset }); drive();
    },
    setPoints(flat, o) {   // from the network: 63 numbers in the other player's phone frame + their [height, dist]
      if (flat?.length !== 63) { model.hide(); return; }
      for (let i = 0; i < 21; i++) pts[i].set(flat[3 * i], flat[3 * i + 1], flat[3 * i + 2]);
      if (o?.length === 2) group.position.set(0, -o[0], -o[1]);
      drive();
    },
    hide() { shown = false; if (skinR) skinR.mesh.visible = skinL.mesh.visible = false; } };
  return model;
}
