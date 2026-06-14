import { DailyStore } from "../tracking/dailyStore";

/* global document, HTMLElement, HTMLInputElement, window */

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface DashboardOpts {
  running: boolean;
  onToggle: () => void;
}

/** Anneau de progression (SVG). */
function ringSvg(fraction: number, big: string, small: string): string {
  const r = 46;
  const c = 2 * Math.PI * r;
  const off = c * (1 - clamp01(fraction));
  return `<svg viewBox="0 0 110 110" class="ring" role="img">
    <circle cx="55" cy="55" r="${r}" class="ring-bg"></circle>
    <circle cx="55" cy="55" r="${r}" class="ring-fg"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 55 55)"></circle>
    <text x="55" y="52" class="ring-big">${big}</text>
    <text x="55" y="72" class="ring-small">${small}</text>
  </svg>`;
}

/** Donut de repartition du jour (tape / colle / coupe). */
function donutSvg(typed: number, pasted: number, cut: number): string {
  const total = typed + pasted + cut;
  const r = 40;
  const c = 2 * Math.PI * r;
  if (total === 0) {
    return `<svg viewBox="0 0 100 100" class="donut">
      <circle cx="50" cy="50" r="${r}" class="donut-empty"></circle>
      <text x="50" y="54" class="donut-c">0</text></svg>`;
  }
  let acc = 0;
  const seg = (val: number, cls: string) => {
    if (val <= 0) return "";
    const len = c * (val / total);
    const dash = `${len.toFixed(1)} ${(c - len).toFixed(1)}`;
    const off = -c * (acc / total);
    acc += val;
    return `<circle cx="50" cy="50" r="${r}" class="${cls}"
      stroke-dasharray="${dash}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 50 50)"></circle>`;
  };
  return `<svg viewBox="0 0 100 100" class="donut">
    ${seg(typed, "seg-typed")}${seg(pasted, "seg-pasted")}${seg(cut, "seg-cut")}
    <text x="50" y="54" class="donut-c">${total}</text></svg>`;
}

function barsHtml(seven: Array<{ key: string; label: string; typed: number }>, dailyGoal: number): string {
  const max = Math.max(dailyGoal, ...seven.map((d) => d.typed), 1);
  return seven
    .map(
      (d) =>
        `<div class="bar" title="${d.key} : ${d.typed} mots">
          <div class="bar-track"><div class="bar-fill" style="height:${((d.typed / max) * 100).toFixed(0)}%"></div></div>
          <span class="bar-lbl">${d.label}</span>
        </div>`
    )
    .join("");
}

/* =================== ONGLET DOCUMENT =================== */
export function renderDocumentView(
  container: HTMLElement,
  store: DailyStore,
  currentDoc?: { id: string; name: string },
  opts?: DashboardOpts
): void {
  const goals = store.getGoals();
  const today = store.getToday();
  const streak = store.streak(goals.daily);
  const seven = store.last7Days();
  const det = store.getTodayDetail();
  const dayFrac = goals.daily > 0 ? today / goals.daily : 0;
  const running = opts?.running ?? false;

  const docId = currentDoc?.id || "";
  const docName = currentDoc?.name || store.getDocName(docId) || "—";
  const docWord = docId ? store.getDocWordCount(docId) : 0; // net, selon Word
  const docVolume = docId ? store.getDocTotalAllTime(docId) : 0; // volume tapé
  const docTarget = docId ? store.getDocTarget(docId) : 0;
  const docFrac = docTarget > 0 ? docWord / docTarget : 0;

  const docBlock = docId
    ? `<div class="doc-block">
         <div class="doc-name" title="${docName}">📄 ${docName}</div>
         <div class="doc-kpis">
           <div><span class="doc-v">${docWord}</span><span class="doc-l">mots (Word)</span></div>
           <div><span class="doc-v">${docVolume}</span><span class="doc-l">produit (volume)</span></div>
         </div>
         <div class="doc-goal">
           <div class="doc-goal-top"><span>Objectif du document</span><span>${docWord} / ${docTarget > 0 ? docTarget : "—"}</span></div>
           <div class="wbar"><div class="wbar-fill" style="width:${(clamp01(docFrac) * 100).toFixed(0)}%"></div></div>
         </div>
       </div>`
    : `<div class="doc-block doc-muted">Active le suivi pour identifier le document ouvert.</div>`;

  container.innerHTML = `
    <div class="dash">
      <div class="dash-toggle">
        <span class="dash-toggle-label">Suivi d'écriture</span>
        <button id="dash-power" class="switch ${running ? "on" : ""}" role="switch" aria-checked="${running}"><span class="knob"></span></button>
        <span class="dash-toggle-state">${running ? "Actif" : "Arrêté"}</span>
      </div>

      ${docBlock}

      <div class="dash-section-label">Aujourd'hui</div>
      <div class="dash-rings">
        <div class="dash-ring-block">
          ${ringSvg(dayFrac, String(today), `/ ${goals.daily}`)}
          <span class="dash-cap">Objectif du jour</span>
        </div>
        <div class="dash-side">
          <div class="kpi"><span class="kpi-v">${streak}</span><span class="kpi-l">série (jours)</span></div>
        </div>
      </div>

      <div class="dash-section-label">7 derniers jours</div>
      <div class="bars">${barsHtml(seven, goals.daily)}</div>

      <div class="dash-section-label">Répartition du jour</div>
      <div class="dash-card">
        ${donutSvg(det.typed, det.pasted, det.cut)}
        <div class="legend">
          <span><i class="dot seg-typed"></i>Tapé ${det.typed}</span>
          <span><i class="dot seg-pasted"></i>Collé ${det.pasted}</span>
          <span><i class="dot seg-cut"></i>Coupé ${det.cut}</span>
        </div>
      </div>
    </div>
  `;

  container.querySelector("#dash-power")?.addEventListener("click", () => opts?.onToggle());
}

/* =================== ONGLET GLOBAL =================== */
export function renderGlobalView(container: HTMLElement, store: DailyStore): void {
  const goals = store.getGoals();
  const todayTotal = store.getToday();
  const todayNet = store.getTodayNet();
  const week = store.getWeekTotal();
  const weekNet = store.getWeekNet();
  const grand = store.grandTotal();
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const cal = store.calendar(12, goals.daily);
  const rec = store.record();
  const avg = store.average();
  const docs = store.countDocs();
  const activeDays = store.countActiveDays();
  const weekFrac = goals.weekly > 0 ? week / goals.weekly : 0;

  const calHtml = cal
    .map(
      (col) =>
        `<div class="cal-col">${col
          .map((cell) => `<span class="cal-cell lvl-${cell.level}" title="${cell.key} : ${cell.typed}"></span>`)
          .join("")}</div>`
    )
    .join("");

  const recSub = rec.typed > 0 ? rec.key : "aucun";

  container.innerHTML = `
    <div class="dash">
      <div class="dash-section-label">Aujourd'hui — tous documents</div>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-v">${todayTotal}</span><span class="kpi-l">volume tapé</span></div>
        <div class="kpi"><span class="kpi-v">${fmt(todayNet)}</span><span class="kpi-l">net (Word)</span></div>
      </div>

      <div class="dash-section-label">Cette semaine</div>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-v">${week}</span><span class="kpi-l">volume tapé</span></div>
        <div class="kpi"><span class="kpi-v">${fmt(weekNet)}</span><span class="kpi-l">net (Word)</span></div>
      </div>

      <div class="week-goal">
        <div class="week-goal-top"><span>Objectif hebdomadaire (volume)</span><span>${week} / ${goals.weekly}</span></div>
        <div class="wbar"><div class="wbar-fill" style="width:${(clamp01(weekFrac) * 100).toFixed(0)}%"></div></div>
      </div>

      <div class="dash-section-label">Cumul</div>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-v">${grand}</span><span class="kpi-l">volume cumulé</span></div>
      </div>

      <div class="dash-section-label">Calendrier (12 semaines)</div>
      <div class="cal">${calHtml}</div>

      <div class="dash-section-label">Statistiques</div>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-v">${rec.typed || 0}</span><span class="kpi-l">record (${recSub})</span></div>
        <div class="kpi"><span class="kpi-v">${avg}</span><span class="kpi-l">moyenne / jour actif</span></div>
      </div>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-v">${docs}</span><span class="kpi-l">documents suivis</span></div>
        <div class="kpi"><span class="kpi-v">${activeDays}</span><span class="kpi-l">jours actifs</span></div>
      </div>
    </div>
  `;
}

/* =================== ONGLET RÉGLAGES =================== */
export function renderSettingsView(
  container: HTMLElement,
  store: DailyStore,
  currentDoc?: { id: string; name: string }
): void {
  const goals = store.getGoals();
  const docId = currentDoc?.id || "";
  const docName = currentDoc?.name || (docId ? store.getDocName(docId) : "") || "aucun document actif";
  const docTarget = docId ? store.getDocTarget(docId) : 0;

  container.innerHTML = `
    <div class="dash">
      <div class="dash-section-label">Objectifs</div>
      <div class="goals">
        <label>Quotidien (mots)<input id="set-daily" type="number" min="0" step="50" value="${goals.daily}"></label>
        <label>Hebdo (mots)<input id="set-weekly" type="number" min="0" step="100" value="${goals.weekly}"></label>
      </div>
      <div class="goals" style="margin-top:8px">
        <label>Cible du document — ${docName}
          <input id="set-doctarget" type="number" min="0" step="1000" value="${docTarget}" ${docId ? "" : "disabled"}>
        </label>
      </div>

      <div class="dash-section-label">Données</div>
      <div class="actions">
        <button id="set-reset" class="danger">Réinitialiser l'historique</button>
      </div>
      <p class="hint">Efface l'historique local de tous les documents et les objectifs. Sans effet sur tes fichiers Word.</p>
    </div>
  `;

  const d = container.querySelector<HTMLInputElement>("#set-daily");
  const w = container.querySelector<HTMLInputElement>("#set-weekly");
  const t = container.querySelector<HTMLInputElement>("#set-doctarget");
  d?.addEventListener("change", () => {
    store.setGoals({ daily: Math.max(0, parseInt(d.value, 10) || 0) });
  });
  w?.addEventListener("change", () => {
    store.setGoals({ weekly: Math.max(0, parseInt(w.value, 10) || 0) });
  });
  t?.addEventListener("change", () => {
    if (docId) store.setDocTarget(docId, Math.max(0, parseInt(t.value, 10) || 0));
  });
  container.querySelector("#set-reset")?.addEventListener("click", () => {
    if (window.confirm("Effacer tout l'historique local et les objectifs ?")) {
      store.clear();
      renderSettingsView(container, store, currentDoc);
    }
  });
}
