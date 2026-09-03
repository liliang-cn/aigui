---
"@ai-gui/plugin-bigscreen": minor
---

A globe panel can now be drawn on a real earth. `bigscreen({ globe })` takes the host's planet: a
`baseTexture` (an equirectangular photograph the host serves itself), or a `countries` GeoJSON
FeatureCollection rasterised onto a 2:1 canvas in the screen's palette, plus `shading`,
`heightTexture`, `atmosphere` and a `light.time` that puts the terminator where the sun actually
is. With a host earth the points carry labels only for the largest few and the rest move to a
tooltip. The fence is unchanged — it still says only where the points and arcs are — and a host
that sets nothing gets the painted graticule it always got.
