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
import { scene } from "@ai-gui/plugin-scene"
import { gravity } from "@ai-gui/plugin-gravity"
import { graph } from "@ai-gui/plugin-graph"
import { bigscreen } from "@ai-gui/plugin-bigscreen"
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

\`\`\`molecule
{"version":1,"format":"smiles","source":"Cn1cnc2c1c(=O)n(C)c(=O)n2C","view":"3d","style":"ball-and-stick"}
\`\`\`

## Solid geometry

\`\`\`solid
{"solid":"cube","label":"ABCD-A1B1C1D1","edge":2,"points":[{"id":"M","on":"A1C1","at":0.5}],"segments":[{"from":"B","to":"M","style":"solid","note":"BM"}],"section":{"through":["A","B1","D1"]},"highlight":[{"plane":["A","B1","D1"]}],"caption":"平面 AB1D1 截正方体，M 为 A1C1 的中点"}
\`\`\`

## 3D scene

\`\`\`scene
{"objects":[{"shape":"box","size":[6,3,4],"anchor":"bottom","color":"#e7dcc8","label":"主体"},{"shape":"cone","radius":3.9,"height":2,"sides":4,"position":[0,3,0],"anchor":"bottom","rotation":[0,45,0],"color":"#b5533c","label":"屋顶"},{"shape":"box","size":[0.6,1.2,0.6],"position":[1.5,4,0.8],"anchor":"bottom","color":"gray","label":"烟囱"},{"shape":"box","size":[0.9,2,0.1],"position":[0,0,2],"anchor":"bottom","color":"#5b3a1e"}],"autoRotate":true,"caption":"房子的体块关系：主体、四坡顶、烟囱和门"}
\`\`\`

## Big screen

\`\`\`bigscreen
{"title":"华东区销售大屏","subtitle":"2026 年 8 月","panels":[{"kind":"kpi","title":"本月营收","value":12843000,"prefix":"¥","delta":0.124,"trend":[8.1,8.6,9.2,9.0,10.4,11.9,12.8],"span":3},{"kind":"kpi","title":"订单数","value":48210,"unit":"单","delta":0.051,"span":3},{"kind":"kpi","title":"客单价","value":266.4,"prefix":"¥","decimals":1,"delta":-0.018,"span":3},{"kind":"gauge","title":"目标完成率","value":82,"unit":"%","span":3},{"kind":"chart","title":"月度趋势","span":8,"option":{"xAxis":{"type":"category","data":["3月","4月","5月","6月","7月","8月"]},"yAxis":{"type":"value"},"series":[{"type":"line","smooth":true,"areaStyle":{},"data":[820,932,901,934,1290,1330]}]}},{"kind":"rank","title":"门店排行","span":4,"unit":"万","items":[{"name":"上海","value":320},{"name":"杭州","value":245},{"name":"南京","value":198},{"name":"苏州","value":176},{"name":"宁波","value":121}]},{"kind":"chart3d","title":"品类 × 月份","span":6,"type":"bar3D","xAxis":["6月","7月","8月"],"yAxis":["家电","服饰","食品"],"data":[[0,0,120],[1,0,150],[2,0,180],[0,1,90],[1,1,110],[2,1,140],[0,2,60],[1,2,75],[2,2,95]]},{"kind":"globe","title":"出口流向","span":6,"arcs":[{"from":[121.47,31.23],"to":[8.68,50.11],"label":"上海→法兰克福"},{"from":[121.47,31.23],"to":[-74.01,40.71],"label":"上海→纽约"},{"from":[121.47,31.23],"to":[151.21,-33.87],"label":"上海→悉尼"},{"from":[121.47,31.23],"to":[55.27,25.2],"label":"上海→迪拜"}],"points":[{"coord":[121.47,31.23],"label":"上海","value":320},{"coord":[-74.01,40.71],"label":"纽约","value":120},{"coord":[8.68,50.11],"label":"法兰克福","value":90}]}]}
\`\`\`

## Claim timeline

\`\`\`bigscreen
{"title":"Border convoy","subtitle":"who said what, and where they disagree","panels":[{"kind":"timeline","title":"Claims by outlet","span":12,"lanes":[{"id":"reuters","name":"Reuters"},{"id":"tass","name":"TASS"},{"id":"ap","name":"AP"},{"id":"afp","name":"AFP"}],"items":[{"id":"c1","lane":"reuters","at":"2026-09-01T08:12:00Z","label":"Convoy crossed at dawn","detail":"Two sources on the ground.","url":"https://example.com/reuters-1","value":3},{"id":"c2","lane":"tass","at":"2026-09-01T09:30:00Z","label":"No convoy crossed","detail":"Ministry statement.","value":2},{"id":"c3","lane":"ap","at":"2026-09-01T11:05:00Z","label":"Crossing confirmed by satellite","value":4},{"id":"c4","lane":"reuters","at":"2026-09-01T14:40:00Z","label":"A second convoy"},{"id":"c5","lane":"afp","at":"2026-09-01T16:20:00Z","label":"Border post closed"},{"id":"c6","lane":"tass","at":"2026-09-01T18:00:00Z","label":"Border post open as usual"}],"links":[{"from":"c1","to":"c2","kind":"contradicts"},{"from":"c5","to":"c6","kind":"contradicts"},{"from":"c1","to":"c4","kind":"follows"},{"from":"c1","to":"c3","kind":"same"}]}]}
\`\`\`

## Knowledge graph

\`\`\`bigscreen
{"title":"Entity graph","panels":[{"kind":"graph3d","title":"Who reported what","span":12,"focus":"convoy","nodes":[{"id":"kyiv","name":"Kyiv","type":"place"},{"id":"moscow","name":"Moscow","type":"place"},{"id":"reuters","name":"Reuters","type":"outlet"},{"id":"tass","name":"TASS","type":"outlet"},{"id":"afp","name":"AFP","type":"outlet"},{"id":"convoy","name":"Convoy crossing","type":"event"},{"id":"denial","name":"Denial of crossing","type":"event"},{"id":"closure","name":"Border post closure","type":"event"}],"edges":[{"from":"reuters","to":"convoy","type":"reported"},{"from":"tass","to":"denial","type":"reported"},{"from":"afp","to":"closure","type":"reported"},{"from":"convoy","to":"kyiv","type":"located"},{"from":"denial","to":"moscow","type":"located"},{"from":"closure","to":"kyiv","type":"located"},{"from":"convoy","to":"denial","type":"contradicts"},{"from":"reuters","to":"kyiv","type":"located"},{"from":"tass","to":"moscow","type":"located"}]}]}
\`\`\`

## Knowledge graph & ontology

\`\`\`graph
{"classes":[{"id":"Agent","name":"主体"},{"id":"Person","name":"人","subClassOf":"Agent","description":"自然人"},{"id":"Organization","name":"组织","subClassOf":"Agent"},{"id":"Project","name":"项目"}],"properties":[{"id":"worksAt","name":"任职于","domain":"Person","range":"Organization"},{"id":"leads","name":"负责","domain":"Person","range":"Project"},{"id":"funds","name":"资助","domain":"Organization","range":"Project"},{"id":"knows","name":"认识","domain":"Person","range":"Person"}],"entities":[{"id":"alice","name":"Alice","type":"Person","attrs":{"title":"CTO","since":2019}},{"id":"bob","name":"Bob","type":"Person","attrs":{"title":"Engineer"}},{"id":"carol","name":"Carol","type":"Person"},{"id":"acme","name":"Acme","type":"Organization","attrs":{"city":"Wien"}},{"id":"globex","name":"Globex","type":"Organization"},{"id":"atlas","name":"Atlas 项目","type":"Project"},{"id":"borealis","name":"Borealis 项目","type":"Project"}],"relations":[{"from":"alice","to":"acme","type":"worksAt"},{"from":"bob","to":"acme","type":"worksAt"},{"from":"carol","to":"globex","type":"worksAt"},{"from":"bob","to":"alice","type":"worksAt"},{"from":"alice","to":"atlas","type":"leads"},{"from":"carol","to":"borealis","type":"leads"},{"from":"acme","to":"atlas","type":"funds"},{"from":"globex","to":"borealis","type":"funds"},{"from":"globex","to":"atlas","type":"funds"},{"from":"alice","to":"bob","type":"knows"},{"from":"alice","to":"carol","type":"knows"}],"focus":"alice","caption":"Acme 与 Globex 的人、组织和项目——Bob 任职于 Alice 违反了 range"}
\`\`\`

## Gravity

\`\`\`gravity
{"units":"astronomical","bodies":[{"id":"太阳","mass":1,"color":"orange"},{"id":"地球","mass":3e-6,"orbit":{"around":"太阳","distance":1},"color":"blue"},{"id":"彗星","mass":0,"orbit":{"around":"太阳","distance":0.4,"eccentricity":0.8,"angle":180},"color":"gray"}],"duration":3,"caption":"地球与一颗近日点 0.4 AU 的彗星"}
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
  const plugins: AIGuiPlugin[] = [citation(), ui({ registry, actionRuntime }), mermaid({ theme: "neutral" }), molecule(), map(), solid(), scene(), gravity(), graph(), bigscreen(), artifact({ store: artifactStore })]
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
