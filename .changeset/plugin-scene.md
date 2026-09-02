---
"@ai-gui/plugin-scene": minor
---

New package: `@ai-gui/plugin-scene` renders ` ```scene ` blocks as 3D scenes with three.js. The model places boxes, spheres, cylinders, cones, tori, capsules and planes in metres with y up; `anchor: "bottom"` puts a thing on the ground without the model halving its height. glTF/GLB files are supported through a `model` object, refused unless the host lists the file's exact origin in `allowedModelOrigins`.
