---
"@ai-gui/plugin-bigscreen": minor
---

A `graph3d` panel is a 3D model now, not a flat hairball.

The new default, `mode: "orbit"`, lays the entities out in space with a spring–electrical
simulation written for this — repulsion between every pair, springs along the edges, a weak pull
to the origin so a disconnected component cannot leave the panel, and a falling temperature that
cools the graph into a shape. It is drawn as a `scatter3D` of entities and a `lines3D` of edges
inside an invisible cube, lit from both sides so the far half is still readable, with the camera
turning slowly around it. The layout is deterministic — the starting positions are a hash of the
node ids — and it is stepped a few steps per animation frame rather than run to convergence, so
the reader watches the clusters arrive instead of being handed a settled picture. Node colours,
the type legend, the tooltip and `events.onNodeClick` are unchanged.

A graph re-rendered from a growing fence resumes rather than reshuffles: the positions each graph
settled into are remembered by node id, so the twenty entities already on screen stay where they
are and only the three that just arrived have to find a place.

`mode: "flat"` keeps the previous `graphGL` picture, byte for byte and pinned by a test, for
graphs big enough that depth hides more than it shows. `rotate: false`, and a host's
`animate: false`, hand over the settled model without turning it.
