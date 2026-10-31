-- Matchday OS: run once in the Supabase SQL editor.
create table if not exists public.orders (
    id uuid primary key,
    match_id text not null,
    user_id text not null,
    offer jsonb not null,
    created_at timestamptz not null default now()
);
create index if not exists orders_match_id_idx on public.orders (match_id);

create table if not exists public.matches (
    id text primary key,
    timeline jsonb not null,
    feed jsonb not null,
    archived_at timestamptz not null default now()
);

-- Only the agents (secret key) write; RLS on with no public policies.
alter table public.orders enable row level security;
alter table public.matches enable row level security;
