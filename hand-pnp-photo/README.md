## flat11 palm faces

The remaining depth bulge is cut off with two capped planes parallel to the palm reference plane. Palm shell thickness is 18 model mm before calibration scale. Both hands are verified to stay within these planes, including an oblique visual check. Joint targets, finger geometry and tracking remain unchanged; 72 motion comparisons pass.

## cut10 actual socket removal

The previous thumb8 deformation did not delete the socket. This version removes the secondary palm socket geometry entirely, clips the adjoining main palm triangles and caps the cut contours with smooth shared-vertex normals. Finger geometry, joint references and tracking are unchanged. Applied through the shared geometry to PnP, Sweep, gun, Sweep check and Dust II. Verified both hand drivers across 72 poses.

## thumb8 visual cleanup

Removed joint-axis arrows from PnP and Sweep pages. Retracted the obsolete palm-side thumb mount into a smooth edge at the aligned thumb base; the moving thumb, joint targets and tracking remain unchanged. Shared geometry updates PnP, gun, Sweep and Sweep check, plus the reference viewer.

## start7 tracking startup

Workers recover from initialization errors/timeouts and stalled inference using CPU fallback. Face input now uses the configured tracking width instead of a 320px cap. Capture allows results up to one second old while still requiring ten distinct frames and a steady two-second capture. Missing face, model loading and missing hand/PnP inputs have separate messages. Original palm PnP solver unchanged.

## shell6 correction

Original indexed GLB surfaces and authored smooth normals are retained, with fixed one-time affine segment placement. The previous clipped/mirrored triangle rebuild is no longer the rendered mesh. Reference joint targets and the original EPnP solver are unchanged.

Head movement, hand offsets, finger smoothing/jump thresholds and PIP/DIP controls are visible again and wired to their existing handlers. Filters start at zero; adjustable smoothing can delay motion. PnP still follows measured palm pose, so raw tracking jitter is not eliminated by restoring the mesh. Sweep no longer applies the extra whole-hand image-fit translation after articulation. Collision toggles remain optional.

Validation: 72 constrained poses match the original driver, fixed bone lengths and unchanging mesh; original vertex/index counts and finite normals checked at startup. 876 generated palm rotations have no pose failures. Preserving the original shell means the earlier exact paired-surface-centre assertion is no longer satisfied: maximum centre offset is 0.897 model mm, with all 42 sampled joints intersecting their surfaces. This is not a real-world millimetre calibration. No claim of exact live pixel matching is made.

Earlier implementation notes below describe superseded mesh construction where inconsistent with this correction.

## Live motion restored (motion5)

The reference fit runs once at model load. Live PnP, PnP gun and both current Sweep pages use the original constrained direction driver (`fitImage:false`). The ray-based screen matching is only an explicit static reference-comparison option. PIP/DIP plane locks and base-splay limits are active again; existing temporal settings are preserved. No further mesh changes were made in this restoration. The PnP solver blob remains exactly 186a377f0fb348836b65176dcee72546c9830ed1.

The existing contact panel is visible again. PnP's unconditional collision bypass is removed, restoring optional hand/hand, hand/head and contact controls. Collisions remain optional; capture/check suspends corrections as before. Gun-specific work is deferred. Both model-line overlays are updated after corrections.

motion-check.mjs: 72 poses, no image-target influence, unchanged geometry, preserved lengths and upper-joint planes. Compared locally with the 9d9addf driver: zero point difference. Collision/contact regression tests pass. No claim that raw camera noise is eliminated.

# PnP aligned hand — original solver, corrected palm

`palm-pnp.mjs` is restored exactly from commit `9d9addf`, Git blob `186a377f0fb348836b65176dcee72546c9830ed1`. It uses the existing OpenCV EPnP seed, ITERATIVE refinement, previous-pose seed, error gates and translation continuity. No IPPE, world-orientation seed, angular scoring or orientation/translation fallback remains. This preserves the previously selected EPnP method: https://www.epfl.ch/labs/cvlab/software/multi-view-stereo/epnp/

The regression was in the model references: flattening all 21 reference depths made the fixed palm target planar. `fitPhotoHand(...,{preservePalmRelief:true})` now retains the original model's depth relief, while preserving the traced XY coordinates. `palm-relief.mjs` restores the corresponding mesh depth and rebinds each reference to its actual paired front/back surface midpoint. The pivot stays inside the palm base. No per-frame geometry resizing or change to PnP intrinsics or estimation is introduced.

PnP and its gun lab use this correction. Sweep keeps its existing model/estimator. The gun remains attached using the saved poses; visible lines still read actual model joints. Reference comparison uses the same corrected PnP hand.

Validation: original solver blob identity; 876 synthetic actual-model frames covering both sides, three aspect ratios, two distances and full turns; zero failures, max angular error under 0.000003 degrees. All 42 reference points have paired surfaces, maximum midpoint error below 0.000001 model mm. Reference image 1: 0.040 px RMS / 0.117 px maximum. A real sample image remains subpixel. These numerical checks do not establish live phone accuracy or physical scale. Gun integration checks cover 60 held poses, grip invariance, lengths, calibration, pickup/release/loss.

## Assist16: assistance controls and distance capture choice

PnP and Sweep use the same six-tab settings layout. Shake reduction starts enabled on first use and can be disabled; assistance/contact/continuity choices are saved separately per version. Numeric finger filters have explicit enable switches that retain their current strength while toggled off/on in the session. Existing finger drivers, hand shape, and the PnP solver are unchanged.

Distance offers two still captures (near, then neck, each requiring two steady seconds and showing a picture) or a five-second preparation followed by an eight-second video sweep. Both methods call the selected version’s existing neck-fit calculation. They calibrate relative size/depth and neck placement, not finger shape or neutral angles. The map and gun pages keep their earlier UI.

Validation: browser workflow harness completed both methods for both estimators, including image capture and reset; settings checks verified saved shake/filter choices and toggles. Existing capture, PnP endpoint, 540 palm-projection cases, and video timing tests pass. These checks are not a measurement of live physical accuracy.

## Eye18: first-person camera

A separate First-person camera tab enables an eye-anchored viewing camera, default FOV 90 degrees, with offsets of 5 mm upward and forward. It follows the rendered eye midpoint and optionally head rotation. Controls cover XYZ offsets, yaw/pitch/roll, 40–120 degree FOV, near clipping, hiding the own bust, and reset. Camera settings persist separately per version. Tracking retains its existing camera projection and depth solver. Distance recording/checking temporarily displays the camera mirror. A missing face holds the last eye position; before first detection, the view is provisional.

Browser checks verify tracked eye following and the controls. A camera geometry harness verifies forward orientation, eye-covering projection, head translation, 90-degree default, temporary own-bust hiding/restoration, and calibration view bypass. Live occlusion accuracy still depends on hand/head tracking and calibration.
