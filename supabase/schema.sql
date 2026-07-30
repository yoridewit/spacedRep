-- Kaartjes — synchronisatie tussen apparaten.
-- Draai dit één keer in de SQL-editor van je Supabase-project.
--
-- Eén rij per gebruiker: de hele stand als jsonb, plus een revision waarmee
-- twee apparaten elkaar niet kunnen overschrijven. De app voegt zelf samen
-- (zie js/merge.js) en schrijft alleen terug als de revision nog klopt.

create table if not exists public.sync_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  doc        jsonb       not null default '{}'::jsonb,
  revision   bigint      not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.sync_state enable row level security;

-- Iedereen ziet en wijzigt uitsluitend zijn eigen rij.
drop policy if exists "eigen rij lezen"     on public.sync_state;
drop policy if exists "eigen rij aanmaken"  on public.sync_state;
drop policy if exists "eigen rij bijwerken" on public.sync_state;
drop policy if exists "eigen rij wissen"    on public.sync_state;

create policy "eigen rij lezen"
  on public.sync_state for select
  using (auth.uid() = user_id);

create policy "eigen rij aanmaken"
  on public.sync_state for insert
  with check (auth.uid() = user_id);

create policy "eigen rij bijwerken"
  on public.sync_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "eigen rij wissen"
  on public.sync_state for delete
  using (auth.uid() = user_id);

-- De revision mag alleen omhoog; dat maakt van een verlate schrijver nooit een winnaar.
create or replace function public.sync_state_guard()
returns trigger
language plpgsql
as $$
begin
  if new.revision <= old.revision then
    raise exception 'revision moet oplopen (was %, werd %)', old.revision, new.revision;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_state_guard on public.sync_state;
create trigger sync_state_guard
  before update on public.sync_state
  for each row execute function public.sync_state_guard();
