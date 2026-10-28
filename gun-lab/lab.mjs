import { loadProvidedProfile } from "./presets.mjs?v=2";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { DollRig } from "../doll/DollRig.js?v=hand-lab-1";
import { startTracking } from "../hand-touch-calibration/tracking-session.mjs?v=touch2.4.9";
import { FINGERS, JOINTS, defaults, validateProfile } from "./profile.mjs?v=2";
import { TriggerTracker } from "./trigger.mjs";
import { jointAxes } from "./joint-axes.mjs?v=2";
import { gunMaterials } from "./gun-materials.mjs?v=4";

const $ = (id) => document.getElementById(id),
  RAD = Math.PI / 180,
  KEY = "gun-grip-lab-v2";
let suppliedGrip = null;
let state = defaults(),
  target = "hand",
  finger = "Index",
  joint = 1,
  stream = null,
  session = null,
  epoch = 0,
  presses = 0,
  liveOffset = [0, 0, 0],
  lastBends = null;
const tracker = new TriggerTracker(),
  notice = (message) => ($("notice").textContent = message);
const scene = new T.Scene();
scene.background = new T.Color("#18252d");
const camera = new T.PerspectiveCamera(38, 1, 0.005, 20);
const renderer = new T.WebGLRenderer({ canvas: $("scene"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.minDistance = 0.12;
orbit.maxDistance = 2;
scene.add(new T.HemisphereLight(0xe6f5ff, 0x4c645e, 2.4));
for (const [pos, intensity, color] of [
  [[0.4, 0.7, 0.6], 3, 0xffecd9],
  [[-0.5, 0.3, -0.4], 2, 0x9dbedb],
]) {
  const light = new T.DirectionalLight(color, intensity);
  light.position.fromArray(pos);
  scene.add(light);
}
const grid = new T.GridHelper(1.5, 30, 0x3b5963, 0x273d47);
grid.position.y = -0.11;
scene.add(grid);
const handGroup = new T.Group(),
  gunGroup = new T.Group();
scene.add(handGroup, gunGroup);
const handles = new TransformControls(camera, renderer.domElement);
handles.setSize(0.8);
scene.add(handles.getHelper());
const handleLabel = document.createElement("label");
handleLabel.className = "check";
handleLabel.innerHTML =
  '<input type="checkbox" id="handles"> Drag with 3D handles';
$("moveTogether").closest("label").before(handleLabel);
const handleMode = document.createElement("label");
handleMode.innerHTML =
  'Handle mode<select id="handleMode"><option value="translate">Move</option><option value="rotate">Rotate</option></select>';
handleLabel.after(handleMode);
function updateHandles() {
  handles.detach();
  if ($("handles").checked)
    handles.attach(target === "hand" ? handGroup : gunGroup);
  handles.setMode($("handleMode").value);
}
$("handles").onchange = updateHandles;
$("handleMode").onchange = updateHandles;
let dragRelative = null;
handles.addEventListener("dragging-changed", (e) => {
  orbit.enabled = !e.value;
  if (e.value && target === "hand" && $("moveTogether").checked) {
    handGroup.updateWorldMatrix(true, false);
    gunGroup.updateWorldMatrix(true, false);
    dragRelative = handGroup.matrixWorld
      .clone()
      .invert()
      .multiply(gunGroup.matrixWorld);
  } else dragRelative = null;
});
function groupTransform(group) {
  return {
    position: group.position.toArray().map((v) => v * 1000),
    rotation: [group.rotation.x, group.rotation.y, group.rotation.z].map(
      (v) => T.MathUtils.euclideanModulo(v / RAD + 180, 360) - 180,
    ),
    scale: group.scale.x,
  };
}
handles.addEventListener("objectChange", () => {
  const candidate = structuredClone(state),
    group = target === "hand" ? handGroup : gunGroup;
  candidate[target] = groupTransform(group);
  if (dragRelative) {
    handGroup.updateMatrix();
    const m = handGroup.matrix.clone().multiply(dragRelative),
      p = new T.Vector3(),
      q = new T.Quaternion(),
      s = new T.Vector3();
    m.decompose(p, q, s);
    const temp = new T.Group();
    temp.position.copy(p);
    temp.quaternion.copy(q);
    temp.scale.copy(s);
    candidate.gun = groupTransform(temp);
  }
  try {
    state = validateProfile(candidate);
    renderTransforms();
    apply();
  } catch (e) {
    notice(e.message);
    apply();
  }
});
const rig = new DollRig(handGroup, {
  url: new URL("../doll.glb?v=hand-lab-1", import.meta.url).href,
  report: new URL("../doll-report.json?v=hand-lab-1", import.meta.url).href,
  headLayer: false,
});
let gun, triggerMesh, triggerRest;
const bases = {},
  palmRotations = {},
  restMatrices = new Map(),
  markers = new Map();
const markerGroup = new T.Group();
scene.add(markerGroup);
function basis(n, S = state.side) {
  const key = S + n;
  if (bases[key]) return bases[key];
  const r = rig.rest,
    k = +n.slice(-1),
    f = n.slice(0, -1),
    here = r[key].world,
    z = (
      k < 3
        ? r[S + f + (k + 1)].world.clone().sub(here)
        : here.clone().sub(r[S + f + (k - 1)].world)
    ).normalize(),
    x = r[S + "Index1"].world.clone().sub(r[S + "Pinky1"].world);
  x.addScaledVector(z, -x.dot(z)).normalize();
  const y = new T.Vector3().crossVectors(z, x).normalize();
  return (bases[key] = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(x, y, z),
  ));
}
function palmRotation(S) {
  if (palmRotations[S]) return palmRotations[S];
  const r = rig.rest,
    z = r[S + "Middle1"].world
      .clone()
      .sub(r[S + "Hand"].world)
      .normalize(),
    x = r[S + "Index1"].world.clone().sub(r[S + "Pinky1"].world);
  x.addScaledVector(z, -x.dot(z)).normalize();
  const y = new T.Vector3().crossVectors(z, x).normalize();
  const rest = new T.Matrix4().makeBasis(x, y, z),
    world = new T.Matrix4().makeBasis(
      new T.Vector3(0, 1, 0),
      new T.Vector3(-1, 0, 0),
      new T.Vector3(0, 0, 1),
    );
  return (palmRotations[S] = new T.Quaternion().setFromRotationMatrix(
    world.multiply(rest.invert()),
  ));
}
function freshPose() {
  if (suppliedGrip) return structuredClone(suppliedGrip);
  const p = defaults();
  if (!rig.loaded) return p;
  const S = p.side,
    q = basis("Thumb1", S),
    direction = new T.Vector3(0, 1, 0)
      .applyQuaternion(palmRotation(S).clone().invert())
      .applyQuaternion(q.clone().invert());
  p.angles.Thumb1 = [
    Math.atan2(-direction.y, direction.z) / RAD,
    Math.asin(T.MathUtils.clamp(direction.x, -1, 1)) / RAD,
    0,
  ].map((v) => Math.round(v * 10) / 10);
  return p;
}
function setTransform(group, data) {
  group.position.fromArray(data.position).multiplyScalar(0.001);
  group.rotation.set(...data.rotation.map((v) => v * RAD));
  group.scale.setScalar(data.scale);
}
function apply() {
  if (!rig.loaded || !gun) return;
  setTransform(handGroup, state.hand);
  setTransform(gunGroup, state.gun);
  const S = state.side,
    palm = rig.joints[S + "Hand"];
  rig.root.position.copy(rig.rest[S + "Hand"].world).negate();
  palm.quaternion.copy(palmRotation(S));
  for (const m of rig.parts)
    m.visible =
      m.name.startsWith(S) &&
      /^[RL](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name);
  for (const n of JOINTS) {
    const qb = basis(n),
      v = [...state.angles[n]];
    if (n.startsWith("Index"))
      v[0] = T.MathUtils.clamp(v[0] + liveOffset[+n.slice(-1) - 1], -180, 180);
    rig.joints[S + n].quaternion
      .copy(qb)
      .multiply(
        new T.Quaternion().setFromEuler(
          new T.Euler(...v.map((x) => x * RAD), "XYZ"),
        ),
      )
      .multiply(qb.clone().invert());
    const axis = new T.Vector3(0, 0, 1).applyQuaternion(qb),
      rot = new T.Matrix4().makeRotationFromQuaternion(
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), axis),
      ),
      shape = rot
        .clone()
        .multiply(
          new T.Matrix4().makeScale(state.thickness, state.thickness, 1),
        )
        .multiply(rot.clone().invert());
    for (const m of rig.parts)
      if (m.parent === rig.joints[S + n]) {
        m.matrixAutoUpdate = false;
        m.matrix.copy(shape).multiply(restMatrices.get(m));
        m.matrixWorldNeedsUpdate = true;
      }
  }
  gunGroup.visible = $("showGun").checked;
  gunMaterials(gun, $("ghostGun").checked);
  if (triggerMesh)
    triggerMesh.quaternion
      .copy(triggerRest)
      .multiply(
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(1, 0, 0),
          -0.25 * tracker.value,
        ),
      );
  scene.updateMatrixWorld(true);
  markerGroup.visible = $("showJoints").checked;
  for (const [n, m] of markers) {
    rig.joints[S + n].getWorldPosition(m.position);
    m.material.color.set(n === finger + joint ? 0xffc975 : 0xa4e4ca);
  }
  grid.visible = $("showGrid").checked;
}
function slider(container, title, value, min, max, step, onChange, unit = "") {
  const label = document.createElement("label");
  label.className = "control-label";
  const head = document.createElement("span");
  head.className = "control-head";
  const text = document.createElement("span");
  text.textContent = title + (unit ? " · " + unit : "");
  const number = document.createElement("input");
  number.type = "number";
  number.setAttribute("aria-label", title + " value");
  Object.assign(number, { min, max, step, value: Number(value.toFixed(3)) });
  const range = document.createElement("input");
  range.type = "range";
  range.setAttribute("aria-label", title);
  Object.assign(range, { min, max, step, value });
  head.append(text, number);
  label.append(head, range);
  container.append(label);
  const change = (source) => {
    const v = Number(source.value);
    if (source.value === "" || !Number.isFinite(v) || v < min || v > max) {
      source.value = value;
      return;
    }
    try {
      onChange(v);
      value = v;
      number.value = range.value = v;
      apply();
    } catch (e) {
      source.value = value;
      notice(e.message);
    }
  };
  range.oninput = () => change(range);
  number.oninput = () => {
    if (
      number.value !== "" &&
      Number.isFinite(Number(number.value)) &&
      Number(number.value) >= min &&
      Number(number.value) <= max
    )
      change(number);
  };
  number.onchange = () => change(number);
}
function heading(container, text) {
  const h = document.createElement("div");
  h.className = "group-label";
  h.textContent = text;
  container.append(h);
}
function transformChange(key, axis, value) {
  if (target === "hand" && $("moveTogether").checked) {
    handGroup.updateWorldMatrix(true, false);
    gunGroup.updateWorldMatrix(true, false);
    const relative = handGroup.matrixWorld
        .clone()
        .invert()
        .multiply(gunGroup.matrixWorld),
      next = structuredClone(state.hand);
    if (key === "scale") next.scale = value;
    else next[key][axis] = value;
    const group = new T.Group();
    setTransform(group, next);
    group.updateMatrix();
    const matrix = group.matrix.clone().multiply(relative),
      p = new T.Vector3(),
      q = new T.Quaternion(),
      s = new T.Vector3();
    matrix.decompose(p, q, s);
    const e = new T.Euler().setFromQuaternion(q, "XYZ"),
      candidate = structuredClone(state);
    candidate.gun = {
      position: p.multiplyScalar(1000).toArray(),
      rotation: [e.x, e.y, e.z].map((v) => v / RAD),
      scale: s.x,
    };
    if (key === "position") {
      candidate.gun.rotation = [...state.gun.rotation];
      candidate.gun.scale = state.gun.scale;
    }
    candidate.hand = next;
    state = validateProfile(candidate);
  } else if (key === "scale") state[target].scale = value;
  else state[target][key][axis] = value;
}
function renderTransforms() {
  $("transforms").replaceChildren();
  for (const key of ["position", "rotation"]) {
    heading(
      $("transforms"),
      key === "position" ? "POSITION / mm" : "ROTATION / degrees",
    );
    ["X", "Y", "Z"].forEach((axis, i) =>
      slider(
        $("transforms"),
        target + " " + key + " " + axis,
        state[target][key][i],
        key === "position" ? -500 : -180,
        key === "position" ? 500 : 180,
        key === "position" ? 1 : 1,
        (v) => transformChange(key, i, v),
      ),
    );
  }
  slider(
    $("transforms"),
    target + " scale",
    state[target].scale,
    0.25,
    2,
    0.01,
    (v) => transformChange("scale", 0, v),
    "×",
  );
  for (const t of ["hand", "gun"])
    $("edit" + (t === "hand" ? "Hand" : "Gun")).setAttribute(
      "aria-pressed",
      String(target === t),
    );
}
function renderFingers() {
  $("fingers").replaceChildren();
  for (const f of FINGERS) {
    const b = document.createElement("button");
    b.textContent = f;
    b.setAttribute("aria-pressed", String(f === finger));
    b.onclick = () => {
      finger = f;
      renderFingers();
      apply();
    };
    $("fingers").append(b);
  }
  $("joints").replaceChildren();
  (finger === "Thumb" ? ["CMC", "MCP", "IP"] : ["MCP", "PIP", "DIP"]).forEach(
    (name, i) => {
      const b = document.createElement("button");
      b.textContent = name;
      b.setAttribute("aria-pressed", String(joint === i + 1));
      b.onclick = () => {
        joint = i + 1;
        renderFingers();
        apply();
      };
      $("joints").append(b);
    },
  );
  const n = finger + joint;
  $("jointTitle").textContent =
    finger +
    " · " +
    (finger === "Thumb" ? ["CMC", "MCP", "IP"] : ["MCP", "PIP", "DIP"])[
      joint - 1
    ];
  $("angles").replaceChildren();
  jointAxes(n).forEach(({ name, axis, sign }) =>
    slider(
      $("angles"),
      name,
      state.angles[n][axis] * sign,
      -180,
      180,
      1,
      (v) => (state.angles[n][axis] = v * sign),
      "°",
    ),
  );
}
function renderTrigger() {
  $("triggerControls").replaceChildren();
  for (const [key, title, min, max, step, unit] of [
    ["released", "Released index bend", 0, 150, 1, "°"],
    ["pressed", "Pressed index bend", 10, 160, 1, "°"],
    ["on", "Press threshold", 0.05, 1, 0.05, ""],
    ["off", "Release threshold", 0, 0.95, 0.05, ""],
    ["smoothing", "Tracking smoothing", 0, 200, 5, "ms"],
    ["gain", "Index bend gain", 0, 2, 0.05, "×"],
  ])
    slider(
      $("triggerControls"),
      title,
      state.trigger[key],
      min,
      max,
      step,
      (v) => {
        const candidate = structuredClone(state);
        candidate.trigger[key] = v;
        state = validateProfile(candidate);
        tracker.reset();
        liveOffset = [0, 0, 0];
      },
      unit,
    );
}
function renderAll() {
  $("side").value = state.side;
  $("presetName").value = state.name;
  renderTransforms();
  renderFingers();
  renderTrigger();
  $("appearance").replaceChildren();
  slider(
    $("appearance"),
    "Finger thickness",
    state.thickness,
    0.5,
    2,
    0.05,
    (v) => (state.thickness = v),
    "×",
  );
  apply();
}
function view(name) {
  const center = new T.Vector3()
    .fromArray(state.gun.position)
    .multiplyScalar(0.001)
    .add(new T.Vector3(0, 0.06, 0));
  orbit.target.copy(center);
  camera.up.set(0, 1, 0);
  const positions = {
    perspective: [-0.35, 0.2, 0.4],
    front: [0, 0.06, 0.65],
    side: [0.65, 0.06, 0],
    top: [0, 0.72, 0],
    first: [0.08, 0.19, -0.65],
  };
  camera.position
    .fromArray(positions[name])
    .add(new T.Vector3().fromArray(state.gun.position).multiplyScalar(0.001));
  if (name === "top") camera.up.set(0, 0, -1);
  camera.lookAt(center);
  orbit.update();
  document
    .querySelectorAll("[data-view]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.view === name)),
    );
}
function resize() {
  const { width, height } = $("scene").getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($("scene"));
function readProfile() {
  state.name = $("presetName").value.trim() || "My gun grip";
  return validateProfile(state);
}
function importText(text) {
  const incoming = validateProfile(JSON.parse(text));
  stopCamera();
  state = incoming;
  renderAll();
  notice("Preset imported. Save it in this browser to keep it.");
}
function download(text) {
  const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "gun-grip.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$("editHand").onclick = () => {
  target = "hand";
  renderTransforms();
  updateHandles();
};
$("editGun").onclick = () => {
  target = "gun";
  renderTransforms();
  updateHandles();
};
$("side").onchange = () => {
  stopCamera();
  state.side = $("side").value;
  state.hand.position[0] *= -1;
  apply();
  renderTransforms();
};
for (const id of ["showGun", "ghostGun", "showJoints", "showGrid"])
  $(id).onchange = apply;
$("resetPlacement").onclick = () => {
  state[target] = freshPose()[target];
  renderTransforms();
  apply();
};
$("initial").onclick = () => {
  stopCamera();
  state = freshPose();
  renderAll();
  view("perspective");
  notice("Initial pointing pose restored.");
};
$("resetJoint").onclick = () => {
  state.angles[finger + joint] = freshPose().angles[finger + joint];
  renderFingers();
  apply();
};
$("straighten").onclick = () => {
  for (let k = 1; k <= 3; k++)
    state.angles[finger + k] =
      finger === "Thumb" && state.thumbOpen
        ? [...state.thumbOpen["Thumb" + k]]
        : [0, 0, 0];
  renderFingers();
  apply();
};
$("curl").onclick = () => {
  for (let k = 1; k <= 3; k++)
    state.angles[finger + k] =
      finger === "Thumb"
        ? [...suppliedGrip.angles["Thumb" + k]]
        : finger === "Index" && state.indexPressed
          ? [...state.indexPressed["Index" + k]]
          : [k === 1 ? 65 : k === 2 ? 90 : 75, 0, 0];
  renderFingers();
  apply();
};
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => view(b.dataset.view)));
$("save").onclick = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(readProfile()));
    $("saveStatus").textContent = "Saved “" + state.name + "” in this browser.";
    notice(
      "Grip saved, including hand, gun, every joint and trigger calibration.",
    );
  } catch (e) {
    notice("Could not save: " + e.message + " Export JSON to keep your work.");
  }
};
$("load").onclick = () => {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) throw Error("No saved grip in this browser yet.");
    importText(text);
    notice("Saved grip loaded.");
  } catch (e) {
    notice(e.message);
  }
};
$("export").onclick = () => {
  try {
    const text = JSON.stringify(readProfile(), null, 2);
    $("json").value = text;
    download(text);
    notice("Exported grip JSON.");
  } catch (e) {
    notice(e.message);
  }
};
$("import").onclick = () => {
  try {
    importText($("json").value);
  } catch (e) {
    notice("Import rejected: " + e.message);
  }
};
function trackingUI(result) {
  $("triggerMeter").value = result.value;
  $("pullValue").textContent = Math.round(result.value * 100) + "%";
  $("triggerState").textContent =
    "TRIGGER / " +
    (!result.valid
      ? "NO HAND"
      : result.pressed
        ? "PRESSED"
        : tracker.armed
          ? "READY"
          : "RELEASE TO ARM");
  $("pressCount").textContent = presses + " presses";
  for (const id of ["captureReleased", "capturePressed"])
    $(id).disabled = !result.valid;
}
function acceptTracking(data, frame) {
  if (data.task !== "hands") return;
  const label = $("trackingHand").value,
    matches = (data.handedness || [])
      .map((h, i) => ({ h: h[0], i }))
      .filter(({ h }) => h?.categoryName === label && h.score >= 0.6),
    i = matches.length === 1 ? matches[0].i : -1,
    lm = data.landmarks?.[i],
    world = data.worldLandmarks?.[i],
    now = performance.now(),
    result = tracker.update(world, now, state.trigger);
  lastBends = result.valid ? result.bends : null;
  const c = $("preview"),
    ctx = c.getContext("2d");
  c.height = Math.round((c.width * frame.height) / frame.width);
  ctx.save();
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(frame, 0, 0, c.width, c.height);
  ctx.restore();
  if (lm) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#a4efc5";
    ctx.beginPath();
    for (let k = 5; k <= 8; k++) {
      const p = lm[k];
      if (k === 5) ctx.moveTo((1 - p.x) * c.width, p.y * c.height);
      else ctx.lineTo((1 - p.x) * c.width, p.y * c.height);
    }
    ctx.stroke();
  }
  liveOffset = result.valid
    ? [
        0,
        Math.max(0, result.renderedBends[1] - state.trigger.released) *
          state.trigger.gain,
        Math.max(0, result.renderedBends[2]) * state.trigger.gain,
      ]
    : [0, 0, 0];
  if (result.fired) presses++;
  trackingUI(result);
  apply();
  $("trackingStatus").textContent = result.valid
    ? "Index PIP " +
      result.bends[1].toFixed(1) +
      "° · " +
      Math.round(data.inferenceMs || 0) +
      " ms inference"
    : "No single confident " +
      label +
      " hand. Try the other label or show one hand clearly.";
}
function stopCamera() {
  epoch++;
  session?.();
  session = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $("video").srcObject = null;
  tracker.reset();
  lastBends = null;
  liveOffset = [0, 0, 0];
  $("start").disabled = false;
  $("stop").disabled = true;
  $("preview").classList.remove("active");
  $("trackingStatus").textContent = "Camera off. No animation is playing.";
  $("mode").textContent = "POSE EDITOR";
  trackingUI({ valid: false, value: 0 });
  $("triggerState").textContent = "TRIGGER / OFF";
  apply();
}
$("start").onclick = async () => {
  stopCamera();
  const token = epoch;
  $("start").disabled = true;
  $("stop").disabled = false;
  notice("Opening camera for index tracking…");
  try {
    const opened = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
    });
    if (token !== epoch) {
      opened.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = opened;
    $("video").srcObject = stream;
    await $("video").play();
    if (token !== epoch) return;
    $("preview").classList.add("active");
    session = startTracking(
      $("video"),
      (d, f) => {
        if (token === epoch) acceptTracking(d, f);
      },
      (stats) => {
        if (token !== epoch) return;
        if (stats.errors.hands) notice("Tracker: " + stats.errors.hands);
      },
      () => ({
        handRate: 30,
        faceRate: 0,
        shoulderRate: 0,
        trackingWidth: 480,
        uncappedTracking: false,
      }),
    );
    $("mode").textContent = "LIVE INDEX";
    notice(
      "Release your index once, then bend to press. The other fingers keep your edited grip.",
    );
  } catch (e) {
    if (token === epoch) {
      stopCamera();
      notice("Camera could not start: " + e.message);
    }
  }
};
$("stop").onclick = stopCamera;
$("trackingHand").onchange = () => {
  tracker.reset();
  lastBends = null;
  liveOffset = [0, 0, 0];
  trackingUI({ valid: false, value: 0 });
  apply();
};
for (const [id, key] of [
  ["captureReleased", "released"],
  ["capturePressed", "pressed"],
])
  $(id).onclick = () => {
    if (
      !lastBends ||
      tracker.last === null ||
      performance.now() - tracker.last > 250
    )
      return;
    try {
      const candidate = structuredClone(state);
      candidate.trigger[key] = Math.round(lastBends[1]);
      state = validateProfile(candidate);
      renderTrigger();
      tracker.reset();
      notice("Captured " + key + " index bend: " + state.trigger[key] + "°.");
    } catch (e) {
      notice(e.message);
    }
  };
$("clearCount").onclick = () => {
  presses = 0;
  $("pressCount").textContent = "0 presses";
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCamera();
});
window.addEventListener("pagehide", stopCamera);
const ray = new T.Raycaster(),
  pointer = new T.Vector2();
let down = null;
$("scene").addEventListener(
  "pointerdown",
  (e) => (down = [e.clientX, e.clientY]),
);
$("scene").addEventListener("pointerup", (e) => {
  if (
    !down ||
    !markerGroup.visible ||
    Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5
  )
    return;
  const r = $("scene").getBoundingClientRect();
  pointer.set(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    (-(e.clientY - r.top) / r.height) * 2 + 1,
  );
  ray.setFromCamera(pointer, camera);
  const hit = ray.intersectObjects([...markers.values()])[0];
  if (hit) {
    finger = hit.object.userData.joint.slice(0, -1);
    joint = +hit.object.userData.joint.slice(-1);
    renderFingers();
    apply();
  }
});
try {
  const [, gltf] = await Promise.all([
    rig.ready,
    new GLTFLoader().loadAsync(new URL("../gun.glb", import.meta.url).href),
  ]);
  gun = gltf.scene;
  gunGroup.add(gun);
  for (const name of ["Bullet_low", "Catridge_low"]) {
    const part = gun.getObjectByName(name);
    if (part) part.visible = false;
  }
  triggerMesh = gun.getObjectByName("Trigger_low");
  triggerRest = triggerMesh?.quaternion.clone();
  for (const m of rig.parts) restMatrices.set(m, m.matrix.clone());
  for (const n of JOINTS) {
    const marker = new T.Mesh(
      new T.SphereGeometry(0.0027, 12, 8),
      new T.MeshBasicMaterial({ color: 0xa4e4ca, depthTest: false }),
    );
    marker.userData.joint = n;
    marker.renderOrder = 100;
    markers.set(n, marker);
    markerGroup.add(marker);
  }
  suppliedGrip = await loadProvidedProfile();
  state = freshPose();
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) state = validateProfile(JSON.parse(saved));
  } catch {
    notice("Saved preset could not be read. Starting with the pointing pose.");
  }
  renderAll();
  resize();
  view("perspective");
  notice("Ready. Sweep hand loaded. Adjust placement and any finger joint.");
  renderer.setAnimationLoop((now) => {
    if (tracker.stale(now)) {
      lastBends = null;
      liveOffset = [0, 0, 0];
      trackingUI({ valid: false, value: 0 });
      $("trackingStatus").textContent =
        "Tracking lost. Release your index when the hand returns.";
      apply();
    }
    orbit.update();
    renderer.render(scene, camera);
  });
} catch (e) {
  notice("Models could not load: " + e.message + " Reload to retry.");
}

$("useCamera").onclick = () => {
  try {
    sessionStorage.setItem(
      "gun-grip-camera-profile-v2",
      JSON.stringify(readProfile()),
    );
    location.href = "play.html?v=4";
  } catch (e) {
    notice(e.message);
  }
};

// Camera pickup and held-finger limits are shared in the camera range.
$("start").onclick = $("useCamera").onclick;
$("stop").hidden = true;
$("captureReleased").parentElement.hidden = true;
$("trackingHand").closest("label").hidden = true;
$("trackingStatus").textContent =
  "Open the camera range with this edited grip.";
