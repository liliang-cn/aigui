import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for graph blocks.
 *
 * The rules that must survive editing: declare `classes` and `properties` with `domain`/`range`
 * when the domain has a schema, because that is what lets the renderer *check* the data rather
 * than just draw it; `from`/`to`/`type` are ids, `name` is what is shown, so the language goes in
 * `name`; and flows and sequences are mermaid's, numbers are a chart's. Both worked examples show
 * the schema-first habit because that is what a model copies.
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects every enabled plugin's spec in one call.
 */
export function graphPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `知识图谱与本体图（围栏代码块）：\`\`\`graph 开头，块内是一个 JSON 对象。凡是回答的重点是"有哪些东西、它们之间是什么关系"——组织架构、供应链、引用网络、依赖关系、人物关系、一个领域的概念模型（类和属性）——就输出一个 graph 块。它会画成可以拖动、缩放、切 2D/3D 的关系图；如果块里声明了本体，还会对照 domain/range 检查每条关系，把不符合的标成红色虚线并在图下列出。文字讲解照常写在块外。

两层内容，都可选，但至少要有一层：

本体层（schema）：
- classes：[{ "id", "name", "subClassOf", "color", "description" }]。id 是短的 ASCII 标识符，name 是显示名（中文写在 name 里）。subClassOf 指向另一个 class 的 id，构成层次
- properties：[{ "id", "name", "domain", "range", "description" }]。domain 是关系起点允许的 class，range 是终点允许的 class；子类自动满足父类。尽量都给，渲染器靠它们检查数据

实例层（data）：
- entities：[{ "id", "name", "type", "attrs", "description", "value" }]。type 是 class 的 id；attrs 是一层键值对（字符串/数字/布尔），显示在悬停提示里；value 决定节点大小（不给就按连接数）
- relations：[{ "from", "to", "type", "name" }]。from/to 是 entity 的 id，type 是 property 的 id

顶层可选：view（"2d" 默认 | "3d"）、layer（"instances" 默认 | "ontology"，打开时先看哪一层）、focus（要突出的 entity 或 class 的 id）、caption。

用到但没声明的 class/property 会自动补上，但只有声明了 domain/range 才有检查。entities 不超过 500、relations 不超过 2000；更大的图先归纳再画。流程、时序、状态机用 mermaid；数值对比用图表。

例子——一个小的企业本体加实例（其中一条关系故意违反 range，图会把它标出来）：

\`\`\`graph
{
  "classes": [
    { "id": "Agent", "name": "主体" },
    { "id": "Person", "name": "人", "subClassOf": "Agent" },
    { "id": "Organization", "name": "组织", "subClassOf": "Agent" },
    { "id": "Project", "name": "项目" }
  ],
  "properties": [
    { "id": "worksAt", "name": "任职于", "domain": "Person", "range": "Organization" },
    { "id": "leads", "name": "负责", "domain": "Person", "range": "Project" },
    { "id": "funds", "name": "资助", "domain": "Organization", "range": "Project" }
  ],
  "entities": [
    { "id": "alice", "name": "Alice", "type": "Person", "attrs": { "title": "CTO" } },
    { "id": "bob", "name": "Bob", "type": "Person" },
    { "id": "acme", "name": "Acme", "type": "Organization" },
    { "id": "atlas", "name": "Atlas 项目", "type": "Project" }
  ],
  "relations": [
    { "from": "alice", "to": "acme", "type": "worksAt" },
    { "from": "bob", "to": "alice", "type": "worksAt" },
    { "from": "alice", "to": "atlas", "type": "leads" },
    { "from": "acme", "to": "atlas", "type": "funds" }
  ],
  "focus": "alice",
  "caption": "Acme 的人、组织与项目"
}
\`\`\`

例子——纯实体关系网，直接以 3D 打开：

\`\`\`graph
{
  "entities": [
    { "id": "tcp", "name": "TCP", "type": "Protocol" },
    { "id": "ip", "name": "IP", "type": "Protocol" },
    { "id": "http", "name": "HTTP", "type": "Protocol" },
    { "id": "tls", "name": "TLS", "type": "Protocol" },
    { "id": "dns", "name": "DNS", "type": "Service" }
  ],
  "relations": [
    { "from": "http", "to": "tls", "type": "runsOver" },
    { "from": "tls", "to": "tcp", "type": "runsOver" },
    { "from": "tcp", "to": "ip", "type": "runsOver" },
    { "from": "dns", "to": "ip", "type": "runsOver" },
    { "from": "http", "to": "dns", "type": "uses" }
  ],
  "view": "3d",
  "caption": "协议栈的依赖关系"
}
\`\`\``

const EN = `Knowledge graph and ontology figures (fenced): \`\`\`graph with a JSON object inside. Emit one whenever the point of the answer is *what things there are and how they relate* — an org chart, a supply chain, a citation or dependency network, who knows whom, or the concept model of a domain (its classes and properties). It is drawn as a graph the reader can drag, zoom and flip between 2D and 3D; when the block declares an ontology, every relation is checked against the properties' domain and range, and the ones that break it are drawn red and dashed and listed under the figure. Keep the explanation itself outside the block.

Two layers, both optional, at least one required:

Ontology (schema):
- classes: [{ "id", "name", "subClassOf", "color", "description" }]. id is a short ASCII identifier, name is what is shown. subClassOf names another class's id and builds the hierarchy.
- properties: [{ "id", "name", "domain", "range", "description" }]. domain is the class a relation may start from, range the class it may end at; a subclass satisfies its superclass. Give both wherever you can — they are what the renderer checks the data with.

Instances (data):
- entities: [{ "id", "name", "type", "attrs", "description", "value" }]. type is a class id; attrs is one flat level of strings, numbers and booleans shown on hover; value sets the node's size (otherwise its degree does).
- relations: [{ "from", "to", "type", "name" }]. from/to are entity ids, type is a property id.

Top level, optional: view ("2d" default, or "3d"), layer ("instances" default, or "ontology" — which layer it opens on), focus (an entity or class id to highlight), caption.

A class or property that is used but not declared is added for you, but only a declared domain/range is checked. At most 500 entities and 2000 relations; summarise a bigger graph before drawing it. Flows, sequences and state machines belong in mermaid; numbers belong in a chart.

Example — a small enterprise ontology with instances (one relation deliberately breaks a range, and the figure will mark it):

\`\`\`graph
{
  "classes": [
    { "id": "Agent", "name": "Agent" },
    { "id": "Person", "name": "Person", "subClassOf": "Agent" },
    { "id": "Organization", "name": "Organization", "subClassOf": "Agent" },
    { "id": "Project", "name": "Project" }
  ],
  "properties": [
    { "id": "worksAt", "name": "works at", "domain": "Person", "range": "Organization" },
    { "id": "leads", "name": "leads", "domain": "Person", "range": "Project" },
    { "id": "funds", "name": "funds", "domain": "Organization", "range": "Project" }
  ],
  "entities": [
    { "id": "alice", "name": "Alice", "type": "Person", "attrs": { "title": "CTO" } },
    { "id": "bob", "name": "Bob", "type": "Person" },
    { "id": "acme", "name": "Acme", "type": "Organization" },
    { "id": "atlas", "name": "Project Atlas", "type": "Project" }
  ],
  "relations": [
    { "from": "alice", "to": "acme", "type": "worksAt" },
    { "from": "bob", "to": "alice", "type": "worksAt" },
    { "from": "alice", "to": "atlas", "type": "leads" },
    { "from": "acme", "to": "atlas", "type": "funds" }
  ],
  "focus": "alice",
  "caption": "People, organisations and projects at Acme"
}
\`\`\`

Example — a plain entity graph that opens in 3D:

\`\`\`graph
{
  "entities": [
    { "id": "tcp", "name": "TCP", "type": "Protocol" },
    { "id": "ip", "name": "IP", "type": "Protocol" },
    { "id": "http", "name": "HTTP", "type": "Protocol" },
    { "id": "tls", "name": "TLS", "type": "Protocol" },
    { "id": "dns", "name": "DNS", "type": "Service" }
  ],
  "relations": [
    { "from": "http", "to": "tls", "type": "runsOver" },
    { "from": "tls", "to": "tcp", "type": "runsOver" },
    { "from": "tcp", "to": "ip", "type": "runsOver" },
    { "from": "dns", "to": "ip", "type": "runsOver" },
    { "from": "http", "to": "dns", "type": "uses" }
  ],
  "view": "3d",
  "caption": "How the protocols depend on one another"
}
\`\`\``

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
