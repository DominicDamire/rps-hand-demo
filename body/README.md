# Upper-body tracking for seated and standing play

The active mirror route now combines the existing face camera controller with
MediaPipe Pose Landmarker Lite. The body is an articulated test avatar (torso,
shoulders, elbows and wrists), not a realistic skinned character. Detailed hands,
fingers and legs are not rendered. No eye-gaze tracking is enabled.

Choose Body: seated or Body: standing and hold a neutral posture for 12 valid
frames. Calibrate body resets only body proportions; Recenter resets both head
and body. Head rotation and all three positional sensitivity sliders stay
independent. Body: off terminates its worker and retains head-only operation.

Seated calibration needs a visible face and both shoulders. Its pelvis is an explicitly
estimated support that allows 6cm of seated lean before carrying the whole body.
Larger head movements translate the pelvis instead of stretching the torso. The
neck is bounded to the calibrated length plus 15 percent (maximum 13.8cm), and
excess displacement shifts shoulders and arms together. Standing calibration and tracking require hips.
At a camera boundary, tracking accepts one shoulder and the visible elbow/wrist,
reconstructs the cropped shoulder from the connected torso, and relaxes only the
missing arm. A padded detector retry and short image-feature bridge keep the last
visible head/arm pixels moving through detector gaps. Once all upper-body evidence
has left the image for 220ms, tracked joints clear and the rig eases to its relaxed
pose; it never pins the player's arms in a stale position. Proportions survive reacquisition. The face must remain in
view to attach the body to the eye position. Keep the camera stationary.

## Components and coordinates

- `worker.mjs`: pinned Tasks Vision 1.0.1, Pose Lite float16 version 1, VIDEO,
  one person, no segmentation, GPU with CPU fallback.
- `pose.mjs`: confidence and relaxed boundary checks, partial-joint recovery,
  eye-relative body geometry, seated/standing calibration, scale stabilization,
  35ms smoothing, and prompt loss handling.
- `BodyView.js`: shares the camera, one body frame in flight, face capture gets
  priority (two face frames per body frame), body and face inference are serialized.
  Nominal body cap is 15fps, reduced to 8fps when either tracker exceeds 65ms.
  A fully missing body is retried at 4fps; a partial edge pose stays at the normal
  rate. Actual rates depend on device and body inference can reduce head frame rate.
- `TrackedBody.js`: torso and limb segments built from joint positions. Only its
  origin follows camera position; head look gain never rotates the body joints.
- `pose.signals`: torso yaw/roll and relative shoulder-to-hip lean X/Z for future gameplay;
  `hipsTracked` distinguishes measured hips from seated estimates.

See `../head/CALIBRATION.md` for guided startup, optional measured-distance scale,
and the active perspective head solver. In seated mode, `hipsTracked` reports
source visibility only; rendered hips are always inferred. The signals
are null on loss/disable and must not be treated as measured seated pelvis motion.

MediaPipe world landmarks are hip-relative shape estimates in metres. They do
not provide absolute room position. Subtract the midpoint of pose eye landmarks
2/5, then map `[dx,dy,dz]` to `[-dx,-dy,dz]` for the mirrored player frame. Positive
camera-image Z is farther from the webcam, so reaching toward the webcam maps
to negative Z in front of the player's view. Add the face-controlled camera
position exactly once. Face-derived translation handles leaning, ducking and
moving nearer/farther; pose tracking improves avatar torso/arm articulation.

The head mesh now uses physical head angles, while the camera retains adjustable
turn gain. This lets the body and sculpture align naturally in third person.
Body geometry is visible in first person and in the expanded room mirror.

This is monocular estimation, not measured room-scale tracking. In particular,
occlusion and seated cropping can prevent pose detection entirely, and inferred
hips must not drive crouch decisions. These signals are an integration surface;
the mirror is a test room, not an implemented shooter or weapon aiming system.

## Verification

Run `node mirror/body/pose.test.mjs`, `node mirror/body/scheduler.test.mjs`
and `node mirror/head/pose.test.mjs`.
Open `mirror/body/verify.html` to run real Pose Lite inference and calibration
against Google's MediaPipe reference photo. Add `?crop` for a seated-style crop,
`?standing` for hip-based calibration, or `?occluded` to check body rejection.
Open `mirror/body/edge-verify.html` to move the fixture progressively across all
four camera boundaries and report partial-joint continuity; add `?exit=1` to
verify tracking stops after the person has completely left the image.
The reference photo is from https://storage.googleapis.com/mediapipe-assets/pose.jpg
and is included only as a model verification fixture. Reported inference time excludes the camera and
rendering; it is not phone sensor-to-screen latency.

Official API/model reference:
https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
