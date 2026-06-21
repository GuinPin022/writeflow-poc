import { useState, ReactNode } from "react";
import { usePage } from "./Layout";
import { Tier, tierIndex } from "../lib/paliers";
import {
  DocModel,
  DayData,
  Sel,
  fmt,
  dkey,
  parseKey,
  lastDaysKeys,
  aggDay,
  dayAgg,
  sumPeriod,
  goalPeriod,
  targetTotal,
  projectLength,
  netSpeed30,
  activeDocs,
  badgeForDoc,
  bestBadgeOfDoc,
  bestBadgeAggDay,
} from "../lib/data";

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
function PeriodBadges({
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
        <span className="bd-n">{b.n}</span>
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
function PeriodCard({
  title,
  meta,
  word,
  goal,
  prod,
  badges,
  className,
}: {
  title: string;
  meta?: ReactNode;
  word: number;
  goal: number;
  prod: number;
  badges?: ReactNode;
  className?: string;
}) {
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

/* ---------- carte projet (donut) ---------- */
function ProjectCard({ models, sel }: { models: DocModel[]; sel: Sel }) {
  const cur = projectLength(models, sel);
  const tgt = targetTotal(models, sel);
  const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
  const speed = netSpeed30(models, sel);
  const C = 213.63;
  const off = C * (1 - pct / 100);
  const eta =
    cur >= tgt && tgt > 0
      ? "objectif atteint ✓"
      : speed > 0 && tgt > 0
        ? `ETA : ~${Math.ceil((tgt - cur) / speed)} j (≈ ${fmt(speed)} net/j)`
        : "rythme insuffisant pour estimer";

  // Échéance "intelligente" : visible seulement pour UN document (pas en mode "Tous").
  const doc = sel === "all" ? null : models.find((d) => d.id === sel);
  const deadlineLine = (() => {
    if (!doc?.deadline || tgt <= 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dd = new Date(doc.deadline + "T00:00:00");
    const daysLeft = Math.ceil((dd.getTime() - today.getTime()) / 86_400_000);
    const dStr = dd.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const remaining = Math.max(0, tgt - cur);
    if (cur >= tgt) {
      return { txt: `📅 ${dStr} — objectif déjà atteint ✓`, color: "var(--accent)" };
    }
    if (daysLeft <= 0) {
      return { txt: `📅 Échéance dépassée (${dStr}) · ${fmt(remaining)} mots restants`, color: "#e2554f" };
    }
    const need = remaining / daysLeft; // mots/jour requis pour tenir
    const onTrack = speed >= need;
    return {
      txt: `📅 ${dStr} · ${daysLeft} j · requis ${fmt(need)}/j ${
        onTrack ? "✅ dans les temps" : "⚠️ en retard"
      }`,
      color: onTrack ? "var(--accent)" : "#e2554f",
    };
  })();
  return (
    <div className="card period proj">
      <h2>
        {sel === "all" ? "Projet — tous docs" : "Projet — total"}
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
        <div className="donut-meta">
          <div className="big">{fmt(cur)}</div>
          <div className="goal">/ {fmt(tgt)} mots</div>
        </div>
      </div>
      <div className="eta">⚑ {eta}</div>
      {deadlineLine && (
        <div className="eta" style={{ color: deadlineLine.color, fontWeight: 600 }}>
          {deadlineLine.txt}
        </div>
      )}
    </div>
  );
}

/* ---------- graph 14 jours (barres empilees + ligne objectif) ---------- */
function Chart14({ models, sel }: { models: DocModel[]; sel: Sel }) {
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
    if (c) mx = Math.max(mx, c.prod, Math.max(0, c.net), c.goal);
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
                  title={`Word ${c.net >= 0 ? "+" : ""}${fmt(c.net)} · Productif ${fmt(
                    c.prod
                  )} · objectif ${fmt(c.goal)}`}
                >
                  <div className="seg seg-extra" style={{ height: hExtra }} />
                  <div className="seg seg-net" style={{ height: hNet }} />
                </div>
                <div className="d">{lab}</div>
              </div>
            );
          })}
        </div>
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
        <span>
          <i className="ld" />
          Objectif quotidien
        </span>
      </div>
    </div>
  );
}

/* ---------- calendrier 30 jours des paliers ---------- */
function BadgeCalendar({ models, sel }: { models: DocModel[]; sel: Sel }) {
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

/* ---------- mini stats ---------- */
// Un critere decide si un jour "compte" pour une serie.
type DayQualifier = (c: DayData) => boolean;
const qWritten: DayQualifier = (c) => c.prod > 0; // a ecrit quelque chose
const qPalier: DayQualifier = (c) => tierIndex(c.net, c.goal) >= 0; // >= 1er palier (25 %)
const qGoal: DayQualifier = (c) => c.goal > 0 && c.net >= c.goal; // objectif quotidien atteint

/** Serie en cours : jours consecutifs (depuis aujourd'hui) qui remplissent le critere. */
function streakNow(models: DocModel[], sel: Sel, q: DayQualifier): number {
  let s = 0;
  const dt = new Date();
  const today = aggDay(models, sel, dkey(dt));
  // Aujourd'hui en cours : s'il ne compte pas encore, on ne casse pas la serie.
  if (!(today && q(today))) dt.setDate(dt.getDate() - 1);
  for (;;) {
    const c = aggDay(models, sel, dkey(dt));
    if (c && q(c)) {
      s++;
      dt.setDate(dt.getDate() - 1);
    } else break;
  }
  return s;
}

/** Record : plus longue serie de jours calendaires consecutifs remplissant le critere. */
function recordStreak(models: DocModel[], sel: Sel, keys: string[], q: DayQualifier): number {
  let best = 0,
    cur = 0;
  let prev: string | null = null;
  for (const k of keys) {
    const c = dayAgg(models, sel, k);
    if (!q(c)) {
      cur = 0;
      prev = k;
      continue;
    }
    if (prev !== null) {
      const gap = (parseKey(k).getTime() - parseKey(prev).getTime()) / 86400000;
      cur = gap === 1 ? cur + 1 : 1;
    } else cur = 1;
    if (cur > best) best = cur;
    prev = k;
  }
  return best;
}

/* ===================== Page ===================== */
export default function Overview() {
  const { models, sel } = usePage();
  const [recentN, setRecentN] = useState(3);

  const kT = dkey(new Date());
  const today = dayAgg(models, sel, kT);
  const ks = lastDaysKeys(recentN);
  const kw = lastDaysKeys(7);

  const allKeys: string[] = [];
  {
    const set = new Set<string>();
    activeDocs(models, sel).forEach((d) => Object.keys(d.days).forEach((k) => set.add(k)));
    allKeys.push(...[...set].sort());
  }
  // Moyenne + meilleur jour basés sur le NET (Word). Moyenne = net moyen sur les jours
  // écrits (productif > 0) ; meilleur jour = plus gros net.
  let avgSum = 0,
    avgCnt = 0,
    bestVal = 0,
    bestKey: string | null = null;
  allKeys.forEach((k) => {
    const c = aggDay(models, sel, k);
    if (c && c.prod > 0) {
      avgSum += c.net;
      avgCnt++;
    }
    if (c && c.net > bestVal) {
      bestVal = c.net;
      bestKey = k;
    }
  });

  return (
    <>
      <div className="grid row-4" style={{ marginBottom: 14 }}>
        <PeriodCard
          title="Aujourd'hui"
          word={today.net}
          goal={today.goal}
          prod={today.prod}
          badges={<PeriodBadges models={models} sel={sel} keys={[kT]} single />}
        />
        <PeriodCard
          title="Derniers"
          meta={
            <select
              className="mini"
              value={recentN}
              onChange={(e) => setRecentN(+e.target.value)}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} j
                </option>
              ))}
            </select>
          }
          word={sumPeriod(models, sel, ks, "net")}
          goal={goalPeriod(models, sel, ks)}
          prod={sumPeriod(models, sel, ks, "prod")}
          badges={<PeriodBadges models={models} sel={sel} keys={ks} />}
        />
        <PeriodCard
          title="Cette semaine"
          word={sumPeriod(models, sel, kw, "net")}
          goal={goalPeriod(models, sel, kw)}
          prod={sumPeriod(models, sel, kw, "prod")}
          badges={<PeriodBadges models={models} sel={sel} keys={kw} />}
        />
        <ProjectCard models={models} sel={sel} />
      </div>

      <div className="grid row-3" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <div className="lab">
            <i className="ic" style={{ color: "var(--coral)" }}>
              🔥
            </i>{" "}
            Série — jour écrit
          </div>
          <div className="num">{streakNow(models, sel, qWritten)} j</div>
          <div className="sub">record : {recordStreak(models, sel, allKeys, qWritten)} j</div>
        </div>
        <div className="card stat">
          <div className="lab">
            <i className="ic" style={{ color: "var(--amber)" }}>
              🎖️
            </i>{" "}
            Série — au moins un palier
          </div>
          <div className="num">{streakNow(models, sel, qPalier)} j</div>
          <div className="sub">record : {recordStreak(models, sel, allKeys, qPalier)} j</div>
        </div>
        <div className="card stat">
          <div className="lab">
            <i className="ic" style={{ color: "var(--accent)" }}>
              🎯
            </i>{" "}
            Série — objectif atteint
          </div>
          <div className="num">{streakNow(models, sel, qGoal)} j</div>
          <div className="sub">record : {recordStreak(models, sel, allKeys, qGoal)} j</div>
        </div>
      </div>

      <div className="grid row-2" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <div className="lab">
            <i className="ic">▦</i> Moyenne journalière
          </div>
          <div className="num">{fmt(avgCnt ? avgSum / avgCnt : 0)}</div>
          <div className="sub">net (Word) · sur les jours écrits ({avgCnt})</div>
        </div>
        <div className="card stat">
          <div className="lab">
            <i className="ic" style={{ color: "var(--purple)" }}>
              ★
            </i>{" "}
            Meilleur jour
          </div>
          <div className="num">{fmt(bestVal)}</div>
          <div className="sub">
            net (Word) · {bestKey ? parseKey(bestKey).toLocaleDateString("fr-FR") : "—"}
          </div>
        </div>
      </div>

      <Chart14 models={models} sel={sel} />
      <BadgeCalendar models={models} sel={sel} />
    </>
  );
}
