// Paliers gamifies par theme.
//
// Tous les themes partagent la MEME echelle de pourcentages de l'objectif quotidien :
//   25, 50, 75, 100, 110, 125, 150, 175, 200, 250
// Chaque theme fournit 10 paliers { p:%, e:emoji, n:nom }.
//
// Le palier affiche dans l'onglet Document depend de l'objectif quotidien et des
// mots ecrits aujourd'hui. La logique de calcul (computeTier) est pure et testable ;
// le rendu (palierTrackerHtml) ne produit qu'une chaine HTML, sans dependance DOM.

export interface Tier {
  /** Seuil en % de l'objectif quotidien. */
  p: number;
  /** Emoji du palier. */
  e: string;
  /** Nom du palier. */
  n: string;
}

export interface Theme {
  label: string;
  tiers: Tier[];
}

export const DEFAULT_THEME = "brume-onde";

export const THEMES: Record<string, Theme> = {
  "brume-onde": {
    label: "Brume & Onde",
    tiers: [
      { p: 25, e: "🔱", n: "Recrue" },
      { p: 50, e: "🗡️", n: "Guerrier" },
      { p: 75, e: "🛡️", n: "Gardien" },
      { p: 100, e: "✨", n: "Enchanteur" },
      { p: 110, e: "🔥", n: "Mage" },
      { p: 125, e: "🧙‍♀️", n: "Sorcière" },
      { p: 150, e: "🧜🏻‍♀️", n: "Selkie" },
      { p: 175, e: "🍁", n: "Druidesse" },
      { p: 200, e: "🧚🏻‍♀️", n: "Fée" },
      { p: 250, e: "🐺", n: "Meneuse de Loups" },
    ],
  },
  technologie: {
    label: "Technologie",
    tiers: [
      { p: 25, e: "🔩", n: "Clou" },
      { p: 50, e: "🔦", n: "Lampe de poche" },
      { p: 75, e: "📼", n: "K7" },
      { p: 100, e: "🧹", n: "Aspirateur robot" },
      { p: 110, e: "📱", n: "Smartphone" },
      { p: 125, e: "💻", n: "Ordinateur" },
      { p: 150, e: "🤓", n: "ChatGPT" },
      { p: 175, e: "🤖", n: "Androïde" },
      { p: 200, e: "🦾", n: "Cyborg" },
      { p: 250, e: "✨", n: "Deus ex-machina" },
    ],
  },
  medieval: {
    label: "Médiéval",
    tiers: [
      { p: 25, e: "🌾", n: "Glaneuse" },
      { p: 50, e: "🗡️", n: "Écuyère" },
      { p: 75, e: "🛡️", n: "Sentinelle" },
      { p: 100, e: "🏰", n: "Châtelaine" },
      { p: 110, e: "🏹", n: "Chasseresse" },
      { p: 125, e: "⚜️", n: "Chevaleresse" },
      { p: 150, e: "👑", n: "Reine" },
      { p: 175, e: "🐎", n: "Amazone" },
      { p: 200, e: "⚔️", n: "Walkyrie" },
      { p: 250, e: "🐉", n: "Dame des Dragons" },
    ],
  },
  science: {
    label: "Science",
    tiers: [
      { p: 25, e: "🧪", n: "Apprentie" },
      { p: 50, e: "🔬", n: "Laborantine" },
      { p: 75, e: "📚", n: "Érudite" },
      { p: 100, e: "🎓", n: "Docteure" },
      { p: 110, e: "⚗️", n: "Alchimiste" },
      { p: 125, e: "💡", n: "Inventrice" },
      { p: 150, e: "⚛️", n: "Visionnaire" },
      { p: 175, e: "🛰️", n: "Pionnière" },
      { p: 200, e: "🌟", n: "Prodige" },
      { p: 250, e: "🌌", n: "Déesse du Savoir" },
    ],
  },
  romance: {
    label: "Romance",
    tiers: [
      { p: 25, e: "👀", n: "Œillade" },
      { p: 50, e: "😊", n: "Idylle" },
      { p: 75, e: "💌", n: "Confidente" },
      { p: 100, e: "💘", n: "Amoureuse" },
      { p: 110, e: "🌹", n: "Prétendante" },
      { p: 125, e: "💑", n: "Bien-aimée" },
      { p: 150, e: "💍", n: "Fiancée" },
      { p: 175, e: "💞", n: "Âme sœur" },
      { p: 200, e: "👰", n: "Mariée" },
      { p: 250, e: "❤️‍🔥", n: "Muse Éternelle" },
    ],
  },
  fantastique: {
    label: "Fantastique",
    tiers: [
      { p: 25, e: "🍄", n: "Lutine" },
      { p: 50, e: "🧝‍♀️", n: "Elfe" },
      { p: 75, e: "🌿", n: "Nymphe" },
      { p: 100, e: "🦄", n: "Licorne" },
      { p: 110, e: "🧞‍♀️", n: "Génie" },
      { p: 125, e: "🐉", n: "Dragonne" },
      { p: 150, e: "🔮", n: "Archimage" },
      { p: 175, e: "🔥", n: "Phénix" },
      { p: 200, e: "⚡", n: "Titane" },
      { p: 250, e: "🌌", n: "Déesse" },
    ],
  },
  meteo: {
    label: "Météo",
    tiers: [
      { p: 25, e: "🌫️", n: "Brume" },
      { p: 50, e: "🌬️", n: "Brise" },
      { p: 75, e: "🌦️", n: "Ondée" },
      { p: 100, e: "🌧️", n: "Averse" },
      { p: 110, e: "💨", n: "Bourrasque" },
      { p: 125, e: "⚡", n: "Foudre" },
      { p: 150, e: "🌩️", n: "Tonnerre" },
      { p: 175, e: "❄️", n: "Reine des Givres" },
      { p: 200, e: "🌪️", n: "Tornade" },
      { p: 250, e: "🌀", n: "Déesse des Tempêtes" },
    ],
  },
};

export interface TierState {
  pct: number;
  idx: number; // index du palier courant, -1 si aucun
  cur: Tier | null;
  next: Tier | null;
  seg: number; // progression 0..100 a l'interieur du segment courant->suivant
  nextWords: number; // mots requis pour atteindre le palier suivant
}

/** Calcule le palier courant et la progression vers le suivant. */
export function computeTier(tiers: Tier[], words: number, goal: number): TierState {
  const pct = goal > 0 ? (words / goal) * 100 : 0;
  let idx = -1;
  for (let i = 0; i < tiers.length; i++) {
    if (pct >= tiers[i].p) idx = i;
    else break;
  }
  const cur = idx >= 0 ? tiers[idx] : null;
  const next = idx + 1 < tiers.length ? tiers[idx + 1] : null;
  const lowerP = cur ? cur.p : 0;
  const upperP = next ? next.p : tiers[tiers.length - 1].p;
  const seg = next ? Math.max(0, Math.min(100, ((pct - lowerP) / (upperP - lowerP)) * 100)) : 100;
  const nextWords = Math.ceil((goal * upperP) / 100);
  return { pct, idx, cur, next, seg, nextWords };
}

/**
 * Bloc HTML du tracker de paliers.
 * @param words mots du jour pris en compte (par defaut : "Mots Word" du jour)
 * @param goal  objectif quotidien
 * @param themeKey cle du theme selectionne
 */
export function palierTrackerHtml(words: number, goal: number, themeKey: string): string {
  const theme = THEMES[themeKey] || THEMES[DEFAULT_THEME];
  const r = computeTier(theme.tiers, words, goal);
  const curEmoji = r.cur ? r.cur.e : "🌱";
  const curName = r.cur ? r.cur.n : "Pas encore de palier";
  const last = theme.tiers[theme.tiers.length - 1];

  const meta = r.next
    ? `<span class="pl-left">${words} / ${r.nextWords} mots (${Math.round(r.seg)}%)</span>
       <span class="pl-right"><span class="pl-w">à gagner</span><span class="pl-next">${r.next.e}</span></span>`
    : `<span class="pl-left">Palier maximum atteint ${last.e}</span>`;

  const strip = theme.tiers
    .map((t, i) => {
      const reached = r.pct >= t.p;
      const cls = `pl-cell ${reached ? "reached" : "locked"}${i === r.idx ? " current" : ""}`;
      const need = Math.ceil((goal * t.p) / 100);
      return `<span class="${cls}" title="${t.n} — ${t.p}% (${need} mots)">${t.e}</span>`;
    })
    .join("");

  return `
    <div class="dash-section-label">Palier du jour</div>
    <div class="pl">
      <div class="pl-cur">
        <div class="pl-emo">${curEmoji}</div>
        <div class="pl-id">
          <div class="pl-lab">Vous êtes au palier</div>
          <div class="pl-name">${curName}</div>
        </div>
        <div class="pl-pct">${Math.round(r.pct)}%</div>
      </div>
      <div class="pl-bar"><i style="width:${Math.round(r.seg)}%"></i></div>
      <div class="pl-meta">${meta}</div>
      <div class="pl-strip">${strip}</div>
    </div>`;
}
