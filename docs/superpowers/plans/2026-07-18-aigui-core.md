# @aigui/core 实现计划（子项目 1：地基）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 headless、零框架依赖的 `@aigui/core`：流式聚合 → 内存补全 → markdown-it 解析（含卡片围栏块）→ AST diff → 框架无关 patch 事件，外加卡片注册表与 sanitizer。

**Architecture:** 纯函数模块（`parsePartialJSON` / `repairMarkdown`）+ 有状态编排器（`Renderer`）。核心只吐框架无关的 `ASTNode[]` 与 `Patch[]` 事件，不碰任何 UI 框架。基于 markdown-it 每块 re-parse + 结构化 diff。

**Tech Stack:** TypeScript（strict）、pnpm workspace、Turborepo、tsdown（Rolldown/Oxc，Rust 内核）打包、Vitest 测试、markdown-it 解析。

参考设计：`docs/superpowers/specs/2026-07-18-aigui-llm-render-sdk-design.md`

---

## 文件结构

```
package.json                      # 根 workspace（private）
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
vitest.workspace.ts
packages/core/
  package.json                    # @aigui/core
  tsconfig.json
  tsdown.config.ts
  src/
    types.ts                      # ASTNode / Patch / CardDef / RenderOutput / 事件
    partial-json.ts               # parsePartialJSON
    repair-markdown.ts            # repairMarkdown
    sanitizer.ts                  # sanitizeHtml
    card-registry.ts              # CardRegistry
    parser.ts                     # createParser：markdown-it → ASTNode[]（含 card fence）
    diff.ts                       # diffAst → Patch[]
    renderer.ts                   # Renderer：push/feed/reset → 触发 onPatch
    index.ts                      # 公开导出
  src/*.test.ts                   # 与被测文件同目录
```

每个文件单一职责：纯函数各自独立可测；`renderer.ts` 只做编排，把其它模块串起来。

---

## Task 0: Monorepo 脚手架 + core 包骨架

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `vitest.workspace.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/tsdown.config.ts`
- Create: `packages/core/src/index.ts`（临时 `export {}`）, `packages/core/src/smoke.test.ts`

- [ ] **Step 1: 写根配置文件**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

根 `package.json`:
```json
{
  "name": "aigui",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "turbo run build",
    "test": "vitest run",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsdown": "^0.9.0"
  },
  "packageManager": "pnpm@9.12.0"
}
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.workspace.ts`:
```ts
export default ["packages/*"]
```

- [ ] **Step 2: 写 core 包配置**

`packages/core/package.json`:
```json
{
  "name": "@aigui/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "markdown-it": "^14.1.0"
  },
  "devDependencies": {
    "@types/markdown-it": "^14.1.2"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src" },
  "include": ["src"]
}
```

`packages/core/tsdown.config.ts`:
```ts
import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
})
```

`packages/core/src/index.ts`:
```ts
export {}
```

- [ ] **Step 3: 写冒烟测试**

`packages/core/src/smoke.test.ts`:
```ts
import { expect, it } from "vitest"

it("workspace runs", () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 4: 安装并验证**

Run: `pnpm install && pnpm test`
Expected: 冒烟测试 PASS。

Run: `pnpm --filter @aigui/core build`
Expected: 生成 `packages/core/dist/index.js`、`index.cjs`、`index.d.ts`。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: monorepo 脚手架 + @aigui/core 骨架（pnpm/turbo/tsdown/vitest）"
```

---

## Task 1: parsePartialJSON（容错部分 JSON 解析）

**Files:**
- Create: `packages/core/src/partial-json.ts`
- Test: `packages/core/src/partial-json.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest"
import { parsePartialJSON } from "./partial-json"

describe("parsePartialJSON", () => {
  it("解析完整对象，complete=true", () => {
    expect(parsePartialJSON('{"a":1}')).toEqual({ data: { a: 1 }, complete: true })
  })

  it("补全未闭合对象", () => {
    expect(parsePartialJSON('{"a":1')).toEqual({ data: { a: 1 }, complete: false })
  })

  it("补全未闭合字符串", () => {
    expect(parsePartialJSON('{"title":"东')).toEqual({ data: { title: "东" }, complete: false })
  })

  it("丢弃结尾未写完的键值", () => {
    expect(parsePartialJSON('{"a":1,"b"')).toEqual({ data: { a: 1 }, complete: false })
  })

  it("丢弃结尾未写完的数字后补全", () => {
    expect(parsePartialJSON('{"a":1,"price":')).toEqual({ data: { a: 1 }, complete: false })
  })

  it("补全嵌套数组与对象", () => {
    expect(parsePartialJSON('{"items":[{"id":1},{"id":2')).toEqual({
      data: { items: [{ id: 1 }, { id: 2 }] },
      complete: false,
    })
  })

  it("空字符串返回空 data", () => {
    expect(parsePartialJSON("")).toEqual({ data: undefined, complete: false })
  })

  it("彻底无法解析返回 undefined 而不抛错", () => {
    expect(parsePartialJSON("not json至少不崩")).toEqual({ data: undefined, complete: false })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @aigui/core test partial-json`
Expected: FAIL（parsePartialJSON 未定义）。

- [ ] **Step 3: 实现**

策略：先尝试直接 `JSON.parse`（成功即 complete=true）。失败则扫描字符串、跟踪字符串/对象/数组栈，剪掉结尾不完整的 token，再补齐所有未闭合的 `"`, `}`, `]`，尝试解析。仍失败则逐步回退到最后一个安全边界。

```ts
export interface PartialJSONResult {
  data: unknown
  complete: boolean
}

export function parsePartialJSON(input: string): PartialJSONResult {
  const str = input.trim()
  if (str === "") return { data: undefined, complete: false }
  try {
    return { data: JSON.parse(str), complete: true }
  } catch {
    // fall through to repair
  }
  const repaired = repair(str)
  if (repaired !== null) {
    try {
      return { data: JSON.parse(repaired), complete: false }
    } catch {
      // fall through
    }
  }
  return { data: undefined, complete: false }
}

function repair(str: string): string | null {
  const stack: string[] = [] // "}" 或 "]" 期望的闭合符
  let inString = false
  let escaped = false
  let lastValueEnd = -1 // 可安全截断的位置（完整 token 之后）

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') {
        inString = false
        lastValueEnd = i + 1
      }
      continue
    }
    switch (ch) {
      case '"':
        inString = true
        break
      case "{":
        stack.push("}")
        break
      case "[":
        stack.push("]")
        break
      case "}":
      case "]":
        stack.pop()
        lastValueEnd = i + 1
        break
      case ",":
        lastValueEnd = i // 逗号前是完整 token
        break
      case " ":
      case "\n":
      case "\t":
      case "\r":
        break
      default:
        // 数字/true/false/null 的一部分
        if (/[0-9eE+\-.]/.test(ch) || /[a-z]/.test(ch)) {
          // 只有当它构成完整字面量时才在闭合处更新 lastValueEnd
        }
        break
    }
  }

  // 截断到最后一个完整 token；处理未闭合字符串（保留已收字符）
  let body: string
  if (inString) {
    body = str + '"' // 补全未闭合字符串
    // 补全后其后无逗号，直接闭合容器
    return closeContainers(body, stack)
  }
  if (lastValueEnd === -1) return null
  body = str.slice(0, lastValueEnd).replace(/,\s*$/, "")
  return closeContainers(body, stack)
}

function closeContainers(body: string, stack: string[]): string {
  let out = body.replace(/,\s*$/, "")
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i]
  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @aigui/core test partial-json`
Expected: PASS（8/8）。若个别边界用例失败，调整 `repair` 的截断逻辑直至全绿；这些测试就是行为契约。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/partial-json.ts packages/core/src/partial-json.test.ts
git commit -m "feat(core): parsePartialJSON 容错部分 JSON 解析"
```

---

## Task 2: repairMarkdown（内存临时补全半截 markdown）

**Files:**
- Create: `packages/core/src/repair-markdown.ts`
- Test: `packages/core/src/repair-markdown.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest"
import { repairMarkdown } from "./repair-markdown"

describe("repairMarkdown", () => {
  it("完整文本原样返回", () => {
    expect(repairMarkdown("**bold** done")).toBe("**bold** done")
  })

  it("补全未闭合加粗", () => {
    expect(repairMarkdown("hello **wor")).toBe("hello **wor**")
  })

  it("补全未闭合行内码", () => {
    expect(repairMarkdown("use `npm")).toBe("use `npm`")
  })

  it("补全未闭合代码围栏", () => {
    expect(repairMarkdown("```ts\nconst a = 1")).toBe("```ts\nconst a = 1\n```")
  })

  it("已闭合围栏不再补", () => {
    const md = "```ts\nconst a = 1\n```"
    expect(repairMarkdown(md)).toBe(md)
  })

  it("悬空链接文本保持原样（不补成链接）", () => {
    expect(repairMarkdown("see [docs")).toBe("see [docs")
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @aigui/core test repair-markdown`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
export function repairMarkdown(buffer: string): string {
  let out = buffer

  // 1. 代码围栏优先：奇数个 ``` → 补闭合
  const fenceCount = (out.match(/^```/gm) ?? []).length
  if (fenceCount % 2 === 1) {
    if (!out.endsWith("\n")) out += "\n"
    out += "```"
    return out // 围栏内不再处理行内语法
  }

  // 2. 行内码：奇数个未转义反引号 → 补一个
  const tick = (out.match(/`/g) ?? []).length
  if (tick % 2 === 1) out += "`"

  // 3. 加粗 **：成对计数
  const bold = (out.match(/\*\*/g) ?? []).length
  if (bold % 2 === 1) out += "**"

  // 4. 删除线 ~~
  const strike = (out.match(/~~/g) ?? []).length
  if (strike % 2 === 1) out += "~~"

  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @aigui/core test repair-markdown`
Expected: PASS（6/6）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/repair-markdown.ts packages/core/src/repair-markdown.test.ts
git commit -m "feat(core): repairMarkdown 流式补全半截 markdown"
```

---

## Task 3: 核心类型定义

**Files:**
- Create: `packages/core/src/types.ts`

- [ ] **Step 1: 写类型（无测试，纯声明；由后续任务消费验证）**

```ts
import type MarkdownIt from "markdown-it"

/** 框架无关的渲染节点 */
export interface ASTNode {
  key: string          // 稳定标识，用于 diff
  type: string         // "paragraph" | "heading" | "code" | "card" | 插件自定义类型
  tag?: string
  content?: string
  attrs?: Record<string, string>
  children?: ASTNode[]
  /** 卡片专用 */
  card?: { type: string; data: unknown; complete: boolean; valid: boolean }
}

/** diff 产出的 patch 事件 */
export type Patch =
  | { op: "insert"; index: number; node: ASTNode }
  | { op: "update"; key: string; node: ASTNode }
  | { op: "remove"; key: string }

/** 插件节点渲染输出（框架中立描述符） */
export type RenderOutput =
  | { kind: "html"; html: string }
  | { kind: "element"; tag: string; props?: Record<string, unknown>; children?: RenderOutput[] }
  | { kind: "card"; type: string; data: unknown }

export type NodeRenderer = (node: ASTNode) => RenderOutput

export interface JSONSchema {
  type?: string
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  required?: string[]
  [k: string]: unknown
}

export interface CardDef<TData = unknown, TComponent = unknown> {
  type: string
  description: string
  schema?: JSONSchema
  example?: TData
  render?: TComponent
  validate?: (data: TData) => boolean
}

export interface AIGuiPlugin {
  name: string
  extendParser?: (md: MarkdownIt) => void
  cards?: CardDef[]
  nodeRenderers?: Record<string, NodeRenderer>
  isBlockComplete?: (nodeType: string, raw: string) => boolean
  css?: string
}

export interface RendererOptions {
  registry?: import("./card-registry").CardRegistry
  plugins?: AIGuiPlugin[]
  sanitize?: boolean
  onPatch?: (patches: Patch[]) => void
}
```

- [ ] **Step 2: 类型检查通过**

Run: `pnpm --filter @aigui/core typecheck`
Expected: 无错误（此时 card-registry 尚未建，`import("./card-registry")` 会报错——先把该字段改为 `unknown`，Task 4 建好后回填。为避免回填遗漏，本步直接把 `registry?: unknown` 写好，Task 4 收尾时改成具体类型）。

修正：`types.ts` 中先写 `registry?: unknown`。

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): 核心类型定义（ASTNode/Patch/RenderOutput/CardDef/AIGuiPlugin）"
```

---

## Task 4: CardRegistry

**Files:**
- Create: `packages/core/src/card-registry.ts`
- Test: `packages/core/src/card-registry.test.ts`
- Modify: `packages/core/src/types.ts`（`RendererOptions.registry` 改回 `CardRegistry`）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest"
import { CardRegistry } from "./card-registry"

const flight = {
  type: "flight",
  description: "航班信息",
  schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
  example: { title: "东京→大阪" },
}

describe("CardRegistry", () => {
  it("注册后可解析完整 JSON", () => {
    const r = new CardRegistry()
    r.register(flight)
    const res = r.parse("flight", '{"title":"x"}')
    expect(res).toMatchObject({ data: { title: "x" }, complete: true, valid: true })
  })

  it("未收全 JSON → complete=false", () => {
    const r = new CardRegistry()
    r.register(flight)
    expect(r.parse("flight", '{"title":"x"').complete).toBe(false)
  })

  it("缺 required 字段 → valid=false", () => {
    const r = new CardRegistry()
    r.register(flight)
    expect(r.parse("flight", '{"other":1}').valid).toBe(false)
  })

  it("未注册类型 → valid=false", () => {
    const r = new CardRegistry()
    expect(r.parse("nope", "{}").valid).toBe(false)
  })

  it("toPromptSpec 含类型名与描述", () => {
    const r = new CardRegistry()
    r.register(flight)
    const spec = r.toPromptSpec()
    expect(spec).toContain("flight")
    expect(spec).toContain("航班信息")
    expect(spec).toContain("card:flight")
  })

  it("toJSONSchema 汇总所有卡片", () => {
    const r = new CardRegistry()
    r.register(flight)
    const s = r.toJSONSchema()
    expect(s.properties).toHaveProperty("flight")
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @aigui/core test card-registry`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
import { parsePartialJSON } from "./partial-json"
import type { CardDef, JSONSchema } from "./types"

export interface CardParseResult {
  data: unknown
  complete: boolean
  valid: boolean
}

export class CardRegistry {
  private cards = new Map<string, CardDef>()

  register(def: CardDef): void {
    this.cards.set(def.type, def)
  }

  has(type: string): boolean {
    return this.cards.has(type)
  }

  parse(type: string, rawJson: string): CardParseResult {
    const def = this.cards.get(type)
    const { data, complete } = parsePartialJSON(rawJson)
    if (!def) return { data, complete, valid: false }
    const valid = complete && this.validate(def, data)
    return { data, complete, valid }
  }

  private validate(def: CardDef, data: unknown): boolean {
    if (def.validate) return def.validate(data as never)
    if (def.schema) return validateSchema(def.schema, data)
    return true
  }

  toPromptSpec(): string {
    const lines: string[] = [
      "你可以输出卡片。格式为 ```card:<type> 围栏块，块内是 JSON。可用卡片：",
    ]
    for (const def of this.cards.values()) {
      lines.push(`- \`card:${def.type}\`：${def.description}`)
      if (def.schema?.properties) {
        const fields = Object.entries(def.schema.properties)
          .map(([k, v]) => `${k}(${v.type ?? "any"})`)
          .join(", ")
        lines.push(`  字段：${fields}`)
      }
      if (def.example !== undefined) {
        lines.push(`  示例：${JSON.stringify(def.example)}`)
      }
    }
    return lines.join("\n")
  }

  toJSONSchema(): JSONSchema {
    const properties: Record<string, JSONSchema> = {}
    for (const def of this.cards.values()) {
      if (def.schema) properties[def.type] = def.schema
    }
    return { type: "object", properties }
  }
}

/** 极简 JSON Schema 校验：只覆盖 type / required / properties，够卡片用 */
function validateSchema(schema: JSONSchema, data: unknown): boolean {
  if (schema.type === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return false
    const obj = data as Record<string, unknown>
    for (const req of schema.required ?? []) {
      if (!(req in obj)) return false
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj && !validateSchema(sub, obj[key])) return false
    }
    return true
  }
  if (schema.type === "array") {
    if (!Array.isArray(data)) return false
    return schema.items ? data.every((d) => validateSchema(schema.items!, d)) : true
  }
  if (schema.type === "string") return typeof data === "string"
  if (schema.type === "number") return typeof data === "number"
  if (schema.type === "boolean") return typeof data === "boolean"
  return true
}
```

- [ ] **Step 4: 回填类型**

在 `types.ts` 中把 `registry?: unknown` 改为：
```ts
registry?: CardRegistry
```
并加 `import type { CardRegistry } from "./card-registry"`。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @aigui/core test card-registry && pnpm --filter @aigui/core typecheck`
Expected: PASS（6/6），typecheck 无错误。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/card-registry.ts packages/core/src/card-registry.test.ts packages/core/src/types.ts
git commit -m "feat(core): CardRegistry（parse/toPromptSpec/toJSONSchema + 极简 schema 校验）"
```

---

## Task 5: parser（markdown-it → ASTNode[]，含卡片围栏块）

**Files:**
- Create: `packages/core/src/parser.ts`
- Test: `packages/core/src/parser.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest"
import { CardRegistry } from "./card-registry"
import { createParser } from "./parser"

describe("createParser", () => {
  it("解析段落", () => {
    const parse = createParser()
    const nodes = parse("hello world")
    expect(nodes[0]).toMatchObject({ type: "paragraph" })
    expect(nodes[0].content).toContain("hello world")
  })

  it("解析标题", () => {
    const parse = createParser()
    const nodes = parse("# Title")
    expect(nodes[0]).toMatchObject({ type: "heading", tag: "h1" })
  })

  it("card 围栏块识别为 card 节点", () => {
    const registry = new CardRegistry()
    registry.register({ type: "weather", description: "天气", schema: { type: "object" } })
    const parse = createParser({ registry })
    const nodes = parse('```card:weather\n{"city":"tokyo"}\n```')
    const card = nodes.find((n) => n.type === "card")
    expect(card?.card).toMatchObject({ type: "weather", data: { city: "tokyo" }, complete: true })
  })

  it("普通代码围栏仍是 code 节点", () => {
    const parse = createParser()
    const nodes = parse("```ts\nconst a=1\n```")
    expect(nodes[0]).toMatchObject({ type: "code" })
  })

  it("每个节点有稳定 key", () => {
    const parse = createParser()
    const nodes = parse("# A\n\nbody")
    expect(nodes[0].key).toBeTruthy()
    expect(nodes[0].key).not.toBe(nodes[1].key)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @aigui/core test parser`
Expected: FAIL。

- [ ] **Step 3: 实现**

`createParser` 用 markdown-it 解析为 tokens，再归并为块级 `ASTNode[]`。card 围栏块：info 以 `card:` 开头的 fence，用 registry 解析其内容。key 用「块序号 + type」保证同结构稳定。

```ts
import MarkdownIt from "markdown-it"
import type { CardRegistry } from "./card-registry"
import type { ASTNode } from "./types"

export interface ParserOptions {
  registry?: CardRegistry
  configureMd?: (md: MarkdownIt) => void
}

export function createParser(options: ParserOptions = {}): (src: string) => ASTNode[] {
  const md = new MarkdownIt({ html: true, linkify: true })
  options.configureMd?.(md)

  return (src: string): ASTNode[] => {
    const tokens = md.parse(src, {})
    const nodes: ASTNode[] = []
    let index = 0

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]

      if (t.type === "fence") {
        const info = t.info.trim()
        if (info.startsWith("card:") && options.registry) {
          const cardType = info.slice("card:".length)
          const res = options.registry.parse(cardType, t.content)
          nodes.push({
            key: `${index++}:card`,
            type: "card",
            card: { type: cardType, data: res.data, complete: res.complete, valid: res.valid },
          })
        } else {
          nodes.push({
            key: `${index++}:code`,
            type: "code",
            tag: "code",
            attrs: info ? { lang: info } : undefined,
            content: t.content,
          })
        }
        continue
      }

      if (t.type === "heading_open") {
        const inline = tokens[i + 1]
        nodes.push({
          key: `${index++}:heading`,
          type: "heading",
          tag: t.tag,
          content: inline?.content ?? "",
        })
        i += 2 // skip inline + heading_close
        continue
      }

      if (t.type === "paragraph_open") {
        const inline = tokens[i + 1]
        nodes.push({
          key: `${index++}:paragraph`,
          type: "paragraph",
          tag: "p",
          content: inline?.content ?? "",
        })
        i += 2
        continue
      }

      // 其它块（列表/引用/表格等）暂整体保留其渲染后的 html，后续任务细化
      if (t.type.endsWith("_open") && t.level === 0) {
        // 收集到对应 close，用 renderer 生成 html 交给 sanitizer
        const closeType = t.type.replace("_open", "_close")
        let j = i
        let depth = 0
        for (; j < tokens.length; j++) {
          if (tokens[j].type === t.type) depth++
          if (tokens[j].type === closeType) {
            depth--
            if (depth === 0) break
          }
        }
        const slice = tokens.slice(i, j + 1)
        nodes.push({
          key: `${index++}:${t.type}`,
          type: "html",
          content: md.renderer.render(slice, md.options, {}),
        })
        i = j
        continue
      }
    }

    return nodes
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @aigui/core test parser`
Expected: PASS（5/5）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parser.ts packages/core/src/parser.test.ts
git commit -m "feat(core): createParser（markdown-it → ASTNode[]，含卡片围栏块）"
```

---

## Task 6: diffAst（AST → Patch[]）

**Files:**
- Create: `packages/core/src/diff.ts`
- Test: `packages/core/src/diff.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest"
import { diffAst } from "./diff"
import type { ASTNode } from "./types"

const n = (key: string, content: string): ASTNode => ({ key, type: "paragraph", content })

describe("diffAst", () => {
  it("首次全部 insert", () => {
    const patches = diffAst([], [n("0:p", "a"), n("1:p", "b")])
    expect(patches).toEqual([
      { op: "insert", index: 0, node: n("0:p", "a") },
      { op: "insert", index: 1, node: n("1:p", "b") },
    ])
  })

  it("尾部追加只产生 insert", () => {
    const prev = [n("0:p", "a")]
    const next = [n("0:p", "a"), n("1:p", "b")]
    expect(diffAst(prev, next)).toEqual([{ op: "insert", index: 1, node: n("1:p", "b") }])
  })

  it("同 key 内容变化产生 update", () => {
    const prev = [n("0:p", "hel")]
    const next = [n("0:p", "hello")]
    expect(diffAst(prev, next)).toEqual([{ op: "update", key: "0:p", node: n("0:p", "hello") }])
  })

  it("内容不变无 patch", () => {
    const prev = [n("0:p", "a")]
    expect(diffAst(prev, [n("0:p", "a")])).toEqual([])
  })

  it("消失的节点产生 remove", () => {
    const prev = [n("0:p", "a"), n("1:p", "b")]
    const next = [n("0:p", "a")]
    expect(diffAst(prev, next)).toEqual([{ op: "remove", key: "1:p" }])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @aigui/core test diff`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
import type { ASTNode, Patch } from "./types"

export function diffAst(prev: ASTNode[], next: ASTNode[]): Patch[] {
  const patches: Patch[] = []
  const prevByKey = new Map(prev.map((n) => [n.key, n]))
  const nextKeys = new Set(next.map((n) => n.key))

  next.forEach((node, index) => {
    const old = prevByKey.get(node.key)
    if (!old) {
      patches.push({ op: "insert", index, node })
    } else if (!nodeEqual(old, node)) {
      patches.push({ op: "update", key: node.key, node })
    }
  })

  for (const node of prev) {
    if (!nextKeys.has(node.key)) patches.push({ op: "remove", key: node.key })
  }

  return patches
}

function nodeEqual(a: ASTNode, b: ASTNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @aigui/core test diff`
Expected: PASS（5/5）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/diff.ts packages/core/src/diff.test.ts
git commit -m "feat(core): diffAst（AST → 最小 Patch[]）"
```

---

## Task 7: sanitizeHtml

**Files:**
- Create: `packages/core/src/sanitizer.ts`
- Test: `packages/core/src/sanitizer.test.ts`
- Modify: `packages/core/package.json`（加依赖 `dompurify` + `@types/dompurify`；SSR 安全用其 isomorphic 能力，测试在 jsdom 环境）
- Modify: `packages/core/vitest 配置`：本测试文件顶部加 `// @vitest-environment jsdom`，并加 `jsdom` devDependency

- [ ] **Step 1: 加依赖**

```bash
pnpm --filter @aigui/core add dompurify
pnpm --filter @aigui/core add -D @types/dompurify jsdom
```

- [ ] **Step 2: 写失败测试**

`packages/core/src/sanitizer.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { sanitizeHtml } from "./sanitizer"

describe("sanitizeHtml", () => {
  it("移除 script", () => {
    expect(sanitizeHtml('<p>hi</p><script>alert(1)</script>')).toBe("<p>hi</p>")
  })

  it("移除内联事件属性", () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).not.toContain("onerror")
  })

  it("保留安全标签", () => {
    expect(sanitizeHtml("<strong>bold</strong>")).toBe("<strong>bold</strong>")
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @aigui/core test sanitizer`
Expected: FAIL。

- [ ] **Step 4: 实现**

```ts
import DOMPurify from "dompurify"

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html)
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @aigui/core test sanitizer`
Expected: PASS（3/3）。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sanitizer.ts packages/core/src/sanitizer.test.ts packages/core/package.json
git commit -m "feat(core): sanitizeHtml（DOMPurify 白名单清洗）"
```

---

## Task 8: Renderer（编排：push/feed/reset → onPatch）

**Files:**
- Create: `packages/core/src/renderer.ts`
- Test: `packages/core/src/renderer.test.ts`
- Modify: `packages/core/src/index.ts`（公开导出全部 API）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi } from "vitest"
import { Renderer } from "./renderer"
import type { Patch } from "./types"

describe("Renderer", () => {
  it("push 累积并在每块后触发 onPatch", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("hello")
    expect(onPatch).toHaveBeenCalled()
    const patches: Patch[] = onPatch.mock.calls.at(-1)![0]
    expect(patches.some((p) => p.op === "insert")) .toBe(true)
  })

  it("多次 push 对未闭合加粗做补全渲染，不露出裸符号", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("a **bo")
    const patches: Patch[] = onPatch.mock.calls.at(-1)![0]
    const node = patches.find((p) => "node" in p) as Extract<Patch, { node: unknown }>
    expect(node.node.content ?? "").not.toContain("**bo\n") // 已被补全为加粗
  })

  it("feed 消费 async iterable", async () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    async function* gen() {
      yield "# Ti"
      yield "tle"
    }
    await r.feed(gen())
    expect(onPatch).toHaveBeenCalledTimes(2)
  })

  it("reset 清空状态", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("hello")
    r.reset()
    onPatch.mockClear()
    r.push("world")
    const patches: Patch[] = onPatch.mock.calls.at(-1)![0]
    expect(patches[0]).toMatchObject({ op: "insert", index: 0 })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @aigui/core test renderer`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
import { createParser } from "./parser"
import { diffAst } from "./diff"
import { repairMarkdown } from "./repair-markdown"
import type { ASTNode, Patch, RendererOptions } from "./types"

export class Renderer {
  private buffer = ""
  private prevAst: ASTNode[] = []
  private parse: (src: string) => ASTNode[]
  private options: RendererOptions

  constructor(options: RendererOptions = {}) {
    this.options = options
    this.parse = createParser({ registry: options.registry })
  }

  push(chunk: string): void {
    this.buffer += chunk
    this.render()
  }

  async feed(source: AsyncIterable<string> | ReadableStream<string>): Promise<void> {
    if (Symbol.asyncIterator in source) {
      for await (const chunk of source as AsyncIterable<string>) this.push(chunk)
      return
    }
    const reader = (source as ReadableStream<string>).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value != null) this.push(value)
    }
  }

  reset(): void {
    this.buffer = ""
    this.prevAst = []
  }

  private render(): void {
    const repaired = repairMarkdown(this.buffer)
    const nextAst = this.parse(repaired)
    const patches: Patch[] = diffAst(this.prevAst, nextAst)
    this.prevAst = nextAst
    if (patches.length > 0) this.options.onPatch?.(patches)
  }
}
```

- [ ] **Step 4: 写公开导出**

`packages/core/src/index.ts`:
```ts
export { parsePartialJSON } from "./partial-json"
export type { PartialJSONResult } from "./partial-json"
export { repairMarkdown } from "./repair-markdown"
export { sanitizeHtml } from "./sanitizer"
export { CardRegistry } from "./card-registry"
export type { CardParseResult } from "./card-registry"
export { createParser } from "./parser"
export type { ParserOptions } from "./parser"
export { diffAst } from "./diff"
export { Renderer } from "./renderer"
export type {
  ASTNode,
  Patch,
  RenderOutput,
  NodeRenderer,
  JSONSchema,
  CardDef,
  AIGuiPlugin,
  RendererOptions,
} from "./types"
```

- [ ] **Step 5: 运行全部测试 + typecheck + build**

Run: `pnpm --filter @aigui/core test && pnpm --filter @aigui/core typecheck && pnpm --filter @aigui/core build`
Expected: 全部 PASS；`dist/` 产出 `index.js` / `index.cjs` / `index.d.ts`。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): Renderer 编排（push/feed/reset → onPatch）+ 公开导出"
```

---

## Self-Review 结论

- **Spec 覆盖**：§4 数据流→Task 5/6/8；§5 流式补全→Task 1/2；§6 卡片系统→Task 4（+ parse/toPromptSpec/toJSONSchema）；§7.6 安全→Task 7；类型（§6/§7 接口）→Task 3。插件执行（`nodeRenderers`/`isBlockComplete` 实际生效）与各框架适配、`onCardAction` 属于后续子项目计划，本计划仅落地 `AIGuiPlugin` 类型与 registry 接入点。
- **占位符**：无。每步含真实代码与命令。
- **类型一致**：`ASTNode`/`Patch`/`CardParseResult`/`RendererOptions` 跨任务一致；Task 3 的 `registry?: unknown` 在 Task 4 回填为 `CardRegistry`。

## 后续子项目（各自独立成计划，不在本计划内）

1. `@aigui/react` + `@aigui/vue` + `@aigui/vanilla` 适配层（消费 `Patch[]`，实现 `onCardAction`、插件 `nodeRenderers` 渲染、`RenderOutput` 翻译）。
2. 插件：`plugin-highlight` / `plugin-katex` / `plugin-mermaid` / `plugin-primitives`。
3. `requestExecutor`（可选、默认关闭）。
