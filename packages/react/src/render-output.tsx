import { createElement, Fragment, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { createPortal } from "react-dom"
import { sanitizeRenderedHtml, type MountCardSlotRequest, type MountedCardSlot, type RendererOptions, type RenderMountContext, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"
import type { CardComponent, RenderContext } from "./render-node"

/** Translate a framework-neutral RenderOutput into React nodes. */
export function renderOutput(out: RenderOutput, key?: string, sanitize?: RendererOptions["sanitize"], context?: RenderContext): ReactNode {
  switch (out.kind) {
    case "html":
      return <div key={key} dangerouslySetInnerHTML={{ __html: sanitizeRenderedHtml(out.html, sanitize, out.trusted) }} />
    case "element":
      return createElement(
        out.tag,
        { key, ...out.props },
        (out.children ?? []).map((c, i) => renderOutput(c, String(i), sanitize, context)),
      )
    case "card":
      // Cards from plugins fall back to a JSON dump in v1.
      return (
        <pre key={key} data-aigui-card-fallback>
          <code>{JSON.stringify(out.data, null, 2)}</code>
        </pre>
      )
    case "mount":
      return <MountHost key={key} mount={out.mount} context={context} />
  }
}

/** Host a framework-neutral imperative mount into a managed DOM element. */
function MountHost({ mount, context }: { mount: Extract<RenderOutput, { kind: "mount" }>["mount"]; context?: RenderContext }) {
  const ref = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState<CardSlot[]>([])
  useEffect(() => {
    if (!ref.current) return
    const mountContext = createMountContext(context, setSlots)
    const cleanup = mount(ref.current, mountContext)
    return () => {
      if (typeof cleanup === "function") cleanup()
    }
  }, [mount, context?.registry, context?.onCardAction])
  return (
    <Fragment>
      <div ref={ref} data-aigui-mount />
      {slots.map((slot) => createPortal(
        createElement(slot.Comp, {
          data: slot.data,
          onAction: (action) => context?.onCardAction?.({ ...action, cardType: slot.type }),
        }),
        slot.host,
        slot.id,
      ))}
    </Fragment>
  )
}

interface CardSlot {
  id: string
  host: HTMLElement
  type: string
  data: unknown
  Comp: CardComponent
}

type SetCardSlots = Dispatch<SetStateAction<CardSlot[]>>

let nextCardSlotId = 0

function createMountContext(context: RenderContext | undefined, setSlots: SetCardSlots): RenderMountContext {
  return {
    mountCard(host, request) {
      return mountCard(host, request, context, setSlots)
    },
  }
}

function mountCard(host: HTMLElement, request: MountCardSlotRequest, context: RenderContext | undefined, setSlots: SetCardSlots): MountedCardSlot | undefined {
  const Comp = context?.registry?.getRender(request.type) as CardComponent | undefined
  if (!Comp) return undefined

  const id = String(nextCardSlotId++)
  let destroyed = false
  setSlots((slots) => [...slots, { id, host, type: request.type, data: request.data, Comp }])

  return {
    update(data) {
      if (destroyed) return
      setSlots((slots) => slots.map((slot) => slot.id === id ? { ...slot, data } : slot))
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      setSlots((slots) => slots.filter((slot) => slot.id !== id))
    },
  }
}

export interface AsyncOutputProps {
  promise: Promise<RenderOutput>
  sanitize?: RendererOptions["sanitize"]
  context?: RenderContext
}

/** Await an async RenderOutput, rendering a placeholder until it resolves. */
export function AsyncOutput({ promise, sanitize, context }: AsyncOutputProps): ReactNode {
  const [resolved, setResolved] = useState<RenderOutput | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setResolved(null)
    setFailed(false)
    promise.then(
      (out) => { if (!cancelled) setResolved(out) },
      () => { if (!cancelled) setFailed(true) },
    )
    return () => {
      cancelled = true
    }
  }, [promise])

  if (failed) return <span data-aigui-async-error />
  if (resolved === null) return <span data-aigui-async-pending />
  try {
    return renderOutput(resolved, undefined, sanitize, context)
  } catch {
    return <span data-aigui-async-error />
  }
}

