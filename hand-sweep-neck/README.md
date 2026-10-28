# Sweep 2.4.18: whole-hand placement and joint neck-contact calibration

## Three changes

1. Both hands and the head/neck/shoulder bust participate in calibration. A shared hand model scale changes hand geometry and camera-space depth together, preserving projection. Bust scale and XYZ offset meet the captured neck contact. All scales are frozen after capture; proportions do not change live.
2. The wrist and four base knuckles determine depth using rotation-corrected palm size and refine XY placement at that fixed depth. Distal fingers control articulation only. Three robust fitting passes reduce outlier influence; at least four valid palm landmarks are required. This does not force two hands together.
3. Calibration raycasts through the palm centre against the rendered palm meshes, taking the rear surface facing the neck. The corresponding sampled outer neck surface is fitted to that surface with zero added gap. The former 6 mm joint-centre allowance is removed. Missing surface observations reject capture rather than silently guessing an offset.

## Procedure and assumptions

Hold one extended open hand, palm facing yourself, through the five-second preparation. Move back over eight seconds, finishing with gentle palm contact just below the jaw; hold the final second with hand and face visible. Keep the phone and head still. No pressure is required. The fixed calibration applies to both hands. Recapture uses the original bust coordinates, avoiding accumulated adjustments. Failed capture preserves the prior fit; reset clears it.

Contact determines relative hand/bust scale, not absolute camera distance. The scale split minimizes equal squared log-scale changes from the starting hand and bust sizes: for the observed depth ratio r, bust scale is sqrt(r), hand scale is 1/sqrt(r). This is an explicit modelling prior, not sensor-derived metric depth or a research-calibrated anatomical ratio. Median XYZ offsets align endpoint contact; unstable finishing observations are rejected. The 10-degree phone-tilt assumption and rear allowance remain.

Whole-hand fitting is a compromise when fixed model proportions or finger angle constraints differ from the detected hand. It cannot guarantee every fingertip exactly overlays its landmark. Single-point surface contact does not guarantee that every other part of the palm and neck is free of penetration. Physical depth accuracy requires live validation.

## Fists and assistance

There is no enabled fist-to-fist attachment. Hand-to-hand matching, both collision passes, within-hand thumb contact, saved-pose matching and reference-fist blending start off in the live page. Curled fingers still have the established MCP splay and PIP/DIP plane limits. Optional contact corrections remain available but never alter the calibration.

## Verification

540 ideal actual-doll palm projections, 48 whole-hand fixed-depth XY recovery cases, both-hand scale and projection invariance, surface-contact endpoint equations, capture timing, invalid observations, failed recapture and reset are tested. Actual-model browser checks cover 30 open/curled hand cases across changing calibration scales with no accumulated joint drift or projection change; every case found a palm mesh surface. The prior full-bust transform test verifies coherent head/neck/root placement and reset. These are software/geometry checks, not proof of perfect live depth or contact. Private recordings and QA data are excluded from publication.

## 2.4.15 fingertip proximity controls

Bring nearby fingertips together is an optional persisted toggle, initially off. It restricts candidates to tip-tip pairs between opposite hands and takes priority over general matching. The existing detection range and confirmation duration control activation; the existing side-correction cap controls the residual after ray-depth fitting. A new target gap slider controls the requested contact-point separation (0–10 mm). When tips separate beyond the release threshold (1.5 times activation range), the temporary correction releases. These controls do not alter collision parameters or sweep calibration. Collisions can push a matched pair apart. One best pair is matched per frame, not every finger simultaneously, and skin contact may differ from landmark contact.

## 2.4.16 collision correction, settings tabs and exact tip lock

Between-hand separation now moves the complete compounds onto opposite sides of a separating plane after detecting shell overlap. This prevents a local finger correction from deepening a different piece overlap. It is conservative and can separate hands farther than a detailed concave surface solver. A final pass catches overlap introduced by head correction; subsequent head clearance moves both hands together.

Contact controls have their own Contact detection tab. Tracking & calibration exposes the existing head tracking-loss hold next to the hand hold (default 1000 ms; head range now up to 5000 ms). This holds old observations, not prediction or smoothing.

The yellow-tip toggle now defaults its target gap to zero (existing settings migrate once). It matches the rendered result.points endpoints that draw the yellow markers. A confirmed zero-gap tip match takes priority over between-hand collision separation: that separation is paused while the lock is active, while head clearance translates the pair together. This priority can allow other hand parts to overlap during a tip lock; it is not a simultaneous nonpenetration and exact-contact solver. Separation resumes upon release. Tests cover exact dot-point gap, compound overlap removal and unchanged already-separated shapes; actual-doll geometry check reports no remaining overlap in the constructed overlapping-hands pose. Live poses remain to be tested.

## 2.4.17 open-hand / fist depth regression

The 2.4.14–16 whole-hand XYZ fit could absorb finger articulation or length mismatch by moving the entire hand in Z. It now fits XY only, keeping the depth supplied by the palm solver. A regression deliberately collapses distal finger image points while holding palm observations constant: both the root-depth estimate and added Z correction stay unchanged. This addresses a code path, not every possible source of live depth drift. Palm occlusion, changing knuckle estimates, rotation uncertainty and explicitly enabled contact/collision corrections can still change depth. Neither open hands nor fists have a preferred front/back ordering. See depth-mapping-notes.md for researched alternatives.

## 2.4.18 palm-only placement

Only wrist and four MCP points now contribute to XYZ placement. Distal finger curl no longer changes the rigid XY fit either. Four valid palm points are required. Sweep joint hand/bust calibration and rotation-corrected palm depth are retained. The old saved 0.092535 scale is not applied. Curl invariance is tested in all three axes.

## Settings12: assistance tabs and one-time hand shape capture

Sweep settings now have six tabs: Hand model, Distance, Assistance, Contact, Continuity, and Head and position. Existing controls and their handlers are moved together, including both tracking-loss timers. Finger corrections, hinge-plane locking, coupling, shake reduction, and all four numeric finger filters are exposed without changing their defaults.

Hand model capture averages at least 12 distinct, steady frontal open-hand frames over 1.5 seconds. It applies mirrored proportions once to both models, retaining the palm reference scale, existing flat shell, and live joint constraints. It rejects tilted, curled, incomplete, uncertain, and excessively small observations. Captured proportions last for the session; they can be toggled off or reset. Shape changes clear the distance capture and geometry-dependent caches. Distance calibration remains the existing sweep-to-neck procedure. Neither a frontal image nor this shape capture establishes absolute millimetres.

Checks cover capture validation, duplicate frame rejection, mirrored equivalence, actual-model dimension changes and exact reset, plus browser tab and fixture tracking checks. The new UI is installed only on Sweep, not the map or PnP pages.

## Assist16: assistance controls and distance capture choice

PnP and Sweep use the same six-tab settings layout. Shake reduction starts enabled on first use and can be disabled; assistance/contact/continuity choices are saved separately per version. Numeric finger filters have explicit enable switches that retain their current strength while toggled off/on in the session. Existing finger drivers, hand shape, and the PnP solver are unchanged.

Distance offers two still captures (near, then neck, each requiring two steady seconds and showing a picture) or a five-second preparation followed by an eight-second video sweep. Both methods call the selected version’s existing neck-fit calculation. They calibrate relative size/depth and neck placement, not finger shape or neutral angles. The map and gun pages keep their earlier UI.

Validation: browser workflow harness completed both methods for both estimators, including image capture and reset; settings checks verified saved shake/filter choices and toggles. Existing capture, PnP endpoint, 540 palm-projection cases, and video timing tests pass. These checks are not a measurement of live physical accuracy.

## Eye18: first-person camera

A separate First-person camera tab enables an eye-anchored viewing camera, default FOV 90 degrees, with offsets of 5 mm upward and forward. It follows the rendered eye midpoint and optionally head rotation. Controls cover XYZ offsets, yaw/pitch/roll, 40–120 degree FOV, near clipping, hiding the own bust, and reset. Camera settings persist separately per version. Tracking retains its existing camera projection and depth solver. Distance recording/checking temporarily displays the camera mirror. A missing face holds the last eye position; before first detection, the view is provisional.

Browser checks verify tracked eye following and the controls. A camera geometry harness verifies forward orientation, eye-covering projection, head translation, 90-degree default, temporary own-bust hiding/restoration, and calibration view bypass. Live occlusion accuracy still depends on hand/head tracking and calibration.
