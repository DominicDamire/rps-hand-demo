# Direct Lines Lab

Separate experimental page at /hand-lines/. Original hand-lab remains unchanged.

The three segments of each digit use consecutive tracker endpoints. Each joint is translated to its target, oriented with a quaternion from the original segment direction to the tracked direction, and its mesh is stretched axially to the target length. No learned poses, screenshot offsets, hinge locks, fist preset, thumb IK, stillness hold or speed cap runs in this live path. Palm orientation still uses the palm frame and depth remains inferred from one camera. The original rigid palm is not reshaped to match individual palm proportions; seams can occur at translated knuckle attachments.

Controls at the top: smoothing in milliseconds, positional deadband in estimated model millimetres, thumb-tip contact proximity in source-image pixels, and distal coupling strength. All default to zero for direct tracking. Contact compares thumb to each fingertip, snaps endpoints to their midpoint and releases at 1.5 times the entry distance. It does not classify skin pixels or prove physical contact. Coupling optionally makes the final finger bend follow the preceding bend; it excludes the thumb. These assists intentionally deviate from raw points.

Validation: direct-check.html loads the real asset and verifies both hands' joint and transformed mesh endpoints against synthetic targets, with maximum error below 1e-6 metres. Sample image tracking loaded successfully. Actual phone-camera quality and occluded depth remain unverified.

## Finger shape update

Thickness scales both transverse axes of all finger segments (default 1.3). Tip inset extends distal meshes beyond their tracked endpoints (default 2 estimated mm), leaving the tracked joint positions unchanged. Contact proximity now starts at 8 pixels; smoothing, deadband and coupling remain zero. Save starting settings persists these six controls locally; Restore defaults restores the new defaults. Excessive thickness/inset can intersect meshes; this is not collision physics. The original GLB is unchanged. Geometry check now verifies 1.3 thickness and 2 mm extension on both hands.

## View and two-hand update
Fingertip inset now ranges from 0 to 100 estimated mm. View switches between camera mirror and an opposite-side first-person inspection camera; no head tracking is added. Both detected hands render by default, with independent filter/contact state and blue skeleton lines for the second hand. MediaPipe was already configured for two hands. Single-hand first-person sample verified; live two-hand input remains unverified.


## Stable-size update
The four assistance controls (smoothing, movement deadband, touch proximity, coupling) are hidden and their effects disabled. Segment lengths are captured independently for each hand and remain fixed while directions follow tracking. Recalibrate hand size resets length/depth calibration. Depth is separately stabilized with a 180 ms response and bounded updates; image perspective still changes with real distance. Tracking grace is adjustable 0–1000 ms, default 250; missing detections retain the last measurements until expiration, with no invented finger motion. Fixed-length regression verifies an 80 percent input size increase does not change segment lengths. Live clip replay has not been quantitatively verified.

First-person camera controls now expose position XYZ, yaw, pitch and field of view. Camera settings are included in Save starting settings; the reset camera button restores defaults. Mirror uses the original calibrated projection. Opposite-side view is an inspection approximation, not a calibrated eye or head tracker.

## Camera and endpoint correction
Direct mode again follows actual tracked endpoints rather than substituting fixed bone lengths. Fixed-length reconstruction caused fingertip drift and is no longer used by the live app. Nearby thumb-tip fitting is separately enabled by a checkbox (8 source pixels) and can be disabled for raw endpoints. Normal game perspective is the default in both mirror and opposite-side first-person inspection. An orthographic option normalizes wrist-to-middle-knuckle length to the model palm scale; it is explicitly not pixel-exact camera overlay. Single-camera estimated depth and the original rigid palm proportions remain limitations. Camera modes verified with sample input; no live camera accuracy guarantee.

## Rigid geometry and phone-distance calibration
Per-frame mesh resizing is removed. All palm attachments and segment lengths use the original model dimensions. Thickness and inset are fixed user settings; mesh matrices update only when those settings change. Thumb contact now uses fixed-length FABRIK and reports no guarantee for unreachable targets. Regression varies inputs 0.4–3 times and asserts invariant mesh matrices, attachment distances and link lengths including contact.
Phone distance is a user-entered face/hand reference (15–150 cm). Hold hands beside face and calibrate to map estimated depth into that distance; first-person eye Z is set to the same negative distance. Depth sensitivity scales movement around the reference plane. This is an approximate manual calibration, not face tracking or measured physical depth. Test with live camera remains necessary.

## Direct motion restored without mesh resizing
Restores the earlier direct joint translation and direction mapping; removes the rest-palm-anchor reconstruction and FABRIK that changed movement. Mesh matrices depend only on manual thickness/inset settings, never tracked lengths. Tests verify unchanged geometry transforms plus exact tracked joint positions and segment directions for both hands while inputs scale from 0.4 to 3 times. Fixed-size rigid pieces may show seams when tracked spacing differs from mesh proportions; endpoint agreement is not guaranteed surface contact. Face distance remains manual; there is no face detector.

## Connected rollback
Restores the connected fixed-dimension solver from the previous non-resizing version. Older direct tracking contributes segment directions, not independent joint translations or live scale. Regression jointly verifies mesh matrices remain constant, parent-child attachment lengths remain fixed, and segment directions match the earlier tracker across input scales 0.4–3. Nearby contact remains optional fixed-length fitting. Live personal camera matching is not verified; endpoint pixel overlap is not guaranteed for differing proportions.

