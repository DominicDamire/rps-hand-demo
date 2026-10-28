// Punching, touching and the sounds that go with them.
//
// A free-standing heavy bag next to the shooting range: punch it with a closed fist and it thumps and rocks back, touch
// it with an open hand and it taps. The hand is also pushed out of the bag and off the table top instead of sliding
// through them, so a surface finally stops the hand. Footsteps play while you walk.
// Only the tracked right hand exists in 3D (the left one is the joystick), so that is the hand that can punch.
import * as THREE from "three";
import * as sfx from "./sound.mjs?v=90";
import { fingersUp } from "../gun.mjs";

const BAG_R = 0.17, BAG_TOP = 1.75, BAG_BOTTOM = 0.75, BASE_R = 0.33;   // metres above the floor: the top reaches head height, so a punch thrown level lands on it
const FIST_R = 0.055;
const K = 30, C = 3.4, LEAN_MAX = 0.55;      // bag spring, damping (rad/s^2 per rad), maximum lean
const HIT_SPEED = 0.9;                        // m/s of fist into the bag to count as a punch rather than a touch
const STEP_EVERY = 0.68;                      // metres of walking per footstep

export function setupPunch({ scene, camera, handModel, floorY, at, getGun }) {
  const group = new THREE.Group(); group.position.set(at.x, floorY, at.z); scene.add(group);
  const dark = new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d2f2a, roughness: 0.55 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(BASE_R, BASE_R * 1.08, 0.14, 24), dark); base.position.y = 0.07; group.add(base);
  const pivot = new THREE.Group(); pivot.position.y = 0.14; group.add(pivot);                       // the bag tips about the top of the base
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, BAG_BOTTOM - 0.14, 12), dark);
  post.position.y = (BAG_BOTTOM - 0.14) / 2; pivot.add(post);
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(BAG_R, BAG_TOP - BAG_BOTTOM - 2 * BAG_R, 6, 16), skin);
  bag.position.y = (BAG_BOTTOM + BAG_TOP) / 2 - 0.14; pivot.add(bag);
  for (const y of [BAG_BOTTOM + 0.1, BAG_TOP - 0.18]) {                                              // two straps, so the swing is easy to see
    const ring = new THREE.Mesh(new THREE.TorusGeometry(BAG_R + 0.004, 0.012, 6, 20), dark);
    ring.rotation.x = Math.PI / 2; ring.position.y = y - 0.14; pivot.add(ring);
  }

  const lean = new THREE.Vector2(), vel = new THREE.Vector2();
  const _p = new THREE.Vector3(), _prev = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(), _push = new THREE.Vector3();
  const _ax = new THREE.Vector3(), _q = new THREE.Quaternion();
  const applied = new THREE.Vector3(), leftAt = new THREE.Vector3(); let pushing = false;   // our own push, taken back each frame so it never accumulates
  let have = false, speed = 0, touching = false, lastHit = -Infinity, lastWhoosh = -Infinity, walked = 0, lastCam = null, hits = 0, touches = 0;

  window.sfx = sfx;   // so a probe (and a developer) can check whether sound is allowed yet
  const wake = () => sfx.ensure();
  addEventListener("pointerdown", wake, { capture: true });
  addEventListener("keydown", wake, { capture: true });

  return {
    group, get hits() { return hits; }, get touches() { return touches; }, get swing() { return +lean.length().toFixed(3); },
    update(dt, now) {
      dt = Math.min(0.05, Math.max(0.0005, dt));
      // --- the bag swings back to upright -------------------------------------------------------------------------
      vel.addScaledVector(lean, -K * dt).addScaledVector(vel, -Math.min(1, C * dt));
      lean.addScaledVector(vel, dt);
      const L = lean.length(); if (L > LEAN_MAX) { lean.multiplyScalar(LEAN_MAX / L); vel.multiplyScalar(0.4); }
      pivot.rotation.set(lean.y, 0, -lean.x);
      pivot.updateMatrixWorld(true);

      // --- footsteps ----------------------------------------------------------------------------------------------
      if (lastCam) { walked += Math.hypot(camera.position.x - lastCam.x, camera.position.z - lastCam.z); if (walked > STEP_EVERY) { walked = 0; sfx.step(0.5); } }
      else lastCam = new THREE.Vector3();
      lastCam.copy(camera.position);

      if (!handModel.visible) { have = false; touching = false; pushing = false; applied.set(0, 0, 0); return; }
      // Take back last frame's push, unless the tracker has already replaced the position itself.
      if (pushing && handModel.group.position.distanceToSquared(leftAt) < 1e-12) handModel.group.position.sub(applied);
      applied.set(0, 0, 0); pushing = false;
      handModel.group.updateMatrixWorld(true);
      const pts = handModel.points;
      _p.copy(pts[0]).add(pts[5]).add(pts[17]).multiplyScalar(1 / 3).applyMatrix4(handModel.group.matrixWorld);   // palm centre, world
      if (have) { _v.subVectors(_p, _prev).divideScalar(dt); speed += (_v.length() - speed) * Math.min(1, dt / 0.05); } else _v.set(0, 0, 0);
      _prev.copy(_p); have = true;
      const up = fingersUp(pts), closed = !up[1] && !up[2] && !up[3];   // middle, ring and pinky folded: a fist (distances only, so the group's frame is fine)
      const held = getGun?.()?.state.mode === "held";

      // --- the bag: closest point on its axis to the fist ---------------------------------------------------------
      _up.set(0, 1, 0).applyQuaternion(pivot.getWorldQuaternion(_q));
      _a.setFromMatrixPosition(pivot.matrixWorld).addScaledVector(_up, BAG_BOTTOM - 0.14 + BAG_R);
      _b.setFromMatrixPosition(pivot.matrixWorld).addScaledVector(_up, BAG_TOP - 0.14 - BAG_R);
      _ax.subVectors(_b, _a);                          // the bag's core, bottom to top
      const t = Math.max(0, Math.min(1, _ax.dot(_push.subVectors(_p, _a)) / _ax.lengthSq()));
      _n.copy(_a).addScaledVector(_ax, t);             // closest point on that core to the fist
      _push.subVectors(_p, _n); const gap = _push.length() - (BAG_R + FIST_R);
      if (gap < 0 && !held) {
        if (_push.lengthSq() < 1e-8) _push.set(0, 0, 1);
        _push.normalize();
        const into = Math.max(0, -_v.dot(_push));      // how fast the fist is going into the bag
        if (!touching || now - lastHit > 220) {
          touching = true; lastHit = now;
          if (into > HIT_SPEED || (closed && speed > HIT_SPEED)) {
            const power = Math.min(1, Math.max(into, speed) / 3.5);
            sfx.punch(closed ? power : power * 0.5); hits++; touches++;
            vel.x -= _push.x * (closed ? 5.5 : 2.4) * power; vel.y -= _push.z * (closed ? 5.5 : 2.4) * power;
          } else { touches++; sfx.tap(0.35); }
        }
        applied.addScaledVector(_push, -gap);   // the hand stops at the surface instead of sinking in
      } else {
        touching = false;
        if (closed && speed > 2.6 && now - lastWhoosh > 420) { lastWhoosh = now; sfx.whoosh(Math.min(1, speed / 6)); }
      }

      // --- the table top stops the hand too -----------------------------------------------------------------------
      // (applied is added once, at the end)
      const table = getGun?.()?.table;
      if (table && !held) {
        table.updateMatrixWorld(true);
        _a.setFromMatrixPosition(table.matrixWorld);
        const half = table.geometry?.parameters ? new THREE.Vector3(table.geometry.parameters.width / 2, table.geometry.parameters.height / 2, table.geometry.parameters.depth / 2) : null;
        if (half) {
          const top = _a.y + half.y, under = _p.y - FIST_R;
          if (under < top && _p.y > _a.y - half.y && Math.abs(_p.x - _a.x) < half.x + FIST_R && Math.abs(_p.z - _a.z) < half.z + FIST_R) {
            applied.y += top - under;
            if (!touching && now - lastHit > 260) { lastHit = now; touching = true; sfx.tap(Math.min(0.9, 0.2 + speed / 4)); }
          }
        }
      }
      if (applied.lengthSq() > 1e-12) { handModel.group.position.add(applied); leftAt.copy(handModel.group.position); pushing = true; }
    },
  };
}
