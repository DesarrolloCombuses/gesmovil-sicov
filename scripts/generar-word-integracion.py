# -*- coding: utf-8 -*-
"""
Genera el Word de integracion para GESMOVIL.

La fuente de verdad es INTEGRACION-GESMOVIL.md, del repositorio. Este script
solo lo maqueta: si cambia el contrato, se cambia el .md y se vuelve a correr.
No se edita el .docx a mano, porque entonces los dos se separan y no hay forma
de saber cual vale.
"""
import os
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

AZUL = RGBColor(0x1A, 0x4F, 0xA0)
GRIS = RGBColor(0x5B, 0x6B, 0x7D)
TINTA = RGBColor(0x16, 0x20, 0x2C)
ROJO = RGBColor(0xB3, 0x26, 0x1E)

FONDO_CODIGO = "F4F6F9"
FONDO_CABECERA = "1A4FA0"
FONDO_FILA = "F7F9FC"

doc = Document()

# --- Pagina: Carta, que es el tamano que se usa en Colombia ---------------
for s in doc.sections:
    s.page_width = Inches(8.5)
    s.page_height = Inches(11)
    s.left_margin = Inches(1)
    s.right_margin = Inches(1)
    s.top_margin = Inches(0.9)
    s.bottom_margin = Inches(0.9)

# --- Estilo base -----------------------------------------------------------
base = doc.styles["Normal"]
base.font.name = "Calibri"
base.font.size = Pt(10.5)
base.font.color.rgb = TINTA
base.paragraph_format.space_after = Pt(7)
base.paragraph_format.line_spacing = 1.08

# El nombre de fuente hay que fijarlo tambien para East Asian, o Word usa otra
# en algunos entornos.
base.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")


def sombrear(elemento, color):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    elemento.append(shd)


def borde_inferior(par, color="D8E0EA", grosor=6):
    pPr = par._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(grosor))
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), color)
    bdr.append(bottom)
    pPr.append(bdr)


def h1(texto):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(15)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(texto)
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = AZUL
    borde_inferior(p)
    return p


def h2(texto):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(13)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(texto)
    r.font.size = Pt(11.5)
    r.font.bold = True
    r.font.color.rgb = TINTA
    return p


def par(texto=None, negrita=False, gris=False, tam=10.5, antes=0, despues=7):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(antes)
    p.paragraph_format.space_after = Pt(despues)
    if texto:
        r = p.add_run(texto)
        r.font.bold = negrita
        r.font.size = Pt(tam)
        if gris:
            r.font.color.rgb = GRIS
    return p


def rico(trozos, antes=0, despues=7):
    """Parrafo con partes en negrita o monoespaciado: [(texto, estilo), ...]"""
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(antes)
    p.paragraph_format.space_after = Pt(despues)
    for texto, estilo in trozos:
        r = p.add_run(texto)
        if "b" in estilo:
            r.font.bold = True
        if "c" in estilo:
            r.font.name = "Consolas"
            r.font.size = Pt(9.5)
        if "r" in estilo:
            r.font.color.rgb = ROJO
        if "g" in estilo:
            r.font.color.rgb = GRIS
    return p


def vineta(texto, nivel=0):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.28 + 0.25 * nivel)
    p.paragraph_format.space_after = Pt(4)
    p.add_run(texto)
    return p


def vineta_rica(trozos, nivel=0):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.28 + 0.25 * nivel)
    p.paragraph_format.space_after = Pt(4)
    for texto, estilo in trozos:
        r = p.add_run(texto)
        if "b" in estilo:
            r.font.bold = True
        if "c" in estilo:
            r.font.name = "Consolas"
            r.font.size = Pt(9.5)
    return p


def numerada(texto):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.left_indent = Inches(0.28)
    p.paragraph_format.space_after = Pt(4)
    p.add_run(texto)
    return p


def codigo(lineas, tam=8.5):
    """Bloque monoespaciado sombreado. Una tabla de una celda, para que el
    sombreado cubra el ancho entero y no solo el texto."""
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    ancho = Inches(6.5)
    t.columns[0].width = ancho
    celda = t.cell(0, 0)
    celda.width = ancho
    sombrear(celda._tc.get_or_add_tcPr(), FONDO_CODIGO)

    celda.text = ""
    for i, linea in enumerate(lineas):
        p = celda.paragraphs[0] if i == 0 else celda.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.line_spacing = 1.05
        r = p.add_run(linea)
        r.font.name = "Consolas"
        r.font.size = Pt(tam)
    # Aire despues del bloque
    par(despues=2)
    return t


def tabla(cabeceras, filas, anchos):
    t = doc.add_table(rows=1, cols=len(cabeceras))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    anchos_in = [Inches(a) for a in anchos]

    for j, (texto, ancho) in enumerate(zip(cabeceras, anchos_in)):
        c = t.cell(0, j)
        c.width = ancho
        sombrear(c._tc.get_or_add_tcPr(), FONDO_CABECERA)
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.space_before = Pt(2)
        r = p.add_run(texto)
        r.font.bold = True
        r.font.size = Pt(9.5)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    for i, fila in enumerate(filas):
        celdas = t.add_row().cells
        for j, valor in enumerate(fila):
            c = celdas[j]
            c.width = anchos_in[j]
            if i % 2 == 1:
                sombrear(c._tc.get_or_add_tcPr(), FONDO_FILA)
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            # Prefijo | para monoespaciado, * para negrita
            mono = valor.startswith("|")
            fuerte = valor.startswith("*")
            texto = valor[1:] if (mono or fuerte) else valor
            r = p.add_run(texto)
            r.font.size = Pt(9.5)
            if mono:
                r.font.name = "Consolas"
                r.font.size = Pt(9)
            if fuerte:
                r.font.bold = True

    # Las columnas hay que fijarlas celda a celda: Word ignora el ancho de
    # columna si las celdas no lo llevan.
    for fila in t.rows:
        for j, c in enumerate(fila.cells):
            c.width = anchos_in[j]
    par(despues=4)
    return t


def aviso(titulo, cuerpo, color="FFF4E0"):
    """Caja destacada, para lo que no puede pasarse por alto."""
    t = doc.add_table(rows=1, cols=1)
    ancho = Inches(6.5)
    t.columns[0].width = ancho
    c = t.cell(0, 0)
    c.width = ancho
    sombrear(c._tc.get_or_add_tcPr(), color)
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(titulo)
    r.font.bold = True
    r.font.size = Pt(10.5)
    p2 = c.add_paragraph()
    p2.paragraph_format.space_after = Pt(1)
    r2 = p2.add_run(cuerpo)
    r2.font.size = Pt(10)
    par(despues=4)
    return t


# =========================================================================
# PORTADA
# =========================================================================

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(2)
r = p.add_run("INTEGRACIÓN SICOV")
r.font.size = Pt(9.5)
r.font.bold = True
r.font.color.rgb = GRIS
# Espaciado entre letras, para que el rotulo se lea como rotulo.
rPr = r._r.get_or_add_rPr()
sp = OxmlElement("w:spacing")
sp.set(qn("w:val"), "60")
rPr.append(sp)

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(4)
r = p.add_run("APIs de consumo para GESMOVIL")
r.font.size = Pt(23)
r.font.bold = True
r.font.color.rgb = AZUL

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(16)
r = p.add_run(
    "Alistamientos y mantenimientos de COMBUSES, expuestos para su transmisión "
    "al ecosistema de la Superintendencia de Transporte (SINST — VIGIA 2)."
)
r.font.size = Pt(11.5)
r.font.color.rgb = GRIS
borde_inferior(p)

tabla(
    ["Dato", "Valor"],
    [
        ["Empresa", "*COMPAÑIA METROPOLITANA DE BUSES S.A. (COMBUSES S.A.)"],
        ["NIT", "|890920397"],
        ["Aliado Tecnológico", "GESMOVIL"],
        ["Versión del contrato", "|v1"],
        ["Fecha del documento", "22 de septiembre de 2026"],
        ["Contrato de referencia", "Manual de apis requeridas para integración\nalistamiento-mantenimientos-despachos"],
    ],
    [1.7, 4.8],
)

par(despues=2)
rico(
    [
        ("Documento dirigido al equipo técnico de GESMOVIL. ", "b"),
        (
            "La credencial de acceso no viaja en este documento: se entrega por "
            "canal cifrado aparte. Ver sección 3.",
            "",
        ),
    ]
)

# =========================================================================
h1("1. Qué está disponible")

tabla(
    ["Endpoint", "Estado"],
    [
        ["|GET /alistamientos", "Disponible"],
        ["|GET /mantenimientos", "Disponible"],
        ["Despachos y llegadas", "Fuera de alcance. Responde 404 con la lista de lo que sí existe."],
    ],
    [2.3, 4.2],
)

par(
    "Esta plataforma cubre alistamiento y mantenimiento. Despachos y llegadas no "
    "están implementados y no está previsto que lo estén por esta vía."
)

# =========================================================================
h1("2. URL base")

codigo(["https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-gesmovil"], tam=9.5)

# =========================================================================
h1("3. Autenticación")

rico([("Cabecera ", ""), ("X-API-Key", "c"), (" en cada petición.", "")])

codigo(["X-API-Key: sicov_xxxxxxxx_<secreto>"], tam=9.5)

aviso(
    "La credencial se entrega por canal cifrado, aparte de este documento.",
    "No viaja aquí a propósito. Si no la ha recibido, solicítela al área de "
    "desarrollo de COMBUSES.",
)

par("Detalles que conviene conocer:", antes=6)

vineta_rica(
    [
        ("COMBUSES guarda solo el SHA-256 de la clave. ", ""),
        ("No se puede recuperar.", "b"),
        (" Si se pierde, se genera otra y la anterior deja de servir.", ""),
    ]
)
vineta_rica(
    [
        ("El prefijo (", ""),
        ("sicov_xxxxxxxx", "c"),
        (
            ") queda visible en los registros de acceso de COMBUSES. Sirve para "
            "identificar qué credencial hizo cada consulta.",
            "",
        ),
    ]
)
vineta("Vigencia de un año, renovable. La fecha exacta va con la credencial.")
vineta_rica(
    [
        ("No hay CORS.", "b"),
        (
            " Esto es servidor a servidor. Una llamada desde un navegador será "
            "bloqueada, y es intencionado: si la API fuera alcanzable desde una "
            "página web, la clave acabaría dentro de un frontend a la vista de "
            "cualquiera.",
            "",
        ),
    ]
)

# =========================================================================
h1("4. Parámetros")

rico(
    [
        ("Los dos endpoints reciben los mismos, y ", ""),
        ("ambos son obligatorios", "b"),
        (":", ""),
    ]
)

tabla(
    ["Parámetro", "Formato", "Nota"],
    [
        ["|fechaInicio", "|AAAA-MM-DD", "No puede estar en el futuro"],
        ["|fechaFin", "|AAAA-MM-DD", "No puede ser anterior a fechaInicio"],
    ],
    [1.5, 1.5, 3.5],
)

par("Límites:", antes=6)

vineta_rica(
    [
        ("Rango máximo: 92 días.", "b"),
        (
            " El manual no define paginación, así que la alternativa a limitar el "
            "rango sería truncar filas en silencio, y entonces GESMOVIL reportaría "
            "de menos sin enterarse. Para períodos más largos, dividir la consulta.",
            "",
        ),
    ]
)
vineta_rica(
    [
        ("Antigüedad máxima: 400 días.", "b"),
        (" Más atrás que eso no es una consulta operativa.", ""),
    ]
)
vineta_rica(
    [
        ("Límite de peticiones: 120 por hora.", "b"),
        (" Al pasarse, 429 con ", ""),
        ("Retry-After", "c"),
        (".", ""),
    ]
)

par(
    "La fecha es el día calendario colombiano al que corresponde el registro, no "
    "el instante en que se grabó. Se guardan por separado a propósito: un "
    "alistamiento hecho a las 11 de la noche corresponde a ese día, no al "
    "siguiente.",
    antes=6,
)

# =========================================================================
h1("5. GET /alistamientos")

codigo(
    [
        'curl "https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-gesmovil/alistamientos\\',
        '?fechaInicio=2026-09-01&fechaFin=2026-09-22" \\',
        '     -H "X-API-Key: <credencial>"',
    ]
)

h2("Respuesta")

codigo(
    [
        "{",
        '  "success": true,',
        '  "data": [',
        "    {",
        '      "alistamiento_id": 3,',
        '      "placa": "EQR790",',
        '      "fechaAlistamiento": "2026-09-22 17:37:56",',
        '      "responsable": {',
        '        "tipoIdentificacion": 1,',
        '        "numeroIdentificacion": "75083542",',
        '        "nombre": "SANTIAGO BERNAL LONDOÑO"',
        "      },",
        '      "conductor": {',
        '        "tipoIdentificacion": 1,',
        '        "numeroIdentificacion": "1038803306",',
        '        "nombre": "VILLADA FLOREZ GERLI"',
        "      },",
        '      "detalleActividades": "Niveles de aceite de motor, Fugas del motor",',
        '      "actividades": [4, 1]',
        "    }",
        "  ]",
        "}",
    ]
)

h2("Campos")

tabla(
    ["Campo", "Nota"],
    [
        ["|alistamiento_id", "Consecutivo de COMBUSES. Único y estable."],
        ["|fechaAlistamiento", "Fecha y hora, en hora de Colombia (-05:00, sin horario de verano)."],
        ["|responsable", "Responsable del proceso, de la configuración de la empresa. No lo digita el conductor."],
        ["|conductor", "Solo conductores activos de la nómina pueden registrar, así que este dato siempre corresponde a uno."],
        ["|actividades", "*Ids oficiales de la Superintendencia, nunca ids internos de COMBUSES. Ver sección 8."],
        ["|detalleActividades", "Las descripciones oficiales de esos mismos ids, en el mismo orden."],
    ],
    [1.8, 4.7],
)

rico([("tipoIdentificacion: 1", "c"), (" es cédula de ciudadanía.", "")])

par(
    "Hay un alistamiento por placa y por día como máximo. Si se corrige algo, se "
    "corrige ese registro; no se crea un segundo. Por eso alistamiento_id no se "
    "duplica para una misma placa y fecha."
)

# =========================================================================
h1("6. GET /mantenimientos")

codigo(
    [
        "{",
        '  "success": true,',
        '  "data": [',
        "    {",
        '      "mantenimiento_id": 1,',
        '      "fecha": "2026-09-20",',
        '      "placa": "EQR790",',
        '      "hora": "14:30",',
        '      "nit": "890920397",',
        '      "razonSocial": "COMPAÑIA METROPOLITANA DE BUSES S.A.",',
        '      "tipoIdentificacion": 1,',
        '      "numeroIdentificacion": "75083542",',
        '      "nombresResponsable": "SANTIAGO BERNAL LONDOÑO",',
        '      "tipomantenimiento": 1,',
        '      "detalleActividades": "Niveles de aceite de motor, Fugas del motor"',
        "    }",
        "  ]",
        "}",
    ]
)

tabla(
    ["Campo", "Nota"],
    [
        ["|tipomantenimiento", "1 preventivo, 2 correctivo"],
        [
            "|detalleActividades",
            "Descripciones oficiales de las actividades marcadas. Si el registro no marcó ninguna del catálogo, lleva el detalle en texto libre.",
        ],
    ],
    [1.8, 4.7],
)

rico(
    [
        ("A diferencia de alistamientos, aquí ", ""),
        ("no viaja un arreglo ", "b"),
        ("actividades", "c"),
        (": el manual pide el detalle como texto para este endpoint.", ""),
    ]
)

# =========================================================================
h1("7. Códigos de respuesta")

tabla(
    ["Código", "Cuándo", "Qué hacer"],
    [
        ["|200", "Hay registros", "Procesar data"],
        ["|400", "Parámetros mal", "Corregir la petición. El mensaje dice qué falla."],
        ["|401", "Falta la cabecera, o la credencial no vale / expiró", "Revisar la credencial"],
        ["|404", "*No hay registros en el rango", "No es un error. Ver abajo."],
        ["|429", "Más de 120 peticiones en una hora", "Esperar lo que diga Retry-After"],
        ["|503", "Falta configuración u homologación en COMBUSES", "Avisar a COMBUSES. No se resuelve del lado de GESMOVIL."],
        ["|500", "Fallo inesperado", "Reintentar; si persiste, avisar"],
    ],
    [0.8, 2.6, 3.1],
)

aviso(
    "Sobre el 404",
    "El manual reserva ese código para «no se encontraron registros». No es lo "
    "habitual en REST —un rango sin actividad es una respuesta válida, no un "
    "error— pero es el contrato del manual y manda el contrato. Conviene tratarlo "
    "como «cero registros», no como fallo de integración.",
    color="EAF1FB",
)

par("Todos los errores llegan con la misma envoltura:", antes=6)

codigo(['{ "success": false, "message": "texto explicando qué pasó" }'], tam=9.5)

h2("Cabeceras de respuesta")

tabla(
    ["Cabecera", "Para qué"],
    [
        ["|X-Api-Version", "Versión del contrato (hoy v1)"],
        ["|X-Total-Registros", "Cuántos elementos trae data"],
        ["|Cache-Control: no-store", "No cachear: son registros, no referencia"],
    ],
    [2.1, 4.4],
)

# =========================================================================
h1("8. Lo que falta para producción")

par("El catálogo oficial de actividades de alistamiento, con sus ids.", negrita=True, tam=11.5)

rico(
    [
        ("El campo ", ""),
        ("actividades", "c"),
        (
            " viaja siempre con ids oficiales de la Superintendencia. COMBUSES usa "
            "internamente su propio checklist de 40 puntos y lo traduce al "
            "responder, siguiendo lo que indica el manual:",
            "",
        ),
    ]
)

p = doc.add_paragraph()
p.paragraph_format.left_indent = Inches(0.35)
p.paragraph_format.space_before = Pt(4)
p.paragraph_format.space_after = Pt(9)
r = p.add_run(
    "«Procedimiento es consultar las actividades de alistamiento en el link "
    "anterior y homologar con las actividades de alistamiento que tiene la "
    "empresa de transporte.»"
)
r.font.italic = True
r.font.color.rgb = GRIS

par(
    "Para cargar esa homologación hace falta el catálogo oficial. Hoy COMBUSES "
    "solo conoce dos pares id–descripción (los del ejemplo del manual), así que "
    "mientras tanto:"
)

codigo(
    [
        "GET /alistamientos  ->  503",
        "",
        "{",
        '  "success": false,',
        '  "message": "Hay 38 actividad(es) sin homologar con el catalogo',
        '              oficial de la Superintendencia (...). Los registros se',
        '              estan capturando, pero no se pueden reportar hasta',
        '              completar la homologacion."',
        "}",
    ]
)

par(
    "Es deliberado, y es todo o nada. Entregar solo las actividades que sí tienen "
    "traducción produciría un reporte silenciosamente incompleto: diría que se "
    "verificaron 2 puntos cuando fueron 40, y nadie lo notaría hasta una "
    "auditoría. Y entregar ids internos sería peor: para la Superintendencia, el "
    "id 1011 no significa «una actividad de COMBUSES», significa otra actividad "
    "distinta."
)

aviso(
    "Lo que se pide a GESMOVIL",
    "El archivo del catálogo oficial de actividades de alistamiento, con id y "
    "descripción de cada una. GESMOVIL ya integra con VIGIA 2, así que debería "
    "tenerlo.",
)

h2("Lo verificado sobre el endpoint de la maestra")

rico(
    [
        ("Sobre ", ""),
        ("GET /api/v2/mantenimiento/listar-actividades", "c"),
        (
            " de la Superintendencia: se verificó contra el servicio real y la "
            "cabecera correcta es ",
            "",
        ),
        ("Authorization: Bearer", "c"),
        (
            ". Con el token del manual responde «Error en el token» (ese token sí "
            "sirve para nivelservicio y listar-clase-vehiculo). Ninguna variante "
            "del endpoint es pública.",
            "",
        ),
    ]
)

aviso(
    "No se pierde nada de lo que se capture mientras tanto",
    "La traducción se aplica al leer, no al guardar. El día que se cargue la "
    "homologación, todo el histórico ya capturado queda reportable de inmediato, "
    "sin tocar un solo registro.",
    color="E9F6EF",
)

# =========================================================================
h1("9. Alcance de la flota")

rico(
    [
        ("Solo entran los vehículos de la ruta ", ""),
        ("AEROPUERTO", "b"),
        (
            " (54 unidades, internos 703 a 759): el servicio al aeropuerto José "
            "María Córdova.",
            "",
        ),
    ]
)

par(
    "COMBUSES opera también rutas urbanas en Medellín con la misma empresa, pero "
    "el SICOV-OTPC cubre el transporte intermunicipal por carretera. Los "
    "vehículos urbanos no se alistan por esta vía y no aparecerán en las "
    "respuestas."
)

# =========================================================================
h1("10. Recomendaciones de consumo")

vineta_rica(
    [
        ("Una consulta diaria", "b"),
        (
            " del día anterior cubre la operación normal. Los alistamientos se "
            "registran antes de salir a ruta.",
            "",
        ),
    ]
)
vineta_rica(
    [
        ("Reprocesar los últimos días", "b"),
        (
            " de vez en cuando: un registro puede corregirse después de haberse "
            "consultado, y en ese caso el alistamiento_id es el mismo. Conviene "
            "tratar el id como clave de actualización, no insertar siempre.",
            "",
        ),
    ]
)
vineta_rica(
    [
        ("No asumir orden en ", "b"),
        ("actividades", "bc"),
        (". El arreglo no viene ordenado; si importa, ordenar del lado de GESMOVIL.", ""),
    ]
)
vineta_rica(
    [
        ("Guardar el ", "b"),
        ("message", "bc"),
        (" de los errores.", "b"),
        (
            " Están redactados para decir qué falta, y ahorran una ida y vuelta al "
            "diagnosticar.",
            "",
        ),
    ]
)

# =========================================================================
h1("11. Qué necesita COMBUSES para cerrar la integración")

numerada("El catálogo oficial de actividades de alistamiento con sus ids (sección 8).")
numerada("Confirmación de que el consumo funciona con la credencial entregada.")
numerada("La IP o el rango de IP desde donde consumirán, si conviene restringirlo.")

p = doc.add_paragraph(style="List Number")
p.paragraph_format.left_indent = Inches(0.28)
p.paragraph_format.space_after = Pt(4)
r = p.add_run("Si VIGIA 2 espera el NIT con dígito de verificación. ")
r.font.bold = True
r2 = p.add_run(
    "Hoy el campo nit viaja como 890920397 (sin DV), porque el campo del manual "
    "es nit a secas. El DV es 5. Si hace falta enviarlo como 890920397-5, se "
    "cambia en la configuración de COMBUSES y basta."
)

h2("Nota sobre la razón social")

rico(
    [
        ("La razón social correcta es ", ""),
        ("COMPAÑIA METROPOLITANA DE BUSES S.A.", "b"),
        (
            ", según la casilla 35 del RUT (formulario DIAN 141264854098, "
            "actualizado el 31 de julio de 2026), coincidente con el RUES. La sigla "
            "registrada es ",
            "",
        ),
        ("COMBUSES S.A.", "b"),
        ("", ""),
    ]
)

par(
    "La cotización de GESMOVIL identifica a la empresa como «COMPAÑIA "
    "METROPOLITANA DE BUSES Y CIA S.C.A.». Son formas jurídicas distintas "
    "—Sociedad Anónima frente a Sociedad en Comandita por Acciones— y conviene "
    "corregirlo antes de firmar el contrato de designación como Aliado "
    "Tecnológico, que debe llevar la razón social del RUT."
)

par(
    "Este dato viaja en cada mantenimiento reportado y el sujeto obligado que "
    "responde por su veracidad es COMBUSES."
)

h2("Contacto")

par("Dudas técnicas del contrato, credenciales o incidencias: área de desarrollo de COMBUSES.")

# =========================================================================
salida = os.path.join(
    r"C:\Users\coordesarrollo\Documents\gesmovil sicov",
    "Integracion SICOV - COMBUSES a GESMOVIL.docx",
)
doc.save(salida)
print("guardado:", salida)
print("parrafos:", len(doc.paragraphs), " tablas:", len(doc.tables))
