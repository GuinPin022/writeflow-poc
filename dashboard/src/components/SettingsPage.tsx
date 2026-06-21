import { useState } from "react";
import { usePage } from "./Layout";
import {
  DocModel,
  DocSettingsPatch,
  saveDocSettings,
  setDocHidden,
  setDefaultDoc,
  deleteDoc,
} from "../lib/data";
import { THEMES, THEME_LABELS } from "../lib/paliers";

type SaveState = "idle" | "saving" | "saved" | "error";

function DocCard({
  doc,
  userId,
  reload,
}: {
  doc: DocModel;
  userId: string;
  reload: () => Promise<void>;
}) {
  const [state, setState] = useState<SaveState>("idle");

  // Enrobe une ecriture : etat saving -> reload -> saved (ou error).
  const run = async (fn: () => Promise<void>) => {
    setState("saving");
    try {
      await fn();
      await reload();
      setState("saved");
      window.setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  };

  const commit = (patch: DocSettingsPatch) => run(() => saveDocSettings(userId, doc, patch));
  const num = (v: string) => Math.max(0, parseInt(v, 10) || 0);

  // Suppression definitive : pas de setState apres reload (la carte est demontee).
  const onDelete = async () => {
    const ok = window.confirm(
      `Supprimer définitivement « ${doc.name} » et tout son historique ?\n\n` +
        `Action irréversible. Note : si tu rouvres ce document dans Word avec le suivi actif, ` +
        `il sera recréé automatiquement.`
    );
    if (!ok) return;
    setState("saving");
    try {
      await deleteDoc(userId, doc.id);
      await reload();
    } catch {
      setState("error");
    }
  };

  return (
    <div className={"card doc-settings" + (doc.hidden ? " is-hidden" : "")}>
      <div className="doc-settings-head">
        <h2>
          {doc.name}
          {doc.isDefault && <span className="tag-default">par défaut</span>}
          {doc.hidden && <span className="tag-hidden">masqué</span>}
        </h2>
        <span className={"save-state " + state}>
          {state === "saving"
            ? "Enregistrement…"
            : state === "saved"
              ? "Enregistré ✓"
              : state === "error"
                ? "Erreur — réessaie"
                : ""}
        </span>
      </div>
      <div className="settings-grid">
        <label>
          Objectif quotidien
          <input
            type="number"
            min={0}
            step={50}
            defaultValue={doc.dailyGoal}
            onBlur={(e) => {
              const v = num(e.target.value);
              if (v !== doc.dailyGoal) commit({ dailyGoal: v });
            }}
          />
        </label>
        <label>
          Objectif hebdo
          <input
            type="number"
            min={0}
            step={100}
            defaultValue={doc.weeklyGoal}
            onBlur={(e) => {
              const v = num(e.target.value);
              if (v !== doc.weeklyGoal) commit({ weeklyGoal: v });
            }}
          />
        </label>
        <label>
          Total du document
          <input
            type="number"
            min={0}
            step={1000}
            defaultValue={doc.target}
            onBlur={(e) => {
              const v = num(e.target.value);
              if (v !== doc.target) commit({ target: v });
            }}
          />
        </label>
        <label>
          Échéance
          <input
            type="date"
            defaultValue={doc.deadline ?? ""}
            onChange={(e) => commit({ deadline: e.target.value })}
          />
        </label>
        <label>
          Thème
          <select defaultValue={doc.theme} onChange={(e) => commit({ theme: e.target.value })}>
            {Object.keys(THEMES).map((k) => (
              <option key={k} value={k}>
                {THEME_LABELS[k] ?? k}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="doc-actions">
        <button
          className={"btn" + (doc.isDefault ? " primary" : "")}
          onClick={() => run(() => setDefaultDoc(userId, doc, !doc.isDefault))}
        >
          {doc.isDefault ? "★ Document par défaut" : "☆ Définir par défaut"}
        </button>
        <button className="btn" onClick={() => run(() => setDocHidden(userId, doc, !doc.hidden))}>
          {doc.hidden ? "Réafficher" : "Masquer"}
        </button>
        <button className="btn danger" onClick={onDelete}>
          Supprimer
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { models, userId, reload } = usePage();
  return (
    <>
      <h1 className="page">Paramètres des documents</h1>
      {models.length === 0 && <div className="empty-note">Aucun document.</div>}
      {models.map((d) => (
        <DocCard key={d.id} doc={d} userId={userId} reload={reload} />
      ))}
      <p style={{ marginTop: 4, color: "var(--muted)", fontSize: 13 }}>
        Un document « par défaut » est celui chargé au démarrage du dashboard. Un document « masqué »
        n'apparaît plus dans le sélecteur ni dans « Tous les documents », mais reste listé ici pour
        être réaffiché. Suppression et import historique arriveront ensuite.
      </p>
    </>
  );
}
