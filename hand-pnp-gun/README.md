# Aligned PnP gun lab

This page uses the existing PnP lab, camera/phone input, calibration, aligned hand geometry and visible joint lines. It reuses gun.glb and the authored released, pressed and thumb-up profiles from gun-lab. The original grip editor and range are unchanged.

Close the lower three fingers to pick up; open them to return the gun. The gun stays fixed relative to the middle knuckle, including after calibration scaling. Thumb and index interpolate only between the supplied endpoint poses; lower three fingers remain fixed. Tracking loss disarms shooting and preserves the grip. Left-hand holding mirrors the right-hand placement.

Inspection buttons show the same limited grip without a camera. These are authored pose stops, not a general mesh collision simulation. Reference-derived hand proportions are retained; physical scale and camera intrinsics remain estimates unless calibrated.

Validation: gun-check.mjs checks 60 combinations of side, orientation, index and thumb; fixed gun placement, lower-finger invariance, bone lengths, calibration scaling, pickup, release and loss. Existing gun-lab trigger and held-pose tests cover endpoints and rearming. Rotation regression tests are in ../hand-pnp-photo/rotation-check.mjs.
