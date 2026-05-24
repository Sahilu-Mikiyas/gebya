-- ============================================================
-- GEBYA — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL)
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for fuzzy item search

-- ============================================================
-- 1. PROFILES  (extends auth.users)
-- ============================================================
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  neighbourhood text,
  trust_score   integer   default 0,
  level         integer   default 1,
  total_pts     integer   default 0,
  tier          text      default 'new' check (tier in ('new','rising','trusted','verified')),
  avatar_url    text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. MARKETS
-- ============================================================
create table if not exists markets (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  sub_city    text not null,
  lat         numeric(10,7),
  lng         numeric(10,7),
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create index if not exists markets_sub_city_idx on markets(sub_city);

-- ============================================================
-- 3. ITEMS
-- ============================================================
create table if not exists items (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  name_am          text,           -- Amharic name
  emoji            text not null default '🛒',
  category         text not null check (category in ('veggie','grain','protein','oil','dairy','spice','bread','other')),
  unit             text not null default 'kg',
  first_logger_id  uuid references profiles(id) on delete set null,
  is_approved      boolean default true,
  created_at       timestamptz default now()
);

create index if not exists items_category_idx on items(category);
create index if not exists items_name_trgm_idx on items using gin (name gin_trgm_ops);

-- ============================================================
-- 4. PRICE LOGS
-- ============================================================
create table if not exists price_logs (
  id               uuid primary key default uuid_generate_v4(),
  item_id          uuid not null references items(id) on delete cascade,
  market_id        uuid not null references markets(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  price_etb        numeric(10,2) not null check (price_etb > 0),
  logged_at        timestamptz default now(),
  confirmed_count  integer default 0,
  flagged_count    integer default 0,
  is_anomaly       boolean default false,
  is_pending_sync  boolean default false   -- offline write queue flag
);

create index if not exists price_logs_item_market_idx on price_logs(item_id, market_id);
create index if not exists price_logs_logged_at_idx   on price_logs(logged_at desc);
create index if not exists price_logs_user_idx        on price_logs(user_id);
create index if not exists price_logs_pending_idx     on price_logs(is_pending_sync) where is_pending_sync = true;

-- ============================================================
-- 5. VOTES  (confirm / flag a price log)
-- ============================================================
create table if not exists votes (
  id            uuid primary key default uuid_generate_v4(),
  price_log_id  uuid not null references price_logs(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  vote          text not null check (vote in ('confirm','flag')),
  created_at    timestamptz default now(),
  unique (price_log_id, user_id)   -- one vote per user per log
);

-- update confirmed/flagged counters automatically
create or replace function public.update_vote_counts()
returns trigger language plpgsql as $$
begin
  update price_logs set
    confirmed_count = (select count(*) from votes where price_log_id = coalesce(new.price_log_id, old.price_log_id) and vote = 'confirm'),
    flagged_count   = (select count(*) from votes where price_log_id = coalesce(new.price_log_id, old.price_log_id) and vote = 'flag')
  where id = coalesce(new.price_log_id, old.price_log_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_vote_change on votes;
create trigger on_vote_change
  after insert or update or delete on votes
  for each row execute function public.update_vote_counts();

-- ============================================================
-- 6. ALERTS
-- ============================================================
create table if not exists alerts (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  item_id      uuid not null references items(id) on delete cascade,
  market_id    uuid references markets(id) on delete set null,  -- null = any market
  target_price numeric(10,2) not null check (target_price > 0),
  direction    text not null check (direction in ('drop_below','rise_above')),
  is_active    boolean default true,
  triggered_at timestamptz,
  created_at   timestamptz default now()
);

create index if not exists alerts_user_idx on alerts(user_id);
create index if not exists alerts_item_idx on alerts(item_id);

-- ============================================================
-- 7. LISTS  (shopping lists)
-- ============================================================
create table if not exists lists (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null default 'My List',
  items      jsonb not null default '[]',  -- [{item_id, qty, unit, note}]
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists lists_user_idx on lists(user_id);

-- ============================================================
-- 8. SYNC QUEUE  (offline writes pending server confirmation)
-- ============================================================
create table if not exists sync_queue (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  action     text not null check (action in ('log_price','vote','new_item')),
  payload    jsonb not null,
  created_at timestamptz default now(),
  synced_at  timestamptz,
  error      text
);

create index if not exists sync_queue_user_pending_idx on sync_queue(user_id) where synced_at is null;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- profiles: users read all, update only their own
alter table profiles enable row level security;
create policy "profiles_select_all"   on profiles for select using (true);
create policy "profiles_update_own"   on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own"   on profiles for insert with check (auth.uid() = id);

-- markets: public read, no user writes (admin only)
alter table markets enable row level security;
create policy "markets_select_all"    on markets for select using (true);

-- items: public read; authenticated users insert pending approval
alter table items enable row level security;
create policy "items_select_all"      on items for select using (true);
create policy "items_insert_auth"     on items for insert with check (auth.role() = 'authenticated');

-- price_logs: public read; authenticated insert own
alter table price_logs enable row level security;
create policy "price_logs_select_all" on price_logs for select using (true);
create policy "price_logs_insert_own" on price_logs for insert with check (auth.uid() = user_id);

-- votes: public read; authenticated insert own; delete own
alter table votes enable row level security;
create policy "votes_select_all"      on votes for select using (true);
create policy "votes_insert_own"      on votes for insert with check (auth.uid() = user_id);
create policy "votes_delete_own"      on votes for delete using (auth.uid() = user_id);

-- alerts: private to owner
alter table alerts enable row level security;
create policy "alerts_own"            on alerts using (auth.uid() = user_id);

-- lists: private to owner
alter table lists enable row level security;
create policy "lists_own"             on lists using (auth.uid() = user_id);

-- sync_queue: private to owner
alter table sync_queue enable row level security;
create policy "sync_queue_own"        on sync_queue using (auth.uid() = user_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- Latest confirmed price per item per market (used by dashboard, optimizer)
create or replace view latest_prices as
select distinct on (item_id, market_id)
  pl.id,
  pl.item_id,
  pl.market_id,
  pl.price_etb,
  pl.logged_at,
  pl.confirmed_count,
  pl.flagged_count,
  pl.is_anomaly,
  pl.user_id,
  i.name        as item_name,
  i.emoji       as item_emoji,
  i.category    as item_category,
  i.unit        as item_unit,
  m.name        as market_name,
  m.sub_city    as market_sub_city
from price_logs pl
join items i   on i.id = pl.item_id
join markets m on m.id = pl.market_id
where pl.is_pending_sync = false
order by item_id, market_id, logged_at desc;
