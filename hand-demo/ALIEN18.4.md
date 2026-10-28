# Alien 18.4
Manual offsets for both hands (height/distance) and head (left/right, existing height/distance/size). Palm-size depth and back wall retained. Near-head threshold activates sampled front-surface clearance; optional relaxed open palm eases finger directions toward the rig rest pose. Contact translates the whole hand, without scaling bones. This is approximate sampled contact, not a full collision solver.

Two independent comparison pages: ../hand-touch-calibration/ and ../hand-opencv-depth/. Neither changes this page’s depth method. Phone sends video; PC performs tracking and rendering.

## Alien 18.5
Relaxed open palm is now off by default. Previously saved automatic-on values are reset once; users can explicitly enable and save the setting afterward.

## Alien 18.6
Optional hand-to-hand contact assistance is on by default. Palm size is still evaluated each frame. Fresh, confident, simultaneous two-hand landmarks provide fingertip-to-finger/palm contact candidates. A candidate must stay close for 120 ms. Equal-and-opposite ray-depth corrections retain the palm-size mean distance, with bounded small positional closure and 60 ms easing. Whole hand translation preserves bone lengths and finger poses. Corrections release when landmarks separate and reset if either hand is lost. Both hands share any required wall/head clearance lift.

No new ML model or OpenCV dependency. Image overlap is ambiguous; this is a visual heuristic, not proof of physical contact. Large inconsistencies (over 18 cm per hand in depth or 2.5 cm residual closure per hand) are rejected. One best contact point is fitted; arbitrary full-palm interpenetration is not solved. No permanent calibration is learned. Relaxed open palm remains off unless manually enabled.

## Alien 18.7
Index, middle, ring and pinky MCP sideways/splay movement is neutralized at 70% of the existing 80-degree full-fist bend reference (56 degrees). A 65–70% transition avoids a sudden snap. Forward bend is preserved. The complete finger chain rotates rigidly at its base, retaining lengths and relative downstream bends; thumb opposition is unchanged. Both hands use this rule, including after optional fingertip fitting.
