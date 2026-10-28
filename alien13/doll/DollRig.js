// The player's body: the user's ball-joint doll, driven from MediaPipe.
//
// tools/doll/build.py exports docs/doll.glb as 95 rigid parts, each already in its rest world position, plus
// docs/doll-report.json holding a 50-joint tree whose every pivot is a ball the doll physically has (the elbow ball,
// the knee ball, the wrist knot, each finger knuckle). This module rebuilds that tree as three.js objects and hangs
// each part off its joint, so posing is pure node rotation: nothing is skinned, nothing can tear, and a frame costs
// only matrix updates.
//
// Frame: metres, Y up, the doll faces -Z, its own right is +X - the same convention the rest of the project uses.
import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/GLTFLoader.js";

export const HEAD_LAYER = 1;   // the head parts live here so a first-person camera can leave them out while a mirror keeps them

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4();
const _lp = new THREE.Vector3(), _lp2 = new THREE.Vector3(), _qy = new THREE.Quaternion(), _eye = new THREE.Vector3();
const _s = new THREE.Vector3(), _elbow = new THREE.Vector3(), _end = new THREE.Vector3(), _rU = new THREE.Vector3(), _rL = new THREE.Vector3(), _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ID = new THREE.Quaternion();

export class DollRig {
  constructor(scene, { url = new URL("../doll.glb", import.meta.url).href, report = null, headLayer = true } = {}) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.joints = {};        // name -> Object3D
    this.rest = {};          // name -> { world: Vector3, localQ: Quaternion }
    this.parts = [];
    this.loaded = false;
    this.headLayer = headLayer;
    const reportUrl = report || url.replace(/\.glb$/, "-report.json");
    this.ready = Promise.all([new GLTFLoader().loadAsync(url), fetch(reportUrl).then(r => r.json())])
      .then(([gltf, rep]) => this._build(gltf, rep));
  }

  _build(gltf, rep) {
    this.report = rep;
    for (const [name, j] of Object.entries(rep.joints)) {
      const o = new THREE.Object3D(); o.name = name; this.joints[name] = o;
      this.rest[name] = { world: new THREE.Vector3().fromArray(j.rest) };
    }
    for (const [name, j] of Object.entries(rep.joints)) {
      const parent = j.parent ? this.joints[j.parent] : this.root;
      parent.add(this.joints[name]);
      this.joints[name].position.copy(this.rest[name].world);
      if (j.parent) this.joints[name].position.sub(this.rest[j.parent].world);
    }
    this.root.updateMatrixWorld(true);

    const meshes = [];
    gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      const bone = m.name.split("__")[0], j = this.joints[bone];
      if (!j) { console.warn("doll: no joint for", m.name); continue; }
      m.frustumCulled = false;
      j.attach(m);                       // keeps the world transform, so the rest pose is untouched
      this.parts.push(m);
      if (this.headLayer && (bone === "Head" || bone === "Neck")) m.layers.set(HEAD_LAYER);
    }
    for (const [name, o] of Object.entries(this.joints)) this.rest[name].localQ = o.quaternion.clone();
    this.eye = new THREE.Vector3().fromArray(rep.eye);
    this.eyeInHead = this.joints.Head.worldToLocal(this.eye.clone());   // so the eyes can be pinned after posing
    this.loaded = true;
    return this;
  }

  // ---- posing helpers ------------------------------------------------------------------------------------------
  /** world-space rotation for a joint, applied on top of its rest pose */
  setWorldQuat(name, q) {
    const o = this.joints[name]; if (!o) return;
    o.parent.getWorldQuaternion(_q2).invert();
    o.quaternion.copy(_q2.multiply(q));
    // Refresh this one node only. updateMatrixWorld(true) walked the whole subtree every time, and with ~25 joints set
    // a frame that was tens of thousands of matrix updates a second on the main thread, which the trackers pay for.
    // Callers that need a child's world position after this use refresh(); the renderer updates the tree once a frame.
    o.updateMatrix(); o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
  }
  /** make one node's matrixWorld current from its (current) parent, without touching anything else */
  refresh(o) { o.updateMatrix(); o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix); return o; }
  reset() {
    for (const [n, o] of Object.entries(this.joints)) o.quaternion.copy(this.rest[n].localQ);
    this.root.updateMatrixWorld(true);
  }
  /** point a joint's rest direction `restDir` (world, at rest) along `dir` */
  aim(name, restDir, dir, roll = null) {
    _a.copy(restDir).normalize(); _b.copy(dir).normalize();
    _q.setFromUnitVectors(_a, _b);
    if (roll) { _q2.setFromAxisAngle(_b, roll); _q.premultiply(_q2); }
    this.setWorldQuat(name, _q);
  }

  /** two-bone IK: rotate `upper` and `lower` so the chain's tip reaches `target`, bending towards `hint` */
  reach(upper, lower, tip, target, hint) {
    const U = this.joints[upper], L = this.joints[lower], T = this.joints[tip];
    if (!U || !L || !T) return;
    this.refresh(U); this.refresh(L); this.refresh(T);   // the chain is current relative to whatever moved above it
    const s = _s.setFromMatrixPosition(U.matrixWorld);
    // Measured live, not from the rest positions in the report: a scale on any of these nodes (the arms carry one, to
    // make up the doll's short reach) changes the real segment lengths, and solving with the unscaled ones made the
    // hand overshoot by up to 4.7 cm, by a different amount at every distance.
    const l1 = _lp.setFromMatrixPosition(L.matrixWorld).distanceTo(s);
    const l2 = _lp2.setFromMatrixPosition(T.matrixWorld).distanceTo(_lp);
    _v.copy(target).sub(s);
    const d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, _v.length()));
    if (d < 1e-5) return;
    _v.normalize();
    // the bend plane: the component of the hint across the chain
    _n.copy(hint).sub(s); _n.addScaledVector(_v, -_n.dot(_v));
    if (_n.lengthSq() < 1e-8) { _n.set(0, 1, 0).addScaledVector(_v, -_v.y); }
    if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0);
    _n.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    // these must be their own vectors: aim() uses the shared temporaries, and borrowing _a/_b here quietly destroyed
    // the elbow and the end point on the first call, which is why the hand never arrived at the target.
    // own scratch, never the _a/_b that aim() writes to (that aliasing once made the arm miss by 39 cm)
    _elbow.copy(s).addScaledVector(_v, along).addScaledVector(_n, off);
    _end.copy(s).addScaledVector(_v, d);
    // Every joint's rest world rotation is identity (the tree is built from pure translations), so pointing a segment
    // is just the rotation that takes its rest direction to the wanted one; setWorldQuat turns that into a local one.
    _rU.copy(this.rest[lower].world).sub(this.rest[upper].world).normalize();
    _rL.copy(this.rest[tip].world).sub(this.rest[lower].world).normalize();
    this.aim(upper, _rU, _dir.copy(_elbow).sub(s));
    this.refresh(L);                                                     // the elbow moved with the upper arm
    this.aim(lower, _rL, _dir.copy(_end).setFromMatrixPosition(L.matrixWorld).negate().add(_end));
  }

  /** put the doll's eyes at `pos`, facing `yaw` (radians, 0 = -Z) */
  placeEyes(pos, yaw = 0) {
    this.root.quaternion.setFromAxisAngle(UP, yaw);
    const eyeNow = _v2.copy(this.eye).applyQuaternion(this.root.quaternion);
    this.root.position.copy(pos).sub(eyeNow);
    this.root.updateMatrixWorld(true);   // once: everything below is posed against this
  }

  /** head and neck from the tracked physical angles (radians), on top of the body's heading */
  setHead({ pitch = 0, yaw = 0, roll = 0, facing = 0 } = {}) {
    // setWorldQuat sets a WORLD rotation, so without the heading in it the head kept pointing at a fixed compass
    // direction and unscrewed from the neck as soon as the body turned.
    _qy.setFromAxisAngle(UP, facing);
    _q.setFromEuler(new THREE.Euler(pitch * 0.45, yaw * 0.45, roll * 0.45, "YXZ")).premultiply(_qy);
    this.setWorldQuat("Neck", _q);
    _q2.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ")).premultiply(_qy);
    this.setWorldQuat("Head", _q2);
  }

  /** nudge the root so the eyes sit exactly on `pos` after everything else has been posed */
  pinEyes(pos) {
    if (!this.eyeInHead) return;
    // the spine chain is what moved: Root -> Hips -> Waist -> Chest -> Neck -> Head
    for (const n of ["Hips", "Waist", "Chest", "Neck", "Head"]) this.refresh(this.joints[n]);
    // Use the head's POSITION but the body's orientation, not the head's. Rotating a head does not move a person's
    // body, yet pinning the rotated eye to a fixed camera translated the whole doll: a 0.35 rad head roll pushed the
    // shoulder 7 cm away from the hand it was reaching for, and the wrist ended up 10 cm off the tracked one.
    _eye.copy(this.eyeInHead).applyQuaternion(this.root.quaternion).add(_lp.setFromMatrixPosition(this.joints.Head.matrixWorld));
    this.root.position.add(_a.copy(pos).sub(_eye));
    this.root.updateMatrix(); this.root.matrixWorld.multiplyMatrices(this.root.parent.matrixWorld, this.root.matrix);
  }

  dispose() { this.root.parent?.remove(this.root); }
}
