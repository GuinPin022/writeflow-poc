import { useState } from "react";
import { usePage } from "./Layout";
import { DocModel, DocSettingsPatch, saveDocSettings } from "../lib/data";
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

  const commit = async (patch: DocSettingsPatch) => {
    setState("saving");
    try {
      await saveDocSettings(userId, doc, patch);
      await reload();
      setState("saved");
      window.setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  };

  const num = (v: string) => Math.max(0, parseInt(v, 10) || 0);

  return (
    <div className="card doc-settings">
      <div className="doc-settings-head">
        <h2>{doc.name}</h2>
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
        Document par défaut, masquage, suppression et import historique arriveront dans les
        prochaines étapes.
      </p>
    </>
  );
}
