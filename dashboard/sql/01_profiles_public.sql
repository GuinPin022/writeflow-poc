-- ============================================================================
--  Stravwords — Phase 1+2 : identité publique + profil public partageable
-- ----------------------------------------------------------------------------
--  À coller dans Supabase → SQL Editor → Run.
--  Idempotent : peut être relancé sans casser (IF NOT EXISTS / DROP ... IF EXISTS).
--
--  Principe : on NE TOUCHE PAS aux tables privées existantes
--  (documents / daily_stats / goal_history). On ajoute une couche publique
--  À CÔTÉ, alimentée uniquement par choix de l'utilisateur.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) TABLE profiles — l'identité publique d'un utilisateur.
--    Privée par défaut : is_public = false → invisible pour les autres.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  username      text unique not null,
  display_name  text,
  bio           text,
  is_public     boolean not null default false,  -- opt-in : rien de public tant que false
  show_excerpts boolean not null default false,  -- opt-in : autorise les extraits (Phase 4)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Pseudo : minuscules, chiffres, tiret/underscore, 3 à 30 caractères.
-- Garantit des URLs propres (#/u/mon-pseudo) et une unicité sans surprise de casse.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (username ~ '^[a-z0-9_-]{3,30}$');
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 2) RLS sur profiles.
--    Lecture : tout le monde (même non connecté) SI is_public = true,
--              ou bien le propriétaire pour sa propre ligne.
--    Écriture : uniquement le propriétaire.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_public_or_own" on public.profiles;
create policy "profiles_select_public_or_own"
  on public.profiles for select
  using (is_public = true or auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 3) VUE public_day_stats — la SEULE fenêtre publique sur les chiffres.
--    Agrège daily_stats PAR JOUR et PAR UTILISATEUR, uniquement pour les
--    profils publics. N'expose QUE : pseudo, jour, mots productifs, net (Word).
--    JAMAIS doc_id, doc_name, ni le détail par document, ni le texte.
--
--    Sécurité : une vue s'exécute avec les droits de son créateur et "voit" donc
--    daily_stats malgré son RLS. C'est voulu ICI, mais c'est précisément pourquoi
--    le filtre « where is_public = true » est la barrière de sécurité : seuls les
--    jours d'utilisateurs ayant explicitement rendu leur profil public sortent.
-- ----------------------------------------------------------------------------
drop view if exists public.public_day_stats;
create view public.public_day_stats as
select
  p.username,
  s.day,
  sum(s.productive)::int as productive,
  sum(s.net)::int        as net
from public.daily_stats s
join public.profiles p on p.user_id = s.user_id
where p.is_public = true
group by p.username, s.day;

-- Donne le droit de LIRE la vue aux visiteurs (anon = non connecté) et aux
-- utilisateurs connectés. Sans ce grant, la page publique ne verrait rien.
grant select on public.public_day_stats to anon, authenticated;
