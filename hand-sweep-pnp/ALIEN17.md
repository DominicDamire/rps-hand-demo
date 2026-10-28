# Alien 17: revert expensive tracking experiment

Restores the pre-Holistic tracking-session code from 6d02ead: independent Hand Landmarker, Face Landmarker and Pose Landmarker workers. No person segmentation, mask readback or mask-based hand rejection is executed. Camera preview reads the current video independently of inference completion at the scene refresh cadence.

Retains PC inference/rendering, phone video transport, resolution controls, measured FPS, fixed rig/model size controls, and approximate palm-size depth. The removed scan, arm-depth fusion and custom jiggle controls remain removed. Historical Holistic files are retained for source history but not imported by the active pipeline.

Validation: module syntax and diff checks; perspective-depth tests; browser reference fixture. Actual phone FPS depends on the device and video stream and is not guaranteed by this rollback.
