# Genera los iconos PNG de la PWA.
#
#   powershell -ExecutionPolicy Bypass -File scripts/generar-iconos.ps1
#
# Se dibujan con System.Drawing (viene con Windows) en vez de traer un binario
# de imagenes: asi el icono es reproducible desde el repo y no hay un PNG
# suelto que nadie sabe de donde salio.
#
# Salen tres archivos en web/assets/:
#   icono-192.png            el tamaño minimo que pide el manifest
#   icono-512.png            para la pantalla de inicio en alta densidad
#   icono-maskable-512.png   con el dibujo dentro de la zona segura, para que
#                            Android pueda recortarlo en circulo sin cortarlo
#
# El dibujo es un portapapeles con dos visto bueno: es un alistamiento, y a
# 192px un icono simple se reconoce y uno detallado se vuelve una manchita.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$destino = Join-Path $PSScriptRoot '..\web\assets'
if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino -Force | Out-Null }

# Paleta: la misma de los formularios, para que la app instalada y la pagina
# no parezcan dos productos distintos.
$azul    = [System.Drawing.ColorTranslator]::FromHtml('#1a4fa0')
$blanco  = [System.Drawing.Color]::White
$verde   = [System.Drawing.ColorTranslator]::FromHtml('#1c7a4a')
$gris    = [System.Drawing.ColorTranslator]::FromHtml('#c3cede')

function New-Icono {
    param(
        [int]    $Lado,
        [double] $Escala,   # cuanto del lienzo ocupa el dibujo (0-1)
        [string] $Ruta
    )

    $bmp = New-Object System.Drawing.Bitmap($Lado, $Lado)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # Fondo a sangre: en un icono maskable el sistema recorta la forma que
    # quiera, asi que el color tiene que llegar hasta el borde.
    $g.Clear($azul)

    # --- Portapapeles ---
    $ancho  = [int]($Lado * $Escala * 0.66)
    $alto   = [int]($Lado * $Escala * 0.82)
    $x      = [int](($Lado - $ancho) / 2)
    $y      = [int](($Lado - $alto) / 2)
    $radio  = [int]($ancho * 0.12)

    $cuerpo = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radio * 2
    $cuerpo.AddArc($x, $y, $d, $d, 180, 90)
    $cuerpo.AddArc($x + $ancho - $d, $y, $d, $d, 270, 90)
    $cuerpo.AddArc($x + $ancho - $d, $y + $alto - $d, $d, $d, 0, 90)
    $cuerpo.AddArc($x, $y + $alto - $d, $d, $d, 90, 90)
    $cuerpo.CloseFigure()

    $pincelBlanco = New-Object System.Drawing.SolidBrush($blanco)
    $g.FillPath($pincelBlanco, $cuerpo)

    # Pestaña superior, la pinza del portapapeles.
    $pestAncho = [int]($ancho * 0.42)
    $pestAlto  = [int]($alto * 0.10)
    $pestX     = [int](($Lado - $pestAncho) / 2)
    $pestY     = $y - [int]($pestAlto / 2)
    $pestRadio = [int]($pestAlto * 0.45)
    $pest = New-Object System.Drawing.Drawing2D.GraphicsPath
    $dp = $pestRadio * 2
    $pest.AddArc($pestX, $pestY, $dp, $dp, 180, 90)
    $pest.AddArc($pestX + $pestAncho - $dp, $pestY, $dp, $dp, 270, 90)
    $pest.AddArc($pestX + $pestAncho - $dp, $pestY + $pestAlto - $dp, $dp, $dp, 0, 90)
    $pest.AddArc($pestX, $pestY + $pestAlto - $dp, $dp, $dp, 90, 90)
    $pest.CloseFigure()
    $g.FillPath($pincelBlanco, $pest)

    # --- Renglones: dos verificados y uno pendiente ---
    $margen   = [int]($ancho * 0.16)
    $grosor   = [math]::Max(2, [int]($alto * 0.055))
    $altoFila = [int]($alto * 0.20)
    $primera  = $y + [int]($alto * 0.30)
    $checkTam = [int]($altoFila * 0.62)

    $lapizVerde = New-Object System.Drawing.Pen($verde, $grosor)
    $lapizVerde.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $lapizVerde.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $pincelGris = New-Object System.Drawing.SolidBrush($gris)

    for ($i = 0; $i -lt 3; $i++) {
        $filaY = $primera + ($i * $altoFila)
        $cx = $x + $margen
        $cy = $filaY

        if ($i -lt 2) {
            # Visto bueno: dos trazos, el corto bajando y el largo subiendo.
            $g.DrawLines($lapizVerde, @(
                (New-Object System.Drawing.Point($cx, ($cy + [int]($checkTam * 0.45)))),
                (New-Object System.Drawing.Point(($cx + [int]($checkTam * 0.34)), ($cy + $checkTam))),
                (New-Object System.Drawing.Point(($cx + $checkTam), $cy))
            ))
        } else {
            # Pendiente: un cuadro vacio, para que el icono cuente que el
            # alistamiento es algo que se esta llenando.
            $lapizGris = New-Object System.Drawing.Pen($gris, $grosor)
            $g.DrawRectangle($lapizGris, $cx, $cy, $checkTam, $checkTam)
            $lapizGris.Dispose()
        }

        # Linea de texto al lado del check.
        $lineaX = $x + $margen + $checkTam + [int]($ancho * 0.10)
        $lineaAncho = $x + $ancho - $margen - $lineaX
        $g.FillRectangle($pincelGris, $lineaX, ($cy + [int]($checkTam * 0.34)),
                         $lineaAncho, $grosor)
    }

    $bmp.Save($Ruta, [System.Drawing.Imaging.ImageFormat]::Png)

    $lapizVerde.Dispose(); $pincelGris.Dispose(); $pincelBlanco.Dispose()
    $cuerpo.Dispose(); $pest.Dispose(); $g.Dispose(); $bmp.Dispose()
}

# Los normales usan casi todo el lienzo. El maskable se queda en 0.58 porque
# Android recorta hasta un 20% por lado: lo que salga de la zona segura
# desaparece en los telefonos con iconos circulares.
New-Icono -Lado 192 -Escala 0.86 -Ruta (Join-Path $destino 'icono-192.png')
New-Icono -Lado 512 -Escala 0.86 -Ruta (Join-Path $destino 'icono-512.png')
New-Icono -Lado 512 -Escala 0.58 -Ruta (Join-Path $destino 'icono-maskable-512.png')

Get-ChildItem $destino -Filter 'icono*.png' | ForEach-Object {
    "{0,-26} {1,7:N0} bytes" -f $_.Name, $_.Length
}
