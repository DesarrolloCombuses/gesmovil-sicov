# Sube la version de la PWA en web/sw.js.
#
#   powershell -ExecutionPolicy Bypass -File scripts/subir-version.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/subir-version.ps1 -Parte menor
#   powershell -ExecutionPolicy Bypass -File scripts/subir-version.ps1 -Nota "arregla X"
#
# POR QUE HACE FALTA UN SCRIPT PARA CAMBIAR UN NUMERO
#
# Olvidar el numero no da ningun error: el despliegue sale bien, los archivos
# quedan arriba, y los telefonos que ya tienen la app instalada siguen con la
# version vieja para siempre. El navegador decide que hay version nueva
# comparando sw.js byte a byte; si VERSION no cambio y lo demas tampoco, no hay
# nada que detectar.
#
# Es el fallo mas facil de cometer aqui y el mas dificil de notar, porque en el
# equipo donde se publica se ve todo bien -- ahi se recarga con Ctrl+Shift+R.
#
# El cache tambien depende del numero: CACHE se llama sicov-v<VERSION>, y al
# activarse el worker borra los que no coincidan. Sin cambio de version, el
# contenido viejo se queda guardado en el telefono.

param(
    # mayor: cambios que rompen algo. menor: funcionalidad nueva (lo normal).
    # parche: correcciones.
    [ValidateSet('mayor', 'menor', 'parche')]
    [string] $Parte = 'menor',

    # Una linea para el registro de cambios de sw.js. Sin esto solo sube el
    # numero y el comentario queda por escribir a mano.
    [string] $Nota = ''
)

$ErrorActionPreference = 'Stop'

$sw = (Resolve-Path (Join-Path $PSScriptRoot '..\web\sw.js')).Path
$texto = Get-Content $sw -Raw

if ($texto -notmatch 'const VERSION = "(\d+)\.(\d+)\.(\d+)";') {
    throw "No se encontro 'const VERSION = ...' en $sw"
}

$mayor  = [int] $Matches[1]
$menor  = [int] $Matches[2]
$parche = [int] $Matches[3]
$actual = "$mayor.$menor.$parche"

switch ($Parte) {
    'mayor'  { $mayor++;  $menor = 0; $parche = 0 }
    'menor'  { $menor++;  $parche = 0 }
    'parche' { $parche++ }
}
$nueva = "$mayor.$menor.$parche"

# La nota va arriba del todo del registro, que esta en orden inverso: lo ultimo
# publicado es lo primero que alguien lee al abrir el archivo.
#
# Con [regex]::Replace y count 1, NO con -replace: el operador sustituye todas
# las coincidencias, y aqui hay una por cada version del registro -- la nota
# acabaria repetida encima de cada entrada.
if ($Nota) {
    $patron = [regex] '(?m)^// \d+\.\d+\.\d+ -- '
    $cabecera = "// $nueva -- $Nota" + [Environment]::NewLine + "//" + [Environment]::NewLine
    if ($patron.IsMatch($texto)) {
        $texto = $patron.Replace($texto, { param($m) $cabecera + $m.Value }, 1)
    } else {
        Write-Host "  (no se encontro el registro de cambios; la nota no se inserto)" -ForegroundColor DarkYellow
    }
}

$texto = [regex]::Replace($texto, 'const VERSION = "[^"]+";', "const VERSION = `"$nueva`";", 1)
Set-Content -Path $sw -Value $texto -Encoding utf8 -NoNewline

Write-Host ""
Write-Host "  $actual  ->  $nueva" -ForegroundColor Cyan
if ($Nota) { Write-Host "  nota: $Nota" -ForegroundColor DarkGray }
Write-Host ""
Write-Host "  Al activarse borra los caches sicov-v anteriores." -ForegroundColor DarkGray
Write-Host "  Publicar con: scripts/publicar-web.ps1" -ForegroundColor DarkGray
Write-Host ""
