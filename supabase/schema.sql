-- Time Clock schema: run once in the Supabase SQL Editor.
-- Every row belongs to one user (RLS). Conflicts resolve as "last write wins"
-- by the client's updated_at; server_updated_at is the pull cursor.

create table if not exists public.employers (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null,
  employee_name     text not null default '',
  rates             jsonb not null default '[]'::jsonb,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted           boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.shifts (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  employer_id       uuid not null references public.employers (id) on delete cascade,
  start_ms          bigint not null,
  end_ms            bigint,
  rate              numeric(10, 2) not null default 0,
  note              text,
  created_at        bigint not null,
  updated_at        bigint not null,
  deleted           boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp()
);

create index if not exists employers_user_sync_idx on public.employers (user_id, server_updated_at);
create index if not exists shifts_user_sync_idx on public.shifts (user_id, server_updated_at);
create index if not exists shifts_employer_idx on public.shifts (employer_id);

-- Last-write-wins + server cursor + owner cannot change.
create or replace function public.tc_sync_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null; -- stale write: keep the newer server version
    end if;
    new.user_id := old.user_id;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists employers_sync_guard on public.employers;
create trigger employers_sync_guard before insert or update on public.employers
  for each row execute function public.tc_sync_guard();

drop trigger if exists shifts_sync_guard on public.shifts;
create trigger shifts_sync_guard before insert or update on public.shifts
  for each row execute function public.tc_sync_guard();

-- Row Level Security: each user sees and writes only their own rows.
alter table public.employers enable row level security;
alter table public.shifts enable row level security;

drop policy if exists "own employers" on public.employers;
create policy "own employers" on public.employers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own shifts" on public.shifts;
create policy "own shifts" on public.shifts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.employers e where e.id = employer_id and e.user_id = (select auth.uid()))
  );

-- Table privileges for signed-in users (RLS above limits them to their own rows).
-- Hard deletes are never used by the app (soft delete via `deleted`).
grant usage on schema public to authenticated;
grant select, insert, update on public.employers, public.shifts to authenticated;
revoke delete on public.employers, public.shifts from anon, authenticated;
revoke all on public.employers, public.shifts from anon;

-- Realtime: other devices get notified of changes instantly.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'employers') then
    alter publication supabase_realtime add table public.employers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shifts') then
    alter publication supabase_realtime add table public.shifts;
  end if;
end $$;
