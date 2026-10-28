// The player's body in the map: the user's ball-joint doll, driven from the trackers.
//
// Replaces the old skinned upper-body avatar. What drives what:
//   eyes      <- the camera position, so the doll is always where the player is
//   body yaw  <- the walking heading (head-look.mjs), so it turns with you
//   neck/head <- the face tracker's physical angles, and its 3D position when the spatial fit is running
//   arms      <- two-bone IK to the tracked wrists: the right one from our own hand model (which is exact), the left
//                from the body tracker when it is on
//   fingers   <- the 21 hand landmarks, when that hand is being tracked
//   legs      <- feet planted on the floor while you are not walking, and a simple alternating stride when you are
//
// The doll's proportions are stylised (arm reach 0.47 m on a 1.75 m figure, where a person's is nearer 0.52), so wrist
// targets are taken as directions from the shoulder and the IK clamps the distance; the arm points the right way even
// when a real arm would be longer.
import * as THREE from "three";
import { DollRig, HEAD_LAYER } from "../doll/DollRig.js?v=90";
import { BodyView } from "../body/BodyView.js?v=90";
import { BodyPose } from "../body/pose.mjs?v=90";


const STEP = 0.42;          // metres of travel before the trailing foot swings through
const STEP_TIME = 0.28;     // seconds a step takes
const FOOT_SPREAD = 0.09;   // half the distance between the feet

export function setupBody({ scene, camera, handModel, handModelL = null, video, getRemote = () => null }) {
  const Q = new URLSearchParams(location.search);
  const mode0 = Q.get("body");
  if (mode0 === "off") return null;

  const box = document.createElement("div"); box.id = "bodyBox";
  box.style.cssText = "position:fixed;top:64px;left:16px;z-index:5;display:flex;gap:6px;align-items:center;padding:6px 10px;background:#101b25cc;border-radius:8px;font:12px system-ui,sans-serif;color:#dfe8f0";
  box.innerHTML = `<span>Body</span><select id="bodyMode" style="font:inherit"><option value="full">full body</option><option value="seated">seated + tracker</option><option value="standing">standing + tracker</option><option value="head">head only</option><option value="off">off</option></select><button id="bodyCal" type="button" style="font:inherit">Calibrate</button><span id="bodyStatus" style="color:#9fb3c8;max-width:46vw"></span>`;
  document.body.appendChild(box);
  const modeEl = box.querySelector("#bodyMode"), calEl = box.querySelector("#bodyCal"), statusEl = box.querySelector("#bodyStatus");
  if (["full", "seated", "standing", "head"].includes(mode0)) modeEl.value = mode0;
  const tracked = () => modeEl.value === "seated" || modeEl.value === "standing";
  // Every phalanx follows its own tracked segment, as in v80.
  // Same for the walk: the model stands with its feet flat on the floor, and that is a better picture than a stride
  // built out of joint angles. ?walk=1 brings the gait back.
  const DRIVE_WALK = Q.get("walk") === "1";

  // Explicit URLs keep the exact v80 loader unchanged while bypassing the previous model cache.
  const rig = new DollRig(scene, {
    url: new URL("../doll.glb?v=90", import.meta.url).href,
    report: new URL("../doll-report.json?v=90", import.meta.url).href,
  });
  function resetHands() {
    restPalm.clear(); restDirs.clear();
    for (const S of ["L", "R"]) for (const [n] of FINGERS) {
      const j = rig.joints?.[`${S}${n}1`];
      if (j) { j.position.copy(rig.rest[`${S}${n}1`].world).sub(rig.rest[`${S}Hand`].world); j.scale.setScalar(1); }
    }
    for (const S of ["L", "R"]) rig.joints?.[`${S}Hand`]?.scale.setScalar(1);
  }
  // The doll is stylised: its arms reach 0.470 m where a 1.75 m adult's reach about 0.52, so a hand held out at arm's
  // length - which is exactly where the gun is - was 5 cm beyond what the arm could reach and the wrist fell short by
  // that much, taking every finger with it. A 1.1 scale on each arm puts the reach at a human 0.517 m.
  const ARM_SCALE = +(new URLSearchParams(location.search).get("arm")) || 1.1;
  rig.ready.then(() => { for (const S of ["L", "R"]) rig.joints[`${S}UpperArm`].scale.setScalar(ARM_SCALE); });
  let error = null;
  rig.ready.catch(e => { error = e; console.warn("doll unavailable:", e); statusEl.textContent = "doll could not load"; });

  // the body tracker, local or over the phone link, only when a tracked mode is chosen
  const cur = { head: null };
  const headAdapter = { camera, get mode() { return cur.head?.mode ?? "off"; }, get ready() { return !!cur.head?.ready; },
    get busy() { return !!cur.head?.busy; }, get completedFrames() { return cur.head?.completedFrames ?? 0; },
    performance: { get latency() { return cur.head?.perf?.latency ?? 0; } } };
  let local = null, far = null, wired = null;
  const startLocal = () => { try { local = new BodyView(video, headAdapter, { mode: modeEl, status: statusEl, recenter: calEl }); } catch (e) { error = e; } };
  const startFar = link => { far = new BodyPose(modeEl.value); wired = link; link.onBody = s => far.receive(s, performance.now());
    modeEl.addEventListener("change", () => far.recenter(modeEl.value)); calEl.addEventListener("click", () => far.recenter(modeEl.value)); };

  // --- legs ------------------------------------------------------------------------------------------------------
  // A real gait, not a sine on the hip angles. One foot is always planted on a fixed point of the floor; the other
  // swings along an arc to the next contact, and both legs are solved to their foot with the same two-bone IK the arms
  // use. That is the only way the feet stop treading air: the previous version rotated the thigh and knee on a sine
  // and never referenced the floor at all, so for most of the cycle neither foot was near it.
  // Standing still, both feet ease back under the hips and stay there (on the ground
  // as long as the joystick has not been moved).
  const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _hint = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3();
  const STEP_LEN = 0.42;      // metres of travel between footfalls
  const STEP_TIME = 0.26;     // seconds a swing takes
  const LIFT = 0.08;          // how high the swinging foot clears the floor
  const SPREAD = 0.085;       // half the distance between the feet
  const EYE_H = 1.65;         // the map holds the camera this far above the floor
  const contact = [new THREE.Vector3(), new THREE.Vector3()];   // world, where each foot is standing
  const swingFrom = new THREE.Vector3(), swingTo = new THREE.Vector3(), _foot = new THREE.Vector3();
  let placed = false, swing = -1, swingT = 0, travelled = 0, gait = 0, lastPos = null, ankleH = 0.23, crouch = 0;
  // Measured: at rest this doll's thigh-to-ankle gap is 0.819 m and its leg is 0.817 m - the knees are locked straight
  // with no slack at all, so a stride of any length puts the foot out of reach and it floats. A person solves this by
  // dropping their hips as they walk; so does this. The eyes are pinned a few centimetres lower while walking, which
  // bends the knees and lets the planted foot stay on the floor. Invisible from the player's own eyes.
  const CROUCH = 0.14;   // the most the hips may drop; the walk only uses what the planted foot actually needs

  const restFoot = (out, i, pos, yaw) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw), side = i ? SPREAD : -SPREAD;
    return out.set(pos.x + c * side, pos.y - EYE_H, pos.z - sn * side);
  };

  function legs(dt, pos, yaw) {
    for (const S of ["L", "R"]) for (const n of ["Thigh", "Shin", "Foot"]) rig.refresh(rig.joints[`${S}${n}`]);
    const floor = pos.y - EYE_H;
    if (!placed) { for (const i of [0, 1]) restFoot(contact[i], i, pos, yaw); placed = true; lastPos = pos.clone(); ankleH = rig.rest.RFoot.world.y; }
    const moved = Math.hypot(pos.x - lastPos.x, pos.z - lastPos.z);
    lastPos.copy(pos);
    gait += (Math.min(1, (moved / Math.max(1e-3, dt)) / 1.2) - gait) * Math.min(1, dt * 6);
    // Crouch exactly as much as the planted foot needs, rather than a fixed amount scaled by speed. The leg is dead
    // straight at rest, so the moment a contact is further from the thigh than the leg is long the IK clamps and the
    // foot lifts off the floor. Measuring the shortfall and dropping the hips by it keeps the stance foot down.
    let need = 0;
    for (const i of [0, 1]) {
      if (i === swing) continue;
      const S = i ? "R" : "L";
      _t.setFromMatrixPosition(rig.joints[`${S}Thigh`].matrixWorld);
      const flat = Math.hypot(contact[i].x - _t.x, contact[i].z - _t.z);
      const legLen = rig.rest[`${S}Shin`].world.distanceTo(rig.rest[`${S}Thigh`].world)
                   + rig.rest[`${S}Foot`].world.distanceTo(rig.rest[`${S}Shin`].world);
      const drop = (_t.y + crouch) - (pos.y - EYE_H + ankleH);           // vertical gap without the crouch
      const reach = Math.sqrt(Math.max(0, (legLen * 0.985) ** 2 - flat * flat));
      need = Math.max(need, drop - reach);
    }
    const want = Math.max(0, Math.min(CROUCH, need));
    // drop at once when the foot needs it - easing into it left the stance foot briefly in the air right after a
    // handover - and come back up gently, which is what reads as a walk rather than a bounce
    crouch = want > crouch ? want : crouch + (want - crouch) * Math.min(1, dt * 6);

    if (gait < 0.03 && swing < 0) {                       // standing: settle both feet under the hips
      for (const i of [0, 1]) contact[i].lerp(restFoot(_t, i, pos, yaw), Math.min(1, dt * 5));
      travelled = 0;
    } else {
      travelled += moved;
      // Step when the travel says so OR when the planted foot is about to go out of the leg's reach - without the
      // second test the player walks away from their own foot, the IK clamps, and the foot floats above the floor.
      const legLen = rig.rest.RShin.world.distanceTo(rig.rest.RThigh.world) + rig.rest.RFoot.world.distanceTo(rig.rest.RShin.world);
      const hipY = pos.y - EYE_H + rig.rest.Hips.world.y;
      const thighY = pos.y - EYE_H + rig.rest.RThigh.world.y - crouch;
      const stretched = i => Math.hypot(contact[i].x - pos.x, contact[i].z - pos.z, thighY - (pos.y - EYE_H + ankleH)) > legLen * 0.95;
      if (swing < 0 && (travelled >= STEP_LEN * (0.45 + 0.35 * gait) || stretched(0) || stretched(1))) {
        swing = contact[0].distanceTo(pos) > contact[1].distanceTo(pos) ? 0 : 1;   // the foot furthest behind swings
        swingFrom.copy(contact[swing]);
        // land it ahead of the player, along the way they are actually travelling
        restFoot(swingTo, swing, pos, yaw);
        const dx = pos.x - swingFrom.x, dz = pos.z - swingFrom.z, len = Math.hypot(dx, dz) || 1;
        swingTo.x += dx / len * STEP_LEN * 0.5; swingTo.z += dz / len * STEP_LEN * 0.5;   // land ahead, so the stance phase is centred under the hips
        swingT = 0; travelled = 0;
      }
      if (swing >= 0) {
        swingT += dt / STEP_TIME;
        const t = Math.min(1, swingT);
        contact[swing].lerpVectors(swingFrom, swingTo, t * t * (3 - 2 * t));
        if (t >= 1) swing = -1;
      }
    }

    // The hip drop is applied to the two thigh joints, not to the root. Dropping the root moved the shoulders away
    // from the hands the arms were reaching for - the tracked wrist ended up 10 cm out - and the eyes off the camera.
    // Lowering only where the legs hang from gives them their slack and leaves the spine, the arms and the head alone.
    for (const S of ["L", "R"]) {
      const t = rig.joints[`${S}Thigh`];
      t.position.y = rig.rest[`${S}Thigh`].world.y - rig.rest.Hips.world.y - crouch;
    }
    rig.refresh(rig.joints.Hips);
    for (const [S, i] of [["L", 0], ["R", 1]]) {
      _foot.copy(contact[i]); _foot.y = floor + ankleH;
      if (swing === i && swingT < 1) _foot.y += Math.sin(Math.min(1, swingT) * Math.PI) * LIFT;
      // the knee leads forward, and never the other way: that is what stops the leg inverting
      _hint.copy(rig.joints[`${S}Thigh`].getWorldPosition(_t));
      _hint.x -= Math.sin(yaw) * 0.6; _hint.z -= Math.cos(yaw) * 0.6; _hint.y -= 0.25;
      for (const n of ["Hips", `${S}Thigh`]) rig.refresh(rig.joints[n]);
      rig.reach(`${S}Thigh`, `${S}Shin`, `${S}Foot`, _foot, _hint);
    }
  }

  const bodyCrouch = () => crouch;
  const _crouched = new THREE.Vector3();

  /** everything the walk test needs to see: heights, which foot swings, and how far each contact is from the hip */
  function walkDebug(pos) {
    const floor = pos.y - EYE_H;
    const hip = rig.joints.Hips.getWorldPosition(new THREE.Vector3());
    return {
      h: ["L", "R"].map(S => +(rig.joints[`${S}Foot`].getWorldPosition(_t).y - floor - ankleH).toFixed(3)),
      target: [0, 1].map(i => +(contact[i].y - floor).toFixed(3)),
      fromThigh: [0, 1].map(i => +rig.joints[i ? "RThigh" : "LThigh"].getWorldPosition(_v).distanceTo(contact[i]).toFixed(3)),
      crouch: +crouch.toFixed(3),
      legLen: +(rig.joints.RShin.getWorldPosition(_t).distanceTo(rig.joints.RThigh.getWorldPosition(_v))
              + rig.joints.RFoot.getWorldPosition(_t).distanceTo(rig.joints.RShin.getWorldPosition(_v))).toFixed(3),
      swing, gait: +gait.toFixed(2), ankleH: +ankleH.toFixed(3),
    };
  }

  /** how far each ankle is from the floor it should be standing on - used by the walk test */
  function footHeights(pos) {
    const floor = pos.y - EYE_H;
    return ["L", "R"].map(S => +(rig.joints[`${S}Foot`].getWorldPosition(_t).y - floor - ankleH).toFixed(4));
  }

  // Which meshes belong to each arm, so an arm the camera cannot see can be taken off the screen rather than left
  // frozen in mid-air. Built once.
  const armParts = { L: [], R: [] };
  const armBone = /^([LR])(UpperArm|Forearm|Hand|Thumb|Index|Middle|Ring|Pinky)/;
  const buildArmParts = () => {
    for (const m of rig.parts) { const g = armBone.exec(m.name); if (g) armParts[g[1]].push(m); }
  };
  let told = null, shownMode = null, neutral = null;
  const lean = new THREE.Vector3();
  const armShown = { L: null, R: null };
  calEl.addEventListener("click", () => { if (rig.loaded) resetHands(); });
  return {
    rig, get error() { return error; }, footHeights: () => footHeights(camera.position), walkDebug: () => walkDebug(camera.position), get gait() { return gait; },
    recenter() {
      (far || local?.pose)?.recenter(modeEl.value);
      placed = false; swing = -1; swingT = 0; travelled = 0; crouch = 0; gait = 0; lastPos = null; neutral = null; lean.set(0, 0, 0);
      resetHands();
    },
    wants() { return tracked(); }, get told() { return told; }, set told(v) { told = v; },

    update(dt, now, { head, heading = 0, look = null, lookPitch = null } = {}) {
      cur.head = head;
      if (!rig.loaded) return;
      const mode = modeEl.value;
      rig.root.visible = mode !== "off";
      // the doll's hand replaces the old mesh only while the doll is actually drawing one
      const drawOld = (mode === "off" || mode === "head"); if (handModel) handModel.drawMesh = drawOld; if (handModelL) handModelL.drawMesh = drawOld;
      if (mode === "off") return;
      const link = getRemote();
      if (tracked()) { if (link && wired !== link) startFar(link); else if (!link && !local && !far && !error) startLocal(); }

      // Every channel below is set absolutely, so there is nothing to clear: dropping the per-frame reset means a
      // tracker that misses a frame leaves the limb where it was instead of the whole body snapping to rest.
      rig.placeEyes(camera.position, heading);

      // --- head and the lean under it ---------------------------------------------------------------------------
      const p = head?.pose;
      if (p) rig.setHead({
        // Turn the head by what the VIEW actually turned, not by the raw tracked angle. The look system already
        // converts your head yaw into where the camera points (heading plus look), and the doll's eyes are pinned to
        // that camera - so driving the head with the raw angle on top turned it away while you were looking straight.
        // Relative to the body the head is exactly `look`, and its pitch is exactly the view's pitch.
        pitch: lookPitch ?? (p.physicalPitch || 0),
        yaw: look ?? (p.physicalYaw || 0),
        roll: p.physicalRoll || 0, facing: heading });
      // The doll's eyes are pinned to the camera, so the way to show the head moving through space is to lean the body
      // under it. The face tracker gives where the head is in the
      // picture and how far away it is; the offset from where it started becomes a lean at the waist and the chest.
      const L = head?.latest;
      if (L && L.span > 0) {
        const asp = (video?.videoWidth / video?.videoHeight) || 4 / 3;
        const f = 1 / (2 * Math.tan(60 * Math.PI / 360)), d = Math.min(2, Math.max(0.18, f * 0.09 / L.span));
        _v.set((L.centerX - 0.5) * d / f, -(L.centerY - 0.5) * d / (f * asp), d);
        if (!neutral) neutral = _v.clone();
        lean.lerp(_t.set(_v.x - neutral.x, _v.y - neutral.y, _v.z - neutral.z), Math.min(1, dt * 8));
      }
      for (const [name, k] of LEAN_JOINTS) {
        const j = rig.joints[name]; if (!j) continue;
        j.rotation.z = THREE.MathUtils.clamp(-lean.x * 1.6, -0.35, 0.35) * k;      // sway sideways
        j.rotation.x = THREE.MathUtils.clamp(-lean.y * 1.6, -0.35, 0.35) * k;      // lean forward and back
        rig.refresh(j);
      }

      // --- body from the pose tracker ---------------------------------------------------------------------------
      const raw = !tracked() ? null : far ? far.update(now, dt, true, camera.position.toArray()) : local ? local.update(now, dt) : null;
      const bodyStatus = !tracked() ? (mode === "head" ? "Head only" : "Full body · arms follow your hand")
        : raw ? `Body · ${mode}` : "Body tracker: hold a relaxed pose";

      // --- arms -------------------------------------------------------------------------------------------------
      // The eyes are pinned BEFORE the arms and legs are solved. Pinning afterwards moved the root out from under
      // limbs that had already been solved to world targets: it dragged the planted foot 2 cm into the floor, and once
      // head roll started moving the head it put the hand 14 cm off the tracked wrist.
      rig.pinEyes(camera.position);
      // The shoulder: a clavicle that never moved left the cap behind while the arm swung away, opening the socket.
      // It lifts with the arm, and the elbow hint is forced behind and below the shoulder so the elbow can never lead
      // forwards and turn the joint inside out.
      const armTo = (S, wrist) => {
        for (const n of ["Hips", "Waist", "Chest"]) rig.refresh(rig.joints[n]);
        const clav = rig.joints[`${S}Clavicle`], sh = rig.joints[`${S}UpperArm`];
        // The clavicle is deliberately left alone. Lifting it with the arm was meant to close the shoulder socket, but
        // measured both ways it moves the shoulder further from the hand - the shoulder-to-wrist distance went from
        // 0.52 m to 0.58 m against an arm that reaches 0.517 - and the hand ended up 8-10 cm off the tracked wrist.
        // Accuracy at the hand matters more than a seam at the shoulder, and a cosmetic gap is the model's to fix.
        if (clav && sh) { rig.refresh(clav); rig.refresh(sh); _t.setFromMatrixPosition(sh.matrixWorld); }
        // elbow hint: out to the side, down, and behind the shoulder in body space
        _hint.set(S === "R" ? 0.32 : -0.32, -0.34, 0.2).applyAxisAngle(UP, heading).add(_t);
        rig.reach(`${S}UpperArm`, `${S}Forearm`, `${S}Hand`, wrist, _hint);
        rig.refresh(rig.joints[`${S}Hand`]);
      };

      // the right wrist comes from our own hand model when it is visible: it is the most accurate thing we have
      if (handModel?.visible) {
        handModel.group.updateMatrixWorld(true);
        const src = handModel.override ? handModel.override() : handModel.points;
        _w.copy(src[0]).applyMatrix4(handModel.group.matrixWorld);
        const S = handModel.right ? "R" : "L";
        armTo(S, _w);
        setPalm(rig, S, src, handModel.group.matrixWorld);
        setFingers(rig, S, src, handModel.group.matrixWorld);
      }
      // the steering hand: same treatment, it is a tracked hand like the other
      if (handModelL?.visible) {
        handModelL.group.updateMatrixWorld(true);
        const srcL = handModelL.points, SL = handModelL.right ? "R" : "L";
        if (!(handModel?.visible && (handModel.right ? "R" : "L") === SL)) {   // never two hands on one arm
          _w.copy(srcL[0]).applyMatrix4(handModelL.group.matrixWorld);
          armTo(SL, _w);
          setPalm(rig, SL, srcL, handModelL.group.matrixWorld);
          setFingers(rig, SL, srcL, handModelL.group.matrixWorld);
        }
      }
      if (raw) for (const S of ["L", "R"]) {
        if ((handModel?.visible && (handModel.right ? "R" : "L") === S) || (handModelL?.visible && (handModelL.right ? "R" : "L") === S)) continue;   // already driven, and better
        const wj = raw[S === "L" ? "leftWrist" : "rightWrist"], ej = raw[S === "L" ? "leftElbow" : "rightElbow"];
        if (!wj || !ej) continue;
        _w.fromArray(wj).applyAxisAngle(UP, heading).add(camera.position);
        armTo(S, _w);
      }

      // --- legs -------------------------------------------------------------------------------------------------
      if (mode !== "head" && DRIVE_WALK) {
        legs(dt, camera.position, heading);
        // an arm that nothing is tracking swings with the opposite leg, which is what a person does
        for (const S of ["L", "R"]) {
          const driven = (handModel?.visible && (handModel.right ? "R" : "L") === S) || (handModelL?.visible && (handModelL.right ? "R" : "L") === S);
          if (driven || gait < 0.03) continue;
          const a = rig.joints[`${S}UpperArm`], f = rig.joints[`${S}Forearm`];
          const sw = Math.sin(travelled / STEP_LEN * Math.PI + (S === "L" ? Math.PI : 0)) * 0.22 * gait;
          if (a) { a.rotation.x = sw; rig.refresh(a); }
          if (f) { f.rotation.x = -0.12 - Math.abs(sw) * 0.5; rig.refresh(f); }
        }
      }
      if (shownMode !== mode) {   // "head only" hides the body; the head itself is always on its own layer, so a
        shownMode = mode;         // first-person camera never sees it from the inside while the mirror still does
        armShown.L = armShown.R = null;   // that loop writes every part, so the arm cache is stale
        for (const m of rig.parts) {
          const isHead = m.name.startsWith("Head") || m.name.startsWith("Neck");
          m.visible = isHead || mode !== "head";
        }
      }
      if (!armParts.L.length && !armParts.R.length) buildArmParts();
      {
        // an arm is drawn only while something is actually driving it
        const live = { L: false, R: false };
        if (handModel?.visible) live[handModel.right ? "R" : "L"] = true;
        if (handModelL?.visible) live[handModelL.right ? "R" : "L"] = true;
        if (tracked() && raw) { live.L ||= !!raw.leftWrist && !!raw.leftElbow; live.R ||= !!raw.rightWrist && !!raw.rightElbow; }
        for (const S of ["L", "R"]) if (armShown[S] !== live[S]) {
          armShown[S] = live[S];
          for (const m of armParts[S]) m.visible = live[S] && mode !== "head";
        }
      }
      rig.root.updateMatrixWorld(true);
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const LEAN_JOINTS = [["Waist", 0.5], ["Chest", 0.5]];

const FINGERS = [["Thumb", 1, 2, 3, 4], ["Index", 5, 6, 7, 8], ["Middle", 9, 10, 11, 12], ["Ring", 13, 14, 15, 16], ["Pinky", 17, 18, 19, 20]];
const FI = [[0, 1], [1, 2], [2, 3]];   // which two of (a, b, c, d) each phalanx runs between, hoisted out of the frame loop
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _v2 = new THREE.Vector3();
// --- the palm ---------------------------------------------------------------------------------------------------
// The IK only decides where the wrist is. Without this the hand keeps whatever twist the forearm happened to end with,
// so the knuckles can sit 10 cm from the tracked ones even with every finger angle right. Build a frame from the
// tracked wrist, index knuckle and little-finger knuckle, build the same frame from the doll's own rest pose, and turn
// the hand by the rotation between them.
const _u = new THREE.Vector3(), _n2 = new THREE.Vector3(), _y = new THREE.Vector3();
const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4(), _qh = new THREE.Quaternion();
const restPalm = new Map();
function basis(out, o, a, b) {
  _u.subVectors(a, o); _v2.subVectors(b, o);
  _n2.crossVectors(_u, _v2);
  if (_u.lengthSq() < 1e-10 || _n2.lengthSq() < 1e-12) return null;
  _u.normalize(); _n2.normalize(); _y.crossVectors(_n2, _u).normalize();
  return out.makeBasis(_u, _y, _n2);
}
// Rest attachments are fixed: no per-finger scale or knuckle translations.

function setPalm(rig, S, pts, mat) {
  const key = S;
  if (!restPalm.has(key)) {
    const m = new THREE.Matrix4();
    const ok = basis(m, rig.rest[`${S}Hand`].world, rig.rest[`${S}Index1`].world, rig.rest[`${S}Pinky1`].world);
    restPalm.set(key, ok ? m.clone().invert() : null);
  }
  const restInv = restPalm.get(key); if (!restInv) return;
  _p1.copy(pts[0]).applyMatrix4(mat); _p2.copy(pts[5]).applyMatrix4(mat); _p3.copy(pts[17]).applyMatrix4(mat);
  if (!basis(_mA, _p1, _p2, _p3)) return;
  _mB.multiplyMatrices(_mA, restInv);
  _qh.setFromRotationMatrix(_mB);
  rig.setWorldQuat(`${S}Hand`, _qh);
  rig.refresh(rig.joints[`${S}Hand`]);
}


/** curl the doll's fingers to match the tracked hand: each phalanx points where the tracked one points */
const restDirs = new Map();
function fingerRest(rig, S, name, k) {
  const key = `${S}${name}${k}`;
  if (restDirs.has(key)) return restDirs.get(key);
  const here = rig.rest[key]?.world, next = rig.rest[`${S}${name}${k + 1}`]?.world;
  // the last phalanx has no joint beyond it, so it carries on in the direction of the one before it
  const v = next ? new THREE.Vector3().subVectors(next, here)
                 : new THREE.Vector3().subVectors(rig.rest[`${S}${name}${k}`].world, rig.rest[`${S}${name}${k - 1}`].world);
  restDirs.set(key, v.lengthSq() > 1e-9 ? v.normalize() : null);
  return restDirs.get(key);
}
function setFingers(rig, S, pts, mat) {
  for (const [name, a, b, c, d] of FINGERS) {
    for (let k = 1; k <= 3; k++) {
      const j = rig.joints[`${S}${name}${k}`]; if (!j) continue;
      rig.refresh(j);   // its parent (the hand, or the phalanx before) has just been turned
      const i0 = FI[k - 1][0], i1 = FI[k - 1][1];
      _p1.copy(pts[i0 === 0 ? a : i0 === 1 ? b : c]).applyMatrix4(mat); _p2.copy(pts[i1 === 1 ? b : i1 === 2 ? c : d]).applyMatrix4(mat);
      _d1.subVectors(_p2, _p1);
      const rest = fingerRest(rig, S, name, k);
      if (!rest || _d1.lengthSq() < 1e-8) continue;
      // Solve in the parent frame so the finger inherits the palm's twist.
      // Absolute minimal world rotations can roll a segment away from its socket.
      j.parent.getWorldQuaternion(_qh).invert();
      _d1.applyQuaternion(_qh).normalize();
      j.quaternion.setFromUnitVectors(rest, _d1);
      rig.refresh(j);
    }
  }
}
