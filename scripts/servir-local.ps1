# Sirve la carpeta web/ en localhost para probar la PWA.
#
#   powershell -ExecutionPolicy Bypass -File scripts/servir-local.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/servir-local.ps1 -Puerto 8080
#
# Hace falta un servidor porque un service worker no se registra desde
# file://. Solo funciona en un origen seguro, y localhost cuenta como tal, asi
# que esto basta para probar la instalacion, el modo sin red y el aviso de
# version nueva sin tener que publicar.
#
# Es un servidor de pruebas: un hilo, sin concurrencia y solo para 127.0.0.1.
# No sirve para publicar nada.
#
# Para detenerlo: Ctrl+C.

param(
    [int] $Puerto = 8000
)

$ErrorActionPreference = 'Stop'

$web = (Resolve-Path (Join-Path $PSScriptRoot '..\web')).Path

# Content-Type correcto por extension. Importa mas de lo que parece: un sw.js
# servido como text/plain no se registra, y un .webmanifest con el tipo
# equivocado hace que el navegador ignore el manifest y no ofrezca instalar.
$tipos = @{
    '.html'        = 'text/html; charset=utf-8'
    '.css'         = 'text/css; charset=utf-8'
    '.js'          = 'text/javascript; charset=utf-8'
    '.mjs'         = 'text/javascript; charset=utf-8'
    '.json'        = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.png'         = 'image/png'
    '.svg'         = 'image/svg+xml'
    '.ico'         = 'image/x-icon'
}

# Los mismos criterios de cache que en produccion (ver publicar-web.ps1): sin
# cache para sw.js y los HTML, para que al recargar se vea el cambio y se pueda
# probar de verdad el aviso de version nueva.
function Get-CacheControl {
    param([string] $Relativo)
    if ($Relativo -eq 'sw.js' -or $Relativo -like '*.html') {
        return 'no-cache, no-store, must-revalidate'
    }
    return 'public, max-age=300'
}

$escucha = New-Object System.Net.HttpListener
$escucha.Prefixes.Add("http://localhost:$Puerto/")

try {
    $escucha.Start()
} catch {
    throw "No se pudo abrir el puerto $Puerto. Prueba con otro: -Puerto 8080"
}

Write-Host ""
Write-Host "  Sirviendo $web" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  http://localhost:$Puerto/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Para probar la PWA en Chrome:" -ForegroundColor DarkGray
Write-Host "    F12 -> Application -> Manifest        que el manifest se lea y el icono salga"
Write-Host "    F12 -> Application -> Service Workers  que quede 'activated and is running'"
Write-Host "    F12 -> Network -> Offline, y recarga   la app debe abrir igual"
Write-Host ""
Write-Host "  Para probar el aviso de version nueva: con la pagina abierta y algo"
Write-Host "  escrito en el formulario, sube VERSION en web/sw.js y recarga."
Write-Host ""
Write-Host "  Ctrl+C para detener." -ForegroundColor DarkGray
Write-Host ""

try {
    while ($escucha.IsListening) {
        $contexto = $escucha.GetContext()
        $peticion = $contexto.Request
        $respuesta = $contexto.Response

        $ruta = [System.Uri]::UnescapeDataString($peticion.Url.AbsolutePath).TrimStart('/')
        if ($ruta -eq '') { $ruta = 'index.html' }

        # Normaliza separadores y resuelve el destino. Despues se comprueba que
        # siga dentro de web/: sin eso, una peticion a ../../algo leeria
        # cualquier archivo del disco.
        $relativo = $ruta -replace '/', '\'
        $destino = [System.IO.Path]::GetFullPath((Join-Path $web $relativo))

        $dentro = $destino.StartsWith($web, [System.StringComparison]::OrdinalIgnoreCase)

        if (-not $dentro -or -not (Test-Path $destino -PathType Leaf)) {
            $respuesta.StatusCode = if ($dentro) { 404 } else { 403 }
            $cuerpo = [System.Text.Encoding]::UTF8.GetBytes("$($respuesta.StatusCode)")
            $respuesta.ContentType = 'text/plain; charset=utf-8'
            $respuesta.ContentLength64 = $cuerpo.Length
            $respuesta.OutputStream.Write($cuerpo, 0, $cuerpo.Length)
            $respuesta.Close()
            Write-Host ("  {0,3}  {1}" -f $respuesta.StatusCode, $ruta) -ForegroundColor DarkYellow
            continue
        }

        $extension = [System.IO.Path]::GetExtension($destino).ToLowerInvariant()
        $respuesta.ContentType = if ($tipos.ContainsKey($extension)) { $tipos[$extension] } else { 'application/octet-stream' }
        $respuesta.Headers.Add('Cache-Control', (Get-CacheControl ($ruta -replace '\\', '/')))

        # Service-Worker-Allowed no hace falta con el scope actual (sw.js esta
        # en la raiz), pero se manda para que tambien funcione si algun dia se
        # sirve desde un subdirectorio.
        if ($ruta -eq 'sw.js') { $respuesta.Headers.Add('Service-Worker-Allowed', '/') }

        $bytes = [System.IO.File]::ReadAllBytes($destino)
        $respuesta.ContentLength64 = $bytes.Length
        $respuesta.OutputStream.Write($bytes, 0, $bytes.Length)
        $respuesta.Close()

        Write-Host ("  200  {0}" -f $ruta) -ForegroundColor DarkGray
    }
} finally {
    $escucha.Stop()
    $escucha.Close()
    Write-Host ""
    Write-Host "  Servidor detenido." -ForegroundColor DarkGray
}
