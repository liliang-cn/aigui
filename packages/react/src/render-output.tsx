import { createElement, useEffect, useState, type ReactNode } from "react"
import { sanitizeHtml, type RenderOutput } from "@aigui/core"

/** Translate a framework-neutral RenderOutput into React nodes. */
export function renderOutput(out: RenderOutput, key?: string): ReactNode {
  switch (out.kind) {
    case "html":
      return <div key={key} dangerouslySetInnerHTML={{ __html: sanitizeHtml(out.html) }} />
    case "element":
      return createElement(
        out.tag,
        { key, ...out.props },
        (out.children ?? []).map((c, i) => renderOutput(c, String(i))),
      )
    case "card":
      // Cards from plugins fall back to a JSON dump in v1.
      return (
        <pre key={key} data-aigui-card-fallback>
          <code>{JSON.stringify(out.data, null, 2)}</code>
        </pre>
      )
  }
}

export interface AsyncOutputProps {
  promise: Promise<RenderOutput>
}

/** Await an async RenderOutput, rendering a placeholder until it resolves. */
export function AsyncOutput({ promise }: AsyncOutputProps): ReactNode {
  const [resolved, setResolved] = useState<RenderOutput | null>(null)

  useEffect(() => {
    let cancelled = false
    promise.then((out) => {
      if (!cancelled) setResolved(out)
    })
    return () => {
      cancelled = true
    }
  }, [promise])

  if (resolved === null) return <span data-aigui-async-pending />
  return renderOutput(resolved)
}
