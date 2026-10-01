# @ai-gui/plugin-topology

Infrastructure topology diagrams for [AIGUI](https://github.com/liliang-cn/aigui): nodes in hosts,
racks and zones, the links between them and the state each is in — laid out automatically — with
`steps` that play a process over them: a write travelling to the primary, the replication to its
peer, the peer taking over when the primary fails.

```sh
pnpm add @ai-gui/core @ai-gui/plugin-topology
```

```ts
import { topology } from "@ai-gui/plugin-topology"
const plugins = [topology()]
```

## What the model writes

Nothing is placed by hand. The model says what exists, where it lives and what connects to what;
[dagre](https://github.com/dagrejs/dagre) lays it out in layers and the groups are drawn round
their members. A step says only what changes — a state set in step 2 holds afterwards.

```topology
{
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
}
```

In the page the steps play: each step's messages travel along the links, then its state changes
land, with controls to pause and step. Drawn still (`animate: false`, as `@ai-gui/image` draws it),
every message is a numbered marker on its route and the steps are listed under the picture.

| | |
| --- | --- |
| Node | `id`, `label`, `kind` (`server`, `vm`, `container`, `disk`, `database`, `network`, `balancer`, `client`, `service`, `process`, `queue`, `cloud`), `group`, `state`, `note` |
| State | `primary` `active` `ok` (green), `secondary` `standby` (blue), `syncing` `degraded` `warning` (amber), `failed` `down` (red), `offline` `unknown` (grey), `diskless` (purple) |
| Group | `id`, `label`, `group` (nested inside another) |
| Link | `from`, `to`, `id`, `label`, `style` (`solid`, `dashed`), `directed`, `state` (`up`, `down`, `active`) |
| Step | `caption`, `messages` (`from`, `to`, `label`), `states`, `links`, `highlight` |

Every reference is checked: a link to a node that does not exist, a group inside itself, an empty
group or a step changing a link with no `id` is refused with a message naming it.

## Options

- `animate?: boolean` — play the steps. `false` draws the finished state with every step numbered. Default `true`.
- `stepMs?: number` — milliseconds per step. Default 2400.
- `maxNodes?: number` — refuse a topology with more nodes than this. Default 60.
- `maxSourceBytes?: number` — refuse a larger fence before parsing it. Default 48 KiB.
