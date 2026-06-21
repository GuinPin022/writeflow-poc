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
  dailyGoal: number; // objectif quotidien courant (defaut si pas d'historique)
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
      .select("doc_id, doc_name, daily_goal, target, deadline, theme")
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
      d = { id, name: name || id, theme: "brume-onde", target: 0, dailyGoal: 500, days: {} };
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
    d.dailyGoal = Number(r.daily_goal) || 500;
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

/* ===================== Agregation (doc courant ou "Tous") ===================== */
export function activeDocs(models: DocModel[], sel: Sel): DocModel[] {
  return sel === "all" ? models : models.filter((d) => d.id === sel);
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
