import { readFile, readdir, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { parseAllDocuments } from "yaml"

/** The topology a config describes, in the shape a ```topology block takes. */
export interface ImportedTopology {
  title: string
  direction?: "LR" | "TB"
  groups?: Array<{ id: string; label?: string }>
  nodes: Array<{ id: string; label?: string; kind?: string; group?: string; note?: string }>
  links?: Array<{ from: string; to: string; label?: string; style?: "solid" | "dashed" }>
}

type Doc = Record<string, unknown>
const isRecord = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** What an image is, by its name: the glyph a reader expects for it. */
function kindOf(image: string): string {
  const name = image.toLowerCase()
  if (/postgres|mysql|mariadb|mongo|redis|valkey|cassandra|clickhouse|elastic|opensearch|etcd|sqlite|cockroach|tidb|influx|neo4j|qdrant|milvus|weaviate/.test(name)) return "database"
  if (/nginx|traefik|haproxy|envoy|caddy|kong|ingress/.test(name)) return "balancer"
  if (/kafka|rabbitmq|nats|pulsar|zookeeper|redpanda|activemq|mosquitto|emqx/.test(name)) return "queue"
  if (/minio|rustfs|seaweed|ceph|garage/.test(name)) return "disk"
  return "service"
}

/** An image as a short note: no registry, no digest, the tag kept. */
const shortImage = (image: string) => image.replace(/@sha256:.*/, "").split("/").slice(-1)[0]

/**
 * A docker-compose file as a topology: each service a node, `depends_on` a link to what it needs,
 * published ports a link in from outside, named volumes as disks. With more than one network the
 * services are grouped by their first; one network is no grouping at all.
 */
export function fromCompose(text: string, title: string): ImportedTopology {
  const doc = parseAllDocuments(text)[0]?.toJSON() as Doc | undefined
  const services = isRecord(doc?.services) ? (doc!.services as Record<string, Doc>) : undefined
  if (!services || Object.keys(services).length === 0) throw new Error("no services in this compose file")
  const networkOf = (svc: Doc) => (Array.isArray(svc.networks) ? (svc.networks[0] as string) : isRecord(svc.networks) ? Object.keys(svc.networks)[0] : undefined)
  const networks = new Set(Object.values(services).map(networkOf).filter((n): n is string => !!n))
  const grouped = networks.size > 1
  const out: ImportedTopology = { title, nodes: [], links: [] }
  if (grouped) out.groups = [...networks].map((n) => ({ id: `net:${n}`, label: n }))

  let exposed = false
  const volumes = new Set<string>()
  for (const [name, svc] of Object.entries(services)) {
    const image = typeof svc.image === "string" ? svc.image : svc.build ? "build" : ""
    const net = networkOf(svc)
    const ports = list(svc.ports).map((p) => (typeof p === "string" || typeof p === "number" ? String(p) : isRecord(p) ? `${p.published ?? ""}:${p.target ?? ""}` : "")).filter(Boolean)
    out.nodes.push({
      id: name,
      kind: image === "build" ? "service" : kindOf(image),
      ...(image && image !== "build" ? { note: shortImage(image) } : image === "build" ? { note: "built here" } : {}),
      ...(grouped && net ? { group: `net:${net}` } : {}),
    })
    const deps = Array.isArray(svc.depends_on) ? (svc.depends_on as string[]) : isRecord(svc.depends_on) ? Object.keys(svc.depends_on) : []
    for (const dep of deps) if (dep in services) out.links!.push({ from: name, to: dep })
    for (const link of list(svc.links)) {
      const target = String(link).split(":")[0]
      if (target in services && !deps.includes(target)) out.links!.push({ from: name, to: target })
    }
    if (ports.length > 0) {
      exposed = true
      // "127.0.0.1:48017:27017" → "48017"; the host side is what a reader connects to.
      const shown = ports.map((p) => p.split(":").slice(-2, -1)[0] || p).slice(0, 3).join(", ")
      out.links!.push({ from: "outside", to: name, label: `:${shown}` })
    }
    for (const v of list(svc.volumes)) {
      const source = typeof v === "string" ? v.split(":")[0] : isRecord(v) ? String(v.source ?? "") : ""
      // Named volumes only: a bind mount of ./config is a file, not a part of the system.
      if (source && !source.startsWith(".") && !source.startsWith("/") && !source.startsWith("~")) {
        volumes.add(source)
        out.links!.push({ from: name, to: `vol:${source}`, style: "dashed" })
      }
    }
  }
  if (exposed) out.nodes.unshift({ id: "outside", label: "host", kind: "client" })
  for (const v of volumes) out.nodes.push({ id: `vol:${v}`, label: v, kind: "disk" })
  if (out.links!.length === 0) delete out.links
  return out
}

/**
 * Kubernetes manifests as a topology: workloads (Deployment, StatefulSet, DaemonSet) as nodes,
 * Services linked to the workloads their selector matches, Ingresses to the Services they route to,
 * claims to the workloads that mount them. More than one namespace groups by namespace.
 */
export function fromKubernetes(text: string, title: string): ImportedTopology {
  const docs = parseAllDocuments(text).map((d) => d.toJSON() as Doc).filter(isRecord)
  const items = docs.flatMap((d) => (d.kind === "List" ? list(d.items).filter(isRecord) : [d]))
  const meta = (d: Doc) => (isRecord(d.metadata) ? d.metadata : {}) as Doc
  const ns = (d: Doc) => String(meta(d).namespace ?? "default")
  const key = (kind: string, d: Doc) => `${kind}:${ns(d)}/${String(meta(d).name)}`
  const workloads = items.filter((d) => ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod"].includes(String(d.kind)))
  if (workloads.length === 0) throw new Error("no Deployments, StatefulSets, DaemonSets or Pods in these manifests")
  const namespaces = new Set(items.map(ns))
  const grouped = namespaces.size > 1
  const out: ImportedTopology = { title, nodes: [], links: [] }
  if (grouped) out.groups = [...namespaces].map((n) => ({ id: `ns:${n}`, label: n }))
  const group = (d: Doc) => (grouped ? { group: `ns:${ns(d)}` } : {})

  const podLabels = (w: Doc): Record<string, string> => {
    const spec = isRecord(w.spec) ? w.spec : {}
    const template = isRecord(spec.template) ? spec.template : w
    const m = isRecord(template.metadata) ? template.metadata : {}
    return (isRecord(m.labels) ? m.labels : {}) as Record<string, string>
  }
  const containers = (w: Doc): Doc[] => {
    const spec = isRecord(w.spec) ? w.spec : {}
    const template = isRecord(spec.template) ? spec.template : w
    const podSpec = isRecord(template.spec) ? template.spec : spec
    return list(podSpec.containers).filter(isRecord)
  }
  for (const w of workloads) {
    const image = String(containers(w)[0]?.image ?? "")
    const replicas = isRecord(w.spec) && typeof w.spec.replicas === "number" ? ` ×${w.spec.replicas}` : ""
    out.nodes.push({ id: key("w", w), label: String(meta(w).name), kind: w.kind === "StatefulSet" ? "database" : kindOf(image), note: `${w.kind}${replicas}${image ? ` · ${shortImage(image)}` : ""}`, ...group(w) })
    // Claims a workload mounts, by name.
    const spec = isRecord(w.spec) ? w.spec : {}
    const template = isRecord(spec.template) ? spec.template : {}
    const podSpec = isRecord(template.spec) ? template.spec : {}
    for (const v of list(podSpec.volumes).filter(isRecord)) {
      const claim = isRecord(v.persistentVolumeClaim) ? String(v.persistentVolumeClaim.claimName) : undefined
      if (claim) out.links!.push({ from: key("w", w), to: `pvc:${ns(w)}/${claim}`, style: "dashed" })
    }
    for (const t of list(spec.volumeClaimTemplates).filter(isRecord)) out.links!.push({ from: key("w", w), to: `pvc:${ns(w)}/${String(meta(t).name)}`, style: "dashed" })
  }

  for (const svc of items.filter((d) => d.kind === "Service")) {
    const spec = isRecord(svc.spec) ? svc.spec : {}
    const selector = (isRecord(spec.selector) ? spec.selector : {}) as Record<string, string>
    const ports = list(spec.ports).filter(isRecord).map((p) => String(p.nodePort ?? p.port)).slice(0, 3).join(", ")
    out.nodes.push({ id: key("svc", svc), label: String(meta(svc).name), kind: "network", note: `Service${spec.type ? ` · ${spec.type}` : ""}${ports ? ` · :${ports}` : ""}`, ...group(svc) })
    const matches = workloads.filter((w) => ns(w) === ns(svc) && Object.keys(selector).length > 0 && Object.entries(selector).every(([k, v]) => podLabels(w)[k] === v))
    for (const w of matches) out.links!.push({ from: key("svc", svc), to: key("w", w) })
  }

  for (const ing of items.filter((d) => d.kind === "Ingress")) {
    out.nodes.push({ id: key("ing", ing), label: String(meta(ing).name), kind: "balancer", note: "Ingress", ...group(ing) })
    const spec = isRecord(ing.spec) ? ing.spec : {}
    const backends = new Set<string>()
    for (const rule of list(spec.rules).filter(isRecord)) {
      const http = isRecord(rule.http) ? rule.http : {}
      for (const path of list(http.paths).filter(isRecord)) {
        const backend = isRecord(path.backend) ? path.backend : {}
        const service = isRecord(backend.service) ? String(backend.service.name) : backend.serviceName ? String(backend.serviceName) : undefined
        if (service) backends.add(service)
      }
    }
    for (const name of backends) out.links!.push({ from: key("ing", ing), to: `svc:${ns(ing)}/${name}`, label: list(spec.rules).filter(isRecord).map((r) => r.host).filter(Boolean)[0] as string | undefined })
  }

  const ids = new Set(out.nodes.map((n) => n.id))
  // Claims that something mounts, as disks — whether or not their own manifest is in the set.
  for (const link of out.links!) {
    if (link.to.startsWith("pvc:") && !ids.has(link.to)) {
      ids.add(link.to)
      const [nsName, name] = link.to.slice(4).split("/")
      out.nodes.push({ id: link.to, label: name, kind: "disk", note: "PersistentVolumeClaim", ...(grouped ? { group: `ns:${nsName}` } : {}) })
    }
  }
  // A link to a Service whose manifest is missing would be a reference to nothing.
  out.links = out.links!.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => (l.label ? l : { from: l.from, to: l.to, ...(l.style ? { style: l.style } : {}) }))
  if (out.links.length === 0) delete out.links
  if (out.groups) out.groups = out.groups.filter((g) => out.nodes.some((n) => n.group === g.id))
  return out
}

/**
 * Read a compose file, a Kubernetes manifest, or a directory of manifests, and describe it as a
 * topology. Which it is comes from the content: a `services:` map is compose, `kind:` documents
 * are Kubernetes.
 */
export async function importTopology(path: string): Promise<ImportedTopology> {
  const info = await stat(path).catch(() => undefined)
  if (!info) throw new Error(`${path} does not exist`)
  const files = info.isDirectory()
    ? (await readdir(path)).filter((f) => /\.ya?ml$/i.test(f)).sort().map((f) => join(path, f))
    : [path]
  if (files.length === 0) throw new Error(`no .yaml or .yml files in ${path}`)
  const texts = await Promise.all(files.map((f) => readFile(f, "utf8")))
  const title = basename(path).replace(/\.ya?ml$/i, "")
  const combined = texts.join("\n---\n")
  const first = parseAllDocuments(texts[0])[0]?.toJSON() as Doc | undefined
  return fit(files.length === 1 && isRecord(first) && isRecord(first.services) ? fromCompose(texts[0], title) : fromKubernetes(combined, title))
}

/**
 * Within the block's limits: ids of 48 characters, labels of 48, notes of 60, at most 40 nodes.
 * Kubernetes names run long, and a topology refused for an over-long id helps nobody.
 */
function fit(t: ImportedTopology): ImportedTopology {
  if (t.nodes.length > 40) throw new Error(`${t.nodes.length} parts is more than one topology can show (40) — point at a smaller set of manifests`)
  const cut = (v: string | undefined, n: number) => (v && [...v].length > n ? `${[...v].slice(0, n - 1).join("")}…` : v)
  const ids = new Map<string, string>()
  const id = (v: string) => {
    if (v.length <= 48) return v
    if (!ids.has(v)) ids.set(v, `n${ids.size + 1}`)
    return ids.get(v)!
  }
  return {
    ...t,
    title: cut(t.title, 120)!,
    groups: t.groups?.map((g) => ({ ...g, id: id(g.id), label: cut(g.label, 60) })),
    nodes: t.nodes.map((n) => ({ ...n, id: id(n.id), label: cut(n.label ?? n.id, 48), note: cut(n.note, 60), ...(n.group ? { group: id(n.group) } : {}) })),
    links: t.links?.map((l) => ({ ...l, from: id(l.from), to: id(l.to), ...(l.label ? { label: cut(l.label, 40) } : {}) })),
  }
}
