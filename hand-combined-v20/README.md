# Combined Hands + Head Lab V18

Live: https://dominicdamire.github.io/rps-hand/hand-combined/?v=18

This is the combined lab, based on the V17 direct-lines hand code. One scene contains both original doll hands and the existing alien.glb head/shoulder bust. Face orientation, eye gaze and shoulder rotation drive the black bust. No lip morphs or mouth animation are applied.

Camera capture requests 60 FPS. Hands target 60 measurements/s, face 20 and shoulders 10. GPU is preferred with an explicitly reported CPU fallback. Each task has its own worker and one frame in flight; busy tasks skip camera frames. requestVideoFrameCallback supplies distinct frames where supported. Rate controls at zero terminate that task; re-enabling reloads it. Camera FPS and tracker initialization depend on the browser/device.

Top-right camera badge reports delivered video-frame callbacks and completed measurements over the latest second. The detailed status also shows the processor, inference duration and actual render FPS. A 60 target is not a measured 60 FPS result. Reference-fixture captureStream measurements are development checks, not device-camera benchmarks.

The phone route runs the same workers, sends hands plus face/shoulder results over the existing broker link, and receives tracking settings from the PC. No camera images are transmitted. The phone shows overlays on its own video; the PC shows the landmark preview on black. The selected camera capture rate applies when reconnecting. Tracking changes apply during streaming.

Existing V17 hand controls remain under collapsible sections. New performance controls explain processing cost versus smoothing delay. New controls cover head size, face depth offset, neck share, movement gain, head smoothing and shoulder lock. Head controls save automatically; hand controls retain Save starting settings.

Shared calibration requires perspective, a detected face, and hands beside the face at the entered phone distance. It calibrates the existing hand depth gains and the head distance reference together. The head model scale is captured once, and stays fixed until explicit size adjustment or calibration. Hands keep V17 fixed joint lengths. This does not guarantee physical skin-to-skin contact: monocular depth and alien/human proportions differ. Face depth offset allows measured visual correction; orthographic view is a diagnostic view, not exact pixel alignment.

Validation: node head-depth.test.mjs, tracking-session.test.mjs and projection.test.mjs. Browser reference-frame test runs all three real MediaPipe GPU workers with both hands and the black head visible in one scene; face rate zero stops face measurements while hands continue. Moving gesture fixture is available with ?v=18&fixture=gesture, seated two-hand reference with &fixture=seated. No user iPhone performance or real cheek-contact accuracy is claimed by these tests.


## V18.1 phone startup repair

Phone video now stays visible beneath a transparent landmark overlay. Trackers initialize independently of video callbacks; a requestAnimationFrame watchdog polls distinct video times if requestVideoFrameCallback stops. Telemetry runs independently and reports zero delivered frames or worker errors to the PC instead of remaining on a generic loading message. Regression tests simulate a browser that exposes video-frame callbacks but never invokes them. This is a tested startup-path fix; a physical iPhone run still requires user confirmation.

## V19 response and depth defaults
GPU preferred with reported CPU fallback; capture/hands/render targets 60, face 8, shoulders 4. Hand-priority scheduling serializes inference to avoid GPU contention, while keeping auxiliary tasks active. It can be disabled for comparison. Auxiliary capture is capped at 320px, hands remain 480px. Phone captures bitmaps directly from video, avoiding the redundant preview canvas copy. Actual device FPS is still measured, not guaranteed.

Fresh V19 preferences disable direction/head/depth smoothing and jump confirmation; depth gain is 1. Contact and anatomical corrections remain available and retain their previous behavior. All 478 face landmarks and 21 hand dots are drawn on the camera; model skeleton lines are hidden. Face tracking remains MediaPipe Face Landmarker, with no lip animation on the alien.

After shared distance calibration, index-fingertip cheek alignment can set a fixed per-hand depth offset using a ray intersection with the animated alien surface. It never resizes bones and does not guarantee metric accuracy at every distance. Recalibrating distance clears this offset.

Validation: session tests cover newest-frame processing, lost video callbacks, hand-priority fairness and no overlapping inference. Face transport test covers all 478 points. Real iPhone throughput/contact still requires a device check.

## V19.1 head size and scheduling
Correct head calibration to compare tracked eye centres (averaged inner/outer corners) with model eye centres. Previously the outer-corner span overestimated scale. Model size remains fixed after calibration; screen location and depth continue to use face tracking. Give the face a turn after two hands, raise its target to 20, and reserve an occasional shoulder turn. Actual hand throughput may trade off against face updates; no device-specific FPS guarantee. Camera telemetry now distinguishes presented-frame deltas from callbacks and configured camera rate.

## V19.2 simple face guide
Disable face blendshape classification (eye/lip expressions). Keep fewer than 50 outline/calibration coordinates for phone transport, draw an orange outline and a schematic nose/closed mouth without dots. Face Landmarker still internally infers the face mesh to estimate head rotation; this is not a replacement head-only neural model and is not a 60 FPS guarantee. Hands retain the same detector and solver.

## V19.3 stalled video clock recovery
A live preview with repeated media timestamps could reject every frame while callbacks continued arriving, preventing the old no-callback watchdog from recovering. Add a rate-bounded image-read fallback after 250ms without clock progress, driven by both RAF and an independent timer. Keep one inference in flight and report fallback reads separately from observed camera FPS. Regression test covers repeated mediaTime=0 callbacks through worker startup and subsequent tracking. Physical iPhone recovery remains to be verified.

## V19.4 restore standalone capture scheduling
Compared original tagirz500/alien-head docs/index.html and standalone hand-lines/phone-link.mjs: both dispatch from RAF, use low-quality bitmap resize and independent worker-busy guards. Restore that capture pattern; disable the shared serial queue by default. Keep fixed-timestamp recovery, sparse drawing and expression classification off. Add Hands only / Face only / Combined buttons using the same camera, detector and inference path for on-device comparison. Combining three neural tasks still has a resource cost; no zero-latency or 60 inference FPS claim.

V19.5 also restores the original face repository camera request: ideal 30 FPS, without a maximum constraint. Capture follows video changes on RAF, without a second target-FPS gate. Comparison buttons remain available.

## V19.6 face dots and shoulder-only output
Restore 468 green face dots, omit orientation arrows and expression classification. Shoulder overlay/output contains only points 11/12, linked to chin; no arm/elbow/wrist pose output. Independent pose tracker uses every second capture opportunity like the original face app, with a 15 Hz default. Pose Landmarker still internally computes its full pose. Grey head and torso material. Original V14 archived separately at hand-lines-v14.

## V19.8 decorative face dots
Transmit 8 calibration/head anchors instead of 468 mesh coordinates. Draw 56 fixed green dots as a head-shaped outline, eyes/nose/closed mouth. No lip/eyelid/iris points drive the drawing; expression scoring remains off. This saves serialization, transport and overlay work, not the internal Face Landmarker inference. The standard model still infers its full face geometry.

## V19.9 dense neutral face and baseline telemetry
Project MediaPipe canonical neutral 3D face vertices using tracked head rotation and eye anchors. All 468 decorative points retain a fixed neutral expression, with inner lips closed; no live expression deforms the mesh. Add completed hand-measurement and render FPS to the V14 archive, without changing its tracking. Original tagirz500/alien-head receives independent face/shoulder/render FPS counters only.
