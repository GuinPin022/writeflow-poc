-- ============================================================================
--  WriteFlow — reglages GLOBAUX par utilisateur
-- ----------------------------------------------------------------------------
--  À coller dans Supabase → SQL Editor → Run. Idempotent.
--
--  Pour l'instant : une seule preference, l'HEURE DE BASCULE de journee.
--  day_rollover_hour = 0  -> bascule a minuit (comportement actuel, defaut).
--  day_rollover_hour = 4  -> ce qui est ecrit avant 4 h compte sur la veille.
--
--  Lue par l'add-in (pour ranger l'ecriture dans le bon jour) ET par le dashboard
--  (pour aligner "aujourd'hui / cette semaine" a l'affichage). Prive : chaque
--  utilisateur ne voit/modifie que sa propre ligne.
-- ============================================================================

create table if not exists public.user_settings (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  day_rollover_hour int not null default 0,
  updated_at        timestamptz not null default now()
);

-- Heure valide : 0 a 23.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_rollover_range'
  ) then
    alter table public.user_settings
      add constraint user_settings_rollover_range
      check (day_rollover_hour >= 0 and day_rollover_hour <= 23);
  end if;
end $$;

-- RLS : strictement prive (proprietaire uniquement).
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
  on public.user_settings for select
  using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
