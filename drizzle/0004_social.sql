create extension if not exists "pgcrypto";
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_clerk_id text not null,
  addressee_clerk_id text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_clerk_id <> addressee_clerk_id),
  constraint friendships_status_check check (status in ('pending', 'accepted', 'declined'))
);
create unique index if not exists friendships_pair_uniq on friendships (requester_clerk_id, addressee_clerk_id);
create index if not exists friendships_addressee_idx on friendships (addressee_clerk_id);
create table if not exists presence (
  clerk_id text primary key,
  last_seen timestamptz not null default now()
);
