# Autorreporte de condiciones del conductor — revisión de tratamiento de datos

**Para:** área jurídica y Talento Humano de COMBUSES
**De:** área de desarrollo
**Asunto:** un dato nuevo que la plataforma SICOV empezó a capturar y que requiere
confirmar la cobertura de la autorización vigente

---

## 1. Qué se empezó a capturar

La plataforma de alistamiento diario ahora pide al conductor, antes del
checklist del vehículo, dos declaraciones sobre sí mismo:

1. Si se encuentra en condiciones óptimas de descanso, sin fatiga ni
   somnolencia, para operar de manera segura.
2. Si declara no haber consumido alcohol, sustancias psicoactivas ni
   medicamentos que afecten la conducción.

Se responden **Sí** o **No**, son obligatorias, y si alguna es **No** el
conductor puede agregar un comentario libre.

La respuesta queda asociada a su cédula y a su nombre, con fecha y hora.

## 2. Por qué esto necesita revisión

Las dos preguntas son **datos sensibles** en los términos del artículo 5 de la
Ley 1581 de 2012: se refieren al estado de salud de una persona identificada.
El comentario libre puede además contener información clínica concreta.

Eso cambia el régimen aplicable:

| | Dato personal común | Dato sensible |
|---|---|---|
| Autorización | Previa, expresa e informada | **Explícita**, y además |
| | | se debe informar que **no está obligado a autorizarla** |
| Finalidad | Informada | Informada y específica |

La autorización genérica que se firma al ingresar —si está redactada en
términos amplios— puede no bastar. El Decreto 1377 de 2013 exige que la
autorización para datos sensibles sea explícita, no deducida de una cláusula
general.

### Un matiz que conviene valorar

El autorreporte no es una iniciativa de la empresa: lo exige la regulación de
transporte. El **Decreto 431 de 2017** obliga a controlar el consumo de alcohol
y sustancias psicoactivas en el transporte de pasajeros, y la **Resolución
40595 de 2022** incluye el autorreporte de condiciones del conductor dentro de
la gestión del PESV.

El artículo 6 de la Ley 1581 permite tratar datos sensibles sin autorización
cuando el tratamiento está previsto en una norma. Si se concluye que ese es el
caso, **igual subsiste el deber de informar** al titular la finalidad y el
responsable del tratamiento.

Cuál de las dos vías aplica —autorización explícita o habilitación legal— es
una decisión jurídica, no técnica. Por eso llega esta nota.

## 3. Lo que se pide confirmar

1. **Si la autorización vigente cubre datos de salud del trabajador** recogidos
   en el marco del PESV, con una mención explícita y no por vía de una cláusula
   general.
2. **Si la política de tratamiento de datos publicada menciona esta finalidad.**
3. **Si hay que recoger una autorización específica** antes de que el
   autorreporte entre en operación, o si basta con informar.
4. **Cuánto tiempo se conservan** estos registros. Hoy no hay una regla de
   eliminación: se guardan indefinidamente junto con el alistamiento.
5. **Quién puede consultarlos** dentro de la empresa.

## 4. Texto propuesto, si se decide incorporar la cláusula

Para la autorización de tratamiento de datos del personal de conducción. Es un
borrador para que el área jurídica lo ajuste, no un texto definitivo.

> **Autorización para el tratamiento de datos sensibles — condiciones de
> aptitud para la conducción**
>
> Autorizo de manera libre, previa, expresa e informada a COMPAÑÍA
> METROPOLITANA DE BUSES S.A. (COMBUSES S.A.), NIT 890920397, a recolectar y
> tratar mis declaraciones sobre condiciones de descanso, fatiga, somnolencia y
> consumo de alcohol, sustancias psicoactivas o medicamentos que puedan afectar
> la conducción, que registre antes de cada operación.
>
> **Finalidad.** Estas declaraciones se usan únicamente para verificar mi
> aptitud para operar el vehículo, dar cumplimiento al Decreto 431 de 2017 y a
> la Resolución 40595 de 2022 sobre el Plan Estratégico de Seguridad Vial, y
> adoptar las medidas de seguridad que correspondan.
>
> **No se transfieren a la Superintendencia de Transporte** ni a terceros
> distintos de las áreas de la empresa responsables de la operación y de la
> seguridad vial, salvo requerimiento de autoridad competente.
>
> **Sé que no estoy obligado a autorizar el tratamiento de datos sensibles** y
> que puedo conocer, actualizar, rectificar y suprimir mis datos, y revocar
> esta autorización, dirigiéndome a [correo / área responsable].

La frase sobre no estar obligado a autorizar no es opcional: la exige el
parágrafo del artículo 5 de la Ley 1581.

## 5. Lo que ya está resuelto del lado técnico

Para que la revisión parta de hechos y no de supuestos:

- **Estas declaraciones no salen hacia la Superintendencia.** La API que
  consume GESMOVIL —el aliado tecnológico que transmite a SINST-VIGIA 2—
  selecciona columna por columna y estas no están en su lista. No es una
  configuración que alguien pueda cambiar por descuido: haría falta editar el
  código.
- **El acceso a la base está restringido.** Las tablas no son escribibles desde
  el navegador y las consultas pasan por funciones con credencial.
- **Queda registro de quién consulta datos de empleados**, con fecha y origen.
- **Los registros anteriores al cambio quedan en blanco**, no en "Sí". El
  sistema distingue "no se preguntó" de "declaró estar apto": ningún
  alistamiento viejo afirma algo que el conductor no dijo.

## 6. Qué pasa si el conductor responde "No"

El registro **se guarda** y queda marcado como novedad. No se bloquea el
alistamiento. El conductor recibe en pantalla la indicación de no operar y de
informar a su supervisor.

Se decidió así porque bloquear enseña rápidamente que respondiendo "Sí" se
puede trabajar, y entonces se pierde el dato que se quería capturar. Pero esto
tiene una consecuencia que conviene que conozcan: **la plataforma deja
constancia de que la empresa supo**. Si un conductor declara fatiga y opera de
todas formas, ese registro existe.

Eso hace más importante definir el punto 5 de la sección 3 —quién consulta
estos registros y con qué periodicidad—, porque la constancia sin un
procedimiento de respuesta puede ser peor que no tenerla.

## 7. Alcance de esta nota

La escribió el área de desarrollo. Describe qué hace el sistema y señala las
preguntas que vemos, pero **no constituye un concepto jurídico**. La valoración
sobre qué vía aplica, cómo redactar la cláusula y qué plazos de conservación
fijar corresponde al área jurídica.

Mientras no haya definición, el autorreporte está implementado pero **no se ha
puesto en operación con conductores reales**.
