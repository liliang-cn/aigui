import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for ray-optics figures.
 *
 * Measured rather than guessed: twenty textbook questions through a model, one conversation each,
 * and this spec passed in a single round with nothing changed. The rule most likely to fail was the
 * sign convention — a question quotes "a concave lens of focal length 12 cm" and the protocol needs
 * −12, because a diverging element drawn with a positive focal length converges, which is the
 * opposite figure. It was written correctly every time.
 *
 * The one thing the probe changed is not in this text: the conclusion under the figure is generated
 * from the computed result, so the model is asked not to state it. A model that writes "倒立缩小实像"
 * when the image is upright and enlarged is stating something a reader believes and nobody checks.
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` collects every
 * enabled plugin's spec in one call, in the product's language.
 */
export function opticsPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `光路图（围栏代码块）：\` \`\`\`optics \` 开头，块内是一个 JSON 对象。凡是题目涉及透镜成像、面镜成像、反射折射，都输出一个 optics 块。文字讲解照常写在块外。

**只给条件，不要自己算。** 像的位置、大小、正倒、虚实，以及折射角、是否发生全反射，全部由渲染器按公式算出来。**不要在 JSON 里写像距、放大率、折射角，也不要写"成倒立缩小实像"这类结论** —— 你把条件写对，图和结论自然都对。结论可以写在块外的文字里。

**约定**（照这个写，不要自己换一套）：

- 光沿水平方向从左向右传播，主光轴是水平线，光学元件放在原点
- 物体在元件**左侧**，\`distance\` 是物距，写正数
- 凸透镜和凹面镜的 \`focal\` 写**正数**；凹透镜和凸面镜的 \`focal\` 写**负数**
- 长度单位随便，只要同一张图里一致（通常用 cm）

## 字段

### 成像（透镜、面镜）

- \`element\`（必填）：\`"convex-lens"\`（凸透镜）| \`"concave-lens"\`（凹透镜）| \`"concave-mirror"\`（凹面镜）| \`"convex-mirror"\`（凸面镜）| \`"plane-mirror"\`（平面镜）
- \`focal\`：焦距。平面镜不用写；其余必填，凸透镜/凹面镜为正，凹透镜/凸面镜为负
- \`object\`（必填）：\`{"distance": 15, "height": 3, "label": "AB"}\` —— 物距、物高、可选的标注
- \`show\`：可选开关数组，取值 \`"rays"\`（三条特征光线，默认开）、\`"focalPoints"\`（标出焦点 F 和 2F，默认开）、\`"labels"\`（标出物和像，默认开）

### 折射（单个界面）

- \`element\`: \`"interface"\`
- \`media\`（必填）：\`[1.0, 1.5]\` —— 入射侧和折射侧的折射率
- \`incidence\`（必填）：入射角，单位度，\`0\` 到 \`89\` 之间（与法线的夹角）
- \`show\`：可省略

### 公用

- \`caption\`：一句话说明这张图画的是什么

## 例子

物距大于二倍焦距的凸透镜成像：

\`\`\`optics
{
  "element": "convex-lens",
  "focal": 10,
  "object": { "distance": 30, "height": 4, "label": "AB" },
  "caption": "物距大于二倍焦距时凸透镜的成像"
}
\`\`\`

凹透镜成像：

\`\`\`optics
{
  "element": "concave-lens",
  "focal": -12,
  "object": { "distance": 18, "height": 4 },
  "caption": "凹透镜对实物成像"
}
\`\`\`

光从水密射入空气：

\`\`\`optics
{
  "element": "interface",
  "media": [1.33, 1.0],
  "incidence": 40,
  "caption": "光由水射入空气，入射角 40°"
}
\`\`\``

const EN = `Ray-optics figures (fenced): \`\`\`optics with a JSON object inside. Emit one whenever a question involves a lens, a mirror, or refraction at a surface. Keep the explanation itself outside the block.

State the conditions, never the result. Where the image lands, how big it is, whether it is real or virtual, upright or inverted, what the refraction angle is and whether the light escapes at all are all computed for you and written under the figure. Do not put an image distance, a magnification, a refraction angle, or a phrase like "inverted, reduced, real" into the JSON.

Convention: light travels left to right along a horizontal axis and the element sits at the origin; the object is on the left and \`distance\` is positive; a converging element (convex lens, concave mirror) has a positive \`focal\`, a diverging one (concave lens, convex mirror) a negative \`focal\`.

Imaging fields: \`element\` is one of convex-lens, concave-lens, concave-mirror, convex-mirror, plane-mirror; \`focal\` (not for a plane mirror); \`object\` as \`{"distance": 15, "height": 3, "label": "AB"}\`; optional \`show\` from rays, focalPoints, labels.

Refraction fields: \`element\` is "interface"; \`media\` as \`[n1, n2]\`; \`incidence\` in degrees from 0 to 89.

\`caption\` is one sentence naming what the figure shows — a title, not the answer.

Example:

\`\`\`optics
{
  "element": "convex-lens",
  "focal": 10,
  "object": { "distance": 30, "height": 4, "label": "AB" },
  "caption": "A convex lens with the object beyond twice the focal length"
}
\`\`\`

Not supported — explain these in markdown instead: more than one element, prisms and dispersion, interference, diffraction, polarisation, aberration, and repeated reflection in a fibre.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
