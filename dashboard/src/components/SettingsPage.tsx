import { useState, type ChangeEvent } from "react";
import { usePage } from "./Layout";
import {
  DocModel,
  DocSettingsPatch,
  ImportRow,
  saveDocSettings,
  setDocHidden,
  setDefaultDoc,
  deleteDoc,
  parseHistoryCsv,
  importHistory,
} from "../lib/data";
import { THEMES, THEME_LABELS } from "../lib/paliers";

type SaveState = "idle" | "saving" | "saved" | "error";

/* ---------- Import d'historique : nouveau document ---------- */
function ImportNewDoc({ userId, reload }: { userId: string; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const res = parseHistoryCsv(await f.text());
    if (res.error) {
      setRows(null);
      setMsg(res.error);
      return;
    }
    setRows(res.rows);
    setMsg(
      `${res.rows.length} jour(s) détecté(s) — du ${res.rows[0].day} au ${res.rows[res.rows.length - 1].day}.`
    );
  };

  const doImport = async () => {
    if (!rows || !name.trim()) return;
    setBusy(true);
    try {
      const docId = crypto.randomUUID();
      const r = await importHistory(userId, docId, name.trim(), rows, { createDoc: true });
      await reload();
      setMsg(`✓ ${r.inserted} jour(s) importé(s) dans « ${name.trim()} ».`);
      setName("");
      setRows(null);
      setFileName("");
    } catch {
      setMsg("Erreur pendant l'import.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card import-card">
      <h2>Importer un historique (nouveau document)</h2>
      <p className="import-hint">
        Fichier CSV — colonnes : <b>date</b>, <b>objectif quotidien</b>, <b>objectif hebdo</b>,{" "}
        <b>mots écrits</b>. Dates AAAA-MM-JJ ou JJ/MM/AAAA.
      </p>
      <p className="import-hint">
        À utiliser pour un document que tu <b>ne suivras pas dans Word</b> (projet terminé, archive).
        Pour compléter le passé d'un document <b>déjà suivi</b>, ouvre-le d'abord dans Word puis
        utilise « Importer historique » sur sa carte ci-dessous — sinon l'historique et le suivi en
        direct resteront deux documents séparés (identifiants différents).
      </p>
      <div className="import-row">
        <input
          type="text"
          placeholder="Nom du nouveau document"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="btn file-btn">
          {fileName || "Choisir un CSV"}
          <input type="file" accept=".csv,text/csv" onChange={onFile} hidden />
        </label>
        <button className="btn primary" disabled={!rows || !name.trim() || busy} onClick={doImport}>
          {busy ? "Import…" : "Importer"}
        </button>
      </div>
      {msg && <p className="import-msg">{msg}</p>}
    </div>
  );
}

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
  const [importMsg, setImportMsg] = useState("");

  // Import d'historique DANS ce document : ne remplit que les jours non deja suivis.
  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // permet de re-choisir le meme fichier ensuite
    if (!f) return;
    setImportMsg("Lecture…");
    const res = parseHistoryCsv(await f.text());
    if (res.error) {
      setImportMsg(res.error);
      return;
    }
    setState("saving");
    try {
      const r = await importHistory(userId, doc.id, doc.name, res.rows, {
        skipDays: new Set(Object.keys(doc.days)),
        createDoc: false,
      });
      await reload();
      setState("saved");
      window.setTimeout(() => setState("idle"), 1500);
      setImportMsg(
        `✓ ${r.inserted} jour(s) importé(s)${r.skipped ? ` · ${r.skipped} ignoré(s) (déjà suivis)` : ""}.`
      );
    } catch {
      setState("error");
      setImportMsg("Erreur pendant l'import.");
    }
  };

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
        <label className="btn file-btn">
          Importer historique
          <input type="file" accept=".csv,text/csv" onChange={onImportFile} hidden />
        </label>
        <button className="btn danger" onClick={onDelete}>
          Supprimer
        </button>
      </div>
      {importMsg && <p className="import-msg">{importMsg}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { models, userId, reload } = usePage();
  return (
    <>
      <h1 className="page">Paramètres des documents</h1>
      <ImportNewDoc userId={userId} reload={reload} />
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
