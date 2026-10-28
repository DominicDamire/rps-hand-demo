# Fixed 0.092535 comparison

Isolated copy of Sweep 2.4.18. The only depth-estimator change is replacing observation.scale with 0.09253574734794362. Rotation correction and sweep joint head/hand calibration are retained. This is a scale coefficient, not meters or a palm length. It is not multiplied by the model/camera scale. It may produce worse projection at another camera field of view. Saved settings and captures are isolated from the main sweep.
