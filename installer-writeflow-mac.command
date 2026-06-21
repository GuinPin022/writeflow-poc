#!/bin/bash
# =====================================================================
#  WriteFlow - installation automatique du plugin (Word Desktop Mac)
# ---------------------------------------------------------------------
#  Ce script copie le manifeste WriteFlow dans le dossier "wef" que Word
#  Mac scrute au demarrage. Apres ca, le plugin apparait dans Word.
#
#  UTILISATION :
#    - Double-clique sur ce fichier (il s'ouvre dans le Terminal).
#    - Si macOS bloque : clic droit -> Ouvrir -> Ouvrir.
#    - Si "permission refusee" : ouvre le Terminal et lance :
#         chmod +x ~/Downloads/installer-writeflow-mac.command
#      puis double-clique a nouveau.
# =====================================================================

set -e

MANIFEST_URL="https://guinpin022.github.io/writeflow-poc/manifest.github.xml"
WEF_DIR="$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
MANIFEST_PATH="$WEF_DIR/manifest.github.xml"

echo ""
echo "=== Installation de WriteFlow pour Word (Mac) ==="
echo ""

# 1) Dossier wef -----------------------------------------------------
mkdir -p "$WEF_DIR"
echo "[1/2] Dossier pret : $WEF_DIR"

# 2) Telechargement du manifeste -------------------------------------
echo "[2/2] Telechargement du manifeste..."
if curl -fsSL "$MANIFEST_URL" -o "$MANIFEST_PATH"; then
  echo "[2/2] Manifeste enregistre : $MANIFEST_PATH"
else
  echo ""
  echo "!! Echec du telechargement. Verifie ta connexion internet,"
  echo "   ou installe a la main avec le guide testeurs."
  echo ""
  echo "Appuie sur Entree pour fermer."
  read -r _
  exit 1
fi

echo ""
echo "=== Termine ! Derniere etape (manuelle) ==="
echo "  1. FERME completement Word (Cmd+Q), puis rouvre-le."
echo "  2. Onglet Accueil -> Complements -> WriteFlow apparait."
echo ""
echo "Appuie sur Entree pour fermer cette fenetre."
read -r _
