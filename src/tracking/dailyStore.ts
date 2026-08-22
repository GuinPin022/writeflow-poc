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
// - Objectifs (quotidien / hebdo / total) PAR DOCUMENT, stockes dans chaque doc.
// - Migration : d'anciennes donnees a plat (`writeflow_daily`) sont versees dans un
//   document "(historique)" pour ne rien perdre.
//
// Tout est local et hors-ligne. Par origine : localhost (dev) et github.io (testeurs)
// sont des stockages distincts — normal.

import { DEFAULT_THEME } from "./paliers";

const KEY_V2 = "writeflow_v2";
const KEY_THEME = "writeflow_theme";
const KEY_HIDE_PROD = "writeflow_hide_prod";
const LEGACY_DAILY = "writeflow_daily";
const LEGACY_DETAIL = "writeflow_daily_detail";
export const HISTORIC_DOC = "(historique)";

export interface DayDetail {
  typed: number;
  pasted: number;
  cut: number;
  net?: number; // variation nette (selon Word) du jour, signee
}

export interface DocGoals {
  daily: number; // objectif quotidien (mots productifs)
  weekly: number; // objectif hebdo (mots productifs)
  target: number; // objectif total du document (0 = aucun)
  deadline?: string; // echeance du document (AAAA-MM-JJ), vide/absent = aucune
}

/** Un changement d'objectifs daté (historique append-only). */
export interface GoalChange {
  at: string; // ISO timestamp du changement
  daily: number;
  weekly: number;
  target: number;
}

export const DEFAULT_DOC_GOALS = { daily: 500, weekly: 2500 };

export interface DayCell {
  key: string;
  typed: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface DocData {
  name: string;
  daily: Record<string, number>;
  detail: Record<string, DayDetail>;
  target?: number; // objectif de mots pour le document complet (0 = aucun)
  deadline?: string; // echeance du document (AAAA-MM-JJ), absent = aucune
  dailyGoal?: number; // objectif quotidien du document (mots productifs)
  weeklyGoal?: number; // objectif hebdo du document (mots productifs)
  goalHistory?: GoalChange[]; // historique date des objectifs (croissant par `at`)
  theme?: string; // theme des paliers, propre au document (cle de THEMES)
  lastCount?: number; // dernier nombre de mots connu du document (selon Word)
}

interface State {
  docs: Record<string, DocData>;
}

// Heure de bascule de journee (0 = minuit, defaut). Reglee depuis le compte
// (table user_settings, via le dashboard web). Un mot ecrit AVANT cette heure
// compte sur la veille. Non retroactif : seuls les jours a venir sont decoupes ainsi.
let rolloverHour = 0;

/** Definit l'heure de bascule (0-23). Hors plage -> 0 (minuit). */
export function setRolloverHour(h: number): void {
  rolloverHour = Number.isFinite(h) ? Math.min(23, Math.max(0, Math.trunc(h))) : 0;
}

/** Heure de bascule courante (0-23). */
export function getRolloverHour(): number {
  return rolloverHour;
}

/** Cle de date LOCALE (pas UTC) au format AAAA-MM-JJ, decalee de l'heure de bascule. */
export function dateKey(d: Date = new Date()): string {
  const eff = rolloverHour ? new Date(d.getTime() - rolloverHour * 3_600_000) : d;
  const y = eff.getFullYear();
  const m = String(eff.getMonth() + 1).padStart(2, "0");
  const day = String(eff.getDate()).padStart(2, "0");
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

  /** Mots PRODUCTIFS (toutes additions confondues) -> tableau de bord. */
  addProductive(docId: string, n: number): void {
    if (n <= 0) return;
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    const k = dateKey();
    d.daily[k] = (d.daily[k] || 0) + n;
    this.save(st);
  }

  /** [POC] Addition classee "tapee" (ventilation fine, conservee pour le POC). */
  addTyped(docId: string, n: number): void {
    if (n <= 0) return;
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    this.bump(d, dateKey(), "typed", n);
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

  /** Variation NETTE du jour (selon Word) : signee, peut etre negative. */
  addNet(docId: string, deltaSigned: number): void {
    if (deltaSigned === 0) return;
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    const k = dateKey();
    const det = d.detail[k] || { typed: 0, pasted: 0, cut: 0 };
    det.net = (det.net || 0) + deltaSigned;
    d.detail[k] = det;
    this.save(st);
  }

  /** Memorise le nombre de mots courant du document (selon Word). */
  setDocCount(docId: string, count: number): void {
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    d.lastCount = count;
    this.save(st);
  }

  private bump(d: DocData, k: string, field: "typed" | "pasted" | "cut", n: number): void {
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

  private docData(docId: string): DocData | undefined {
    return this.state().docs[docId];
  }

  /** Mots productifs du document — aujourd'hui. */
  getDocProductiveToday(docId: string): number {
    return this.docData(docId)?.daily[dateKey()] || 0;
  }

  /** Mots productifs du document — 7 derniers jours. */
  getDocProductiveWeek(docId: string): number {
    const d = this.docData(docId);
    if (!d) return 0;
    let s = 0;
    const dt = new Date();
    for (let i = 0; i < 7; i++) {
      s += d.daily[dateKey(dt)] || 0;
      dt.setDate(dt.getDate() - 1);
    }
    return s;
  }

  /** Variation nette (selon Word) du document — aujourd'hui. */
  getDocNetToday(docId: string): number {
    return this.docData(docId)?.detail[dateKey()]?.net || 0;
  }

  /** Variation nette (selon Word) du document — 7 derniers jours. */
  getDocNetWeek(docId: string): number {
    const d = this.docData(docId);
    if (!d) return 0;
    let s = 0;
    const dt = new Date();
    for (let i = 0; i < 7; i++) {
      s += d.detail[dateKey(dt)]?.net || 0;
      dt.setDate(dt.getDate() - 1);
    }
    return s;
  }

  /**
   * 7 derniers jours du document : net (Word) + productif + objectif EN VIGUEUR ce jour-là,
   * du plus ancien au plus recent.
   */
  docLast7(docId: string): Array<{ key: string; label: string; net: number; prod: number; goal: number }> {
    const d = this.docData(docId);
    const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const out: Array<{ key: string; label: string; net: number; prod: number; goal: number }> = [];
    const dt = new Date();
    dt.setDate(dt.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const k = dateKey(dt);
      out.push({
        key: k,
        label: days[dt.getDay()],
        net: d?.detail[k]?.net || 0,
        prod: d?.daily[k] || 0,
        goal: this.goalForDate(docId, k).daily,
      });
      dt.setDate(dt.getDate() + 1);
    }
    return out;
  }

  /**
   * Calendrier du document en LIGNES de semaine (weeks x 7 jours, Lun->Dim).
   * Intensite = productif comparé à l'objectif quotidien EN VIGUEUR à chaque date.
   */
  docCalendarRows(docId: string, weeks: number): DayCell[][] {
    const d = this.docData(docId);
    const end = new Date();
    const dow = (end.getDay() + 6) % 7;
    const monday = new Date(end);
    monday.setDate(end.getDate() - dow);
    const start = new Date(monday);
    start.setDate(monday.getDate() - 7 * (weeks - 1));
    const rows: DayCell[][] = [];
    const cur = new Date(start);
    for (let w = 0; w < weeks; w++) {
      const row: DayCell[] = [];
      for (let day = 0; day < 7; day++) {
        const k = dateKey(cur);
        const typed = d?.daily[k] || 0;
        row.push({ key: k, typed, level: this.level(typed, this.goalForDate(docId, k).daily) });
        cur.setDate(cur.getDate() + 1);
      }
      rows.push(row);
    }
    return rows;
  }

  /** Objectifs du document : quotidien, hebdo (mots productifs) et total. */
  getDocGoals(docId: string): DocGoals {
    const d = this.state().docs[docId];
    return {
      daily: d?.dailyGoal ?? DEFAULT_DOC_GOALS.daily,
      weekly: d?.weeklyGoal ?? DEFAULT_DOC_GOALS.weekly,
      target: d?.target ?? 0,
      deadline: d?.deadline,
    };
  }

  /** Nombre de mots actuel du document (net, selon Word). */
  getDocWordCount(docId: string): number {
    return this.state().docs[docId]?.lastCount || 0;
  }

  /** Variation nette du jour (tous documents, selon Word). */
  getTodayNet(): number {
    const st = this.state();
    const k = dateKey();
    let s = 0;
    for (const doc of Object.values(st.docs)) s += doc.detail[k]?.net || 0;
    return s;
  }

  /** Variation nette des 7 derniers jours (tous documents, selon Word). */
  getWeekNet(): number {
    const st = this.state();
    let s = 0;
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const k = dateKey(d);
      for (const doc of Object.values(st.docs)) s += doc.detail[k]?.net || 0;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }

  /**
   * Met à jour les objectifs du document. `record = false` applique les valeurs SANS
   * historiser (ex : hydratation depuis le cloud, où l'historique est chargé à part).
   */
  setDocGoals(docId: string, g: Partial<DocGoals>, record = true): void {
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    if (typeof g.daily === "number") d.dailyGoal = Math.max(0, g.daily);
    if (typeof g.weekly === "number") d.weeklyGoal = Math.max(0, g.weekly);
    if (typeof g.target === "number") d.target = Math.max(0, g.target);
    // L'echeance est un simple etat courant (pas historise) : "" l'efface.
    if (typeof g.deadline === "string") d.deadline = g.deadline || undefined;
    if (!record) {
      this.save(st);
      return;
    }
    // Historique : on empile un instantané si les valeurs ont changé.
    const snap: GoalChange = {
      at: new Date().toISOString(),
      daily: d.dailyGoal ?? DEFAULT_DOC_GOALS.daily,
      weekly: d.weeklyGoal ?? DEFAULT_DOC_GOALS.weekly,
      target: d.target ?? 0,
    };
    const hist = d.goalHistory ?? (d.goalHistory = []);
    const last = hist[hist.length - 1];
    if (!last || last.daily !== snap.daily || last.weekly !== snap.weekly || last.target !== snap.target) {
      hist.push(snap);
    }
    this.save(st);
  }

  /**
   * Objectifs EN VIGUEUR à une date donnée (AAAA-MM-JJ), d'après l'historique.
   * Renvoie 0 si aucun objectif n'était défini ce jour-là (avant le 1er réglage, ou
   * document sans objectif) : on ne dessine donc pas d'objectif sur un passé qui n'en avait pas.
   * Pour les jours sans activité APRÈS un réglage, le dernier objectif est reporté (escalier).
   */
  goalForDate(docId: string, day: string): DocGoals {
    const hist = this.state().docs[docId]?.goalHistory;
    const ZERO: DocGoals = { daily: 0, weekly: 0, target: 0 };
    // Aucun objectif jamais défini, ou date antérieure au 1er objectif défini -> 0.
    if (!hist || !hist.length || dateKey(new Date(hist[0].at)) > day) return ZERO;
    let chosen = hist[0];
    for (const h of hist) {
      if (dateKey(new Date(h.at)) <= day) chosen = h;
      else break;
    }
    return { daily: chosen.daily, weekly: chosen.weekly, target: chosen.target };
  }

  /** Dernier changement d'objectifs (pour remontée Supabase). */
  getLastGoalChange(docId: string): GoalChange | null {
    const h = this.state().docs[docId]?.goalHistory;
    return h && h.length ? h[h.length - 1] : null;
  }

  /** Fusionne un historique (ex : chargé depuis Supabase), trié et dédupliqué par `at`. */
  importGoalHistory(docId: string, entries: GoalChange[]): void {
    if (!entries.length) return;
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    const seen = new Set<string>();
    d.goalHistory = [...(d.goalHistory ?? []), ...entries]
      .filter((e) => (seen.has(e.at) ? false : (seen.add(e.at), true)))
      .sort((a, b) => a.at.localeCompare(b.at));
    this.save(st);
  }

  // ---------- Theme (PAR DOCUMENT) & maintenance ----------

  /**
   * Theme des paliers gamifies (cle de THEMES) du document.
   * Repli pour les anciens docs : ancien theme global (`writeflow_theme`) puis defaut.
   */
  getDocTheme(docId: string): string {
    const d = this.state().docs[docId];
    if (d?.theme) return d.theme;
    return window.localStorage.getItem(KEY_THEME) || DEFAULT_THEME;
  }

  setDocTheme(docId: string, key: string): void {
    const st = this.state();
    const d = this.ensureDoc(st, docId);
    d.theme = key;
    this.save(st);
  }

  /**
   * Masquer les mots productifs dans les vues Document et Global (preference
   * d'AFFICHAGE seulement : la mesure continue et rien n'est perdu).
   * Globale (pas par document) et locale a cet appareil.
   */
  getHideProductive(): boolean {
    return window.localStorage.getItem(KEY_HIDE_PROD) === "1";
  }

  setHideProductive(hide: boolean): void {
    if (hide) window.localStorage.setItem(KEY_HIDE_PROD, "1");
    else window.localStorage.removeItem(KEY_HIDE_PROD);
  }

  /** Donnees completes d'un document (pour persistance dans les settings du fichier). */
  exportDoc(docId: string): DocData | null {
    return this.state().docs[docId] || null;
  }

  /** Injecte les donnees d'un document (lues depuis les settings du fichier / OneDrive). */
  importDoc(docId: string, data: DocData): void {
    const st = this.state();
    st.docs[docId] = {
      name: data.name || st.docs[docId]?.name || docId,
      daily: data.daily || {},
      detail: data.detail || {},
      target: data.target,
      deadline: data.deadline,
      dailyGoal: data.dailyGoal,
      weeklyGoal: data.weeklyGoal,
      goalHistory: data.goalHistory,
      theme: data.theme,
      lastCount: data.lastCount,
    };
    this.save(st);
  }

  clear(): void {
    window.localStorage.removeItem(KEY_V2);
    window.localStorage.removeItem("writeflow_goals"); // ancien objectif global (supprime)
    window.localStorage.removeItem(LEGACY_DAILY);
    window.localStorage.removeItem(LEGACY_DETAIL);
    // Le theme des paliers est une preference d'affichage : on la conserve.
  }
}
