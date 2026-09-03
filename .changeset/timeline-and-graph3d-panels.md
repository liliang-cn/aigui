---
"@ai-gui/plugin-bigscreen": minor
---

Two panels for provenance: `timeline` and `graph3d`.

`timeline` gives every source its own swim-lane and every claim its own point, with a line drawn
between claims that are related — `contradicts` in the palette's danger red, which is the picture
the panel exists for: two outlets said things that cannot both be true, and the red segment runs
between their two rows. Lanes stay in the order they were written, time runs across, the twelve
claims with the most empty space around them carry a label and the rest are one hover away, and a
claim with a `url` opens it on click. Up to 24 lanes, 500 claims and 500 links; `at` is ISO 8601;
`url` must be `http` or `https`, because that string reaches `window.open`.

`graph3d` draws entities and typed edges as a knowledge graph, laid out by force-atlas2 on the GPU
through `echarts-gl`'s `graphGL`. A type's colour is a hash of its name, so `outlet` is the same
colour in every panel on the wall whatever order the types appear in, and `types` pins any of them
to a colour of its own. Nodes are sized by degree or by `value`, the twenty busiest carry a label
along with `focus`, the types are keyed in the panel's corner in HTML over the canvas, and
`rotate` says whether the layout settles in front of the reader or arrives settled. Up to 2000
nodes and 5000 edges — a graph near that size also needs the host to raise `maxSourceBytes`.
Without the optional `echarts-gl` peer the panel shows the same one-line note the globe does.

New `bigscreen({ events })`: `onItemClick` takes a timeline click, `url` and all, and `onNodeClick`
gives a host something to do with an entity — a node is not a link, so there is no default.
