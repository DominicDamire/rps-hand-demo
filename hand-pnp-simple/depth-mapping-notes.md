# Depth mapping notes — 14 September 2026

A depth map predicts distance (or relative ordering) per visible image pixel. It is distinct from the app's landmark-based geometry fit. Monocular predictions are estimates, not direct depth-sensor measurements.

- MediaPipe Hands provides wrist-relative normalized Z and hand-centred world landmarks. These are not a common camera-distance measurement between independently detected hands. [Official documentation](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md).
- Depth Anything V2 supplies relative depth models and separately trained metric models. Relative output should not be treated as centimetres. [Official code](https://github.com/DepthAnything/Depth-Anything-V2).
- Video Depth Anything adds temporal consistency and relative/metric variants. It includes experimental streaming; the authors report a ScanNet accuracy drop compared with offline operation. Its published latency/memory figures use an A100 and batched 32-frame inputs, so they do not establish this PC/browser's live performance. [Official code and limitations](https://github.com/DepthAnything/Video-Depth-Anything).
- Apple Depth Pro estimates metric depth and focal length from an image. Its stated 0.3-second 2.25 MP GPU result is not evidence of 30–60 FPS tracking here, and its released reference model differs from the paper model. [Official code](https://github.com/apple/ml-depth-pro).

Suggested experiment, not implemented: evaluate a small temporally consistent depth model on original RGB phone frames, compare open/fist transitions and known hand order, and measure latency before connecting it to model placement. Sample interior palm regions, not mixed hand/background boundary pixels. Only use a reliable difference as an additional front/back cue; retain calibrated scale and reject ambiguous overlap. Near-touching fingers and occluded rear hands may remain unresolved. Do not infer depth from the screen recording's rendered model: that would measure the output being evaluated rather than the original scene.

No dense depth model is included in 2.4.17. The current fix prevents distal-finger extent from influencing whole-hand Z. Remaining physical accuracy and speed claims require device-specific measurements.
