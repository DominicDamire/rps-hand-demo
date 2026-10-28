# Final hand shooting range

Entry: `hand-range/`. Reuses the movement map (a flat floor in this repository), mirror, targets, movement joystick and saved gun composition.

- Hands: shared `hand-live-limits/hand-driver.mjs`, original palm-photo proportions and shell-tip extensions. Sweep palm depth; 2D segment fitting; relative finger-depth hint 0.5; straight-depth correction; post-fit joint limits, coupling, contact and jitter filtering. Two hands enabled.
- Crossing: reversed adjacent landmark order releases the upper-joint-based sideways lock. Base flexion still limits sideways movement for curled knuckles. Crossing allowance is separately adjustable (40 degrees initially); normal base limits remain 30 backwards / 90 forward / 25 sideways.
- Head: existing `CombinedHead` alien head, neck and shoulders. Shoulder rotation locked by default. No full-body avatar.
- Camera: tracked eye midpoint, FOV 90, 0.5 cm upward/forward offset, 1 mm near plane. Rotation uses the latest eye-camera transform in map coordinates. Camera and movement controls are in their own tab.
- Gun: existing saved grip endpoints. Close the lower three fingers to pick up; straighten the index to arm, curl to fire; open lower fingers to release. Pickup is gesture-based, not a proximity grab. Shots originate at the gun barrel. Left hand and arrow buttons move; Q/E or turn buttons rotate.
- Distance calibration: existing two-still or video-sweep options. Optional head/hand collisions remain configurable; the final finger pipeline is separate.

Checks performed for this integration: six complete-driver crossing fixtures (both hands, upper bends 0/45/80 degrees); 828 replay/photo poses with fixed bone lengths and joint/contact checks; actual MediaPipe two-hand/face/shoulder inference on a private fixture; integrated pickup, held-pose rendering, trigger debounce, release and target hit; eye-camera quaternion and mirror head rendering. Existing gun and movement unit suite: 62 passing tests. Private fixture media is not published.

The camera still estimates obscured landmarks. This change allows a detected crossing through the constraints; it cannot recover fingers the tracker fails to distinguish.

## Saved grip transfer

`hand-range/saved-grip.mjs` transfers the original supplied grip to the final photo-proportioned hand. The gun retains the saved transform anchored at the middle knuckle. Bone lengths, palm attachments and shell geometry stay fixed. A bounded fixed-length hinge solve matches the wrapped thumb, pressed index and lower-three fingertip contact endpoints once per hand; cached directions interpolate smoothly during tracking; raised thumb and released index retain their authored directions. Skin-tip extensions are included. Authored segment roll is transferred separately. The held pose bypasses free-hand 2D fitting, sideways restrictions and jitter filters; letting go resumes the final free-hand driver.

The source JSON angles and gun placement are unchanged. Retargeted joint angles necessarily differ where the final model proportions differ: this preserves contact positions rather than claiming the two differently proportioned hands have identical joints. Controls are in the Gun tab and use the existing trigger/thumb controller.

Validation: 132 handedness/rotation/index/thumb states, no bone-length or palm-attachment changes, no lower-finger motion from thumb/index input, contact-stop endpoint residual below 0.001 mm in model coordinates. A 202-sample thumb/index sweep had a maximum 1.71-degree segment change per 1% input step, with no branch jumps. This numerical endpoint test is not a claim that the full mesh surfaces are collision-free. Visually inspected released, pressed and raised-thumb states from several views; 21 existing grip/trigger unit tests passed.
