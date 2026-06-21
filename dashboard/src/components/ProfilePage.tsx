// Ecran "Mon profil public" (Stravwords) — design en lignes editables.
// Rendu DANS le cadre commun (Layout) : pas d'en-tete/onglets propres ici.
//
// En-tete identite (avatar + nom + @pseudo), puis une ligne par champ avec un
// crayon : un clic ouvre l'edition inline de CETTE ligne seulement (✓ / ✕).
// La visibilite publique est un interrupteur, et le lien partageable apparait
// quand le profil est public.

import { useEffect, useState } from "react";
import { usePage } from "./Layout";
import { loadMyProfile, saveMyProfile } from "../lib/profile";

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;
type Field = "username" | "display_name" | "bio";

export default function ProfilePage() {
  const { userId } = usePage();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [allowDocView, setAllowDocView] = useState(false);

  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Field | null>(null);
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
          setIsPublic(p.is_public);
          setAllowDocView(p.allow_doc_view);
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

  function startEdit(f: Field) {
    setErr(null);
    setEditing(f);
    setDraft(f === "username" ? username : f === "display_name" ? displayName : bio);
  }
  function cancelEdit() {
    setEditing(null);
    setErr(null);
  }

  async function persist(next: {
    username: string;
    display_name: string | null;
    bio: string | null;
    is_public: boolean;
    allow_doc_view: boolean;
  }) {
    await saveMyProfile(userId, next);
  }

  async function saveField(f: Field) {
    setErr(null);
    let nextUsername = username;
    let nextDisplay = displayName;
    let nextBio = bio;
    if (f === "username") {
      const u = draft.trim().toLowerCase();
      if (!USERNAME_RE.test(u)) {
        setErr("Pseudo invalide : 3 à 30 caractères, en minuscules, chiffres, « - » ou « _ ».");
        return;
      }
      nextUsername = u;
    } else if (f === "display_name") {
      nextDisplay = draft.trim();
    } else {
      nextBio = draft.trim();
    }
    if (!USERNAME_RE.test(nextUsername)) {
      setErr("Définis d'abord ton pseudo.");
      return;
    }
    setBusy(true);
    try {
      await persist({
        username: nextUsername,
        display_name: nextDisplay || null,
        bio: nextBio || null,
        is_public: isPublic,
        allow_doc_view: allowDocView,
      });
      setUsername(nextUsername);
      setDisplayName(nextDisplay);
      setBio(nextBio);
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
      await persist({
        username,
        display_name: displayName || null,
        bio: bio || null,
        is_public: next,
        allow_doc_view: allowDocView,
      });
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
      await persist({
        username,
        display_name: displayName || null,
        bio: bio || null,
        is_public: isPublic,
        allow_doc_view: next,
      });
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
    f: Field,
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

      {err && <div className="prof-err">{err}</div>}
    </>
  );
}
