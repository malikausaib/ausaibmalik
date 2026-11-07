import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OWNER = Deno.env.get("OWNER_EMAIL")!;
const FROM = Deno.env.get("RESEND_FROM")!;
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const CONFIRM = Deno.env.get("SEND_CONFIRMATION") === "true";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ");
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function resend(payload: Record<string, unknown>) {
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ ok: false, error: "Method not allowed" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return out({ ok: false, error: "Invalid request" }, 400); }

  // Honeypot filled or form submitted impossibly fast: silently drop
  if (clean(b.website, 50) || Number(b.elapsed) < 2000) return out({ ok: true });

  const name = clean(b.name, 100), email = clean(b.email, 254).toLowerCase(), subject = oneLine(clean(b.subject, 150)), message = clean(b.message, 5000);
  if (!name || !subject || !message) return out({ ok: false, error: "Please fill in every field." }, 400);
  if (!/^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/.test(email)) return out({ ok: false, error: "Invalid email address." }, 400);

  // Rate limit: 3 per IP per 10 min, 20 total per hour
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const ip_hash = await sha(ip + (Deno.env.get("IP_SALT") ?? ""));
  const since = (m: number) => new Date(Date.now() - m * 60000).toISOString();
  const { count } = await db.from("contact_messages").select("id", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", since(10));
  const { count: all } = await db.from("contact_messages").select("id", { count: "exact", head: true }).gte("created_at", since(60));
  if ((count ?? 0) >= 3 || (all ?? 0) >= 20) return out({ ok: false, error: "Too many messages. Try again later." }, 429);

  const { data, error } = await db.from("contact_messages").insert({ name, email, subject, message, ip_hash }).select("id, created_at").single();
  if (error || !data) { console.error(error); return out({ ok: false, error: "Could not save your message." }, 500); }

  // Fixed From/To; visitor email only ever goes in reply_to
  const when = new Date(data.created_at).toUTCString();
  const sent = await resend({
    from: FROM, to: [OWNER], reply_to: email, subject: `[Portfolio] ${subject}`,
    html: `<p><b>From:</b> ${esc(name)} &lt;${esc(email)}&gt;<br><b>Subject:</b> ${esc(subject)}<br><b>Received:</b> ${when}</p><hr><p style="white-space:pre-wrap">${esc(message)}</p>`,
    text: `From: ${name} <${email}>\nSubject: ${subject}\nReceived: ${when}\n\n${message}`,
  });
  await db.from("contact_messages").update({ status: sent ? "notified" : "email_failed" }).eq("id", data.id);
  if (sent && CONFIRM) await resend({ from: FROM, to: [email], subject: "Thanks for your message", text: `Hi ${oneLine(name)},\n\nI received your message ("${subject}") and will get back to you.\n\nMalik` });

  return out({ ok: true });
});
