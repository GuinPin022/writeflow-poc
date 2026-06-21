-- ============================================================================
--  Stravwords — Etape B : vue publique PAR DOCUMENT
-- ----------------------------------------------------------------------------
--  À coller dans Supabase → SQL Editor → Run, APRÈS 02_public_hidden.sql.
--  Idempotent.
--
--  Idee : on partage TOUJOURS un seul lien (/u/<pseudo>). Si l'auteur l'autorise,
--  sa page publique propose un selecteur permettant au visiteur de voir un
--  document precis. Un document n'apparait individuellement que s'il a un
--  TITRE PUBLIC (opt-in) et n'est pas masque du profil public.
-- ============================================================================


-- 1) Autorisation au niveau du PROFIL : afficher (ou non) la vue par document
--    sur la page publique. Faux par defaut (opt-in).
alter table public.profiles
  add column if not exists allow_doc_view boolean not null default false;


-- 2) TITRE PUBLIC par document. NULL/vide = document non nomme => jamais liste
--    individuellement en public (mais toujours compte dans l'agregat "Tous").
alter table public.documents
  add column if not exists public_title text;


-- 3) Vue : stats par JOUR et par DOCUMENT, exposees publiquement UNIQUEMENT si
--      - le profil est public           (profiles.is_public)
--      - la vue par document est permise (profiles.allow_doc_view)
--      - le document n'est pas masque    (documents.public_hidden = false)
--      - le document a un titre public   (documents.public_title non vide)
--    daily_stats a une ligne unique par (user, doc, jour) : pas d'agregation ici.
drop view if exists public.public_doc_day_stats;
create view public.public_doc_day_stats as
select
  p.username,
  s.doc_id,
  d.public_title,
  s.day,
  s.productive::int as productive,
  s.net::int        as net
from public.daily_stats s
join public.profiles p on p.user_id = s.user_id
join public.documents d on d.user_id = s.user_id and d.doc_id = s.doc_id
where p.is_public = true
  and p.allow_doc_view = true
  and coalesce(d.public_hidden, false) = false
  and d.public_title is not null
  and length(trim(d.public_title)) > 0;

grant select on public.public_doc_day_stats to anon, authenticated;
