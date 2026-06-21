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

export interface Profile {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  is_public: boolean;
  show_excerpts: boolean;
  allow_doc_view: boolean; // autorise la vue par document sur la page publique
}

const PROFILE_COLS =
  "user_id, username, display_name, bio, is_public, show_excerpts, allow_doc_view";

/** Charge MON profil (ou null si je n'en ai pas encore cree un). */
export async function loadMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export interface ProfilePatch {
  username: string;
  display_name: string | null;
  bio: string | null;
  is_public: boolean;
  allow_doc_view: boolean;
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
  return (data as Profile) ?? null;
}

export interface PublicDay {
  day: string; // AAAA-MM-JJ
  productive: number; // mots productifs (effort)
  net: number; // variation Word
}

/** Charge la serie de jours (agreges) d'un profil public, via la vue securisee. */
export async function loadPublicDays(username: string): Promise<PublicDay[]> {
  const { data, error } = await supabase
    .from("public_day_stats")
    .select("day, productive, net")
    .eq("username", username);
  if (error) throw error;
  return (data as PublicDay[]) ?? [];
}

export interface PublicDocDay {
  doc_id: string;
  public_title: string;
  day: string;
  productive: number;
  net: number;
}

/**
 * Charge les stats par JOUR et par DOCUMENT d'un profil public, via la vue
 * public_doc_day_stats. Ne renvoie des lignes que si l'auteur a autorise la vue
 * par document ET que le document a un titre public (sinon vide).
 */
export async function loadPublicDocDays(username: string): Promise<PublicDocDay[]> {
  const { data, error } = await supabase
    .from("public_doc_day_stats")
    .select("doc_id, public_title, day, productive, net")
    .eq("username", username);
  if (error) throw error;
  return (data as PublicDocDay[]) ?? [];
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
