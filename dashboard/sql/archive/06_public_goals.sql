-- ============================================================================
--  Stravwords — Etape B2-b : objectifs & paliers sur la page publique
-- ----------------------------------------------------------------------------
--  À coller dans Supabase → SQL Editor → Run, APRÈS 05_public_prefs.sql.
--  Idempotent.
--
--  Les blocs « 🎯 objectifs atteints » et « 🎖️ paliers » ont besoin de connaitre
--  l'OBJECTIF QUOTIDIEN en vigueur chaque jour — une info aujourd'hui privee.
--  On l'expose donc via des vues GATEES : une ligne ne sort QUE si l'auteur a
--  active le bloc « objectifs » OU « paliers » dans ses preferences publiques.
--  Sans ces flags, les vues ne renvoient rien : aucun objectif ne fuite.
--
--  L'objectif en vigueur un jour = derniere entree de goal_history a cette date
--  (escalier), repli sur l'objectif courant du document. Meme logique que le
--  dashboard (lib/data.ts goalForDay), reproduite ici en SQL.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) VUE public_day_goals — objectif quotidien AGREGE (somme sur les documents),
--    par jour, pour les profils publics ayant active objectifs OU paliers.
--    Se combine avec public_day_stats (qui fournit deja net & productive).
-- ----------------------------------------------------------------------------
drop view if exists public.public_day_goals;
create view public.public_day_goals as
select
  p.username,
  s.day,
  sum(
    coalesce(
      (
        select gh.daily_goal
        from public.goal_history gh
        where gh.user_id = s.user_id
          and gh.doc_id = s.doc_id
          and gh.changed_at::date <= s.day::date
        order by gh.changed_at desc
        limit 1
      ),
      d.daily_goal,
      0
    )
  )::int as goal
from public.daily_stats s
join public.profiles p on p.user_id = s.user_id
left join public.documents d on d.user_id = s.user_id and d.doc_id = s.doc_id
where p.is_public = true
  and coalesce(d.public_hidden, false) = false
  and (
    coalesce((p.public_prefs ->> 'goals')::boolean, false)
    or coalesce((p.public_prefs ->> 'paliers')::boolean, false)
  )
group by p.username, s.day;

grant select on public.public_day_goals to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2) Vue PAR DOCUMENT enrichie : on remplace public_doc_day_stats pour y ajouter
--    le theme (pour les emojis de palier) et l'objectif quotidien en vigueur.
--    L'objectif n'est renseigne (sinon NULL) que si objectifs OU paliers est
--    actif — meme barriere que ci-dessus. Le reste (gating allow_doc_view +
--    public_title) est inchange.
-- ----------------------------------------------------------------------------
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
    when coalesce((p.public_prefs ->> 'goals')::boolean, false)
      or coalesce((p.public_prefs ->> 'paliers')::boolean, false)
    then coalesce(
      (
        select gh.daily_goal
        from public.goal_history gh
        where gh.user_id = s.user_id
          and gh.doc_id = s.doc_id
          and gh.changed_at::date <= s.day::date
        order by gh.changed_at desc
        limit 1
      ),
      d.daily_goal,
      0
    )::int
    else null
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
