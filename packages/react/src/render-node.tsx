import { createElement, type ComponentType, type ReactNode } from "react"
import type { ASTNode, CardRegistry } from "@aigui/core"

export interface RenderContext {
  registry?: CardRegistry
  onCardAction?: (action: { type: string; params?: unknown; cardType: string }) => void
}

export function renderNode(node: ASTNode, ctx: RenderContext): ReactNode {
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
      return <div key={node.key} dangerouslySetInnerHTML={{ __html: node.html ?? node.content ?? "" }} />
  }
}

function renderCard(node: ASTNode, ctx: RenderContext): ReactNode {
  const card = node.card
  if (!card) return null
  if (!card.complete || !card.valid) {
    return <div key={node.key} data-aigui-card-loading data-card-type={card.type} />
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
