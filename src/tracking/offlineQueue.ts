import { TrackEvent } from "./types";

/**
 * File de persistance locale pour le mode hors-ligne (scenario du protocole).
 * POC: simple localStorage. En production -> IndexedDB (volumes plus gros, async).
 *
 * Objectif du test: ecrire reseau coupe, verifier qu'aucun evenement n'est perdu
 * et que la file se vide ("flush") a la reconnexion.
 */
const STORAGE_KEY = "writeflow_poc_offline_queue";

export class OfflineQueue {
  private online = true;

  /** Simule une coupure / un retour reseau pendant les tests. */
  setOnline(value: boolean): void {
    this.online = value;
  }

  isOnline(): boolean {
    return this.online;
  }

  private read(): TrackEvent[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as TrackEvent[]) : [];
    } catch {
      return [];
    }
  }

  private write(items: TrackEvent[]): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  /** Empile un evenement; il sera "envoye" immediatement si en ligne, sinon stocke. */
  enqueue(event: TrackEvent): void {
    const items = this.read();
    items.push(event);
    this.write(items);
    if (this.online) {
      this.flush();
    }
  }

  pendingCount(): number {
    return this.read().length;
  }

  /**
   * Vide la file vers le "serveur". Ici on simule un POST reussi en supprimant
   * les elements. Remplacer par un vrai appel API idempotent (UUID + timestamp).
   */
  flush(): number {
    if (!this.online) return 0;
    const items = this.read();
    const sent = items.length;
    // TODO production: POST /api/v1/sessions avec idempotence cote serveur.
    this.write([]);
    return sent;
  }
}
