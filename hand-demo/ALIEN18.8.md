# Alien 18.8

Manual calibration: adjust the camera distance for both wrists and the head, then Save manual calibration. Values and mode persist in this browser. Wrist/head depth stays fixed; X/Y movement, head/shoulder rotation and finger articulation continue. Manual mode bypasses palm-size root-depth estimation, back-wall correction, automatic hand contact, head contact and exterior collisions. Automatic controls are disabled while manual mode is active.

Automatic hands-together correction is OFF by default. This helper exists only in the Alien hands/head page and was introduced in 18.6. A one-time migration resets previously saved on states to off; explicitly enabling it afterward remains possible. The separate recorded-sweep calibration and OpenCV pages do not run this continuous contact helper.

When explicitly enabled, the helper fits two independent camera-ray distances, allowing both hands to move toward the camera together. A stable contact candidate is retained across frames; confirmed contact is closed after interpolation. Whole-hand translations preserve physical size and articulation. Image proximity is a heuristic, not proof of physical touch.

Head contact and outer hand-to-hand collisions are separate opt-in toggles, both off by default. Collision uses convex exterior shells for head, neck, shoulders, palm and finger segments. Eyes, internal face features and same-hand self-collision are excluded. Convex shells are conservative approximations of the outer surface; they do not reproduce every concavity. The older sparse joint-to-head raycast correction is replaced by these shells.

The 70% MCP sideways-bend restriction from 18.7 and default-off relaxed palm remain. Tracking workers, phone video transport and camera/FPS settings are unchanged.
