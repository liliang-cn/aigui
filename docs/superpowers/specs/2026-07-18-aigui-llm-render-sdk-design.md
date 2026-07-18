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
| `@aigui/react` | React 适配：`<AIRenderer>` 组件、`useAIRenderer` hook | peer: react |
| `@aigui/vue` | Vue 适配：`<AIRenderer>` 组件、`useAIRenderer` composable | peer: vue |
| `@aigui/vanilla` | 直接挂 DOM 的 `createRenderer(el, ...)` | 轻 |
| `@aigui/plugin-highlight` | 代码高亮（Shiki），含复制按钮 | 重（可选）|
| `@aigui/plugin-katex` | 数学公式 | 重（可选）|
| `@aigui/plugin-mermaid` | 图表 | 重（可选）|
| `@aigui/plugin-primitives` | 通用原语卡片（`list` / `key-value` / `table` / `chart` / `layout`），LLM 无需开发者预注册即可拼出临时 UI | 中（可选）|

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

### 6.3 卡片定义的归属
卡片由**应用开发者**定义，LLM 只负责在已注册的卡片里挑一个并填 JSON 数据，**不能发明新卡片类型**。

| 角色 | 负责 |
|---|---|
| AIGUI SDK | 注册机制、解析、渲染管线、把规格生成给 LLM |
| 应用开发者 | 定义卡片目录：`type` / schema / 渲染组件 / description / example |
| LLM | 在注册集合内挑卡片、填数据 |

原因：卡片要真正渲染就得有真实组件（开发者的设计、交互、框架）；LLM 凭空造 `type` 前端无从渲染。因此卡片是**封闭的、开发者掌控的集合**，LLM 经 `toPromptSpec()` 被约束其中；产未注册类型 → 走 §6.1 回退。核心**不内置**任何卡片。

### 6.4 通用原语卡片（可选插件 `@aigui/plugin-primitives`）
面向「不想为每种数据都建组件」的场景：插件提供一组通用原语卡片（`list` / `key-value` / `table` / `chart` / `layout` 容器），LLM 无需开发者预注册即可拼出临时 UI。作为**可选插件**，不进核心（保持核心 headless）；引入时其原语卡片自动注册进 registry，`toPromptSpec()` 也会带上它们的规格。原语卡片自带最小必需样式，遵循 §7 插件 CSS 约定。

### 6.5 卡片按钮 → 请求（action 事件机制）
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
<AIRenderer onCardAction={(a) => {
  // a = { type:'book_flight', params:{id:'JL123'}, cardId }
  if (a.type === 'book_flight') myApi.book(a.params.id)
}} />
```

真实接口、鉴权、URL 全在 App 手里，LLM 碰不到；action 名可白名单校验。

可选：`requestExecutor`（带 URL 白名单）作为独立能力，让卡片内嵌真实请求，**默认关闭**。

## 7. 插件系统

核心解析基于 markdown-it，复用其可插拔生态。**用户能写的插件与内置插件用同一套公开接口，无私有通道**——内置的 highlight / katex / mermaid / primitives 本身就是用这套接口实现的。

### 7.1 插件契约

```ts
interface AIGuiPlugin {
  name: string
  extendParser?(md: MarkdownIt): void            // ① 解析层：定义新语法 → 新 AST 节点（框架无关）
  cards?: CardDef[]                              // ② 批量注册卡片（最简单的扩展方式）
  nodeRenderers?: Record<string, NodeRenderer>   // ③ 新节点怎么渲染
  isBlockComplete?(nodeType: string, raw: string): boolean  // ④ 块级"收全才渲染"判定
  css?: string                                   // ⑤ 该插件必需的样式，用户按需 import
}
```

约束：核心 headless、输出框架无关 AST + patch 事件，因此"渲染新东西"必须跨 React/Vue/vanilla 三框架成立。为此给用户两条路。

### 7.2 简单路（覆盖约 90% 需求，纯数据，不碰解析器）

写个卡片即可，零门槛：
```ts
registry.register({
  type: 'poll', description: '投票卡片', schema: { /* ... */ },
  render: MyPollComponent,   // 你自己框架的组件
})
```

### 7.3 进阶路（新 markdown 语法/节点，超出卡片范畴）

`extendParser` 定语法 + `nodeRenderers` 定渲染。关键：**`nodeRenderer` 不返回具体框架元素，而是返回"框架中立描述符"**，各适配层各自翻译，从而写一次三框架通用：

```ts
type RenderOutput =
  | { kind: 'html'; html: string }                       // 会过 sanitizer
  | { kind: 'element'; tag: string; props?: object; children?: RenderOutput[] }  // 中立 vdom
  | { kind: 'card'; type: string; data: unknown }        // 交给卡片系统

const katexPlugin: AIGuiPlugin = {
  name: 'katex',
  extendParser: md => md.use(katexParserRule),           // 产出 'math' 节点
  isBlockComplete: (t, raw) => raw.endsWith('$$'),
  nodeRenderers: {
    math: node => ({ kind: 'html', html: katex.renderToString(node.content) }),
  },
  css: katexCss,
}
```

KaTeX / Mermaid → 输出 `html` 描述符，天然三框架通用；高亮 → `element` 描述符。

### 7.4 逃生舱（要原生交互组件）

插件如需原生 React/Vue 组件（如可交互图表），按框架分包发 `@myplugin/react`、`@myplugin/vue`，`nodeRenderers` 直接给该框架组件。与整体哲学一致。

### 7.5 用法与生命周期

```ts
<AIRenderer plugins={[katex(), mermaid(), myCustomPlugin()]} />
```
插件按顺序 apply；`css` 由用户决定是否 import；`cards` 自动进 registry 并被 `toPromptSpec()` 带上；`isBlockComplete` 复用卡片同款 `complete` 机制，避免流式中途渲染报错。

### 7.6 安全

核心内置 sanitizer（白名单，DOMPurify 思路），默认过滤 `<script>` / 事件属性 / 危险协议，防 XSS；插件产出的 `kind:'html'` 也过此清洗。用户可传自定义白名单。SSR / Node 用同构 sanitizer。默认清洗、可配置。

## 8. 各框架公开 API

**React**
```tsx
const { push, feed, reset } = useAIRenderer()
<AIRenderer registry={registry} plugins={[katex()]}
            onCardAction={handle} sanitize />
```

**Vue**
```vue
<AIRenderer :registry :plugins @card-action="handle" />
```
配 `useAIRenderer()` composable。

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

## 10. 后端集成契约（语言无关）

核心思路：前后端之间只是 HTTP + JSON，卡片规格就是一段普通字符串。**后端零 AIGUI 依赖**，用 Python / Go / Node.js / Java 皆可。它只做两件事：把前端传来的 `promptSpec` 拼进 system prompt，然后把 LLM 的流原样转发回去。

### 10.1 统一请求契约

前端请求：
```json
POST /api/chat
{
  "messages": [{ "role": "user", "content": "帮我查东京到大阪的航班" }],
  "promptSpec": "…registry.toPromptSpec() 的文本…",
  "jsonSchema": { "…可选，registry.toJSONSchema()…" }
}
```

后端逻辑（任何语言一致）：
```
system = BASE_SYSTEM + "\n\n" + body.promptSpec
调用 LLM（stream=true），逐 delta 以 SSE / chunked 写回纯文本增量
```

响应是纯文本增量流，SDK 的 `feed(response.body)` 直接消费。卡片围栏块混在文本流里，后端不用懂卡片。

### 10.2 各语言片段（均不依赖 SDK）

Go：
```go
system := baseSystem + "\n\n" + req.PromptSpec
stream, _ := client.CreateChatCompletionStream(ctx, openai.ChatCompletionRequest{
    Messages: append([]Msg{{Role: "system", Content: system}}, req.Messages...),
    Stream:   true,
})
for {
    chunk, err := stream.Recv()
    if err != nil { break }
    w.Write([]byte(chunk.Choices[0].Delta.Content)); flusher.Flush()
}
```

Python（FastAPI）：
```python
system = BASE_SYSTEM + "\n\n" + body.promptSpec
async def gen():
    stream = await client.chat.completions.create(
        messages=[{"role": "system", "content": system}, *body.messages], stream=True)
    async for chunk in stream:
        yield chunk.choices[0].delta.content or ""
return StreamingResponse(gen(), media_type="text/event-stream")
```

Node（Express）：
```ts
const system = BASE_SYSTEM + "\n\n" + req.body.promptSpec
const stream = await openai.chat.completions.create({
  messages: [{ role: "system", content: system }, ...req.body.messages], stream: true })
for await (const c of stream) res.write(c.choices[0].delta.content ?? "")
```

Java（Spring，SSE）：
```java
String system = BASE_SYSTEM + "\n\n" + body.getPromptSpec();
// 用你的 LLM SDK 开流，逐 delta：emitter.send(content);
```

### 10.3 结构化输出
`registry.toJSONSchema()` 导出标准 JSON Schema，随 body 传给后端，塞进各自 LLM SDK 的 `tools` / `response_format`。JSON Schema 是通用标准，Go / Python / Java / Node 的 LLM SDK 都认。

### 10.4 卡片按钮的业务接口
按钮点击时 SDK 抛 `onCardAction({ type, params })`，App 再调后端普通 REST 接口（本来就有的业务 API）。后端按 `action` 名做白名单校验，URL / 鉴权全在后端，LLM 碰不到。

## 11. 非目标（v1 不做）

- 不做真正的增量流式解析器（每块 re-parse 已足够）。
- 不内置默认视觉主题（真 headless）。
- 不默认开启卡片内嵌真实请求（仅可选 requestExecutor）。
- 不做 SSR 流式（v1 聚焦客户端流式渲染）。
