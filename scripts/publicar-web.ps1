# Publica la PWA en el bucket de Supabase Storage.
#
#   powershell -ExecutionPolicy Bypass -File scripts/publicar-web.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/publicar-web.ps1 -Bucket otro
#
# Requiere el bucket creado y publico (Storage -> New bucket -> publico).
#
# POR QUE UN SCRIPT Y NO UN 'cp -r'
#
# El Cache-Control no puede ser el mismo para todo, y es justo lo que hace que
# el manejo de versiones funcione o no:
#
#   sw.js    -> max-age=0. El navegador compara sw.js byte a byte para saber si
#               hay version nueva. Si Storage lo sirve con una hora de cache,
#               una version nueva tarda hasta una hora en detectarse. Con 0, se
#               ve en la siguiente apertura.
#
#   *.html   -> max-age=0. Son la puerta de entrada: una correccion urgente
#               tiene que llegar al primer intento con red.
#
#   assets/* -> 7 dias. El service worker los guarda en un cache con el nombre
#               de la version, y al instalar los pide con {cache: "reload"},
#               que salta el cache HTTP. Asi que un cache largo aqui acelera
#               las cargas sin retrasar ninguna actualizacion.
#
# El orden tambien importa: primero los assets y al final sw.js. Si sw.js
# subiera primero, un telefono podria instalar la version nueva y pedir
# archivos que todavia no estan arriba, y el install fallaria.

param(
    [string] $Bucket = 'sicov'
)

$ErrorActionPreference = 'Stop'

$web = Join-Path $PSScriptRoot '..\web'
if (-not (Test-Path $web)) { throw "No se encontro la carpeta web en $web" }

# La version que se va a publicar, leida del propio sw.js: es la fuente unica.
$swRuta = Join-Path $web 'sw.js'
$version = (Select-String -Path $swRuta -Pattern 'const VERSION = "([^"]+)"').Matches[0].Groups[1].Value
if (-not $version) { throw 'No se pudo leer VERSION de sw.js' }

# Si la version ya esta publicada, los telefonos instalados NO se enteraran del
# cambio: el navegador detecta version nueva comparando sw.js, y si VERSION no
# cambio no hay nada que detectar. El despliegue saldria bien y el error solo se
# veria dias despues, cuando alguien reporte que sigue con la pantalla vieja.
# La URL del proyecto se lee de comun.js, que ya la tiene: una segunda copia
# aqui acabaria apuntando a otro sitio el dia que el proyecto cambie.
$comun = Join-Path $web 'assets\comun.js'
$urlProyecto = (Select-String -Path $comun -Pattern 'SUPABASE_URL: "([^"]+)"').Matches[0].Groups[1].Value
$urlRemota = "$urlProyecto/storage/v1/object/public/$Bucket/sw.js"
try {
    $remoto = (Invoke-WebRequest -Uri $urlRemota -UseBasicParsing -TimeoutSec 8).Content
    if ($remoto -match 'const VERSION = "([^"]+)"') {
        $versionArriba = $Matches[1]
        if ($versionArriba -eq $version) {
            Write-Host ""
            Write-Host "  La version $version YA esta publicada." -ForegroundColor Yellow
            Write-Host "  Los telefonos ya instalados no veran este cambio." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  Sube la version primero:" -ForegroundColor DarkGray
            Write-Host "    powershell -File scripts/subir-version.ps1 -Nota 'que cambio'" -ForegroundColor DarkGray
            Write-Host ""
            $seguir = Read-Host "  Publicar igual? (s/N)"
            if ($seguir -ne 's') { throw 'Publicacion cancelada.' }
        }
    }
} catch {
    # Primera publicacion, bucket sin crear, o sin red: ninguno impide intentar
    # publicar, solo deja la comprobacion sin hacer.
    Write-Host "  (no se pudo comprobar la version publicada)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "  Publicando version $version en el bucket '$Bucket'" -ForegroundColor Cyan
Write-Host ""

function Publicar {
    param([string] $Relativo, [string] $CacheControl)

    $origen = Join-Path $web $Relativo
    if (-not (Test-Path $origen)) {
        Write-Host ("  omitido  {0,-34} (no existe)" -f $Relativo) -ForegroundColor DarkYellow
        return
    }

    # El destino usa / aunque Windows use \.
    $destino = "ss:///$Bucket/" + ($Relativo -replace '\\', '/')

    # 2>&1 junta la salida del CLI para que un fallo se vea en la consola.
    $salida = & supabase storage cp $origen $destino --cache-control $CacheControl 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host ("  FALLO    {0}" -f $Relativo) -ForegroundColor Red
        Write-Host ("           {0}" -f ($salida -join ' ')) -ForegroundColor DarkGray
        throw "Fallo publicando $Relativo"
    }
    Write-Host ("  ok       {0,-34} {1}" -f $Relativo, $CacheControl) -ForegroundColor DarkGray
}

# --- 1. Assets: cache largo, el service worker los renueva por version ---
Publicar 'assets/app.css'               'public, max-age=604800'
Publicar 'assets/comun.js'              'public, max-age=604800'
Publicar 'assets/alistamiento.js'       'public, max-age=604800'
Publicar 'assets/mantenimiento.js'      'public, max-age=604800'
Publicar 'assets/icono-192.png'         'public, max-age=604800'
Publicar 'assets/icono-512.png'         'public, max-age=604800'
Publicar 'assets/icono-maskable-512.png' 'public, max-age=604800'

# --- 2. Manifest: cambia poco, pero no tanto como para una semana ---
Publicar 'manifest.webmanifest'         'public, max-age=3600'

# --- 3. HTML: sin cache, son la puerta de entrada ---
Publicar 'index.html'                   'public, max-age=0, must-revalidate'
Publicar 'alistamiento.html'            'public, max-age=0, must-revalidate'
Publicar 'mantenimiento.html'           'public, max-age=0, must-revalidate'

# --- 4. El service worker, al final y sin cache ---
Publicar 'sw.js'                        'public, max-age=0, must-revalidate'

$base = "https://<project-ref>.supabase.co/storage/v1/object/public/$Bucket"
Write-Host ""
Write-Host "  Listo. Version $version publicada." -ForegroundColor Green
Write-Host ""
Write-Host "  Link para los conductores:" -ForegroundColor Cyan
Write-Host "    $base/alistamiento.html"
Write-Host ""
Write-Host "  Link para el taller:" -ForegroundColor Cyan
Write-Host "    $base/mantenimiento.html"
Write-Host ""
Write-Host "  Los telefonos que ya tienen la app instalada veran la version"
Write-Host "  nueva la proxima vez que la abran con señal."
Write-Host ""
