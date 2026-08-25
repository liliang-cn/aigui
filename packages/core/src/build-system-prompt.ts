import { translate, type MessageBundle } from "./i18n"
import type { CardRegistry } from "./card-registry"
import type { AIGuiPlugin } from "./types"

/**
 * How to write a block, said once, before anything that describes one.
 *
 * Models reliably compress a fenced block onto a single line — opening fence,
 * name, payload and closing fence all together — and that is not a block at all: a
 * fence's info string may not contain backticks, so CommonMark reads the line
 * as an inline code span. The reader gets raw JSON running through the middle
 * of a sentence and no list. The mistake is invisible to the model, which
 * emitted valid-looking markup and never sees the page.
 *
 * Every spec below therefore shows the multi-line shape, and this states the
 * rule outright rather than leaving it to be inferred from examples.
 */
const FENCING: MessageBundle = {
  en: {
    rule: [
      "Blocks are fenced code blocks written across several lines: ``` and the block name on one",
      "line, the content on the lines after it, and ``` alone on the closing line. Never put the",
      "whole block on one line — that is inline code, not a block, and it renders as raw text.",
    ].join("\n"),
  },
  "zh-CN": {
    rule: [
      "块都是跨行写的围栏代码块：``` 和块名占一行，内容写在后面的行上，最后单独一行 ```。",
      "不要把整个块挤在一行——那是行内代码，不是块，会原样显示成一堆文本。",
    ].join("\n"),
  },
}

/**
 * The fencing rule in one locale.
 *
 * Exported for hosts that assemble the guidance themselves instead of calling
 * `buildSystemPrompt`; that function already includes it.
 */
export function fencingRule(locale?: string): string {
  return translate(FENCING, locale, "rule")
}

export interface BuildSystemPromptOptions {
  base?: string
  registry?: CardRegistry
  plugins?: AIGuiPlugin[]
  /**
   * The locale to write the guidance in, as a BCP-47 tag, e.g. "zh-CN".
   *
   * A product whose persona says "always answer in Chinese" ends up appending English rules to
   * it, which reads as a contradiction. Plugins fall back to English for locales they have not
   * been translated into.
   */
  locale?: string
}

/**
 * Assembles the LLM system-prompt guidance: an optional base, the registered
 * cards' spec, and every plugin's promptSpec. Consumers prepend this to their
 * own system prompt so the model knows which fenced blocks it may emit.
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const specs: string[] = []
  const cardSpec = options.registry?.toPromptSpec()
  if (cardSpec) specs.push(cardSpec)
  for (const plugin of options.plugins ?? []) {
    const spec = typeof plugin.promptSpec === "function" ? plugin.promptSpec(options.locale) : plugin.promptSpec
    if (spec) specs.push(spec)
  }

  const parts: string[] = []
  if (options.base) parts.push(options.base)
  // Only when there is a block to write. A host with no cards and no plugins
  // gets markdown and nothing else, and a rule about blocks that do not exist
  // is prompt spent on nothing.
  if (specs.length > 0) parts.push(fencingRule(options.locale))
  parts.push(...specs)
  return parts.join("\n\n")
}
