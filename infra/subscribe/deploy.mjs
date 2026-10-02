// Deploys worker.js to subscribe.superleo.app with the Cloudflare API — no wrangler needed.
//
//   CLOUDFLARE_API_TOKEN_ALT=… RESEND_API_KEY=… node infra/subscribe/deploy.mjs
//
// Secrets are written as Worker secrets on every deploy; SIGNING_SECRET is generated once and kept.
import { readFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"

const ACCOUNT = "e8eaf5760bab092e51bfaa88c6573577"
const SCRIPT = "aigui-subscribe"
const HOST = "subscribe.superleo.app"
const ZONE = process.env.CLOUDFLARE_ZONE_SUPERLEO_APP
const AUDIENCE_ID = "5390a217-a19a-4c8a-97ea-48dd0bba724b"
const token = process.env.CLOUDFLARE_API_TOKEN_ALT ?? process.env.CLOUDFLARE_API_TOKEN
const api = async (method, path, body, headers = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers: { authorization: `Bearer ${token}`, ...headers }, body })
  const json = await res.json().catch(() => ({}))
  if (!json.success) throw new Error(`${method} ${path}: ${JSON.stringify(json.errors ?? res.status)}`)
  return json.result
}

const code = await readFile(new URL("./worker.js", import.meta.url), "utf8")
const form = new FormData()
form.append("metadata", JSON.stringify({
  main_module: "worker.js",
  compatibility_date: "2026-09-01",
  bindings: [
    { type: "plain_text", name: "AUDIENCE_ID", text: AUDIENCE_ID },
    { type: "plain_text", name: "FROM", text: "AIGUI <updates@superleo.app>" },
  ],
  keep_bindings: ["secret_text"],
}))
form.append("worker.js", new Blob([code], { type: "application/javascript+module" }), "worker.js")
await api("PUT", `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}`, form)
console.log(`uploaded ${SCRIPT}`)

const secrets = await api("GET", `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/secrets`)
const put = (name, text) => api("PUT", `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/secrets`, JSON.stringify({ name, text, type: "secret_text" }), { "content-type": "application/json" })
await put("RESEND_API_KEY", process.env.RESEND_API_KEY)
if (!secrets.some((s) => s.name === "SIGNING_SECRET")) await put("SIGNING_SECRET", randomBytes(32).toString("hex"))
console.log("secrets set")

await api("PUT", `/accounts/${ACCOUNT}/workers/domains`, JSON.stringify({ hostname: HOST, service: SCRIPT, environment: "production", zone_id: ZONE }), { "content-type": "application/json" })
console.log(`https://${HOST}`)
