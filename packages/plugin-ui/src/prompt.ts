import type { JSONSchema } from "@ai-gui/core"
import { resolveUILimits } from "./limits"
import type { UIActionRuntime, UICardRegistry, UILimitOverrides } from "./types"

/**
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function uiPromptSpec(registry: UICardRegistry, actionRuntime: UIActionRuntime, limits?: UILimitOverrides): string {
  const bounded = resolveUILimits(limits)
  const actions = actionRuntime.listActionTypes()
  const cards = registry.list()
  const lines = [
    "Declarative UI (fenced): emit exactly one ```ui fenced block containing one JSON document: {version:1,id,state?,root}.",
    "Use only these node kinds: stack, grid, text, heading, divider, list, table, keyValue, form, field, button, card.",
    "State is a flat scalar object. Bindings use only the exact form {\"$state\":\"key\"}. Actions are declarative; the application performs them.",
    "Never emit HTML, Markdown, CSS, JavaScript, URLs, imports, remote components, workflows, artifact commands, generated code, or extra keys.",
    `Bounds: ${bounded.nodes} nodes, depth ${bounded.depth}, ${bounded.children} children per container, ${bounded.sourceBytes} source bytes.`,
    `Registered actions: ${actions.length ? actions.join(", ") : "none"}.`,
    "Registered cards:",
  ]
  if (!cards.length) lines.push("- none")
  for (const card of cards) {
    lines.push(`- ${card.type}: ${card.description}`)
    const fields = schemaFields(card.schema)
    if (fields) lines.push(`  fields: ${fields}`)
  }
  return lines.join("\n")
}

function schemaFields(schema?: JSONSchema): string {
  if (!schema?.properties) return ""
  return Object.entries(schema.properties).map(([name, field]) => `${name}(${Array.isArray(field.type) ? field.type.join("|") : field.type ?? "any"})`).join(", ")
}
