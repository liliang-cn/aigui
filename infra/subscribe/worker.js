// subscribe.superleo.app — sign up for AIGUI release notes.
//
// Double opt-in: the form sends a confirmation link, and only a confirmed address is added to the
// Resend audience. Nothing is stored before that — the link itself carries the address, signed.
// Updates go out as Resend broadcasts, which carry their own unsubscribe link.

const PAGE_STYLE = `:root{--bg:#fff;--fg:#1c1c1e;--muted:#6b6b70;--rule:#e6e6ea;--accent:#0284c7;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececef;--muted:#9a9aa2;--rule:#2a2a2f;--accent:#38bdf8;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,"PingFang SC",system-ui,sans-serif}
main{max-width:520px;margin:12vh auto 0;padding:0 16px}
h1{font-size:22px;margin:0 0 8px}p{color:var(--muted);margin:0 0 20px}
form{display:flex;gap:8px;flex-wrap:wrap}input[type=email]{flex:1;min-width:220px;font:inherit;padding:8px 10px;border:1px solid var(--rule);border-radius:8px;background:transparent;color:inherit}
button{font:inherit;padding:8px 14px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
.hp{position:absolute;left:-9999px}a{color:var(--accent)}`

const page = (title, body) =>
  new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${PAGE_STYLE}</style></head><body><main>${body}</main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  })

const FORM = page(
  "AIGUI updates",
  `<h1>AIGUI release notes</h1><p>An email when a new version of <a href="https://github.com/liliang-cn/aigui">AIGUI</a> ships — what it can draw now, and what changed. A few a month at most; unsubscribe from any of them.</p>
<form method="post" action="/subscribe"><input type="email" name="email" required placeholder="you@example.com" autocomplete="email"><input class="hp" name="website" tabindex="-1" autocomplete="off"><button>Subscribe</button></form>`,
)

const encoder = new TextEncoder()
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

async function sign(secret, text) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return b64url(await crypto.subtle.sign("HMAC", key, encoder.encode(text)))
}

/** Constant-time comparison, so a signature cannot be guessed a character at a time. */
function same(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,180}\.[a-z]{2,24}$/i

async function subscribe(request, env) {
  const form = await request.formData()
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  const done = page("Check your inbox", `<h1>Check your inbox</h1><p>If ${email ? "that address is valid" : "the address is valid"}, a confirmation link is on its way. Nothing is sent until you click it.</p>`)
  // The honeypot: a person never fills a field they cannot see.
  if (form.get("website")) return done
  if (!EMAIL.test(email) || email.length > 254) return page("Not an email address", `<h1>That does not look like an email address</h1><p><a href="/">Try again</a></p>`)

  // One confirmation per address per hour: the form must not become a way to fill someone
  // else's inbox with confirmation emails.
  const cooldown = new Request(`https://cooldown.local/${await sign(env.SIGNING_SECRET, `cooldown|${email}`)}`)
  if (await caches.default.match(cooldown)) return done
  await caches.default.put(cooldown, new Response("1", { headers: { "cache-control": "max-age=3600" } }))

  const expires = Date.now() + 48 * 3600 * 1000
  const signature = await sign(env.SIGNING_SECRET, `${email}|${expires}`)
  const link = `${new URL(request.url).origin}/confirm?e=${encodeURIComponent(email)}&x=${expires}&s=${signature}`
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.FROM,
      to: email,
      subject: "Confirm: AIGUI release notes",
      text: `Someone — hopefully you — asked to get AIGUI release notes at this address.\n\nConfirm: ${link}\n\nIf it was not you, ignore this email and nothing more will be sent.`,
      html: `<p>Someone — hopefully you — asked to get <a href="https://github.com/liliang-cn/aigui">AIGUI</a> release notes at this address.</p><p><a href="${link}">Confirm the subscription</a></p><p style="color:#888">If it was not you, ignore this email and nothing more will be sent.</p>`,
    }),
  })
  return done
}

async function confirm(url, env) {
  const email = String(url.searchParams.get("e") ?? "").toLowerCase()
  const expires = Number(url.searchParams.get("x"))
  const given = String(url.searchParams.get("s") ?? "")
  const valid = EMAIL.test(email) && expires > Date.now() && same(given, await sign(env.SIGNING_SECRET, `${email}|${expires}`))
  if (!valid) return page("Link expired", `<h1>That link has expired or is not valid</h1><p><a href="/">Subscribe again</a></p>`)
  const res = await fetch(`https://api.resend.com/audiences/${env.AUDIENCE_ID}/contacts`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, unsubscribed: false }),
  })
  if (!res.ok) return page("Something went wrong", `<h1>Something went wrong</h1><p>Please try the link again in a minute.</p>`)
  return page("Subscribed", `<h1>You're subscribed</h1><p>The next AIGUI release will land in your inbox. Every email has an unsubscribe link.</p>`)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/") return FORM
    if (request.method === "POST" && url.pathname === "/subscribe") return subscribe(request, env)
    if (request.method === "GET" && url.pathname === "/confirm") return confirm(url, env)
    return new Response("Not found", { status: 404 })
  },
}
