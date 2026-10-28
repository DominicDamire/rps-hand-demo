import * as T from "three";
import { DollRig } from "../doll/DollRig.js?v=hand-lab-1";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { JOINTS } from "./profile.mjs?v=2";
import { gunMaterials } from "./gun-materials.mjs?v=4";
export function frame(wrist, index, middle, pinky) {
  const z = middle.clone().sub(wrist).normalize(),
    x = index.clone().sub(pinky);
  x.addScaledVector(z, -x.dot(z)).normalize();
  return new T.Matrix4().makeBasis(
    x,
    new T.Vector3().crossVectors(z, x).normalize(),
    z,
  );
}
export class GripRig {
  constructor(scene, profile) {
    this.profile = profile;
    this.assembly = new T.Group();
    scene.add(this.assembly);
    this.hand = new T.Group();
    this.gun = new T.Group();
    this.assembly.add(this.hand, this.gun);
    this.rig = new DollRig(this.hand, {
      url: new URL("../doll.glb", import.meta.url).href,
      report: new URL("../doll-report.json", import.meta.url).href,
      headLayer: false,
    });
    this.bases = {};
    this.ready = this.load();
  }
  async load() {
    const [, g] = await Promise.all([
      this.rig.ready,
      new GLTFLoader().loadAsync(new URL("../gun.glb?v=user-export1", import.meta.url).href),
    ]);
    this.gun.add(g.scene);
    this.model = g.scene;
    gunMaterials(this.model);
    for (const n of ["Bullet_low", "Catridge_low"]) {
      const m = this.model.getObjectByName(n);
      if (m) m.visible = false;
    }
    this.trigger = this.model.getObjectByName("Trigger_low");
    this.triggerRest = this.trigger?.quaternion.clone();
    this.muzzle = new T.Vector3(0, 0.124, -0.16);
    this.configure(this.profile);
    return this;
  }
  configure(profile) {
    this.profile = profile;
    const S = profile.side,
      r = this.rig.rest;
    for (const [group, key] of [
      [this.hand, "hand"],
      [this.gun, "gun"],
    ]) {
      group.position.fromArray(profile[key].position).multiplyScalar(0.001);
      group.rotation.set(
        ...profile[key].rotation.map((v) => (v * Math.PI) / 180),
      );
      group.scale.setScalar(profile[key].scale);
    }
    this.restFrame = frame(
      r[S + "Hand"].world,
      r[S + "Index1"].world,
      r[S + "Middle1"].world,
      r[S + "Pinky1"].world,
    );
    const canonical = new T.Matrix4().makeBasis(
      new T.Vector3(0, 1, 0),
      new T.Vector3(-1, 0, 0),
      new T.Vector3(0, 0, 1),
    );
    this.palm = new T.Quaternion().setFromRotationMatrix(
      canonical.multiply(this.restFrame.clone().invert()),
    );
    this.rig.root.position.copy(r[S + "Hand"].world).negate();
    this.rig.joints[S + "Hand"].quaternion.copy(this.palm);
    for (const m of this.rig.parts) {
      m.visible =
        m.name.startsWith(S) &&
        /^[RL](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name);
      m.userData.gripRest ??= m.matrix.clone();
    }
    for (const n of JOINTS) {
      const k = +n.slice(-1),
        f = n.slice(0, -1),
        z = (
          k < 3
            ? r[S + f + (k + 1)].world.clone().sub(r[S + n].world)
            : r[S + n].world.clone().sub(r[S + f + (k - 1)].world)
        ).normalize(),
        x = r[S + "Index1"].world.clone().sub(r[S + "Pinky1"].world);
      x.addScaledVector(z, -x.dot(z)).normalize();
      this.bases[n] = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(x, new T.Vector3().crossVectors(z, x), z),
      );
      const rot = new T.Matrix4().makeRotationFromQuaternion(
          new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), z),
        ),
        shape = rot
          .clone()
          .multiply(
            new T.Matrix4().makeScale(profile.thickness, profile.thickness, 1),
          )
          .multiply(rot.clone().invert());
      for (const m of this.rig.parts)
        if (m.parent === this.rig.joints[S + n]) {
          m.matrixAutoUpdate = false;
          m.matrix.copy(shape).multiply(m.userData.gripRest);
        }
    }
    this.pose(profile.angles);
    this.bindPalm = this.hand.quaternion.clone().multiply(this.palm);
    this.neutral = null;
  }
  pose(angles, pull = 0) {
    for (const n of JOINTS) {
      const q = this.bases[n];
      this.rig.joints[this.profile.side + n].quaternion
        .copy(q)
        .multiply(
          new T.Quaternion().setFromEuler(
            new T.Euler(...angles[n].map((v) => (v * Math.PI) / 180), "XYZ"),
          ),
        )
        .multiply(q.clone().invert());
    }
    if (this.trigger)
      this.trigger.quaternion
        .copy(this.triggerRest)
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(1, 0, 0),
            -0.25 * pull,
          ),
        );
    this.assembly.updateMatrixWorld(true);
  }
  track(lm, world, aspect, dt, { followRotation = true, gain = 1 } = {}) {
    const p = world.map((v) => new T.Vector3(-v.x, -v.y, -v.z));
    const q = new T.Quaternion().setFromRotationMatrix(
      frame(p[0], p[5], p[9], p[17]).multiply(this.restFrame.clone().invert()),
    );
    // Centering defines a comfortable starting orientation without changing the
    // user's hand-to-gun matrix. Subsequent palm rotation moves the whole assembly.
    this.neutral ??= q.clone();
    const rotation = (
      followRotation
        ? q.clone().multiply(this.neutral.clone().invert())
        : new T.Quaternion()
    ).multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI),
    );
    const span = Math.hypot((lm[5].x - lm[17].x) * aspect, lm[5].y - lm[17].y),
      depth = T.MathUtils.clamp(0.05 / Math.max(0.025, span), 0.3, 0.85),
      fov = Math.tan((45 * Math.PI) / 360);
    const position = new T.Vector3(
      (0.5 - lm[0].x) * 2 * fov * depth * aspect * gain,
      (0.5 - lm[0].y) * 2 * fov * depth * gain,
      -depth,
    );
    const alpha = dt <= 0 ? 1 : 1 - Math.exp(-dt / 0.045);
    this.assembly.quaternion.slerp(rotation, alpha);
    position.sub(
      this.hand.position.clone().applyQuaternion(this.assembly.quaternion),
    );
    this.assembly.position.lerp(position, alpha);
    this.assembly.updateMatrixWorld(true);
  }
  resetView() {
    this.assembly.position.set(0, -0.02, -0.48);
    this.assembly.quaternion.identity();
    this.neutral = null;
  }
}
