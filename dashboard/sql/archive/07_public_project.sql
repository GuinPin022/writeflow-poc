-- ============================================================================
--  Stravwords — Etape B2-c : donut "avancement du projet" sur la page publique
-- ----------------------------------------------------------------------------
--  À coller dans Supabase → SQL Editor → Run, APRÈS 06_public_goals.sql.
--  Idempotent.
--
--  Le donut a TROIS etats (profiles.public_prefs->>'donut') :
--    - "hidden"  : rien (les vues ci-dessous ne renvoient aucune ligne) ;
--    - "percent" : on n'expose QUE le pourcentage d'avancement (aucun chiffre
--                  brut : ni cible, ni longueur, ni echeance) ;
--    - "full"    : on expose aussi longueur courante + cible + echeance.
--  Le pourcentage est calcule EN SQL pour qu'en mode "percent" les nombres bruts
--  ne sortent jamais de la base.
--
--  Longueur courante d'un document = word_count si connu, sinon somme des net
--  (meme repli que lib/data.ts projectLength).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) VUE public_project_agg — donut AGREGE (tous les documents du profil),
--    une ligne par profil public dont le donut n'est pas masque.
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- 2) VUE public_project_docs — donut PAR DOCUMENT (quand la vue par document est
--    autorisee et le document nomme). Inclut l'echeance, qui n'a de sens que pour
--    un document precis.
-- ----------------------------------------------------------------------------
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
