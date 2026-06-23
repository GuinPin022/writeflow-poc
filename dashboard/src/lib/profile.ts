// Couche d'acces aux PROFILS PUBLICS (Stravwords, Phase 1+2).
//
// Deux usages :
//   - cote connecte : lire/ecrire MON profil (pseudo, nom, bio, public on/off) ;
//   - cote public   : lire le profil + la serie de jours d'un AUTRE utilisateur
//                     (uniquement s'il est public), pour la page /u/<pseudo>.
//
// La securite est cote base : les RLS de `profiles` et le filtre de la vue
// `public_day_stats` ne laissent sortir que les profils rendus publics.

import { supabase } from "./supabase";

/**
 * Etat d'une carte "periode" / du graphe sur la page publique :
 *   - "hidden" : carte masquee ;
 *   - "words"  : mots ecrits seuls (effort, aucun objectif revele) ;
 *   - "full"   : mots + objectif + restant (+ productif/badge selon la carte).
 */
export type CardMode = "hidden" | "words" | "full";

/**
 * Etat tri-state du donut "projet" :
 *   - "hidden"  : pas de donut ;
 *   - "percent" : seulement le pourcentage (sans cible ni echeance — calcule en base) ;
 *   - "full"    : pourcentage + cible (mots) + echeance + ETA.
 */
export type DonutMode = "hidden" | "percent" | "full";

/**
 * Quels blocs l'auteur accepte de montrer sur sa page publique (= sa "Vue
 * d'ensemble" publique, carte par carte). Principe : l'EFFORT (mots ecrits) peut
 * etre montre librement ; l'OBJECTIF (objectif quotidien, cible, echeance) n'est
 * expose que si un bloc "full"/objectif est active — et ce filtre est applique
 * cote BASE (voir prefsShowsDailyGoal + les vues SQL), pas seulement a l'affichage.
 */
export interface PublicPrefs {
  // Cartes periode + graphe (tri-state masque/mots/complet).
  today: CardMode; // Aujourd'hui
  recent: CardMode; // X derniers jours
  recentN: number; // valeur de X (jours), choisie par l'auteur
  week: CardMode; // Cette semaine
  chart: CardMode; // Graphe 14 jours (+ ligne objectif en "full")
  // Donut projet (tri-state masque/% /complet).
  donut: DonutMode;
  // Cartes simples on/off.
  streakWritten: boolean; // 🔥 serie de jours ecrits (effort)
  best: boolean; // ★ meilleur jour (effort)
  streakGoal: boolean; // 🎯 serie d'objectifs atteints (objectif)
  paliers: boolean; // 🎖️ paliers : serie + calendrier 30 j (objectif)
}

// Defauts : effort visible (cartes en "words", series d'effort ON) ; tout ce qui
// touche l'objectif est masque (cartes pas en "full", series objectif/paliers OFF,
// donut masque).
export const DEFAULT_PREFS: PublicPrefs = {
  today: "words",
  recent: "words",
  recentN: 3,
  week: "words",
  chart: "words",
  donut: "hidden",
  streakWritten: true,
  best: true,
  streakGoal: false,
  paliers: false,
};

/** Fusionne le JSON stocke (potentiellement partiel/inconnu) avec les defauts. */
export function parsePrefs(raw: unknown): PublicPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const card = (v: unknown, def: CardMode): CardMode =>
    v === "hidden" || v === "words" || v === "full" ? v : def;
  const donut: DonutMode =
    o.donut === "percent" || o.donut === "full" ? o.donut : "hidden";
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const n = Number(o.recentN);
  return {
    today: card(o.today, DEFAULT_PREFS.today),
    recent: card(o.recent, DEFAULT_PREFS.recent),
    recentN: Number.isFinite(n) ? Math.min(7, Math.max(1, Math.trunc(n))) : DEFAULT_PREFS.recentN,
    week: card(o.week, DEFAULT_PREFS.week),
    chart: card(o.chart, DEFAULT_PREFS.chart),
    donut,
    streakWritten: bool(o.streakWritten, DEFAULT_PREFS.streakWritten),
    best: bool(o.best, DEFAULT_PREFS.best),
    streakGoal: bool(o.streakGoal, DEFAULT_PREFS.streakGoal),
    paliers: bool(o.paliers, DEFAULT_PREFS.paliers),
  };
}

/**
 * Verrou (cote client, miroir de la fonction SQL prefs_shows_daily_goal) : le
 * profil expose-t-il l'objectif quotidien ? Vrai si AU MOINS un bloc a objectif
 * est actif (une carte periode/graphe en "full", la serie objectif, ou paliers).
 * Sert a ne charger la donnee objectif que lorsqu'elle est reellement utilisee.
 */
export function prefsShowsDailyGoal(p: PublicPrefs): boolean {
  return (
    p.today === "full" ||
    p.recent === "full" ||
    p.week === "full" ||
    p.chart === "full" ||
    p.streakGoal ||
    p.paliers
  );
}

/** Liens sociaux + email de contact (tous optionnels). Cles = colonnes `profiles`. */
export interface Socials {
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  wattpad: string | null;
  twitter: string | null;
  tiktok: string | null;
  contact_email: string | null; // email PUBLIC, distinct de l'email de connexion
}
export const SOCIAL_KEYS: (keyof Socials)[] = [
  "website",
  "facebook",
  "instagram",
  "wattpad",
  "twitter",
  "tiktok",
  "contact_email",
];

export interface Profile extends Socials {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  is_public: boolean;
  show_excerpts: boolean;
  allow_doc_view: boolean; // autorise la vue par document sur la page publique
  public_prefs: PublicPrefs; // blocs visibles publiquement (voir PublicPrefs)
}

const PROFILE_COLS =
  "user_id, username, display_name, bio, is_public, show_excerpts, allow_doc_view, public_prefs, website, facebook, instagram, wattpad, twitter, tiktok, contact_email";

/** Convertit une ligne brute Supabase en Profile (normalise public_prefs). */
function rowToProfile(data: Record<string, unknown>): Profile {
  return { ...(data as unknown as Profile), public_prefs: parsePrefs(data.public_prefs) };
}

/** Charge MON profil (ou null si je n'en ai pas encore cree un). */
export async function loadMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data) : null;
}

export interface ProfilePatch extends Socials {
  username: string;
  display_name: string | null;
  bio: string | null;
  is_public: boolean;
  allow_doc_view: boolean;
  public_prefs: PublicPrefs;
}

/**
 * Cree ou met a jour MON profil (upsert sur user_id).
 * Si le pseudo choisi est deja pris par quelqu'un d'autre, Supabase renvoie une
 * erreur de cle unique (code "23505") que l'ecran traduit en message clair.
 */
export async function saveMyProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const { error } = await supabase.from("profiles").upsert(
    { user_id: userId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

/**
 * Charge le profil public d'un pseudo. Renvoie null si le pseudo n'existe pas
 * OU si le profil n'est pas public (les RLS le rendent invisible).
 */
export async function loadPublicProfile(username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data) : null;
}

export interface PublicDay {
  day: string; // AAAA-MM-JJ
  productive: number; // mots productifs (effort)
  net: number; // variation Word
  goal: number | null; // objectif quotidien agrege (null si non expose par le verrou)
}

/**
 * Charge la serie de jours (agreges) d'un profil public, via la vue securisee.
 * `goal` n'est renseigne que si le profil expose l'objectif (verrou cote base) ;
 * sinon il vaut null.
 */
export async function loadPublicDays(username: string): Promise<PublicDay[]> {
  const { data, error } = await supabase
    .from("public_day_stats")
    .select("day, productive, net, goal")
    .eq("username", username);
  if (error) throw error;
  return (data as PublicDay[]) ?? [];
}

export interface PublicDocDay {
  doc_id: string;
  public_title: string;
  public_url: string | null; // lien public de l'ouvrage (null si non renseigne)
  theme: string;
  day: string;
  productive: number;
  net: number;
  goal: number | null; // objectif en vigueur ce jour (null si objectifs/paliers desactives)
}

/**
 * Charge les stats par JOUR et par DOCUMENT d'un profil public, via la vue
 * public_doc_day_stats. Ne renvoie des lignes que si l'auteur a autorise la vue
 * par document ET que le document a un titre public (sinon vide).
 */
export async function loadPublicDocDays(username: string): Promise<PublicDocDay[]> {
  const { data, error } = await supabase
    .from("public_doc_day_stats")
    .select("doc_id, public_title, public_url, theme, day, productive, net, goal")
    .eq("username", username);
  if (error) throw error;
  return (data as PublicDocDay[]) ?? [];
}

export interface PublicProject {
  pct: number | null; // % d'avancement (null = pas de cible => pas de donut)
  cur: number | null; // longueur courante (null hors mode "full")
  tgt: number | null; // cible en mots (null hors mode "full")
  deadline?: string | null; // echeance (par document, mode "full" uniquement)
}

/**
 * Donut AGREGE (tous documents) d'un profil public. Renvoie null si le donut est
 * masque (vue vide). Le % est calcule cote base ; cur/tgt ne sont presents qu'en
 * mode "full".
 */
export async function loadPublicProjectAgg(username: string): Promise<PublicProject | null> {
  const { data, error } = await supabase
    .from("public_project_agg")
    .select("pct, cur, tgt")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as PublicProject) : null;
}

export interface PublicProjectDoc extends PublicProject {
  doc_id: string;
}

/** Donut PAR DOCUMENT d'un profil public (vide si vue par document non autorisee). */
export async function loadPublicProjectDocs(username: string): Promise<PublicProjectDoc[]> {
  const { data, error } = await supabase
    .from("public_project_docs")
    .select("doc_id, pct, cur, tgt, deadline")
    .eq("username", username);
  if (error) throw error;
  return (data as PublicProjectDoc[]) ?? [];
}

export interface PublicProfileSummary {
  username: string;
  display_name: string | null;
  bio: string | null;
}

/**
 * Liste TOUS les profils publics (annuaire). Ne renvoie que les profils
 * is_public = true (garanti par les RLS) : pseudo, nom affiche, bio.
 */
export async function loadPublicProfiles(): Promise<PublicProfileSummary[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name, bio")
    .eq("is_public", true)
    .order("username");
  if (error) throw error;
  return (data as PublicProfileSummary[]) ?? [];
}
