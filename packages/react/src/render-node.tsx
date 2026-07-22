import { createElement, type ComponentType, type ReactNode } from "react"
import { collectNodeRenderers, sanitizeHtml, type AIGuiPlugin, type ASTNode, type CardRegistry, type RenderOutput } from "@ai-gui/core"
import { AsyncOutput, renderOutput } from "./render-output"

export interface RenderContext {
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  onCardAction?: (action: { type: string; params?: unknown; cardType: string }) => void
}

export function renderNode(node: ASTNode, ctx: RenderContext): ReactNode {
  // Plugin node renderers win over built-in types.
  const r = collectNodeRenderers(ctx.plugins)[node.type]
  if (r) {
    const out: RenderOutput | Promise<RenderOutput> = r(node)
    if (out && typeof (out as { then?: unknown }).then === "function") {
      return <AsyncOutput key={node.key} promise={out as Promise<RenderOutput>} />
    }
    return renderOutput(out as RenderOutput, node.key)
  }
  switch (node.type) {
    case "heading":
      return createElement(node.tag ?? "h1", { key: node.key, dangerouslySetInnerHTML: { __html: node.html ?? "" } })
    case "paragraph":
      return <p key={node.key} dangerouslySetInnerHTML={{ __html: node.html ?? "" }} />
    case "code":
      return (
        <pre key={node.key} data-lang={node.attrs?.lang}>
          <code>{node.content}</code>
        </pre>
      )
    case "hr":
      return <hr key={node.key} />
    case "html":
      return <div key={node.key} dangerouslySetInnerHTML={{ __html: node.content ?? "" }} />
    case "card":
      return renderCard(node, ctx)
    default:
      return <div key={node.key} dangerouslySetInnerHTML={{ __html: node.html ?? sanitizeHtml(node.content ?? "") }} />
  }
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
  if (!Comp) {
    return (
      <pre key={node.key} data-aigui-card-fallback>
        <code>{JSON.stringify(card.data, null, 2)}</code>
      </pre>
    )
  }
  return (
    <Comp
      key={node.key}
      data={card.data}
      onAction={(a: { type: string; params?: unknown }) => ctx.onCardAction?.({ ...a, cardType: card.type })}
    />
  )
}

type CardComponent = ComponentType<{
  data: unknown
  onAction: (a: { type: string; params?: unknown }) => void
}>

function getCardComponent(registry: CardRegistry | undefined, type: string): CardComponent | undefined {
  if (!registry) return undefined
  return registry.getRender(type) as CardComponent | undefined
}
