import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for solid-geometry figures.
 *
 * Two things in here are not stylistic and should not be trimmed. The first is "只描述条件，不要自己
 * 算": a model that computes the section itself is sometimes wrong, and the picture would then be
 * confidently wrong with it — asked only for the three points, its arithmetic cannot reach the
 * figure. The second is that every rule is demonstrated by a worked example, because a model
 * imitates the examples far more than it reads the field list. Both were measured: an example that
 * referenced two undefined points had that mistake copied back verbatim, and deleting the only
 * example that used `highlight` sent nearly half the answers to the wrong shape for it within one
 * round.
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function solidPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `立体几何图形（围栏代码块）：\`\`\`solid 开头，块内是一个 JSON 对象。凡是题目涉及正方体、长方体、棱柱、棱锥、圆柱、圆锥、球，且读者需要"看见"空间关系的，都输出一个 solid 块。文字讲解照常写在块外。

只描述条件，不要自己算。截面的形状、交点的位置由渲染器算出来。不要输出顶点坐标，不要在 JSON 里写"截面是五边形"这类结论——你把条件写对，图自然就对。

顶点记号用 ASCII：写 A1，不写 A₁。正方体写 ABCD-A1B1C1D1（下底 ABCD，上底 A1B1C1D1，A 正上方是 A1）。三棱锥写 P-ABC，四棱锥写 P-ABCD，三棱柱写 ABC-A1B1C1。

只用下面列出的字段。需要的东西表达不出来时，就正常写 markdown 讲解，不要发明字段、不要硬套一个形状。

字段：
- solid（必填）："cube" | "cuboid" | "prism" | "pyramid" | "cylinder" | "cone" | "sphere"
- label（必填，球除外）：顶点记号，如 "ABCD-A1B1C1D1"、"P-ABC"
- 尺寸（按 solid 填其一）：
  - cube："edge": 2
  - cuboid："size": [4, 3, 2]（长、宽、高）
  - prism / pyramid："base": 4（底面边数，3–6）、"edge": 2（底面边长）、"height": 3
  - pyramid 默认顶点在底面中心正上方（正棱锥）。若题目说某条侧棱垂直于底面（如 PA ⊥ 平面 ABC），必须写 "apexOver": "A"，表示顶点在 A 的正上方——不写的话画出来的是正棱锥，PA 是斜的，图会和你的讲解矛盾
  - cylinder / cone："radius": 1、"height": 3。圆锥的记号固定为 "P-O"（P 顶点，O 底面圆心），圆柱固定为 "O1-O"（O1 上底圆心，O 下底圆心）。除此之外圆锥圆柱上没有现成的字母点，要用就得先在 points 里定义
  - sphere："radius": 1
- points：题目里新引入的点，每个一条
  - {"id": "M", "on": "A1C1", "at": 0.5} —— 在线段 A1C1 上，at 是从第一个字母那端算起的比例，中点写 0.5
  - {"id": "O", "center": "ABCD"} —— 某个面的中心
  - {"id": "H", "foot": {"from": "P", "to": "ABCD"}} —— 从 P 向平面 ABCD 作垂线的垂足
  - {"id": "A", "onCircle": "base", "angle": 0} —— 圆锥/圆柱底面圆周上的点，angle 是角度（0–360）。"onCircle": "top" 是圆柱的上底圆周。圆锥圆柱上的每个字母点都必须这样定义过才能引用
- segments：要画出来的线段（辅助线、体对角线、异面直线），如
  {"from": "A", "to": "C1", "style": "solid", "note": "体对角线"}。style 只能是 "solid" 或 "dashed"
- section：截面，用三个点确定一个平面：{"through": ["A", "B1", "D1"]}。点必须是顶点或你在 points 里定义过的。只能用在多面体上（正方体、长方体、棱柱、棱锥）；圆锥圆柱的截面除轴截面外都是椭圆之类的曲线，这一版画不了，只写文字讲解
- highlight：要强调的对象，是一个数组，即使只强调一样东西也要写成 [ ... ]
  - "highlight": [{"line": ["A", "C1"]}]
  - "highlight": [{"plane": ["A", "B1", "D1"]}]
  - "highlight": [{"angle": {"at": "B", "rays": ["A", "C"]}}]
- show：可选开关数组，取值 "labels"（顶点字母，默认开）、"hiddenEdges"、"views"
- caption：一句话说明这张图画的是什么

例子——过正方体一条对角线端点作截面：

\`\`\`solid
{
  "solid": "cube",
  "label": "ABCD-A1B1C1D1",
  "edge": 2,
  "section": { "through": ["A", "B1", "D1"] },
  "highlight": [{ "plane": ["A", "B1", "D1"] }],
  "caption": "平面 AB1D1 截正方体所得的截面"
}
\`\`\`

例子——三棱锥里的中位线与垂足：

\`\`\`solid
{
  "solid": "pyramid",
  "label": "P-ABC",
  "base": 3,
  "edge": 2,
  "height": 3,
  "points": [
    { "id": "M", "on": "PB", "at": 0.5 },
    { "id": "N", "on": "PC", "at": 0.5 },
    { "id": "H", "foot": { "from": "P", "to": "ABC" } }
  ],
  "segments": [
    { "from": "M", "to": "N", "style": "solid", "note": "中位线" },
    { "from": "P", "to": "H", "style": "dashed", "note": "高" }
  ],
  "caption": "三棱锥 P-ABC 中，M、N 分别为 PB、PC 的中点"
}
\`\`\`

例子——圆锥的轴截面：

\`\`\`solid
{
  "solid": "cone",
  "label": "P-O",
  "radius": 2,
  "height": 4,
  "points": [
    { "id": "A", "onCircle": "base", "angle": 0 },
    { "id": "B", "onCircle": "base", "angle": 180 }
  ],
  "segments": [
    { "from": "A", "to": "B", "style": "solid", "note": "底面直径" },
    { "from": "P", "to": "A", "style": "solid" },
    { "from": "P", "to": "B", "style": "solid" }
  ],
  "caption": "圆锥的轴截面为等腰三角形 PAB"
}
\`\`\`

这一版画不了的（遇到就退回纯 markdown 讲解）：展开图与表面最短路径的展开、圆锥圆柱的非轴截面、动点动画、组合体与挖空、坐标系标注。`

const EN = `Solid-geometry figures (fenced): \`\`\`solid with a JSON object inside. Emit one whenever a question involves a cube, cuboid, prism, pyramid, cylinder, cone or sphere and the reader needs to see the spatial relationship. Keep the explanation itself outside the block.

State conditions only, never results. The shape of a section and the position of an intersection are computed for you. Do not emit vertex coordinates and do not assert in the JSON that "the section is a pentagon" — get the conditions right and the figure follows.

Vertices are ASCII: write A1, not A₁. A cube is ABCD-A1B1C1D1 (base ABCD, top A1B1C1D1, A1 directly above A); a pyramid is P-ABC or P-ABCD; a prism is ABC-A1B1C1.

Use only the fields listed. When something cannot be expressed, explain it in ordinary markdown rather than inventing a field or forcing a shape.

Fields: solid ("cube" | "cuboid" | "prism" | "pyramid" | "cylinder" | "cone" | "sphere"); label; sizes per solid (cube: edge; cuboid: size [l,w,h]; prism/pyramid: base 3-6, edge, height; cylinder/cone: radius, height; sphere: radius). A pyramid's apex sits above the centre unless you write apexOver: "A", which is required whenever a lateral edge is perpendicular to the base. A cone is labelled "P-O" and a cylinder "O1-O"; they have no lettered points on their circles until you define them.

points introduces new points: {"id":"M","on":"A1C1","at":0.5} along a segment, {"id":"O","center":"ABCD"} at a face centre, {"id":"H","foot":{"from":"P","to":"ABCD"}} at the foot of a perpendicular, {"id":"A","onCircle":"base","angle":0} on a cone or cylinder circle.

segments draws lines: {"from":"A","to":"C1","style":"solid","note":"body diagonal"}. section cuts with a plane through exactly three named points and works on polyhedra only. highlight is always an array: [{"line":["A","C1"]}], [{"plane":["A","B1","D1"]}], [{"angle":{"at":"B","rays":["A","C"]}}]. show may contain "labels", "hiddenEdges", "views". caption is one sentence.

Example:

\`\`\`solid
{
  "solid": "cube",
  "label": "ABCD-A1B1C1D1",
  "edge": 2,
  "section": { "through": ["A", "B1", "D1"] },
  "highlight": [{ "plane": ["A", "B1", "D1"] }],
  "caption": "The section cut by plane AB1D1"
}
\`\`\`

Not supported in this version — explain these in markdown instead: net diagrams and shortest surface paths, non-axial sections of cones and cylinders, animation of a moving point, compound or hollowed solids, coordinate-system annotation.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
