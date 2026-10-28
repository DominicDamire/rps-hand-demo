# OpenCV depth experiment
Print calibration-target.html at 100%, measure spacing. Connect camera, capture at least six differently tilted target views, click crosses 1–9 in each view, then calibrate. Enter measured wrist-to-middle-knuckle length. Keep lens/crop unchanged.

Uses official OpenCV 4.13 JavaScript calibrateCameraExtended and solvePnP with MediaPipe world/image landmarks. Lens distortion is fixed to zero. Failed fits fall back to palm-size depth. Camera calibration is session-only. Scene projection remains the existing virtual camera; this is a depth comparison, not exact pixel registration.

Validated against a synthetic known camera (focal length recovered, RMS ~0.00001 px) and a synthetic hand at 0.5 m (recovered 0.5 m). This does not verify live monocular depth accuracy. Calibration and PnP add CPU work; solve time is displayed.
