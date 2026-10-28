# Alien 18.10 — simple capture

Removed measured hand-to-camera and manual head-distance inputs and their code paths. Old measured references are not reused. Capture gives five seconds to extend one open hand below the visible face, then samples the existing rendered wrist distance and observed palm span for 1.5 seconds. The face raw/reference depth is saved at the same time. Capture does not move the head to a typed distance or change the starting hand placement.

The stored mapping stays fixed. Live whole-hand depth uses the saved image-palm-size ratio; hand-relative tracker depth drives articulation. This remains a monocular estimate, not exact measured camera distance. It has no arm-length, elbow, segmentation or OpenCV fit. Reference mode bypasses the back wall and automatic hand-pair fit. Optional exterior collisions and relaxed palm are editable again and operate only when explicitly enabled. Relaxed palm does not require head collision to be enabled.

Saved hand/head position offsets and activation distance reset to zero once. Size multipliers remain nonzero because they are physical model dimensions. Hand distance offset is removed from the visible UI. The original archives use isolated settings.

The false-depth-bend correction now treats a visibly extended distal joint independently when a neighboring joint bends. Short/foreshortened spans retain tracker depth, and actual projected folds are not flattened. Automatic thumb-tip contact fitting and saved-pose matching start off. This same correction is in the one-hand sweep page.

Tests: capture retains displayed wrist/head anchors; stale measured references rejected; size ratio and missing-face capture cases; browser depth-lines regression reports zero residual straight bend and unchanged genuine folded input.
