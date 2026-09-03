// Composants de cartes PARTAGES entre la Vue d'ensemble privee (Overview) et la
// page de profil public (PublicProfile), pour ne pas maintenir deux fois la meme
// chose. Tout est pilote par des DocModel[] + un `sel` ("all" ou un doc.id), donc
// les calculs partages de lib/data.ts s'appliquent tels quels.
//
// La page publique passe un `mode` aux cartes qui peuvent contenir un objectif :
//   - "words" : mots ecrits seuls (effort) ;
//   - "full"  : mots + objectif + restant (+ productif + badges).
// Cote prive, le mode est toujours "full".

import { ReactNode } from "react";
import { Tier } from "../lib/paliers";
import {
  DocModel,
  Sel,
  DeadlineLine,
  fmt,
  dkey,
  parseKey,
  lastDaysKeys,
  aggDay,
  dayAgg,
  activeDocs,
  badgeForDoc,
  bestBadgeOfDoc,
  bestBadgeAggDay,
} from "../lib/data";

export type CardMode = "words" | "full";

/* ---------- badges ---------- */
function Chip({ b, title }: { b: Tier; title: string }) {
  return (
    <span className="bd-chip" title={`${title} — ${b.n}`}>
      {b.e}
    </span>
  );
}
function Blank() {
  return (
    <span className="bd-chip empty" title="aucun palier">
      ·
    </span>
  );
}

/** Badges d'une carte periode (par-jour si 1 doc, meilleur par doc si "Tous"). */
export function PeriodBadges({
  models,
  sel,
  keys,
  single,
}: {
  models: DocModel[];
  sel: Sel;
  keys: string[];
  single?: boolean;
}): ReactNode {
  if (sel === "all") {
    return (
      <div className="bd-row">
        {activeDocs(models, sel).map((d) => {
          const b = bestBadgeOfDoc(d, keys);
          return b ? <Chip key={d.id} b={b} title={d.name} /> : <Blank key={d.id} />;
        })}
      </div>
    );
  }
  const doc = models.find((d) => d.id === sel)!;
  if (single) {
    const b = badgeForDoc(doc, keys[0]);
    return b ? (
      <div className="bd-today">
        <span className="bd-e">{b.e}</span>
        <span className="bd-n" title={b.n}>
          {b.n}
        </span>
      </div>
    ) : null;
  }
  return (
    <div className="bd-row">
      {keys
        .slice()
        .reverse()
        .map((k) => {
          const b = badgeForDoc(doc, k);
          return b ? (
            <Chip key={k} b={b} title={parseKey(k).toLocaleDateString("fr-FR")} />
          ) : (
            <Blank key={k} />
          );
        })}
    </div>
  );
}

/* ---------- carte periode (reference = Word) ---------- */
export function PeriodCard({
  title,
  meta,
  word,
  goal,
  prod,
  badges,
  mode = "full",
  className,
}: {
  title: string;
  meta?: ReactNode;
  word: number;
  goal: number;
  prod: number;
  badges?: ReactNode;
  mode?: CardMode;
  className?: string;
}) {
  // Mode "words" (public) : on ne montre QUE les mots ecrits (effort), aucun objectif.
  if (mode === "words") {
    return (
      <div className={"card period" + (className ? " " + className : "")}>
        <h2>
          {title}
          {meta}
        </h2>
        <div className="top">
          <span className="big w" style={{ color: "var(--blue)" }}>
            {word >= 0 ? "+" : ""}
            {fmt(word)}
          </span>
          <span className="goal">mots Word</span>
        </div>
      </div>
    );
  }

  const pct = goal > 0 ? Math.round((word / goal) * 100) : 0;
  const shown = Math.min(100, Math.max(0, pct));
  const rest = Math.max(0, goal - word);
  const done = word >= goal && goal > 0;
  return (
    <div className={"card period" + (className ? " " + className : "")}>
      <h2>
        {title}
        {meta}
        <span className="pct">{pct}%</span>
      </h2>
      <div className="top">
        <span className="big w" style={{ color: "var(--blue)" }}>
          {fmt(word)}
        </span>
        <span className="goal">/ {fmt(goal)} mots Word</span>
      </div>
      <div className="track">
        <div className={"fill" + (done ? " done" : "")} style={{ width: shown + "%" }} />
      </div>
      <div className="rest">{done ? "✓ objectif atteint" : fmt(rest) + " mots Word restants"}</div>
      <div className="split">
        <span className="w">
          Word{" "}
          <b className="w">
            {word >= 0 ? "+" : ""}
            {fmt(word)}
          </b>
        </span>
        <span>
          Productif <b>{fmt(prod)}</b>
        </span>
      </div>
      {badges}
    </div>
  );
}

/* ---------- carte serie (streak) ---------- */
export function StreakCard({
  icon,
  color,
  label,
  value,
  record,
}: {
  icon: string;
  color?: string;
  label: string;
  value: number;
  record: number;
}) {
  return (
    <div className="card stat">
      <div className="lab">
        <i className="ic" style={color ? { color } : undefined}>
          {icon}
        </i>{" "}
        {label}
      </div>
      <div className="num">{value} j</div>
      <div className="sub">record : {record} j</div>
    </div>
  );
}

/* ---------- donut projet (presentation pure) ---------- */
export function Donut({
  title,
  pct,
  cur,
  tgt,
  etaTxt,
  deadlineLine,
}: {
  title: string;
  pct: number;
  cur?: number | null; // null/absent => mode "% seul" (pas de chiffres bruts)
  tgt?: number | null;
  etaTxt?: string | null;
  deadlineLine?: DeadlineLine | null;
}) {
  const C = 213.63;
  const off = C * (1 - pct / 100);
  return (
    <div className="card period proj">
      <h2>
        {title}
        <span className="pct">{pct}%</span>
      </h2>
      <div className="donut-wrap">
        <div className="donut">
          <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r="34" fill="none" stroke="var(--soft)" strokeWidth="9" />
            <circle
              cx="42"
              cy="42"
              r="34"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={off}
              transform="rotate(-90 42 42)"
            />
          </svg>
          <div className="donut-c">{pct}%</div>
        </div>
        {cur != null && tgt != null && (
          <div className="donut-meta">
            <div className="big">{fmt(cur)}</div>
            <div className="goal">/ {fmt(tgt)} mots</div>
          </div>
        )}
      </div>
      {etaTxt && <div className="eta">⚑ {etaTxt}</div>}
      {deadlineLine && (
        <div className="eta" style={{ color: deadlineLine.color, fontWeight: 600 }}>
          {deadlineLine.txt}
        </div>
      )}
    </div>
  );
}

/* ---------- graphe 14 jours (barres empilees + ligne objectif optionnelle) ---------- */
export function Chart14({
  models,
  sel,
  showGoal = true,
}: {
  models: DocModel[];
  sel: Sel;
  showGoal?: boolean;
}) {
  const win: string[] = [];
  const dt = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(dt);
    d.setDate(dt.getDate() - i);
    win.push(dkey(d));
  }
  const H = 150;
  const usable = H - 20;
  let mx = 1;
  win.forEach((k) => {
    const c = aggDay(models, sel, k);
    if (c) mx = Math.max(mx, c.prod, Math.max(0, c.net), showGoal ? c.goal : 0);
  });
  const n = win.length;
  const base = H - 14;
  const pts = win
    .map((k, idx) => {
      const c = dayAgg(models, sel, k);
      const x = ((idx + 0.5) / n) * 100;
      const y = base - (c.goal / mx) * usable;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2>
        Activité — 14 derniers jours <span className="meta">Word + Productif empilés</span>
      </h2>
      <div className="chartbox">
        <div className="chart-bars">
          {win.map((k, idx) => {
            const c = dayAgg(models, sel, k);
            const netPos = Math.max(0, c.net);
            const extra = Math.max(0, c.prod - netPos);
            let hNet = Math.round((netPos / mx) * usable);
            const hExtra = Math.round((extra / mx) * usable);
            if (hNet + hExtra < 2) hNet = 2;
            const isToday = idx === win.length - 1;
            const lab = parseKey(k).getDate() + "/" + (parseKey(k).getMonth() + 1);
            return (
              <div className="col" key={k}>
                <div
                  className={"sbar" + (isToday ? " today" : "")}
                  style={{ height: hNet + hExtra }}
                  title={
                    `Word ${c.net >= 0 ? "+" : ""}${fmt(c.net)} · Productif ${fmt(c.prod)}` +
                    (showGoal ? ` · objectif ${fmt(c.goal)}` : "")
                  }
                >
                  <div className="seg seg-extra" style={{ height: hExtra }} />
                  <div className="seg seg-net" style={{ height: hNet }} />
                </div>
                <div className="d">{lab}</div>
              </div>
            );
          })}
        </div>
        {showGoal && (
          <svg className="overlay" preserveAspectRatio="none" viewBox={`0 0 100 ${H}`}>
            <polyline
              points={pts}
              fill="none"
              stroke="var(--amber)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="4 3"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div className="chips">
        <span>
          <i style={{ background: "var(--blue)" }} />
          Word / net (bas)
        </span>
        <span>
          <i style={{ background: "var(--cal2)" }} />
          Productif en plus (haut)
        </span>
        {showGoal && (
          <span>
            <i className="ld" />
            Objectif quotidien
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- calendrier 30 jours des paliers ---------- */
export function BadgeCalendar({ models, sel }: { models: DocModel[]; sel: Sel }) {
  const days = lastDaysKeys(30).reverse();
  return (
    <div className="card">
      <h2>
        Paliers — 30 derniers jours <span className="meta">badge obtenu chaque jour</span>
      </h2>
      <div className="badge-cal">
        {days.map((k) => {
          const b =
            sel === "all"
              ? bestBadgeAggDay(models, sel, k)
              : badgeForDoc(models.find((d) => d.id === sel)!, k);
          return (
            <div
              className={"bcell" + (b ? "" : " empty")}
              key={k}
              title={parseKey(k).toLocaleDateString("fr-FR") + (b ? " — " + b.n : " — aucun palier")}
            >
              <div className="be">{b ? b.e : "·"}</div>
              <div className="bn">{parseKey(k).getDate()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
