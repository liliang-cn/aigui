import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for function figures.
 *
 * Every rule here was measured rather than guessed: twenty textbook questions through a model, one
 * conversation each, two rounds, with each expression run through this package's own evaluator
 * rather than eyeballed. The strictest rule — explicit `*` and brackets on every function — is the
 * one that looked most likely to fail and did not fail once in forty figures.
 *
 * Two things must not be trimmed. The first is "只给表达式和区间，不要自己算": a model that samples
 * the curve itself puts its arithmetic into the picture, where a wrong point is indistinguishable
 * from a right one. The second is that every rule appears in a worked example, because a model
 * imitates the examples far more than it reads the field list — measured twice, once when an
 * example's own mistake was copied back verbatim and once when deleting an example sent nearly half
 * the answers to the wrong shape within a single round.
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language.
 */
export function functionPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `函数图像（围栏代码块）：\` \`\`\`function \` 开头，块内是一个 JSON 对象。凡是题目要画函数图像、切线、导数、定积分的面积、黎曼和，都输出一个 function 块。文字讲解照常写在块外。

**只给表达式和区间，不要自己算。** 采样点、切线斜率、面积的数值、极值点的位置，全部由渲染器算。**绝对不要输出坐标点数组** —— 你算错一个点，图就错一个点，而读者看不出来。

**表达式写法**（这几条是硬性的，写错了画不出来）：

- 自变量只能是 \`x\`
- **乘号必须写出来**：写 \`2*x\`，不写 \`2x\`；写 \`x*sin(x)\`，不写 \`x sin x\`
- 幂用 \`^\`：\`x^2\`、\`e^x\` 写成 \`exp(x)\`
- 函数必须带括号：\`sin(x)\`、\`sqrt(x)\`、\`abs(x-1)\`、\`ln(x)\`
- 可用函数：\`sin cos tan asin acos atan sinh cosh tanh exp ln log log2 sqrt abs sign floor ceil round\`
- 可用常数：\`pi\`、\`e\`
- 除此之外的任何字母都不认识

## 字段

- \`plot\`（必填）：要画的函数，数组，每条一个对象
  - \`{"id": "f", "expr": "x^2 - 2*x", "domain": [-2, 4], "label": "y = x² - 2x"}\`
  - \`id\` 是一个字母或短名，后面的 \`marks\` 用它引用这条曲线
  - \`domain\` 是这条曲线画出来的区间；省略就用 \`view.x\`
  - **区间端点可以写成常数表达式**：\`[0, "2*pi"]\`、\`["-pi/2", "pi/2"]\` 都可以，不必换算成小数。同样适用于 \`at\`、\`from\`、\`to\`
  - \`label\` 是图例上写的字，可以用数学符号（它只是文字，不参与计算）
- \`view\`：坐标范围 \`{"x": [-2, 4], "y": [-2, 6]}\`，省略则由渲染器根据函数值自动定
- \`marks\`：要标出来的东西，数组，即使只有一个也要写成 \`[ ... ]\`
  - \`{"tangent": {"of": "f", "at": 1}}\` —— 曲线 f 在 x=1 处的切线，**斜率由渲染器求导算出**
  - \`{"area": {"of": "f", "from": 0, "to": 2}}\` —— f 与 x 轴在 [0,2] 之间围成的面积
  - \`{"area": {"between": ["f", "g"], "from": 0, "to": 2}}\` —— 两条曲线之间的面积
  - \`{"riemann": {"of": "f", "from": 0, "to": 1, "n": 8, "rule": "left"}}\` —— 黎曼和矩形，\`rule\` 取 \`"left" | "right" | "mid"\`
  - \`{"point": {"on": "f", "at": 1, "label": "P"}}\` —— 曲线上横坐标为 1 的点
  - \`{"asymptote": {"x": 0}}\` 或 \`{"asymptote": {"y": 1}}\` —— 渐近线
  - \`{"derivative": {"of": "f", "label": "f'(x)"}}\` —— 画出 f 的导函数，**由渲染器数值求导**
- \`caption\`：一句话说明这张图画的是什么

## 例子

二次函数与它在某点的切线：

\`\`\`function
{
  "plot": [{ "id": "f", "expr": "x^2 - 2*x", "domain": [-1, 3], "label": "y = x² - 2x" }],
  "marks": [
    { "tangent": { "of": "f", "at": 2 } },
    { "point": { "on": "f", "at": 2, "label": "P" } }
  ],
  "caption": "y = x² - 2x 在 P(2, 0) 处的切线"
}
\`\`\`

定积分的面积：

\`\`\`function
{
  "plot": [{ "id": "f", "expr": "x^2", "domain": [0, 2], "label": "y = x²" }],
  "marks": [{ "area": { "of": "f", "from": 0, "to": 2 } }],
  "caption": "∫₀² x² dx 表示的曲边梯形面积"
}
\`\`\`

三角函数，区间用常数表达式：

\`\`\`function
{
  "plot": [{ "id": "f", "expr": "sin(x)", "domain": [0, "2*pi"], "label": "y = sin x" }],
  "marks": [{ "derivative": { "of": "f", "label": "y\\u0027 = cos x" } }],
  "caption": "y = sin x 及其导函数在 [0, 2π] 上的图像"
}
\`\`\`

黎曼和逼近：

\`\`\`function
{
  "plot": [{ "id": "f", "expr": "x^2", "domain": [0, 1], "label": "y = x²" }],
  "marks": [{ "riemann": { "of": "f", "from": 0, "to": 1, "n": 8, "rule": "left" } }],
  "caption": "用 8 个左端点矩形近似 ∫₀¹ x² dx"
}
\`\`\`

两条曲线：

\`\`\`function
{
  "plot": [
    { "id": "f", "expr": "exp(x)", "domain": [-2, 2], "label": "y = eˣ" },
    { "id": "g", "expr": "ln(x)", "domain": [0.05, 4], "label": "y = ln x" }
  ],
  "view": { "x": [-2, 4], "y": [-3, 5] },
  "caption": "y = eˣ 与 y = ln x 关于 y = x 对称"
}
\`\`\``

const EN = `Function figures (fenced): \`\`\`function with a JSON object inside. Emit one whenever a question asks for a graph, a tangent, a derivative, the area under a curve, or a Riemann sum. Keep the explanation itself outside the block.

Give the expression and the interval, never the result. The sampling, the slope of a tangent, the area and the position of an extremum are all computed for you. **Never emit an array of plotted points** — one wrong point looks exactly like a right one.

Expression rules, all of them strict: the variable is \`x\`; multiplication is always written (\`2*x\`, not \`2x\`); powers use \`^\`; functions need brackets (\`sin(x)\`, \`sqrt(x)\`, \`ln(x)\`, \`exp(x)\`); available functions are sin cos tan asin acos atan sinh cosh tanh exp ln log log2 sqrt abs sign floor ceil round; available constants are pi and e. No other letters exist.

Fields: \`plot\` (required array) of \`{"id","expr","domain","label"}\`; \`view\` as \`{"x":[min,max],"y":[min,max]}\`; \`marks\` (always an array); \`caption\`. Interval endpoints may be constant expressions: \`[0, "2*pi"]\`.

Marks: \`{"tangent":{"of":"f","at":1}}\`, \`{"area":{"of":"f","from":0,"to":2}}\`, \`{"area":{"between":["f","g"],"from":0,"to":2}}\`, \`{"riemann":{"of":"f","from":0,"to":1,"n":8,"rule":"left"}}\`, \`{"point":{"on":"f","at":1,"label":"P"}}\`, \`{"asymptote":{"x":0}}\`, \`{"derivative":{"of":"f"}}\`.

Example:

\`\`\`function
{
  "plot": [{ "id": "f", "expr": "x^2 - 2*x", "domain": [-1, 3], "label": "y = x^2 - 2x" }],
  "marks": [
    { "tangent": { "of": "f", "at": 2 } },
    { "point": { "on": "f", "at": 2, "label": "P" } }
  ],
  "caption": "The tangent to y = x^2 - 2x at P(2, 0)"
}
\`\`\`

Not supported — explain these in markdown or use \`\`\`chart instead: implicit curves, polar curves, parametric curves, surfaces, the complex plane, and the scatter of a sequence or a probability distribution.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
