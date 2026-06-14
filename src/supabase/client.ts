// Couche Supabase de WriteFlow : authentification + remontee des donnees.
//
// Deux roles :
//   1. Auth      -> creation de compte / connexion des testeurs (email + mot de passe).
//   2. syncToday -> envoie (upsert) les chiffres du jour du document courant dans la
//                   table `daily_stats`. Un upsert sur (user_id, doc_id, day) ecrase la
//                   ligne du jour : pas de doublon, on pousse simplement l'etat courant.

import { createClient, Session, SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
import { DailyStore, dateKey } from "../tracking/dailyStore";

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // L'add-in tourne dans une iframe Word : on garde la session en localStorage
    // et on la rafraichit automatiquement.
    persistSession: true,
    autoRefreshToken: true,
  },
});

/* ---------- Authentification ---------- */

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/* ---------- Remontee des donnees ---------- */

/**
 * Pousse les chiffres d'AUJOURD'HUI pour le document courant vers Supabase.
 * Appelee periodiquement (a chaque releve) et au clic "flush".
 *
 * Remarque POC : on synchronise le document actif. Si un testeur ecrit dans
 * plusieurs documents le meme jour, chacun est pousse quand il devient actif.
 */
export async function syncToday(
  daily: DailyStore,
  doc: { id: string; name: string },
  userId: string
): Promise<void> {
  if (!doc.id) return; // pas de document identifie -> rien a remonter

  const data = daily.exportDoc(doc.id);
  const day = dateKey();
  const det = data?.detail[day] ?? { typed: 0, pasted: 0, cut: 0 };

  const row = {
    user_id: userId,
    doc_id: doc.id,
    doc_name: doc.name,
    day,
    productive: data?.daily[day] ?? 0,
    typed: det.typed ?? 0,
    pasted: det.pasted ?? 0,
    cut: det.cut ?? 0,
    net: det.net ?? 0,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("daily_stats")
    .upsert(row, { onConflict: "user_id,doc_id,day" });

  if (error) throw error;
}

/* ---------- Reglages globaux (objectifs + theme) ---------- */

/** Envoie les objectifs (quotidien/hebdo) et le theme vers `user_settings`. */
export async function syncSettings(daily: DailyStore, userId: string): Promise<void> {
  const goals = daily.getGoals();
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      daily_goal: goals.daily,
      weekly_goal: goals.weekly,
      theme: daily.getTheme(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

/** Envoie l'objectif (cible) du document courant vers `documents`. */
export async function syncDocTarget(
  daily: DailyStore,
  doc: { id: string; name: string },
  userId: string
): Promise<void> {
  if (!doc.id) return;
  const { error } = await supabase.from("documents").upsert(
    {
      user_id: userId,
      doc_id: doc.id,
      doc_name: doc.name,
      target: daily.getDocTarget(doc.id),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,doc_id" }
  );
  if (error) throw error;
}

/**
 * Charge depuis le compte les reglages globaux + l'objectif du document courant,
 * et les applique au DailyStore local. Le cloud fait foi pour cet utilisateur.
 * S'il n'y a rien en ligne (premiere connexion), on garde les valeurs locales.
 */
export async function loadAccountData(
  daily: DailyStore,
  doc: { id: string; name: string },
  userId: string
): Promise<void> {
  const { data: s } = await supabase
    .from("user_settings")
    .select("daily_goal, weekly_goal, theme")
    .eq("user_id", userId)
    .maybeSingle();
  if (s) {
    daily.setGoals({ daily: s.daily_goal, weekly: s.weekly_goal });
    if (s.theme) daily.setTheme(s.theme);
  }

  if (doc.id) {
    const { data: d } = await supabase
      .from("documents")
      .select("target")
      .eq("user_id", userId)
      .eq("doc_id", doc.id)
      .maybeSingle();
    if (d) daily.setDocTarget(doc.id, d.target);
  }
}
