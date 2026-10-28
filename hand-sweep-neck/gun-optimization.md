# Gun rendering optimization

The original gun.glb contains 13,888 triangles in 26 primitives (1,789,908 bytes). With the ammunition hidden by the existing editor, the isolated render submits 13,534 triangles and 25 draw calls.

Static opaque parts are now batched by material on the editor visual clone: 13,534 submitted triangles and 5 draw calls. Trigger_low and Sight_glass_low remain separate. Original asset, source grip rig, saved grip transforms, muzzle and sight anchors are unchanged.

Validation: original/optimized visual comparison; identical quantized triangle-vertex multiset at 0.001 asset units (small floating-point transform rounding prevents bit-exact equality); trigger and glass retained; editor initializes; eight gun-state tests pass. This measures draw-call reduction, not an FPS improvement or proof the gun caused tracking lag. Batching performs once at startup, not each frame. No polygon decimation.
