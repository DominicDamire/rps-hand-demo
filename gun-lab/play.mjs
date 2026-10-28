import { loadProvidedProfile } from "./presets.mjs?v=2";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GripRig } from "./grip-rig.mjs?v=4";
import { GripController, heldAngles } from "./held-pose.mjs?v=4";
import { gunMaterials } from "./gun-materials.mjs?v=4";
import { validateProfile } from "./profile.mjs?v=2";
import {
  startTracking,
  defaults,
} from "../hand-sweep-247/tracking-session.mjs";
import { receivePhone } from "../hand-sweep-247/phone-link.mjs";
const $ = (id) => document.getElementById(id),
  notice = (t) => ($("notice").textContent = t);
const scene = new T.Scene();
scene.background = new T.Color("#14242e");
scene.fog = new T.Fog("#14242e", 10, 24);
const camera = new T.PerspectiveCamera(45, 1, 0.005, 30),
  renderer = new T.WebGLRenderer({ canvas: $("scene"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.outputColorSpace = T.SRGBColorSpace;
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.minDistance = 0.12;
orbit.maxDistance = 2;
scene.add(new T.HemisphereLight(0xe8faff, 0x465e50, 2.5));
for (const [pos, power] of [
  [[1, 2, 2], 3],
  [[-1, 1, -1], 2],
]) {
  const light = new T.DirectionalLight(0xffffff, power);
  light.position.fromArray(pos);
  scene.add(light);
}
const room = new T.Group();
scene.add(room);
const floor = new T.GridHelper(24, 96, 0x50766c, 0x273e49);
floor.position.set(0, -0.65, -10);
room.add(floor);
const targets = [],
  targetSurfaces = [];
for (const [x, y, distance] of [
  [-0.55, -0.05, 2],
  [0, 0.1, 3],
  [0.9, 0.25, 5],
  [-0.95, 0.75, 7],
  [3, 1.1, 10],
]) {
  const group = new T.Group();
  group.position.set(x, y, -distance);
  room.add(group);
  const target = {
    group,
    distance,
    id: targets.length + 1,
    hits: 0,
    hitAt: -Infinity,
  };
  for (const [r, col] of [
    [0.24, 0xe6e1cc],
    [0.17, 0x344b51],
    [0.11, 0xe6e1cc],
    [0.05, 0xc99761],
  ]) {
    const disk = new T.Mesh(
      new T.CircleGeometry(r, 48),
      new T.MeshStandardMaterial({ color: col, side: T.DoubleSide }),
    );
    disk.position.z = (0.24 - r) * 0.015;
    disk.userData.target = target;
    targetSurfaces.push(disk);
    group.add(disk);
  }
  const label = document.createElement("canvas");
  label.width = 256;
  label.height = 64;
  const ctx = label.getContext("2d");
  ctx.fillStyle = "#14242e";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#b7efd2";
  ctx.font = "bold 30px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${target.id} · ${distance} m`, 128, 32);
  const sprite = new T.Sprite(
    new T.SpriteMaterial({ map: new T.CanvasTexture(label) }),
  );
  sprite.position.y = -0.32;
  sprite.scale.set(0.64, 0.16, 1);
  group.add(sprite);
  const stem = new T.Mesh(
    new T.BoxGeometry(0.025, y + 0.65, 0.025),
    new T.MeshStandardMaterial({ color: 0x39525b }),
  );
  stem.position.set(x, (y - 0.65) / 2, -distance - 0.02);
  room.add(stem);
  targets.push(target);
  const row = document.createElement("li");
  row.id = `target-${target.id}`;
  $("targetScores").append(row);
}
const table = new T.Mesh(
  new T.BoxGeometry(0.3, 0.025, 0.2),
  new T.MeshStandardMaterial({ color: 0x334c52 }),
);
table.position.set(0.22, -0.32, -0.74);
room.add(table);
const controller = new GripController();
let profile,
  provided,
  grip,
  stream = null,
  session = null,
  closePhone = null,
  source = "PC camera",
  token = 0,
  mode = "inspect",
  lastResult = 0,
  poseIndex = 0,
  poseThumb = 1,
  shots = 0,
  hits = 0,
  lastShot = -Infinity,
  audio = null,
  currentLabel = null;
const parked = new T.Group();
scene.add(parked);
parked.position.set(0.22, -0.3, -0.7);
parked.rotation.y = Math.PI;
const tracer = new T.Line(
  new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]),
  new T.LineBasicMaterial({ color: 0xffdb97, transparent: true, opacity: 0.8 }),
);
tracer.visible = false;
scene.add(tracer);
const flash = new T.PointLight(0xffd995, 0, 0.7, 2);
scene.add(flash);
function pose(index, thumb) {
  poseIndex = T.MathUtils.clamp(index, 0, 1);
  poseThumb = T.MathUtils.clamp(thumb, 0, 1);
  const angles = heldAngles(profile, poseIndex, poseThumb);
  grip.pose(angles, poseIndex);
  $("indexMeter").value = poseIndex;
  $("thumbMeter").value = poseThumb;
  $("indexValue").textContent = Math.round(poseIndex * 100) + "%";
  $("thumbValue").textContent = Math.round(poseThumb * 100) + "%";
  $("poseValues").textContent =
    "Index: " +
    [1, 2, 3].map((k) => angles["Index" + k][0].toFixed(1) + "°").join(" / ");
  return angles;
}
function sound() {
  if (!$("sound").checked || !audio) return;
  const now = audio.currentTime,
    osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.13);
}
function updateScore() {
  $("score").textContent = `${shots} shots · ${hits} hits`;
  $("accuracy").textContent =
    `Accuracy ${shots ? Math.round((hits / shots) * 100) + "%" : "—"} · ${targets.filter((t) => t.hits).length} / 5 targets hit`;
  for (const t of targets) {
    const row = $("target-" + t.id);
    row.textContent = `#${t.id} · ${t.distance} m — ${t.hits} ${t.hits === 1 ? "hit" : "hits"}`;
    row.classList.toggle("hit", t.hits > 0);
  }
}
function resetScore() {
  shots = hits = 0;
  for (const t of targets) {
    t.hits = 0;
    t.hitAt = -Infinity;
  }
  $("shotFeedback").textContent = "";
  updateScore();
}
function barrelRay() {
  grip.gun.updateWorldMatrix(true, true);
  return new T.Raycaster(
    grip.gun.localToWorld(grip.muzzle.clone()),
    new T.Vector3(0, 0, -1).transformDirection(grip.gun.matrixWorld),
    0.001,
    25,
  );
}
function shoot(time) {
  if (time - lastShot < 120) return;
  shots++;
  lastShot = time;
  const ray = barrelRay(),
    from = ray.ray.origin,
    direction = ray.ray.direction;
  scene.updateMatrixWorld(true);
  const result = ray.intersectObjects(targetSurfaces, false)[0];
  const end = result?.point || from.clone().addScaledVector(direction, 20);
  const feedback = $("shotFeedback");
  if (result) {
    hits++;
    const target = result.object.userData.target;
    target.hitAt = time;
    target.hits++;
    feedback.textContent = `HIT · #${target.id} · ${target.distance} m`;
  } else feedback.textContent = "MISS · adjust your aim";
  feedback.classList.toggle("hit", !!result);
  feedback.classList.add("active");
  tracer.geometry.setFromPoints([from, end]);
  tracer.visible = true;
  flash.position.copy(from);
  flash.intensity = 1.5;
  sound();
  updateScore();
}
function inspect(view = "side") {
  stop();
  mode = "inspect";
  $("crosshair").hidden = true;
  room.visible = false;
  grip.hand.visible = true;
  grip.assembly.add(grip.gun);
  grip.configure(profile);
  grip.assembly.position.set(0, 0, 0);
  grip.assembly.quaternion.identity();
  orbit.enabled = true;
  orbit.target.set(0, 0.05, -0.04);
  camera.up.set(0, 1, 0);
  camera.position.fromArray(
    {
      side: [-0.3, 0.15, 0.3],
      front: [0.3, 0.15, 0.3],
      back: [0, 0.13, -0.65],
    }[view],
  );
  camera.lookAt(orbit.target);
  orbit.update();
  pose(+$("index").value, +$("thumb").value);
  $("state").textContent = "GRIP / LIMIT INSPECTION";
  notice(
    "Your saved placement. Move the sliders to inspect the index and thumb stops.",
  );
}
function cameraView() {
  mode = "camera";
  $("crosshair").hidden = false;
  room.visible = true;
  orbit.enabled = false;
  camera.position.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, -1);
  grip.resetView();
  grip.hand.visible = false;
  parkGun();
}
function parkGun() {
  parked.add(grip.gun);
  const p = profile.gun;
  grip.gun.position.fromArray(p.position).multiplyScalar(0.001);
  grip.gun.rotation.set(...p.rotation.map((v) => (v * Math.PI) / 180));
  grip.gun.scale.setScalar(p.scale);
  table.visible = true;
}
function attachGun() {
  grip.assembly.add(grip.gun);
  const p = profile.gun;
  grip.gun.position.fromArray(p.position).multiplyScalar(0.001);
  grip.gun.rotation.set(...p.rotation.map((v) => (v * Math.PI) / 180));
  grip.gun.scale.setScalar(p.scale);
  table.visible = false;
  grip.neutral = null;
}
function drawPreview(frame, lm) {
  const c = $("preview");
  c.height = Math.round((c.width * frame.height) / frame.width);
  const ctx = c.getContext("2d");
  ctx.save();
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  if (frame.landmarksOnly) {
    ctx.fillStyle = "#0b151d";
    ctx.fillRect(0, 0, c.width, c.height);
  } else ctx.drawImage(frame, 0, 0, c.width, c.height);
  ctx.restore();
  if (!lm) return;
  for (let f = 0; f < 5; f++) {
    ctx.strokeStyle = f === 0 ? "#ffd49b" : f === 1 ? "#b7f5d4" : "#8ba9ba";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [k, i] of [
      0,
      ...[1, 2, 3, 4].map((k) => 1 + f * 4 + k - 1),
    ].entries()) {
      const p = lm[i],
        x = (1 - p.x) * c.width,
        y = p.y * c.height;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}
function accept(data, frame) {
  if (data.task !== "hands" || mode !== "camera") return;
  const now = performance.now(),
    selection = $("selection").value;
  const candidates = (data.handedness || [])
    .map((h, i) => ({ label: h[0]?.categoryName, score: h[0]?.score, i }))
    .filter(
      (h) => h.score >= 0.6 && (selection === "auto" || h.label === selection),
    );
  const one =
    data.landmarks?.length === 1 && candidates.length === 1
      ? candidates[0]
      : null;
  const lm = one ? data.landmarks[one.i] : null,
    world = one ? data.worldLandmarks[one.i] : null;
  drawPreview(frame, lm);
  if (controller.held && one && currentLabel && one.label !== currentLabel) {
    controller.lose();
    notice("Show the same hand that picked up the gun.");
    return;
  }
  const result = controller.update(world, now, profile, one?.label);
  if (!result.valid) {
    $("tracking").textContent = "Show one clear hand. Shooting paused.";
    $("state").textContent = controller.held
      ? "HELD / TRACKING LOST"
      : "SHOW ONE HAND";
    return;
  }
  const dt = lastResult ? Math.min(0.1, (now - lastResult) / 1000) : 0;
  lastResult = now;
  grip.hand.visible = true;
  if (result.picked) {
    currentLabel = one.label;
    attachGun();
    notice("Gun held. Straighten the index once, then bend to shoot.");
  }
  if (result.dropped) {
    currentLabel = null;
    parkGun();
    notice("Gun returned. Close the three lower fingers to pick up again.");
  }
  grip.track(lm, world, frame.width / frame.height, dt, {
    followRotation: $("rotation").checked,
    gain: +$("gain").value,
  });
  if (result.held) {
    pose(result.index, result.thumb);
    if (result.fired) shoot(now);
    $("state").textContent = result.armed
      ? "HELD / READY"
      : result.pressed
        ? "HELD / PRESSED"
        : "HELD / RELEASE INDEX";
  } else {
    const a = pose(0, result.thumb);
    for (const f of ["Middle", "Ring", "Pinky"])
      for (let k = 1; k <= 3; k++)
        a[f + k][0] =
          profile.angles[f + k][0] *
          T.MathUtils.clamp(
            (result.observation.lower[["Middle", "Ring", "Pinky"].indexOf(f)] -
              15) /
              65,
            0,
            1,
          );
    grip.pose(a);
    $("state").textContent = "CLOSE THREE FINGERS TO PICK UP";
  }
  $("tracking").textContent =
    source +
    " · " +
    one.label +
    " hand · " +
    Math.round(data.inferenceMs || 0) +
    " ms inference · " +
    (result.held ? "grip locked" : "hand free");
}
function stop() {
  token++;
  session?.();
  session = null;
  closePhone?.();
  closePhone = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $("video").srcObject = null;
  $("preview").classList.remove("active");
  controller.reset();
  lastResult = 0;
  currentLabel = null;
  $("start").disabled = !grip;
  $("phone").disabled = !grip;
  $("stop").disabled = true;
  $("tracking").textContent = "Camera off";
  if (mode === "camera") {
    parkGun();
    grip.hand.visible = false;
    $("state").textContent = "CAMERA OFF";
    notice("Camera stopped. Connect to pick up the gun.");
  }
}
$("start").onclick = async () => {
  stop();
  source = "PC camera";
  const epoch = token;
  $("start").disabled = true;
  $("stop").disabled = false;
  notice("Opening camera…");
  try {
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      await audio.resume();
    } catch {
      // Audio is optional; camera tracking must still work without it.
      audio = null;
      $("sound").checked = false;
    }
    const id = $("camera").value,
      s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(id ? { deviceId: { exact: id } } : {}),
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      });
    if (epoch !== token) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = s;
    $("video").srcObject = s;
    await $("video").play();
    if (epoch !== token) return;
    cameraView();
    $("preview").classList.add("active");
    session = startTracking(
      $("video"),
      (d, f) => {
        if (epoch === token) accept(d, f);
      },
      (stats) => {
        if (epoch === token && stats.errors?.hands)
          notice("Tracker: " + stats.errors.hands);
      },
      () => ({
        handRate: 30,
        faceRate: 0,
        shoulderRate: 0,
        trackingWidth: 480,
        uncappedTracking: false,
      }),
    );
    notice("Show one hand. Close the three lower fingers to pick up.");
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (epoch !== token) return;
    const selected = $("camera").value;
    $("camera").replaceChildren(new Option("Default camera", ""));
    for (const d of devices.filter((d) => d.kind === "videoinput"))
      $("camera").add(new Option(d.label || "Camera", d.deviceId));
    $("camera").value = selected;
  } catch (e) {
    if (epoch === token) {
      stop();
      notice("Camera could not start: " + e.message);
    }
  }
};
$("phone").onclick = () => {
  stop();
  const epoch = token;
  source = "Phone · landmarks only";
  cameraView();
  $("stop").disabled = false;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume().catch(() => {});
  } catch {
    audio = null;
  }
  try {
    closePhone = receivePhone(
      (data, size) => {
        if (epoch !== token) return;
        $("preview").classList.add("active");
        accept(
          { ...data, task: "hands" },
          { width: size.w, height: size.h, landmarksOnly: true },
        );
      },
      (status) => {
        if (epoch === token) {
          $("tracking").textContent = status;
          notice(status);
        }
      },
      (reason) => {
        if (epoch === token) {
          stop();
          notice(reason);
        }
      },
      () => {},
      () => ({
        ...defaults,
        handRate: 30,
        faceRate: 0,
        shoulderRate: 0,
        fullBody: false,
        trackingWidth: 480,
        cameraFps: 30,
      }),
      (stats) => {
        if (epoch === token && stats.errors?.hands)
          notice("Phone tracker: " + stats.errors.hands);
      },
    );
  } catch (e) {
    stop();
    notice("Phone pairing could not start: " + e.message);
  }
};
$("resetScore").onclick = resetScore;
$("rangeView").onclick = () => {
  if (!grip) return;
  if (mode !== "camera") cameraView();
  notice(
    "Five targets at 2–10 m. Connect a camera, close three fingers to pick up, then aim and bend your index.",
  );
};
updateScore();
$("stop").onclick = stop;
$("selection").onchange = () => {
  controller.reset();
  currentLabel = null;
  if (mode === "camera") parkGun();
};
$("camera").onchange = stop;
$("center").onclick = () => {
  grip.neutral = null;
  notice("Current palm rotation centered. Relative grip is unchanged.");
};
$("inspect").onclick = () => inspect();
for (const b of document.querySelectorAll("[data-view]"))
  b.onclick = () => inspect(b.dataset.view);
for (const id of ["index", "thumb"])
  $(id).oninput = () => {
    if (mode !== "inspect") inspect();
    pose(+$("index").value, +$("thumb").value);
  };
$("ghost").onchange = () => gunMaterials(grip.model, $("ghost").checked);
for (const endpoint of ["raised", "wrapped"]) {
  $("thumb-" + endpoint).onclick = () => {
    try {
      const ready = controller.calibrateThumb(endpoint, performance.now());
      $("thumbCalibration").textContent = ready
        ? "Thumb calibrated. Raised = 0%, wrapped = 100%."
        : `Saved ${endpoint} thumb. Capture the other pose next.`;
    } catch (e) {
      $("thumbCalibration").textContent = e.message;
    }
  };
}
$("thumb-default").onclick = () => {
  controller.thumbCalibration = {};
  $("thumbCalibration").textContent = "Default thumb tracking restored.";
};
$("reset").onclick = () => {
  profile = structuredClone(provided);
  inspect();
  notice(
    "Your supplied JSON 2 release and JSON 4 pressed/thumb limits restored.",
  );
};
$("editor").onclick = () => {
  try {
    localStorage.setItem("gun-grip-lab-v2", JSON.stringify(profile));
    sessionStorage.setItem(
      "gun-grip-camera-profile-v2",
      JSON.stringify(profile),
    );
    location.href = "./?v=2";
  } catch (e) {
    notice("Could not open preset in editor: " + e.message);
  }
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});
window.addEventListener("pagehide", stop);
function resize() {
  const { width, height } = $("scene").getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = T.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(Math.PI / 8) / Math.min(1, camera.aspect)),
  );
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($("scene"));
try {
  provided = await loadProvidedProfile();
  profile = structuredClone(provided);
  try {
    const selected = sessionStorage.getItem("gun-grip-camera-profile-v2");
    if (selected) profile = validateProfile(JSON.parse(selected));
  } catch {}
  grip = await new GripRig(scene, profile).ready;
  $("profileName").textContent = profile.name + " · fixed relative placement";
  $("limits").textContent =
    "Lower three fingers fixed. Index maximum: " +
    [1, 2, 3]
      .map(
        (k) =>
          (profile.indexPressed?.["Index" + k]?.[0] ??
            profile.angles["Middle" + k][0]) + "°",
      )
      .join(" / ") +
    ". Thumb stays between your two supplied poses.";
  cameraView();
  $("state").textContent = "CONNECT A CAMERA TO BEGIN";
  notice(
    "Five targets at 2–10 m. Connect your phone via QR or use the PC camera.",
  );
  resize();
  $("start").disabled = false;
  $("phone").disabled = false;
  renderer.setAnimationLoop((now) => {
    if (mode === "camera" && lastResult && now - lastResult > 250) {
      controller.lose();
      lastResult = 0;
      $("state").textContent = controller.held
        ? "HELD / TRACKING LOST"
        : "SHOW ONE HAND";
      $("tracking").textContent =
        "Tracking paused. Release index to rearm when your hand returns.";
    }
    if (now - lastShot > 70) {
      tracer.visible = false;
      flash.intensity = 0;
    }
    for (const t of targets)
      t.group.scale.setScalar(now - t.hitAt < 180 ? 1.07 : 1);
    $("shotFeedback").classList.toggle("active", now - lastShot < 1200);
    $("aim").hidden = mode !== "camera" || !controller.held || !lastResult;
    if (!$("aim").hidden) {
      scene.updateMatrixWorld(true);
      const ray = barrelRay(),
        hit = ray.intersectObjects(targetSurfaces, false)[0];
      const point = (hit?.point || ray.ray.at(12, new T.Vector3()))
        .clone()
        .project(camera);
      $("aim").hidden =
        point.z < -1 ||
        point.z > 1 ||
        Math.abs(point.x) > 1 ||
        Math.abs(point.y) > 1;
      $("aim").style.left = (point.x + 1) * 50 + "%";
      $("aim").style.top = (1 - point.y) * 50 + "%";
      $("aim").classList.toggle("onTarget", !!hit);
    }
    if (orbit.enabled) orbit.update();
    renderer.render(scene, camera);
  });
  if (new URLSearchParams(location.search).get("verify") === "1") {
    const { verifyRange } = await import("./range-check.mjs?v=3");
    await verifyRange({
      accept,
      begin: cameraView,
      snapshot: () => ({
        held: controller.held,
        shots,
        hits,
        distances: targets.map((t) => t.distance),
      }),
      resetScore,
      checkTargetRays: () => {
        scene.updateMatrixWorld(true);
        return targets.map((t) => {
          const ray = new T.Raycaster(
            new T.Vector3(),
            t.group.position.clone().normalize(),
            0.001,
            25,
          );
          return (
            ray.intersectObjects(targetSurfaces, false)[0]?.object.userData
              .target.id === t.id
          );
        });
      },
    });
  }
} catch (e) {
  notice("Could not load camera range: " + e.message);
}
