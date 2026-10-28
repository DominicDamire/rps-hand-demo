// The shooting range inside the movement map: a bar-height table with the pistol, cans and ring targets in front of
// the spawn, a mirror to the front-left, and a body under the camera so the mirror shows a person. The tracked right
// hand (hand-model.mjs, a child of the camera) picks the gun up, aims and fires through docs/gun.mjs; while the gun
// is held the hand is drawn in the gripping pose (hand-model's `override`).
// The player's body is body.mjs.
import * as THREE from "three";
import { Reflector } from "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/objects/Reflector.js";
import { makeGun, fingersUp } from "../gun.mjs?v=map9";
import { setupPunch } from "./punch.mjs?v=90";
import * as sfx from "./sound.mjs?v=90";

const TABLE_H = 1.32;   // table top above the floor: the tracked hand sits at chest height in front of the eye (1.65 m)
// ?mirror=N refreshes the reflection every Nth frame it is on screen (default 3, 1 = every frame)
const TABLE_AHEAD = 0.45;   // in front of the spawn. With the eye at 1.65 m the gun is then 0.65 m away, inside the reach of a
// half-extended arm (hand-model.mjs `reach`); at the old 0.75 m it was 0.83 m away and could not be grabbed at all.

// A phone has a coarse pointer (a finger). Screen size is not a tell: a short desktop window was being taken for one.
const isPhone = () => !!(window.matchMedia && matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0);

export function setupShooter({ scene, camera, dustMap, handModel, hud }) {
  const Q = new URLSearchParams(location.search);
  if (Q.get("gun") === "0") return null;
  // Measured on an RX 6650 XT with the doll in the scene: 1024x512 every frame took the page to 55 fps and the hand
  // tracker to 12; every second frame 77 fps and 23. Every second frame is not visible; a tracker at 12 fps is.
  let MIRROR_EVERY = Math.max(1, +Q.get("mirror") || (isPhone() ? 3 : 2));
  let mirrorOff = false;
  let gun = null, mirror = null, error = null, bag = null, wasMode = "rest";
  if (!hud) { const d = document.createElement("div"); d.id = "gunHud"; d.style.cssText = "position:fixed;top:64px;left:50%;transform:translateX(-50%);padding:6px 12px;background:#101b25cc;border-radius:8px;font:12px monospace;color:#ffdf75;pointer-events:none;z-index:5"; document.body.appendChild(d); hud = t => { d.textContent = t; }; }
  // (the player's body used to be a capsule here; body.mjs now draws the tracked upper-body rig)
  const _inv = new THREE.Matrix4(), _fwd = new THREE.Vector3(), pts = Array.from({ length: 21 }, () => new THREE.Vector3());
  const hand = { key: "R", group: handModel.group, pts, right: true, ext: [true, true, true, true] };

  async function build() {   // once the map is there: the range in front of the spawn, the mirror front-left
    const spawn = dustMap.spawn.clone(), floor = spawn.y - dustMap.eye;
    const tableZ = spawn.z - TABLE_AHEAD, tableFloor = dustMap.floor(spawn.x, tableZ, floor + 1) ?? floor;
    gun = await makeGun({ scene, worldObjs: dustMap.meshes, floorY: tableFloor, url: new URL("../gun.glb", import.meta.url).href,
      place: { pos: new THREE.Vector3(spawn.x, tableFloor + TABLE_H, tableZ), yaw: 0 }, hold: Q.has("grab") });
    bag = setupPunch({ scene, camera, handModel, floorY: tableFloor, at: new THREE.Vector3(spawn.x + 0.85, 0, spawn.z - 0.15), getGun: () => gun });   // a heavy bag beside the table, within arm's reach
    const mw = 8, mh = 4;   // a wall-sized mirror (about 15x the old 1.1 x 2.0 m area), 6.4 m to the front-left, facing the spawn: the whole body fits with room to walk
    // A PC can afford a proper reflection; a phone cannot. ?mirrorpx= overrides the width.
    const PC = !isPhone();
    const mpx = +Q.get("mirrorpx") || (PC ? 1024 : 384);
    mirror = new Reflector(new THREE.PlaneGeometry(mw, mh), { clipBias: 0.003, textureWidth: mpx, textureHeight: mpx / 2, color: 0xc4ccd2, multisample: 0 });
    const mx = spawn.x - 4.5, mz = spawn.z - 4.5, mfloor = dustMap.floor(mx, mz, floor + 1) ?? floor;   // measured (probe_map.py): flat floor there, nearest wall 19 m away, no ceiling
    mirror.position.set(mx, mfloor + mh / 2, mz); mirror.lookAt(spawn.x, mfloor + mh / 2, spawn.z); scene.add(mirror);
    // The player's own head sits on its own layer so the first-person camera does not look at the inside of it. The
    // mirror has to put that layer back, or you see a headless body looking at you.
    try { mirror.getReflectionCamera?.(camera)?.layers.enable(1); } catch (e) { console.warn("mirror layers", e); }
    // A mirror draws the WHOLE map a second time, every frame, and a large map is not small: at full rate it cost 25 page fps
    // and dragged the trackers down with it (hand 12 fps, face inference 89 ms) because they share the GPU. Measured with
    // it hidden: 289 page fps, hand 28, face 22 ms. So: refresh the reflection only when the mirror is actually on screen,
    // and then every third frame. A reflection three frames old is invisible to the eye; the frame rate is not.
    {
      const original = mirror.onBeforeRender, sphere = new THREE.Sphere(mirror.position.clone(), Math.hypot(mw, mh) / 2);
      const frustum = new THREE.Frustum(), _m4 = new THREE.Matrix4();
      let tick = 0, lastReflection = -Infinity;
      mirror.onBeforeRender = function (renderer, sc, cam) {
        _m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(_m4);
        if (!frustum.intersectsSphere(sphere)) return;   // behind you: keep the texture we already have
        const d = cam.position.distanceTo(mirror.position);
        // Measured: slowing the reflection from every 12th frame to every 48th took the page from 97 to 153 fps, the
        // hand tracker from 24 to 30 and face inference from 43 ms to 21. So it stays quick only while you are close
        // enough to be looking at yourself in it; across the room a stale reflection is invisible anyway.
        const every = MIRROR_EVERY * (d < 2.5 ? 1 : d < 5 ? 3 : 8);
        const now = performance.now();
        const interval = Q.has("mirror") ? 1000 / 60 * every : (d < 2.5 ? 1000 / 30 : d < 5 ? 1000 / 20 : 100);
        if (now - lastReflection < interval) return;
        lastReflection = now;
        original.call(this, renderer, sc, cam);
      };
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(mw + 0.3, mh + 0.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6 }));   // a 15 cm border: visible from 6 m
    frame.position.copy(mirror.position); frame.quaternion.copy(mirror.quaternion); frame.translateZ(-0.045); scene.add(frame);
    // You could walk straight through the glass. The map's collision raycasts against dustMap.meshes, so the frame
    // (a solid box behind the glass) joins that list and the mirror becomes a wall like any other.
    frame.updateMatrixWorld(true); dustMap.meshes.push(frame);
  }
  const ready = dustMap.ready ? build() : new Promise(res => { const t = setInterval(() => { if (dustMap.ready) { clearInterval(t); res(build()); } }, 200); });
  ready.catch(e => { error = e; console.warn("shooter unavailable:", e); });

  return {
    ready, get gun() { return gun; },
    /** the quality governor in app.mjs turns this down when the machine cannot keep up: 0 full, 3 no reflection */
    quality(level) {
      MIRROR_EVERY = [2, 8, 20, 20][Math.max(0, Math.min(3, level))];
      mirrorOff = level >= 3;
      if (mirror) mirror.visible = !mirrorOff;
    }, get mirror() { return mirror; }, get bag() { return bag; },
    update(dt, now) {
      if (!gun) return;
      const shown = handModel.visible;
      if (shown) {
        handModel.group.updateMatrixWorld(true);
        for (let i = 0; i < 21; i++) pts[i].copy(handModel.points[i]).applyMatrix4(handModel.group.matrixWorld);   // the phone-frame points into the world
        hand.right = handModel.right; const ext = fingersUp(pts); for (let i = 0; i < 4; i++) hand.ext[i] = ext[i];
      }
      gun.update(dt, shown ? [hand] : [], now, camera);
      if (gun.state.mode !== wasMode) { if (gun.state.mode === "held") sfx.grab(); else if (wasMode === "held") sfx.tap(0.6); wasMode = gun.state.mode; }
      bag?.update(dt, now);
      const held = gun.state.mode === "held" && gun.state.holder === "R";
      handModel.override = held ? () => { _inv.copy(handModel.group.matrixWorld).invert(); return gun.handPose(hand, _inv); } : null;   // the gripping pose, in the hand group's frame
      if (hud) hud(gun.hud());
    },
  };
}
