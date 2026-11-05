# -*- coding: utf-8 -*-
"""
Genera el Excel que GESMOVIL llena para homologar las actividades.

Desde la v2 de la API, GESMOVIL homologa de su lado los ids que la API entrega.
Este archivo es el catalogo que necesitan para hacerlo: las actividades del
checklist con su id de COMBUSES, y dos columnas amarillas donde escriben el id
y la descripcion oficial. Se les pide devolverlo lleno, porque es la unica
copia que COMBUSES tendria de a que se traduce cada actividad suya.

DE DONDE SALEN LOS IDS: de GET /sicov-alistar/formulario, el mismo endpoint con
el que el formulario del conductor pinta el checklist. No se pueden copiar de
seed-checklist.sql porque los asigna la secuencia al insertar, y el endpoint
aplica el mismo filtro que la API de GESMOVIL (activa y aplica_alistamiento).

LAS DOS FILAS PRELLENADAS son las unicas actividades oficiales que conocemos:
las del ejemplo del manual de GESMOVIL. Sirven ademas de muestra del formato.

  python scripts/generar-excel-homologacion.py

El .xlsx no se versiona: es una foto del checklist en el momento de generarlo.
Si el checklist cambia, se vuelve a correr.
"""
import json
import os
import urllib.request
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

URL_FORMULARIO = (
    "https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-alistar/formulario"
)

# Ejemplo del manual de GESMOVIL, seccion 7.4. No hay otra fuente de ids
# oficiales: el catalogo de la Supertransporte no abre con ningun token que
# tengamos (ver README).
OFICIALES_CONOCIDAS = {
    "Niveles de aceite de motor": 4,
    "Fugas del motor": 1,
}

FUENTE = "Arial"
AZUL = "1A4FA0"
TINTA = "16202C"
GRIS = "5B6B7D"
AMARILLO = "FFF4C2"
GRIS_CLARO = "F2F4F7"

fino = Side(style="thin", color="C9D1DC")
grueso = Side(style="medium", color="8A97A8")


def leer_actividades():
    with urllib.request.urlopen(URL_FORMULARIO, timeout=30) as resp:
        datos = json.load(resp)
    if not datos.get("success"):
        raise SystemExit("El endpoint /formulario no respondio success: " + str(datos))
    return datos["actividades"]


def main():
    actividades = leer_actividades()

    wb = Workbook()
    ws = wb.active
    ws.title = "Homologacion"
    ws.sheet_view.showGridLines = False

    anchos = {"A": 13, "B": 24, "C": 58, "D": 17, "E": 46, "F": 38}
    for col, ancho in anchos.items():
        ws.column_dimensions[col].width = ancho

    # --- Encabezado -------------------------------------------------------
    ws["A1"] = "Actividades de alistamiento de COMBUSES — homologación al catálogo de la Supertransporte"
    ws["A1"].font = Font(name=FUENTE, size=14, bold=True, color=AZUL)
    ws["A2"] = (
        f"COMPAÑÍA METROPOLITANA DE BUSES S.A. · NIT 890920397 · "
        f"{len(actividades)} actividades · generado el {date.today():%d-%m-%Y}"
    )
    ws["A2"].font = Font(name=FUENTE, size=10, color=GRIS)

    # --- Leyenda: que se llena y como ------------------------------------
    leyenda = [
        ("Ids:", "los de la columna A son los que la API envía en el campo actividades. El catálogo actualizado está en GET /actividades."),
        ("Qué llenar:", "las columnas amarillas, D y E, con la homologación que construyan, y devolvernos el archivo. Las columnas A, B y C son de COMBUSES; por favor no las modifiquen."),
        ("Varias oficiales:", "si una actividad de COMBUSES cubre varias oficiales, escriban todos los ids separados por coma (por ejemplo: 12, 15)."),
        ("Sin equivalente:", "escriban NO APLICA en la columna D, en lugar de asignar la actividad oficial más parecida."),
        ("Filas de ejemplo:", "las dos primeras ya vienen llenas con los ids del ejemplo del manual. Muestran el formato; les agradecemos confirmarlas."),
    ]
    fila = 4
    for etiqueta, texto in leyenda:
        # La etiqueta va en A:B porque en la columna A sola se corta.
        ws.merge_cells(start_row=fila, start_column=1, end_row=fila, end_column=2)
        ws.cell(fila, 1, etiqueta).font = Font(name=FUENTE, size=10, bold=True, color=TINTA)
        ws.merge_cells(start_row=fila, start_column=3, end_row=fila, end_column=6)
        c = ws.cell(fila, 3, texto)
        c.font = Font(name=FUENTE, size=10, color=TINTA)
        c.alignment = Alignment(vertical="center")
        fila += 1

    # --- Tabla -------------------------------------------------------------
    cab = fila + 1
    titulos = [
        "Id COMBUSES",
        "Grupo",
        "Actividad COMBUSES",
        "Id oficial Supertransporte",
        "Descripción oficial",
        "Observaciones",
    ]
    for i, t in enumerate(titulos, start=1):
        c = ws.cell(cab, i, t)
        c.font = Font(name=FUENTE, size=10, bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=AZUL)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = Border(left=fino, right=fino, top=fino, bottom=fino)
    ws.row_dimensions[cab].height = 30
    ws.freeze_panes = ws.cell(cab + 1, 1)

    grupo_anterior = None
    for n, act in enumerate(actividades):
        r = cab + 1 + n
        oficial = OFICIALES_CONOCIDAS.get(act["descripcion"])
        nuevo_grupo = act["grupo"] != grupo_anterior
        grupo_anterior = act["grupo"]

        valores = [
            act["id"],
            act["grupo"],
            act["descripcion"],
            # Texto y no numero: la columna admite "12, 15" y "NO APLICA", y
            # Excel convertiria "12, 15" en otra cosa si la celda es numerica.
            str(oficial) if oficial else None,
            act["descripcion"] if oficial else None,
            "Ejemplo del manual. Por confirmar." if oficial else None,
        ]
        for i, v in enumerate(valores, start=1):
            c = ws.cell(r, i, v)
            c.font = Font(name=FUENTE, size=10, color=GRIS if (oficial and i in (4, 5, 6)) else TINTA,
                          italic=bool(oficial and i == 6))
            c.alignment = Alignment(vertical="center", wrap_text=True,
                                    horizontal="center" if i in (1, 4) else "left")
            c.border = Border(left=fino, right=fino, bottom=fino,
                              top=grueso if nuevo_grupo else fino)
            if i in (4, 5):
                c.fill = PatternFill("solid", fgColor=AMARILLO)
                c.number_format = "@"
            elif i <= 3:
                c.fill = PatternFill("solid", fgColor=GRIS_CLARO)

    ultima = cab + len(actividades)
    ws.auto_filter.ref = f"A{cab}:F{ultima}"

    # --- Impresion -------------------------------------------------------
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{cab}:{cab}"

    salida = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "Actividades COMBUSES - homologacion GESMOVIL.xlsx",
    )
    wb.save(salida)
    print(f"{len(actividades)} actividades -> {salida}")


if __name__ == "__main__":
    main()
