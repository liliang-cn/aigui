import type { CardRegistry } from "./card-registry"
import type { AIGuiPlugin } from "./types"

export interface BuildSystemPromptOptions {
  base?: string
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
}

/**
 * Assembles the LLM system-prompt guidance: an optional base, the registered
 * cards' spec, and every plugin's promptSpec. Consumers prepend this to their
 * own system prompt so the model knows which fenced blocks it may emit.
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const parts: string[] = []
  if (options.base) parts.push(options.base)
  const cardSpec = options.registry?.toPromptSpec()
  if (cardSpec) parts.push(cardSpec)
  for (const p of options.plugins ?? []) if (p.promptSpec) parts.push(p.promptSpec)
  return parts.join("\n\n")
}
