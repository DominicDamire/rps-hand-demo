# Five live comparison methods

Open `hand-compare/` for five method tabs with a PnP/Sweep selector. Each visit and Restore tested defaults starts the preset. Controls remain available in existing settings tabs. Experimental fitting can be disabled to compare against direct tracking.

1. archive: original DollRig geometry; archived direct driver (comparison baseline 64f5916); plane lock and base splay on.
2. reference: Image 1 geometry; same archived driver and constraints.
3. direct: Image 1; current direct driver, assistance off.
4. rays: Image 1; fixed-length image-ray fitting, assistance off.
5. angles: Image 1; fixed-length 2D direction fitting, assistance off.

All test presets: finger noise/smoothing/jump thresholds/coupling zero, thickness 1, tip inset 0, contacts/collisions off. Sweep archive/reference retain false-depth correction from their earlier comparison run. Other presets use it off. PnP retains its existing solver ordering, so its upstream false-depth toggle is ineffective (labelled). Live tracker/camera infrastructure is the current app, not a full historical snapshot. Temporal inference differs from independent-frame tests.

Comparison entrypoints are copies of the current lab entrypoints, with variant-specific driver/model selection and settings UI. Shared production lab entrypoints are unchanged. Comparison preference keys are separate for assistance and combined settings. Keep these entrypoints in sync with future shared infrastructure changes.

The two fitting modes bypass incompatible finger constraints; disable fitting to use those controls. The angle method preserves screen segment direction and fixed bone lengths, searches depth with the tracker as a preference, and does not fit finger-base positions. Side-view plausibility is not guaranteed.

Current defaults (user update): all switches in settings tabs OFF except shoulder rotation lock. Experimental fitting switches also OFF; enable explicitly for methods 4/5. Earlier test presets above document history, not current startup.

Baseline restored: each method again starts with its tested defining behavior (archive/reference constraints, rays/angles fitting enabled). Two hands, head display and shoulder rotation lock start on for every variant. The all-off defaults above are superseded.
