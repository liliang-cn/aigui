import "./style.css"
import { createElement } from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { createApp, defineComponent, h, ref, type App } from "vue"
import { CardRegistry, type DebugEventTarget } from "@ai-gui/core"
import { createDevTools, createStreamSimulator, type DevTools, type StreamSimulator, type TimelineEvent } from "@ai-gui/devtools"
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
\`\`\``

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
  const mounted = kind === "react" ? mountReact() : kind === "vue" ? mountVue() : mountVanilla()
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

function mountReact(): { handle: RendererHandle; cleanup: () => void } {
  let renderer: ReactHandle | null = null
  const registry = new CardRegistry()
  registry.register({ type: "demo", description: "Interactive counter", render: ({ data, onAction }: any) => createElement("article", { className: "demo-card" }, createElement("small", null, data.title), createElement("strong", null, data.count), createElement("button", { onClick: () => onAction({ type: "increment", params: { by: 1 } }) }, "Emit action")) })
  const root: Root = createRoot(preview)
  flushSync(() => root.render(createElement(ReactAIRenderer, { ref: (value) => { renderer = value }, registry, debug: true, onCardAction: showAction })))
  return { handle: proxy(() => renderer), cleanup: () => root.unmount() }
}

function mountVue(): { handle: RendererHandle; cleanup: () => void } {
  const renderer = ref<any>()
  const registry = new CardRegistry()
  registry.register({ type: "demo", description: "Interactive counter", render: defineComponent({ props: ["data"], emits: ["action"], setup(props, { emit }) { return () => h("article", { class: "demo-card" }, [h("small", (props.data as any).title), h("strong", String((props.data as any).count)), h("button", { onClick: () => emit("action", { type: "increment", params: { by: 1 } }) }, "Emit action")]) } }) })
  const vueApp: App = createApp(defineComponent({ setup: () => () => h(VueAIRenderer, { ref: renderer, registry, debug: true, onCardAction: showAction }) }))
  vueApp.mount(preview)
  return { handle: proxy(() => renderer.value), cleanup: () => vueApp.unmount() }
}

function mountVanilla(): { handle: RendererHandle; cleanup: () => void } {
  const registry = new CardRegistry()
  registry.register({ type: "demo", description: "Interactive counter", render: (data: any, { onAction }: any) => {
    const card = document.createElement("article")
    card.className = "demo-card"
    card.innerHTML = `<small>${escapeHtml(String(data.title))}</small><strong>${Number(data.count)}</strong>`
    const button = document.createElement("button")
    button.textContent = "Emit action"
    button.onclick = () => onAction({ type: "increment", params: { by: 1 } })
    card.append(button)
    return card
  } })
  const renderer: VanillaRenderer = createRenderer(preview, { registry, debug: true, onCardAction: showAction })
  return { handle: renderer, cleanup: () => renderer.destroy() }
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
