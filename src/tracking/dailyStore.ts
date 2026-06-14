// Persistance journaliere locale, PAR DOCUMENT, base du tableau de bord.
//
// Cle localStorage `writeflow_v2` :
//   { docs: { "<docId>": { name, daily: {date: tapes}, detail: {date:{typed,pasted,cut}} } } }
//
// - Chaque document est identifie par un GUID (stocke dans les settings du document
//   cote tracker, donc il suit le fichier). `daily` reste le contrat canonique
//   { date: motsTapes }, synchronisable plus tard.
// - Le TOTAL (tous documents) n'est pas stocke : il est calcule par agregation,
//   ce qui evite toute incoherence.
// - Objectifs (globaux) dans `writeflow_goals`.
// - Migration : d'anciennes donnees a plat (`writeflow_daily`) sont versees dans un
//   document "(historique)" pour ne rien perdre.
//
// Tout est local et hors-ligne. Par origine : localhost (dev) et github.io (testeurs)
// sont des stockages distincts — normal.

const KEY_V2 = "writeflow_v2";
const KEY_GOALS = "writeflow_goals";
const LEGACY_DAILY = "writeflow_daily";
const LEGACY_DETAIL = "writeflow_daily_detail";
export const HISTORIC_DOC = "(historique)";

export interface DayDetail {
  typed: number;
  pasted: number;
  cut: number;
}

export interface Goals {
  daily: number;
  weekly: number;
}

export const DEFAULT_GOALS: Goals = { daily: 500, weekly: 2500 };

export interface DayCell {
  key: string;
  typed: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface DocData {
  name: string;
  daily: Record<string, number>;
  detail: Record<string, DayDetail>;
  target?: number; // objectif de mots pour le document complet (0 = aucun)
}

interface State {
  docs: Record<string, DocData>;
}

/** Cle de date LOCALE (pas UTC) au format AAAA-MM-JJ. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readRaw<T>(key: string): Record<string, T> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

export class DailyStore {
  private state(): State {
    try {
      const raw = window.localStorage.getItem(KEY_V2);
      if (raw) return JSON.parse(raw) as State;
    } catch {
      /* ignore, on (re)construit */
    }
    // Premiere lecture : migration eventuelle des anciennes donnees a plat.
    const st: State = { docs: {} };
    const legacyDaily = readRaw<number>(LEGACY_DAILY);
    const legacyDetail = readRaw<DayDetail>(LEGACY_DETAIL);
    if (Object.keys(legacyDaily).length || Object.keys(legacyDetail).length) {
      st.docs[HISTORIC_DOC] = { name: HISTORIC_DOC, daily: legacyDaily, detail: legacyDetail };
    }
    this.save(st);
    return st;
  }

  private save(st: State): void {
    window.localStorage.setItem(KEY_V2, JSON.stringify(st));
  }

  private ensureDoc(st: State, docId: string, name?: string): DocData {
    const d = st.docs[docId] || { name: name || docId, daily: {}, detail: {} };
    if (name) d.name = name;
    st.docs[docId] = d;
    return d;
  }

  /** Declare/actualise un document (appele au demarrage du tracker). */
  registerDoc(docId: string, name: string): void {
    const st = this.state();
    this.ensureDoc(st, docId, name);
    this.save(st);
  }

  addProduction(docId: string, n: number): void {
    if (n <= 0) return;
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    const k = dateKey();
    d.daily[k] = (d.daily[k] || 0) + n;
    this.bump(d, k, "typed", n);
    this.save(st);
  }

  addPasted(docId: string, n: number): void {
    if (n <= 0) return;
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    this.bump(d, dateKey(), "pasted", n);
    this.save(st);
  }

  addCut(docId: string, n: number): void {
    if (n <= 0) return;
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    this.bump(d, dateKey(), "cut", n);
    this.save(st);
  }

  private bump(d: DocData, k: string, field: keyof DayDetail, n: number): void {
    const det = d.detail[k] || { typed: 0, pasted: 0, cut: 0 };
    det[field] += n;
    d.detail[k] = det;
  }

  // ---------- Agregations TOTAL (tous documents) ----------

  private totalDaily(): Record<string, number> {
    const st = this.state();
    const out: Record<string, number> = {};
    for (const doc of Object.values(st.docs)) {
      for (const [k, v] of Object.entries(doc.daily)) out[k] = (out[k] || 0) + v;
    }
    return out;
  }

  getToday(): number {
    return this.totalDaily()[dateKey()] || 0;
  }

  getTodayDetail(): DayDetail {
    const st = this.state();
    const k = dateKey();
    const sum: DayDetail = { typed: 0, pasted: 0, cut: 0 };
    for (const doc of Object.values(st.docs)) {
      const d = doc.detail[k];
      if (d) {
        sum.typed += d.typed;
        sum.pasted += d.pasted;
        sum.cut += d.cut;
      }
    }
    return sum;
  }

  getWeekTotal(): number {
    const map = this.totalDaily();
    let sum = 0;
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      sum += map[dateKey(d)] || 0;
      d.setDate(d.getDate() - 1);
    }
    return sum;
  }

  last7Days(): Array<{ key: string; label: string; typed: number }> {
    const map = this.totalDaily();
    const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const out: Array<{ key: string; label: string; typed: number }> = [];
    const d = new Date();
    d.setDate(d.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const k = dateKey(d);
      out.push({ key: k, label: days[d.getDay()], typed: map[k] || 0 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  streak(dailyGoal: number): number {
    const map = this.totalDaily();
    const d = new Date();
    if ((map[dateKey(d)] || 0) < dailyGoal) d.setDate(d.getDate() - 1);
    let streak = 0;
    while ((map[dateKey(d)] || 0) >= dailyGoal && dailyGoal > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  private level(typed: number, dailyGoal: number): DayCell["level"] {
    if (typed <= 0) return 0;
    const g = dailyGoal > 0 ? dailyGoal : 500;
    if (typed < g * 0.5) return 1;
    if (typed < g) return 2;
    if (typed < g * 2) return 3;
    return 4;
  }

  calendar(weeks: number, dailyGoal: number): DayCell[][] {
    const map = this.totalDaily();
    const end = new Date();
    const dow = (end.getDay() + 6) % 7; // 0 = lundi
    const monday = new Date(end);
    monday.setDate(end.getDate() - dow);
    const start = new Date(monday);
    start.setDate(monday.getDate() - 7 * (weeks - 1));

    const cols: DayCell[][] = [];
    const cur = new Date(start);
    for (let w = 0; w < weeks; w++) {
      const col: DayCell[] = [];
      for (let day = 0; day < 7; day++) {
        const k = dateKey(cur);
        const typed = map[k] || 0;
        col.push({ key: k, typed, level: this.level(typed, dailyGoal) });
        cur.setDate(cur.getDate() + 1);
      }
      cols.push(col);
    }
    return cols;
  }

  record(): { key: string; typed: number } {
    const map = this.totalDaily();
    let best = { key: "", typed: 0 };
    for (const [k, v] of Object.entries(map)) {
      if (v > best.typed) best = { key: k, typed: v };
    }
    return best;
  }

  average(): number {
    const vals = Object.values(this.totalDaily()).filter((v) => v > 0);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  /** Cumul total de mots tapes, tous documents et toutes dates. */
  grandTotal(): number {
    return Object.values(this.totalDaily()).reduce((a, b) => a + b, 0);
  }

  /** Nombre de documents suivis. */
  countDocs(): number {
    return Object.keys(this.state().docs).length;
  }

  /** Nombre de jours avec au moins un mot tape. */
  countActiveDays(): number {
    return Object.values(this.totalDaily()).filter((v) => v > 0).length;
  }

  // ---------- Vue DOCUMENT courant ----------

  getDocName(docId: string): string {
    return this.state().docs[docId]?.name || docId;
  }

  getDocToday(docId: string): number {
    return this.state().docs[docId]?.daily[dateKey()] || 0;
  }

  getDocTotalAllTime(docId: string): number {
    const doc = this.state().docs[docId];
    if (!doc) return 0;
    return Object.values(doc.daily).reduce((a, b) => a + b, 0);
  }

  getDocTarget(docId: string): number {
    return this.state().docs[docId]?.target || 0;
  }

  setDocTarget(docId: string, n: number): void {
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    d.target = Math.max(0, n);
    this.save(st);
  }

  // ---------- Objectifs & maintenance ----------

  getGoals(): Goals {
    const g = readRaw<number>(KEY_GOALS) as unknown as Partial<Goals>;
    return {
      daily: typeof g.daily === "number" ? g.daily : DEFAULT_GOALS.daily,
      weekly: typeof g.weekly === "number" ? g.weekly : DEFAULT_GOALS.weekly,
    };
  }

  setGoals(goals: Partial<Goals>): void {
    window.localStorage.setItem(KEY_GOALS, JSON.stringify({ ...this.getGoals(), ...goals }));
  }

  clear(): void {
    window.localStorage.removeItem(KEY_V2);
    window.localStorage.removeItem(KEY_GOALS);
    window.localStorage.removeItem(LEGACY_DAILY);
    window.localStorage.removeItem(LEGACY_DETAIL);
  }
}
