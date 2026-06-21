# =====================================================================
#  WriteFlow - installation automatique du plugin (Word Desktop Windows)
# ---------------------------------------------------------------------
#  Ce script fait a ta place les etapes penibles :
#    1. cree le dossier C:\Users\<toi>\WriteFlow
#    2. y telecharge le manifeste depuis GitHub Pages
#    3. declare ce dossier comme "catalogue de confiance" dans le registre
#  Ensuite il te reste juste a relancer Word et choisir WriteFlow.
#
#  UTILISATION : clic droit sur ce fichier -> "Executer avec PowerShell".
#  Aucun droit administrateur n'est requis (tout se passe dans ton compte).
# =====================================================================

$ErrorActionPreference = "Stop"

# --- Reglages (a adapter seulement si tu changes de depot) ----------
$ManifestUrl = "https://guinpin022.github.io/writeflow-poc/manifest.github.xml"
$Folder      = Join-Path $env:USERPROFILE "WriteFlow"
$ManifestPath = Join-Path $Folder "manifest.github.xml"

Write-Host ""
Write-Host "=== Installation de WriteFlow pour Word (Windows) ===" -ForegroundColor Cyan
Write-Host ""

try {
    # 1) Dossier ------------------------------------------------------
    if (-not (Test-Path $Folder)) {
        New-Item -ItemType Directory -Path $Folder | Out-Null
    }
    Write-Host "[1/3] Dossier pret : $Folder" -ForegroundColor Green

    # 2) Telechargement du manifeste ---------------------------------
    Write-Host "[2/3] Telechargement du manifeste..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $ManifestUrl -OutFile $ManifestPath -UseBasicParsing
    Write-Host "[2/3] Manifeste enregistre : $ManifestPath" -ForegroundColor Green

    # 3) Catalogue de confiance dans le registre ---------------------
    # Office lit les catalogues de complements ici (16.0 = Office 2016/2019/2021/365).
    $CatalogId = ([guid]::NewGuid()).ToString("B").ToUpper()  # {XXXX-...}
    $RegBase   = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs"
    $RegKey    = Join-Path $RegBase $CatalogId

    if (-not (Test-Path $RegBase)) {
        New-Item -Path $RegBase -Force | Out-Null
    }
    New-Item -Path $RegKey -Force | Out-Null
    New-ItemProperty -Path $RegKey -Name "Id"    -Value $CatalogId -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $RegKey -Name "Url"   -Value $Folder    -PropertyType String -Force | Out-Null
    # Flags = 1 : catalogue active. (+2 = afficher dans le menu Insertion)
    New-ItemProperty -Path $RegKey -Name "Flags" -Value 3 -PropertyType DWord -Force | Out-Null
    Write-Host "[3/3] Dossier declare comme catalogue de confiance." -ForegroundColor Green

    Write-Host ""
    Write-Host "=== Termine ! Derniere etape (manuelle) ===" -ForegroundColor Cyan
    Write-Host "  1. FERME completement Word, puis rouvre-le." -ForegroundColor Yellow
    Write-Host "  2. Onglet Accueil -> Complements -> (Avance ->) DOSSIER PARTAGE." -ForegroundColor Yellow
    Write-Host "  3. Choisis 'WriteFlow Tracking POC (Cloud)' -> Ajouter." -ForegroundColor Yellow
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "!! Une erreur s'est produite :" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Verifie ta connexion internet, ou installe a la main avec le guide testeurs." -ForegroundColor Red
}

Write-Host "Appuie sur Entree pour fermer cette fenetre."
[void](Read-Host)
