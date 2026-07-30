import { defineComponent, h, onBeforeUnmount, shallowRef, watch, type PropType } from "vue"
import { collectNodeRenderers, exportRenderedImages, injectPluginStyles, loadPlugins, type ActionRuntime, type AIGuiPlugin, type ASTNode, type CardRegistry, type CardStore, type ExportImageOptions, type FeedOptions, type FeedSource, type NodeRenderer, type PluginSource, type RendererOptions } from "@ai-gui/core"
import { useAIRenderer } from "./use-ai-renderer"
import { renderNode, type RenderContext } from "./render-node"

export const AIRenderer = defineComponent({
  name: "AIRenderer",
  emits: ["card-action", "render"],
  props: {
    /**
     * The whole text to render, as a controlled component.
     *
     * Streaming an answer means passing a longer string each time, and only the added part is new.
     * Working that out belongs here, not in every host.
     */
    text: { type: String, default: undefined },
    /** The host's colour scheme, "light" or "dark" by convention, handed to every plugin. */
    theme: { type: String, default: undefined },
    /**
     * The host's locale as a BCP-47 tag, e.g. "zh-CN".
     *
     * Handed to every plugin so the chrome it draws is in the page's language.
     */
    locale: { type: String, default: undefined },
    registry: { type: Object as PropType<CardRegistry>, default: undefined },
    /**
     * The plugins, or a function that loads them.
     *
     * Diagrams, maths and charts are the heaviest thing a page carrying them loads, and an answer
     * that draws none should not pay for them:
     * `:plugins="() => import('@ai-gui/plugin-mermaid').then((m) => [m.mermaid()])"`. Until the
     * import resolves the answer renders as plain markdown; when it lands the renderer reparses the
     * text it has buffered, so nothing already streamed is lost.
     */
    plugins: { type: [Array, Function] as PropType<PluginSource>, default: undefined },
    sanitize: { type: [Boolean, Object] as PropType<RendererOptions["sanitize"]>, default: undefined },
    /**
     * Whether raw HTML in the model's output is interpreted as markup. On by default.
     *
     * A tag a model wrote inside prose is usually text it is describing, not markup it means: one
     * stray `<code>` in a sentence about code swallows the rest of the line into an element.
     */
    rawHtml: { type: Boolean, default: undefined },
    actionRuntime: { type: Object as PropType<ActionRuntime>, default: undefined },
    cardStore: { type: Object as PropType<CardStore>, default: undefined },
    /**
     * Renderers for individual node types, overriding whatever the plugins supply.
     *
     * Lets a host replace one block without dropping the plugin that renders the rest.
     */
    nodeRenderers: { type: Object as PropType<Record<string, NodeRenderer>>, default: undefined },
    /**
     * Called when a click lands inside a rendered block, with the node that block came from.
     *
     * What the reader clicked is only meaningful against the model's output: an absolute path in
     * inline code that should reveal a file, a citation that should open its source, a code block
     * with a copy button. Without this a host listens on a container of its own and guesses from the
     * DOM — `closest("code")` and the like — which reads a structure the renderer rebuilds as it
     * streams and never promised. `event.target` is the exact element clicked inside the block.
     *
     * Bind it as `@node-click` or `:on-node-click`.
     */
    onNodeClick: { type: Function as PropType<(node: ASTNode, event: MouseEvent) => void>, default: undefined },
    debug: { type: Boolean, default: false },
    onDebugEvent: { type: Function as PropType<NonNullable<RendererOptions["onDebugEvent"]>>, default: undefined },
  },
  setup(props, { emit, expose }) {
    // A loader's plugins are not here yet; an array's are, and deferring those would render the
    // first chunk of every answer twice.
    const plugins = shallowRef<AIGuiPlugin[] | undefined>()
    let pluginGeneration = 0
    const applyPluginSource = (source?: PluginSource) => {
      const generation = ++pluginGeneration
      let loading: AIGuiPlugin[] | Promise<AIGuiPlugin[]>
      try {
        loading = loadPlugins(source)
      } catch (error) {
        current.value.renderer.emitDebug("plugins-load-failed", { error })
        return
      }
      if (Array.isArray(loading)) {
        plugins.value = loading
        return
      }
      // Only reached after setup has run, so `current` is initialized by the time this resolves.
      void loading.then(
        (loaded) => { if (generation === pluginGeneration) plugins.value = loaded },
        // A chunk that fails to load — offline, a bad deploy — leaves the answer as plain markdown
        // rather than taking the page down, but it should not do so silently.
        (error) => { if (generation === pluginGeneration) current.value.renderer.emitDebug("plugins-load-failed", { error }) },
      )
    }
    applyPluginSource(props.plugins)
    const current = shallowRef(useAIRenderer({ registry: props.registry, sanitize: props.sanitize, rawHtml: props.rawHtml, plugins: plugins.value, debug: props.debug, onDebugEvent: props.onDebugEvent }))
    // Host renderers win over the plugins that claim the same node type.
    const mergeNodeRenderers = () => ({
      ...collectNodeRenderers(plugins.value, { debugTarget: current.value.renderer }),
      ...props.nodeRenderers,
    })
    const nodeRenderers = shallowRef(mergeNodeRenderers())
    injectPluginStyles(plugins.value)
    let actionScope = { controller: new AbortController(), owner: {} }
    const resetActionScope = () => {
      actionScope.controller.abort()
      actionScope = { controller: new AbortController(), owner: {} }
    }
    watch(
      () => [props.registry, props.sanitize, props.rawHtml, props.debug, props.onDebugEvent, props.nodeRenderers] as const,
      () => {
        resetActionScope()
        current.value.destroy()
        current.value = useAIRenderer({ registry: props.registry, sanitize: props.sanitize, rawHtml: props.rawHtml, plugins: plugins.value, debug: props.debug, onDebugEvent: props.onDebugEvent })
        nodeRenderers.value = mergeNodeRenderers()
        injectPluginStyles(plugins.value)
      },
    )
    watch(() => props.plugins, (source) => applyPluginSource(source))
    // Plugins are the one part of the configuration that does not need a new session: the renderer
    // swaps the grammar and reparses the text it already holds, so a deferred import resolving
    // mid-answer costs nothing that was streamed — and does not abort the card action the reader
    // just triggered.
    watch(plugins, (list) => {
      current.value.renderer.setPlugins(list)
      nodeRenderers.value = mergeNodeRenderers()
      injectPluginStyles(list)
    })
    watch(() => props.actionRuntime, resetActionScope)
    onBeforeUnmount(() => {
      resetActionScope()
      current.value.destroy()
    })
    const root = shallowRef<HTMLElement>()
    // Immediate, and registered before the text is synced: the first push happens during setup, so
    // a watcher added afterwards would never see the nodes it produced and the host would hear
    // nothing about the answer already on screen.
    watch(() => current.value.nodes.value, (nodes) => emit("render", nodes), { immediate: true })
    let rendered = ""
    const syncText = () => {
      const text = props.text
      if (text === undefined || text === rendered) return
      if (text.startsWith(rendered)) current.value.push(text.slice(rendered.length))
      else {
        resetActionScope()
        current.value.reset()
        current.value.push(text)
      }
      rendered = text
    }
    watch(() => props.text, syncText, { immediate: true })
    // A new session starts empty, so what was already sent has to be forgotten or the next update
    // would push a delta into a blank renderer.
    watch(current, () => { rendered = ""; syncText() })
    const push = (chunk: string) => current.value.push(chunk)
    const feed = (source: FeedSource, options?: FeedOptions) => current.value.feed(source, options)
    const reset = () => {
      resetActionScope()
      rendered = ""
      current.value.reset()
    }
    const exportImages = (options?: ExportImageOptions) => root.value ? exportRenderedImages(root.value, options) : Promise.resolve([])
    expose({ debugSource: "renderer", subscribeDebug: (listener: Parameters<typeof current.value.renderer.subscribeDebug>[0]) => current.value.renderer.subscribeDebug(listener), push, feed, reset, exportImages })
    return () => {
      const onCardAction: RenderContext["onCardAction"] = (action) => {
        if (props.actionRuntime) {
          const request = { type: action.type, params: action.params, cardType: action.cardType, ...(action.cardId === undefined ? {} : { cardId: action.cardId }) }
          void props.actionRuntime.dispatch(
            request,
            { signal: actionScope.controller.signal, owner: actionScope.owner },
          ).catch(() => {})
        }
        emit("card-action", action)
      }
      const ctx: RenderContext = { registry: props.registry, cardStore: props.cardStore, plugins: plugins.value, nodeRenderers: nodeRenderers.value, onCardAction, sanitize: props.sanitize, sanitized: true, theme: props.theme, locale: props.locale }
      const onNodeClick = props.onNodeClick
      return h("div", { "data-aigui-renderer": "", ref: root }, current.value.nodes.value.map((n) => onNodeClick
        // `display: contents` so a block that reports its clicks lays out exactly as one that does
        // not. The wrapper is what makes the mapping from click to node exact — a plugin owns the
        // markup inside it, and nothing about that markup is promised.
        ? h("div", { key: n.key, "data-aigui-node": n.key, style: { display: "contents" }, onClick: (event: MouseEvent) => onNodeClick(n, event) }, [renderNode(n, ctx)])
        : renderNode(n, ctx)))
    }
  },
})
