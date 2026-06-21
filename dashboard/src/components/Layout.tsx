import { useState } from "react";
import { NavLink, Outlet, useOutletContext, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { DocModel, Sel } from "../lib/data";

/** Plage de dates (AAAA-MM-JJ) du filtre Tableau ; "" = borne non définie. */
export interface DateRange {
  from: string;
  to: string;
}
interface Ctx {
  models: DocModel[];
  sel: Sel;
  range: DateRange;
}
export function usePage(): Ctx {
  return useOutletContext<Ctx>();
}

export default function Layout({ email, models }: { email: string; models: DocModel[] }) {
  const [sel, setSel] = useState<Sel>(models[0] ? models[0].id : "all");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const onTable = useLocation().pathname === "/table";

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="logo">W</div>
          <div>
            <b>WriteFlow</b>
            <span className="tag">Le suivi de ta production d'écriture</span>
          </div>
        </div>
        <nav className="tabs">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Vue d'ensemble
          </NavLink>
          <NavLink to="/table" className={({ isActive }) => (isActive ? "active" : "")}>
            Tableau
          </NavLink>
        </nav>
        <div className="spacer" />
        <span className="user">
          <span className="av">{(email[0] || "?").toUpperCase()}</span>
          {email}
        </span>
        <button className="btn" onClick={() => supabase.auth.signOut()}>
          Déconnexion
        </button>
      </header>

      <div className="docbar">
        <label htmlFor="doc-sel">Document :</label>
        <select id="doc-sel" value={sel} onChange={(e) => setSel(e.target.value as Sel)}>
          <option value="all">Tous les documents</option>
          {models.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {onTable && (
          <div className="daterange">
            <label htmlFor="d-from">Du</label>
            <input
              id="d-from"
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
            <label htmlFor="d-to">Au</label>
            <input
              id="d-to"
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
            {(range.from || range.to) && (
              <button
                className="btn-clear"
                title="Effacer la période"
                onClick={() => setRange({ from: "", to: "" })}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {models.length === 0 ? (
        <div className="empty-note">
          Aucune donnée pour ce compte. Active le suivi dans l'add-in Word, puis reviens ici.
        </div>
      ) : (
        <Outlet context={{ models, sel, range } satisfies Ctx} />
      )}
    </div>
  );
}
