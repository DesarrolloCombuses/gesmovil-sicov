# -*- coding: utf-8 -*-
"""
Genera el Word que se entrega a GESMOVIL.

La fuente de verdad es INTEGRACION-GESMOVIL.md. Este script solo lo maqueta: si
cambia el contrato, se cambia el .md y se vuelve a correr. El .docx no se edita
a mano, porque entonces los dos se separan y no hay forma de saber cual vale.

ALCANCE DEL DOCUMENTO: solo como consumir la API. Nada del razonamiento interno
de COMBUSES -- por que se diseno asi la homologacion, por que la flota se limita
a una ruta, como se captura. Eso no le sirve a quien tiene que escribir un
cliente HTTP, y alarga un documento que se lee para trabajar. Ese razonamiento
vive en README.md y en los comentarios de las migraciones.

  python scripts/generar-word-integracion.py

Requiere python-docx. Para revisar el resultado se exporta a PDF con Word por
COM (esta maquina no tiene LibreOffice ni pandoc) y se miran las paginas.
"""
import os
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

AZUL = RGBColor(0x1A, 0x4F, 0xA0)
GRIS = RGBColor(0x5B, 0x6B, 0x7D)
TINTA = RGBColor(0x16, 0x20, 0x2C)

FONDO_CODIGO = "F4F6F9"
FONDO_CABECERA = "1A4FA0"
FONDO_FILA = "F7F9FC"

FECHA = "4 de noviembre de 2026"
BASE_URL = "https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-gesmovil"

doc = Document()

# --- Pagina: Carta, que es el tamano que se usa en Colombia -----------------
for s in doc.sections:
    s.page_width = Inches(8.5)
    s.page_height = Inches(11)
    s.left_margin = Inches(1)
    s.right_margin = Inches(1)
    s.top_margin = Inches(0.9)
    s.bottom_margin = Inches(0.9)

base = doc.styles["Normal"]
base.font.name = "Calibri"
base.font.size = Pt(10.5)
base.font.color.rgb = TINTA
base.paragraph_format.space_after = Pt(7)
base.paragraph_format.line_spacing = 1.08
base.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")


def sombrear(elemento, color):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color)
    elemento.append(shd)


def borde_inferior(p, color="D8E0EA", grosor=6):
    pPr = p._p.get_or_add_pPr()
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
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(7)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(texto)
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = AZUL
    borde_inferior(p)
    return p


def h2(texto):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
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
    """Parrafo mezclando estilos: [(texto, "b"|"c"|"bc"|""), ...]"""
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
        if "g" in estilo:
            r.font.color.rgb = GRIS
    return p


def vineta_rica(trozos):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.28)
    p.paragraph_format.space_after = Pt(4)
    for texto, estilo in trozos:
        r = p.add_run(texto)
        if "b" in estilo:
            r.font.bold = True
        if "c" in estilo:
            r.font.name = "Consolas"
            r.font.size = Pt(9.5)
    return p


def numerada(trozos, con_siguiente=False):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.left_indent = Inches(0.28)
    p.paragraph_format.space_after = Pt(4)
    # Una lista numerada partida entre dos paginas se lee mal, y peor si el
    # titulo queda en la anterior.
    p.paragraph_format.keep_together = True
    p.paragraph_format.keep_with_next = con_siguiente
    for texto, estilo in trozos:
        r = p.add_run(texto)
        if "b" in estilo:
            r.font.bold = True
        if "c" in estilo:
            r.font.name = "Consolas"
            r.font.size = Pt(9.5)
    return p


def codigo(lineas, tam=8.0):
    """Bloque monoespaciado sombreado. Es una tabla de una celda para que el
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
    par(despues=2)
    return t


def tabla(cabeceras, filas, anchos):
    """Prefijos en cada celda: | monoespaciado, * negrita.

    cabeceras=None para una tabla sin fila de titulos: la de la portada son
    pares dato/valor, y una barra azul vacia encima se ve como un error."""
    columnas = len(anchos)
    t = doc.add_table(rows=1 if cabeceras else 0, cols=columnas)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    anchos_in = [Inches(a) for a in anchos]

    if cabeceras:
        # Si la tabla se parte entre paginas, que la cabecera se repita arriba.
        # Sin esto, una tabla partida deja la fila azul sola al pie de una
        # pagina y las filas de datos sin titulo en la siguiente.
        trPr = t.rows[0]._tr.get_or_add_trPr()
        th = OxmlElement("w:tblHeader")
        th.set(qn("w:val"), "true")
        trPr.append(th)

    for j, texto in enumerate(cabeceras or []):
        c = t.cell(0, j)
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
            if i % 2 == 1:
                sombrear(c._tc.get_or_add_tcPr(), FONDO_FILA)
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            mono = valor.startswith("|")
            fuerte = valor.startswith("*")
            r = p.add_run(valor[1:] if (mono or fuerte) else valor)
            r.font.size = Pt(9.5)
            if mono:
                r.font.name = "Consolas"
                r.font.size = Pt(9)
            if fuerte:
                r.font.bold = True

    # Word ignora el ancho de columna si las celdas no lo llevan.
    for fila in t.rows:
        for j, c in enumerate(fila.cells):
            c.width = anchos_in[j]
    par(despues=4)
    return t


def aviso(titulo, cuerpo, color="FFF4E0"):
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


# ===========================================================================
# PORTADA
# ===========================================================================

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(2)
r = p.add_run("SICOV")
r.font.size = Pt(9.5)
r.font.bold = True
r.font.color.rgb = GRIS
rPr = r._r.get_or_add_rPr()
sp = OxmlElement("w:spacing")
sp.set(qn("w:val"), "60")
rPr.append(sp)

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(4)
r = p.add_run("API de COMBUSES — Guía de consumo")
r.font.size = Pt(22)
r.font.bold = True
r.font.color.rgb = AZUL

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(14)
r = p.add_run(
    "Consulta de alistamientos y mantenimientos. Contrato según el Manual de "
    "apis requeridas para integración alistamiento-mantenimientos-despachos."
)
r.font.size = Pt(11)
r.font.color.rgb = GRIS
borde_inferior(p)

tabla(
    None,
    [
        ["URL base", "|" + BASE_URL],
        ["Autenticación", "|X-API-Key"],
        ["Formato", "JSON"],
        ["Versión del contrato", "|v2"],
        ["Fecha del documento", FECHA],
    ],
    [1.5, 5.0],
)

rico(
    [
        ("La credencial de acceso se entrega por canal cifrado, aparte de este documento.", "b"),
    ],
    antes=2,
)

# ===========================================================================
h1("1. Endpoints")

tabla(
    ["Método", "Ruta", "Estado"],
    [
        ["|GET", "|/alistamientos", "Disponible"],
        ["|GET", "|/mantenimientos", "Disponible"],
        ["|GET", "|/actividades", "Disponible. Catálogo de actividades de COMBUSES"],
        ["—", "|/despachos, /llegadas", "No disponibles. Responden 404."],
    ],
    [0.9, 2.3, 3.3],
)

# ===========================================================================
h1("2. Autenticación")

rico([("Cabecera ", ""), ("X-API-Key", "c"), (" en cada petición.", "")])

codigo(["X-API-Key: sicov_xxxxxxxx_<secreto>"], tam=9.5)

vineta_rica([("Vigencia de un año, renovable.", "")])
vineta_rica(
    [("No se puede recuperar si se pierde: se emite una nueva y la anterior deja de servir.", "")]
)
vineta_rica(
    [
        ("No hay CORS.", "b"),
        (" La integración es servidor a servidor; una llamada desde un navegador será bloqueada.", ""),
    ]
)

# ===========================================================================
h1("3. Parámetros")

rico(
    [
        ("/alistamientos", "c"),
        (" y ", ""),
        ("/mantenimientos", "c"),
        (" reciben los mismos, y los dos son obligatorios. ", ""),
        ("/actividades", "c"),
        (" no recibe parámetros.", ""),
    ]
)

tabla(
    ["Parámetro", "Formato", "Regla"],
    [
        ["|fechaInicio", "|AAAA-MM-DD", "No puede estar en el futuro"],
        ["|fechaFin", "|AAAA-MM-DD", "No puede ser anterior a fechaInicio"],
    ],
    [1.5, 1.5, 3.5],
)

h2("Límites")

tabla(
    ["Límite", "Valor", "Al excederlo"],
    [
        ["Rango de la consulta", "92 días", "|400"],
        ["Antigüedad máxima", "400 días", "|400"],
        ["Peticiones", "120 por hora", "|429 con Retry-After"],
    ],
    [2.2, 1.7, 2.6],
)

par("Para períodos mayores a 92 días, dividir la consulta en tramos.")

rico(
    [
        ("Las fechas corresponden al ", ""),
        ("día calendario colombiano", "b"),
        (" del registro, no al instante en que se grabó.", ""),
    ]
)

# ===========================================================================
h1("4. GET /alistamientos")

codigo(
    [
        'curl "' + BASE_URL + '/alistamientos\\',
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
        '      "actividades": [1000, 1001]',
        "    }",
        "  ]",
        "}",
    ]
)

h2("Campos")

tabla(
    ["Campo", "Tipo", "Descripción"],
    [
        ["|alistamiento_id", "entero", "Consecutivo único y estable"],
        ["|placa", "texto", "Placa del vehículo"],
        ["|fechaAlistamiento", "texto", "Fecha y hora, en hora de Colombia (-05:00)"],
        ["|responsable", "objeto", "Responsable del proceso"],
        ["|conductor", "objeto", "Conductor que registró"],
        ["|actividades", "arreglo", "Ids de actividad de COMBUSES (sección 6)"],
        ["|detalleActividades", "texto", "Descripciones de esos ids, en el mismo orden"],
    ],
    [1.7, 0.9, 3.9],
)

rico([("tipoIdentificacion: 1", "c"), (" es cédula de ciudadanía.", "")])

rico(
    [
        ("La homologación al catálogo de la Superintendencia la realiza GESMOVIL.", "b"),
        (" Los ids de ", ""),
        ("actividades", "c"),
        (" son los de COMBUSES, desde el 1000, y su significado está en ", ""),
        ("GET /actividades", "c"),
        (".", ""),
    ]
)

rico(
    [
        ("Hay como máximo ", ""),
        ("un alistamiento por placa y por día", "b"),
        (". Una corrección modifica ese registro y conserva su alistamiento_id.", ""),
    ]
)

rico(
    [
        ("La flota cubierta es la de la ruta ", ""),
        ("AEROPUERTO", "b"),
        (": 54 vehículos, internos 703 a 759.", ""),
    ]
)

# ===========================================================================
h1("5. GET /mantenimientos")

codigo(
    [
        "{",
        '  "success": true,',
        '  "data": [',
        "    {",
        '      "mantenimiento_id": 1,',
        '      "fecha": "2026-09-20",',
        '      "placa": "EQR790",',
        '      "hora": "14:30:00",',
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

h2("Campos")

tabla(
    ["Campo", "Tipo", "Descripción"],
    [
        ["|mantenimiento_id", "entero", "Consecutivo único y estable"],
        ["|fecha", "texto", "AAAA-MM-DD"],
        ["|hora", "texto", "HH:MM:SS"],
        ["|nit", "texto", "NIT de COMBUSES, sin dígito de verificación"],
        ["|razonSocial", "texto", "Razón social de COMBUSES"],
        ["|tipomantenimiento", "entero", "1 preventivo, 2 correctivo"],
        ["|detalleActividades", "texto", "Actividades ejecutadas"],
    ],
    [1.7, 0.9, 3.9],
)

rico(
    [
        ("Este endpoint ", ""),
        ("no devuelve un arreglo ", "b"),
        ("actividades", "bc"),
        (": el manual pide el detalle como texto.", ""),
    ]
)

# ===========================================================================
h1("6. GET /actividades")

par(
    "Catálogo completo de actividades de COMBUSES. Es la referencia para "
    "homologar los ids que viajan en actividades."
)

codigo(
    [
        'curl "' + BASE_URL + '/actividades" \\',
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
        '      "id": 1000,',
        '      "descripcion": "Niveles de aceite de motor",',
        '      "grupo": "Motor y fluidos",',
        '      "activa": true,',
        '      "aplicaAlistamiento": true,',
        '      "aplicaMantenimiento": true',
        "    }",
        "  ]",
        "}",
    ]
)

h2("Campos")

tabla(
    ["Campo", "Tipo", "Descripción"],
    [
        ["|id", "entero", "El id que viaja en actividades"],
        ["|descripcion", "texto", "La que viaja en detalleActividades"],
        ["|grupo", "texto", "Agrupación dentro del checklist"],
        ["|activa", "booleano", "false si se retiró del checklist"],
        ["|aplicaAlistamiento", "booleano", "Se verifica en el alistamiento diario"],
        ["|aplicaMantenimiento", "booleano", "Se usa en mantenimientos"],
    ],
    [1.7, 0.9, 3.9],
)

par(
    "Las actividades retiradas siguen apareciendo con activa: false, porque los "
    "registros anteriores pueden llevarlas. Los ids no se reutilizan: si COMBUSES "
    "agrega una actividad, aparece aquí con un id nuevo."
)

rico(
    [
        ("Para homologar conviene usar el arreglo ", ""),
        ("actividades", "c"),
        (" y no el texto de ", ""),
        ("detalleActividades", "c"),
        (". Ese texto une las descripciones con comas, y algunas descripciones "
         "tienen comas propias.", ""),
    ]
)

# ===========================================================================
h1("7. Códigos de respuesta")

tabla(
    ["Código", "Significado", "Acción"],
    [
        ["|200", "Hay registros", "Procesar data"],
        ["|400", "Parámetros inválidos", "Corregir la petición; message indica qué falla"],
        ["|401", "Credencial ausente, inválida o vencida", "Revisar la credencial"],
        ["|404", "Sin registros en el rango", "Tratar como cero registros, no como error"],
        ["|429", "Límite de peticiones excedido", "Esperar lo indicado en Retry-After"],
        ["|503", "Falta configuración de COMBUSES", "Reportarlo a COMBUSES"],
        ["|500", "Fallo inesperado", "Reintentar; si persiste, reportar"],
    ],
    [0.8, 2.6, 3.1],
)

par("Los errores llegan con la misma envoltura:")

codigo(['{ "success": false, "message": "texto explicando qué pasó" }'], tam=9.5)

aviso(
    "Sobre el 404",
    "El manual reserva ese código para «no se encontraron registros». Un rango "
    "sin actividad devuelve 404, no 200 con lista vacía. Conviene no tratarlo "
    "como fallo de integración.",
    color="EAF1FB",
)

aviso(
    "Sobre el 503",
    "Aparece si falta un dato de configuración de COMBUSES que el manual exige, "
    "como el NIT o la razón social en /mantenimientos. El message nombra el dato. "
    "No depende de la consulta: se resuelve del lado de COMBUSES.",
)

h2("Rango de prueba")

par(
    "La operación diaria se registra desde el 7 de octubre de 2026. Para probar "
    "el consumo hay además registros de prueba:"
)

tabla(
    ["Rango", "Contenido"],
    [
        ["|2026-09-01  a  2026-09-04",
         "4 alistamientos y 2 mantenimientos. Responde 200."],
    ],
    [2.4, 4.1],
)

par(
    "Uno de los alistamientos tiene una actividad no conforme, y los "
    "mantenimientos cubren los dos valores de tipomantenimiento. Cada "
    "alistamiento de prueba lleva 2 actividades; uno real lleva 40. El campo "
    "actividades es un arreglo en ambos casos."
)

aviso(
    "Estos registros se retiran antes de la puesta en producción",
    "No deben transmitirse a la Superintendencia: corresponden a alistamientos "
    "que no ocurrieron.",
    color="FDF0E6",
)

# ===========================================================================
h1("8. Cabeceras de respuesta")

tabla(
    ["Cabecera", "Contenido"],
    [
        ["|X-Api-Version", "Versión del contrato (v2)"],
        ["|X-Total-Registros", "Número de elementos en data"],
        ["|Cache-Control", "|no-store"],
    ],
    [2.1, 4.4],
)

par(
    "La v2 cambió el contenido de actividades: en la v1 llevaba ids oficiales de "
    "la Superintendencia, y desde la v2 lleva los ids de COMBUSES."
)

# ===========================================================================
h1("9. Recomendaciones de consumo")

vineta_rica(
    [("Una consulta diaria", "b"), (" del día anterior cubre la operación normal.", "")]
)
vineta_rica(
    [
        ("Reprocesar los últimos días", "b"),
        (
            " periódicamente: un registro puede corregirse después de haber sido "
            "consultado y conserva su id. Conviene usar el id como clave de "
            "actualización, no insertar siempre.",
            "",
        ),
    ]
)
vineta_rica([("No asumir orden", "b"), (" en el arreglo actividades.", "")])
vineta_rica(
    [
        ("Consultar /actividades a diario.", "b"),
        (" Un id de actividades que no esté en la tabla de homologación de "
         "GESMOVIL indica que COMBUSES agregó una actividad.", ""),
    ]
)
vineta_rica(
    [
        ("Conservar el ", "b"),
        ("message", "bc"),
        (" de los errores.", "b"),
        (" Indica la causa concreta.", ""),
    ]
)

# ===========================================================================
h1("10. Soporte")

par("Dudas del contrato, credenciales o incidencias: área de desarrollo de COMBUSES.")

h2("Para cerrar la integración se requiere de GESMOVIL")

numerada(
    [
        ("Copia de la tabla de homologación que construyan (id de COMBUSES → id "
         "oficial), para que COMBUSES pueda verificar lo que se reporta a su nombre.", ""),
    ],
    con_siguiente=True,
)
numerada([("Confirmación de que el consumo funciona con la credencial entregada.", "")], con_siguiente=True)
numerada([("La IP o rango de IP desde donde consumirán, si se desea restringir el acceso.", "")], con_siguiente=True)
numerada(
    [
        ("Confirmación de si VIGIA 2 espera el NIT con dígito de verificación. ", ""),
        ("El DV es 5, y hoy el campo viaja como 890920397, sin él.", ""),
    ],
    con_siguiente=True,
)
numerada(
    [
        ("Confirmación del formato esperado en el campo ", ""),
        ("hora", "c"),
        (" de mantenimientos. Hoy viaja como HH:MM:SS; los segundos son siempre "
         "00, porque la captura es a minuto. Se ajusta a HH:MM si VIGIA 2 lo "
         "requiere así.", ""),
    ]
)

# ===========================================================================
salida = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "API SICOV COMBUSES - Guia de consumo.docx",
)
doc.save(salida)
print("guardado:", salida)
print("parrafos:", len(doc.paragraphs), " tablas:", len(doc.tables))
