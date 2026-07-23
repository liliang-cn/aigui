# AIGUI v0.3 计划

## 目标

将 AIGUI 从“流式 LLM 内容渲染器”扩展为一个完整的 Generative UI runtime，形成以下闭环：

```text
模型流
  -> 结构化 UI
  -> 用户填写表单或触发操作
  -> 安全、可验证的 Action
  -> 应用后端执行
  -> 局部更新已有 Card/UI
```

v0.3 聚焦运行时能力，不以增加大量视觉插件为目标。

## 核心范围

### 1. ActionRegistry

提供类型安全、可验证的声明式操作注册中心。

```ts
const actions = new ActionRegistry()

actions.register({
  type: "weather.refresh",
  schema: {
    type: "object",
    required: ["city"],
    properties: {
      city: { type: "string" },
    },
  },
  async run(params, context) {
    return fetchWeather(params.city, { signal: context.signal })
  },
})
```

功能要求：

- Action allowlist，不允许模型直接指定 URL、脚本或任意函数。
- 参数 schema 验证。
- `idle`、`pending`、`success`、`error` 状态。
- `AbortSignal`、超时和取消。
- 防止重复提交。
- 可配置重试策略。
- Action 返回普通数据、Card patch 或多个 UI patch。
- 提供 `onActionStart`、`onActionSuccess`、`onActionError` 事件。
- React、Vue、Vanilla 使用同一 core runtime。

建议 API：

```ts
const runtime = createActionRuntime({ registry: actions })

<AIRenderer actionRuntime={runtime} />
```

### 2. Stateful Card

为 Card 增加稳定身份和局部更新能力。

Card 数据示例：

```json
{
  "id": "weather-shanghai",
  "city": "Shanghai",
  "tempC": 31
}
```

Card patch 示例：

```json
{
  "op": "update-card",
  "id": "weather-shanghai",
  "patch": {
    "tempC": 29
  }
}
```

功能要求：

- `card.id` 在同一会话内唯一。
- 支持 replace、merge 和 JSON Patch 三种更新策略中的至少一种。
- 更新 Card 时保留组件实例和本地状态。
- 支持 loading、success、error 状态。
- Action 可直接返回 Card patch。
- 支持跨多个模型 turn 更新已有 Card。
- `snapshot()` 和 `restore()` 可保存、恢复 Card 状态。
- 无 ID 的现有 Card 行为保持兼容。

### 3. Form Plugin

新增 `@ai-gui/plugin-form`，通过 JSON 描述安全表单。

```md
```form
{
  "id": "travel-search",
  "fields": [
    {
      "name": "from",
      "type": "text",
      "label": "From",
      "required": true
    },
    {
      "name": "date",
      "type": "date",
      "label": "Departure"
    }
  ],
  "submitAction": "travel.search"
}
```
```

首版字段：

- `text`
- `textarea`
- `number`
- `date`
- `select`
- `checkbox`
- `radio`

功能要求：

- 表单定义 schema 验证。
- 必填、长度、数值范围和 pattern 验证。
- 提交前本地验证。
- 提交操作必须存在于 `ActionRegistry`。
- Pending 时禁用重复提交。
- 显示字段错误和 Action 错误。
- React、Vue、Vanilla 行为一致。
- 支持键盘操作和基础 WCAG 要求。
- 不允许任意 HTML、脚本或动态组件名称。

### 4. Model Stream Adapters

降低真实后端接入成本，优先提供：

- `@ai-gui/openai`
- `@ai-gui/anthropic`
- `@ai-gui/vercel-ai`
- core 中的通用 SSE、JSONL、NDJSON helper

统一输出协议：

```ts
type ModelStreamEvent =
  | { type: "content"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "citation"; data: Citation }
  | { type: "usage"; data: Usage }
  | { type: "error"; error: unknown }
```

功能要求：

- 支持 `ReadableStream<Uint8Array>`。
- 正确处理 UTF-8 chunk 边界。
- 支持取消和 reader cleanup。
- 将 provider 特有事件转换为统一事件。
- 不在 adapter 中绑定任何 UI 框架。
- 保持 provider SDK 为 peer dependency 或可选依赖。
- 提供 mock stream，便于示例和测试。

### 5. DevTools 与 Playground

为插件开发、性能诊断和 bug 复现提供可观察性。

Core debug events：

```ts
const renderer = new Renderer({
  debug: true,
  onDebugEvent(event) {
    console.log(event)
  },
})
```

首版事件：

- Chunk received。
- Feed started、cancelled、completed。
- Stable prefix committed。
- Mutable tail reparsed。
- AST patches emitted。
- Plugin render started、completed、failed。
- Async output resolved、rejected、discarded。
- Mount created、cleaned up。
- Sanitizer input/output size。
- Parse、sanitize、diff 和 adapter commit 耗时。

Playground 功能：

- 输入完整 Markdown 或模拟 token stream。
- 调节 chunk size 和 chunk delay。
- 同时查看 raw stream、repaired Markdown、AST 和 patches。
- 查看 stable prefix 与 mutable tail。
- 注册测试 Card、Action 和 Form。
- 在 React、Vue、Vanilla renderer 间切换。
- 导出最小复现 JSON。

## 架构调整

### Runtime 分层

```text
Transport adapters
  -> ModelStreamEvent
  -> Renderer / StreamRouter
  -> AST + patches
  -> CardStore + ActionRuntime
  -> React / Vue / Vanilla adapter
```

建议新增 core 模块：

```text
packages/core/src/actions.ts
packages/core/src/card-store.ts
packages/core/src/runtime.ts
packages/core/src/debug-events.ts
```

建议新增包：

```text
packages/plugin-form
packages/openai
packages/anthropic
packages/vercel-ai
apps/playground
```

### 数据边界

- LLM 只产生声明式数据。
- 网络请求只由应用注册的 Action handler 执行。
- Form 只能引用已注册 Action。
- Card patch 只能更新已存在且允许更新的 Card。
- Plugin 不得绕过 sanitizer 或安全 element policy。
- Provider adapter 不执行 tool call，只转换事件。

## 实施阶段

### Phase 1：Action Runtime

状态：已完成。

交付内容：

- `ActionRegistry`
- 参数验证
- Action lifecycle
- Abort、timeout、duplicate suppression
- 三端 adapter 接入
- Action contract tests

验收标准：

- 未注册 Action 被拒绝。
- 非法参数不会调用 handler。
- Pending、success、error 状态可观察。
- Reset、destroy、unmount 可取消 Action。
- React、Vue、Vanilla contract tests 全部通过。

已交付：

- `ActionRegistry`、`ActionRuntime` 和 `createActionRuntime`。
- JSON Schema 参数验证与安全 JSON object 检查。
- Pending 去重、renderer owner 隔离、取消、超时和 stale result 防护。
- `idle`、`pending`、`success`、`error`、`cancelled` 状态订阅。
- React/Vue `useActionState`。
- React、Vue、Vanilla 自动 Card action dispatch 与原事件兼容。

### Phase 2：Stateful Card

状态：已完成。

交付内容：

- `CardStore`
- Card ID
- Card patch
- Action 返回 patch
- Snapshot/restore

验收标准：

- Card 更新不重建组件实例。
- 旧 Action 结果不能覆盖新状态。
- 无效 Card ID 和 patch 被拒绝。
- Snapshot round-trip 保持数据一致。

已交付：

- 顶层 `card.id` 提取、校验和无 ID 兼容路径。
- `CardStore` immutable records、定向订阅和会话级唯一 ID。
- 递归 merge、replace、revision 检查和原子 batch patch。
- Action `cardId`、Card lifecycle 和自动 patch result。
- 单调 mutation epoch，防止旧 Action 覆盖更新、删除、重建或 restore 后的 Card。
- Snapshot/restore、删除、清空和冲突恢复。
- React/Vue 保留组件实例与本地状态。
- Vanilla `VanillaCardInstance` update/destroy 生命周期与 legacy HTMLElement fallback。

### Phase 3：Form Plugin

状态：已完成。

交付内容：

- Form schema
- 七类基础字段
- 本地校验
- Action submit
- 三端 renderer

验收标准：

- 完整与流式 JSON 行为一致。
- 不完整 Form 显示 skeleton。
- 非法 schema 显示安全 fallback。
- 键盘提交和错误提示可访问。
- 不允许提交未注册 Action。

已交付：

- `@ai-gui/plugin-form` 与 complete-gated `form` fence。
- 七类字段、本地约束校验和 Action allowlist。
- 实例级 pending/cancel 隔离、键盘提交和 accessible errors。
- React、Vue、Vanilla 共用的安全 native form mount。
- ReDoS 防护、唯一 DOM ID 和安全错误信息。

### Phase 4：Model Adapters

状态：已完成。

交付内容：

- OpenAI adapter
- Anthropic adapter
- Vercel AI adapter
- Provider mock fixtures

验收标准：

- 每个 adapter 有录制 fixture 测试。
- UTF-8、取消、错误和 usage 均覆盖。
- 不安装某 provider SDK 时，其他 adapter 不受影响。
- Tree shaking 和 packed artifact 验证通过。

已交付：

- Core SSE、JSONL、NDJSON、text line 和 mock stream helpers。
- 统一 `ModelStreamEvent` 与 content delta adapter。
- OpenAI、Anthropic、Vercel AI 三个 provider packages。
- UTF-8、取消、reader/iterator cleanup 和录制 fixtures。
- Tool call 事件只转换或忽略，从不执行。

### Phase 5：DevTools 与 Playground

状态：已完成。

交付内容：

- Debug event API
- Runtime timeline
- AST/patch inspector
- Stream simulator
- React/Vue/Vanilla demo

验收标准：

- Debug 功能关闭时没有显著性能回归。
- 可导出并重新加载最小复现。
- Playground 在桌面和移动端可用。
- CI 构建 packed packages 后再构建 Playground。

已交付：

- Core debug event API、统一 sequence 和受限安全 payload。
- `@ai-gui/devtools` bounded timeline、redaction 和 attach lifecycle。
- 可暂停、恢复、取消的 UTF-8 stream simulator。
- React、Vue、Vanilla debug integration。
- 响应式 `apps/playground`，支持流控制、timeline、AST 和 patch inspection。
- Reproduction 导入/导出与独立 Playground 构建门禁。

## TDD 工作流

所有阶段遵循同一顺序：

1. 先写 core contract tests。
2. 运行测试并确认红灯原因正确。
3. 实现最小 core API。
4. 为 React、Vue、Vanilla 复用同一 contract suite。
5. 补生命周期、取消、乱序和错误测试。
6. 运行 typecheck 和 package build。
7. 对真实 packed tarball 做 consumer smoke test。
8. 最后更新文档、示例和 benchmark。

每项功能必须覆盖：

- Happy path。
- Invalid input。
- Streaming partial input。
- Cancellation。
- Concurrent or stale result。
- Reset/destroy/unmount。
- SSR fallback，如适用。
- Security boundary。
- ESM/CJS/type artifact。

## 性能预算

- Debug 关闭时，现有 Renderer benchmark 退化不得超过 10%。
- Action 状态更新不得触发整个 Markdown AST 重解析。
- Card patch 只更新目标 Card。
- Form 输入不得触发 Renderer parse。
- Playground 不计入 SDK 包体积。
- Provider adapter 不应把 provider SDK 打入不相关 consumer bundle。

## 安全要求

- Action 必须预注册。
- Action 参数必须验证。
- Action handler 接收 `AbortSignal`。
- 禁止模型指定任意 URL、HTTP method 或 JavaScript。
- Form 字段类型和属性使用 allowlist。
- Card patch 限制最大深度、节点数和 payload 大小。
- Provider tool call 默认只作为数据事件暴露，不自动执行。
- Debug events 不记录 token、密钥或敏感 header。
- 所有 HTML 和 element output 遵循统一安全策略。

## 文档与示例

需要新增：

- Action 快速开始。
- Stateful Card 示例。
- Form 示例。
- OpenAI、Anthropic、Vercel AI 接入示例。
- 安全模型说明。
- Action 和 Card patch 协议说明。
- Provider adapter 对照表。
- Playground 使用说明。
- `0.2 -> 0.3` migration guide。

## 暂不纳入 v0.3

- 完整聊天产品 UI。
- Audio/video 生成插件。
- Three.js 或复杂 3D scene runtime。
- 协同编辑。
- 服务端持久化实现。
- 任意远程组件加载。
- 模型直接执行 tool 或网络请求。
- 通用 workflow engine。
- 列表内部或 AST token 级增量 parser。

这些能力可以在 v0.4 以后基于 runtime、Action 和 CardStore 继续扩展。

## 发布标准

v0.3 发布前必须满足：

- 所有包使用统一版本。
- 所有单元测试和 contract tests 通过。
- Node 20/22 CI 通过。
- Typecheck 和 build 通过。
- `publint` 和 packed artifact validation 通过。
- React、Vue、Vanilla 示例构建通过。
- Provider fixture tests 通过。
- Renderer benchmark 无超过预算的回归。
- Action/Form 安全测试通过。
- npm provenance 发布成功。

## 后续候选

v0.4 可优先考虑：

- Citation/source plugin。
- Artifact workspace。
- Web Worker renderer。
- 长对话虚拟化和 snapshot persistence。
- 官方主题包。
- Plugin SDK、scaffold 和跨 adapter contract test kit。
- Data grid、timeline、map 和 file preview 插件。
