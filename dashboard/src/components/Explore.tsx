// Annuaire des profils publics (Stravwords).
// Liste tous les profils is_public = true, chacun cliquable vers /u/<pseudo>.
// Visibilite controlee dans App/Layout via canSeeExplore (admin pour l'instant).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadPublicProfiles, PublicProfileSummary } from "../lib/profile";

export default function Explore() {
  const [list, setList] = useState<PublicProfileSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadPublicProfiles()
      .then(setList)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  if (err) return <div className="center-note">Erreur : {err}</div>;
  if (!list) return <div className="center-note">Chargement…</div>;

  return (
    <div>
      <h2 style={{ margin: "4px 0 14px" }}>
        Profils publics <span className="meta">{list.length}</span>
      </h2>

      {list.length === 0 ? (
        <div className="empty-note">Aucun profil public pour le moment.</div>
      ) : (
        <div className="grid row-3">
          {list.map((p) => (
            <Link
              key={p.username}
              to={`/u/${p.username}`}
              className="card"
              style={{ textDecoration: "none", display: "block" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="av">
                  {((p.display_name || p.username)[0] || "?").toUpperCase()}
                </span>
                <b>{p.display_name || p.username}</b>
              </div>
              <div className="sub">@{p.username}</div>
              {p.bio && (
                <div className="sub" style={{ marginTop: 6 }}>
                  {p.bio}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
