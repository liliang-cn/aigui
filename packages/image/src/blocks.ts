/**
 * A cheap "might there be a picture in here?" test.
 *
 * The point is to spend nothing on the overwhelming majority of replies, which are prose. It is
 * intentionally loose — a sentence that happens to start with a pipe costs one markdown parse,
 * and the parse is what actually decides. Nothing launches a browser on the strength of this.
 *
 * Loose in the right direction, though. A false positive costs a parse; a false negative silently
 * drops a picture the reader asked for. Two shapes earned their own branch for that reason:
 * models write tables without leading pipes at least as often as with them, and they escalate a
 * fence to four backticks whenever the payload contains three.
 */
const TRIGGER =
  /^ {0,3}(?:(?:`{3,}|~{3,})[ \t]*(?:chart|mermaid|dashboard|card:)|\$\$|\||:?-+:?[ \t]*\|)/m

export function hasTrigger(markdown: string): boolean {
  return TRIGGER.test(markdown)
}
