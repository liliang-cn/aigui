import { TOOL_NAME } from "./constants"
import type { HookDeps } from "./hook"

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>
}

/**
 * Let the model draw on purpose.
 *
 * The tool returns paths, not images. That is deliberate: it is the same shape OpenClaw's own
 * `image_generate` uses, where the model attaches the result with the `message` tool. Inventing a
 * second delivery mechanism here would mean owning session targeting and ordering that core
 * already handles.
 */
export function createRenderTool(deps: HookDeps) {
  return {
    name: TOOL_NAME,
    description:
      "Render AIGUI markdown (a ```chart, ```mermaid, ```dashboard or ```card fence, $$math$$, or a table) to PNG files and return their paths. Attach the returned paths with the message tool to show them in the chat.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["markdown"],
      properties: {
        markdown: { type: "string", description: "The markdown block to draw." },
        theme: { enum: ["light", "dark"], description: "Colour scheme. Defaults to light." },
        width: { type: "integer", minimum: 200, maximum: 2000, description: "Width in CSS pixels." },
      },
    },
    async execute(_id: string, params: { markdown: string; theme?: "light" | "dark"; width?: number }): Promise<ToolResult> {
      try {
        const result = await deps.render(params.markdown, {
          outDir: deps.outDir,
          theme: params.theme,
          width: params.width,
        })
        if (result.images.length === 0) {
          return { content: [{ type: "text", text: "No renderable block found in that markdown; nothing was drawn." }] }
        }
        const paths = result.images.map((image) => `${image.kind}: ${image.path}`).join("\n")
        return { content: [{ type: "text", text: `图片已生成:\n${paths}` }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: "text", text: `Rendering failed: ${message}` }] }
      }
    },
  }
}
