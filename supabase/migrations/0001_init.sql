-- Nightly — initial schema.
-- Run this in the Supabase SQL editor (or `supabase db push`) once the project exists.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- households

create table households (
  id uuid primary key,
  name text not null,
  -- Recorded so the creator can still see the row in the moment before their
  -- membership row syncs. Without it, RLS makes creation impossible — see the
  -- households policies below.
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table household_members (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text,
  email text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, user_id)
);

create table household_invites (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  code text not null unique,
  label text,
  email text,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table children (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  birth_date date,
  color int not null default 0,
  created_by uuid references auth.users(id),
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ------------------------------------------------------------ sleep sessions

-- Four timestamps: put-down and sleep onset are different events, as are waking
-- and getting up. Any of the last three may be null while a session is running.
create table sleep_sessions (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  type text not null check (type in ('nap', 'night')),
  put_down_at timestamptz,
  fell_asleep_at timestamptz,
  woke_at timestamptz,
  up_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  notes text,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index sleep_sessions_child_idx on sleep_sessions (child_id, put_down_at desc);
create index sleep_sessions_household_updated_idx on sleep_sessions (household_id, updated_at);

-- --------------------------------------------------------------------- tags

-- household_id null marks the global preset library, readable by everyone.
create table tags (
  id text primary key,
  household_id uuid references households(id) on delete cascade,
  name text not null,
  category text not null check (category in ('health','schedule','environment','food','activity','other')),
  scope text not null default 'session' check (scope in ('session', 'day')),
  is_preset boolean not null default false,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table sleep_session_tags (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  session_id uuid not null references sleep_sessions(id) on delete cascade,
  tag_id text not null references tags(id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (session_id, tag_id)
);

create table day_tags (
  id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  date date not null,
  tag_id text not null references tags(id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (child_id, date, tag_id)
);

-- ------------------------------------------------- last-write-wins convergence

-- Two devices can edit the same row while both are offline. Resolving this on the
-- server rather than the client makes it order-independent: whichever edit carries
-- the later updated_at survives, no matter which phone reconnects first.
-- Empty search_path: this function touches no tables, so pinning it closes the
-- mutable-search_path hole the database linter flags.
create or replace function lww_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at <= old.updated_at then
    return old;  -- incoming write is stale; keep what's stored
  end if;
  return new;
end;
$$;

create trigger households_lww before update on households
  for each row execute function lww_guard();
create trigger household_members_lww before update on household_members
  for each row execute function lww_guard();
create trigger household_invites_lww before update on household_invites
  for each row execute function lww_guard();
create trigger children_lww before update on children
  for each row execute function lww_guard();
create trigger sleep_sessions_lww before update on sleep_sessions
  for each row execute function lww_guard();
create trigger tags_lww before update on tags
  for each row execute function lww_guard();
create trigger sleep_session_tags_lww before update on sleep_session_tags
  for each row execute function lww_guard();
create trigger day_tags_lww before update on day_tags
  for each row execute function lww_guard();

-- ------------------------------------------------------------ row level security

alter table households enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;
alter table children enable row level security;
alter table sleep_sessions enable row level security;
alter table tags enable row level security;
alter table sleep_session_tags enable row level security;
alter table day_tags enable row level security;

-- Membership lookup, wrapped so the policies below don't recurse into
-- household_members' own RLS.
create or replace function is_household_member(target uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = target and user_id = auth.uid() and deleted_at is null
  );
$$;

-- Households need per-command policies, not a single `for all`.
--
-- Two traps here, both of which silently block onboarding and jam the sync
-- outbox on its very first write:
--   1. Requiring is_household_member(id) to INSERT can never succeed — the
--      membership row cannot exist before the household does.
--   2. The client syncs with upsert, and INSERT ... ON CONFLICT DO UPDATE also
--      applies the SELECT policy, because it must be able to read a conflicting
--      row. So a membership-only SELECT blocks creation too, even though the
--      INSERT policy passes.
-- created_by resolves both without opening the table up.
create policy households_insert on households
  for insert to authenticated
  with check (created_by is null or created_by = auth.uid());

create policy households_select on households
  for select to authenticated
  using (is_household_member(id) or created_by = auth.uid());

create policy households_update on households
  for update to authenticated
  using (is_household_member(id) or created_by = auth.uid())
  with check (is_household_member(id) or created_by = auth.uid());

create policy households_delete on households
  for delete to authenticated
  using (is_household_member(id));

create policy members_access on household_members
  for all using (is_household_member(household_id) or user_id = auth.uid())
  with check (is_household_member(household_id) or user_id = auth.uid());

create policy invites_access on household_invites
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy children_access on children
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy sessions_access on sleep_sessions
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- Everyone may read the global presets; only household rows are writable.
create policy tags_read on tags
  for select using (household_id is null or is_household_member(household_id));
create policy tags_write on tags
  for insert with check (household_id is not null and is_household_member(household_id));
create policy tags_update on tags
  for update using (household_id is not null and is_household_member(household_id))
  with check (household_id is not null and is_household_member(household_id));

create policy session_tags_access on sleep_session_tags
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy day_tags_access on day_tags
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ----------------------------------------------------------- invite redemption

-- A not-yet-member can neither read the invite nor insert their membership under
-- RLS, so redemption has to run with elevated rights. This is the schema's only
-- privileged escape hatch, and it validates the code before granting anything.
create or replace function redeem_invite(invite_code text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id
  from household_invites
  where code = invite_code
    and expires_at > now()
    and revoked_at is null
    and redeemed_at is null
    and deleted_at is null;

  if v_household_id is null then
    raise exception 'invalid or expired invite';
  end if;

  insert into household_members (id, household_id, user_id, role, email)
  values (gen_random_uuid(), v_household_id, auth.uid(), 'member', auth.email())
  on conflict (household_id, user_id) do nothing;

  update household_invites
     set redeemed_at = now(), redeemed_by = auth.uid(), updated_at = now()
   where code = invite_code;

  return v_household_id;
end;
$$;

-- ------------------------------------------------- function exposure hardening

-- Both helpers are SECURITY DEFINER, which PostgREST would otherwise expose as
-- public RPC endpoints. is_household_member has to stay callable by
-- `authenticated` because RLS policies evaluate it as the querying role, and
-- redeem_invite is the invite flow itself — but neither is any use to `anon`.
revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- ------------------------------------------------------------------- realtime

alter publication supabase_realtime add table households;
alter publication supabase_realtime add table household_members;
alter publication supabase_realtime add table household_invites;
alter publication supabase_realtime add table children;
alter publication supabase_realtime add table sleep_sessions;
alter publication supabase_realtime add table tags;
alter publication supabase_realtime add table sleep_session_tags;
alter publication supabase_realtime add table day_tags;

-- -------------------------------------------------------------- preset tags

-- Ids are stable slugs, not random uuids, so the client-side seed and this one
-- refer to the same rows instead of creating duplicates on every device.
insert into tags (id, household_id, name, category, scope, is_preset, updated_at) values
  ('preset-teething',            null, 'teething',            'health',      'day',     true, now()),
  ('preset-sick',                null, 'sick',                'health',      'day',     true, now()),
  ('preset-fever',               null, 'fever',               'health',      'day',     true, now()),
  ('preset-congestion',          null, 'congestion',          'health',      'day',     true, now()),
  ('preset-vaccination',         null, 'vaccination',         'health',      'day',     true, now()),
  ('preset-growth-spurt',        null, 'growth spurt',        'health',      'day',     true, now()),
  ('preset-skipped-nap',         null, 'skipped nap',         'schedule',    'day',     true, now()),
  ('preset-short-nap',           null, 'short nap',           'schedule',    'session', true, now()),
  ('preset-early-wake',          null, 'early wake',          'schedule',    'session', true, now()),
  ('preset-late-bedtime',        null, 'late bedtime',        'schedule',    'session', true, now()),
  ('preset-daycare-day',         null, 'daycare day',         'schedule',    'day',     true, now()),
  ('preset-time-change-dst',     null, 'time change / DST',   'schedule',    'day',     true, now()),
  ('preset-schedule-change',     null, 'schedule change',     'schedule',    'day',     true, now()),
  ('preset-travel-new-place',    null, 'travel / new place',  'environment', 'day',     true, now()),
  ('preset-room-too-hot',        null, 'room too hot',        'environment', 'session', true, now()),
  ('preset-room-too-cold',       null, 'room too cold',       'environment', 'session', true, now()),
  ('preset-noise',               null, 'noise',               'environment', 'session', true, now()),
  ('preset-new-sleep-space',     null, 'new sleep space',     'environment', 'day',     true, now()),
  ('preset-big-meal',            null, 'big meal',            'food',        'session', true, now()),
  ('preset-late-meal',           null, 'late meal',           'food',        'session', true, now()),
  ('preset-new-food',            null, 'new food',            'food',        'day',     true, now()),
  ('preset-more-milk',           null, 'more milk',           'food',        'session', true, now()),
  ('preset-less-milk',           null, 'less milk',           'food',        'session', true, now()),
  ('preset-screen-time',         null, 'screen time',         'activity',    'day',     true, now()),
  ('preset-high-activity-day',   null, 'high activity day',   'activity',    'day',     true, now()),
  ('preset-low-activity-day',    null, 'low activity day',    'activity',    'day',     true, now()),
  ('preset-overtired',           null, 'overtired',           'activity',    'session', true, now()),
  ('preset-car-nap',             null, 'car nap',             'activity',    'session', true, now()),
  ('preset-stroller-nap',        null, 'stroller nap',        'activity',    'session', true, now()),
  ('preset-extra-outdoor-time',  null, 'extra outdoor time',  'activity',    'day',     true, now()),
  ('preset-missed-wind-down',    null, 'missed wind-down',    'activity',    'session', true, now())
on conflict (id) do nothing;
