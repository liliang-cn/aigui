import DOMPurify from "dompurify"

/** Sanitize an HTML string, stripping scripts and unsafe attributes. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html)
}
