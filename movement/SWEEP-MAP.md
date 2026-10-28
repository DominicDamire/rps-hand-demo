# Sweep tracking on the movement map

Open sweep.html?v=map9. Reuses Sweep 2.4.18 depth, calibration, constrained two-hand articulation and the current smooth hand geometry. Uses the head/shoulder bust only. The original movement page remains available.

The existing thumb/index joystick and 120 ms walking filter drive the original map collision/step code. Arrow controls also walk; Q/E turns. Eye translation is relative to the first valid calibrated eye midpoint; Centre tracked eyes resets that reference. The eye camera defaults to 90 degrees vertical FOV, adjustable 50–120. FOV does not change the camera used by the tracker/calibration. Eye placement inherits monocular scale/intrinsic uncertainty; it is not an independent physical eye measurement.

The saved gun composition uses the recent provided grip profiles and GripController, retaining index/thumb stops and lower-finger lock. Its barrel ray drives the original map targets/hit effects. Pickup is the existing grip gesture, not proximity-based physical grabbing. Mirror sees the bust while first person excludes its own head mesh. Calibration temporarily returns to the Sweep view.

Validation: 46 existing movement/grip/trigger tests pass; browser verifies map loading, face/two-hand inference, FOV slider and the supplied barrel ray hitting an original target. Full live hand-to-neck calibration and shooting while walking require camera testing.
