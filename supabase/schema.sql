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

-- Club ops rules for the merch negotiation: jersey stock, max discount and allowed bundles per player.
create table if not exists public.inventory (
    player text primary key,
    team text not null,
    stock int not null,
    max_discount_pct int not null,
    bundles text[] not null default '{}',
    updated_at timestamptz not null default now()
);
alter table public.inventory enable row level security;

insert into public.inventory (player, team, stock, max_discount_pct, bundles) values
    ('Messi', 'Argentina', 40, 15, '{scarf,name print}'),
    ('Di María', 'Argentina', 25, 25, '{scarf,name print}'),
    ('Mbappé', 'France', 2, 20, '{scarf,name print}'),
    ('Kolo Muani', 'France', 6, 20, '{name print}'),
    ('Julián Álvarez', 'Argentina', 15, 20, '{scarf,name print}'),
    ('Dybala', 'Argentina', 10, 20, '{name print}'),
    ('Griezmann', 'France', 15, 20, '{scarf,name print}')
on conflict (player) do update set team = excluded.team, stock = excluded.stock,
    max_discount_pct = excluded.max_discount_pct, bundles = excluded.bundles, updated_at = now();
