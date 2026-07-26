import { createElement, useCallback, useEffect, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from "react"
import { collectNodeRenderers, sanitizeHtml, type AIGuiPlugin, type ASTNode, type CardAction, type CardRegistry, type CardStore, type NodeRenderer, type RendererOptions, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"
import { AsyncOutput, renderOutput } from "./render-output"

export interface CardActionPayload {
  type: string
  params?: unknown
  cardType: string
  cardId?: string
}

export interface RenderContext {
  registry?: CardRegistry
  cardStore?: CardStore
  plugins?: AIGuiPlugin[]
  nodeRenderers?: Record<string, NodeRenderer>
  onCardAction?: (action: CardActionPayload) => void
  sanitize?: RendererOptions["sanitize"]
  sanitized?: boolean
  /** The host's colour scheme, handed to every plugin that renders a node. */
  theme?: string
}

export function renderNode(node: ASTNode, ctx: RenderContext): ReactNode {
  // Plugin node renderers win over built-in types.
  const r = (ctx.nodeRenderers ?? collectNodeRenderers(ctx.plugins))[node.type]
  if (r) {
    if (node.complete === false) return <div key={node.key} data-aigui-block-loading="" data-block-type={node.type} />
    return <PluginOutputHost key={node.key} node={node} renderer={r} context={ctx} />
  }
  switch (node.type) {
    case "heading":
      return createElement(node.tag ?? "h1", { key: node.key, dangerouslySetInnerHTML: { __html: renderHtml(node.html ?? "", ctx) } })
    case "paragraph":
      return <p key={node.key} dangerouslySetInnerHTML={{ __html: renderHtml(node.html ?? "", ctx) }} />
    case "code":
      return (
        <pre key={node.key} data-lang={node.attrs?.lang}>
          <code>{node.content}</code>
        </pre>
      )
    case "hr":
      return <hr key={node.key} />
    case "html":
      return <div key={node.key} dangerouslySetInnerHTML={{ __html: renderHtml(node.content ?? "", ctx) }} />
    case "card":
      return renderCard(node, ctx)
    default:
      return renderFallback(node, ctx)
  }
}

interface PluginOutputHostProps {
  node: ASTNode
  renderer: NodeRenderer
  context: RenderContext
}

interface CachedPluginOutput {
  renderer: NodeRenderer
  signature: string | ASTNode
  theme: string | undefined
  output: RenderOutput | Promise<RenderOutput>
}

function PluginOutputHost({ node, renderer, context }: PluginOutputHostProps): ReactNode {
  const cache = useRef<CachedPluginOutput>()
  const signature = nodeSignature(node)
  const theme = context.theme
  try {
    // The theme belongs in the cache key: the node has not changed when the page switches to dark,
    // but the diagram drawn for the light one is the wrong picture now.
    if (!cache.current || cache.current.renderer !== renderer || cache.current.signature !== signature || cache.current.theme !== theme) {
      cache.current = { renderer, signature, theme, output: renderer(node, { theme }) }
    }
    const output = cache.current.output
    if (output && typeof (output as { then?: unknown }).then === "function") {
      return <AsyncOutput promise={output as Promise<RenderOutput>} sanitize={context.sanitize} context={context} />
    }
    return renderOutput(output as RenderOutput, undefined, context.sanitize, context)
  } catch {
    return renderFallback(node, context)
  }
}

function nodeSignature(node: ASTNode): string | ASTNode {
  try {
    return JSON.stringify(node)
  } catch {
    // External callers can supply non-serializable nodes. Identity still prevents
    // repeated work for the same object without retaining it after unmount.
    return node
  }
}

function renderFallback(node: ASTNode, ctx: RenderContext): ReactNode {
  return <div key={node.key} dangerouslySetInnerHTML={{ __html: renderHtml(node.html ?? node.content ?? "", ctx) }} />
}

function renderHtml(html: string, ctx: RenderContext): string {
  if (ctx.sanitized || ctx.sanitize === false) return html
  return sanitizeHtml(html, typeof ctx.sanitize === "object" ? ctx.sanitize as SanitizeHtmlOptions : undefined)
}

function renderCard(node: ASTNode, ctx: RenderContext): ReactNode {
  const card = node.card
  if (!card) return null
  if (!card.complete) {
    return <div key={node.key} data-aigui-card-loading data-card-type={card.type} />
  }
  if (!card.valid) {
    return (
      <pre key={node.key} data-aigui-card-invalid data-card-type={card.type}>
        <code>{JSON.stringify(card.data, null, 2)}</code>
      </pre>
    )
  }
  const Comp = getCardComponent(ctx.registry, card.type)
  if (card.id && ctx.cardStore) {
    return (
      <StatefulCardHost
        key={node.key}
        cardStore={ctx.cardStore}
        cardId={card.id}
        cardType={card.type}
        initialData={card.data}
        Comp={Comp}
        onCardAction={ctx.onCardAction}
      />
    )
  }
  if (!Comp) return renderCardFallback(node.key, card.data)
  return (
    <Comp
      key={node.key}
      data={card.data}
      onAction={(a: { type: string; params?: unknown }) => ctx.onCardAction?.({ ...a, cardType: card.type })}
    />
  )
}

export interface CardComponentProps {
  data: unknown
  state?: CardAction
  onAction: (a: { type: string; params?: unknown }) => void
}

export type CardComponent = ComponentType<CardComponentProps>

const getServerCardSnapshot = (): undefined => undefined

interface StatefulCardHostProps {
  cardStore: CardStore
  cardId: string
  cardType: string
  initialData: unknown
  Comp?: CardComponent
  onCardAction?: RenderContext["onCardAction"]
}

function StatefulCardHost({ cardStore, cardId, cardType, initialData, Comp, onCardAction }: StatefulCardHostProps): ReactNode {
  const subscribe = useCallback((notify: () => void) => cardStore.subscribe(cardId, notify), [cardStore, cardId])
  const getSnapshot = useCallback(() => cardStore.get(cardId), [cardStore, cardId])
  const record = useSyncExternalStore(subscribe, getSnapshot, getServerCardSnapshot)
  useEffect(() => {
    if (cardStore.get(cardId)) return
    try {
      cardStore.register({ id: cardId, type: cardType, data: initialData })
    } catch {}
  }, [cardStore, cardId, cardType, initialData])
  if (!record) return renderCardFallback(undefined, initialData)
  if (record.type !== cardType) {
    return (
      <pre data-aigui-card-invalid data-card-type={cardType}>
        <code>{JSON.stringify(initialData, null, 2)}</code>
      </pre>
    )
  }
  if (!Comp) return renderCardFallback(undefined, record.data)
  return (
    <Comp
      data={record.data}
      state={record.action}
      onAction={(action) => onCardAction?.({ ...action, cardType, cardId })}
    />
  )
}

function renderCardFallback(key: string | undefined, data: unknown): ReactNode {
  return (
    <pre key={key} data-aigui-card-fallback>
      <code>{JSON.stringify(data, null, 2)}</code>
    </pre>
  )
}

function getCardComponent(registry: CardRegistry | undefined, type: string): CardComponent | undefined {
  if (!registry) return undefined
  return registry.getRender(type) as CardComponent | undefined
}
