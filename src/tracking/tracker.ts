import {
  Classification,
  DEFAULT_CONFIG,
  TrackerConfig,
  TrackerSnapshot,
  TrackEvent,
} from "./types";
import { TrackLogger } from "./logger";
import { OfflineQueue } from "./offlineQueue";
import { DailyStore, DocData } from "./dailyStore";

/* global Word, Office */

/** Generateur d'UUID v4 simple (suffisant pour identifier un document). */
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Moteur de tracking POC — approche HYBRIDE :
 *   1. Releve periodique (polling) du nombre de mots via body.text + diff.
 *   2. Evenements paragraphe (WordApi 1.5) detectes a l'execution s'ils existent,
 *      pour declencher un releve immediat et mesurer la reactivite.
 *   3. Classification du delta (frappe / collage / suppression) par heuristique
 *      double : seuil absolu + vitesse (mots/s).
 *
 * Le but du POC est de MESURER la justesse de cette logique, pas de la croire.
 */
export class WriteFlowTracker {
  private config: TrackerConfig;
  private logger: TrackLogger;
  private queue: OfflineQueue;
  private daily: DailyStore;

  private pollHandle: number | null = null;
  // Resultats d'enregistrement d'evenements Word, pour desinscription propre.
  // Type volontairement souple : les typings Office.js varient selon les versions.
  private eventResults: Array<{ context: OfficeExtension.ClientRequestContext; remove: () => void }> = [];
  private running = false;

  private tick = 0;
  private lastWordCount = 0;
  private lastSnapshotTime = 0;
  private lastActivityTime = 0;
  // Modele VITESSE
  private typedProduction = 0;
  private pastedWords = 0;
  // Modele EVENEMENT (en parallele, pour comparaison)
  private typedProductionEvent = 0;
  private pastedWordsEvent = 0;
  // Modele COMBINE (volume + isolement temporel)
  private typedProductionCombined = 0;
  private pastedWordsCombined = 0;
  // Commun
  private deletedWords = 0;
  private cutWords = 0;
  private lastEventTime = 0;
  private sessionActive = false;
  // Identite du document courant (pour le comptage par document).
  private currentDocId = "";
  private currentDocName = "Document";
  private persistTimer: number | null = null;

  private onUpdate?: (s: TrackerSnapshot) => void;

  constructor(opts?: {
    config?: Partial<TrackerConfig>;
    logger?: TrackLogger;
    queue?: OfflineQueue;
    daily?: DailyStore;
    onUpdate?: (s: TrackerSnapshot) => void;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...(opts?.config ?? {}) };
    this.logger = opts?.logger ?? new TrackLogger();
    this.queue = opts?.queue ?? new OfflineQueue();
    this.daily = opts?.daily ?? new DailyStore();
    this.onUpdate = opts?.onUpdate;
  }

  getLogger(): TrackLogger {
    return this.logger;
  }

  getQueue(): OfflineQueue {
    return this.queue;
  }

  getDailyStore(): DailyStore {
    return this.daily;
  }

  getCurrentDoc(): { id: string; name: string } {
    return { id: this.currentDocId, name: this.currentDocName };
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Ecrit immediatement les donnees du document courant dans les settings du fichier. */
  private persistDocNow(): void {
    if (!this.currentDocId) return;
    try {
      const data = this.daily.exportDoc(this.currentDocId);
      if (data) {
        Office.context.document.settings.set("writeflow_doc_data", data);
        Office.context.document.settings.saveAsync();
      }
    } catch {
      /* persistance best-effort */
    }
  }

  /** Planifie une ecriture (anti-rebond) vers les settings du fichier. */
  private persistDocSoon(): void {
    if (this.persistTimer !== null) return;
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      this.persistDocNow();
    }, 3000);
  }

  /**
   * Resout l'identite du document courant :
   *  - un GUID stocke dans les settings du document (persiste DANS le fichier) ;
   *  - le nom de fichier pour l'affichage (vide si le doc n'est pas enregistre).
   */
  private resolveDocument(): Promise<void> {
    return new Promise((resolve) => {
      // 1) GUID stable via les settings du document.
      try {
        const settings = Office.context.document.settings;
        let id = settings.get("writeflow_doc_id") as string | null;
        if (!id) {
          id = uuidv4();
          settings.set("writeflow_doc_id", id);
          settings.saveAsync(() => {
            /* persistance best-effort : ignore le resultat */
          });
        }
        this.currentDocId = id;
        // Hydratation depuis les settings du fichier (synchronises via OneDrive).
        const saved = settings.get("writeflow_doc_data");
        if (saved) this.daily.importDoc(this.currentDocId, saved as DocData);
      } catch {
        this.currentDocId = this.currentDocId || uuidv4();
      }

      // 2) Nom d'affichage via l'URL du fichier (best-effort).
      try {
        Office.context.document.getFilePropertiesAsync((res) => {
          let name = "Document sans nom";
          if (res.status === Office.AsyncResultStatus.Succeeded && res.value && res.value.url) {
            const parts = res.value.url.split(/[\\/]/);
            name = parts[parts.length - 1] || res.value.url;
          }
          this.currentDocName = name;
          this.daily.registerDoc(this.currentDocId, name);
          resolve();
        });
      } catch {
        this.daily.registerDoc(this.currentDocId, this.currentDocName);
        resolve();
      }
    });
  }

  /**
   * Retire les passages marques comme NOTES avant tout comptage.
   * Convention B1 : le texte entre marqueurs (meme sur plusieurs lignes) n'est pas
   * compte. On remplace par une espace pour ne pas coller les mots voisins.
   *
   * Deux temps :
   *  1) on retire toutes les paires FERMEES (NOTE_PATTERNS).
   *  2) pour les marqueurs RARES (SAFE_OPENERS), on masque aussi un ouvreur NON
   *     ferme jusqu'a la fin du texte : ainsi une note en cours de frappe ne compte
   *     jamais, meme transitoirement. Sans ca, les mots comptes le temps d'ouvrir la
   *     note gonflent le compteur "productif" (qui, contrairement au net, ne rembourse
   *     jamais un delta negatif). Reserve aux marqueurs rares : un simple "#" ou "//"
   *     egare masquerait tout le reste du document.
   */
  static stripNotes(text: string): string {
    if (!text) return text;
    let out = text;
    // 0) Note "ligne entiere" : toute ligne commencant par // (sans fermeture,
    //    bornee par la fin de ligne). Sur -> les URL commencent par http://... donc
    //    le // n'y est jamais en debut de ligne.
    out = out.replace(WriteFlowTracker.NOTE_LINE, " ");
    // 1) Paires fermees. 2) Ouvreur non ferme masque jusqu'a la fin (note en cours
    //    de frappe -> jamais comptee, meme transitoirement, donc le "productif" ne
    //    gonfle pas). Reserve a ces marqueurs rares : un caractere frequent egare
    //    masquerait tout le reste du document.
    for (const pattern of WriteFlowTracker.NOTE_PAIRS) out = out.replace(pattern, " ");
    for (const opener of WriteFlowTracker.NOTE_OPENERS) out = out.replace(opener, " ");
    return out;
  }

  /** Note "ligne entiere" : une ligne qui COMMENCE par // (apres espaces eventuels). */
  private static readonly NOTE_LINE = /^[ \t]*\/\/.*$/gm;

  /** Marqueurs de note — paires fermees. Non-greedy : matche la plus petite paire. */
  private static readonly NOTE_PAIRS: readonly RegExp[] = [
    /\[\[[\s\S]*?\]\]/g, // [[ ... ]]
    /\{\{[\s\S]*?\}\}/g, // {{ ... }}
    /##[\s\S]*?##/g, //    ## ... ##
  ];

  /** Ouvreurs non fermes : masques jusqu'a la fin du texte (voir stripNotes). */
  private static readonly NOTE_OPENERS: readonly RegExp[] = [
    /\[\[[\s\S]*$/, // [[ sans ]]
    /\{\{[\s\S]*$/, // {{ sans }}
    /##[\s\S]*$/, //  ## sans ##
  ];

  /** Compte les mots d'un texte. Strategie POC : separation sur espaces/sauts. */
  static countWords(text: string): number {
    if (!text) return 0;
    const tokens = text
      .replace(/[\u00A0]/g, " ") // espaces insecables
      .trim()
      .split(/\s+/)
      .filter((t) => /[\p{L}\p{N}]/u.test(t)); // garde ce qui contient lettre/chiffre
    return tokens.length;
  }

  private platform(): string {
    try {
      return Office.context.platform ? String(Office.context.platform) : "unknown";
    } catch {
      return "unknown";
    }
  }

  /** [Modele VITESSE] Classification par seuil absolu OU vitesse (mots/s). */
  private classifyByRate(delta: number, elapsedMs: number): Classification {
    if (delta < 0) return "deletion";
    if (delta === 0) return "noise";
    const seconds = Math.max(elapsedMs / 1000, 0.001);
    const wps = delta / seconds;
    if (delta >= this.config.absolutePasteThresholdWords) return "paste";
    if (wps > this.config.maxTypingWordsPerSecond) return "paste";
    return "typed";
  }

  /**
   * [Modele EVENEMENT] Classification par volume livre en un seul evenement.
   * Insensible au timing. Pour un releve periodique (poll), le delta est un agregat
   * sur 30 s : on retombe sur le seuil absolu faute de pouvoir juger l'atomicite.
   */
  private classifyByEvent(delta: number, source: TrackEvent["source"]): Classification {
    if (delta < 0) return "deletion";
    if (delta === 0) return "noise";
    if (source === "poll") {
      return delta >= this.config.absolutePasteThresholdWords ? "paste" : "typed";
    }
    // Evenement Word atomique : un gros bloc d'un coup = collage.
    return delta >= this.config.perEventPasteThresholdWords ? "paste" : "typed";
  }

  /**
   * [Modele COMBINE] Corrige les deux angles morts :
   *   - petit collage apres pause -> evenement isole (dtEvent grand) = collage
   *   - frappe tres rapide groupee par Word -> flux d'evenements rapproches = frappe
   */
  private classifyCombined(delta: number, source: TrackEvent["source"], dtEvent: number): Classification {
    if (delta < 0) return "deletion";
    if (delta === 0) return "noise";
    if (delta >= this.config.absolutePasteThresholdWords) return "paste";
    if (source === "poll") return "typed"; // agregat 30 s : pas d'atomicite jugeable
    if (delta >= this.config.perEventPasteThresholdWords && dtEvent > this.config.isolatedEventGapMs) {
      return "paste";
    }
    return "typed";
  }

  /** Lit le document et renvoie {wordCount, latencyMs}. */
  private async readDocument(): Promise<{ wordCount: number; latencyMs: number }> {
    const start = performance.now();
    const wordCount = await Word.run(async (context) => {
      const body = context.document.body;
      body.load("text");
      await context.sync();
      // On filtre d'abord les notes ([[ ... ]]) : elles ne comptent pas.
      return WriteFlowTracker.countWords(WriteFlowTracker.stripNotes(body.text));
    });
    return { wordCount, latencyMs: performance.now() - start };
  }

  /** Coeur de la mesure : appele par le polling et par les evenements. */
  private async snapshot(source: TrackEvent["source"]): Promise<void> {
    let read: { wordCount: number; latencyMs: number };
    try {
      read = await this.readDocument();
    } catch (e) {
       
      console.error("Echec releve Word:", e);
      return;
    }

    const now = Date.now();
    const elapsedMs = this.lastSnapshotTime ? now - this.lastSnapshotTime : 0;
    const delta = read.wordCount - this.lastWordCount;
    const seconds = Math.max(elapsedMs / 1000, 0.001);
    const wordsPerSecond = delta > 0 ? delta / seconds : 0;
    // Temps depuis le dernier EVENEMENT (polls exclus) : mesure d'isolement.
    const msSinceLastEvent = this.lastEventTime ? now - this.lastEventTime : 0;
    const dtEvent = this.lastEventTime ? now - this.lastEventTime : Number.MAX_SAFE_INTEGER;

    let classification = this.classifyByRate(delta, elapsedMs);
    let classificationEvent = this.classifyByEvent(delta, source);
    let classificationCombined = this.classifyCombined(delta, source, dtEvent);

    // Distinction coupe (suppression atomique en un evenement) vs effacement manuel.
    if (delta < 0) {
      const atomicCut =
        source !== "poll" && -delta >= this.config.perEventPasteThresholdWords;
      const delClass: Classification = atomicCut ? "cut" : "deletion";
      classification = delClass;
      classificationEvent = delClass;
      classificationCombined = delClass;
    }

    // Gestion de session (inactivite).
    let sessionState: TrackEvent["sessionState"] = "ongoing";
    const idle = this.lastActivityTime ? now - this.lastActivityTime : 0;
    if (!this.sessionActive) {
      this.sessionActive = true;
      sessionState = "started";
    } else if (idle > this.config.idleTimeoutMs && delta === 0) {
      this.sessionActive = false;
      sessionState = "idle-closed";
    }

    const docId = this.currentDocId || "unknown";
    // Compteur NET (selon Word) : nombre de mots courant + variation nette du jour.
    this.daily.setDocCount(docId, read.wordCount);
    if (delta !== 0) this.daily.addNet(docId, delta);

    if (delta > 0) {
      // Productions positives : chaque modele ventile entre tape et colle.
      if (classification === "typed") this.typedProduction += delta;
      else this.pastedWords += delta;
      if (classificationEvent === "typed") this.typedProductionEvent += delta;
      else this.pastedWordsEvent += delta;
      if (classificationCombined === "typed") this.typedProductionCombined += delta;
      else this.pastedWordsCombined += delta;

      // Tableau de bord : mots PRODUCTIFS = toutes les additions (sans distinction).
      this.daily.addProductive(docId, delta);
      // [POC] Ventilation fine conservee (tape vs colle) pour l'onglet POC.
      if (classificationEvent === "typed") this.daily.addTyped(docId, delta);
      else this.daily.addPasted(docId, delta);
    } else if (delta < 0) {
      // Suppressions : compteurs communs (coupe vs effacement). Production tapee inchangee.
      if (classificationCombined === "cut") {
        this.cutWords += -delta;
        this.daily.addCut(docId, -delta);
      } else {
        this.deletedWords += -delta;
      }
    }

    if (delta !== 0) {
      this.lastActivityTime = now;
      this.persistDocSoon(); // sauvegarde vers les settings du fichier (OneDrive)
    }
    if (source !== "poll") this.lastEventTime = now;

    const event: TrackEvent = {
      ts: new Date(now).toISOString(),
      tick: ++this.tick,
      source,
      totalWords: read.wordCount,
      delta,
      elapsedMs,
      wordsPerSecond,
      classification,
      classificationEvent,
      classificationCombined,
      msSinceLastEvent,
      typedProductionCumulative: this.typedProduction,
      typedProductionEventCumulative: this.typedProductionEvent,
      typedProductionCombinedCumulative: this.typedProductionCombined,
      latencyMs: read.latencyMs,
      platform: this.platform(),
      sessionState,
    };

    this.logger.add(event);
    this.queue.enqueue(event);

    this.lastWordCount = read.wordCount;
    this.lastSnapshotTime = now;
    this.lastKnownLatency = read.latencyMs;

    this.emit();
  }

  private emit(): void {
    this.onUpdate?.({
      totalWords: this.lastWordCount,
      typedProduction: this.typedProduction,
      pastedWords: this.pastedWords,
      typedProductionEvent: this.typedProductionEvent,
      pastedWordsEvent: this.pastedWordsEvent,
      typedProductionCombined: this.typedProductionCombined,
      pastedWordsCombined: this.pastedWordsCombined,
      deletedWords: this.deletedWords,
      cutWords: this.cutWords,
      ticks: this.tick,
      lastLatencyMs: this.logger.count() ? this.lastLatency() : 0,
      sessionActive: this.sessionActive,
      eventsCount: this.logger.count(),
    });
  }

  private lastLatency(): number {
    // Petit utilitaire : derniere latence connue, sinon 0.
    return this.lastKnownLatency;
  }
  private lastKnownLatency = 0;

  /** Enregistre les evenements paragraphe si l'API les supporte (WordApi 1.5). */
  private async registerEvents(): Promise<void> {
    const supports15 =
      Office.context.requirements && Office.context.requirements.isSetSupported("WordApi", "1.5");
    if (!supports15) {
       
      console.warn(
        "WordApi 1.5 non supporte sur cette plateforme : mode polling seul. " +
          "Resultat a documenter dans la matrice cross-plateforme."
      );
      return;
    }

    try {
      await Word.run(async (context) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = context.document as any;
        this.eventResults.push(doc.onParagraphChanged.add(() => this.snapshot("paragraphChanged")));
        this.eventResults.push(doc.onParagraphAdded.add(() => this.snapshot("paragraphAdded")));
        this.eventResults.push(doc.onParagraphDeleted.add(() => this.snapshot("paragraphDeleted")));
        await context.sync();
      });
    } catch (e) {
       
      console.warn("Enregistrement des evenements paragraphe echoue, polling seul:", e);
    }

    // Signal d'activite large (supporte tres largement) : changement de selection.
    try {
      Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, () => {
        this.lastActivityTime = Date.now();
      });
    } catch {
      /* non bloquant */
    }
  }

  /** Demarre le tracking : releve initial + evenements + boucle de polling. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.resolveDocument();

    const initial = await this.readDocument();
    this.lastWordCount = initial.wordCount;
    this.lastKnownLatency = initial.latencyMs;
    this.lastSnapshotTime = Date.now();
    this.lastActivityTime = Date.now();
    this.lastEventTime = Date.now();
    this.emit();

    await this.registerEvents();

    this.pollHandle = window.setInterval(() => {
      void this.snapshot("poll");
    }, this.config.pollIntervalMs);
  }

  /** Force un releve immediat (bouton "Relever maintenant" pour les tests courts). */
  async sampleNow(): Promise<void> {
    await this.snapshot("poll");
  }

  async stop(): Promise<void> {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    // Flush immediat des donnees du document vers les settings du fichier.
    if (this.persistTimer !== null) {
      window.clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistDocNow();
    // Desabonnement des evenements Word. Pattern runtime officiel :
    // Word.run(result.context, ...). Les typings n'exposent pas cet overload,
    // d'ou le cast (sans impact a l'execution).
    for (const result of this.eventResults) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (Word as any).run(result.context, async (context: Word.RequestContext) => {
          result.remove();
          await context.sync();
        });
      } catch {
        /* ignore */
      }
    }
    this.eventResults = [];
    this.running = false;
    this.sessionActive = false;
    this.emit();
  }

  reset(): void {
    this.tick = 0;
    this.lastWordCount = 0;
    this.lastSnapshotTime = 0;
    this.lastActivityTime = 0;
    this.typedProduction = 0;
    this.pastedWords = 0;
    this.typedProductionEvent = 0;
    this.pastedWordsEvent = 0;
    this.typedProductionCombined = 0;
    this.pastedWordsCombined = 0;
    this.deletedWords = 0;
    this.cutWords = 0;
    this.lastEventTime = 0;
    this.logger.clear();
    this.emit();
  }
}
