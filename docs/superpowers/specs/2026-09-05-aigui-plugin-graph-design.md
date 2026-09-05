# `@ai-gui/plugin-graph` — knowledge graphs and ontologies, in 2D and 3D

Date: 2026-09-05. Status: approved (approach A of three; see "Alternatives").

## Goal

A ```` ```graph ```` fence the model writes when an answer is about *things and how they relate*:
an org chart, a supply chain, a paper's citation neighbourhood, the classes of a domain and the
properties between them. The plugin draws it as a graph the reader can turn over — flat SVG by
default, a three.js model on request — and, when the block carries an ontology, checks the
instances against it.

Two layers in one JSON object, named with the RDFS words a model already knows:

```jsonc
{
  "classes":    [{ "id": "Person", "name": "人", "subClassOf": "Agent", "color": "#2563eb", "description": "…" }],
  "properties": [{ "id": "worksAt", "name": "任职于", "domain": "Person", "range": "Organization" }],
  "entities":   [{ "id": "alice", "name": "Alice", "type": "Person", "attrs": { "born": 1990 } }],
  "relations":  [{ "from": "alice", "to": "acme", "type": "worksAt" }],
  "view": "2d",            // "2d" | "3d", default "2d"
  "layer": "instances",    // "instances" | "ontology", default "instances"
  "focus": "alice",
  "caption": "…"
}
```

The **ontology layer** is the schema: classes with a `subClassOf` forest, properties with a
`domain` and `range`. The **instance layer** is the data: entities typed by class, relations typed
by property. Either may be absent — a plain entity–relation graph has no `classes`, a pure ontology
diagram has no `entities`.

## Non-goals

- No RDF/Turtle/OWL input. JSON only; the model writes it, the reader reads a picture.
- No `subPropertyOf`, inverse, symmetric or cardinality axioms. Domain/range is the one check.
- No live editing, no host callbacks in this version beyond `onEntityClick`.
- No layout persistence across re-renders beyond determinism (same block → same picture).

## Package

`packages/plugin-graph`, published as `@ai-gui/plugin-graph`, modelled on `plugin-gravity`
(zero-dependency SVG path) and `plugin-scene` (lazy three.js path).

- `dependencies`: `@ai-gui/core`, `three` (^0.185). `three` is marked `external` in tsdown and
  imported only inside `render3d.ts`, itself `import()`ed only when a 3D view is actually drawn.
  A page whose answers contain no 3D graph never downloads it.
- Added to: `vitest.workspace.ts` alias + project, `.changeset/config.json` fixed group, playground
  (`apps/playground`), README and AGENTS.md package tables, a `minor` changeset.

## Files

| file | purpose |
| --- | --- |
| `types.ts` | `GraphDefinition`, `ClassDef`, `PropertyDef`, `EntityDef`, `RelationDef`, `GraphOptions`, `Violation`, `GraphResult<T>` |
| `parse.ts` | JSON → `GraphDefinition`, or one error. Field whitelists, lengths, limits, id uniqueness, dangling refs. Implicit classes/properties. |
| `ontology.ts` | Pure functions over the schema: `ancestors(class)`, `isSubClassOf(a, b)`, `classColour(id)` (inherits up the chain), `checkRelations()` → `Violation[]`, `ontologyGraph()` (classes+properties as nodes/edges for drawing) |
| `layout.ts` | Fruchterman–Reingold spring–electrical layout, dimension 2 or 3, deterministic (FNV-1a seeds), steppable. One implementation for both views. |
| `hierarchy.ts` | Layered top-down layout for the `subClassOf` forest (ontology view in 2D). |
| `render2d.ts` | Layout → SVG string (pure), plus `mount2d()` adding hover/tooltip/zoom/pan on top of that SVG. |
| `render3d.ts` | three.js: spheres, lines, sprite labels, OrbitControls auto-rotate, raycast hover. Lazily imported. |
| `chrome.ts` | The two toggles (2D/3D, instances/ontology), the legend, the violation list, the caption. Framework-free DOM. |
| `prompt.ts` | `graphPromptSpec(locale)`, zh-CN and en, via `translate(PROMPT, locale, "spec")`. |
| `index.ts` | `graph(options)` plugin, `graphCss`, re-exports. |

## Parsing and validation (`parse.ts`)

Strict on shape, lenient on references:

- Unknown top-level or per-object keys → error naming the key (same style as gravity).
- `id` non-empty ≤ 64 chars; `name` ≤ 80; `type`/class ids ≤ 32; `description` ≤ 400;
  `attrs` values string | number | boolean, ≤ 32 keys, values ≤ 200 chars; `color` hex only.
- Duplicate ids within `classes`, within `properties`, within `entities` → error.
- `relations[i].from/to` must be entity ids → error otherwise (an edge to nothing cannot be drawn).
- `entity.type` naming an undeclared class, or `relation.type` naming an undeclared property →
  **implicitly declared** (`implicit: true`, `name = id`). Streaming models forget declarations;
  refusing the whole graph for that is worse than a class with no description.
- `subClassOf`, `domain`, `range` naming an undeclared class → implicit class too.
- A `subClassOf` cycle → error (the hierarchy layout needs a forest).
- `focus` must be an entity id (instances) or class id (ontology) or it is dropped silently.
- Limits (options, defaults): `maxEntities` 500, `maxRelations` 2000, `maxClasses` 64,
  `maxProperties` 64, `maxSourceBytes` 256 KiB. Exceeding → error saying which.
- Empty graph (no entities and no classes) → error.

Errors are rendered as the escaped message in `[data-aigui-graph-error]`, never the model's text.

## Ontology semantics (`ontology.ts`)

- `ancestors(id)`: the `subClassOf` chain, root last.
- `isSubClassOf(a, b)`: `a === b` or `b ∈ ancestors(a)`.
- `classColour(id, palette)`: the first explicit `color` found walking up the `subClassOf` chain;
  otherwise hashed from the class's own id (like bigscreen's `typeColour`), so two sibling classes
  without colours are told apart and the same class is the same colour in every block.
- `checkRelations(def)`: for each relation whose property has a `domain`, the `from` entity's
  class must be a subclass (inclusive) of it; likewise `range` and `to`. An entity with no type
  fails a constrained property. Each failure is a `Violation { relationIndex, side: "domain" |
  "range", expected, actual }`. Relations with implicit (unconstrained) properties never fail.
- `ontologyGraph(def)`: nodes = classes, edges = `subClassOf` (type `"subClassOf"`) plus one
  edge per property `domain → range` (type = property id). Used by both 2D hierarchy and 3D.

## Layout (`layout.ts`, `hierarchy.ts`)

`createLayout(ids, links, { dimensions: 2 | 3 })` — Fruchterman–Reingold as in bigscreen's
`layout3d.ts` (repulsion k²/d, attraction d²/k, origin gravity, cooling cap), generalised to a
`dimensions` parameter and rewritten here rather than imported cross-package. Seeds: hash on a
circle (2D) or sphere (3D). `layoutSteps(n)` interpolated 300 → 120 → 40 on the same anchors.
Positions returned normalised to a unit box so renderers only scale.

2D instances: run to completion synchronously at render time (500 nodes × 120 steps ≈ 30M pair
ops, ~100 ms; acceptable, and the SVG is then complete as a still). 3D: stepped in the frame loop
so the reader watches it settle, as bigscreen's orbit does.

Ontology view in 2D uses `hierarchy.ts`: roots on the top row, each class one row below its
parent, siblings spread by subtree width; property edges drawn as curved arrows between the placed
classes. In 3D the ontology view uses the force layout on `ontologyGraph()` (a tree in 3D reads
fine as force).

## 2D rendering (`render2d.ts`)

Pure `renderGraphSVG(def, layer, positions, palette)` → `{ svg, width, height }`:

- Node = circle, radius from degree (min 5, max 16) or `value`; fill by class colour; label under
  the circle, up to `labelBudget` (20) labels by degree, `focus` always labelled; the rest on hover.
- Edge = line with arrowhead marker (relations are directed), stroke by property colour, 0.6
  opacity; violating edges: red `#dc2626`, dashed, arrowhead red.
- Ontology view: class boxes (rounded rect with name) rather than circles; `subClassOf` edges as
  hollow triangle-head arrows (UML habit), property edges labelled with the property name.
- Legend: classes present (≤12 rows), top-right; ontology view legends properties instead.
- `interactive: false` (option) → html output, done. Default → `mount` output: hover highlights a
  node and its neighbours (others fade to 0.15), a tooltip (`[data-aigui-graph-tip]`) lists
  `name`, class, `attrs`, `description`; wheel zooms, drag pans (viewBox transform);
  double-click resets. `onEntityClick(entity)` option fires on click.

## 3D rendering (`render3d.ts`)

Mirrors `plugin-scene/render.ts` lifecycle: lazy `import("three")` + OrbitControls,
`ResizeObserver`, `destroy()` disposing geometry/material/renderer with `forceContextLoss`.

- Entity = `SphereGeometry` (radius by degree), `MeshStandardMaterial` in class colour.
- Relation = `LineSegments` sharing one `BufferGeometry` updated each frame while the layout steps;
  violating relations in a second red, dashed (`LineDashedMaterial`) segments object.
- Labels = canvas sprites (reuse the sprite technique from scene) for the top `labelBudget` nodes.
- Camera framed from the layout radius; `autoRotate` unless `rotate: false` or
  `prefers-reduced-motion`. Hover via `Raycaster` on `pointermove`: highlight + same tooltip DOM.
- When WebGL is unavailable (`canvas.getContext("webgl2"|"webgl")` null) the 3D toggle is disabled
  and the 2D view is shown, with a one-line note.

## Chrome (`chrome.ts`, `index.ts`)

The figure root `[data-aigui-graph]` holds: a toolbar (two segmented toggles, `2D | 3D` and
`实例 | 本体` / `Instances | Ontology`, localised via `context.locale`), the canvas host, the
legend, the violations list (`[data-aigui-graph-violations]`: "3 relations break the ontology"
then one line each: `alice —worksAt→ bob: range Organization, got Person`), and the caption.

Switching a toggle tears down the current view (calling its destroy) and mounts the other; the
layout for each (view, layer) pair is memoised per mount so flipping back is instant. The ontology
toggle is hidden when the block has no `classes`; the 3D toggle is hidden when `options.three ===
false` (host opt-out).

`isBlockComplete`: whole JSON object parses (same as gravity/scene). While streaming:
`[data-aigui-graph-loading]` skeleton.

Height: `options.height` default 420 px; width follows the container.

## Prompt spec (`prompt.ts`)

zh-CN and en. Rules that must survive editing:

1. When to emit: entities and relations, org/supply/citation/dependency graphs, domain models,
   "what is related to what". Not for flows/sequences (mermaid), not for numbers (chart).
2. Declare `classes` and `properties` first when the domain has a schema; give `domain`/`range` so
   the renderer can check the data — "the figure will mark relations that break them".
3. `from`/`to` are entity ids, `type` is a property id; ids short and ASCII-ish, `name` is what is
   shown, so Chinese goes in `name`.
4. Two worked examples: a small enterprise ontology with instances (shows a deliberate violation
   being caught), and a pure entity graph with `"view": "3d"`.
5. Limits, and what to do past them (summarise; do not emit 800 entities).

## Testing

vitest project `plugin-graph` (the DOM-touching tests set `// @vitest-environment jsdom`, as bigscreen's mount tests do):

- `parse.test.ts`: every error path; implicit declarations; limits; cycle detection; sanitiser
  (a `<img onerror>` key never reaches the error html).
- `ontology.test.ts`: ancestors/isSubClassOf, colour inheritance, `checkRelations` on domain,
  range, untyped entity, subclass-satisfies-superclass, implicit property never fails.
- `layout.test.ts`: determinism (same ids → same positions), 2D leaves z = 0, connected nodes end
  closer than unconnected, no NaN for coincident seeds, step budget by n.
- `hierarchy.test.ts`: roots row 0, child one row below parent, forest with two roots, no overlap.
- `render2d.test.ts`: SVG contains one circle per entity and one line per relation; violations are
  dashed red; focus labelled; ontology view draws boxes; legend rows bounded.
- `index.test.ts`: claims `graph` fence; skeleton while streaming; error html for bad input;
  `html` output when `interactive: false`; `mount` output otherwise; mount → toggles present, 3D
  toggle absent when `three: false`; destroy is idempotent; prompt spec carries the key rules.
- `mount3d.test.ts`: with `three` mocked (as bigscreen mocks echarts-gl), mounting 3D calls the
  renderer and destroy disposes it; no WebGL → falls back to 2D with the note.

## Alternatives considered

- **B — extend bigscreen's `graph3d` panel** with an ontology layer and a 2D mode. Rejected:
  graphs would only exist inside a ```` ```bigscreen ```` wall, and 3D would stay tied to the optional
  echarts-gl peer.
- **C — new package, 3D via echarts-gl.** Rejected: an extra ~800 KB optional peer, and echarts-gl's
  camera/label control is limited (see the workaround comments in `bigscreen/src/orbit.ts`).

## Follow-ups (not in this spec)

- Share `layout.ts` back into bigscreen instead of two copies.
- `subPropertyOf`, inverse properties, cardinality; SHACL-shaped constraints.
- Host-supplied graphs (a ```` ```graph ```` fence the host writes from CortexDB), streamed growth.
