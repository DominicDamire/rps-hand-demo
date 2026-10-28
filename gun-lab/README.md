# Gun Grip Lab — phone camera range v4

Use `/gun-lab/play.html?v=4` for one-hand pickup, movement and shooting. `/gun-lab/?v=4` remains the placement/joint editor and has a button to use the edited grip in the camera range.

Version 4 fixes the gun asset's incorrectly blended metal materials: Gun and ACC are opaque with depth writes, while sight Glass keeps transparency. Ghost inspection can be toggled without losing these defaults. Thumb tracking now combines palm-relative thumb direction and outer-joint bends, removing the diagonal wrist-to-thumb angle that could saturate at 100% with a raised thumb. Optional Set thumb raised / Set thumb wrapped controls calibrate the live signal for the current session without changing the supplied model poses. Stale tracking and near-identical calibration poses are rejected.

Connect phone via QR reuses the sweep phone page and landmark relay. Scan the QR, tap Start camera on the phone, and keep its page visible. Only landmarks arrive at the PC, shown over a plain preview background; the camera image stays on the phone. PC camera remains available. Stop, cancel, switching sources and leaving the page close the receiver and disarm shooting.

Five labeled targets sit at 2, 3, 5, 7 and 10 metres of range depth. Shots use the actual barrel ray, with a 25 m limit and nearest-target hits. The moving aim dot turns green over a target. Each shot gives hit/miss feedback, tracer, muzzle flash and optional sound. Per-target hits, accuracy and targets-hit count can be reset independently of the grip. Every target center is checked for an unobstructed shot in the browser verification fixture.

## Supplied references

- `released-grip.json`: exact user `gun-grip (2).json`; released index angles are **0 / -3 / -19** degrees.
- `pressed-grip.json`: exact user `gun-grip (4).json`; fully pressed index angles are **-3 / 78 / 69** degrees. This file also supplies the held assembly placement, lower-finger pose and maximum inward thumb pose.
- `thumb-up-grip.json`: first supplied JSON, retained as the raised/outward thumb endpoint.

`presets.mjs` combines those references without rewriting their raw XYZ joint values. Optional `indexPressed` and `thumbOpen` fields survive profile validation, export and import. Version-1 files still load. The v2 browser-storage key keeps old saved editor profiles separate; they cannot silently override the new supplied endpoints on first entry.

Thumb controls now use their actual hinge convention: displayed Bend reads/writes the legacy Y axis, Sideways the legacy X axis, and Twist remains Z. The outer-thumb bend sign is reversed so inward bending reads positive. This preserves existing saved poses exactly. Other fingers retain their original controls.

## Held behavior

Show one hand and curl middle/ring/pinky to pick up (120 ms confirmation). The hand and pistol preserve the exact saved relative transform during translation and palm rotation. Lower three fingers remain fixed while held. Index and thumb follow measured flexion only within the authored endpoint ranges; the index cannot overshoot JSON 4. Straighten the index to rearm, then curl it for one shot. Opening the lower three fingers for 220 ms returns the pistol to its stand. No firing occurs on pickup with an already bent index, while tracking is missing/ambiguous, or on bent-finger reacquisition.

The range includes barrel-ray target hits, a brief tracer/muzzle light, optional synthesized sound, shot/hit counters, camera preview, automatic one-hand selection, camera selection, palm rotation, movement sensitivity, and camera-free endpoint inspection. Stop/hidden/page-exit releases camera resources. This changes only the gun lab; the movement game is unchanged.

The collision stops are authored angular ranges, not an arbitrary mesh collision/physics solver. Moving the gun or changing geometry in the editor requires refitting the endpoint poses. Camera depth is estimated from palm image size; live grip occlusion and camera latency need user testing. Thumb measurement includes base motion plus outer-joint bends.

## Verification

- `node --test docs/gun-lab/trigger.test.mjs docs/gun-lab/held-pose.test.mjs`: 21 tests, including raised-thumb saturation regression, rotation-invariant thumb motion and calibration.
- `/gun-lab/grip-check.html`: actual hand/gun geometry, 101 moving assembly poses, nine locked lower joints, exact endpoint values, and neutral barrel direction. Relative matrix drift was below 4e-16.
- `/gun-lab/play.html?verify=1`: explicit test-only landmark fixture replay through the actual range handler, without opening a webcam. Verified pickup, one shot and target hit, no held-press repeat, loss holding the gun, no shot on reacquisition, and release on an open hand.
- `/gun-lab/tracker-check.html`: actual tracker inference on the repository reference image, without camera access.

All normal pages remain camera-free until Connect camera is clicked. Fixture replay runs only with the explicit verification query.
