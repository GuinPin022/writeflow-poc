// Ecran "Mon profil public" (Stravwords) — design en lignes editables.
// Rendu DANS le cadre commun (Layout) : pas d'en-tete/onglets propres ici.
//
// En-tete identite (avatar + nom + @pseudo), puis une ligne par champ avec un
// crayon : un clic ouvre l'edition inline de CETTE ligne seulement (✓ / ✕).
// La visibilite publique est un interrupteur, et le lien partageable apparait
// quand le profil est public.

import { useEffect, useState } from "react";
import { usePage } from "./Layout";
import {
  loadMyProfile,
  saveMyProfile,
  DEFAULT_PREFS,
  PublicPrefs,
  ProfilePatch,
  Socials,
  CardMode,
  DonutMode,
} from "../lib/profile";

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;
// Champs editables inline : identite + reseaux sociaux (memes UX par-ligne).
type Field = "username" | "display_name" | "bio";
type EditKey = Field | keyof Socials;

const EMPTY_SOCIALS: Socials = {
  website: null,
  facebook: null,
  instagram: null,
  wattpad: null,
  twitter: null,
  tiktok: null,
  contact_email: null,
};

// Lignes de la carte « Réseaux & contact » : clé, libellé, indice de saisie.
const SOCIAL_ROWS: { key: keyof Socials; label: string; placeholder: string }[] = [
  { key: "website", label: "Site internet", placeholder: "https://mon-site.com" },
  { key: "contact_email", label: "Email de contact", placeholder: "contact@exemple.com (public)" },
  { key: "instagram", label: "Instagram", placeholder: "@pseudo ou lien" },
  { key: "tiktok", label: "TikTok", placeholder: "@pseudo ou lien" },
  { key: "twitter", label: "Twitter / X", placeholder: "@pseudo ou lien" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" },
  { key: "wattpad", label: "Wattpad", placeholder: "https://wattpad.com/user/…" },
];

// Cartes "periode" + graphe : tri-state masque / mots / complet.
type CardKey = "today" | "recent" | "week" | "chart";
const CARD_BLOCKS: { key: CardKey; icon: string; label: string }[] = [
  { key: "today", icon: "📅", label: "Aujourd'hui" },
  { key: "recent", icon: "🗓️", label: "X derniers jours" },
  { key: "week", icon: "▦", label: "Cette semaine" },
  { key: "chart", icon: "📊", label: "Graphe 14 jours" },
];

// Cartes simples on/off.
type BoolKey = "streakWritten" | "best" | "streakGoal" | "paliers";
const TOGGLE_BLOCKS: { key: BoolKey; icon: string; label: string; hint?: string }[] = [
  { key: "streakWritten", icon: "🔥", label: "Série de jours écrits" },
  { key: "best", icon: "★", label: "Meilleur jour" },
  { key: "streakGoal", icon: "🎯", label: "Série d'objectifs atteints", hint: "révèle ton objectif" },
  { key: "paliers", icon: "🎖️", label: "Paliers (série + calendrier)", hint: "révèle ton objectif" },
];

export default function ProfilePage() {
  const { userId } = usePage();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [socials, setSocials] = useState<Socials>(EMPTY_SOCIALS);
  const [isPublic, setIsPublic] = useState(false);
  const [allowDocView, setAllowDocView] = useState(false);
  const [prefs, setPrefs] = useState<PublicPrefs>(DEFAULT_PREFS);

  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadMyProfile(userId)
      .then((p) => {
        if (p) {
          setUsername(p.username);
          setDisplayName(p.display_name || "");
          setBio(p.bio || "");
          setSocials({
            website: p.website,
            facebook: p.facebook,
            instagram: p.instagram,
            wattpad: p.wattpad,
            twitter: p.twitter,
            tiktok: p.tiktok,
            contact_email: p.contact_email,
          });
          setIsPublic(p.is_public);
          setAllowDocView(p.allow_doc_view);
          setPrefs(p.public_prefs);
        } else {
          // Nouveau compte : on ouvre directement l'edition du pseudo.
          setEditing("username");
          setDraft("");
        }
        setLoaded(true);
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : String(e));
        setLoaded(true);
      });
  }, [userId]);

  const hasUsername = USERNAME_RE.test(username);
  const shareUrl = `${location.href.split("#")[0]}#/u/${username}`;

  function currentValue(f: EditKey): string {
    if (f === "username") return username;
    if (f === "display_name") return displayName;
    if (f === "bio") return bio;
    return socials[f] ?? "";
  }
  function startEdit(f: EditKey) {
    setErr(null);
    setEditing(f);
    setDraft(currentValue(f));
  }
  function cancelEdit() {
    setEditing(null);
    setErr(null);
  }

  async function persist(next: ProfilePatch) {
    await saveMyProfile(userId, next);
  }

  // Champs courants (identite + reseaux + visibilite), pour les upserts qui ne
  // changent qu'un seul reglage sans ecraser les autres.
  function baseFields(): ProfilePatch {
    return {
      username,
      display_name: displayName || null,
      bio: bio || null,
      is_public: isPublic,
      allow_doc_view: allowDocView,
      public_prefs: prefs,
      ...socials,
    };
  }

  /** Enregistre une modification des preferences de visibilite (effort/goals/paliers/donut). */
  async function savePrefs(next: PublicPrefs) {
    setBusy(true);
    setErr(null);
    try {
      await persist({ ...baseFields(), public_prefs: next });
      setPrefs(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const toggleBool = (k: BoolKey) => savePrefs({ ...prefs, [k]: !prefs[k] });
  const setCard = (k: CardKey, mode: CardMode) => savePrefs({ ...prefs, [k]: mode });
  const setDonut = (mode: DonutMode) => savePrefs({ ...prefs, donut: mode });
  const setRecentN = (n: number) =>
    savePrefs({ ...prefs, recentN: Math.min(7, Math.max(1, n)) });

  async function saveField(f: EditKey) {
    setErr(null);
    const val = draft.trim();
    const patch = baseFields(); // part de l'etat courant, on n'ecrase que le champ edite
    if (f === "username") {
      const u = val.toLowerCase();
      if (!USERNAME_RE.test(u)) {
        setErr("Pseudo invalide : 3 à 30 caractères, en minuscules, chiffres, « - » ou « _ ».");
        return;
      }
      patch.username = u;
    } else if (f === "display_name") {
      patch.display_name = val || null;
    } else if (f === "bio") {
      patch.bio = val || null;
    } else {
      patch[f] = val || null; // reseau social
    }
    if (!USERNAME_RE.test(patch.username)) {
      setErr("Définis d'abord ton pseudo.");
      return;
    }
    setBusy(true);
    try {
      await persist(patch);
      if (f === "username") setUsername(patch.username);
      else if (f === "display_name") setDisplayName(val);
      else if (f === "bio") setBio(val);
      else setSocials((s) => ({ ...s, [f]: val || null }));
      setEditing(null);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "23505") setErr("Ce pseudo est déjà pris, choisis-en un autre.");
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic() {
    if (!hasUsername) {
      setErr("Définis d'abord ton pseudo pour rendre ton profil public.");
      return;
    }
    setBusy(true);
    setErr(null);
    const next = !isPublic;
    try {
      await persist({ ...baseFields(), is_public: next });
      setIsPublic(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAllowDocView() {
    if (!isPublic) return;
    setBusy(true);
    setErr(null);
    const next = !allowDocView;
    try {
      await persist({ ...baseFields(), allow_doc_view: next });
      setAllowDocView(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papier refuse : copie manuelle */
    }
  }

  function row(
    f: EditKey,
    label: string,
    value: string,
    opts?: { multiline?: boolean; placeholder?: string; hint?: string }
  ) {
    const isEditing = editing === f;
    // Les champs autres que le pseudo sont verrouilles tant qu'aucun pseudo n'est defini.
    const locked = f !== "username" && !hasUsername;
    return (
      <div className="prof-row" key={f}>
        <span className="prof-label">{label}</span>
        {isEditing ? (
          <>
            {opts?.multiline ? (
              <textarea
                className="prof-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder={opts?.placeholder}
                autoFocus
              />
            ) : (
              <input
                className="prof-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={opts?.placeholder}
                autoCapitalize={f === "username" ? "none" : undefined}
                autoFocus
              />
            )}
            <span className="prof-actions">
              <button className="btn primary" onClick={() => saveField(f)} disabled={busy} title="Enregistrer">
                ✓
              </button>
              <button className="btn" onClick={cancelEdit} disabled={busy} title="Annuler">
                ✕
              </button>
            </span>
            {opts?.hint && <div className="prof-rowhint">{opts.hint}</div>}
          </>
        ) : (
          <>
            <span className={"prof-value" + (value ? "" : " prof-empty")}>{value || "—"}</span>
            <button
              className="prof-pencil"
              onClick={() => startEdit(f)}
              disabled={locked || (editing !== null && !isEditing)}
              title={locked ? "Définis d'abord ton pseudo" : "Modifier — " + label}
            >
              ✏
            </button>
          </>
        )}
      </div>
    );
  }

  if (!loaded) return <div className="center-note">Chargement…</div>;

  return (
    <>
      <h1 className="page">Mon profil public</h1>

      <div className="card prof-head">
        <div className="prof-avatar">{(displayName || username || "?").charAt(0).toUpperCase()}</div>
        <div>
          <div className="prof-name">{displayName || username || "Profil sans nom"}</div>
          <div className="prof-handle">
            {username ? "@" + username : "pseudo non défini"} ·{" "}
            {isPublic ? "profil public activé" : "profil privé"}
          </div>
        </div>
      </div>

      <div className="card prof-rows">
        {row("username", "Pseudo", username, {
          placeholder: "ex. jules-verne",
          hint: "3 à 30 caractères. Changer ton pseudo modifie ton lien public.",
        })}
        {row("display_name", "Nom affiché", displayName, { placeholder: "ex. Jules Verne" })}
        {row("bio", "Bio", bio, {
          multiline: true,
          placeholder: "Une ligne sur ton projet d'écriture…",
        })}
      </div>

      {!hasUsername && (
        <p className="prof-note">Commence par définir ton pseudo pour activer le reste.</p>
      )}

      <div className="card prof-rows">
        <div className="prof-row">
          <span className="prof-label">Réseaux &amp; contact</span>
          <span className="prof-value prof-empty">
            Optionnels. Affichés sous l'onglet « Profil » de ta page publique. L'email de contact
            est public et distinct de ton email de connexion.
          </span>
        </div>
        {SOCIAL_ROWS.map((s) =>
          row(s.key, s.label, socials[s.key] ?? "", { placeholder: s.placeholder })
        )}
      </div>

      <div className="card prof-rows">
        <div className="prof-row">
          <span className="prof-label">Profil public</span>
          <span className={"prof-value" + (isPublic ? "" : " prof-empty")}>
            {isPublic ? "Activé — visible par les autres" : "Désactivé — personne ne te voit"}
          </span>
          <button
            className={"btn" + (isPublic ? "" : " primary")}
            onClick={togglePublic}
            disabled={busy || !hasUsername}
          >
            {isPublic ? "Désactiver" : "Activer"}
          </button>
        </div>

        <div className="prof-row">
          <span className="prof-label">Vue par document</span>
          <span className={"prof-value" + (allowDocView ? "" : " prof-empty")}>
            {allowDocView
              ? "Autorisée — les visiteurs peuvent voir un document précis"
              : "Désactivée — seules tes stats globales sont visibles"}
          </span>
          <button className="btn" onClick={toggleAllowDocView} disabled={busy || !isPublic}>
            {allowDocView ? "Désactiver" : "Autoriser"}
          </button>
        </div>

        {isPublic && hasUsername && (
          <div className="prof-row">
            <span className="prof-label">Lien public</span>
            <span className="prof-value prof-link">{shareUrl}</span>
            <span className="prof-actions">
              <button className="btn" onClick={copyLink}>
                {copied ? "Copié ✓" : "Copier"}
              </button>
              <a className="btn" href={shareUrl} target="_blank" rel="noreferrer">
                Ouvrir
              </a>
            </span>
          </div>
        )}
      </div>

      <div className="card prof-rows">
        <div className="prof-row">
          <span className="prof-label">Statistiques visibles</span>
          <span className="prof-value prof-empty">
            Compose ta page publique, carte par carte. « Mots » montre l'effort
            sans dévoiler ton objectif ; « Complet » ajoute l'objectif.
          </span>
        </div>

        {/* Cartes periode + graphe : tri-state masque / mots / complet. */}
        {CARD_BLOCKS.map((b) => (
          <div className="prof-row" key={b.key}>
            <span className="prof-label">
              {b.icon} {b.label}
              {b.key === "recent" && (
                <select
                  className="mini"
                  style={{ marginLeft: 6 }}
                  value={prefs.recentN}
                  onChange={(e) => setRecentN(+e.target.value)}
                  disabled={busy || !hasUsername}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} j
                    </option>
                  ))}
                </select>
              )}
            </span>
            <span className="prof-actions">
              {(
                [
                  ["hidden", "Masqué"],
                  ["words", "Mots"],
                  ["full", "Complet"],
                ] as [CardMode, string][]
              ).map(([mode, lab]) => (
                <button
                  key={mode}
                  className={"btn" + (prefs[b.key] === mode ? " primary" : "")}
                  onClick={() => setCard(b.key, mode)}
                  disabled={busy || !hasUsername || prefs[b.key] === mode}
                >
                  {lab}
                </button>
              ))}
            </span>
          </div>
        ))}

        {/* Cartes simples on/off : meme motif a boutons groupes que les cartes periode. */}
        {TOGGLE_BLOCKS.map((b) => {
          const on = prefs[b.key];
          return (
            <div className="prof-row" key={b.key}>
              <span className="prof-label">
                {b.icon} {b.label}
              </span>
              <span className="prof-actions">
                {(
                  [
                    [false, "Masqué"],
                    [true, "Affiché"],
                  ] as [boolean, string][]
                ).map(([val, lab]) => (
                  <button
                    key={lab}
                    className={"btn" + (on === val ? " primary" : "")}
                    onClick={() => toggleBool(b.key)}
                    disabled={busy || !hasUsername || on === val}
                  >
                    {lab}
                  </button>
                ))}
              </span>
              {b.hint && <div className="prof-rowhint">{b.hint}</div>}
            </div>
          );
        })}

        {/* Donut projet : tri-state masque / % seul / complet. */}
        <div className="prof-row">
          <span className="prof-label">📦 Avancement du projet</span>
          <span className="prof-actions">
            {(
              [
                ["hidden", "Masqué"],
                ["percent", "% seul"],
                ["full", "Complet"],
              ] as [DonutMode, string][]
            ).map(([mode, lab]) => (
              <button
                key={mode}
                className={"btn" + (prefs.donut === mode ? " primary" : "")}
                onClick={() => setDonut(mode)}
                disabled={busy || !hasUsername || prefs.donut === mode}
              >
                {lab}
              </button>
            ))}
          </span>
          <div className="prof-rowhint">
            « % seul » ne montre que le pourcentage ; « Complet » ajoute la cible
            en mots, l'échéance et l'estimation de fin.
          </div>
        </div>

        {!isPublic && hasUsername && (
          <div className="prof-row">
            <span className="prof-value prof-empty">
              Ces réglages s'appliqueront dès que ton profil sera public.
            </span>
          </div>
        )}
      </div>

      {err && <div className="prof-err">{err}</div>}
    </>
  );
}
