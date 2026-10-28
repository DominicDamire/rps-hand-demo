# Hand Pose Lab

## Lab v9 — original model restored

Restores the unchanged v80 doll hand geometry, original thumb lengths and attachments, and visible thumb-base marker. No generated palm surface, raised thumb pivot or thumb shortening is applied. Camera mapping, joint limits, smoothing and contact controls remain available. Earlier version notes below describe historical changes.


## Lab v8

- Camera projection preserves the input aspect ratio, anchors the wrist to its image position, and mirrors the complete rendered view once to match the preview. The dashed frame shows the camera's fitted image area.
- Original slim thumb shells replace the rounded outer segments, shortened by 15%. The palm-side base is smaller; the internal CMC remains functional but its marker is hidden. Fingertip markers use the furthest mesh vertex.
- Model skeleton lines connect the actual rig joints. Tracking uses landmark positions and directions between landmarks; drawing lines does not change tracking.
- Finger closure uses rotation-invariant bend/reach measurements with release hysteresis. Thumb fist correction requires its own curl and proximity, controlled by Thumb fist proximity; four curled fingers alone do not trigger it.
- Thumb contact supports index, middle, ring and pinky. Image tip distances enter contact at 8 source pixels and release beyond 12. A successfully fitted pair holds its joint pose until separation; the wrist remains free. The rotation speed cap remains active, while contact joints bypass the jitter deadband to finish closing. Remaining surface-target gap is displayed.
- Existing fixed finger alignment, locked upper-joint sideways/twist values, noise threshold and rotation speed settings remain in place.

Validation: 28 automated tests pass. Real-asset geometry checks fit all four thumb contacts to under 0.2 mm. A clean static hand photo verifies the preview/model mirror direction. Live phone tracking, exact personal proportions and metric camera depth are not guaranteed; 2D overlap can falsely suggest contact. Changes are lab-only. Private camera screenshots are excluded from the repository.

Live: https://dominicdamire.github.io/rps-hand/hand-lab/

A separate desktop editor using the original v80 doll asset and fixed joint attachments. It does not modify the movement game or its saved settings.

## Workflow

1. Connect a camera over HTTPS or localhost. Select the desired tracker hand label and right/left model. A sample and image upload also work.
2. Hold a pose and click **Freeze & edit**. The displayed camera frame, normalized tracking signature, palm rotation and finger rotations are captured together. An epoch counter rejects pending results; inference pauses until you resume. Disconnect explicitly stops the camera stream.
3. Select a joint by clicking its dot or the joint list. Orbit with dragging and zoom with the wheel. Edit X bend and base-joint Y sideways with sliders or numbers. Z is locked; middle/tip Y is locked. The local axes are shown at the selected pivot. Follow palm rotation is optional; the default stable view makes editing easier.
4. Set minimum and maximum values, enable the desired axes and click **Save my limits**. Structural no-twist and hinge locks always apply; additional range limits are optional. Limits are separate for each model hand.
5. Name the pose and **Save pose**. Resume live to test the correction. Save additional examples for different shapes. Smaller match tolerance requires a closer match.
6. Export JSON for backup or transfer. Import replaces the current library and limits. Save comparison PNG exports the camera input beside the rendered hand. Browser storage is local to this browser and origin; it is not a cloud backup.

## Joint conventions

Thumb: CMC, MCP, IP. Index/middle/ring/pinky: MCP, PIP, DIP. Fifteen joints display three Euler rotation values each (45 values); locked axes stay at zero. These are editing coordinates, not medical joint angles. Positive rotation uses the right-hand rule about the displayed axis. Try a small change to confirm its visible direction, particularly for the thumb and opposite hand.

The local basis uses Z along the rest finger segment, X normal to that finger’s rest bending plane, and Y = Z cross X. Quaternion = basis * EulerXYZ * inverse(basis). Each joint rotates its descendants. Positions, attachment offsets and segment lengths are fixed. Rest is zero; enabled limits clamp individual editing coordinates, not physical collisions. The lab does not prevent fingers intersecting each other unless your chosen pose/limits avoid it.

## Recognition and reuse

`profile.mjs` is DOM-free and exports schema validation, feature extraction, matching and limit application. The input signature is 21 MediaPipe world landmarks expressed in a normalized palm frame (63 numbers). Translation, uniform scale and rigid rotation are removed. The nearest same-side saved example within the RMS tolerance supplies all 15 corrected rotations. If none matches, the tracker drives the fingers. User limits and structural locks then apply. Palm rotation is independent of the saved correction.

This is nearest-example matching, not neural-network training or guaranteed recognition from arbitrary views/occlusion. Multiple examples can cover variation. The JSON includes the model identifier, axis convention, right/left limits, tolerance, named input signatures, corrected finger angles and optional frozen camera JPEGs. Recognition currently runs only inside this lab. To integrate elsewhere, import the profile, run the same feature/match/limit functions and apply angles using the same local joint bases. Applying these values to a different mesh or rig requires matching or recalibrating its axes first.

Camera processing uses the existing MediaPipe worker locally in the browser. Assets and tracking libraries load from the same dependencies as the project. Saved camera images are included in exported JSON; share only the examples you intend to share.

## Validation

Run `node --test docs/hand-lab/profile.test.mjs`. Tests cover invariant signatures, nearest-pose recognition, hand-side isolation, enabled-only limits, JSON roundtrip and malformed import rejection. Browser checks exercised image inference, freeze/edit/save, a 72-degree correction on recognition, a 45-degree limit, invalid import rejection and valid import. Live webcam performance depends on the user's camera and hardware; image tests do not measure webcam latency.

## Phone camera via QR

On the PC click **Phone camera · QR**, scan the code on your phone, choose front/back camera and tap **Start camera**. Keep the phone page open. Both devices should use the same Wi-Fi; networks with client isolation or blocked WebRTC may not connect. This lab connection uses PeerJS signaling and direct WebRTC video with STUN; no TURN relay is configured. Tracking runs on the PC against the received video. Freeze captures the exact received frame just as it does for a local webcam. Disconnect on the PC or Stop camera on the phone ends sharing. Each connection has a fresh random pairing address, separate from the game's camera codes.


## Planar fingers (lab v3)

Z is structurally locked to zero on all 15 joints. Y is locked at joints 2 and 3; only the base has bend and sideways freedom. A shared rest-plane normal is computed from the two rest segments of each finger, with a lateral-axis fallback for a straight rest chain. Each segment direction is transformed into the parent's frame and projected into that joint's allowed motion before solving its children. This replaces independent unconstrained aiming and Euler decomposition. Base angles jointly cover a directional sweep without Z spin. Imported/recognized poses and manual edits pass through the same structural locks after user limits. Original saved examples remain in storage; their prohibited rotations are ignored when applied. Existing game versions are unchanged. This is a deliberately simplified no-twist thumb, as requested, not a complete anatomical thumb simulation.


## Screenshot fist, stillness and 3D movement (lab v4)

The reference in motion.mjs transcribes the visible rounded values from the author's fist screenshot. Four fingers use base/middle/tip flexion of 80/90/90 degrees (ring tip 80); fixed lateral alignment is index middle -7, middle middle -2, pinky middle +8 and tip +7 degrees. Thumb reference is [-9,10,1], [1,-20,0], [-27,-47,-12]. These are screenshot values, not measured anatomy or recovered precision from a JSON export. The original v2 per-segment editing basis is used to reproduce that screenshot. Fixed offsets are distinct from live sideways/twist motion. Live distal sideways and axial twist remain locked. This supersedes v3's shared-plane basis.

With reference enabled, each non-thumb finger blends toward its reference as its tracked middle joint closes (35–75 degrees). Fully curled fingers hold the reference bend and zero base spread. The thumb blends toward its screenshot pose when all four fingers close. The reference is a chosen fist shape, not collision simulation. Use the screenshot preview button to inspect it without a camera; it is read-only and cannot be saved as a captured training example. Set current straight fingers as neutral while holding an open, fingers-together hand to remove consistent base-sideways bias. A 2-degree base-spread dead zone applies in reference mode. Turning off the reference bypasses its offsets, fist blending and spread dead zone.

Pose, palm orientation and position are stabilized separately. A pose held within the selected tolerance for 0.3 seconds is held until it exceeds 2.5 times that tolerance. Movement uses adaptive smoothing; zero tolerance disables pose holding, not smoothing. Spatial motion has a separate small 2 mm hold tolerance. These filters reduce jitter but cannot eliminate inaccurate or missing tracking. First-hand selection follows the nearest previous wrist when multiple hands are visible to reduce hand swapping.

3D mode fixes the camera and moves the original model through a gridded room. Wrist image coordinates set lateral/vertical position; the camera preview and spatial position are mirrored. Depth uses several projected world-palm spans divided by their image spans, with median selection and a nominal 60-degree vertical field of view. It is monocular estimated depth, not sensor-measured depth. Calibration at a known distance rescales the estimate. It remains sensitive to tracker world-scale errors, foreshortening and camera characteristics. Recalibrate after changing camera placement. Neutral sideways offsets and depth scale persist in the profile and JSON. Disable 3D movement to return to orbit editing. Freeze stops both spatial and finger updates, while keeping the current placement for comparison.

Validation: node --test docs/hand-lab/profile.test.mjs docs/hand-lab/motion.test.mjs. Tests cover hold/release, disabled holding, screenshot fist targets, depth scaling, mirrored positioning and profile handling. Browser checks cover reference rendering, tracking and depth calibration. Physical phone latency and depth accuracy require testing with the user's actual camera.


## Thumb and fingertip targets (lab v5)

The thumb base remains a functional internal joint, but its original exposed root meshes are hidden and its base is moved inward toward the palm plane. Two external thumb segments remain. New yellow targets are computed from the extreme surface vertices of each distal mesh (averaged over a 1 mm cap). Green pivot markers are not moved to fake contact.

Thumb tracking now fits the actual mesh tip and the two exposed joint positions to palm-scaled tracked targets. A bounded coordinate search changes thumb base and lower-joint bend/sideways plus tip bend. Solved thumb angles are stabilized. When tracked thumb/index tips are near each other, a separate bounded contact fit minimizes their actual 3D surface-target separation, with a residual gap displayed. Neither fitting step stretches bones. Unreachable or inaccurate tracked targets can still leave error. Contact here is an endpoint constraint, not full collision physics.

Screenshot sideways/twist offsets now remain fixed regardless of fist blending or its toggle. Four-finger middle/tip joints cannot move sideways. The thumb tip cannot move sideways; the lower exposed thumb joint and its internal base can. Thumb-tip sideways was previously blended during fist closure; it is now constant. Saved fitted poses retain solved angles in JSON; prohibited live axes are overridden by fixed alignment on application. Additional bend tuning was deferred; existing settling and fist behavior remain.

The browser geometry-check page uses the actual GLB to verify ten fingertip targets, reduction of a known thumb-target error, pinch gap reduction, and preservation of the thumb-tip sideways lock. Controlled test results do not establish physical-camera accuracy. All changes are lab-only; game integration remains separate.


## Lab 6: final angle limiting and thumb palm extension

The original thumb joint positions and segment lengths are restored. A procedural palm mound replaces the visible metacarpal meshes and follows the MCP, leaving two exposed outer thumb segments. It overlaps the existing rigid palm; it is not a newly sculpted, watertight skin mesh. Thumb proportions still require comparison with the user's reference.

The final rendered finger angles pass through a configurable deadband (default 3 degrees) and time-based maximum speed (default 180 degrees/second). This stage runs after saved-pose, thumb, and pinch fitting, so none of those bypass the speed cap. Frozen editing and static image previews are immediate. Smaller movements within the deadband are intentionally ignored; slower speed means more lag for fast gestures. The existing stillness filter remains available separately.

All controls now display offsets from the screenshot alignment, including when a contact solution is active. Upper two joints on index/middle/ring/pinky keep sideways/twist at zero relative to that alignment. Freeze retains the displayed filtered pose. Smaller yellow markers and the displayed tip-gap readout help distinguish marker overlap from actual contact.

Validation: node --test docs/hand-lab/motion.test.mjs docs/hand-lab/profile.test.mjs; open geometry-check.html and run the real-asset checks. Fist preview and settings verified in browser. Camera jitter and physical proportions still require live user testing.


## Lab 7: photo-guided thumb geometry

The thumb attachment moves 4 mm toward the knuckles. All thumb joint-to-joint distances are unchanged. Two rounded outer phalanges replace the mechanical shells; the distal tip retains the original geometric length, without added nails. A Blender voxel union produces a continuous palm/thenar mesh (2,600 triangles per hand), replacing the overlapping prototype mound. Weighted thumb-side vertices follow the MCP while the wrist/heel stay anchored. Normals update only when the MCP moves. The generation script is tools/doll/build_lab_palm.py; original doll.glb is unchanged.

The relaxed thumb uses neutral side/twist calibration; closing the four fingers blends it to the saved thumb-fist calibration. Four-finger fixed offsets remain unchanged. Thumb side/twist are never free tracking axes; the final speed/deadband stage also smooths the thumb reference transition. The photo-reference preview is a geometry inspection pose, not a measured reconstruction or tracking calibration.

The single photo does not establish exact 3D proportions or physical contact accuracy. Verify live with the user's camera, including open hand, spread, fist and pinch. The editable Blender palm file is generated outside the published docs folder.
