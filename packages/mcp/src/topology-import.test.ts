import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseTopology } from "@ai-gui/plugin-topology"
import { describe, expect, it } from "vitest"
import { fromCompose, fromKubernetes, importTopology } from "./topology-import"

const COMPOSE = `
services:
  web:
    build: .
    ports: ["127.0.0.1:8081:80"]
    depends_on: { api: { condition: service_started } }
    volumes: ["./conf:/etc/conf"]
  api:
    image: ghcr.io/acme/api:1.4
    depends_on: [db, queue]
  db:
    image: postgres:16
    volumes: ["pgdata:/var/lib/postgresql/data"]
  queue:
    image: rabbitmq:3
volumes:
  pgdata: {}
`

const K8S = `
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: shop }
spec:
  replicas: 3
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec: { containers: [{ name: api, image: acme/api:2 }] }
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: db, namespace: shop }
spec:
  selector: { matchLabels: { app: db } }
  template:
    metadata: { labels: { app: db } }
    spec: { containers: [{ name: db, image: postgres:16 }] }
  volumeClaimTemplates: [{ metadata: { name: data } }]
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: shop }
spec: { selector: { app: api }, ports: [{ port: 80 }] }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: shop, namespace: shop }
spec:
  rules:
    - host: shop.example.com
      http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: api, port: { number: 80 } } } }] }
`

const valid = (t: unknown) => {
  const r = parseTopology(JSON.stringify(t))
  return r.ok ? "" : r.error
}

describe("fromCompose", () => {
  it("draws services, what they depend on, what is published and the named volumes", () => {
    const t = fromCompose(COMPOSE, "shop")
    expect(valid(t)).toBe("")
    expect(Object.fromEntries(t.nodes.map((n) => [n.id, n.kind]))).toEqual({ outside: "client", web: "service", api: "service", db: "database", queue: "queue", "vol:pgdata": "disk" })
    expect(t.nodes.find((n) => n.id === "api")?.note).toBe("api:1.4")
    expect(t.links).toEqual(expect.arrayContaining([
      { from: "web", to: "api" },
      { from: "api", to: "db" },
      { from: "api", to: "queue" },
      { from: "outside", to: "web", label: ":8081" },
      { from: "db", to: "vol:pgdata", style: "dashed" },
    ]))
    // A bind mount of ./conf is a file, not a part of the system.
    expect(t.nodes.some((n) => n.id.includes("conf"))).toBe(false)
  })
})

describe("fromKubernetes", () => {
  it("links an Ingress to its Service, a Service to the workloads it selects, a workload to its claims", () => {
    const t = fromKubernetes(K8S, "shop")
    expect(valid(t)).toBe("")
    const byLabel = (label: string, kind: string) => t.nodes.find((n) => n.label === label && n.kind === kind)!.id
    expect(t.nodes.find((n) => n.kind === "service")?.note).toBe("Deployment ×3 · api:2")
    expect(t.links).toEqual(expect.arrayContaining([
      { from: byLabel("shop", "balancer"), to: byLabel("api", "network"), label: "shop.example.com" },
      { from: byLabel("api", "network"), to: byLabel("api", "service") },
      { from: byLabel("db", "database"), to: byLabel("data", "disk"), style: "dashed" },
    ]))
  })
  it("refuses manifests with no workloads rather than drawing nothing", () => {
    expect(() => fromKubernetes("kind: ConfigMap\nmetadata: { name: x }\n", "x")).toThrow("no Deployments")
  })
})

describe("importTopology", () => {
  it("reads a directory of manifests as one system, and tells compose from Kubernetes by content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aigui-topo-"))
    const [a, b] = K8S.split("\n---\n")
    await writeFile(join(dir, "a.yaml"), a)
    await writeFile(join(dir, "b.yml"), K8S.split("\n---\n").slice(1).join("\n---\n"))
    await writeFile(join(dir, "notes.txt"), "ignored")
    expect((await importTopology(dir)).nodes.length).toBeGreaterThanOrEqual(5)
    await writeFile(join(dir, "compose.yaml"), COMPOSE)
    expect((await importTopology(join(dir, "compose.yaml"))).nodes.some((n) => n.id === "outside")).toBe(true)
    void b
  })
})
