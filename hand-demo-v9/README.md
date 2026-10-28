# Separate brother demo (based on V20.2)

Production hand-combined-v20 files are unchanged. Phone inference uses the coordinate relay; rendering targets 60 FPS.

Demo controls are in the first settings foldout. Screen fitting translates fixed-length hands; head apparent eye span estimates distance without changing the calibrated mesh scale. Contact assistance raycasts the displayed mesh, with depth and lateral distance limits. It can falsely interpret overlap as contact. It is not metric depth sensing. Thumb surface orientation uses a second axis to stabilize roll, with manual twist and depth controls.

Local reference tests (images not redistributed):
- Cheek: https://www.clinicanovoa.es/images/bichectomia.jpg — hand detected; assisted hand reaches cheek.
- Scalp: https://shop.theheartworm.com/pages/eric-paul — one hand detected on top of head; the other is missed by the tracker in this reference.
- Forward hand: https://www.sport-express.ru/zozh/reviews/glaza-gimnastika-i-uprazhneniya-dlya-uluchsheniya-zreniya-kakie-produkty-polezny-i-kak-sohranit-zrenie-1940866/ — hand and face detected; projected overlap can trigger unwanted contact, so contact depth limit was reduced to 6 cm.

Limits: static references do not validate live occlusion recovery, physical contact or absolute distance. Alien and human proportions differ. The model can still miss a fully occluded hand or thumb.
