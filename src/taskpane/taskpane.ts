import "./taskpane.css";
import { Session } from "@supabase/supabase-js";
import { WriteFlowTracker } from "../tracking/tracker";
import { TrackerSnapshot } from "../tracking/types";
import { renderDocumentView, renderGlobalView, renderSettingsView } from "./dashboard";
import {
  getSession,
  loadAccountData,
  signIn,
  signOut,
  signUp,
  syncDocTarget,
  syncSettings,
  syncToday,
} from "../supabase/client";

const SKIP_LOGIN_KEY = "writeflow_skip_login";

/* global Office, document, window, console */

let tracker: WriteFlowTracker | null = null;
let supaSession: Session | null = null;
let syncTimer: number | null = null;

/** Pousse vers Supabase au plus une fois toutes les 3 s (anti-rebond). */
function scheduleSync(): void {
  if (!tracker || !supaSession) return;
  if (syncTimer !== null) return;
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void syncToday(tracker!.getDailyStore(), tracker!.getCurrentDoc(), supaSession!.user.id).catch(
      (e) => console.warn("Sync Supabase echouee:", e)
    );
  }, 3000);
}

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

/* ---------- Adaptation au theme Office de Word ---------- */
function normalizeHex(c: string | undefined): string {
  if (!c) return "";
  let h = c.replace("#", "");
  if (h.length === 8) h = h.slice(2); // ARGB -> RGB
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return h.length === 6 ? `#${h}` : "";
}
function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function lighten(hex: string, pct: number): string {
  const [r, g, b] = rgb(hex);
  const m = (v: number) => Math.round(v + (255 - v) * (pct / 100));
  return `#${[m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function applyOfficeTheme(): void {
  try {
    const t = Office.context.officeTheme;
    const bg = normalizeHex(t?.bodyBackgroundColor);
    if (!bg) return; // plateforme sans theme expose -> garde les valeurs CSS par defaut
    const fg = normalizeHex(t?.bodyForegroundColor) || "#1b1b1b";
    const root = document.documentElement.style;
    root.setProperty("--bg", bg);
    root.setProperty("--fg", fg);
    if (luminance(bg) < 0.5) {
      // Thème sombre (Noir / Gris foncé)
      root.setProperty("--card", lighten(bg, 14));
      root.setProperty("--highlight", lighten(bg, 22));
      root.setProperty("--border", "rgba(255,255,255,0.16)");
      root.setProperty("--muted", "rgba(255,255,255,0.6)");
      root.setProperty("--accent", "#5b8ad6");
    } else {
      // Thème clair (Blanc / Coloré)
      root.setProperty("--card", "#f3f4f6");
      root.setProperty("--highlight", "#e8f0fe");
      root.setProperty("--border", "#e0e0e0");
      root.setProperty("--muted", "#6b6b6b");
      root.setProperty("--accent", "#2b579a");
    }
  } catch {
    /* garde les couleurs par defaut */
  }
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
      await syncDown(); // le document est identifie -> on charge son objectif
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

function onSettingsChange(kind: "settings" | "docTarget"): void {
  if (!tracker || !supaSession) return; // mode local : rien a remonter
  const uid = supaSession.user.id;
  const daily = tracker.getDailyStore();
  if (kind === "docTarget") {
    void syncDocTarget(daily, tracker.getCurrentDoc(), uid).catch((e) =>
      console.warn("Sync cible document echouee:", e)
    );
  } else {
    void syncSettings(daily, uid).catch((e) => console.warn("Sync reglages echouee:", e));
  }
}

function renderSettings(): void {
  if (tracker)
    renderSettingsView($("view-settings"), tracker.getDailyStore(), tracker.getCurrentDoc(), onSettingsChange);
}

/** Recharge depuis le compte les reglages + l'objectif du document, puis rafraichit. */
async function syncDown(): Promise<void> {
  if (!tracker || !supaSession) return;
  try {
    await loadAccountData(tracker.getDailyStore(), tracker.getCurrentDoc(), supaSession.user.id);
  } catch (e) {
    console.warn("Chargement des donnees du compte echoue:", e);
  }
  renderDoc();
  renderGlobal();
}

function onUpdate(s: TrackerSnapshot): void {
  render(s);
  // Vues sans champ de saisie : on peut les rafraichir a chaque releve.
  renderDoc();
  renderGlobal();
  scheduleSync(); // remontee Supabase (anti-rebond)
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

function showAuth(msg = ""): void {
  ($("auth") as HTMLElement).hidden = false;
  ($("app") as HTMLElement).hidden = true;
  if (msg) $("auth-msg").textContent = msg;
}

function wireAuthButtons(): void {
  $("auth-signin").addEventListener("click", async () => {
    const email = ($("auth-email") as HTMLInputElement).value.trim();
    const pass = ($("auth-pass") as HTMLInputElement).value;
    $("auth-msg").textContent = "Connexion…";
    const { error } = await signIn(email, pass);
    if (error) {
      $("auth-msg").textContent = "Erreur : " + error.message;
      return;
    }
    supaSession = await getSession();
    window.localStorage.removeItem(SKIP_LOGIN_KEY);
    void startApp();
  });
  $("auth-signup").addEventListener("click", async () => {
    const email = ($("auth-email") as HTMLInputElement).value.trim();
    const pass = ($("auth-pass") as HTMLInputElement).value;
    $("auth-msg").textContent = "Création du compte…";
    const { error } = await signUp(email, pass);
    $("auth-msg").textContent = error
      ? "Erreur : " + error.message
      : "Compte créé. Tu peux maintenant te connecter.";
  });
  $("auth-local").addEventListener("click", () => {
    // Mode local : aucune session, tout reste sur l'appareil.
    window.localStorage.setItem(SKIP_LOGIN_KEY, "1");
    supaSession = null;
    void startApp();
  });
}

Office.onReady(async (info) => {
  if (info.host !== Office.HostType.Word) {
    setStatus("Cet add-in doit s'executer dans Word.", "err");
    return;
  }
  wireAuthButtons();
  supaSession = await getSession();
  if (supaSession) void startApp();
  else if (window.localStorage.getItem(SKIP_LOGIN_KEY)) void startApp(); // mode local memorise
  else showAuth();
});

async function startApp(): Promise<void> {
  ($("auth") as HTMLElement).hidden = true;
  ($("app") as HTMLElement).hidden = false;

  tracker = new WriteFlowTracker({ onUpdate });
  setStatus(`Pret. Plateforme : ${Office.context.platform}.`, "ok");

  // Adapte les couleurs au theme Office, et reagit aux changements de theme.
  applyOfficeTheme();
  try {
    Office.context.document.addHandlerAsync(Office.EventType.OfficeThemeChanged, () => applyOfficeTheme());
  } catch {
    /* evenement non supporte sur cette plateforme : theme applique au chargement */
  }

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
      await syncDown(); // le document est identifie -> on charge son objectif
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
    if (supaSession) {
      void syncToday(tracker!.getDailyStore(), tracker!.getCurrentDoc(), supaSession.user.id)
        .then(() => setStatus("Synchronisé avec Supabase.", "ok"))
        .catch((e) => setStatus("Sync échouée : " + (e as Error).message, "err"));
    }
  });

  $("logout").addEventListener("click", async () => {
    await signOut();
    supaSession = null;
    window.localStorage.removeItem(SKIP_LOGIN_KEY); // on ressort du mode local aussi
    if (tracker && tracker.isRunning()) await tracker.stop();
    showAuth("Déconnecté.");
  });

  // Connecte : on charge les reglages globaux du compte.
  if (supaSession) await syncDown();
}
