/** The reply fields this plugin touches. Structural, so no OpenClaw import is needed to test it. */
export interface RewritablePayload {
  text?: string
  mediaUrl?: string
  mediaUrls?: string[]
  [key: string]: unknown
}

/**
 * Put the pictures into the payload and the leftover prose back into `text`.
 *
 * `text` is dropped rather than set to an empty string when the whole message was one chart: an
 * empty body is a visible blank bubble on some channels, and core treats a payload with no
 * visible text and no media as nothing to send.
 */
export function rewritePayload<T extends RewritablePayload>(
  payload: T,
  text: string,
  imagePaths: string[],
): T {
  if (imagePaths.length === 0) return payload
  const existing = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : [])
  const next: RewritablePayload = { ...payload, mediaUrls: [...existing, ...imagePaths] }
  delete next.mediaUrl
  if (text.trim().length > 0) next.text = text
  else delete next.text
  return next as T
}
