# Alien 16: Holistic and person-mask experiment

Replaces Alien15.19 hand/pose workers on the hands-and-head page with Google MediaPipe Tasks Vision 1.0.1 Holistic Landmarker, GPU preferred. The full-body and direct-body pages retain their existing pipeline. iPhone sends video; these tasks and Three.js run on the receiving PC.

- Holistic supplies pose, hand image coordinates and hand world coordinates, and the person mask from the same frame. A hand must overlap the person mask at three palm anchors; Holistic supplies hand/body-side association. A separate coarse-wrist distance gate was removed because it can reject valid close-up hands. This rejects results; it does not alter accepted landmark coordinates or prevent every false detection.
- Keeps the existing separate Face Landmarker for its facial transformation matrix (Holistic does not output that matrix). Blendshape/expression classification is disabled. Face landmarks still require inference.
- Removes the scan, arm-depth fusion and custom temporal jiggle controls/filters from the active movement path. Google's internal tracking remains. Fixed-size hand rigs and existing finger-plane constraints remain.
- Estimated palm depth fits image coordinates to relative world coordinates using a default 7.5 cm wrist-to-middle-MCP length. This is an adult-size assumption, not a measured personal size or shared metric body depth. Elbows/wrists assist association, not an independently measured camera distance. Head keeps its existing size-based depth and adjustment controls.
- Black background is composited using the mask and its exact captured frame, with no waist crop. It shows whatever part of the person is inside the camera frame. The mask is person/background, not identity recognition. Nearby objects and edges can leak through.
- GPU float mask readback returned all zeros in local browser testing. Google's DrawingUtils confidence-mask shader plus RGBA8 readback produced a valid mask without switching inference to CPU.

## Comparison with Google
Same official Holistic model URL and default 0.5 detection/presence settings as Google's Holistic worker. This is not exactly the standalone Google Hand Landmarker demo: different task/hand ROI pipeline, 480-pixel-wide input, added person rejection, and a separate model-driving layer. No claim that Holistic eliminates jitter or improves FPS.

## Verification
- Synthetic person/background and coarse-wrist disagreement tests; nine perspective-depth cases (3 distances x 3 palm rotations) pass in person-hand.test.mjs.
- Browser cheek reference: person cutout and hand detected; head, neck and hand render.
- Browser seated reference: waist-up cutout, both hands detected. Mask includes part of nearby desk; face detection was lost in this small-face reference.
- Static image-upload path runs Holistic IMAGE mode plus a separate Face Landmarker worker; cutout/head work, but the cheek image had no accepted hand in the single inference. The video reference detects that hand.
- Browser forward close-up: mask works, but hand detection is intermittent/missing. Holistic remains sensitive to framing/occlusion.
- Reference-loop Holistic ran roughly 10-14 inference FPS on this test environment; face around 20, scene around 60. These are not a live iPhone benchmark.

Official documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/holistic_landmarker
