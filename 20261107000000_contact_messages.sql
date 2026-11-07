create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) <= 254),
  subject text not null check (char_length(subject) between 1 and 150),
  message text not null check (char_length(message) between 1 and 5000),
  ip_hash text,
  status text not null default 'new' check (status in ('new','notified','email_failed','read','archived')),
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_rate_idx on public.contact_messages (ip_hash, created_at desc);
-- RLS on, no policies: anon/authenticated can neither read nor write. Only the Edge Function (service role) can.
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
