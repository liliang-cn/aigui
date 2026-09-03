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
 *
 * The shape has to be shown, not listed. The first version named the twelve node
 * kinds and stopped there. A model given that wrote `{"type":"stack"}` with no
 * ids, `"action":"save"` as a string on a form, and `"name"` on a field — every
 * one a reasonable guess from the names alone, and every one refused. The block
 * is all-or-nothing, so a single wrong key costs the reader the whole interface.
 *
 * The sibling blocks that models get right on the first try all carry a worked
 * example, so this one does too: the discriminator is named, the required keys
 * of each kind are spelled out, and the example exercises the two shapes that
 * were guessed wrong — a form's `submit` and a button's `action` object.
 */
const NODE_RULES_EN = [
  "Every node is an object with `kind` and a unique `id`. `kind` is the discriminator — never `type`.",
  "- stack: children[]; optional direction (row|column), gap (sm|md|lg), align",
  "- grid: columns (1-4), children[]; optional gap",
  "- heading: level (1-6), text        - text: text; optional tone (muted|positive|warning|critical)",
  "- divider: nothing else             - list: items[]; optional ordered",
  "- table: headers[], rows[][]; caption optional",
  "- keyValue: items[] of {label, value}",
  '- form: children[], submit {"type":"<registered action>"}; optional submitLabel',
  "- field: bind (a state key), fieldType (text|number|checkbox|select|radio|textarea), label; optional required, min, max, minLength, maxLength, pattern, options[] of {label,value}",
  '- button: label, action {"type":"<registered action>"}; optional variant (primary|secondary|danger), action.params',
  "- card: type (a registered card), data",
  "A field writes into `state` through `bind`; a form submits every field under it. Any value may instead be {\"$state\":\"key\"}.",
].join("\n")

const NODE_RULES_ZH = [
  "每个节点都是一个对象，必须有 `kind` 和唯一的 `id`。判别字段叫 `kind`，不是 `type`。",
  "- stack：children[]；可选 direction(row|column)、gap(sm|md|lg)、align",
  "- grid：columns(1-4)、children[]；可选 gap",
  "- heading：level(1-6)、text        - text：text；可选 tone(muted|positive|warning|critical)",
  "- divider：没有其他字段            - list：items[]；可选 ordered",
  "- table：headers[]、rows[][]；caption 可选",
  "- keyValue：items[]，每项是 {label, value}",
  '- form：children[]、submit {"type":"<已注册的动作>"}；可选 submitLabel',
  "- field：bind(state 的键)、fieldType(text|number|checkbox|select|radio|textarea)、label；可选 required、min、max、minLength、maxLength、pattern、options[] 每项 {label,value}",
  '- button：label、action {"type":"<已注册的动作>"}；可选 variant(primary|secondary|danger)、action.params',
  "- card：type(已注册的卡片)、data",
  "field 通过 bind 写进 state，form 提交它下面的所有 field。任何值都可以改写成 {\"$state\":\"键\"}。",
].join("\n")

const EXAMPLE = [
  "```ui",
  "{",
  '  "version": 1, "id": "today", "state": { "title": "", "when": "" },',
  '  "root": { "kind": "stack", "id": "root", "gap": "md", "children": [',
  '    { "kind": "heading", "id": "h", "level": 3, "text": "今日待办" },',
  '    { "kind": "list", "id": "l", "items": ["09:30 过稿", "11:00 提交升级"] },',
  '    { "kind": "divider", "id": "d" },',
  '    { "kind": "form", "id": "f", "submit": { "type": "ACTION" }, "submitLabel": "添加",',
  '      "children": [',
  '        { "kind": "field", "id": "f1", "bind": "title", "fieldType": "text", "label": "标题", "required": true },',
  '        { "kind": "field", "id": "f2", "bind": "when", "fieldType": "text", "label": "时间" }',
  '      ] }',
  "  ] }",
  "}",
  "```",
].join("\n")

const PROMPT: MessageBundle = {
  en: {
    intro: "Declarative UI (fenced): emit exactly one ```ui fenced block containing one JSON document: {version:1,id,state?,root}.",
    kinds: NODE_RULES_EN,
    state: "Actions are declarative; the application performs them.",
    never: "Never emit HTML, Markdown, CSS, JavaScript, URLs, imports, remote components, workflows, artifact commands, generated code, or extra keys.",
    bounds: "Bounds: {nodes} nodes, depth {depth}, {children} children per container, {bytes} source bytes.",
    // The whole document is refused when one action name is wrong, so the model
    // needs to be told that plainly rather than left to infer it from a list.
    actions: "Registered actions (a form or button may name only these, and must bind exactly the parameters listed; * marks required):",
    actionsRule: "A button or form may name only a registered action. Naming any other action discards the whole block, so when none are registered, emit no button and no form.",
    example: "Example (replace ACTION with a registered action, and drop the form entirely if none are registered):",
    cards: "Registered cards:",
    none: "none",
  },
  "zh-CN": {
    intro: "声明式界面（围栏代码块）：输出恰好一个 ```ui 围栏块，块内是一个 JSON 文档：{version:1,id,state?,root}。",
    kinds: NODE_RULES_ZH,
    state: "动作是声明式的，由应用负责执行。",
    never: "禁止输出 HTML、Markdown、CSS、JavaScript、URL、import、远程组件、工作流、artifact 指令、生成的代码，以及任何多余的字段。",
    bounds: "限制：最多 {nodes} 个节点，嵌套深度 {depth}，每个容器最多 {children} 个子节点，源码最多 {bytes} 字节。",
    actions: "已注册的动作（form 和 button 只能用这些，并且必须按列出的参数名来 bind；带 * 的是必填）：",
    actionsRule: "button 和 form 只能引用已注册的动作。写了别的动作会导致整个块被丢弃，所以当一个动作都没有注册时，不要输出 button，也不要输出 form。",
    example: "示例（把 ACTION 换成已注册的动作；一个都没注册时，整个 form 都不要写）：",
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
    m.actions,
    ...(actions.length
      ? actions.map((type) => {
          // Same shape as the card list below: a model that has to bind a form
          // to an action needs its parameter names, not just its own.
          const fields = schemaFields(actionRuntime.describeAction?.(type))
          return fields ? `- ${type}: ${fields}` : `- ${type}`
        })
      : [`- ${m.none}`]),
    m.actionsRule,
    m.example,
    EXAMPLE.replace("ACTION", actions[0] ?? "ACTION"),
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
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  return Object.entries(schema.properties)
    .map(([name, field]) => {
      const type = Array.isArray(field.type) ? field.type.join("|") : field.type ?? "any"
      return `${name}${required.has(name) ? "*" : ""}(${type})`
    })
    .join(", ")
}
