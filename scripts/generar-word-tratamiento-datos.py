# -*- coding: utf-8 -*-
"""
Genera el Word que se le lleva al area juridica y a Talento Humano.

La fuente de verdad es TRATAMIENTO-DATOS-AUTORREPORTE.md. Este script solo lo
maqueta: si cambia el contenido, se cambia el .md y se vuelve a correr.

AUDIENCIA: no es un documento tecnico. Quien lo lee decide si la autorizacion
vigente cubre un dato nuevo, no revisa codigo. De ahi que las secciones
tecnicas se reduzcan a lo que afecta esa decision -- a donde va el dato y quien
puede verlo -- y que no haya una sola referencia a nombres de tabla o endpoint.

  python scripts/generar-word-tratamiento-datos.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from maqueta_word import Maqueta

FECHA = "7 de octubre de 2026"

m = Maqueta()

# ===========================================================================
# PORTADA
# ===========================================================================

m.portada(
    "SICOV  ·  PROTECCIÓN DE DATOS",
    "Autorreporte de condiciones del conductor",
    "Solicitud de revisión sobre la cobertura de la autorización de tratamiento "
    "de datos personales.",
)

m.tabla(
    None,
    [
        ["*Para", "Área jurídica y Talento Humano de COMBUSES"],
        ["*De", "Área de desarrollo"],
        ["*Fecha", FECHA],
        ["*Qué se pide", "Confirmar si la autorización vigente cubre un dato nuevo"],
    ],
    [1.5, 5.0],
)

m.aviso(
    "En una frase",
    "El formulario de alistamiento diario empezó a preguntarle al conductor por su "
    "estado de descanso y por consumo de alcohol o sustancias. Son datos de salud, "
    "y eso cambia el régimen de autorización que aplica.",
    color="EAF1FB",
)

# ===========================================================================
m.h1("1. Qué se empezó a capturar")

m.par(
    "La plataforma de alistamiento diario ahora pide al conductor, antes de revisar "
    "el vehículo, dos declaraciones sobre sí mismo:"
)
m.item(1, [("Si se encuentra en condiciones óptimas de descanso, sin fatiga ni "
            "somnolencia, para operar de manera segura.", "")])
m.item(2, [("Si declara no haber consumido alcohol, sustancias psicoactivas ni "
            "medicamentos que afecten la conducción.", "")])
m.par(
    "Se responden Sí o No, son obligatorias, y si alguna es No el conductor puede "
    "agregar un comentario libre. La respuesta queda asociada a su cédula y a su "
    "nombre, con fecha y hora.",
    antes=4,
)

# ===========================================================================
m.h1("2. Por qué necesita revisión")

m.par(
    "Las dos preguntas son datos sensibles en los términos del artículo 5 de la Ley "
    "1581 de 2012: se refieren al estado de salud de una persona identificada. El "
    "comentario libre puede además contener información clínica concreta."
)
m.par("Eso cambia el régimen aplicable:")

m.tabla(
    ["", "Dato personal común", "Dato sensible"],
    [
        ["*Autorización", "Previa, expresa e informada",
         "Explícita, no deducida de una cláusula general"],
        ["*Además", "", "Se debe informar que no está obligado a autorizarla"],
        ["*Finalidad", "Informada", "Informada y específica"],
    ],
    [1.3, 2.3, 2.9],
)

m.par(
    "La autorización genérica que se firma al ingresar, si está redactada en términos "
    "amplios, puede no bastar. El Decreto 1377 de 2013 exige que la autorización para "
    "datos sensibles sea explícita."
)

m.h2("Un matiz que conviene valorar")

m.par(
    "El autorreporte no es una iniciativa de la empresa: lo exige la regulación de "
    "transporte. El Decreto 431 de 2017 obliga a controlar el consumo de alcohol y "
    "sustancias psicoactivas en el transporte de pasajeros, y la Resolución 40595 de "
    "2022 incluye el autorreporte de condiciones del conductor dentro de la gestión "
    "del PESV."
)
m.par(
    "El artículo 6 de la Ley 1581 permite tratar datos sensibles sin autorización "
    "cuando el tratamiento está previsto en una norma. Si se concluye que ese es el "
    "caso, igual subsiste el deber de informar al titular la finalidad y el "
    "responsable del tratamiento."
)
m.rico(
    [("Cuál de las dos vías aplica, autorización explícita o habilitación legal, ", ""),
     ("es una decisión jurídica, no técnica. Por eso llega esta nota.", "b")]
)

# ===========================================================================
m.h1("3. Lo que se pide confirmar")

_puntos = [
    "Si la autorización vigente cubre datos de salud del trabajador recogidos en el "
    "marco del PESV, con una mención explícita y no por vía de una cláusula general.",
    "Si la política de tratamiento de datos publicada menciona esta finalidad.",
    "Si hay que recoger una autorización específica antes de que el autorreporte entre "
    "en operación, o si basta con informar.",
    "Cuánto tiempo se conservan estos registros. Hoy no hay una regla de eliminación: "
    "se guardan indefinidamente junto con el alistamiento.",
    "Quién puede consultarlos dentro de la empresa.",
]
for _i, _texto in enumerate(_puntos):
    m.item(_i + 1, [(_texto, "")])

# ===========================================================================
m.h1("4. Texto propuesto, si se decide incorporar la cláusula")

m.par(
    "Para la autorización de tratamiento de datos del personal de conducción. Es un "
    "borrador para que el área jurídica lo ajuste, no un texto definitivo.",
    gris=True,
)

m.cita([
    ("Autorización para el tratamiento de datos sensibles: condiciones de aptitud "
     "para la conducción", "b"),
    ("Autorizo de manera libre, previa, expresa e informada a COMPAÑÍA METROPOLITANA "
     "DE BUSES S.A. (COMBUSES S.A.), NIT 890920397, a recolectar y tratar mis "
     "declaraciones sobre condiciones de descanso, fatiga, somnolencia y consumo de "
     "alcohol, sustancias psicoactivas o medicamentos que puedan afectar la "
     "conducción, que registre antes de cada operación.", ""),
    ("Finalidad. Estas declaraciones se usan únicamente para verificar mi aptitud "
     "para operar el vehículo, dar cumplimiento al Decreto 431 de 2017 y a la "
     "Resolución 40595 de 2022 sobre el Plan Estratégico de Seguridad Vial, y adoptar "
     "las medidas de seguridad que correspondan.", ""),
    ("No se transfieren a la Superintendencia de Transporte ni a terceros distintos "
     "de las áreas de la empresa responsables de la operación y de la seguridad vial, "
     "salvo requerimiento de autoridad competente.", ""),
    ("Sé que no estoy obligado a autorizar el tratamiento de datos sensibles y que "
     "puedo conocer, actualizar, rectificar y suprimir mis datos, y revocar esta "
     "autorización, dirigiéndome a [correo / área responsable].", ""),
])

m.rico([
    ("La frase sobre no estar obligado a autorizar no es opcional: ", ""),
    ("la exige el parágrafo del artículo 5 de la Ley 1581.", "b"),
])

# ===========================================================================
m.h1("5. Lo que ya está resuelto del lado técnico")

m.par("Para que la revisión parta de hechos y no de supuestos:", gris=True)

m.vineta_rica([
    ("Estas declaraciones no salen hacia la Superintendencia. ", "b"),
    ("La vía por la que COMBUSES reporta al regulador entrega una lista cerrada de "
     "campos, y estos no están en ella. No es una casilla que alguien pueda cambiar "
     "por descuido: haría falta modificar el programa.", ""),
])
m.vineta_rica([
    ("El acceso a la información está restringido. ", "b"),
    ("Nada se escribe ni se consulta directamente desde los teléfonos; todo pasa por "
     "el servidor, que valida quién pregunta.", ""),
])
m.vineta_rica([
    ("Queda registro de quién consulta datos de empleados, ", "b"),
    ("con fecha y origen de la consulta.", ""),
])
m.vineta_rica([
    ("Los registros anteriores al cambio quedan en blanco, no en Sí. ", "b"),
    ("El sistema distingue «no se preguntó» de «declaró estar apto»: ningún "
     "alistamiento anterior afirma algo que el conductor no dijo.", ""),
])

# ===========================================================================
m.h1("6. Qué pasa si el conductor responde No")

m.par(
    "El registro se guarda y queda marcado como novedad. No se bloquea el "
    "alistamiento. El conductor recibe en pantalla la indicación de no operar y de "
    "informar a su supervisor."
)
m.par(
    "Se decidió así porque bloquear enseña rápidamente que respondiendo Sí se puede "
    "trabajar, y entonces se pierde el dato que se quería capturar."
)

m.aviso(
    "Una consecuencia que conviene conocer",
    "La plataforma deja constancia de que la empresa supo. Si un conductor declara "
    "fatiga y opera de todas formas, ese registro existe. Eso hace más importante "
    "definir quién revisa estos registros y con qué periodicidad: la constancia sin un "
    "procedimiento de respuesta puede ser peor que no tenerla.",
)

# ===========================================================================
m.h1("7. Alcance de esta nota")

m.par(
    "La escribió el área de desarrollo. Describe qué hace el sistema y señala las "
    "preguntas que vemos, pero no constituye un concepto jurídico. La valoración sobre "
    "qué vía aplica, cómo redactar la cláusula y qué plazos de conservación fijar "
    "corresponde al área jurídica."
)
m.rico([
    ("Mientras no haya definición, el autorreporte está implementado pero ", ""),
    ("no se ha puesto en operación con conductores reales.", "b"),
])

# ===========================================================================
salida = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "Autorreporte del conductor - revision de tratamiento de datos.docx",
)
m.guardar(salida)
