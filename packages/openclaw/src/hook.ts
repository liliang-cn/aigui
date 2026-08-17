import { hasTrigger, type RenderOptions, type RenderResult } from "@ai-gui/image"
import { resolveConfig } from "./config"
import { rewritePayload, type RewritablePayload } from "./rewrite"

export interface HookDeps {
  /** Where PNGs are written. Resolved from the OpenClaw state directory by the plugin entry. */
  outDir: string
  render: (markdown: string, options: RenderOptions) => Promise<RenderResult>
  warn: (message: string, error?: unknown) => void
  /**
   * Bring a picture under the channel's size limit, returning the path to send.
   *
   * Optional, and allowed to decline by returning undefined: a picture that is already small
   * enough needs no work, and a re-encode that fails is a worse outcome than a large PNG.
   */
  shrink?: (path: string) => Promise<string | undefined>
}

interface HookEvent {
  payload: RewritablePayload
  channel?: string
  context?: { pluginConfig?: unknown }
}

interface HookResult {
  payload?: RewritablePayload
}

/** Lanes that are not answer prose. A chart fence in a thinking trace is not a picture request. */
const SUPPRESSED = ["isReasoning", "isCommentary", "isStatusNotice", "isError"] as const

/**
 * Turn renderable blocks in an outbound reply into pictures.
 *
 * The guards run cheapest first and the renderer is the last thing touched, so an ordinary
 * conversation never pays for this plugin being installed. Every failure path returns `undefined`,
 * which OpenClaw reads as "no opinion" and delivers the original reply: a chart that will not draw
 * costs a picture, never the answer.
 */
export function createReplyPayloadHook(deps: HookDeps) {
  let warnedAboutBrowser = false

  return async (event: HookEvent, _ctx: unknown): Promise<HookResult | undefined> => {
    const config = resolveConfig(
      (event.context?.pluginConfig ?? (_ctx as { pluginConfig?: unknown } | undefined)?.pluginConfig) ?? undefined,
    )
    if (!event.channel || !config.channels.includes(event.channel)) return undefined
    const payload = event.payload
    if (SUPPRESSED.some((flag) => payload[flag] === true)) return undefined
    const text = typeof payload.text === "string" ? payload.text : ""
    if (text.length === 0 || !hasTrigger(text)) return undefined

    let result: RenderResult
    try {
      result = await deps.render(text, {
        outDir: deps.outDir,
        kinds: config.blocks,
        theme: config.theme,
        width: config.width,
        scale: config.scale,
        max: config.maxImages,
        timeoutMs: config.timeoutMs,
        idleShutdownMs: config.idleShutdownMs,
      })
    } catch (error) {
      // Once. A gateway without Chromium would otherwise log this on every single reply.
      if (!warnedAboutBrowser) {
        warnedAboutBrowser = true
        deps.warn("AIGUI could not render blocks as images; sending the reply as text", error)
      }
      return undefined
    }

    if (result.images.length === 0) return undefined
    const paths = await Promise.all(
      result.images.map(async (image) => {
        if (!deps.shrink) return image.path
        try {
          return (await deps.shrink(image.path)) ?? image.path
        } catch {
          return image.path
        }
      }),
    )
    return { payload: rewritePayload(payload, result.text, paths) }
  }
}
