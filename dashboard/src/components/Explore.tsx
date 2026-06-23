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

  if (list.length === 0)
    return <div className="empty-note">Aucun profil public pour le moment.</div>;

  return (
    <div className="explore-list">
      {list.map((p) => (
        <Link key={p.username} to={`/u/${p.username}`} className="card explore-card">
          <span className="explore-av">
            {((p.display_name || p.username)[0] || "?").toUpperCase()}
          </span>
          <div className="explore-body">
            <div className="explore-name">{p.display_name || p.username}</div>
            <div className="explore-handle">@{p.username}</div>
            {p.bio && <div className="explore-bio">{p.bio}</div>}
          </div>
          <span className="explore-arrow">→</span>
        </Link>
      ))}
    </div>
  );
}
