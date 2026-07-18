# AIGUI — LLM 流式内容渲染 SDK 设计

日期：2026-07-18
状态：已通过设计评审，待写实现计划

## 1. 定位

一个**框架无关**的、面向 LLM 流式输出的内容渲染 SDK。核心 headless，React / Vue / vanilla JS 都能用，打包为 npm 包。

能力：
- 边生成边渲染 markdown（GFM、代码高亮、KaTeX、Mermaid）。
- 渲染 LLM 生成的**卡片**（结构化富组件），带可交互按钮。
- 卡片结构一处定义，SDK 同时负责「渲染它」+「把规格生成给 LLM」。
- 流式健壮：内存中临时补全半截 markdown / JSON，绝不因半截语法崩溃。

## 2. 卡片承载格式

以 Markdown 为主体，卡片用**围栏代码块 + 类型标记**承载：

````
正常的流式文本...

```card:weather
{ "city": "东京", "temp": 22 }
```

继续正常文本...
````

理由：对任意 LLM 通用（纯文本流，不依赖 function calling）；围栏块起止边界清晰，流式解析可干净判断卡片是否收完；块内 JSON 类型强、完全可控；普通 markdown 走成熟生态。

## 3. 包结构（pnpm workspace + Turborepo）

| 包 | 作用 | 依赖重量 |
|---|---|---|
| `@aigui/core` | headless 核心：流式聚合、markdown-it 解析、AST diff、卡片注册表、流式补全、sanitizer。**零框架依赖** | 轻 |
| `@aigui/react` | React 适配：`<AiRenderer>` 组件、`useAiRenderer` hook | peer: react |
| `@aigui/vue` | Vue 适配：`<AiRenderer>` 组件、`useAiRenderer` composable | peer: vue |
| `@aigui/vanilla` | 直接挂 DOM 的 `createRenderer(el, ...)` | 轻 |
| `@aigui/plugin-highlight` | 代码高亮（Shiki），含复制按钮 | 重（可选）|
| `@aigui/plugin-katex` | 数学公式 | 重（可选）|
| `@aigui/plugin-mermaid` | 图表 | 重（可选）|

样式方针：**核心真 headless**，不带观点性主题，只给结构 + class 钩子。高亮 / KaTeX / Mermaid 插件各自附带其运行所必需的 CSS，用户按需 import。重依赖不进核心包。

## 4. 数据流（核心机制）

```
文本 chunk 流
   │  push(chunk) / feed(asyncIterable | ReadableStream)
   ▼
[流式聚合器]  累积全文缓冲 buffer
   │  每来一块触发
   ▼
[流式补全]  在 buffer 副本上临时补全半截语法（不污染真实 buffer）
   │
   ▼
[markdown-it 全文 re-parse]  → 新 AST（卡片围栏块识别为 CardNode）
   │
   ▼
[AST diff]  与上一次 AST 比对，算最小变更
   │
   ▼
[渲染 patch 事件]  框架无关的抽象事件（新增/更新/替换节点）
   │
   ├─ React 适配 → React 元素/状态更新
   ├─ Vue 适配   → Vue vnode/响应式更新
   └─ vanilla    → 直接 DOM patch
```

核心只吐**框架无关的 AST + patch 事件**，不碰任何框架。流式策略为「每块 re-parse + AST diff」，实现稳、兼容所有 markdown 特性，聊天场景性能足够。

## 5. 流式补全（`@aigui/core` 专门模块）

在内存里对缓冲做一次临时补全再喂给解析器，补全**只用于本次渲染**，不污染真实缓冲；下一块用新全文重来。两个纯函数模块，可单测（喂各种半截输入断言输出）：

### `repairMarkdown(buffer): string`
- 未闭合的 `**加粗**` `*斜体*` `` `行内码` `` `~~删除~~` → 临时补闭合符，平滑变样式而非露出裸符号。
- 未闭合的 ` ``` ` 代码围栏 → 临时补闭合，代码块边流边显示。
- 悬空的 `[链接` / `![图` → 暂当普通文本，收全再变链接。

### `parsePartialJSON(str): { data, complete }`
- 自动闭合未收完的 `"字符串`、`{`、`[`。
- 丢掉结尾半个 token（如 `"price": 12` 后未写完部分）。
- 尽量抽出已到达字段，让卡片先渲染已有部分（标题先出、价格后补）。
- `complete=false` 直到真正的闭合 ` ``` ` 到达；彻底无法解析 → 返回空 data，适配层渲染 loading 骨架，绝不抛错。

## 6. 卡片系统（`@aigui/core`）

一份注册，三件事：渲染 + 生成给 LLM 的规格 + action 事件。

```ts
interface CardDef<TData, TComponent> {
  type: string                    // 对应 ```card:<type>
  description: string             // 给 LLM 看的用途说明
  schema?: JSONSchema             // 结构；用于校验 + 生成 prompt spec
  example?: TData                 // 给 LLM 的示例
  render: TComponent              // 框架各自的组件（薄适配层里类型不同）
  validate?: (data: TData) => boolean
}

class CardRegistry {
  register(def: CardDef): void
  toPromptSpec(): string          // → 塞进 system prompt 的文本
  toJSONSchema(): JSONSchema      // → function calling / structured output
  parse(type: string, rawJson: string): { data: unknown; complete: boolean; valid: boolean }
}
```

### 6.1 流式健壮性
卡片 JSON 边流边收，`parse` 用 `parsePartialJSON` 判断 `complete`：
- 未收全 → 适配层渲染骨架 / loading。
- 收全且 `valid` → 渲染真实卡片。
- 收全但 `valid=false`（LLM 出错）→ 回退成代码块原样显示，绝不崩。

### 6.2 把结构喂给 LLM（闭环）
卡片结构只在注册处定义一次，SDK 反向生成给 LLM 的说明：

```ts
const systemPrompt = `你是助手...\n\n${registry.toPromptSpec()}`
```

`toPromptSpec()` 产出可直接塞进 system prompt 的文本，说明围栏块格式、可用卡片列表、每个卡片的字段与示例。若用 function calling / 结构化输出，`toJSONSchema()` 导出同一份 schema，类型更硬。开发者不用两地手写、不会对不上。

### 6.3 卡片按钮 → 请求（action 事件机制）
卡片按钮只声明**意图**，不含真实 URL，避免把安全口子留给模型：

````
```card:flight
{
  "title": "东京 → 大阪",
  "buttons": [
    { "label": "预订", "action": "book_flight", "params": { "id": "JL123" } }
  ]
}
```
````

SDK 渲染按钮，点击时抛统一事件，宿主决定怎么发请求：

```ts
<AiRenderer onCardAction={(a) => {
  // a = { type:'book_flight', params:{id:'JL123'}, cardId }
  if (a.type === 'book_flight') myApi.book(a.params.id)
}} />
```

真实接口、鉴权、URL 全在 App 手里，LLM 碰不到；action 名可白名单校验。

可选：`requestExecutor`（带 URL 白名单）作为独立能力，让卡片内嵌真实请求，**默认关闭**。

## 7. 插件系统 + 安全

核心解析基于 markdown-it，复用其可插拔生态。统一插件接口，重依赖全部外置：

```ts
interface AiGuiPlugin {
  name: string
  extendParser?(md: MarkdownIt): void
  nodeRenderers?: Record<string, Renderer>
  css?: string                    // 该插件必需的样式，用户按需 import
}
```

- `@aigui/plugin-highlight`（Shiki）、`plugin-katex`、`plugin-mermaid` 均实现此接口；核心不依赖它们。
- Mermaid / KaTeX 这类「块收全才能渲染」的，复用卡片同款 `complete` 机制，避免流式中途渲染报错。

安全：核心内置 sanitizer（白名单，DOMPurify 思路），默认过滤 `<script>` / 事件属性 / 危险协议，防 XSS。用户可传自定义白名单。SSR / Node 用同构 sanitizer。默认清洗、可配置。

## 8. 各框架公开 API

**React**
```tsx
const { push, feed, reset } = useAiRenderer()
<AiRenderer registry={registry} plugins={[katex()]}
            onCardAction={handle} sanitize />
```

**Vue**
```vue
<AiRenderer :registry :plugins @card-action="handle" />
```
配 `useAiRenderer()` composable。

**Vanilla**
```ts
const r = createRenderer(el, { registry, plugins, onCardAction })
r.feed(readableStream)   // 或 r.push(chunk)
```

三者输入统一：`push(string)`、`feed(AsyncIterable | ReadableStream)`、`reset()`。

## 9. 工程

- pnpm workspace + Turborepo；每包用 tsup 出 ESM + CJS + d.ts。
- 测试：Vitest（核心解析 / diff / 流式补全 / sanitizer 单测）；React/Vue 用 Testing Library；流式用「分片喂入」快照测。
- 核心目标：`@aigui/core` gzip 尽量小（markdown-it + 容错 JSON + sanitizer），重功能全在可选插件。

## 10. 非目标（v1 不做）

- 不做真正的增量流式解析器（每块 re-parse 已足够）。
- 不内置默认视觉主题（真 headless）。
- 不默认开启卡片内嵌真实请求（仅可选 requestExecutor）。
- 不做 SSR 流式（v1 聚焦客户端流式渲染）。
