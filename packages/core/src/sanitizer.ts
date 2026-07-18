import DOMPurify from "dompurify"

/** Escape the HTML-significant characters so a string renders as inert text. */
function escapeHtml(html: string): string {
  return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Sanitize an HTML string, stripping scripts and unsafe attributes.
 *
 * When a DOM is available (browser, or Node with jsdom) DOMPurify is used. In a
 * bare Node environment without a global `window`, DOMPurify cannot run, so we
 * fall back to escaping the HTML-significant characters. This never emits raw
 * markup and never throws.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return escapeHtml(html)
  return DOMPurify.sanitize(html)
}
