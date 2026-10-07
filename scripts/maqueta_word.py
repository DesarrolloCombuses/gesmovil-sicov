# -*- coding: utf-8 -*-
"""
Maqueta compartida de los Word que genera el proyecto.

Esta aqui y no copiada en cada generador porque los documentos que salen de
COMBUSES deben parecerse entre si: el que se le manda a GESMOVIL y el que va al
area juridica son de la misma empresa, y dos maquetas distintas se notan.

Uso:

    from maqueta_word import Maqueta
    m = Maqueta()
    m.portada("SICOV", "Titulo", "Bajada opcional")
    m.h1("1. Seccion")
    m.par("Texto.")
    m.guardar("ruta/archivo.docx")

Prefijos en las celdas de tabla(): | monoespaciado, * negrita.
Estilos en rico() y vineta_rica(): "b" negrita, "c" monoespaciado, "g" gris.

Requiere python-docx.
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
FONDO_AVISO = "FFF4E0"
FONDO_NOTA = "EAF1FB"


class Maqueta:
    """Un documento en construccion. Cada metodo agrega al final."""

    def __init__(self):
        self.doc = Document()

        # Pagina: Carta, que es el tamano que se usa en Colombia.
        for s in self.doc.sections:
            s.page_width = Inches(8.5)
            s.page_height = Inches(11)
            s.left_margin = Inches(1)
            s.right_margin = Inches(1)
            s.top_margin = Inches(0.9)
            s.bottom_margin = Inches(0.9)

        base = self.doc.styles["Normal"]
        base.font.name = "Calibri"
        base.font.size = Pt(10.5)
        base.font.color.rgb = TINTA
        base.paragraph_format.space_after = Pt(7)
        base.paragraph_format.line_spacing = 1.08
        base.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")

    def sombrear(self, elemento, color):
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), color)
        elemento.append(shd)


    def borde_inferior(self, p, color="D8E0EA", grosor=6):
        pPr = p._p.get_or_add_pPr()
        bdr = OxmlElement("w:pBdr")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), str(grosor))
        bottom.set(qn("w:space"), "4")
        bottom.set(qn("w:color"), color)
        bdr.append(bottom)
        pPr.append(bdr)


    def h1(self, texto):
        p = self.doc.add_paragraph()
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(7)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(texto)
        r.font.size = Pt(15)
        r.font.bold = True
        r.font.color.rgb = AZUL
        self.borde_inferior(p)
        return p


    def h2(self, texto):
        p = self.doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(texto)
        r.font.size = Pt(11.5)
        r.font.bold = True
        r.font.color.rgb = TINTA
        return p


    def par(self, texto=None, negrita=False, gris=False, tam=10.5, antes=0, despues=7):
        p = self.doc.add_paragraph()
        p.paragraph_format.space_before = Pt(antes)
        p.paragraph_format.space_after = Pt(despues)
        if texto:
            r = p.add_run(texto)
            r.font.bold = negrita
            r.font.size = Pt(tam)
            if gris:
                r.font.color.rgb = GRIS
        return p


    def rico(self, trozos, antes=0, despues=7):
        """Parrafo mezclando estilos: [(texto, "b"|"c"|"bc"|""), ...]"""
        p = self.doc.add_paragraph()
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


    def vineta_rica(self, trozos):
        p = self.doc.add_paragraph(style="List Bullet")
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


    def numerada(self, trozos, con_siguiente=False):
        p = self.doc.add_paragraph(style="List Number")
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


    def codigo(self, lineas, tam=8.0):
        """Bloque monoespaciado sombreado. Es una tabla de una celda para que el
        sombreado cubra el ancho entero y no solo el texto."""
        t = self.doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.LEFT
        ancho = Inches(6.5)
        t.columns[0].width = ancho
        celda = t.cell(0, 0)
        celda.width = ancho
        self.sombrear(celda._tc.get_or_add_tcPr(), FONDO_CODIGO)

        celda.text = ""
        for i, linea in enumerate(lineas):
            p = celda.paragraphs[0] if i == 0 else celda.add_paragraph()
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.line_spacing = 1.05
            r = p.add_run(linea)
            r.font.name = "Consolas"
            r.font.size = Pt(tam)
        self.par(despues=2)
        return t


    def tabla(self, cabeceras, filas, anchos):
        """Prefijos en cada celda: | monoespaciado, * negrita.

        cabeceras=None para una tabla sin fila de titulos: la de la portada son
        pares dato/valor, y una barra azul vacia encima se ve como un error."""
        columnas = len(anchos)
        t = self.doc.add_table(rows=1 if cabeceras else 0, cols=columnas)
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
            self.sombrear(c._tc.get_or_add_tcPr(), FONDO_CABECERA)
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
                    self.sombrear(c._tc.get_or_add_tcPr(), FONDO_FILA)
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
        self.par(despues=4)
        return t


    def aviso(self, titulo, cuerpo, color="FFF4E0"):
        t = self.doc.add_table(rows=1, cols=1)
        ancho = Inches(6.5)
        t.columns[0].width = ancho
        c = t.cell(0, 0)
        c.width = ancho
        self.sombrear(c._tc.get_or_add_tcPr(), color)
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(titulo)
        r.font.bold = True
        r.font.size = Pt(10.5)
        p2 = c.add_paragraph()
        p2.paragraph_format.space_after = Pt(1)
        r2 = p2.add_run(cuerpo)
        r2.font.size = Pt(10)
        self.par(despues=4)
        return t
    def portada(self, rotulo, titulo, bajada=None):
        """Rotulo espaciado, titulo grande y bajada gris."""
        p = self.doc.add_paragraph()
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(rotulo)
        r.font.size = Pt(9.5)
        r.font.bold = True
        r.font.color.rgb = GRIS
        rPr = r._r.get_or_add_rPr()
        sp = OxmlElement("w:spacing")
        sp.set(qn("w:val"), "60")
        rPr.append(sp)

        p = self.doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(titulo)
        r.font.size = Pt(22)
        r.font.bold = True
        r.font.color.rgb = AZUL

        if bajada:
            p = self.doc.add_paragraph()
            p.paragraph_format.space_after = Pt(14)
            r = p.add_run(bajada)
            r.font.size = Pt(10.5)
            r.font.color.rgb = GRIS

    def cita(self, lineas):
        """Bloque citado, para texto propuesto que alguien va a copiar."""
        t = self.doc.add_table(rows=1, cols=1)
        ancho = Inches(6.5)
        t.columns[0].width = ancho
        c = t.cell(0, 0)
        c.width = ancho
        sombrear_celda = c._tc.get_or_add_tcPr()
        self.sombrear(sombrear_celda, FONDO_NOTA)
        c.text = ""
        for i, (texto, estilo) in enumerate(lineas):
            p = c.paragraphs[0] if i == 0 else c.add_paragraph()
            p.paragraph_format.space_after = Pt(5)
            p.paragraph_format.space_before = Pt(0)
            r = p.add_run(texto)
            r.font.size = Pt(10)
            if "b" in estilo:
                r.font.bold = True
            if "i" in estilo:
                r.font.italic = True
        self.par(despues=4)
        return t

    def item(self, numero, trozos):
        """Punto numerado con el numero escrito, no con la lista de Word.

        Las listas 'List Number' de Word comparten contador entre si: una
        segunda lista en otra seccion sigue contando desde donde quedo la
        primera, y el documento sale con una seccion que empieza en 3. Esto lo
        evita a costa de escribir el numero, que aqui no cuesta nada."""
        p = self.doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.42)
        p.paragraph_format.first_line_indent = Inches(-0.28)
        p.paragraph_format.space_after = Pt(5)
        p.paragraph_format.keep_together = True
        r = p.add_run(f"{numero}.")
        r.font.bold = True
        r.font.size = Pt(10.5)
        p.add_run("	")
        for texto, estilo in trozos:
            r = p.add_run(texto)
            r.font.size = Pt(10.5)
            if "b" in estilo:
                r.font.bold = True
            if "c" in estilo:
                r.font.name = "Consolas"
                r.font.size = Pt(9.5)
        return p

    def guardar(self, ruta):
        self.doc.save(ruta)
        parrafos = len(self.doc.paragraphs)
        tablas = len(self.doc.tables)
        print(f"guardado: {ruta}")
        print(f"parrafos: {parrafos}  tablas: {tablas}")
        return ruta
