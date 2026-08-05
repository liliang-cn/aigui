import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for motion figures.
 *
 * Measured before the plugin was written: twenty textbook questions through a model, one
 * conversation each, and this spec passed in a single round with nothing changed. Horizontal
 * projection came back as `angle: 0`, vertical as `angle: 90`, and braking as a negative
 * acceleration — the three places a convention is easiest to get backwards.
 *
 * The figure is stroboscopic rather than animated, which is how a textbook draws motion: equal
 * intervals, and the spacing between marks is what shows the acceleration. It also keeps the figure
 * a pure function of the definition, so it renders the same on a server, in a test and in a browser.
 */
export function motionPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `运动图（围栏代码块）：\` \`\`\`motion \` 开头，块内是一个 JSON 对象。凡是题目涉及抛体、自由落体、匀变速直线运动、简谐振动、匀速圆周、一维碰撞，都输出一个 motion 块。文字讲解照常写在块外。

**只给初始条件，不要自己算。** 轨迹、射程、最大高度、飞行时间、周期、碰后速度，全部由渲染器按公式算，并写在图下面。**不要在 JSON 里写这些结果**，也不要写"射程为 20.4 m"这类结论。

**约定**：x 向右、y 向上；重力 g = 9.8 m/s²，向下；角度是与水平方向的夹角，单位度；长度用米、时间用秒、质量用千克。

## 字段

- \`motion\`（必填）：
  - \`"projectile"\` 斜抛：\`speed\`（初速度）、\`angle\`（抛射角）、\`height\`（抛出点高度，省略为 0）
  - \`"free-fall"\` 自由落体：\`height\`（下落高度）
  - \`"uniform-acceleration"\` 匀变速直线：\`speed\`（初速度）、\`acceleration\`、\`duration\`
  - \`"shm"\` 简谐振动：\`amplitude\`、\`period\`
  - \`"circular"\` 匀速圆周：\`radius\`、\`period\`
  - \`"collision"\` 一维碰撞：\`bodies\`，如 \`[{"mass": 2, "speed": 3}, {"mass": 1, "speed": -1}]\`，以及 \`"kind": "elastic" | "inelastic"\`
- \`strobe\`：频闪间隔秒数，省略则由渲染器自选
- \`show\`：可选开关数组，取值 \`"trajectory"\`（轨迹线）、\`"strobe"\`（频闪位置）、\`"vectors"\`（速度分量箭头）
- \`caption\`：一句话说明这张图画的是什么（是标题，不是答案）

## 例子

斜抛：

\`\`\`motion
{
  "motion": "projectile",
  "speed": 20,
  "angle": 30,
  "show": ["trajectory", "strobe", "vectors"],
  "caption": "以 20 m/s、与水平成 30° 抛出"
}
\`\`\`

一维弹性碰撞：

\`\`\`motion
{
  "motion": "collision",
  "kind": "elastic",
  "bodies": [{ "mass": 2, "speed": 3 }, { "mass": 1, "speed": -1 }],
  "caption": "两球发生弹性正碰"
}
\`\`\`

简谐振动：

\`\`\`motion
{
  "motion": "shm",
  "amplitude": 0.1,
  "period": 2,
  "caption": "振幅 0.1 m、周期 2 s 的简谐振动"
}
\`\`\``

const EN = `Motion figures (fenced): \`\`\`motion with a JSON object inside. Emit one whenever a question involves a projectile, free fall, uniform acceleration, simple harmonic motion, circular motion, or a one-dimensional collision.

Give the initial conditions, never the result. The trajectory, the range, the maximum height, the flight time, the period and the velocities after a collision are all computed for you and written under the figure. Do not put them in the JSON.

Convention: x to the right, y up, g = 9.8 m/s downward, angles measured from the horizontal in degrees, metres and seconds and kilograms.

\`motion\` is one of: projectile (\`speed\`, \`angle\`, optional \`height\`), free-fall (\`height\`), uniform-acceleration (\`speed\`, \`acceleration\`, \`duration\` — a negative acceleration is braking), shm (\`amplitude\`, \`period\`), circular (\`radius\`, \`period\`), collision (\`bodies\` as two \`{mass, speed}\` and \`kind\` of "elastic" or "inelastic").

Optional: \`strobe\` in seconds between marked positions, \`show\` from trajectory, strobe, vectors, and \`caption\` as a title rather than an answer.

Example:

\`\`\`motion
{
  "motion": "projectile",
  "speed": 20,
  "angle": 30,
  "show": ["trajectory", "strobe", "vectors"],
  "caption": "Launched at 20 m/s, 30 degrees above the horizontal"
}
\`\`\`

Not supported — explain these in markdown instead: two-dimensional or oblique collisions, motion with air resistance or any varying force, rotating frames, coupled oscillators, and relativistic motion.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
