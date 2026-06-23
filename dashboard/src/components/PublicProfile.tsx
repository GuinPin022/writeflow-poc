// Page PUBLIQUE d'un profil : /u/<pseudo> (Stravwords).
// Visible SANS connexion. C'est la "Vue d'ensemble" de l'auteur, mais composee
// carte par carte selon ses preferences (public_prefs) : chaque carte peut etre
// masquee, montree en "mots" (effort seul) ou "complet" (avec objectif).
//
// On reconstruit des DocModel "synthetiques" a partir des vues publiques, pour
// reutiliser tels quels les composants partages (./cards) et les calculs de
// lib/data.ts — exactement comme la Vue d'ensemble privee.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { IconType } from "react-icons";
import {
  FaGlobe,
  FaEnvelope,
  FaInstagram,
  FaTiktok,
  FaXTwitter,
  FaFacebookF,
} from "react-icons/fa6";
import { SiWattpad } from "react-icons/si";
import {
  loadPublicProfile,
  loadPublicDays,
  loadPublicDocDays,
  loadPublicProjectAgg,
  loadPublicProjectDocs,
  PublicProject,
  PublicPrefs,
  Socials,
  CardMode,
  DEFAULT_PREFS,
} from "../lib/profile";
import {
  DocModel,
  fmt,
  dkey,
  parseKey,
  lastDaysKeys,
  aggDay,
  dayAgg,
  sumPeriod,
  goalPeriod,
  netSpeed30,
  etaText,
  deadlineLine,
  streakNow,
  recordStreak,
  qWritten,
  qGoal,
  qPalier,
} from "../lib/data";
import { DEFAULT_THEME } from "../lib/paliers";
import { PeriodCard, PeriodBadges, StreakCard, Donut, Chart14, BadgeCalendar } from "./cards";

type State = "loading" | "missing" | "ok";

interface DocEntry {
  id: string;
  title: string;
  url: string | null; // lien public de l'ouvrage (null = aucun)
  model: DocModel;
}

/* ---------- Réseaux sociaux : libellé, icône (marque) et construction du lien ---------- */
const SOCIAL_META: Record<keyof Socials, { label: string; Icon: IconType }> = {
  website: { label: "Site internet", Icon: FaGlobe },
  contact_email: { label: "Email", Icon: FaEnvelope },
  instagram: { label: "Instagram", Icon: FaInstagram },
  tiktok: { label: "TikTok", Icon: FaTiktok },
  twitter: { label: "Twitter / X", Icon: FaXTwitter },
  facebook: { label: "Facebook", Icon: FaFacebookF },
  wattpad: { label: "Wattpad", Icon: SiWattpad },
};
const SOCIAL_ORDER: (keyof Socials)[] = [
  "website",
  "instagram",
  "tiktok",
  "twitter",
  "facebook",
  "wattpad",
  "contact_email",
];

/** Construit une URL cliquable depuis une valeur libre (lien complet ou pseudo). */
function socialHref(key: keyof Socials, val: string): string {
  const v = val.trim();
  if (key === "contact_email") return `mailto:${v}`;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  switch (key) {
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "tiktok":
      return `https://tiktok.com/@${handle}`;
    case "twitter":
      return `https://x.com/${handle}`;
    case "facebook":
      return `https://facebook.com/${handle}`;
    case "wattpad":
      return `https://wattpad.com/user/${handle}`;
    default:
      return `https://${v}`;
  }
}

interface Row {
  day: string;
  prod: number;
  net: number;
  goal: number;
}

/** Construit un DocModel synthetique a partir de lignes (jour, prod, net, goal). */
function makeModel(name: string, theme: string, rows: Row[]): DocModel {
  const m: DocModel = {
    id: "pub",
    name,
    theme,
    target: 0,
    dailyGoal: 0,
    weeklyGoal: 0,
    hidden: false,
    publicHidden: false,
    isDefault: false,
    days: {},
  };
  for (const r of rows) m.days[r.day] = { prod: r.prod, net: r.net, goal: r.goal };
  return m;
}

export default function PublicProfile() {
  const { username } = useParams();
  const [state, setState] = useState<State>("loading");
  const [tab, setTab] = useState<"stat" | "profil">("profil");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [socials, setSocials] = useState<Socials | null>(null);
  const [prefs, setPrefs] = useState<PublicPrefs>(DEFAULT_PREFS);
  const [aggModel, setAggModel] = useState<DocModel | null>(null);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [aggProj, setAggProj] = useState<PublicProject | null>(null);
  const [docProj, setDocProj] = useState<Record<string, PublicProject>>({});
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
      setSocials({
        website: prof.website,
        facebook: prof.facebook,
        instagram: prof.instagram,
        wattpad: prof.wattpad,
        twitter: prof.twitter,
        tiktok: prof.tiktok,
        contact_email: prof.contact_email,
      });
      setPrefs(prof.public_prefs);

      const p = prof.public_prefs;
      const wantsDoc = prof.allow_doc_view;
      const wantsDonut = p.donut !== "hidden";

      // Chargements en parallele (selon ce que le profil expose).
      const [days, docDays, projAgg, projDocs] = await Promise.all([
        loadPublicDays(username),
        wantsDoc ? loadPublicDocDays(username) : Promise.resolve([]),
        wantsDonut ? loadPublicProjectAgg(username) : Promise.resolve(null),
        wantsDonut && wantsDoc ? loadPublicProjectDocs(username) : Promise.resolve([]),
      ]);
      if (!alive) return;

      setAggModel(
        makeModel(
          prof.username,
          DEFAULT_THEME,
          days.map((d) => ({ day: d.day, prod: d.productive, net: d.net, goal: d.goal ?? 0 }))
        )
      );

      if (wantsDoc) {
        const byDoc = new Map<string, { title: string; url: string | null; theme: string; rows: Row[] }>();
        for (const r of docDays) {
          let e = byDoc.get(r.doc_id);
          if (!e) {
            e = { title: r.public_title, url: r.public_url, theme: r.theme || DEFAULT_THEME, rows: [] };
            byDoc.set(r.doc_id, e);
          }
          e.rows.push({ day: r.day, prod: r.productive, net: r.net, goal: r.goal ?? 0 });
        }
        const list: DocEntry[] = [...byDoc.entries()].map(([id, e]) => ({
          id,
          title: e.title,
          url: e.url,
          model: makeModel(e.title, e.theme, e.rows),
        }));
        list.sort((a, b) => a.title.localeCompare(b.title));
        setDocs(list);
      }

      setAggProj(projAgg);
      if (projDocs.length) {
        const map: Record<string, PublicProject> = {};
        for (const r of projDocs)
          map[r.doc_id] = { pct: r.pct, cur: r.cur, tgt: r.tgt, deadline: r.deadline };
        setDocProj(map);
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

  // Modele a afficher selon la selection. Toujours via models=[selectedModel], sel="all".
  const selectedModel = sel === "all" ? aggModel : docs.find((d) => d.id === sel)?.model ?? aggModel;
  const models = selectedModel ? [selectedModel] : [];
  const s = "all" as const;
  const allKeys = Object.keys(selectedModel?.days || {}).sort();

  // Cartes periode (today / recent / week) + donut.
  const kT = dkey(new Date());
  const ks = lastDaysKeys(prefs.recentN);
  const kw = lastDaysKeys(7);
  const mode = (m: CardMode): "words" | "full" => (m === "full" ? "full" : "words");

  const periodCard = (key: "today" | "recent" | "week") => {
    const cfg =
      key === "today"
        ? { title: "Aujourd'hui", keys: [kT], single: true }
        : key === "recent"
          ? { title: `${prefs.recentN} derniers jours`, keys: ks, single: false }
          : { title: "Cette semaine", keys: kw, single: false };
    const word = key === "today" ? dayAgg(models, s, kT).net : sumPeriod(models, s, cfg.keys, "net");
    const goal = key === "today" ? dayAgg(models, s, kT).goal : goalPeriod(models, s, cfg.keys);
    const prod = key === "today" ? dayAgg(models, s, kT).prod : sumPeriod(models, s, cfg.keys, "prod");
    return (
      <PeriodCard
        key={key}
        title={cfg.title}
        word={word}
        goal={goal}
        prod={prod}
        mode={mode(prefs[key])}
        badges={<PeriodBadges models={models} sel={s} keys={cfg.keys} single={cfg.single} />}
      />
    );
  };

  // Donut projet (agrege en "Tous", sinon le document selectionne).
  const proj: PublicProject | null = sel === "all" ? aggProj : docProj[sel] ?? null;
  const showDonut = prefs.donut !== "hidden" && proj != null && proj.pct != null;
  const full = showDonut && proj!.cur != null && proj!.tgt != null;
  const projSpeed = full ? netSpeed30(models, s) : 0;

  const topCards = [
    prefs.today !== "hidden" && periodCard("today"),
    prefs.recent !== "hidden" && periodCard("recent"),
    prefs.week !== "hidden" && periodCard("week"),
    showDonut && (
      <Donut
        key="donut"
        title={sel === "all" ? "Projet — tous docs" : "Projet"}
        pct={proj!.pct as number}
        cur={full ? proj!.cur : null}
        tgt={full ? proj!.tgt : null}
        etaTxt={full ? etaText(proj!.cur as number, proj!.tgt as number, projSpeed) : null}
        deadlineLine={
          full ? deadlineLine(proj!.deadline, proj!.cur as number, proj!.tgt as number, projSpeed) : null
        }
      />
    ),
  ].filter(Boolean);

  // Meilleur jour (effort).
  let bestVal = 0;
  let bestKey: string | null = null;
  allKeys.forEach((k) => {
    const c = aggDay(models, s, k);
    if (c && c.net > bestVal) {
      bestVal = c.net;
      bestKey = k;
    }
  });

  const statCards = [
    prefs.streakWritten && (
      <StreakCard
        key="sw"
        icon="🔥"
        color="var(--coral)"
        label="Série — jour écrit"
        value={streakNow(models, s, qWritten)}
        record={recordStreak(models, s, allKeys, qWritten)}
      />
    ),
    prefs.streakGoal && (
      <StreakCard
        key="sg"
        icon="🎯"
        color="var(--accent)"
        label="Série — objectif atteint"
        value={streakNow(models, s, qGoal)}
        record={recordStreak(models, s, allKeys, qGoal)}
      />
    ),
    prefs.paliers && (
      <StreakCard
        key="sp"
        icon="🎖️"
        color="var(--amber)"
        label="Série — au moins un palier"
        value={streakNow(models, s, qPalier)}
        record={recordStreak(models, s, allKeys, qPalier)}
      />
    ),
    prefs.best && (
      <div className="card stat" key="best">
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
    ),
  ].filter(Boolean);

  const socialItems = socials
    ? SOCIAL_ORDER.filter((k) => (socials[k] ?? "").trim() !== "")
    : [];

  // Un ouvrage AVEC lien = disponible (publié) ; sans lien = en cours d'écriture.
  const worksAvailable = docs.filter((d) => d.url);
  const worksInProgress = docs.filter((d) => !d.url);

  const renderWork = (d: DocEntry) => {
    const proj = docProj[d.id];
    const showBar = !!proj && proj.pct != null;
    const full = !!proj && proj.cur != null && proj.tgt != null;
    return (
      <div className="card work" key={d.id}>
        <div className="work-head">
          {d.url ? (
            <a
              className="work-title is-link"
              href={d.url}
              target="_blank"
              rel="noreferrer"
              title="Ouvrir l'ouvrage"
            >
              {d.title} <span className="work-ext">↗</span>
            </a>
          ) : (
            <span className="work-title">{d.title}</span>
          )}
          {showBar && <span className="work-pct">{proj!.pct}%</span>}
        </div>
        {showBar && (
          <>
            <div className="track">
              <div
                className="fill"
                style={{ width: Math.min(100, Math.max(0, proj!.pct as number)) + "%" }}
              />
            </div>
            {full && (
              <div className="work-meta">
                {fmt(proj!.cur as number)} / {fmt(proj!.tgt as number)} mots
              </div>
            )}
            {full &&
              proj!.deadline &&
              (() => {
                const dl = deadlineLine(
                  proj!.deadline,
                  proj!.cur as number,
                  proj!.tgt as number,
                  netSpeed30([d.model], "all")
                );
                return dl ? (
                  <div className="eta" style={{ color: dl.color, fontWeight: 600 }}>
                    {dl.txt}
                  </div>
                ) : null;
              })()}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="logo">{(name[0] || "?").toUpperCase()}</div>
          <div>
            <b>{name}</b>
            {username && <span className="tag">@{username}</span>}
          </div>
        </div>
      </header>

      <div className="pub-tabs">
        <button className={tab === "profil" ? "active" : ""} onClick={() => setTab("profil")}>
          Profil
        </button>
        <button className={tab === "stat" ? "active" : ""} onClick={() => setTab("stat")}>
          Stats
        </button>
      </div>

      {tab === "stat" && (
        <>
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

          {topCards.length > 0 && (
            <div className="grid row-4" style={{ marginBottom: 14 }}>
              {topCards}
            </div>
          )}

          {statCards.length > 0 && (
            <div className="grid row-3" style={{ marginBottom: 14 }}>
              {statCards}
            </div>
          )}

          {prefs.chart !== "hidden" && (
            <Chart14 models={models} sel={s} showGoal={prefs.chart === "full"} />
          )}

          {prefs.paliers && <BadgeCalendar models={models} sel={s} />}
        </>
      )}

      {tab === "profil" && (
        <>
          {bio && (
            <div className="card">
              <p style={{ margin: 0 }}>{bio}</p>
            </div>
          )}

          {socialItems.length > 0 && (
            <div className="social-row">
              {socialItems.map((k) => {
                const val = (socials![k] as string).trim();
                const { label, Icon } = SOCIAL_META[k];
                return (
                  <a
                    key={k}
                    className="social-link"
                    href={socialHref(k, val)}
                    title={label}
                    aria-label={label}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon />
                  </a>
                );
              })}
            </div>
          )}

          {worksAvailable.length > 0 && (
            <>
              <h2 className="works-title">Ouvrages disponibles</h2>
              {worksAvailable.map(renderWork)}
            </>
          )}

          {worksInProgress.length > 0 && (
            <>
              <h2 className="works-title">Ouvrages en cours</h2>
              {worksInProgress.map(renderWork)}
            </>
          )}

          {!bio && socialItems.length === 0 && docs.length === 0 && (
            <div className="center-note">Ce profil n'a pas encore ajouté d'informations.</div>
          )}
        </>
      )}

      <div style={{ textAlign: "center", margin: "18px 0", opacity: 0.6 }}>
        Propulsé par <b>Stravwords</b>
      </div>
    </div>
  );
}
