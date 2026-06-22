import { useState } from "react";
import { usePage } from "./Layout";
import {
  DocModel,
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
  etaText,
  deadlineLine,
  activeDocs,
  streakNow,
  recordStreak,
  qWritten,
  qPalier,
  qGoal,
} from "../lib/data";
import {
  PeriodCard,
  PeriodBadges,
  StreakCard,
  Donut,
  Chart14,
  BadgeCalendar,
} from "./cards";

/* ---------- carte projet (donut) — calcule cote prive puis rend le Donut partage ---------- */
function ProjectCard({ models, sel }: { models: DocModel[]; sel: Sel }) {
  const cur = projectLength(models, sel);
  const tgt = targetTotal(models, sel);
  const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
  const speed = netSpeed30(models, sel);
  const doc = sel === "all" ? null : models.find((d) => d.id === sel);
  return (
    <Donut
      title={sel === "all" ? "Projet — tous docs" : "Projet — total"}
      pct={pct}
      cur={cur}
      tgt={tgt}
      etaTxt={etaText(cur, tgt, speed)}
      deadlineLine={deadlineLine(doc?.deadline, cur, tgt, speed)}
    />
  );
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
            <select className="mini" value={recentN} onChange={(e) => setRecentN(+e.target.value)}>
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
        <StreakCard
          icon="🔥"
          color="var(--coral)"
          label="Série — jour écrit"
          value={streakNow(models, sel, qWritten)}
          record={recordStreak(models, sel, allKeys, qWritten)}
        />
        <StreakCard
          icon="🎖️"
          color="var(--amber)"
          label="Série — au moins un palier"
          value={streakNow(models, sel, qPalier)}
          record={recordStreak(models, sel, allKeys, qPalier)}
        />
        <StreakCard
          icon="🎯"
          color="var(--accent)"
          label="Série — objectif atteint"
          value={streakNow(models, sel, qGoal)}
          record={recordStreak(models, sel, allKeys, qGoal)}
        />
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
