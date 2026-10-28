# Connected upper-body rig

`upper-body.glb` is a single connected, weighted surface, including the supplied
sculpture head. The runtime uses standard Three.js skeletal skinning, not separate
rigid cylinders or scaling joint-to-joint links. The material is ivory matte.

## Skeleton and retargeting

15 bones: Pelvis → Spine → Chest → Neck → Head; Chest also parents each
Clavicle → UpperArm → Forearm chain. Left is game -X, right is game +X;
up is +Y and the face looks toward -Z. Rest eyes are at the origin, units metres.
Each arm also has UpperArmTwist and ForearmTwist helpers, weighted progressively
along the limb. Four corrective morphs support elbow flexion and shoulder raising.

`RiggedAvatar.js` stores bind quaternions and positions, then converts desired
world rotations back into parent-local bone rotations. Shoulder/hip landmarks
provide torso tilt, split between the spine and chest. The neck shares the
physical head angle, and the skull finishes that rotation. Camera look gain
does not amplify the model's physical head angle.

The whole rig translates to align its eyes with the tracked camera. Local bone
positions and scales never change, so large seated head movement carries the
body without stretching its neck. The torso tilt has a 40-degree bound and
clavicles have a 14-degree swing bound.

Arms use analytic two-bone IK: wrist is the target, elbow is the bend-plane
guide. Unreachable wrists are clamped to the arm's fixed reach. This preserves
anatomical proportions instead of forcing mesh joints onto noisy or differently
proportioned detector landmarks. Missing arms ease into a relaxed hanging pose.
Acquisition uses a 55ms rotational filter; loss uses 300ms. Head/neck keep a
12ms filter. The runtime re-aligns the eyes after filtering to prevent separation.
Body tracking is optional and disabled by default. Head-only mode still renders
an inferred upright body, regardless of the player's physical reclined posture.
Twist is inferred from the elbow bend plane and limited to 0.8 radians; it is not
a measured wrist/palm orientation. Elbow and shoulder corrective morph values
follow flexion/raising with an 80ms filter. No hands were added.

Skull vertices are rigidly weighted; the neck transition blends into the neck
bone. The body uses normalized bone-heat weights with at most four influences.
The builder rejects unweighted vertices and disconnected major parts.

First person discards the head surface with a bind-pose mask; the actual planar
reflection and third-person camera show the complete same skinned model.

## Reuse and tests

GitHub contains `assets/upper-body-rig/upper-body.blend`, `rig-report.json`, a
rest render, and `tools/upper-body-rig/build.py`. Run the builder in Blender
background mode to regenerate the GLB from `mirror/avatar/head.glb`.

Open `avatar/verify.html` for synthetic neutral, bent-elbow, lean/turn and
unreachable-target poses, plus head-only, sideways tilt and body loss/recovery.
It checks bone lengths, eye alignment, recovery step size and finite skinned
vertices. `body/verify.html?crop` runs the actual detector on a cropped reference
photo and feeds this same rig. These are browser checks, not a phone webcam
latency measurement. The model is an upper-body mannequin, not a facial-expression
or finger rig. Future artistic refinement can replace its mesh while preserving
the bone names and bind-space convention.
