import { createElement, useEffect, useRef, useState, type ReactNode } from "react"
import { sanitizeHtml, type RendererOptions, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"

/** Translate a framework-neutral RenderOutput into React nodes. */
export function renderOutput(out: RenderOutput, key?: string, sanitize?: RendererOptions["sanitize"]): ReactNode {
  switch (out.kind) {
    case "html":
      return <div key={key} dangerouslySetInnerHTML={{ __html: sanitizeOutput(out.html, sanitize) }} />
    case "element":
      return createElement(
        out.tag,
        { key, ...out.props },
        (out.children ?? []).map((c, i) => renderOutput(c, String(i), sanitize)),
      )
    case "card":
      // Cards from plugins fall back to a JSON dump in v1.
      return (
        <pre key={key} data-aigui-card-fallback>
          <code>{JSON.stringify(out.data, null, 2)}</code>
        </pre>
      )
    case "mount":
      return <MountHost key={key} mount={out.mount} />
  }
}

/** Host a framework-neutral imperative mount into a managed DOM element. */
function MountHost({ mount }: { mount: (el: HTMLElement) => void | (() => void) }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const cleanup = mount(ref.current)
    return () => {
      if (typeof cleanup === "function") cleanup()
    }
  }, [mount])
  return <div ref={ref} data-aigui-mount />
}

export interface AsyncOutputProps {
  promise: Promise<RenderOutput>
  sanitize?: RendererOptions["sanitize"]
}

/** Await an async RenderOutput, rendering a placeholder until it resolves. */
export function AsyncOutput({ promise, sanitize }: AsyncOutputProps): ReactNode {
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
    return renderOutput(resolved, undefined, sanitize)
  } catch {
    return <span data-aigui-async-error />
  }
}

function sanitizeOutput(html: string, sanitize: RendererOptions["sanitize"]): string {
  if (sanitize === false) return html
  return sanitizeHtml(html, typeof sanitize === "object" ? sanitize as SanitizeHtmlOptions : undefined)
}
