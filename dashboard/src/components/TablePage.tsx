import { usePage } from "./Layout";
import {
  fmt,
  parseKey,
  aggDay,
  allDayKeys,
  cumNetMap,
  targetTotal,
  badgeForDoc,
  bestBadgeAggDay,
} from "../lib/data";

function pctClass(p: number): string {
  return p >= 100 ? "ok" : p >= 50 ? "mid" : "low";
}

export default function TablePage() {
  const { models, sel } = usePage();
  const cum = cumNetMap(models, sel);
  const tgt = targetTotal(models, sel);
  const keys = allDayKeys(models, sel).slice(-60); // du plus vieux au plus recent
  const doc = sel === "all" ? null : models.find((d) => d.id === sel)!;

  return (
    <>
      <h1 className="page">Détail par jour</h1>
      <div className="card tablecard">
        <table>
          <thead>
            <tr>
              <th>Jour</th>
              <th>Objectif</th>
              <th>Word</th>
              <th>Productif</th>
              <th>Badge</th>
              <th>Avanc. global</th>
              <th>Avanc. jour</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const c = aggDay(models, sel, k);
              if (!c) return null;
              const glob = tgt > 0 ? Math.round((cum[k] / tgt) * 100) : 0;
              const dayp = c.goal > 0 ? Math.round((c.net / c.goal) * 100) : 0;
              const b = doc ? badgeForDoc(doc, k) : bestBadgeAggDay(models, sel, k);
              return (
                <tr key={k}>
                  <td>
                    {parseKey(k).toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </td>
                  <td>{fmt(c.goal)}</td>
                  <td className="w">
                    {c.net >= 0 ? "+" : ""}
                    {fmt(c.net)}
                  </td>
                  <td>{fmt(c.prod)}</td>
                  <td className="bdg" title={b ? b.n : "aucun palier"}>
                    {b ? b.e : ""}
                  </td>
                  <td>
                    <span className={"tag-pct " + pctClass(glob)}>{glob}%</span>
                  </td>
                  <td>
                    <span className={"tag-pct " + pctClass(dayp)}>{dayp}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
