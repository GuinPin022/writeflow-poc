// Paliers gamifies par theme — repris de l'add-in (writeflow-poc/src/tracking/paliers.ts).
// 10 paliers a des seuils fixes en % de l'objectif quotidien.

export interface Tier {
  p: number;
  e: string;
  n: string;
}

export const DEFAULT_THEME = "brume-onde";

export const THEMES: Record<string, Tier[]> = {
  "brume-onde": [
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
  technologie: [
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
  medieval: [
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
  science: [
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
  romance: [
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
  fantastique: [
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
  meteo: [
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
};

/** Index du palier atteint (-1 si aucun), d'apres les mots (Word) vs objectif. */
export function tierIndex(words: number, goal: number): number {
  const pct = goal > 0 ? (words / goal) * 100 : 0;
  const tiers = THEMES[DEFAULT_THEME];
  let idx = -1;
  for (let i = 0; i < tiers.length; i++) {
    if (pct >= tiers[i].p) idx = i;
    else break;
  }
  return idx;
}

/** Palier (emoji + nom) pour un theme et un index donnes. */
export function tierAt(theme: string, idx: number): Tier {
  const tiers = THEMES[theme] || THEMES[DEFAULT_THEME];
  return tiers[idx];
}
