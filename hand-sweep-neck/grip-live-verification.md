# Live grip and viewport stats

- Editing a grip no longer gets overwritten by a storage reload on pickup. Save validates the profile and verifies storage read-back. New editor instances prefer the editor saved grip. External-tab changes require explicit loading.
- Wrapped-thumb lock is enabled by default; the index still follows the saved trigger endpoints. Thumb tracking can be re-enabled in Gun.
- Straight-ahead hip firing is enabled by default: hand position stays tracked, gun orientation follows head forward. It can be disabled in Gun. Close-eye aiming retains its separate head-only lock.
- The viewport shows measured camera, hand, face, shoulder, and scene FPS plus hand inference and capture-to-result times. Test input is labeled; missing/stale tracking is shown as unavailable, not a target FPS. Frame-to-result time is not full sensor-to-screen latency.

Browser regression with synthetic observations through the normal pickup path: saved 45-degree middle-finger edit produced 45-degree held-pose change; a new editor reloaded the same saved angle (20 degrees); re-pickup difference 0 degrees; hip-fire gun rotation drift under wrist rotations 0 radians; ADS matrix drift under wrist/trigger changes 0; head rotation moved ADS. Eight gun-state tests passed. These checks do not establish user-camera gesture accuracy. Viewport stats were visually checked using the repeatable two-hand fixture.

## Corrected hip-fire alignment

Supersedes the head-following hip-fire behavior above. Hip fire now follows hand rotation with a fixed hand-local alignment. Default barrel direction follows the wrist-to-middle-knuckle axis. Neutral capture samples head-forward once and saves the corresponding hand-local offset; it never uses live head orientation to steer hip fire. Pitch/yaw/roll trim and reset are provided. Close-eye aim remains independently head-locked.

Synthetic normal-pickup regression: hand-following quaternion error 0, head-only hip-fire drift 0, neutral-capture orientation error 0. Saved grip re-pickup difference 0; ADS hand/trigger drift 0; head still moves ADS. Real-user comfortable-wrist alignment must be checked live.
