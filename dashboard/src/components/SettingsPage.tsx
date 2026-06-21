import { usePage } from "./Layout";
import { fmt } from "../lib/data";

/** Date AAAA-MM-JJ -> libelle court fr-FR ; "" si absente. */
function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SettingsPage() {
  const { models } = usePage();

  return (
    <>
      <h1 className="page">Paramètres des documents</h1>
      <div className="card tablecard">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Quotidien</th>
              <th>Hebdo</th>
              <th>Total</th>
              <th>Échéance</th>
              <th>Thème</th>
            </tr>
          </thead>
          <tbody>
            {models.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{fmt(d.dailyGoal)}</td>
                <td>{fmt(d.weeklyGoal)}</td>
                <td>{d.target > 0 ? fmt(d.target) : "—"}</td>
                <td>{fmtDate(d.deadline)}</td>
                <td>{d.theme}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {models.length === 0 && <div className="empty-note">Aucun document.</div>}
      </div>
      <p style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
        Édition, document par défaut, masquage, suppression et import historique arriveront dans les
        prochaines étapes.
      </p>
    </>
  );
}
