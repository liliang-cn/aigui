import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for a topology.
 *
 * The rule the whole block rests on is that nothing is placed by hand: the model says what exists,
 * where it lives and what connects to what, and the layout is computed. The second is that steps
 * say only what changes — a state set in step 2 holds afterwards — which keeps a five-step failover
 * short enough to write correctly.
 */
export function topologyPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const EXAMPLE = `{
  "title": "DRBD 主备复制",
  "groups": [
    { "id": "h1", "label": "node-a" },
    { "id": "h2", "label": "node-b" }
  ],
  "nodes": [
    { "id": "app", "label": "应用", "kind": "client" },
    { "id": "d1", "label": "DRBD r0", "kind": "disk", "group": "h1", "state": "primary", "note": "/dev/drbd0" },
    { "id": "d2", "label": "DRBD r0", "kind": "disk", "group": "h2", "state": "secondary", "note": "/dev/drbd0" }
  ],
  "links": [
    { "from": "app", "to": "d1", "label": "写入" },
    { "id": "rep", "from": "d1", "to": "d2", "label": "复制 (协议 C)" }
  ],
  "steps": [
    { "caption": "应用写入主节点", "messages": [{ "from": "app", "to": "d1", "label": "write" }], "highlight": ["d1"] },
    { "caption": "主节点把写入同步复制到备节点", "messages": [{ "from": "d1", "to": "d2", "label": "data" }] },
    { "caption": "备节点落盘后回 ACK，写入才算完成", "messages": [{ "from": "d2", "to": "d1", "label": "ack" }] },
    { "caption": "node-a 宕机，复制链路断开", "states": { "d1": "failed" }, "links": { "rep": "down" } },
    { "caption": "node-b 提升为主节点，接管写入", "states": { "d2": "primary" }, "highlight": ["d2"] }
  ]
}`

const ZH = `拓扑图（围栏代码块）：\`\`\`topology 开头，块内是一个 JSON 对象。讲系统架构、集群、网络、存储、服务之间怎么连——尤其是要讲一个过程（写入怎么走、故障怎么切换、请求怎么转发）时，用 topology，不要用 scene 手摆坐标，也不要用 mermaid 硬画。

只写"有什么、在哪、连到哪"，不写坐标：布局是自动算的，分组框、连线、标签位置都不用管。

顶层字段：
- nodes（必填）：节点数组，不超过 40 个
- groups：分组（主机、机架、可用区……），可以嵌套（group 字段写外层分组的 id）
- links：连线
- steps：一个过程的各个步骤，页面里会逐步播放；出图时所有步骤编号画在同一张图上
- title、caption：标题和一句话说明
- direction："LR"（默认，从左到右）| "TB"（从上到下）

节点：id（必填）、label、kind、group、state、note（第二行小字：地址、大小、角色）
- kind：server | vm | container | disk | database | network | balancer | client | service | process | queue | cloud
- state：primary | active | ok | secondary | standby | syncing | degraded | warning | failed | down | offline | diskless | unknown。颜色固定：绿=主/正常，蓝=备，橙=同步/降级，红=故障，灰=离线，紫=diskless

连线：from、to（必填）、id（步骤里要改它的状态时才需要）、label、style（"solid" | "dashed"）、directed（默认 true，画箭头）、state（"up" | "down" | "active"）

步骤：caption（必填，一句话）、messages（这一步谁发给谁什么：[{"from","to","label"}]，沿连线移动）、states（从这一步起节点变成什么状态）、links（从这一步起连线变成什么状态，用连线 id）、highlight（这一步要突出的节点）
- 每一步只写变化的部分：前面步骤设置的状态会一直保持

例子——DRBD 主备复制与故障切换：

\`\`\`topology
${EXAMPLE}
\`\`\`

数字、地址、状态必须来自对话或用户给的材料；讲概念时用 node-a、r0 这类通用名字，不要编造具体 IP。`

const EN = `Topologies (fenced): \`\`\`topology with a JSON object inside. Use it to show how systems connect — clusters, networks, storage, services — and above all to show a process running over them: how a write travels, how a failover happens, how a request is routed. Prefer it to placing boxes by hand in a scene or forcing mermaid.

Say what exists, where it lives and what connects to what — never coordinates. The layout, group boxes, link routes and label positions are computed.

Top level: nodes (required, at most 40); groups (hosts, racks, zones…, nestable via a group's own "group"); links; steps (a process, played step by step in the page; drawn still, every step is numbered on one picture); title; caption; direction "LR" (default) or "TB".

Node: id (required), label, kind, group, state, note (a quieter second line: address, size, role).
- kind: server | vm | container | disk | database | network | balancer | client | service | process | queue | cloud
- state: primary | active | ok | secondary | standby | syncing | degraded | warning | failed | down | offline | diskless | unknown. Colours are fixed: green primary/healthy, blue standby, amber syncing/degraded, red failed, grey offline, purple diskless.

Link: from, to (required), id (only needed to change its state in a step), label, style ("solid" | "dashed"), directed (default true, draws an arrowhead), state ("up" | "down" | "active").

Step: caption (required, one sentence), messages (what is sent where in this step: [{"from","to","label"}], travelling along the links), states (node states from this step on), links (link states from this step on, by link id), highlight (nodes to draw attention to in this step).
- A step says only what changes: states set in an earlier step hold.

Example — DRBD primary/secondary replication and failover:

\`\`\`topology
${EXAMPLE.replace("DRBD 主备复制", "DRBD replication").replace(/"应用"/, '"app"').replace('"写入"', '"writes"').replace("复制 (协议 C)", "replication (protocol C)").replace("应用写入主节点", "The app writes to the primary").replace("主节点把写入同步复制到备节点", "The primary replicates the write to the secondary").replace("备节点落盘后回 ACK，写入才算完成", "The secondary acks once on disk; only then is the write complete").replace("node-a 宕机，复制链路断开", "node-a fails; replication stops").replace("node-b 提升为主节点，接管写入", "node-b is promoted and takes over writes")}
\`\`\`

Numbers, addresses and states must come from the conversation or the user's material; when explaining a concept use generic names like node-a and r0, never invented IPs.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
