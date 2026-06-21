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

  // Longueur absolue courante du document (selon Word) -> documents.word_count.
  // Corrige la longueur de projet cote dashboard, qui sinon vaut la somme des net
  // depuis le debut du suivi (donc 0 au depart, meme si le doc avait deja du texte).
  // Upsert partiel : ne touche que word_count/doc_name, laisse objectifs/theme/deadline.
  const wordCount = data?.lastCount;
  if (typeof wordCount === "number") {
    const { error: wErr } = await supabase.from("documents").upsert(
      {
        user_id: userId,
        doc_id: doc.id,
        doc_name: doc.name,
        word_count: wordCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,doc_id" }
    );
    if (wErr) throw wErr;
  }
}

/**
 * Pousse TOUS les jours connus localement pour le document courant (pas seulement
 * aujourd'hui). Sert de rattrapage : si un testeur a ecrit hors-ligne et revient un
 * AUTRE jour, syncToday n'aurait jamais remonte les jours passes. A appeler aux moments
 * "rattrapage" (connexion / demarrage / reconnexion), pas a chaque frappe.
 *
 * Upsert groupe sur la meme cle (user_id, doc_id, day) : idempotent et auto-reparateur,
 * donc sans risque pour les lignes deja en ligne.
 */
export async function syncAll(
  daily: DailyStore,
  doc: { id: string; name: string },
  userId: string
): Promise<void> {
  if (!doc.id) return;

  const data = daily.exportDoc(doc.id);
  if (!data) return;

  // Union des jours presents cote productif ET cote detail.
  const days = new Set<string>([...Object.keys(data.daily), ...Object.keys(data.detail)]);
  if (days.size === 0) return;

  const now = new Date().toISOString();
  const rows = [...days].map((day) => {
    const det = data.detail[day] ?? { typed: 0, pasted: 0, cut: 0 };
    return {
      user_id: userId,
      doc_id: doc.id,
      doc_name: doc.name,
      day,
      productive: data.daily[day] ?? 0,
      typed: det.typed ?? 0,
      pasted: det.pasted ?? 0,
      cut: det.cut ?? 0,
      net: det.net ?? 0,
      updated_at: now,
    };
  });

  const { error } = await supabase
    .from("daily_stats")
    .upsert(rows, { onConflict: "user_id,doc_id,day" });

  if (error) throw error;
}

/* ---------- Reglages PAR DOCUMENT (objectifs + theme) ---------- */

/**
 * Envoie les reglages du document courant (objectifs quotidien/hebdo/total + theme)
 * vers `documents`, et empile le dernier changement d'objectifs dans `goal_history`
 * (append-only, idempotent par date).
 */
export async function syncDocTarget(
  daily: DailyStore,
  doc: { id: string; name: string },
  userId: string
): Promise<void> {
  if (!doc.id) return;
  const g = daily.getDocGoals(doc.id);
  const { error } = await supabase.from("documents").upsert(
    {
      user_id: userId,
      doc_id: doc.id,
      doc_name: doc.name,
      daily_goal: g.daily,
      weekly_goal: g.weekly,
      target: g.target,
      deadline: g.deadline ?? null,
      theme: daily.getDocTheme(doc.id),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,doc_id" }
  );
  if (error) throw error;

  // Historique : on pousse le dernier changement (clé unique user_id+doc_id+changed_at).
  const last = daily.getLastGoalChange(doc.id);
  if (last) {
    const { error: hErr } = await supabase.from("goal_history").upsert(
      {
        user_id: userId,
        doc_id: doc.id,
        doc_name: doc.name,
        daily_goal: last.daily,
        weekly_goal: last.weekly,
        target: last.target,
        changed_at: last.at,
      },
      { onConflict: "user_id,doc_id,changed_at", ignoreDuplicates: true }
    );
    if (hErr) throw hErr;
  }
}

/**
 * Charge depuis le compte les reglages du document courant (objectifs + theme + historique)
 * et les applique au DailyStore local. Le cloud fait foi pour cet utilisateur.
 * S'il n'y a rien en ligne (premiere connexion), on garde les valeurs locales.
 */
export async function loadAccountData(
  daily: DailyStore,
  doc: { id: string; name: string },
  userId: string
): Promise<void> {
  if (doc.id) {
    const { data: d } = await supabase
      .from("documents")
      .select("daily_goal, weekly_goal, target, deadline, theme")
      .eq("user_id", userId)
      .eq("doc_id", doc.id)
      .maybeSingle();
    if (d) {
      daily.setDocGoals(
        doc.id,
        { daily: d.daily_goal, weekly: d.weekly_goal, target: d.target, deadline: d.deadline ?? "" },
        false
      );
      if (d.theme) daily.setDocTheme(doc.id, d.theme);
    }

    // Historique des objectifs : recharge depuis le cloud pour colorer correctement
    // le graphe 7 jours et le calendrier selon l'objectif en vigueur a chaque date.
    const { data: h } = await supabase
      .from("goal_history")
      .select("daily_goal, weekly_goal, target, changed_at")
      .eq("user_id", userId)
      .eq("doc_id", doc.id)
      .order("changed_at", { ascending: true });
    if (h?.length) {
      daily.importGoalHistory(
        doc.id,
        h.map((r) => ({ at: r.changed_at, daily: r.daily_goal, weekly: r.weekly_goal, target: r.target }))
      );
    }
  }
}
