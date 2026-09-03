// Paliers gamifies par theme — repris de l'add-in (writeflow-poc/src/tracking/paliers.ts).
// 10 paliers a des seuils fixes en % de l'objectif quotidien.

export interface Tier {
  p: number;
  e: string;
  n: string;
}

export const DEFAULT_THEME = "brume-onde";

/** Libelles lisibles des themes pour le selecteur des Parametres. */
export const THEME_LABELS: Record<string, string> = {
  "brume-onde": "Brume & Onde (fantasy)",
  technologie: "Technologie",
  medieval: "Médiéval",
  science: "Science",
  romance: "Romance",
  fantastique: "Conte de Fées",
  meteo: "Météo",
  automne: "Automne",
  espace: "Espace",
};

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
    { p: 25, e: "🌾", n: "Paysanne" },
    { p: 50, e: "🧹", n: "Page" },
    { p: 75, e: "🐴", n: "Écuyère" },
    { p: 100, e: "🛡️", n: "Chevalière" },
    { p: 110, e: "🪞", n: "Baronne" },
    { p: 125, e: "💅", n: "Comtesse" },
    { p: 150, e: "⚜️", n: "Duchesse" },
    { p: 175, e: "💎", n: "Princesse" },
    { p: 200, e: "👑", n: "Reine" },
    { p: 250, e: "💠", n: "Impératrice" },
  ],
  science: [
    { p: 25, e: "☺️", n: "Aspirante" },
    { p: 50, e: "💡", n: "Amatrice éclairée" },
    { p: 75, e: "🧪", n: "Apprentie" },
    { p: 100, e: "⚗️", n: "Étudiante" },
    { p: 110, e: "📚", n: "Doctorante" },
    { p: 125, e: "🧬", n: "Chercheuse" },
    { p: 150, e: "🔬", n: "Scientifique" },
    { p: 175, e: "✨", n: "Érudite" },
    { p: 200, e: "👵", n: "Sage" },
    { p: 250, e: "🎖️", n: "Prix Nobel" },
  ],
  romance: [
    { p: 25, e: "👥", n: "Première rencontre" },
    { p: 50, e: "💕", n: "Coup de cœur" },
    { p: 75, e: "💌", n: "Lettre d'amour" },
    { p: 100, e: "🎶", n: "Sérénade" },
    { p: 110, e: "🤝", n: "Premier contact" },
    { p: 125, e: "🥂", n: "Premier rendez-vous" },
    { p: 150, e: "🫦", n: "Premier baiser" },
    { p: 175, e: "❤️", n: "Premier amour" },
    { p: 200, e: "🔥", n: "Grand amour" },
    { p: 250, e: "❤️‍🔥", n: "Âme sœur" },
  ],
  fantastique: [
    { p: 25, e: "🫘", n: "Haricot magique" },
    { p: 50, e: "🧸", n: "Boucle d'or" },
    { p: 75, e: "🧺", n: "Chaperon rouge" },
    { p: 100, e: "👠", n: "Soulier de verre" },
    { p: 110, e: "👗", n: "Robe magique" },
    { p: 125, e: "🥀", n: "Rose éternelle" },
    { p: 150, e: "🐺", n: "Grand méchant loup" },
    { p: 175, e: "🍎", n: "Pomme empoisonnée" },
    { p: 200, e: "🧙‍♀️", n: "Mère-Grand" },
    { p: 250, e: "🐉", n: "Dragon" },
  ],
  meteo: [
    { p: 25, e: "🌪️", n: "Tornade" },
    { p: 50, e: "⛈️", n: "Tempête" },
    { p: 75, e: "🧊", n: "Grêle" },
    { p: 100, e: "🌧️", n: "Déluge" },
    { p: 110, e: "☔️", n: "Averse" },
    { p: 125, e: "☁️", n: "Nuageux" },
    { p: 150, e: "😶‍🌫️", n: "Brumes" },
    { p: 175, e: "❄️", n: "Flocons" },
    { p: 200, e: "☀️", n: "Grand soleil" },
    { p: 250, e: "🔥", n: "Canicule" },
  ],
  automne: [
    { p: 25, e: "🍂", n: "Feuille d'automne" },
    { p: 50, e: "🌰", n: "Cannelle et Marron" },
    { p: 75, e: "🎃", n: "Potiron" },
    { p: 100, e: "🥧", n: "Pumpkin Pie" },
    { p: 110, e: "🧁", n: "Chocolat chaud & Marshmallow" },
    { p: 125, e: "🐈‍⬛", n: "Chat & canapé" },
    { p: 150, e: "🌫️", n: "Brouillard et mystère" },
    { p: 175, e: "🧙", n: "Sorcière et magicienne" },
    { p: 200, e: "🗝️", n: "Samhain" },
    { p: 250, e: "🔮", n: "Magie et secrets" },
  ],
  espace: [
    { p: 25, e: "🌍", n: "Terre" },
    { p: 50, e: "⭐️", n: "Étoile" },
    { p: 75, e: "💫", n: "Étoile filante" },
    { p: 100, e: "☄️", n: "Comète" },
    { p: 110, e: "🌖", n: "Lune" },
    { p: 125, e: "✨", n: "Constellation" },
    { p: 150, e: "🪐", n: "Planète" },
    { p: 175, e: "🌫️", n: "Nébuleuse" },
    { p: 200, e: "🌌", n: "Voie lactée" },
    { p: 250, e: "🔭", n: "Galaxie" },
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
