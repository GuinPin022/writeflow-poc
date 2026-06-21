import { DailyStore, DocGoals } from "../tracking/dailyStore";
import { THEMES, palierTrackerHtml } from "../tracking/paliers";

/* global HTMLElement, HTMLInputElement, HTMLSelectElement, window */

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Nombre de jours (calendaires) d'aujourd'hui jusqu'a la date ISO `AAAA-MM-JJ`. */
function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

/** Ligne « 📅 Échéance : <date> · <jours restants> » pour la vue Document. "" si pas de deadline. */
function deadlineLineHtml(deadline?: string): string {
  if (!deadline) return "";
  const left = daysUntil(deadline);
  const dStr = new Date(deadline + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const when =
    left > 0
      ? `${left} jour${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""}`
      : left === 0
        ? "c'est aujourd'hui"
        : `dépassée de ${-left} jour${-left > 1 ? "s" : ""}`;
  const cls = left < 0 ? "doc-deadline late" : "doc-deadline";
  return `<div class="${cls}">📅 Échéance : ${dStr} · ${when}</div>`;
}

export interface DashboardOpts {
  running: boolean;
  onToggle: () => void;
}

/* =================== ONGLET DOCUMENT =================== */
export function renderDocumentView(
  container: HTMLElement,
  store: DailyStore,
  currentDoc?: { id: string; name: string },
  opts?: DashboardOpts
): void {
  const running = opts?.running ?? false;

  const docId = currentDoc?.id || "";
  const docName = currentDoc?.name || store.getDocName(docId) || "—";
  const g = store.getDocGoals(docId); // objectifs PAR DOCUMENT (quotidien / hebdo / total)
  const docWord = docId ? store.getDocWordCount(docId) : 0; // mots du document selon Word
  const docTarget = g.target;
  const docFrac = docTarget > 0 ? docWord / docTarget : 0;
  const docPct = docTarget > 0 ? Math.round((docWord / docTarget) * 100) : 0;

  const dWord = docId ? store.getDocNetToday(docId) : 0;
  const dProd = docId ? store.getDocProductiveToday(docId) : 0;
  const wWord = docId ? store.getDocNetWeek(docId) : 0;
  const wProd = docId ? store.getDocProductiveWeek(docId) : 0;
  const seven = docId ? store.docLast7(docId) : [];
  const calRowsData = docId ? store.docCalendarRows(docId, 4) : [];

  const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
  const metric = (label: string, v: number, t: number, cls: string) =>
    `<div class="m">
       <div class="m-top"><span class="nm2">${label}</span><span class="vl">${v} / ${t} · ${pct(v, t)}%</span></div>
       <div class="pbar"><i class="${cls}" style="width:${(clamp01(t > 0 ? v / t : 0) * 100).toFixed(0)}%"></i></div>
     </div>`;

  // Graphe 7 jours : empilement net (Word, conservé) + productif en plus.
  // Chaque jour porte sa propre ligne d'objectif (celui en vigueur ce jour-là).
  const scale = Math.max(...seven.map((d) => Math.max(d.prod, d.goal)), 1) * 1.1;
  const chartBars = seven
    .map((d) => {
      const keep = Math.max(d.net, 0);
      const extra = Math.max(d.prod - keep, 0);
      const goalPos = d.goal > 0 ? Math.min(100, (d.goal / scale) * 100) : -1;
      const goalMark =
        goalPos >= 0 ? `<div class="cgoal" style="bottom:${goalPos.toFixed(0)}%"></div>` : "";
      return `<div class="cbar" title="${d.key} — Word ${d.net}, productif ${d.prod}, objectif ${d.goal}">
        ${goalMark}
        <div class="seg-extra" style="height:${((extra / scale) * 100).toFixed(0)}%"></div>
        <div class="seg-keep" style="height:${((keep / scale) * 100).toFixed(0)}%"></div>
        <div class="cbl">${d.label}</div></div>`;
    })
    .join("");

  const calRows = calRowsData
    .map(
      (row) =>
        `<div class="cal-row">${row
          .map((c) => `<span class="cal-cell lvl-${c.level}" title="${c.key} : ${c.typed}"></span>`)
          .join("")}</div>`
    )
    .join("");

  const docBlock = docId
    ? `<div class="doc-block">
         <div class="doc-name" title="${docName}">📄 ${docName}</div>
         <div class="doc-goal-top"><span>Mots du document (Word)</span><span>${docWord} / ${docTarget > 0 ? docTarget : "—"} · ${docPct}%</span></div>
         <div class="wbar"><div class="wbar-fill" style="width:${(clamp01(docFrac) * 100).toFixed(0)}%"></div></div>
         ${deadlineLineHtml(g.deadline)}
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

      ${palierTrackerHtml(dWord, g.daily, store.getDocTheme(docId))}

      <div class="dash-section-label">Aujourd'hui — ce document</div>
      ${metric("Mots Word", dWord, g.daily, "fill-word")}
      ${metric("Mots productifs", dProd, g.daily, "fill-prod")}

      <div class="dash-section-label">7 derniers jours — ce document</div>
      <div class="chart">
        <div class="cbars">${chartBars}</div>
      </div>
      <div class="legend2"><span><i class="dot seg-keep"></i>Mots Word (net)</span><span><i class="dot seg-extra"></i>Productif en plus</span><span><i class="dot dot-goal"></i>Objectif du jour</span></div>

      <div class="dash-section-label">Cette semaine — ce document</div>
      ${metric("Mots Word", wWord, g.weekly, "fill-word")}
      ${metric("Mots productifs", wProd, g.weekly, "fill-prod")}

      <div class="dash-section-label">Calendrier — 4 semaines (ce document)</div>
      <div class="cal-rows">${calRows}</div>
    </div>
  `;

  container.querySelector("#dash-power")?.addEventListener("click", () => opts?.onToggle());
}

/* =================== ONGLET GLOBAL =================== */
export function renderGlobalView(container: HTMLElement, store: DailyStore): void {
  const todayTotal = store.getToday();
  const todayNet = store.getTodayNet();
  const week = store.getWeekTotal();
  const weekNet = store.getWeekNet();
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  // Pas d'objectif global : l'intensité du calendrier utilise une référence par défaut (500/jour).
  const cal = store.calendar(12, 0);
  const rec = store.record();
  const avg = store.average();
  const docs = store.countDocs();
  const activeDays = store.countActiveDays();

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
        <div class="kpi"><span class="kpi-v">${todayTotal}</span><span class="kpi-l">productif</span></div>
        <div class="kpi"><span class="kpi-v">${fmt(todayNet)}</span><span class="kpi-l">net (Word)</span></div>
      </div>

      <div class="dash-section-label">Cette semaine — tous documents</div>
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-v">${week}</span><span class="kpi-l">productif</span></div>
        <div class="kpi"><span class="kpi-v">${fmt(weekNet)}</span><span class="kpi-l">net (Word)</span></div>
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
  currentDoc?: { id: string; name: string },
  onChange?: (kind: "settings" | "docTarget") => void
): void {
  const docId = currentDoc?.id || "";
  const docName = currentDoc?.name || (docId ? store.getDocName(docId) : "") || "aucun document actif";
  const g = store.getDocGoals(docId);
  const dis = docId ? "" : "disabled";

  container.innerHTML = `
    <div class="dash">
      <div class="dash-section-label">Objectifs — ${docName}</div>
      <div class="goals">
        <label>Quotidien (mots)<input id="set-daily" type="number" min="0" step="50" value="${g.daily}" ${dis}></label>
        <label>Hebdo (mots)<input id="set-weekly" type="number" min="0" step="100" value="${g.weekly}" ${dis}></label>
      </div>
      <div class="goals" style="margin-top:8px">
        <label>Total du document (mots)<input id="set-doctarget" type="number" min="0" step="1000" value="${g.target}" ${dis}></label>
      </div>
      <div class="goals" style="margin-top:8px">
        <label>Échéance (deadline)<input id="set-deadline" type="date" value="${g.deadline ?? ""}" ${dis}></label>
      </div>
      ${docId ? "" : `<p class="hint">Active le suivi pour identifier le document et définir ses objectifs.</p>`}

      <div class="dash-section-label">Apparence — ${docName}</div>
      <label class="set-field">Thème des paliers
        <select id="set-theme" class="setting-select" ${dis}>
          ${Object.entries(THEMES)
            .map(
              ([key, t]) =>
                `<option value="${key}" ${key === store.getDocTheme(docId) ? "selected" : ""}>${t.label}</option>`
            )
            .join("")}
        </select>
      </label>
      <p class="hint">Thème propre à ce document. Change les emojis et les noms des paliers dans l'onglet Document.</p>

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
  const commit = (patch: Partial<DocGoals>) => {
    if (!docId) return;
    store.setDocGoals(docId, patch);
    onChange?.("docTarget");
  };
  const dl = container.querySelector<HTMLInputElement>("#set-deadline");
  d?.addEventListener("change", () => commit({ daily: Math.max(0, parseInt(d.value, 10) || 0) }));
  w?.addEventListener("change", () => commit({ weekly: Math.max(0, parseInt(w.value, 10) || 0) }));
  t?.addEventListener("change", () => commit({ target: Math.max(0, parseInt(t.value, 10) || 0) }));
  dl?.addEventListener("change", () => commit({ deadline: dl.value }));
  const theme = container.querySelector<HTMLSelectElement>("#set-theme");
  theme?.addEventListener("change", () => {
    if (!docId) return;
    store.setDocTheme(docId, theme.value);
    onChange?.("docTarget"); // le thème vit désormais dans la table `documents`
  });
  container.querySelector("#set-reset")?.addEventListener("click", () => {
    if (window.confirm("Effacer tout l'historique local et les objectifs ?")) {
      store.clear();
      onChange?.("settings"); // réinitialisation locale : rien à pousser
      renderSettingsView(container, store, currentDoc, onChange);
    }
  });
}

