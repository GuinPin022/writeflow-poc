import { supabase } from "./supabase";
import { tierIndex, tierAt, Tier } from "./paliers";

/* ===================== Types ===================== */
export interface DayData {
  prod: number; // mots productifs (effort)
  net: number; // variation Word (signee)
  goal: number; // objectif quotidien EN VIGUEUR ce jour-la
}
export interface DocModel {
  id: string;
  name: string;
  theme: string;
  target: number; // cible totale du document (0 = aucune)
  deadline?: string; // echeance du document (AAAA-MM-JJ), absent = aucune
  wordCount?: number; // compte de mots absolu courant (selon Word), absent = inconnu
  dailyGoal: number; // objectif quotidien courant (defaut si pas d'historique)
  weeklyGoal: number; // objectif hebdo courant
  hidden: boolean; // masque : exclu du selecteur et de l'agregat "Tous"
  isDefault: boolean; // document charge par defaut au demarrage du dashboard
  days: Record<string, DayData>;
}
/** "all" = tous les documents agreges ; sinon un doc.id. */
export type Sel = "all" | string;

interface GoalChange {
  at: string;
  daily: number;
}

/* ===================== Dates ===================== */
export function dkey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${da}`;
}
export function parseKey(k: string): Date {
  return new Date(k + "T12:00:00");
}
export function lastDaysKeys(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(dkey(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/* ===================== Chargement Supabase ===================== */
export async function loadModels(userId: string): Promise<DocModel[]> {
  const [statsRes, docsRes, histRes] = await Promise.all([
    supabase
      .from("daily_stats")
      .select("doc_id, doc_name, day, productive, net")
      .eq("user_id", userId),
    supabase
      .from("documents")
      .select(
        "doc_id, doc_name, daily_goal, weekly_goal, target, deadline, word_count, theme, hidden, is_default"
      )
      .eq("user_id", userId),
    supabase
      .from("goal_history")
      .select("doc_id, daily_goal, changed_at")
      .eq("user_id", userId)
      .order("changed_at", { ascending: true }),
  ]);

  if (statsRes.error) throw statsRes.error;
  if (docsRes.error) throw docsRes.error;
  if (histRes.error) throw histRes.error;

  const docs = new Map<string, DocModel>();
  const ensure = (id: string, name?: string): DocModel => {
    let d = docs.get(id);
    if (!d) {
      d = {
        id,
        name: name || id,
        theme: "brume-onde",
        target: 0,
        dailyGoal: 500,
        weeklyGoal: 2500,
        hidden: false,
        isDefault: false,
        days: {},
      };
      docs.set(id, d);
    }
    if (name) d.name = name;
    return d;
  };

  // Reglages par document.
  for (const r of docsRes.data || []) {
    const d = ensure(r.doc_id, r.doc_name);
    d.theme = r.theme || "brume-onde";
    d.target = Number(r.target) || 0;
    d.deadline = r.deadline || undefined;
    d.wordCount = r.word_count != null ? Number(r.word_count) : undefined;
    d.dailyGoal = Number(r.daily_goal) || 500;
    d.weeklyGoal = Number(r.weekly_goal) || 2500;
    d.hidden = !!r.hidden;
    d.isDefault = !!r.is_default;
  }

  // Historique des objectifs, par document (croissant par date).
  const histByDoc = new Map<string, GoalChange[]>();
  for (const r of histRes.data || []) {
    const arr = histByDoc.get(r.doc_id) || [];
    arr.push({ at: r.changed_at, daily: Number(r.daily_goal) || 0 });
    histByDoc.set(r.doc_id, arr);
  }

  // Objectif en vigueur a une date (escalier) ; repli = objectif courant du doc.
  const goalForDay = (docId: string, day: string, fallback: number): number => {
    const hist = histByDoc.get(docId);
    if (!hist || !hist.length) return fallback;
    let chosen = 0;
    let found = false;
    for (const h of hist) {
      if (dkey(new Date(h.at)) <= day) {
        chosen = h.daily;
        found = true;
      } else break;
    }
    return found ? chosen : hist[0].daily || fallback;
  };

  // Stats journalieres.
  for (const r of statsRes.data || []) {
    const d = ensure(r.doc_id, r.doc_name);
    d.days[r.day] = {
      prod: Number(r.productive) || 0,
      net: Number(r.net) || 0,
      goal: goalForDay(r.doc_id, r.day, d.dailyGoal),
    };
  }

  return [...docs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ===================== Ecriture des reglages (Parametres) ===================== */
/** Champs modifiables d'un document depuis la page Parametres. */
export type DocSettingsPatch = Partial<{
  dailyGoal: number;
  weeklyGoal: number;
  target: number;
  deadline: string; // "" = efface l'echeance
  theme: string;
}>;

/**
 * Enregistre les reglages d'un document (objectifs/echeance/theme) cote Supabase.
 * - upsert partiel dans `documents` (ne touche pas word_count) ;
 * - si un objectif (quotidien/hebdo/total) change, empile une entree datee dans
 *   `goal_history`, comme le fait le plugin, pour garder la coloration "objectif
 *   en vigueur" correcte sur les graphes/calendriers.
 */
export async function saveDocSettings(
  userId: string,
  doc: DocModel,
  patch: DocSettingsPatch
): Promise<void> {
  const daily = patch.dailyGoal ?? doc.dailyGoal;
  const weekly = patch.weeklyGoal ?? doc.weeklyGoal;
  const target = patch.target ?? doc.target;
  const deadline = patch.deadline !== undefined ? patch.deadline : doc.deadline;
  const theme = patch.theme ?? doc.theme;
  const now = new Date().toISOString();

  const { error } = await supabase.from("documents").upsert(
    {
      user_id: userId,
      doc_id: doc.id,
      doc_name: doc.name,
      daily_goal: daily,
      weekly_goal: weekly,
      target,
      deadline: deadline || null,
      theme,
      updated_at: now,
    },
    { onConflict: "user_id,doc_id" }
  );
  if (error) throw error;

  const goalChanged =
    patch.dailyGoal !== undefined || patch.weeklyGoal !== undefined || patch.target !== undefined;
  if (goalChanged) {
    const { error: hErr } = await supabase.from("goal_history").upsert(
      {
        user_id: userId,
        doc_id: doc.id,
        doc_name: doc.name,
        daily_goal: daily,
        weekly_goal: weekly,
        target,
        changed_at: now,
      },
      { onConflict: "user_id,doc_id,changed_at", ignoreDuplicates: true }
    );
    if (hErr) throw hErr;
  }
}

/** Masque/affiche un document (upsert partiel, ne touche pas les autres reglages). */
export async function setDocHidden(userId: string, doc: DocModel, hidden: boolean): Promise<void> {
  const { error } = await supabase.from("documents").upsert(
    { user_id: userId, doc_id: doc.id, doc_name: doc.name, hidden, updated_at: new Date().toISOString() },
    { onConflict: "user_id,doc_id" }
  );
  if (error) throw error;
}

/**
 * Definit (ou retire) le document par defaut. Un seul a la fois : on remet d'abord
 * tous les documents de l'utilisateur a false, puis on marque celui choisi.
 */
export async function setDefaultDoc(
  userId: string,
  doc: DocModel,
  makeDefault: boolean
): Promise<void> {
  if (!makeDefault) {
    const { error } = await supabase
      .from("documents")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("doc_id", doc.id);
    if (error) throw error;
    return;
  }
  const { error: e1 } = await supabase
    .from("documents")
    .update({ is_default: false })
    .eq("user_id", userId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("documents").upsert(
    { user_id: userId, doc_id: doc.id, doc_name: doc.name, is_default: true, updated_at: new Date().toISOString() },
    { onConflict: "user_id,doc_id" }
  );
  if (e2) throw e2;
}

/**
 * Supprime DEFINITIVEMENT un document : efface ses lignes dans daily_stats,
 * goal_history et documents. Necessite les policies DELETE (documents + daily_stats ;
 * goal_history est en ALL). Attention : si le fichier Word est rouvert avec le suivi
 * actif, le plugin le re-enregistre et les lignes reviennent.
 */
export async function deleteDoc(userId: string, docId: string): Promise<void> {
  const { error: e1 } = await supabase
    .from("daily_stats")
    .delete()
    .eq("user_id", userId)
    .eq("doc_id", docId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("goal_history")
    .delete()
    .eq("user_id", userId)
    .eq("doc_id", docId);
  if (e2) throw e2;
  const { error: e3 } = await supabase
    .from("documents")
    .delete()
    .eq("user_id", userId)
    .eq("doc_id", docId);
  if (e3) throw e3;
}

/* ===================== Import d'historique (CSV) ===================== */
export interface ImportRow {
  day: string; // AAAA-MM-JJ
  daily: number; // objectif quotidien ce jour-la
  weekly: number; // objectif hebdo ce jour-la
  words: number; // mots ecrits ce jour-la
}

/** Normalise une date "AAAA-MM-JJ" ou "JJ/MM/AAAA" (ou JJ-MM-AAAA) -> "AAAA-MM-JJ". */
function parseImportDate(s: string | undefined): string | null {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * Parse un CSV "date, objectif quotidien, objectif hebdo, mots ecrits".
 * Accepte ',' ou ';' comme separateur, un eventuel en-tete, et les dates
 * AAAA-MM-JJ ou JJ/MM/AAAA. Renvoie les lignes triees par date.
 */
export function parseHistoryCsv(text: string): { rows: ImportRow[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return { rows: [], error: "Fichier vide." };
  const delim = lines[0].includes(";") ? ";" : ",";
  const num = (cell: string | undefined): number => {
    const raw = (cell ?? "").replace(/\s/g, "").replace(",", ".");
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const rows: ImportRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(delim).map((c) => c.trim());
    const day = parseImportDate(cells[0]);
    if (!day) {
      if (i === 0) continue; // ligne d'en-tete : on l'ignore
      return { rows: [], error: `Date invalide à la ligne ${i + 1} : « ${cells[0]} »` };
    }
    rows.push({ day, daily: num(cells[1]), weekly: num(cells[2]), words: num(cells[3]) });
  }
  if (!rows.length) return { rows: [], error: "Aucune ligne de données valide." };
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return { rows };
}

/**
 * Importe un historique pour un document (existant ou nouveau).
 * - daily_stats : un upsert par jour (mots -> net ET productive), en sautant les
 *   jours deja presents (`skipDays`) pour ne pas ecraser un suivi reel ;
 * - goal_history : une entree datee a chaque changement d'objectif (escalier) ;
 * - documents : cree/maj la ligne uniquement pour un nouveau doc (`createDoc`).
 */
export async function importHistory(
  userId: string,
  docId: string,
  docName: string,
  rows: ImportRow[],
  opts: { skipDays?: Set<string>; createDoc?: boolean }
): Promise<{ inserted: number; skipped: number }> {
  const skip = opts.skipDays ?? new Set<string>();
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const now = new Date().toISOString();

  const statRows = sorted
    .filter((r) => r.words > 0 && !skip.has(r.day))
    .map((r) => ({
      user_id: userId,
      doc_id: docId,
      doc_name: docName,
      day: r.day,
      productive: r.words,
      net: r.words,
      typed: 0,
      pasted: 0,
      cut: 0,
      updated_at: now,
    }));
  if (statRows.length) {
    const { error } = await supabase
      .from("daily_stats")
      .upsert(statRows, { onConflict: "user_id,doc_id,day" });
    if (error) throw error;
  }

  const histRows: {
    user_id: string;
    doc_id: string;
    doc_name: string;
    daily_goal: number;
    weekly_goal: number;
    target: number;
    changed_at: string;
  }[] = [];
  let prevD = -1;
  let prevW = -1;
  for (const r of sorted) {
    if (r.daily !== prevD || r.weekly !== prevW) {
      histRows.push({
        user_id: userId,
        doc_id: docId,
        doc_name: docName,
        daily_goal: r.daily,
        weekly_goal: r.weekly,
        target: 0,
        changed_at: new Date(r.day + "T12:00:00").toISOString(),
      });
      prevD = r.daily;
      prevW = r.weekly;
    }
  }
  if (histRows.length) {
    const { error } = await supabase
      .from("goal_history")
      .upsert(histRows, { onConflict: "user_id,doc_id,changed_at", ignoreDuplicates: true });
    if (error) throw error;
  }

  if (opts.createDoc) {
    const last = sorted[sorted.length - 1];
    const { error } = await supabase.from("documents").upsert(
      {
        user_id: userId,
        doc_id: docId,
        doc_name: docName,
        daily_goal: last?.daily || 0,
        weekly_goal: last?.weekly || 0,
        target: 0,
        theme: "brume-onde",
        updated_at: now,
      },
      { onConflict: "user_id,doc_id" }
    );
    if (error) throw error;
  }

  return { inserted: statRows.length, skipped: sorted.length - statRows.length };
}

/* ===================== Agregation (doc courant ou "Tous") ===================== */
/** Docs pris en compte : "Tous" exclut les masques ; un id precis renvoie ce doc. */
export function activeDocs(models: DocModel[], sel: Sel): DocModel[] {
  return sel === "all" ? models.filter((d) => !d.hidden) : models.filter((d) => d.id === sel);
}
export function allDayKeys(models: DocModel[], sel: Sel): string[] {
  const set = new Set<string>();
  activeDocs(models, sel).forEach((d) => Object.keys(d.days).forEach((k) => set.add(k)));
  return [...set].sort();
}
export function aggDay(models: DocModel[], sel: Sel, k: string): DayData | null {
  let p = 0,
    n = 0,
    g = 0,
    any = false;
  activeDocs(models, sel).forEach((d) => {
    const c = d.days[k];
    if (c) {
      p += c.prod;
      n += c.net;
      g += c.goal;
      any = true;
    }
  });
  return any ? { prod: p, net: n, goal: g } : null;
}
export function dayAgg(models: DocModel[], sel: Sel, k: string): DayData {
  return aggDay(models, sel, k) || { prod: 0, net: 0, goal: 0 };
}
export function sumPeriod(models: DocModel[], sel: Sel, keys: string[], f: keyof DayData): number {
  let s = 0;
  keys.forEach((k) => {
    const c = aggDay(models, sel, k);
    if (c) s += c[f];
  });
  return s;
}
export function goalPeriod(models: DocModel[], sel: Sel, keys: string[]): number {
  return sumPeriod(models, sel, keys, "goal");
}
export function targetTotal(models: DocModel[], sel: Sel): number {
  return activeDocs(models, sel).reduce((s, d) => s + d.target, 0);
}
/** Longueur "tracee" = somme des net (baseline = debut du suivi). */
export function currentLength(models: DocModel[], sel: Sel): number {
  let s = 0;
  allDayKeys(models, sel).forEach((k) => {
    const c = aggDay(models, sel, k);
    if (c) s += c.net;
  });
  return s;
}
/**
 * Longueur de projet : compte Word absolu (`word_count`) quand il est connu pour le doc,
 * sinon repli sur la somme des net du doc. Par document, pour gerer le mode "Tous"
 * ou certains docs ont la valeur et d'autres non.
 */
export function projectLength(models: DocModel[], sel: Sel): number {
  return activeDocs(models, sel).reduce((s, d) => {
    if (typeof d.wordCount === "number") return s + d.wordCount;
    let net = 0;
    for (const c of Object.values(d.days)) net += c.net;
    return s + net;
  }, 0);
}
export function cumNetMap(models: DocModel[], sel: Sel): Record<string, number> {
  const out: Record<string, number> = {};
  let run = 0;
  allDayKeys(models, sel).forEach((k) => {
    const c = aggDay(models, sel, k);
    run += c ? c.net : 0;
    out[k] = run;
  });
  return out;
}
export function netSpeed30(models: DocModel[], sel: Sel): number {
  let sum = 0,
    days = 0;
  const dt = new Date();
  for (let i = 0; i < 30; i++) {
    const c = aggDay(models, sel, dkey(dt));
    if (c) {
      sum += c.net;
      if (c.net > 0) days++;
    }
    dt.setDate(dt.getDate() - 1);
  }
  return days ? sum / days : 0;
}

/* ===================== Paliers ===================== */
export function badgeForDoc(doc: DocModel, k: string): Tier | null {
  const c = doc.days[k];
  if (!c) return null;
  const idx = tierIndex(c.net, c.goal);
  return idx < 0 ? null : tierAt(doc.theme, idx);
}
export function bestBadgeOfDoc(doc: DocModel, keys: string[]): Tier | null {
  let best = -1;
  keys.forEach((k) => {
    const c = doc.days[k];
    if (c) {
      const idx = tierIndex(c.net, c.goal);
      if (idx > best) best = idx;
    }
  });
  return best < 0 ? null : tierAt(doc.theme, best);
}
/** Meilleur palier tous documents actifs confondus, pour une date. */
export function bestBadgeAggDay(models: DocModel[], sel: Sel, k: string): Tier | null {
  let best = -1;
  let theme = "brume-onde";
  activeDocs(models, sel).forEach((d) => {
    const c = d.days[k];
    if (c) {
      const idx = tierIndex(c.net, c.goal);
      if (idx > best) {
        best = idx;
        theme = d.theme;
      }
    }
  });
  return best < 0 ? null : tierAt(theme, best);
}

export function fmt(n: number): string {
  return (Math.round(n) || 0).toLocaleString("fr-FR");
}
