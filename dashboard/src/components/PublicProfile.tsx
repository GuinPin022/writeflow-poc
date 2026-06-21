// Page PUBLIQUE d'un profil : /u/<pseudo> (Stravwords).
// Visible SANS connexion. Affiche les stats agregees, et — si l'auteur l'a
// autorise (allow_doc_view) — un selecteur pour voir un document precis.
//
// On reconstruit des DocModel "synthetiques" a partir des vues publiques, pour
// reutiliser tels quels les calculs partages de lib/data.ts.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { loadPublicProfile, loadPublicDays, loadPublicDocDays } from "../lib/profile";
import {
  DocModel,
  fmt,
  dkey,
  parseKey,
  lastDaysKeys,
  aggDay,
  sumPeriod,
  streakNow,
  recordStreak,
  qWritten,
} from "../lib/data";

type State = "loading" | "missing" | "ok";

interface DocEntry {
  id: string;
  title: string;
  model: DocModel;
}

/** Construit un DocModel synthetique a partir de lignes (jour, prod, net). */
function makeModel(name: string, rows: { day: string; prod: number; net: number }[]): DocModel {
  const m: DocModel = {
    id: "pub",
    name,
    theme: "brume-onde",
    target: 0,
    dailyGoal: 0,
    weeklyGoal: 0,
    hidden: false,
    publicHidden: false,
    isDefault: false,
    days: {},
  };
  for (const r of rows) m.days[r.day] = { prod: r.prod, net: r.net, goal: 0 };
  return m;
}

export default function PublicProfile() {
  const { username } = useParams();
  const [state, setState] = useState<State>("loading");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [aggModel, setAggModel] = useState<DocModel | null>(null);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [sel, setSel] = useState<string>("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!username) {
        setState("missing");
        return;
      }
      const prof = await loadPublicProfile(username);
      if (!alive) return;
      if (!prof || !prof.is_public) {
        setState("missing");
        return;
      }
      setName(prof.display_name || prof.username);
      setBio(prof.bio || "");

      const days = await loadPublicDays(username);
      if (!alive) return;
      setAggModel(makeModel(prof.username, days.map((d) => ({ day: d.day, prod: d.productive, net: d.net }))));

      // Vue par document : seulement si l'auteur l'a autorise (sinon la vue ne renvoie rien).
      if (prof.allow_doc_view) {
        const docDays = await loadPublicDocDays(username);
        if (!alive) return;
        const byDoc = new Map<string, { title: string; rows: { day: string; prod: number; net: number }[] }>();
        for (const r of docDays) {
          let e = byDoc.get(r.doc_id);
          if (!e) {
            e = { title: r.public_title, rows: [] };
            byDoc.set(r.doc_id, e);
          }
          e.rows.push({ day: r.day, prod: r.productive, net: r.net });
        }
        const list: DocEntry[] = [...byDoc.entries()].map(([id, e]) => ({
          id,
          title: e.title,
          model: makeModel(e.title, e.rows),
        }));
        list.sort((a, b) => a.title.localeCompare(b.title));
        setDocs(list);
      }
      setState("ok");
    })().catch(() => {
      if (alive) setState("missing");
    });
    return () => {
      alive = false;
    };
  }, [username]);

  if (state === "loading") return <div className="center-note">Chargement…</div>;
  if (state === "missing")
    return (
      <div className="center-note">
        Ce profil n'existe pas ou n'est pas public.
        <div style={{ marginTop: 12 }}>
          <Link className="btn" to="/">
            Accueil
          </Link>
        </div>
      </div>
    );

  // Modele a afficher selon la selection.
  const selectedModel = sel === "all" ? aggModel : docs.find((d) => d.id === sel)?.model ?? aggModel;
  const models = selectedModel ? [selectedModel] : [];
  const s = "all" as const;

  const allKeys = Object.keys(selectedModel?.days || {}).sort();
  const streak = streakNow(models, s, qWritten);
  const record = recordStreak(models, s, allKeys, qWritten);
  const week = sumPeriod(models, s, lastDaysKeys(7), "net");

  let bestVal = 0;
  let bestKey: string | null = null;
  allKeys.forEach((k) => {
    const c = aggDay(models, s, k);
    if (c && c.net > bestVal) {
      bestVal = c.net;
      bestKey = k;
    }
  });

  // Fenetre 14 jours pour le graphe.
  const win: string[] = [];
  {
    const dt = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(dt);
      d.setDate(dt.getDate() - i);
      win.push(dkey(d));
    }
  }
  let mx = 1;
  win.forEach((k) => {
    const c = aggDay(models, s, k);
    if (c) mx = Math.max(mx, Math.max(0, c.net));
  });

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="logo">{(name[0] || "?").toUpperCase()}</div>
          <div>
            <b>{name}</b>
            <span className="tag">{bio || "Profil Stravwords"}</span>
          </div>
        </div>
      </header>

      {docs.length > 0 && (
        <div className="docbar">
          <label htmlFor="pub-doc">Voir :</label>
          <select id="pub-doc" value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="all">Tous les documents</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid row-3" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <div className="lab">
            <i className="ic" style={{ color: "var(--coral)" }}>
              🔥
            </i>{" "}
            Série en cours
          </div>
          <div className="num">{streak} j</div>
          <div className="sub">record : {record} j</div>
        </div>
        <div className="card stat">
          <div className="lab">
            <i className="ic">▦</i> Cette semaine
          </div>
          <div className="num">{fmt(week)}</div>
          <div className="sub">mots (Word) · 7 derniers jours</div>
        </div>
        <div className="card stat">
          <div className="lab">
            <i className="ic" style={{ color: "var(--purple)" }}>
              ★
            </i>{" "}
            Meilleur jour
          </div>
          <div className="num">{fmt(bestVal)}</div>
          <div className="sub">{bestKey ? parseKey(bestKey).toLocaleDateString("fr-FR") : "—"}</div>
        </div>
      </div>

      <div className="card">
        <h2>
          Activité — 14 derniers jours <span className="meta">mots écrits par jour</span>
        </h2>
        <div className="chartbox">
          <div className="chart-bars">
            {win.map((k) => {
              const c = aggDay(models, s, k);
              const net = c ? Math.max(0, c.net) : 0;
              let h = Math.round((net / mx) * 130);
              if (net > 0 && h < 2) h = 2;
              const isToday = k === win[win.length - 1];
              const lab = parseKey(k).getDate() + "/" + (parseKey(k).getMonth() + 1);
              return (
                <div className="col" key={k}>
                  <div
                    className={"sbar" + (isToday ? " today" : "")}
                    style={{ height: h }}
                    title={`${fmt(net)} mots`}
                  >
                    <div className="seg seg-net" style={{ height: h }} />
                  </div>
                  <div className="d">{lab}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", margin: "18px 0", opacity: 0.6 }}>
        Propulsé par <b>Stravwords</b>
      </div>
    </div>
  );
}
