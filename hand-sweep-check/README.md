# Sweep Raw Size Check 2

Live depth = fixed median model wrist/base-knuckle edge length × focal scale / raw median image edge spacing. Fingers are excluded. No PnP or angular size compensation runs in this page. MediaPipe palm normal only rejects tilted/uncertain observations (absolute facing below 0.45); hold the previous usable depth until a reliable observation returns. This does not resolve arbitrary rotation or tracking errors.

The near and neck steady captures, before/after switch, optional camera-to-shoulders scale and independent fingertip check are retained. Calibration scales the hands and head together and offsets the head. Optional contact/collision controls remain separate from the estimator and can alter rendered placement when enabled.

PnP Simple Check is unchanged. The original Sweep 2.4.18 is unchanged.
