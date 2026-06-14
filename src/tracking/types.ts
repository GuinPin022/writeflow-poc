// Types partages du moteur de tracking POC.

/** Comment un delta de mots est classe par l'heuristique. */
//  - typed    : production tapee
//  - paste    : collage / import
//  - deletion : effacement manuel (clavier, mot par mot)
//  - cut      : suppression atomique d'un bloc en un seul evenement (Ctrl-X, selection+suppr)
//  - noise    : aucun changement
export type Classification = "typed" | "paste" | "deletion" | "cut" | "noise";

/** Modele de comptage de la production. */
export type ProductionModel = "real" | "net";
//  - "real" : production reelle. Les suppressions ne retirent pas les mots deja produits.
//  - "net"  : production nette. current = max courant (utile comme point de comparaison).

export interface TrackerConfig {
  /** Intervalle de releve periodique (ms). Defaut 30 s, comme le cahier des charges. */
  pollIntervalMs: number;
  /** Au-dela de ce delta sur un seul releve -> presume collage/import. */
  absolutePasteThresholdWords: number;
  /** [Modele VITESSE] Vitesse de frappe humaine max plausible (mots/s). Au-dela -> collage. */
  maxTypingWordsPerSecond: number;
  /**
   * [Modele EVENEMENT] Au-dela de ce nb de mots livres en UN SEUL evenement -> collage.
   * Insensible au timing : une frappe genere ~1 mot par evenement, un collage en livre
   * plusieurs d'un coup. Capte les petits collages que le modele vitesse rate apres une pause.
   */
  perEventPasteThresholdWords: number;
  /**
   * [Modele COMBINE] Un evenement est juge "isole" si rien n'a bouge depuis ce delai.
   * Sert a distinguer un petit collage (evenement isole apres un silence) d'une frappe
   * tres rapide groupee par Word (flux d'evenements rapproches). Defaut 2,5 s.
   */
  isolatedEventGapMs: number;
  /** Inactivite au-dela de laquelle la session se termine (ms). Defaut 15 min. */
  idleTimeoutMs: number;
  /** Modele de production retenu. */
  productionModel: ProductionModel;
}

export const DEFAULT_CONFIG: TrackerConfig = {
  pollIntervalMs: 30_000,
  absolutePasteThresholdWords: 40,
  maxTypingWordsPerSecond: 5,
  perEventPasteThresholdWords: 6,
  isolatedEventGapMs: 2_500,
  idleTimeoutMs: 15 * 60_000,
  productionModel: "real",
};

/** Un evenement journalise a chaque releve ou evenement Word. */
export interface TrackEvent {
  /** ISO timestamp. */
  ts: string;
  /** Numero de releve depuis le demarrage. */
  tick: number;
  /** Source du declenchement. */
  source: "poll" | "paragraphChanged" | "paragraphAdded" | "paragraphDeleted" | "selectionChanged";
  /** Nombre de mots total du document a ce releve. */
  totalWords: number;
  /** Variation depuis le releve precedent. */
  delta: number;
  /** Temps ecoule depuis le releve precedent (ms). */
  elapsedMs: number;
  /** Vitesse implicite (mots/s) du delta. */
  wordsPerSecond: number;
  /** [Modele VITESSE] Classification de ce delta (seuil absolu OU vitesse). */
  classification: Classification;
  /** [Modele EVENEMENT] Classification de ce delta (volume par evenement). */
  classificationEvent: Classification;
  /** [Modele COMBINE] Classification de ce delta (volume + isolement temporel). */
  classificationCombined: Classification;
  /** Temps depuis l'evenement precedent (ms) — sert au modele combine. */
  msSinceLastEvent: number;
  /** Production tapee cumulee — modele VITESSE. */
  typedProductionCumulative: number;
  /** Production tapee cumulee — modele EVENEMENT. */
  typedProductionEventCumulative: number;
  /** Production tapee cumulee — modele COMBINE. */
  typedProductionCombinedCumulative: number;
  /** Latence du releve Word (ms) — perf de body.text + sync. */
  latencyMs: number;
  /** Plateforme detectee. */
  platform: string;
  /** Etat de session: nouvelle / en cours / fermee par inactivite. */
  sessionState: "started" | "ongoing" | "idle-closed";
}

/** Snapshot d'etat pousse a l'UI. */
export interface TrackerSnapshot {
  totalWords: number;
  // Modele VITESSE
  typedProduction: number;
  pastedWords: number;
  // Modele EVENEMENT
  typedProductionEvent: number;
  pastedWordsEvent: number;
  // Modele COMBINE
  typedProductionCombined: number;
  pastedWordsCombined: number;
  // Commun
  deletedWords: number;
  cutWords: number;
  ticks: number;
  lastLatencyMs: number;
  sessionActive: boolean;
  eventsCount: number;
}
