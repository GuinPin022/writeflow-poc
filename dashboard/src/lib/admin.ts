// Acces a l'annuaire des profils publics (Stravwords).
//
// Etat actuel : reserve a l'ADMIN (toi). L'onglet "Explorer" n'apparait que pour
// les comptes listes dans ADMIN_EMAILS.
//
// POUR L'OUVRIR A TOUS plus tard (Phase 3) : passe PUBLIC_EXPLORE a true.
// L'onglet devient alors visible pour tout le monde. (Si tu veux qu'il soit
// accessible meme sans connexion, il faudra aussi sortir la route du verrou de
// login, comme la page /u/<pseudo>.)

// Email(s) admin — DOIT correspondre a l'email de connexion du dashboard
// (le meme que dans l'add-in Word).
export const ADMIN_EMAILS = ["c.piemontesi@gmail.com"];

// Bascule globale : false = annuaire admin seulement ; true = page "Explorer" pour tous.
export const PUBLIC_EXPLORE = false;

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return ADMIN_EMAILS.some((a) => a.toLowerCase() === e);
}

/** Qui a le droit de voir l'onglet/page Explorer. */
export function canSeeExplore(email: string | null | undefined): boolean {
  return PUBLIC_EXPLORE || isAdmin(email);
}
