import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for gravity scenes.
 *
 * The rule that must survive editing is "orbit 让插件算速度": a model asked for Earth's orbital
 * speed answers 29.78 km/s from memory in the wrong units half the time, and a figure drawn
 * from that number is a spiral. Given `orbit`, the number is derived from the condition. The
 * second is the unit system: astronomical for anything in the sky, so `5.97e24` never has to be
 * typed. Both are shown in worked examples because that is what a model copies.
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function gravityPromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `引力与碰撞图（围栏代码块）：\`\`\`gravity 开头，块内是一个 JSON 对象。凡是题目涉及行星轨道、卫星、双星、彗星、引力弹弓、逃逸速度、多个物体之间的万有引力，或者平面上小球的碰撞，都输出一个 gravity 块。它会积分运动方程画出轨迹，并在图下写出算出来的速度、周期和碰撞事件。文字讲解照常写在块外。

只给条件，不要自己算结果。轨道速度、周期、碰后速度都由渲染器算出来，不要写进 JSON。

单位（units，必填）三选一：
- "astronomical"：长度 AU，时间年，质量太阳质量。天文题一律用这个，太阳质量写 1，地球写 3e-6，木星写 1e-3
- "si"：米、秒、千克。只在题目本身就是 SI 数字时用
- "toy"：无量纲，G 默认 1，可用 "G" 改（写 0 就是纯碰撞台面）。概念演示用这个

每个 body：
- id（必填）：名字
- mass（必填）：0 表示试探粒子，只受引力不施引力
- 位置速度二选一：
  - "orbit": {"around": "太阳", "distance": 1}：绕前面已定义的某个天体做圆轨道，速度由渲染器算。可加 "eccentricity": 0.5（distance 是近点距离）、"angle": 90（起始方位角，度）、"direction": "cw"
  - "position": [x, y] 和 "velocity": [vx, vy]：直接给。不写默认原点静止
- radius：显示半径，也是碰撞半径；collisions 不是 none 时每个 body 都必须有
- color、fixed（固定不动）：可选

顶层：duration（必填，模拟时长，单位随 units；一般取几个周期）、collisions（"none" 默认 | "merge" 相撞合并 | "bounce" 弹性碰撞）、trails（默认 true）、animate（默认 true）、caption。bodies 不超过 12 个。

例子——地球和火星绕太阳，看两者周期之比：

\`\`\`gravity
{
  "units": "astronomical",
  "bodies": [
    { "id": "太阳", "mass": 1, "color": "orange" },
    { "id": "地球", "mass": 3e-6, "orbit": { "around": "太阳", "distance": 1 }, "color": "blue" },
    { "id": "火星", "mass": 3.2e-7, "orbit": { "around": "太阳", "distance": 1.52 }, "color": "red" }
  ],
  "duration": 2,
  "caption": "地球与火星的公转，两年"
}
\`\`\`

例子——彗星的大偏心率轨道：

\`\`\`gravity
{
  "units": "astronomical",
  "bodies": [
    { "id": "太阳", "mass": 1 },
    { "id": "彗星", "mass": 0, "orbit": { "around": "太阳", "distance": 0.6, "eccentricity": 0.9 } }
  ],
  "duration": 25,
  "caption": "近日点 0.6 AU、偏心率 0.9 的彗星轨道"
}
\`\`\`

例子——两个小球的二维弹性碰撞（无引力）：

\`\`\`gravity
{
  "units": "toy",
  "G": 0,
  "collisions": "bounce",
  "bodies": [
    { "id": "A", "mass": 2, "radius": 0.5, "position": [-4, 0.3], "velocity": [2, 0] },
    { "id": "B", "mass": 1, "radius": 0.5, "position": [0, 0], "velocity": [0, 0] }
  ],
  "duration": 5,
  "caption": "A 斜着撞上静止的 B"
}
\`\`\`

这一版画不了的（遇到就退回纯 markdown 讲解，或改用别的块）：三维轨道、相对论效应、潮汐与非质点效应、空气阻力；地面附近的抛体和自由落体用 motion 块；一维正碰也用 motion 块。`

const EN = `Gravity and collision figures (fenced): \`\`\`gravity with a JSON object inside. Emit one whenever a question involves planetary orbits, satellites, binary stars, comets, gravity assists, escape velocity, several bodies attracting one another, or discs colliding on a plane. The equations of motion are integrated, the trails drawn, and the computed speeds, periods and collision events written under the figure. Keep the explanation itself outside the block.

State conditions only, never results. Orbital speeds, periods and post-collision velocities are computed for you; do not put them in the JSON.

units (required) is one of "astronomical" (AU, years, solar masses — use it for anything in the sky: the Sun is 1, Earth 3e-6, Jupiter 1e-3), "si" (metres, seconds, kilograms — only when the question is already in those numbers), or "toy" (unitless, G defaults to 1 and may be set with "G"; G of 0 is a plain collision table).

Each body: id; mass (0 is a test particle: feels gravity, exerts none); then either "orbit": {"around": "<an earlier body>", "distance": r} — a circular orbit whose speed is computed, optionally with "eccentricity" (distance is then the periapsis), "angle" in degrees and "direction" "cw" — or "position": [x, y] and "velocity": [vx, vy]. Optional radius (drawn size, and the collision size; required for every body when collisions is not "none"), color, fixed.

Top level: duration (required, in the unit system's time; a few periods is usual), collisions ("none" default, "merge", "bounce"), trails (default true), animate (default true), caption. At most 12 bodies.

Example — a comet on a highly eccentric orbit:

\`\`\`gravity
{
  "units": "astronomical",
  "bodies": [
    { "id": "Sun", "mass": 1 },
    { "id": "Comet", "mass": 0, "orbit": { "around": "Sun", "distance": 0.6, "eccentricity": 0.9 } }
  ],
  "duration": 25,
  "caption": "A comet with perihelion 0.6 AU and eccentricity 0.9"
}
\`\`\`

Not supported — explain these in markdown or use another block: three-dimensional orbits, relativistic effects, tides and non-point bodies, air resistance; projectiles and free fall near the ground belong in a motion block, as do head-on one-dimensional collisions.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
