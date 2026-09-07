create extension if not exists "pgcrypto";
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  display_name text,
  avatar_url text,
  country text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists feature_flags (
  key text primary key,
  enabled boolean not null default false,
  rollout_pct int not null default 0
);
