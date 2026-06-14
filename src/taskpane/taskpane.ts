import "./taskpane.css";
import { WriteFlowTracker } from "../tracking/tracker";
import { TrackerSnapshot } from "../tracking/types";

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

Office.onReady((info) => {
  if (info.host !== Office.HostType.Word) {
    setStatus("Cet add-in doit s'executer dans Word.", "err");
    return;
  }

  tracker = new WriteFlowTracker({ onUpdate: render });
  setStatus(`Pret. Plateforme : ${Office.context.platform}.`, "ok");

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
