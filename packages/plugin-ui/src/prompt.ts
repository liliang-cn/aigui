import { resolveMessages, type JSONSchema, type Locale, type MessageBundle } from "@ai-gui/core"
import { resolveUILimits } from "./limits"
import type { UIActionRuntime, UICardRegistry, UILimitOverrides } from "./types"

/**
 * The model-facing rules, in the product's language.
 *
 * Everything the model reads about the other blocks is translated, so leaving
 * this one in English put a paragraph of English rules in the middle of an
 * otherwise Chinese prompt — and a model that is answering in Chinese takes the
 * language of the rules as a hint about the language of the answer.
 *
 * The lists at the end — registered actions, registered cards — stay verbatim
 * in every locale: they are identifiers the model has to reproduce exactly, and
 * a translated identifier is a broken one.
 */
const PROMPT: MessageBundle = {
  en: {
    intro: "Declarative UI (fenced): emit exactly one ```ui fenced block containing one JSON document: {version:1,id,state?,root}.",
    kinds: "Use only these node kinds: stack, grid, text, heading, divider, list, table, keyValue, form, field, button, card.",
    state: 'State is a flat scalar object. Bindings use only the exact form {"$state":"key"}. Actions are declarative; the application performs them.',
    never: "Never emit HTML, Markdown, CSS, JavaScript, URLs, imports, remote components, workflows, artifact commands, generated code, or extra keys.",
    bounds: "Bounds: {nodes} nodes, depth {depth}, {children} children per container, {bytes} source bytes.",
    // The whole document is refused when one action name is wrong, so the model
    // needs to be told that plainly rather than left to infer it from a list.
    actions: "Registered actions: {actions}.",
    actionsRule: "A button or form may name only a registered action. Naming any other action discards the whole block, so when none are registered, emit no button and no form.",
    cards: "Registered cards:",
    none: "none",
  },
  "zh-CN": {
    intro: "声明式界面（围栏代码块）：输出恰好一个 ```ui 围栏块，块内是一个 JSON 文档：{version:1,id,state?,root}。",
    kinds: "只能使用这些节点类型：stack、grid、text、heading、divider、list、table、keyValue、form、field、button、card。",
    state: 'state 是一个扁平的标量对象。绑定只能写成 {"$state":"key"} 这一种形式。动作是声明式的，由应用负责执行。',
    never: "禁止输出 HTML、Markdown、CSS、JavaScript、URL、import、远程组件、工作流、artifact 指令、生成的代码，以及任何多余的字段。",
    bounds: "限制：最多 {nodes} 个节点，嵌套深度 {depth}，每个容器最多 {children} 个子节点，源码最多 {bytes} 字节。",
    actions: "已注册的动作：{actions}。",
    actionsRule: "button 和 form 只能引用已注册的动作。写了别的动作会导致整个块被丢弃，所以当一个动作都没有注册时，不要输出 button，也不要输出 form。",
    cards: "已注册的卡片：",
    none: "无",
  },
}

/**
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function uiPromptSpec(
  registry: UICardRegistry,
  actionRuntime: UIActionRuntime,
  limits?: UILimitOverrides,
  locale?: Locale,
): string {
  const m = resolveMessages(PROMPT, locale)
  const bounded = resolveUILimits(limits)
  const actions = actionRuntime.listActionTypes()
  const cards = registry.list()
  const fill = (template: string, values: Record<string, string>) =>
    template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "")

  const lines = [
    m.intro,
    m.kinds,
    m.state,
    m.never,
    fill(m.bounds, {
      nodes: String(bounded.nodes),
      depth: String(bounded.depth),
      children: String(bounded.children),
      bytes: String(bounded.sourceBytes),
    }),
    fill(m.actions, { actions: actions.length ? actions.join(", ") : m.none }),
    m.actionsRule,
    m.cards,
  ]
  if (!cards.length) lines.push(`- ${m.none}`)
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
