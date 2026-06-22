-- ============================================================================
--  Stravwords — Etape B2 : statistiques visibles publiquement (preferences)
-- ----------------------------------------------------------------------------
--  À coller dans Supabase → SQL Editor → Run, APRÈS 04_user_settings.sql.
--  Idempotent.
--
--  Ajoute UN seul champ : profiles.public_prefs (JSONB). Il stocke quels blocs
--  l'auteur accepte de montrer sur sa page publique :
--    - blocs d'EFFORT (deja publics) : on/off purement cote affichage ;
--    - blocs OBJECTIFS / PALIERS / DONUT : ces flags servent AUSSI de barriere
--      de securite cote base — les vues publiques (etapes B2-b/c) ne laisseront
--      sortir objectifs/cible/echeance QUE si le flag correspondant est true.
--
--  Forme du JSON (cles absentes = valeur par defaut cote app) :
--    {
--      "effortStreak": true, "effortWeek": true,
--      "effortBest": true,   "effortChart": true,
--      "goals": false, "paliers": false,
--      "donut": "hidden"          -- "hidden" | "percent" | "full"
--    }
-- ============================================================================

alter table public.profiles
  add column if not exists public_prefs jsonb not null default '{}'::jsonb;
