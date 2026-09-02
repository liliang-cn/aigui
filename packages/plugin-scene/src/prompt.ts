import { translate, type MessageBundle } from "@ai-gui/core"

/**
 * The model-facing rules for building a 3D scene.
 *
 * Unlike `solid`, this block asks the model for coordinates, because there is no textbook notation
 * for "a table with four legs" to hide them behind. What the rules do instead is keep the
 * arithmetic small: `anchor: "bottom"` puts a thing on the ground without halving its height, and
 * every worked example stacks objects that way so the habit is copied. The other rule that must
 * survive editing is that `model` needs a URL the conversation already contains — a model that
 * invents one gets a broken picture, and a host that has not allowed any origin gets a refusal.
 *
 * You rarely want this directly: `buildSystemPrompt({ registry, plugins, locale })` from
 * `@ai-gui/core` collects the card specs and every enabled plugin's spec in one call, in the
 * product's language. Reach for this only to inspect or override one plugin's rules.
 */
export function scenePromptSpec(locale?: string): string {
  return translate(PROMPT, locale, "spec")
}

const ZH = `3D 场景（围栏代码块）：\`\`\`scene 开头，块内是一个 JSON 对象。当读者需要"看见"一个物体或一组物体在空间里的样子——一件家具、一个装置、一栋房子的体块、几个零件的装配关系——就输出一个 scene 块。读者可以用鼠标转动它。文字说明照常写在块外。

单位是米，y 轴向上，地面是 y = 0。放在地上的东西写 "anchor": "bottom"，position 就是它底面中心的位置，不用自己算一半高度；叠在别的东西上面时，position 的 y 写成下面那件东西的顶面高度即可。

只用下面列出的字段。表达不出来的东西就正常写 markdown，不要发明字段。

顶层字段：
- objects（必填）：物体数组，尽量不超过 30 个
- camera：可选，{"position": [x, y, z], "target": [x, y, z]}。不写就自动取景，一般不用写
- grid：是否画地面网格，默认 true
- autoRotate：是否自动缓慢旋转，默认 false
- caption：一句话说明这个场景是什么

每个物体：
- shape（必填）："box" | "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "plane" | "model"
- 尺寸（按 shape 填）：
  - box："size": [宽 x, 高 y, 深 z]
  - sphere："radius"
  - cylinder："radius"、"height"；可选 "radiusTop" 做圆台（写 0 就是圆锥）；可选 "sides" 做棱柱（4 是方柱，6 是六角柱），不写就是圆的
  - cone："radius"、"height"；可选 "sides" 做棱锥（4 就是四坡屋顶），不写就是圆锥
  - torus："radius"（环半径）、"tube"（管半径），平放，轴是 y
  - capsule："radius"、"height"（中段长度）
  - plane："size": [宽 x, 深 z]，平放在地面方向
  - model："src"（glTF/GLB 文件的 https 地址）、"size"（缩放后最长边的长度，米）。只有对话里已经给了模型文件地址时才能用，绝对不要自己编一个地址。宿主可能不允许加载外部模型，那样这个物体会被拒绝
- position：[x, y, z]，默认 [0, 0, 0]
- rotation：[x, y, z]，角度制，默认 [0, 0, 0]
- anchor："center"（默认，position 是中心）| "bottom"（position 是底面中心）
- color："#4f46e5" 这样的十六进制，或 red、blue、green、yellow、orange、gray、white、brown、wheat、silver 这类英文颜色名
- opacity：0–1，默认 1
- material："matte"（默认）| "metal" | "glass"
- wireframe：true 只画线框
- label：显示在物体上方的短文字

例子——一张桌子，桌面架在四条腿上：

\`\`\`scene
{
  "objects": [
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [-0.6, 0, -0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [0.6, 0, -0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [-0.6, 0, 0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [0.6, 0, 0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "box", "size": [1.4, 0.04, 0.8], "position": [0, 0.72, 0], "anchor": "bottom", "color": "wheat", "label": "桌面" }
  ],
  "caption": "1.4 m × 0.8 m 的餐桌，桌面高 0.72 m"
}
\`\`\`

例子——一个简单的房子体块，带标注，自动旋转：

\`\`\`scene
{
  "objects": [
    { "shape": "box", "size": [6, 3, 4], "position": [0, 0, 0], "anchor": "bottom", "color": "#e7dcc8", "label": "主体" },
    { "shape": "cone", "radius": 3.9, "height": 2, "sides": 4, "position": [0, 3, 0], "anchor": "bottom", "rotation": [0, 45, 0], "color": "#b5533c", "label": "屋顶" },
    { "shape": "box", "size": [0.6, 1.2, 0.6], "position": [1.5, 4, 0.8], "anchor": "bottom", "color": "gray", "label": "烟囱" },
    { "shape": "box", "size": [0.9, 2, 0.1], "position": [0, 0, 2], "anchor": "bottom", "color": "#5b3a1e" }
  ],
  "autoRotate": true,
  "caption": "房子的体块关系：主体、四坡顶、烟囱和门"
}
\`\`\`

这一版画不了的（遇到就退回纯 markdown 讲解）：布尔运算（挖孔、切割）、曲面建模、贴图、动画、物理模拟、光源设置。立体几何题（正方体截面之类）不要用 scene，用 solid 块。`

const EN = `3D scenes (fenced): \`\`\`scene with a JSON object inside. Emit one when the reader needs to see how an object or a group of objects sits in space — a piece of furniture, a device, the massing of a building, how a few parts fit together. The reader can turn it with the mouse. Keep the explanation itself outside the block.

Units are metres, y is up, the ground is y = 0. Anything standing on the ground gets "anchor": "bottom", so position is the centre of its underside and you never halve a height; something resting on another object takes that object's top as its y.

Use only the fields listed. When something cannot be expressed, explain it in ordinary markdown rather than inventing a field.

Top level: objects (required, keep it under about 30); camera (optional {"position":[x,y,z],"target":[x,y,z]}; the scene frames itself when omitted); grid (ground grid, default true); autoRotate (default false); caption (one sentence).

Each object: shape ("box" | "sphere" | "cylinder" | "cone" | "torus" | "capsule" | "plane" | "model"); sizes per shape (box: size [w,h,d]; sphere: radius; cylinder: radius, height, optional radiusTop, optional sides for a faceted post; cone: radius, height, optional sides, so 4 is a hipped roof; torus: radius, tube, lying flat with its axis on y; capsule: radius, height of the middle section; plane: size [w,d], lying flat; model: src, an https URL to a glTF/GLB file, and size, the longest side after scaling). position [x,y,z]; rotation [x,y,z] in degrees; anchor "center" (default) or "bottom"; color as hex like "#4f46e5" or a name like red, blue, gray, wheat; opacity 0–1; material "matte" (default), "metal" or "glass"; wireframe true; label, a short text drawn above the object.

A model object may only use a URL the conversation already contains. Never invent one. The host may not allow external models at all, in which case that object is refused.

Example — a table, its top resting on four legs:

\`\`\`scene
{
  "objects": [
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [-0.6, 0, -0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [0.6, 0, -0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [-0.6, 0, 0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [0.6, 0, 0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "box", "size": [1.4, 0.04, 0.8], "position": [0, 0.72, 0], "anchor": "bottom", "color": "wheat", "label": "top" }
  ],
  "caption": "A 1.4 m × 0.8 m dining table, top at 0.72 m"
}
\`\`\`

Not supported in this version — explain these in markdown instead: boolean operations (holes, cuts), curved surface modelling, textures, animation, physics, lighting setup. For solid-geometry questions (sections of a cube and the like) use a solid block, not a scene.`

const PROMPT: MessageBundle = { en: { spec: EN }, "zh-CN": { spec: ZH } }
