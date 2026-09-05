# @ai-gui/plugin-graph

Knowledge graphs and ontologies for [AIGUI](../../README.md). The model writes entities and typed
relations — and, when the domain has a schema, the classes and properties they should obey. The
plugin draws the graph in 2D or 3D and marks every relation that breaks the ontology.

## Install

```sh
pnpm add @ai-gui/plugin-graph
```

The 2D figure is SVG and needs nothing beyond `@ai-gui/core`. The 3D view uses `three`, which is
a dependency of this package but is imported only when a 3D graph is actually drawn; a page whose
answers stay in 2D never downloads it. Pass `three: false` to hide the 3D view altogether.

## Usage

```tsx
import { graph } from "@ai-gui/plugin-graph"
import { buildSystemPrompt } from "@ai-gui/core"

<AIRenderer plugins={[graph()]} />

// The model has no prior for this block, so the spec is what makes it usable at all.
const system = buildSystemPrompt({ registry, plugins: [graph()], locale: "zh-CN" })
```

The model then emits:

````markdown
Acme 的组织关系如下；注意 Bob 的汇报线写成了"任职于"一个人，图里会标出来。

```graph
{
  "classes": [
    { "id": "Person", "name": "人" },
    { "id": "Organization", "name": "组织" }
  ],
  "properties": [
    { "id": "worksAt", "name": "任职于", "domain": "Person", "range": "Organization" }
  ],
  "entities": [
    { "id": "alice", "name": "Alice", "type": "Person", "attrs": { "title": "CTO" } },
    { "id": "bob", "name": "Bob", "type": "Person" },
    { "id": "acme", "name": "Acme", "type": "Organization" }
  ],
  "relations": [
    { "from": "alice", "to": "acme", "type": "worksAt" },
    { "from": "bob", "to": "alice", "type": "worksAt" }
  ],
  "focus": "alice"
}
```
````

## Why the protocol looks like this

**Two flat layers, RDFS words.** `classes` with `subClassOf`, `properties` with `domain` and
`range`, `entities` with a `type`, `relations` with `from`/`to`/`type`. A model already knows
these words and writes flat lists correctly far more often than nested triples. Either layer may
be missing: a plain entity graph has no `classes`; a concept model has no `entities`.

**Checked, not just drawn.** Every relation is tested against its property's `domain` and `range`,
with `subClassOf` honoured, so a `Dog` satisfies a domain of `Animal`. A relation that fails is
drawn red and dashed, and listed under the figure with what was expected and what was found. This
is the one piece of reasoning in the plugin, and it is the one that catches the mistake a model
actually makes.

**Lenient on references.** A class or property that is *used* but never *declared* is added
implicitly — a streaming model that declared four classes and used five has not written nonsense.
Only a relation whose end is not an entity is refused, because an edge to nothing cannot be drawn.

**Deterministic layout.** A hand-written spring–electrical layout in two or three dimensions,
seeded by a hash of the node ids. The same block draws the same picture twice running; nothing
calls `Math.random`. The 2D figure is laid out to completion before it is drawn and is complete as
a still; the 3D model settles in front of the reader.

**One block, four pictures.** The toolbar flips between `2D | 3D` and `实例 | 本体` (instances |
ontology). The ontology view draws the class hierarchy in rows with the properties as arrows
between classes; the instance view is the force layout. `view` and `layer` in the block choose
where it opens.

## Supported

| | |
| --- | --- |
| Ontology | `classes` (`id`, `name`, `subClassOf`, `color`, `description`), `properties` (`id`, `name`, `domain`, `range`, `color`, `description`) |
| Instances | `entities` (`id`, `name`, `type`, `value`, `attrs`, `description`), `relations` (`from`, `to`, `type`, `name`) |
| Top level | `view` (`2d` \| `3d`), `layer` (`instances` \| `ontology`), `focus`, `caption`, `rotate` |
| Interaction | hover highlights a node and its neighbours with a tooltip of its class, facts and edges; wheel zooms, drag pans, double-click resets; in 3D, drag turns the model |
| Limits (options) | `maxEntities` 500, `maxRelations` 2000, `maxClasses` 64, `maxProperties` 64, `maxSourceBytes` 256 KiB |
| Options | `height` (420), `labelBudget` (20), `interactive` (static SVG when `false`), `three` (hide 3D when `false`), `onEntityClick` |

Not in this version: `subPropertyOf`, inverse or symmetric properties, cardinality, and
RDF/Turtle input. Flows, sequences and state machines belong in
[`@ai-gui/plugin-mermaid`](../plugin-mermaid/README.md); a graph inside a data wall is the
`graph3d` panel of [`@ai-gui/plugin-bigscreen`](../plugin-bigscreen/README.md).
