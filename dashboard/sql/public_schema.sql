-- ============================================================================
--  Stravwords — SCHEMA PUBLIC (couche sociale) : SOURCE DE VERITE UNIQUE
-- ----------------------------------------------------------------------------
--  Remplace les anciens fichiers 01..07. À coller dans Supabase → SQL Editor →
--  Run. Entierement IDEMPOTENT : relançable sans risque, ne touche aucune donnee
--  (les tables de base utilisent IF NOT EXISTS ; seules les VUES sont recreees,
--  et une vue ne contient pas de donnees).
--
--  Principe : on NE TOUCHE PAS au contenu des tables privees
--  (documents / daily_stats / goal_history). On ajoute une couche publique
--  À CÔTÉ, alimentee uniquement par choix de l'utilisateur.
--
--  LE VERROU : l'effort (mots ecrits) peut etre public ; l'OBJECTIF (objectif
--  quotidien, cible, echeance) ne sort des vues QUE si l'utilisateur a active un
--  bloc qui en a besoin. Ce filtre est applique ICI (cote base), donc il protege
--  meme contre une requete directe sur l'API — pas seulement dans la page.
-- ============================================================================


-- ===========================================================================
--  1) TABLE profiles — identite publique. Privee par defaut (is_public = false).
-- ===========================================================================
create table if not exists public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  username      text unique not null,
  display_name  text,
  bio           text,
  is_public     boolean not null default false,
  show_excerpts boolean not null default false,   -- Phase 4 (extraits), pas encore utilise
  allow_doc_view boolean not null default false,  -- autorise la vue par document
  public_prefs  jsonb not null default '{}'::jsonb, -- blocs visibles (voir PublicPrefs cote app)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Colonnes ajoutees apres coup (idempotent si la table preexistait).
alter table public.profiles add column if not exists allow_doc_view boolean not null default false;
alter table public.profiles add column if not exists public_prefs  jsonb   not null default '{}'::jsonb;

-- Pseudo : minuscules, chiffres, tiret/underscore, 3 a 30 caracteres.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles
      add constraint profiles_username_format check (username ~ '^[a-z0-9_-]{3,30}$');
  end if;
end $$;

-- RLS : lecture si is_public OU proprietaire ; ecriture proprietaire seul.
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


-- ===========================================================================
--  2) Colonnes publiques sur documents (table de base creee par l'add-in).
-- ===========================================================================
alter table public.documents add column if not exists public_hidden boolean not null default false;
alter table public.documents add column if not exists public_title  text;


-- ===========================================================================
--  3) TABLE user_settings — reglages utilisateur (heure de bascule de journee).
--     Privee : proprietaire uniquement.
-- ===========================================================================
create table if not exists public.user_settings (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  day_rollover_hour int not null default 0,
  updated_at        timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
  on public.user_settings for select using (auth.uid() = user_id);

drop policy if exists "user_settings_upsert_own" on public.user_settings;
create policy "user_settings_upsert_own"
  on public.user_settings for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
  on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ===========================================================================
--  4) LE VERROU, ecrit UNE fois : le profil expose-t-il l'objectif quotidien ?
--     Vrai si AU MOINS un bloc a objectif est actif (carte periode/graphe en
--     "full", serie objectif, ou paliers). Utilise par les vues ci-dessous.
--     Miroir cote app : prefsShowsDailyGoal() dans lib/profile.ts.
-- ===========================================================================
create or replace function public.prefs_shows_daily_goal(prefs jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(prefs ->> 'today', '')  = 'full'
      or coalesce(prefs ->> 'recent', '') = 'full'
      or coalesce(prefs ->> 'week', '')   = 'full'
      or coalesce(prefs ->> 'chart', '')  = 'full'
      or coalesce((prefs ->> 'streakGoal')::boolean, false)
      or coalesce((prefs ->> 'paliers')::boolean, false);
$$;

-- Ancienne vue (objectif separe) : fondue dans public_day_stats, on la supprime.
drop view if exists public.public_day_goals;


-- ===========================================================================
--  5) VUE public_day_stats — fenetre publique AGREGEE par jour.
--     Expose net + productif (effort, toujours) et l'objectif quotidien AGREGE
--     (uniquement si le verrou est ouvert, sinon NULL). Exclut les documents
--     retires du profil public (public_hidden).
--
--     Securite : une vue s'execute avec les droits de son createur (donc "voit"
--     daily_stats malgre son RLS). C'est voulu ICI — la barriere, c'est le filtre
--     « where is_public = true » + le verrou sur l'objectif.
-- ===========================================================================
drop view if exists public.public_day_stats;
create view public.public_day_stats as
select
  p.username,
  s.day,
  sum(s.productive)::int as productive,
  sum(s.net)::int        as net,
  case
    when bool_or(public.prefs_shows_daily_goal(p.public_prefs))
    then sum(coalesce(g.goal, d.daily_goal, 0))::int
  end as goal
from public.daily_stats s
join public.profiles p on p.user_id = s.user_id
left join public.documents d on d.user_id = s.user_id and d.doc_id = s.doc_id
left join lateral (
  -- objectif quotidien en vigueur ce jour-la (escalier goal_history)
  select gh.daily_goal as goal
  from public.goal_history gh
  where gh.user_id = s.user_id
    and gh.doc_id = s.doc_id
    and gh.changed_at::date <= s.day::date
  order by gh.changed_at desc
  limit 1
) g on true
where p.is_public = true
  and coalesce(d.public_hidden, false) = false
group by p.username, s.day;

grant select on public.public_day_stats to anon, authenticated;


-- ===========================================================================
--  6) VUE public_doc_day_stats — stats par JOUR et par DOCUMENT.
--     Visible seulement si la vue par document est autorisee ET le document a un
--     titre public. Expose le theme (emojis de palier) et l'objectif quotidien
--     (NULL si le verrou est ferme).
-- ===========================================================================
drop view if exists public.public_doc_day_stats;
create view public.public_doc_day_stats as
select
  p.username,
  s.doc_id,
  d.public_title,
  d.theme,
  s.day,
  s.productive::int as productive,
  s.net::int        as net,
  case
    when public.prefs_shows_daily_goal(p.public_prefs)
    then coalesce(
      (select gh.daily_goal from public.goal_history gh
        where gh.user_id = s.user_id and gh.doc_id = s.doc_id
          and gh.changed_at::date <= s.day::date
        order by gh.changed_at desc limit 1),
      d.daily_goal, 0
    )::int
  end as goal
from public.daily_stats s
join public.profiles p on p.user_id = s.user_id
join public.documents d on d.user_id = s.user_id and d.doc_id = s.doc_id
where p.is_public = true
  and p.allow_doc_view = true
  and coalesce(d.public_hidden, false) = false
  and d.public_title is not null
  and length(trim(d.public_title)) > 0;

grant select on public.public_doc_day_stats to anon, authenticated;


-- ===========================================================================
--  7) VUES donut projet (avancement). Le % est calcule EN SQL : en mode
--     "percent" les nombres bruts (cible/longueur/echeance) ne sortent jamais.
--     Longueur courante = word_count si connu, sinon somme des net.
-- ===========================================================================
drop view if exists public.public_project_agg;
create view public.public_project_agg as
with base as (
  select
    p.username,
    coalesce(p.public_prefs ->> 'donut', 'hidden') as donut,
    coalesce(
      d.word_count,
      (select coalesce(sum(s.net), 0) from public.daily_stats s
        where s.user_id = d.user_id and s.doc_id = d.doc_id)
    )::numeric as cur,
    coalesce(d.target, 0)::numeric as tgt
  from public.documents d
  join public.profiles p on p.user_id = d.user_id
  where p.is_public = true
    and coalesce(d.public_hidden, false) = false
    and coalesce(p.public_prefs ->> 'donut', 'hidden') in ('percent', 'full')
)
select
  username,
  case when sum(tgt) > 0 then least(100, round(100.0 * sum(cur) / sum(tgt)))::int end as pct,
  case when max(donut) = 'full' then sum(cur)::int end as cur,
  case when max(donut) = 'full' then sum(tgt)::int end as tgt
from base
group by username;

grant select on public.public_project_agg to anon, authenticated;

drop view if exists public.public_project_docs;
create view public.public_project_docs as
with base as (
  select
    p.username,
    d.doc_id,
    d.public_title,
    coalesce(p.public_prefs ->> 'donut', 'hidden') as donut,
    coalesce(
      d.word_count,
      (select coalesce(sum(s.net), 0) from public.daily_stats s
        where s.user_id = d.user_id and s.doc_id = d.doc_id)
    )::int as cur,
    coalesce(d.target, 0)::int as tgt,
    d.deadline
  from public.documents d
  join public.profiles p on p.user_id = d.user_id
  where p.is_public = true
    and p.allow_doc_view = true
    and coalesce(d.public_hidden, false) = false
    and d.public_title is not null
    and length(trim(d.public_title)) > 0
    and coalesce(p.public_prefs ->> 'donut', 'hidden') in ('percent', 'full')
)
select
  username,
  doc_id,
  public_title,
  case when tgt > 0 then least(100, round(100.0 * cur / tgt))::int end as pct,
  case when donut = 'full' then cur end as cur,
  case when donut = 'full' then tgt end as tgt,
  case when donut = 'full' then deadline end as deadline
from base;

grant select on public.public_project_docs to anon, authenticated;


-- ============================================================================
--  VERIFICATION (a lancer SEPAREMENT, connecte en anon si possible, ou juste
--  pour inspecter). Aucune ligne PRIVEE ne doit sortir :
--
--    -- aucune ligne de profil prive ne doit apparaitre pour anon :
--    select count(*) from public.profiles where is_public = false;  -- via clef anon => 0
--
--    -- l'objectif ne doit etre non-NULL que pour les profils qui l'exposent :
--    select username, count(goal) filter (where goal is not null) as jours_avec_objectif
--    from public.public_day_stats group by username;
--
--    -- les grants : seules les 4 vues doivent etre accessibles a anon.
--    select table_name, privilege_type from information_schema.role_table_grants
--    where grantee = 'anon' and table_schema = 'public';
-- ============================================================================
