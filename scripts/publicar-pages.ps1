<#
.SYNOPSIS
  Publica la carpeta web/ en el repositorio publico que sirve GitHub Pages.

.DESCRIPTION
  El codigo vive en un repositorio PRIVADO (gesmovil-sicov). GitHub Pages no
  sirve desde un repo privado sin plan de pago, y hacer publico el repo entero
  publicaria las migraciones, la logica de las funciones y el contrato con
  GESMOVIL. Asi que solo web/ se replica a un repo publico aparte.

  Se usa 'git subtree push', que toma el historial de web/ y lo reescribe con
  esa carpeta como raiz: en el repo publico index.html queda arriba del todo,
  que es donde Pages lo busca.

  Antes de publicar comprueba que no haya quedado el placeholder de la anon
  key: publicar la app sin ella deja el modulo de mantenimiento inservible.

.EXAMPLE
  ./scripts/publicar-pages.ps1
#>

[CmdletBinding()]
param(
  [string] $RepoPublico = "https://github.com/DesarrolloCombuses/gesmovil-sicov-web.git",
  [string] $Rama        = "main"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# --- Comprobaciones antes de publicar ---------------------------------------

$comun = Get-Content "web/assets/comun.js" -Raw
if ($comun -match "PEGAR_AQUI_LA_ANON_KEY") {
  Write-Warning "web/assets/comun.js todavia tiene el placeholder de la anon key."
  Write-Warning "El alistamiento funcionara, pero el modulo de mantenimiento no podra iniciar sesion."
}

# La nomina completa no debe volver nunca al frontend.
if (Select-String -Path "web/assets/*.js" -Pattern "datos\.conductores" -Quiet) {
  throw "web/ vuelve a leer la lista completa de conductores. Revisa antes de publicar: eso expone datos personales."
}

$pendientes = git status --porcelain -- web/
if ($pendientes) {
  throw "Hay cambios sin confirmar en web/. Haz commit antes de publicar:`n$pendientes"
}

# --- Remoto del repo publico -------------------------------------------------

if (-not (git remote | Where-Object { $_ -eq "pages" })) {
  Write-Host "Agregando el remoto 'pages' -> $RepoPublico"
  git remote add pages $RepoPublico
}

# --- Publicar ----------------------------------------------------------------

$version = (Select-String -Path "web/sw.js" -Pattern 'const VERSION = "([^"]+)"').Matches[0].Groups[1].Value
Write-Host "Publicando web/ (version $version) en $RepoPublico ..."

git subtree push --prefix=web pages $Rama

Write-Host ""
Write-Host "Listo. GitHub Pages toma unos segundos en reconstruir." -ForegroundColor Green
Write-Host "  https://desarrollocombuses.github.io/gesmovil-sicov-web/"
