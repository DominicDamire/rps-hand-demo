# Alien 18.11 — one capture for both hands and head

The extended-hand capture still preserves the displayed hand wrist depth and applies one shared size reference to either hand. It now fits the head distance as well: captured wrist depth × observed palm span / model palm span × model eye span / observed face span. All image spans use image-height units. The existing head size multiplier is included; the physical model dimensions do not change. This is a one-time common camera-scale estimate, not an exact metric measurement.

After capture, each hand follows its own palm-size ratio. The head follows its own eye-span ratio with head-turn compensation. Moving a hand does not move the head. Saved coefficients never refit automatically. Existing v2 references remain usable, with a prompt to recapture to include the head. No manual-slider changes or additional settings. The video-sweep and historical archives are unchanged.

Tests cover either hand producing the same shared reference, unchanged initial wrist placement, correcting a deliberately wrong old head depth, relative size movement, head-turn compensation, missing face and saved-reference compatibility.
