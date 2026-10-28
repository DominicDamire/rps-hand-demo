# Alien 18: size-only translation depth and back wall

Active hands-and-head page, preserving separate PC trackers and phone video transport. V20.2 comparison page is unchanged.

Hand root depth is proportional to fixed model palm size divided by apparent 2D palm size. Five wrist/knuckle spans exclude fingertip spread. Both hands share the same physical size reference. No initial scan, learned arm depth, world-coordinate translation-depth fitting, mask, Holistic, or hand-to-head snapping runs. Existing MediaPipe relative Z and finger constraints still articulate fingers; they do not determine root distance.

A camera-aligned plane behind the head's bounding box is the maximum depth. After articulation, the rigid hand meshes' bounds are checked and the whole hand is translated forward if necessary, preserving bone lengths. The plane follows head position/size/rotation; when the head is lost it retains the last plane, with a 60 cm fallback before first detection. The conservative bounds include empty box corners when rotated. This is a back limit, not surface contact or collision with the head. It also applies above and beside the head.

No extra inference models. Cached head-local bounds and rigid geometry bounds avoid per-frame skinning scans or raycasts for this limit. Palm turning edge-on can look smaller and therefore drive depth backward: that is a limitation of the requested size-only rule.

Tests: inverse size ratio, fingertip-spread independence, wall inequality and invalid-input fallback; browser fixture renders hands/head and exposes post-clamp back-wall clearance in fixture mode only. Phone performance still requires live testing.
