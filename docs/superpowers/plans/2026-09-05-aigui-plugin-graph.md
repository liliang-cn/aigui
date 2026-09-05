# `@ai-gui/plugin-graph` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ```` ```graph ```` fence that draws a knowledge graph (entities + typed relations) with an optional ontology (classes + properties with domain/range), in 2D SVG or a 3D three.js model, and marks the relations that break the ontology.

**Architecture:** Pure modules first (parse → ontology → layout/hierarchy → SVG string), then a framework-free DOM shell (`chrome.ts`) that hosts either the interactive 2D SVG or the lazily imported three.js renderer and lets the reader flip 2D/3D and instances/ontology. Modelled on `plugin-gravity` (zero-dep SVG, `translate` prompt bundle) and `plugin-scene` (lazy `import("three")`, disposal, `forceContextLoss`).

**Tech Stack:** TypeScript, `@ai-gui/core` (`AIGuiPlugin`, `translate`), `three` ^0.185 (external, lazy), vitest (+ `// @vitest-environment jsdom` for DOM tests), tsdown.

Spec: `docs/superpowers/specs/2026-09-05-aigui-plugin-graph-design.md`.

---

## File map (`packages/plugin-graph/src/`)

| file | exports (contract) |
| --- | --- |
| `types.ts` | `ClassDef {id,name,subClassOf?,color?,description?,implicit?}`, `PropertyDef {id,name,domain?,range?,color?,description?,implicit?}`, `EntityDef {id,name,type?,value?,attrs?,description?}`, `RelationDef {from,to,type?,name?}`, `GraphView = "2d"\|"3d"`, `GraphLayer = "instances"\|"ontology"`, `GraphDefinition {classes,properties,entities,relations,view,layer,focus?,caption?,rotate}`, `GraphOptions {height?,maxEntities?,maxRelations?,maxClasses?,maxProperties?,maxSourceBytes?,interactive?,three?,labelBudget?,onEntityClick?}`, `Violation {relation:number,side:"domain"\|"range",expected:string,actual?:string}`, `GraphError {code,message}`, `GraphResult<T>` |
| `parse.ts` | `parseGraph(source, options): GraphResult<GraphDefinition>` |
| `ontology.ts` | `ancestors(def,id): string[]`, `isSubClassOf(def,a,b): boolean`, `classColour(def,id,palette): string`, `propertyColour(def,id,palette): string`, `checkRelations(def): Violation[]`, `ontologyGraph(def): {nodes: LayoutNode[], links: LayoutLink[]}`, `instanceGraph(def)` same shape |
| `layout.ts` | `hash(s)`, `layoutSteps(n)`, `createLayout(nodes, links, {dimensions})` → `{step(n), positions(): Float32Array, done, steps, taken}`; `settle(nodes, links, dims): Float32Array` (runs to completion); positions always stored as xyz triples, z = 0 in 2D |
| `hierarchy.ts` | `hierarchyLayout(def): Map<string,[x,y]>` unit-box coordinates for classes by `subClassOf` depth |
| `palette.ts` | `Palette {node,edge,label,muted,violation,series[],bg}`, `palette(theme)` |
| `render2d.ts` | `renderGraphSVG(def, layer, positions, palette, opts): {svg,width,height}`; `mount2d(host, def, layer, palette, opts): {destroy()}` — hover/tooltip/zoom/pan on top of the SVG |
| `render3d.ts` | `mount3d(host, def, layer, palette, opts): Promise<{destroy()}>` (imports three) |
| `chrome.ts` | `mountGraph(el, def, ctx, opts): () => void` — toolbar, legend, violations, caption, switching |
| `prompt.ts` | `graphPromptSpec(locale)` |
| `index.ts` | `graph(options)`, `graphCss`, re-exports |

## Tasks

### Task 1: Scaffold the package
- [ ] `packages/plugin-graph/{package.json,tsconfig.json,tsdown.config.ts,LICENSE,README.md}` copied from plugin-scene, name/description/keywords changed, `three` dependency kept, tsdown `external: ["three"]`.
- [ ] `vitest.workspace.ts`: alias `@ai-gui/plugin-graph` → `packages/plugin-graph/src/index.ts`; project `{ name: "plugin-graph", root: "packages/plugin-graph" }`.
- [ ] `.changeset/config.json`: add `@ai-gui/plugin-graph` to the fixed group. `.changeset/plugin-graph.md`: `"@ai-gui/plugin-graph": minor`.
- [ ] `pnpm install` (links the workspace package). Commit `chore(graph): scaffold @ai-gui/plugin-graph`.

### Task 2: types + parse (TDD)
- [ ] `parse.test.ts`: valid minimal graph; unknown top-level key; unknown entity key; missing id; duplicate entity id; relation to unknown entity → error; entity type undeclared → implicit class; relation type undeclared → implicit property; `subClassOf` cycle → error; domain/range undeclared → implicit; limits (`maxEntities` 2 with 3 entities); `too-large`; `invalid-json`; empty graph error; `view`/`layer` validation; `focus` dropped when unknown; attrs shape (object with primitives, rejects nested); `<img` in a key never reaches the message unescaped (message contains key but index.ts escapes — test at index level).
- [ ] Run, fail. Implement `types.ts`, `parse.ts`. Run, pass. Commit `feat(graph): parse graph definitions`.

### Task 3: ontology (TDD)
- [ ] `ontology.test.ts`: `ancestors` chain order; `isSubClassOf` reflexive + transitive; `classColour` inherits explicit colour from ancestor, hashes otherwise, stable across calls; `checkRelations`: domain violation, range violation, subclass satisfies, untyped entity violates constrained property, implicit property never violates, unconstrained side ignored; `ontologyGraph` yields one node per class and `subClassOf` links + property links; `instanceGraph` one node per entity.
- [ ] Implement `palette.ts`, `ontology.ts`. Pass. Commit `feat(graph): ontology checks and colours`.

### Task 4: layout (TDD)
- [ ] `layout.test.ts`: determinism; 2D z = 0 everywhere; coincident ids do not produce NaN; an edge's ends are closer than an average unconnected pair on a 3-component graph; `layoutSteps` anchors 300/120/40 and monotone; `settle` returns `done`.
- [ ] Implement `layout.ts` (FR generalised to `dimensions`). Pass. Commit `feat(graph): deterministic force layout in 2D and 3D`.

### Task 5: hierarchy (TDD)
- [ ] `hierarchy.test.ts`: roots at y = 0 row; child exactly one row below its parent; two roots side by side; siblings distinct x; classes without relations still placed; result normalised into unit box [0,1].
- [ ] Implement `hierarchy.ts`. Pass. Commit `feat(graph): layered layout for class hierarchies`.

### Task 6: 2D SVG (TDD)
- [ ] `render2d.test.ts` (pure string): one `<circle data-graph-node>` per entity, one `<line|path data-graph-edge>` per relation; violating edge has `data-violation` and dashed stroke; focus node always has a `<text>`; label budget respected (30 entities, budget 5 → ≤ 6 labels incl. focus); ontology layer draws `<rect data-graph-class>` per class and subClassOf edges `data-edge-type="subClassOf"`; legend rows ≤ 12; text is escaped.
- [ ] Implement `renderGraphSVG`. Pass. Commit `feat(graph): 2D SVG rendering`.

### Task 7: interactive 2D mount (TDD, jsdom)
- [ ] `mount2d.test.ts`: mounting appends an svg; pointerenter on a node adds `data-active` and shows a tip containing the entity name and an attr; pointerleave hides it; wheel changes the viewBox; click calls `onEntityClick` with the entity; destroy removes listeners (second hover does nothing) and the svg.
- [ ] Implement `mount2d` in `render2d.ts`. Pass. Commit `feat(graph): hover, tooltip, zoom and pan`.

### Task 8: chrome + plugin (TDD, jsdom)
- [ ] `index.test.ts`: claims `graph`; skeleton while streaming; error html for invalid input with `trusted: true` and escaped text; `interactive: false` → html output containing the svg and violations list; default → mount; mounted root shows toolbar with two toggles, ontology toggle absent when no classes, 3D toggle absent with `three: false`; violations list text `alice —worksAt→ bob`; clicking ontology toggle replaces circles with rects; destroy idempotent; `isBlockComplete`.
- [ ] Implement `chrome.ts`, `index.ts` (css, plugin). Pass. Commit `feat(graph): the graph plugin and its chrome`.

### Task 9: 3D (jsdom, three mocked)
- [ ] `mount3d.test.ts`: `vi.mock("three", …)` with a minimal fake (Scene, Group, WebGLRenderer with domElement + dispose + forceContextLoss, PerspectiveCamera, SphereGeometry, MeshStandardMaterial, Mesh, BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial, LineDashedMaterial, Sprite, SpriteMaterial, CanvasTexture, Raycaster, Vector2, Vector3, Color) and `vi.mock("three/examples/jsm/controls/OrbitControls.js")`; mount3d resolves, appends the canvas, destroy disposes renderer and calls forceContextLoss; when `HTMLCanvasElement.prototype.getContext` returns null the chrome falls back to 2D and shows `[data-aigui-graph-note]`.
- [ ] Implement `render3d.ts`; wire into `chrome.ts`. Pass. Commit `feat(graph): three.js 3D view`.

### Task 10: prompt spec (TDD)
- [ ] `prompt.test.ts`: zh spec contains `domain`, `range`, `"view": "3d"`, "不符合本体" and two ```` ```graph ```` examples; en spec contains "domain", "range"; `buildSystemPrompt({ plugins:[graph()], locale:"zh-CN" })` includes it.
- [ ] Implement `prompt.ts`. Pass. Commit `feat(graph): model-facing spec`.

### Task 11: integration
- [ ] Playground: dependency, import, plugin list, a `## Knowledge graph & ontology` example block with a deliberate violation.
- [ ] README.md tables (two rows), AGENTS.md install list + import example, package README.
- [ ] `pnpm build && pnpm typecheck && pnpm test:unit && pnpm validate:packages`. Commit `feat(graph): playground, docs`.
