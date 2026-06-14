import "./taskpane.css";
import { WriteFlowTracker } from "../tracking/tracker";
import { TrackerSnapshot } from "../tracking/types";
import { renderDocumentView, renderGlobalView, renderSettingsView } from "./dashboard";

/* global Office, document, window */

let tracker: WriteFlowTracker | null = null;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element introuvable: ${id}`);
  return el;
}

function setStatus(text: string, kind: "ok" | "err" | "" = ""): void {
  const s = $("status");
  s.textContent = text;
  s.className = `status ${kind}`.trim();
}

function render(s: TrackerSnapshot): void {
  $("total").textContent = String(s.totalWords);
  $("typed").textContent = String(s.typedProduction);
  $("pasted").textContent = String(s.pastedWords);
  $("typed-ev").textContent = String(s.typedProductionEvent);
  $("pasted-ev").textContent = String(s.pastedWordsEvent);
  $("typed-cb").textContent = String(s.typedProductionCombined);
  $("pasted-cb").textContent = String(s.pastedWordsCombined);
  $("deleted").textContent = String(s.deletedWords);
  $("cut").textContent = String(s.cutWords);
  $("ticks").textContent = String(s.ticks);
  $("latency").textContent = s.lastLatencyMs.toFixed(0);
  $("session").textContent = s.sessionActive ? "active" : "inactive";
  if (tracker) $("queue").textContent = String(tracker.getQueue().pendingCount());
}

async function toggleTracker(): Promise<void> {
  if (!tracker) return;
  try {
    if (tracker.isRunning()) {
      await tracker.stop();
      setStatus("Suivi arrêté.", "");
    } else {
      await tracker.start();
      setStatus("Suivi actif (relevé toutes les 30 s).", "ok");
    }
  } catch (e) {
    setStatus(`Erreur : ${(e as Error).message}`, "err");
  }
  renderDoc();
}

function renderDoc(): void {
  if (!tracker) return;
  renderDocumentView($("view-document"), tracker.getDailyStore(), tracker.getCurrentDoc(), {
    running: tracker.isRunning(),
    onToggle: () => void toggleTracker(),
  });
}

function renderGlobal(): void {
  if (tracker) renderGlobalView($("view-global"), tracker.getDailyStore());
}

function renderSettings(): void {
  if (tracker) renderSettingsView($("view-settings"), tracker.getDailyStore(), tracker.getCurrentDoc());
}

function onUpdate(s: TrackerSnapshot): void {
  render(s);
  // Vues sans champ de saisie : on peut les rafraichir a chaque releve.
  renderDoc();
  renderGlobal();
}

type View = "document" | "global" | "settings" | "poc";

function showView(view: View): void {
  const views: View[] = ["document", "global", "settings", "poc"];
  for (const v of views) {
    ($(`view-${v}`) as HTMLElement).hidden = v !== view;
    $(`tab-${v}`).classList.toggle("active", v === view);
  }
  if (view === "document") renderDoc();
  else if (view === "global") renderGlobal();
  else if (view === "settings") renderSettings(); // rendu a l'ouverture (champs de saisie)
}

Office.onReady((info) => {
  if (info.host !== Office.HostType.Word) {
    setStatus("Cet add-in doit s'executer dans Word.", "err");
    return;
  }

  tracker = new WriteFlowTracker({ onUpdate });
  setStatus(`Pret. Plateforme : ${Office.context.platform}.`, "ok");

  $("tab-document").addEventListener("click", () => showView("document"));
  $("tab-global").addEventListener("click", () => showView("global"));
  $("tab-settings").addEventListener("click", () => showView("settings"));
  $("tab-poc").addEventListener("click", () => showView("poc"));
  renderDoc(); // rendu initial (onglet Document affiche par defaut)
  renderGlobal();

  $("start").addEventListener("click", async () => {
    try {
      await tracker!.start();
      setStatus("Tracking demarre (releve toutes les 30 s).", "ok");
    } catch (e) {
      setStatus(`Erreur au demarrage : ${(e as Error).message}`, "err");
    }
  });

  $("sample").addEventListener("click", () => tracker!.sampleNow());
  $("stop").addEventListener("click", async () => {
    await tracker!.stop();
    setStatus("Tracking arrete.", "");
  });

  $("reset").addEventListener("click", () => {
    tracker!.reset();
    setStatus("Compteurs reinitialises.", "");
  });

  $("csv").addEventListener("click", () => tracker!.getLogger().download("csv"));
  $("json").addEventListener("click", () => tracker!.getLogger().download("json"));

  let online = true;
  $("toggle-net").addEventListener("click", () => {
    online = !online;
    tracker!.getQueue().setOnline(online);
    $("toggle-net").textContent = online ? "Couper le reseau (test offline)" : "Retablir le reseau";
    setStatus(online ? "Reseau retabli." : "Reseau coupe : evenements mis en file locale.", "");
  });

  $("flush").addEventListener("click", () => {
    const sent = tracker!.getQueue().flush();
    setStatus(`File videe : ${sent} evenement(s) envoye(s).`, "ok");
    $("queue").textContent = String(tracker!.getQueue().pendingCount());
  });
});
