# Malik Mohmmad Ausaib — Portfolio

Static frontend (`index.html`, no build step) + Supabase (table + Edge Function) + Resend.

## Status
Emails do NOT work until you finish steps 1–4. Until `CONFIG` in index.html is filled, the form says nothing was sent.

## 1. Supabase
1. Create a project at supabase.com. Note the project ref, the URL and the **anon** key (Settings → API).
2. `npm i -g supabase` (or `npx supabase`), then:
```
supabase login
supabase link --project-ref YOUR_REF
supabase db push
```
(creates `contact_messages`, RLS enabled, no public access.)

## 2. Resend
1. Sign up at resend.com → API Keys → create key.
2. Domains → add a domain you own, add the DNS records Resend shows, wait for "Verified".
   Without a verified domain Resend only lets you send to the account owner's own email using `onboarding@resend.dev` — fine for a first test (set `RESEND_FROM="Portfolio <onboarding@resend.dev>"`), but visitor confirmations won't work.

## 3. Secrets and deploy
```
cp .env.example .env        # fill in real values
supabase secrets set --env-file .env
supabase functions deploy contact --no-verify-jwt
```
(`--no-verify-jwt` lets the public form call it; the function does its own validation, honeypot and rate limiting.)

## 4. Frontend
In `index.html` set `CONFIG.SUPABASE_URL` and `CONFIG.SUPABASE_ANON_KEY` (anon key only — never the service-role key). Host the folder on any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages), then set `ALLOWED_ORIGIN` to that URL and re-run `supabase secrets set`.

## 5. Test
Submit the form → row appears in Table Editor → email arrives with Reply-To = visitor. Check Edge Function logs if not. Rows with status `email_failed` saved but didn't email.
