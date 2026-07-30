# AGENTS.md — working with the AIGUI SDK

This guide has two independent parts. Read the one that matches your job:

- **Part A** — you are a coding agent **integrating** `@ai-gui` into a project.
- **Part B** — you are the **LLM generating content** that an AIGUI frontend will render.
- **Part C** — you are **maintaining this repo** and need to release it.

For the human-facing overview see [README.md](./README.md); for the checklist form see [SKILL.md](./SKILL.md).

---

## Part A — Integrating the SDK

AIGUI renders a streaming LLM response as live UI. A headless core (`@ai-gui/core`) parses the stream into an AST; a thin adapter renders it in your framework; plugins add block types (math, charts, diagrams, …).

### 1. Pick the adapter and install

| Framework | Adapter | Install |
| --- | --- | --- |
| React | `@ai-gui/react` | `pnpm add @ai-gui/core @ai-gui/react` |
| Vue | `@ai-gui/vue` | `pnpm add @ai-gui/core @ai-gui/vue` |
| vanilla DOM | `@ai-gui/vanilla` | `pnpm add @ai-gui/core @ai-gui/vanilla` |

Add any plugins you need: `@ai-gui/plugin-ui`, `@ai-gui/plugin-katex`, `@ai-gui/plugin-highlight`, `@ai-gui/plugin-mermaid`, `@ai-gui/plugin-molecule`, `@ai-gui/plugin-map`, `@ai-gui/plugin-primitives`, `@ai-gui/plugin-chart`, `@ai-gui/plugin-form`, `@ai-gui/plugin-citation`, `@ai-gui/plugin-artifact`.

### 2. Register cards

A **card** is an app-defined widget. You own the schema and the render component; the LLM only fills in the data. Register each card type on a `CardRegistry`:

```ts
import { CardRegistry } from "@ai-gui/core"

const registry = new CardRegistry()
registry.register({
  type: "weather",                 // fence type → ```card:weather
  description: "Weather summary",   // shown to the model in the system prompt
  schema: { type: "object", properties: { city: { type: "string" }, tempC: { type: "number" } } },
  example: { city: "Tokyo", tempC: 24 },
  render: /* framework component (React/Vue) or (data, { onAction }) => HTMLElement (vanilla) */,
})
```

- React card render: a component receiving `{ data, onAction }`.
- Vue card render: a component with props `data`, `emits: ['action']`.
- Vanilla card render: `(data, { onAction }) => HTMLElement`.

### 3. Mount the renderer

React:

```tsx
import { AIRenderer } from "@ai-gui/react"
const ref = useRef(null)
<AIRenderer ref={ref} registry={registry} plugins={plugins} onCardAction={handle} />
// ref.current.push(chunk) / feed(source) / reset()
```

Vue:

```vue
<AIRenderer ref="r" :registry="registry" :plugins="plugins" @card-action="handle" />
<!-- r.value.push / feed / reset via the exposed template ref -->
```

Vanilla:

```ts
import { createRenderer } from "@ai-gui/vanilla"
const r = createRenderer(el, { registry, plugins, onCardAction: handle })
// r.push / r.feed / r.reset / r.destroy
```

### 4. Wire `onCardAction` to real APIs

Card buttons are **declarative**: they emit an action, they do not call anything. Your handler receives `{ type, params, cardType }` and makes the real request. **The LLM never issues the request** — it only names the action.

```ts
function handle({ type, params, cardType }) {
  if (cardType === "weather" && type === "refresh") {
    void refetchWeather(params.city)
  }
}
```

### 5. Add plugins

Pass plugin instances to the adapter. Each claims its block types and renders framework-neutral output; the core sanitizes all HTML.

```ts
import { katex } from "@ai-gui/plugin-katex"
import { highlight } from "@ai-gui/plugin-highlight"
import { mermaid } from "@ai-gui/plugin-mermaid"
import { primitives } from "@ai-gui/plugin-primitives"
import { chart } from "@ai-gui/plugin-chart"
import { citation } from "@ai-gui/plugin-citation"
import { ArtifactStore, artifact } from "@ai-gui/plugin-artifact"
import { ui } from "@ai-gui/plugin-ui"
import { molecule } from "@ai-gui/plugin-molecule"
import { map } from "@ai-gui/plugin-map"

const artifactStore = new ArtifactStore()
const plugins = [ui({ registry, actionRuntime }), katex(), highlight(), mermaid(), molecule(), map(), chart({ interactive: true }), primitives(), citation(), artifact({ store: artifactStore })]
```

Diagrams, maths and charts are the heaviest thing a page carrying them loads. To keep them out of the first load, pass a loader instead of an array — the answer renders as plain markdown until it resolves, and the renderer then reparses the text it has buffered:

```ts
const loadPlugins = () => Promise.all([
  import("@ai-gui/plugin-katex"),
  import("@ai-gui/plugin-mermaid"),
]).then(([k, m]) => [k.katex(), m.mermaid()])
```

Every plugin's `css` is injected by the renderer, once per plugin name. The two exceptions are `@ai-gui/plugin-map/style.css` and `@ai-gui/plugin-katex/style.css`, whose CSS points at files by a path only a bundler can resolve; import those yourself.

### 6. Build the system prompt

Assemble the model's guidance from the **same** registry and plugins, then prepend it to your system prompt. This is what tells the model which cards and blocks exist.

```ts
import { buildSystemPrompt } from "@ai-gui/core"
const system = buildSystemPrompt({ base: "You are a helpful assistant.", registry, plugins })
```

The backend is language-agnostic: it just streams text with this prompt prepended. Nothing about AIGUI needs to live server-side.

### 7. Stream the response into the renderer

`feed` accepts an `AsyncIterable<string>` or a `ReadableStream` (e.g. `fetch().body`). Reset before a new turn.

```ts
const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ system, prompt }) })
ref.current.reset()
await ref.current.feed(res.body)     // renders progressively as tokens arrive
```

Streaming behavior you get for free: markdown renders progressively with in-memory repair of half-typed syntax; blocks (cards, charts, math, mermaid) show a loading skeleton while they stream and then render complete. Charts/3D are complete-gated (skeleton → full), never partial-drawn.

---

## Part B — Generating content

You are the LLM. Your output is rendered by an AIGUI frontend. Write **normal markdown**. On top of markdown you may emit a few **fenced blocks** — but **only** the ones that are registered/enabled for this app (they are listed in your system prompt via `buildSystemPrompt`). If a block type is not listed, do not use it; write plain markdown instead.

### Cards — ` ```card:<type> `

A card is an app-defined widget. Emit a fenced block whose info string is `card:<type>` and whose body is JSON **data only** (match the fields/example given in your system prompt). Do not invent card types.

    ```card:weather
    { "city": "Tokyo", "tempC": 24 }
    ```

**Buttons are declarative.** Never claim you performed an action or made a request. A card's buttons carry an `action` name plus `params`; the app performs the real work when the user clicks. You only supply the data.

### Generated UI — ` ```ui `

Emit at most one strict JSON UI tree when the app enables it:

    ```ui
    {"version":1,"id":"search","state":{"query":""},"root":{"kind":"stack","id":"root","children":[{"kind":"heading","id":"title","level":2,"text":"Search"},{"kind":"form","id":"form","submit":{"type":"search.run"},"children":[{"kind":"field","id":"query","bind":"query","fieldType":"text","label":"Query","required":true}]},{"kind":"card","id":"summary","type":"search-summary","data":{"query":{"$state":"query"}}}]}}
    ```

Use only the node kinds, actions, cards, and fields listed in the system prompt. The only binding syntax is `{"$state":"key"}`. Never emit HTML, Markdown nodes, CSS, JavaScript, URLs, expressions, conditions, loops, imports, remote components, workflows, or artifact commands inside a UI tree.

### Charts — ` ```chart `

A fenced block containing an ECharts option JSON:

    ```chart
    { "xAxis": { "type": "category", "data": ["A", "B"] },
      "yAxis": { "type": "value" },
      "series": [{ "type": "bar", "data": [1, 2] }] }
    ```

If the app enabled `gl` mode, 3D series are available (`bar3D`, `scatter3D`, `surface`, `line3D`, `globe`, `map3D`), e.g. `"series":[{"type":"surface", ...}]`.

### Primitive UI blocks

Data-driven blocks, each a fence + JSON:

    ```list {"items":["one","two","three"]}```
    ```table {"headers":["City","°C"],"rows":[["Tokyo",24],["Oslo",9]]}```
    ```key-value {"pairs":{"status":"ok","count":3}}```
    ```layout {"direction":"row","items":[...]}```

### Math — `$…$` / `$$…$$`

Inline `$E = mc^2$`, or a block:

    $$\int_0^1 x^2 \,dx = \tfrac{1}{3}$$

### Diagrams — ` ```mermaid `

    ```mermaid
    graph TD; A-->B; A-->C;
    ```

### Molecules — ` ```molecule `

    ```molecule
    {"version":1,"format":"smiles","source":"CCO","view":"2d","highlight":{"atoms":[2]}}
    ```

Use SMILES for 2D structures. Use a local Molfile for 2D or 3D; 3D requires real finite non-flat coordinates. Never emit structure URLs, scripts, network requests, remote resources, HTML, shaders, callbacks, or credentials.

### Maps — ` ```map `

    ```map
    {"version":1,"ariaLabel":"Route map","layers":[{"id":"cities","type":"markers","items":[{"id":"a","position":[116.4,39.9],"label":"Beijing"}]},{"id":"route","type":"route","coordinates":[[116.4,39.9],[121.47,31.23]],"label":"Route"}]}
    ```

Coordinates are `[longitude, latitude]`. Use only inline GeoJSON, markers, and routes. Never emit tile URLs, tokens, remote GeoJSON, geocoding requests, HTML, scripts, CSS, images, callbacks, or arbitrary map options. Basemaps and network access are host-controlled.

### Sources — ` ```sources `

    ```sources
    {"sources":[{"id":"docs","title":"AIGUI documentation","url":"https://github.com/liliang-cn/aigui"}]}
    ```

Use only the fields documented by the enabled plugin. Do not put HTML, scripts, actions, credentials, or unsafe URLs in source data.

### Artifacts — ` ```artifact-create ` / ` ```artifact-update `

Create a persistent generated document:

    ```artifact-create
    {"version":1,"operationId":"create-guide","artifact":{"id":"guide","title":"Guide","filename":"GUIDE.md","kind":"markdown","content":"# Guide"}}
    ```

Update it using the exact current revision:

    ```artifact-update
    {"version":1,"operationId":"update-guide-r1","id":"guide","baseRevision":0,"content":"# Revised guide"}
    ```

Artifact commands are declarative. Never claim a command succeeded. Do not emit HTML execution, scripts, components, actions, network requests, filesystem paths, or package installation instructions as executable artifact behavior. Code artifacts are inert source previews.

### The one rule

Only emit registered cards and enabled block types (per your system prompt). Everything else is plain markdown. Keep UI/card/chart/molecule/map/primitive/source/artifact bodies as valid JSON.


---

## Part C — Releasing

**Never run `npm publish` here.** Releases go through
[`.github/workflows/release.yml`](.github/workflows/release.yml), triggered by pushing a
`vX.Y.Z` tag. The npm token lives in the `NPM_TOKEN` repository secret; the token in a
local `~/.npmrc` is not the one that works.

```sh
# 1. bump every public package to the same new version
pnpm changeset version        # or edit versions by hand — they must all match

# 2. commit, tag, push
git commit -am "chore: release v0.20.2"
git tag v0.20.2 && git push origin main --tags
```

The workflow then runs `validate:release-tag` → `build` → `typecheck` → `test:unit` →
`validate:packages` → `pnpm -r publish --access public --provenance`.

Two constraints that will fail a release if ignored:

- **Every public package shares one version, and the tag equals it.**
  `scripts/release-tag.mjs` enforces this. A new package therefore cannot be released
  on its own tag — bump the whole workspace. `pnpm -r publish` skips versions already on
  the registry, so the packages that have not changed are not republished.

- **`npm publish` would ship `"@ai-gui/core": "workspace:*"` verbatim** and break every
  install. Only pnpm/changesets rewrite the workspace protocol.

### Adding a new package

`files` in `package.json` lists `README.md`, `LICENSE` and `CHANGELOG.md`. Create all
three — `pnpm validate:packages` runs publint, which does not check for them, and a
package published without a README serves a blank page on npm.

After a **first-ever** publish, `pnpm install` may fail with `ERR_PNPM_FETCH_404` for a
few minutes while `npm view` on the same package succeeds. That is npm's
abbreviated-packument CDN lagging, not a broken publish.
