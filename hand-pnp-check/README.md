# Capture Check 1

Separate experimental lane. Live hand position/orientation uses OpenCV EPnP + iterative refinement of a fixed wrist/base-knuckle model. No standalone size-to-depth fallback. Camera intrinsics are approximate; this is not measured metric camera calibration.

1. Capture an open near pose: 2 steady seconds, at least 10 fresh frames.
2. Move at your own pace to the front of the neck and capture 2 steady seconds. Both hands share the fitted scale; head/neck share a fitted scale and translation.
3. Optional touching-index check reports the median 3D model landmark tip gap without moving hands. It is a validation, not an automatic contact calibration or sensor measurement.

Capture reports applied coefficients and a rendered neck-reference gap. Before/after toggle restores or disables the same fit. Optional shoulder distance sets shared world scale; it preserves screen projection. Starting a fresh near capture clears the old fit. References last for this page session only.

Original Sweep 2.4.18 and PnP pages are unchanged. This lane removes the timed motion recording; it uses two deliberate endpoint captures. No claim of live physical accuracy from synthetic or sample-image tests.
