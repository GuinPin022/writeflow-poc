import { TrackEvent } from "./types";

/**
 * Journal en memoire des evenements de tracking, avec export CSV/JSON.
 * Sert a comparer la mesure a la "verite terrain" saisie a la main.
 */
export class TrackLogger {
  private events: TrackEvent[] = [];

  add(event: TrackEvent): void {
    this.events.push(event);
    // Visible en direct dans la console (F12) pendant les tests.
    // eslint-disable-next-line no-console
    console.log(
      `[#${event.tick}] ${event.source} | total=${event.totalWords} delta=${event.delta} ` +
        `dt=${event.msSinceLastEvent}ms ` +
        `| VITESSE=${event.classification} (${event.wordsPerSecond.toFixed(1)} mots/s) ` +
        `| EVENEMENT=${event.classificationEvent} ` +
        `| COMBINE=${event.classificationCombined} ` +
        `| lat=${event.latencyMs.toFixed(0)}ms`
    );
  }

  count(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
  }

  /** Affiche un tableau recapitulatif dans la console. */
  table(): void {
    // eslint-disable-next-line no-console
    console.table(this.events);
  }

  toJson(): string {
    return JSON.stringify(this.events, null, 2);
  }

  toCsv(): string {
    const headers = [
      "ts",
      "tick",
      "source",
      "totalWords",
      "delta",
      "elapsedMs",
      "wordsPerSecond",
      "msSinceLastEvent",
      "classif_VITESSE",
      "classif_EVENEMENT",
      "classif_COMBINE",
      "typedCumul_VITESSE",
      "typedCumul_EVENEMENT",
      "typedCumul_COMBINE",
      "latencyMs",
      "platform",
      "sessionState",
    ];
    const rows = this.events.map((e) =>
      [
        e.ts,
        e.tick,
        e.source,
        e.totalWords,
        e.delta,
        e.elapsedMs,
        e.wordsPerSecond.toFixed(2),
        e.msSinceLastEvent,
        e.classification,
        e.classificationEvent,
        e.classificationCombined,
        e.typedProductionCumulative,
        e.typedProductionEventCumulative,
        e.typedProductionCombinedCumulative,
        e.latencyMs.toFixed(0),
        e.platform,
        e.sessionState,
      ].join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  /** Declenche le telechargement d'un fichier (CSV ou JSON) cote navigateur. */
  download(kind: "csv" | "json"): void {
    const content = kind === "csv" ? this.toCsv() : this.toJson();
    const mime = kind === "csv" ? "text/csv" : "application/json";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `writeflow-poc-${stamp}.${kind}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
