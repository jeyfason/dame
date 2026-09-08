create extension if not exists "pgcrypto";
create table if not exists games (
  id uuid primary key,
  white_clerk_id text not null,
  black_clerk_id text not null,
  winner text,
  reason text,
  moves jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz not null default now()
);
create table if not exists ratings (
  clerk_id text primary key,
  rating real not null default 1500,
  rd real not null default 350,
  vol real not null default 0.06,
  games_played int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists rating_history (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null,
  game_id uuid not null,
  rating real not null,
  rd real not null,
  at timestamptz not null default now()
);
create index if not exists rating_history_clerk_idx on rating_history (clerk_id);
create index if not exists rating_history_game_idx on rating_history (game_id);
create table if not exists invites (
  code text primary key,
  host_clerk_id text not null,
  game_id uuid,
  expires_at timestamptz not null,
  used_at timestamptz
);
