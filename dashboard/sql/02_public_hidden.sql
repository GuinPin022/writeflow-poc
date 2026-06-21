-- ============================================================================
--  Stravwords — choix par document : "Masquer de mon profil public"
-- ----------------------------------------------------------------------------
--  À coller dans Supabase → SQL Editor → Run, APRÈS 01_profiles_public.sql.
--  Idempotent.
--
--  Ajoute un reglage PAR DOCUMENT pour le retirer du profil public, et met a
--  jour la vue public_day_stats pour en tenir compte.
--
--  Deux interrupteurs INDEPENDANTS :
--    - documents.hidden        -> cache le doc de MON dashboard (existant).
--    - documents.public_hidden -> cache le doc des AUTRES (profil public).
--  On peut ainsi masquer un vieux projet de ses propres stats tout en le
--  laissant visible publiquement, ou l'inverse.
--
--  Regle de la vue : un document compte dans le profil public SAUF si
--  public_hidden = true. Le flag `hidden` (dashboard) n'a AUCUN effet ici.
-- ============================================================================


-- 1) Nouvelle colonne : retire ce document du profil public. Faux par defaut
--    (un document est public si le profil l'est, tant qu'on ne le retire pas).
alter table public.documents
  add column if not exists public_hidden boolean not null default false;


-- 2) Vue publique mise a jour : exclut UNIQUEMENT les documents retires du
--    profil public (public_hidden). LEFT JOIN pour rester robuste si une ligne
--    daily_stats n'a pas (encore) de ligne documents correspondante.
drop view if exists public.public_day_stats;
create view public.public_day_stats as
select
  p.username,
  s.day,
  sum(s.productive)::int as productive,
  sum(s.net)::int        as net
from public.daily_stats s
join public.profiles p on p.user_id = s.user_id
left join public.documents d on d.user_id = s.user_id and d.doc_id = s.doc_id
where p.is_public = true
  and coalesce(d.public_hidden, false) = false
group by p.username, s.day;

grant select on public.public_day_stats to anon, authenticated;
