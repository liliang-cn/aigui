import "./style.css"
import "@ai-gui/plugin-map/style.css"
import { createElement } from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { createApp, defineComponent, h, ref, type App } from "vue"
import { ActionRegistry, CardRegistry, createActionRuntime, type AIGuiPlugin, type DebugEventTarget } from "@ai-gui/core"
import { createDevTools, createStreamSimulator, type DevTools, type StreamSimulator, type TimelineEvent } from "@ai-gui/devtools"
import { citation } from "@ai-gui/plugin-citation"
import { ArtifactStore, artifact } from "@ai-gui/plugin-artifact"
import { ui } from "@ai-gui/plugin-ui"
import { mermaid } from "@ai-gui/plugin-mermaid"
import { molecule } from "@ai-gui/plugin-molecule"
import { map } from "@ai-gui/plugin-map"
import { solid } from "@ai-gui/plugin-solid"
import { AIRenderer as ReactAIRenderer, type AIRendererHandle as ReactHandle } from "@ai-gui/react"
import { AIRenderer as VueAIRenderer } from "@ai-gui/vue"
import { createRenderer, type VanillaRenderer } from "@ai-gui/vanilla"
import { exportReproduction, loadReproduction, type PlaygroundAdapter } from "./reproduction"

const DEFAULT_MARKDOWN = `# Stream laboratory

Edit this Markdown, then inspect how repair, parsing and patch dispatch evolve.

- UTF-8: 你好, مرحبا, 🙂
- **Progressive markdown** remains readable while chunks arrive.

\`\`\`card:demo
{"id":"counter-1","title":"Interactive card","count":3}
\`\`\`

\`\`\`sources
{"sources":[{"id":"aigui-docs","title":"AIGUI documentation","url":"https://github.com/liliang-cn/aigui"}]}
\`\`\`

## Generated interface

\`\`\`ui
{"version":1,"id":"service-planner","state":{"service":"short-links","replicas":3,"durable":true},"root":{"kind":"stack","id":"ui-root","gap":"lg","children":[{"kind":"heading","id":"ui-title","level":2,"text":"Service planner"},{"kind":"text","id":"ui-summary","text":{"$state":"service"},"tone":"positive"},{"kind":"form","id":"ui-form","submit":{"type":"plan.submit"},"submitLabel":"Create plan","children":[{"kind":"grid","id":"ui-fields","columns":2,"gap":"md","children":[{"kind":"field","id":"service-field","bind":"service","fieldType":"text","label":"Service name","required":true,"minLength":2},{"kind":"field","id":"replicas-field","bind":"replicas","fieldType":"number","label":"Replicas","required":true,"min":1,"max":12}]},{"kind":"field","id":"durable-field","bind":"durable","fieldType":"checkbox","label":"Durable storage"}]},{"kind":"card","id":"ui-card","type":"demo","data":{"id":"generated-summary","title":{"$state":"service"},"count":{"$state":"replicas"}}},{"kind":"button","id":"ui-action","label":"Inspect current plan","variant":"secondary","action":{"type":"plan.inspect","params":{"service":{"$state":"service"},"replicas":{"$state":"replicas"},"durable":{"$state":"durable"}}}}]}}
\`\`\`

## Architecture diagram

\`\`\`mermaid
flowchart LR
  Model[LLM] -->|strict JSON| UI[AIGUI UI tree]
  UI --> Actions[Registered Actions]
  UI --> Cards[Host Card Registry]
  UI --> Artifacts[Artifact workspace]
\`\`\`

## Chemistry structure

\`\`\`molecule
{"version":1,"format":"smiles","source":"CCO","view":"2d","atomLabels":"standard","highlight":{"atoms":[2]}}
\`\`\`

## Solid geometry

\`\`\`solid
{"solid":"cube","label":"ABCD-A1B1C1D1","edge":2,"points":[{"id":"M","on":"A1C1","at":0.5}],"segments":[{"from":"B","to":"M","style":"solid","note":"BM"}],"section":{"through":["A","B1","D1"]},"highlight":[{"plane":["A","B1","D1"]}],"caption":"平面 AB1D1 截正方体，M 为 A1C1 的中点"}
\`\`\`

## Geography route

\`\`\`map
{"version":1,"ariaLabel":"北京到上海示意路线","view":{"center":[118.9,35.5],"zoom":5},"layers":[{"id":"cities","type":"markers","items":[{"id":"beijing","position":[116.4,39.9],"label":"北京","description":"路线起点","variant":"accent"},{"id":"shanghai","position":[121.47,31.23],"label":"上海","description":"路线终点","variant":"positive"}]},{"id":"route","type":"route","coordinates":[[116.4,39.9],[118.8,35.1],[121.47,31.23]],"label":"北京至上海","description":"教学示意路线","variant":"accent"}]}
\`\`\`

## Generated workspace

\`\`\`artifact-create
{"version":1,"operationId":"create-guide","artifact":{"id":"guide","title":"Integration guide","filename":"GUIDE.md","kind":"markdown","content":"# Integration guide\\n\\nAIGUI artifacts are persistent, revisioned generated UI documents.\\n\\n- React\\n- Vue\\n- Vanilla"}}
\`\`\`

\`\`\`artifact-create
{"version":1,"operationId":"create-config","artifact":{"id":"config","title":"Renderer configuration","filename":"aigui.json","kind":"json","content":"{\\n  \\"sanitize\\": true,\\n  \\"streaming\\": true\\n}"}}
\`\`\`

\`\`\`artifact-update
{"version":1,"operationId":"update-guide-r1","id":"guide","baseRevision":0,"content":"# Integration guide\\n\\nAIGUI artifacts are persistent, revisioned generated UI documents.\\n\\n- React\\n- Vue\\n- Vanilla\\n\\nGenerated code remains inert and is never executed."}
\`\`\``

const artifactStore = new ArtifactStore()
const actions = new ActionRegistry()
actions.register({ type: "plan.submit", run: (params) => { showAction({ type: "plan.submit", params }); return params } })
actions.register({ type: "plan.inspect", run: (params) => { showAction({ type: "plan.inspect", params }); return params } })
const actionRuntime = createActionRuntime({ registry: actions })

interface RendererHandle extends DebugEventTarget {
  push(chunk: string): void
  feed(source: AsyncIterable<Uint8Array>): Promise<void>
  reset(): void
  destroy?: () => void
}

const app = document.querySelector<HTMLDivElement>("#app")!
app.innerHTML = `
  <header class="topbar">
    <div><span class="eyebrow">AIGUI / DEVTOOLS</span><h1>Streaming workbench</h1></div>
    <div class="status"><span id="status-dot"></span><span id="status-text">Ready</span></div>
  </header>
  <main>
    <section class="control-panel panel">
      <div class="panel-title"><span>01</span><h2>Input & transport</h2></div>
      <textarea id="markdown" spellcheck="false" aria-label="Markdown input"></textarea>
      <div class="controls">
        <label>Adapter<select id="adapter"><option value="react">React</option><option value="vue">Vue</option><option value="vanilla">Vanilla</option></select></label>
        <label>Chunk bytes<input id="chunk" type="number" min="1" value="8" /></label>
        <label>Delay ms<input id="delay" type="number" min="0" value="35" /></label>
      </div>
      <div class="actions">
        <button id="start" class="primary">Start stream</button><button id="pause">Pause</button><button id="resume">Resume</button><button id="cancel">Cancel</button>
      </div>
      <details><summary>Reproduction JSON</summary><textarea id="reproduction" aria-label="Reproduction JSON"></textarea><div class="actions"><button id="export">Export current</button><button id="import">Import JSON</button></div></details>
    </section>
    <section class="output-panel panel">
      <div class="panel-title"><span>02</span><h2>Rendered output</h2><b id="adapter-badge">REACT</b></div>
      <div id="preview" class="preview"></div>
      <div class="action-log"><span>Last card action</span><code id="action-log">none</code></div>
    </section>
    <section class="inspect-panel panel">
      <div class="panel-title"><span>03</span><h2>Event inspector</h2></div>
      <nav class="tabs" aria-label="Inspector views"><button data-tab="timeline" class="active">Timeline</button><button data-tab="ast">AST</button><button data-tab="patches">Patches</button><button data-tab="raw">Raw input</button></nav>
      <pre id="inspector"></pre>
    </section>
  </main>`

const markdown = element<HTMLTextAreaElement>("markdown")
const adapter = element<HTMLSelectElement>("adapter")
const chunk = element<HTMLInputElement>("chunk")
const delay = element<HTMLInputElement>("delay")
const reproduction = element<HTMLTextAreaElement>("reproduction")
const preview = element<HTMLDivElement>("preview")
const inspector = element<HTMLPreElement>("inspector")
const statusText = element<HTMLSpanElement>("status-text")
const statusDot = element<HTMLSpanElement>("status-dot")
const adapterBadge = element<HTMLElement>("adapter-badge")
const actionLog = element<HTMLElement>("action-log")
markdown.value = DEFAULT_MARKDOWN

let handle: RendererHandle
let cleanupRenderer = () => {}
let detachDevtools = () => {}
let devtools: DevTools
let simulator: StreamSimulator | undefined
let activeTab = "timeline"
let timeline: TimelineEvent[] = []

mount(adapter.value as PlaygroundAdapter)
adapter.addEventListener("change", () => mount(adapter.value as PlaygroundAdapter))
element("start").addEventListener("click", start)
element("pause").addEventListener("click", () => { simulator?.pause(); setStatus("Paused", "paused") })
element("resume").addEventListener("click", () => { simulator?.resume(); setStatus("Streaming", "running") })
element("cancel").addEventListener("click", cancel)
element("export").addEventListener("click", () => { reproduction.value = exportReproduction(currentReproduction()) })
element("import").addEventListener("click", () => {
  try {
    const value = loadReproduction(reproduction.value)
    markdown.value = value.markdown
    adapter.value = value.adapter
    chunk.value = String(value.chunkSize)
    delay.value = String(value.delayMs)
    mount(value.adapter)
    setStatus("Reproduction loaded", "ready")
  } catch (error) { setStatus(error instanceof Error ? error.message : "Invalid reproduction", "error") }
})
for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab ?? "timeline"
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === tab))
    renderInspector()
  })
}

function mount(kind: PlaygroundAdapter): void {
  cancel()
  detachDevtools()
  devtools?.destroy()
  cleanupRenderer()
  preview.replaceChildren()
  timeline = []
  adapterBadge.textContent = kind.toUpperCase()
  const registry = createRegistry(kind)
  const plugins: AIGuiPlugin[] = [citation(), ui({ registry, actionRuntime }), mermaid({ theme: "neutral" }), molecule(), map(), solid(), artifact({ store: artifactStore })]
  const mounted = kind === "react" ? mountReact(registry, plugins) : kind === "vue" ? mountVue(registry, plugins) : mountVanilla(registry, plugins)
  handle = mounted.handle
  cleanupRenderer = mounted.cleanup
  devtools = createDevTools({ maxEvents: 500, maxStringLength: 512, maxDepth: 8, maxNodes: 2_000 })
  detachDevtools = devtools.attach(handle)
  devtools.subscribe((event) => { timeline.push(event); renderInspector() })
  renderInspector()
}

async function start(): Promise<void> {
  simulator?.cancel()
  handle.reset()
  timeline = []
  devtools.clear()
  const options = currentReproduction()
  const activeSimulator = createStreamSimulator(options.markdown, { chunkSize: options.chunkSize, delayMs: options.delayMs })
  simulator = activeSimulator
  setStatus("Streaming", "running")
  try {
    await handle.feed(activeSimulator.stream)
    if (simulator !== activeSimulator) return
    simulator = undefined
    const cancelled = activeSimulator.state() === "cancelled"
    setStatus(cancelled ? "Cancelled" : "Complete", cancelled ? "cancelled" : "ready")
  } catch (error) {
    if (simulator !== activeSimulator) return
    simulator = undefined
    setStatus(error instanceof Error ? error.message : "Stream failed", "error")
  }
}

function cancel(): void {
  if (!simulator) return
  simulator.cancel()
  simulator = undefined
  setStatus("Cancelled", "cancelled")
}

function mountReact(registry: CardRegistry, plugins: AIGuiPlugin[]): { handle: RendererHandle; cleanup: () => void } {
  let renderer: ReactHandle | null = null
  const root: Root = createRoot(preview)
  flushSync(() => root.render(createElement(ReactAIRenderer, { ref: (value) => { renderer = value }, registry, plugins, actionRuntime, debug: true, onCardAction: showAction })))
  return { handle: proxy(() => renderer), cleanup: () => root.unmount() }
}

function mountVue(registry: CardRegistry, plugins: AIGuiPlugin[]): { handle: RendererHandle; cleanup: () => void } {
  const renderer = ref<any>()
  const vueApp: App = createApp(defineComponent({ setup: () => () => h(VueAIRenderer, { ref: renderer, registry, plugins, actionRuntime, debug: true, onCardAction: showAction }) }))
  vueApp.mount(preview)
  return { handle: proxy(() => renderer.value), cleanup: () => vueApp.unmount() }
}

function mountVanilla(registry: CardRegistry, plugins: AIGuiPlugin[]): { handle: RendererHandle; cleanup: () => void } {
  const renderer: VanillaRenderer = createRenderer(preview, { registry, plugins, actionRuntime, debug: true, onCardAction: showAction })
  return { handle: renderer, cleanup: () => renderer.destroy() }
}

function createRegistry(kind: PlaygroundAdapter): CardRegistry {
  const registry = new CardRegistry()
  const base = { type: "demo", description: "Interactive counter", schema: { type: "object", required: ["title", "count"], properties: { id: { type: "string" }, title: { type: "string" }, count: { type: "number" } } } }
  if (kind === "react") registry.register({ ...base, render: ({ data, onAction }: any) => createElement("article", { className: "demo-card" }, createElement("small", null, data.title), createElement("strong", null, data.count), createElement("button", { onClick: () => onAction({ type: "increment", params: { by: 1 } }) }, "Emit action")) })
  else if (kind === "vue") registry.register({ ...base, render: defineComponent({ props: ["data"], emits: ["action"], setup(props, { emit }) { return () => h("article", { class: "demo-card" }, [h("small", (props.data as any).title), h("strong", String((props.data as any).count)), h("button", { onClick: () => emit("action", { type: "increment", params: { by: 1 } }) }, "Emit action")]) } }) })
  else registry.register({ ...base, render: (data: any, { onAction }: any) => {
    const card = document.createElement("article")
    card.className = "demo-card"
    card.innerHTML = `<small>${escapeHtml(String(data.title))}</small><strong>${Number(data.count)}</strong>`
    const button = document.createElement("button")
    button.textContent = "Emit action"
    button.onclick = () => onAction({ type: "increment", params: { by: 1 } })
    card.append(button)
    return card
  } })
  return registry
}

function proxy(get: () => RendererHandle | null | undefined): RendererHandle {
  return {
    debugSource: "renderer",
    subscribeDebug: (listener) => getOrThrow(get).subscribeDebug(listener),
    push: (value) => getOrThrow(get).push(value),
    feed: (source) => getOrThrow(get).feed(source),
    reset: () => getOrThrow(get).reset(),
  }
}

function renderInspector(): void {
  const ast = [...timeline].reverse().find((event) => event.type === "ast-snapshot")?.data.nodes ?? []
  const patches = timeline.filter((event) => event.type === "ast-patches").map((event) => event.data)
  const value = activeTab === "timeline" ? timeline.map(({ sequence, type, source, data }) => ({ sequence, type, source, data })) : activeTab === "ast" ? ast : activeTab === "patches" ? patches : markdown.value
  inspector.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  inspector.scrollTop = inspector.scrollHeight
}

function currentReproduction() {
  return { adapter: adapter.value as PlaygroundAdapter, markdown: markdown.value, chunkSize: Math.max(1, Number(chunk.value) || 1), delayMs: Math.max(0, Number(delay.value) || 0) }
}

function showAction(action: unknown): void { actionLog.textContent = JSON.stringify(action) }
function setStatus(text: string, state: string): void { statusText.textContent = text; statusDot.dataset.state = state }
function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T }
function getOrThrow<T>(get: () => T | null | undefined): T { const value = get(); if (!value) throw new Error("Renderer is not mounted"); return value }
function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }
