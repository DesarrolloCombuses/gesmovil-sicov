# Mensaje a GESMOVIL — actividades sin homologar (API v2)

Texto listo para enviar al equipo técnico de GESMOVIL.

GESMOVIL pidió que la API entregue las actividades sin homologar, con los ids
de COMBUSES, y hacer ellos la homologación. La API v2 hace eso y está en
producción desde el 4-nov-2026. Comprobado el 5-nov: `X-Api-Version: v2`,
`/actividades` con 40 actividades y `/alistamientos` con 49 registros del 4-nov.

---

## Adjuntos

1. **`Actividades COMBUSES - homologacion GESMOVIL.xlsx`**, en la raíz del
   proyecto. Las 40 actividades con su id real (1000 a 1039) y dos columnas en
   amarillo para que GESMOVIL anote su homologación. Si el checklist cambia, se
   regenera con `python scripts/generar-excel-homologacion.py`.
2. **`API SICOV COMBUSES - Guia de consumo.pdf`**, en la raíz del proyecto,
   versión v2 del 5-nov-2026 (6 páginas). Las cédulas y nombres de sus ejemplos
   son ficticios. Si hay que rehacerla: `python
   scripts/generar-word-integracion.py` y, en Word, «Guardar como → PDF».
   Cualquier PDF de antes del 5-nov describe la v1 y no se envía.

La credencial (`X-API-Key`) no va en este correo: ya la tienen, y si hubiera
que reenviarla va por canal cifrado.

---

## Mensaje

> **Asunto:** API SICOV de COMBUSES — actividades con ids de COMBUSES (v2)
>
> Buen día.
>
> Como lo solicitaron, la API ya entrega las actividades sin homologar, con los
> ids de COMBUSES, para que ustedes hagan la homologación de su lado.
>
> Los cambios, en la versión `v2` del contrato:
>
> - En `/alistamientos`, el campo `actividades` lleva los ids de COMBUSES (del
>   1000 en adelante) y `detalleActividades` sus descripciones, en el mismo
>   orden.
> - Ya no hay respuestas `503` por actividades sin homologar: cualquier rango
>   con registros responde `200`. La operación diaria se registra desde el 7
>   de octubre de 2026.
> - Nuevo endpoint `GET /actividades`, sin parámetros y con la misma
>   credencial. Devuelve el catálogo completo: id, descripción, grupo y si está
>   activa. Si COMBUSES agrega una actividad, aparece ahí con un id nuevo; los
>   ids no se reutilizan.
>
> Ya está disponible, con la misma URL y la misma credencial. Pueden
> comprobarlo repitiendo la consulta de `/alistamientos` que antes les
> respondía `503`: ahora responde `200` con los registros, y la cabecera
> `X-Api-Version` dice `v2`.
>
> Adjuntamos la guía de consumo actualizada y un Excel con las 40 actividades
> actuales. El Excel trae dos columnas en amarillo, para el id y la descripción
> oficial. Cuando tengan la homologación, les pedimos devolvérnoslo lleno:
> COMBUSES responde por lo que se reporta a su nombre y queremos tener a la vista
> a qué actividad oficial se traduce cada una de las nuestras. Si alguna no
> tiene equivalente oficial, por favor márquenla **NO APLICA**.
>
> Aparte: el 23 de octubre la Supertransporte nos entregó el token de proveedor
> tecnológico a nombre de GESMOVIL SAS (NIT 900853057). ¿Ya lo recibieron
> ustedes directamente, o se lo hacemos llegar? Lo enviaríamos por un canal
> cifrado, no por este correo.
>
> Quedamos atentos.

---

## Notas internas (no van en el mensaje)

### El alistamiento suelto del 22 de septiembre

Antes del 7 de octubre solo hay uno real fuera del rango de prueba: el id 3,
placa EQR790, del 22-sep a las 17:37. Es el que aparece de ejemplo en la guía.
Si fue una prueba de integración, hay que borrarlo junto con los de prueba
antes de que GESMOVIL transmita; si no, GESMOVIL lo reportará a la
Supertransporte como un alistamiento real.

### Por qué pedimos la tabla de vuelta

Con la v2, la traducción de nuestros ids a los oficiales vive solo en el
sistema de GESMOVIL. COMBUSES es el sujeto obligado y responde por la veracidad
de lo reportado (cotización, sección 2.5), así que necesita poder revisar esa
traducción. Si GESMOVIL no la devuelve, insistir.

### Un id nunca cambia de significado

GESMOVIL traduce por id. Si una actividad existente se reescribe para que
signifique otra cosa, ellos la seguirán reportando con la traducción vieja.
Las actividades nuevas van con fila nueva, y las que ya no apliquen se
desactivan sin borrarlas. Ver «Lo que cambia en el checklist» en el README.

### NO APLICA ya no requiere cambios de nuestro lado

Con la v1, una actividad sin equivalente oficial habría bloqueado la API con
503. Con la v2 la API no traduce nada: si GESMOVIL marca una como NO APLICA,
simplemente no la reportan.

### Las 40 actividades no las ha revisado el jefe de mantenimiento

Se armaron con el preoperacional que ya usaba COMBUSES y los requisitos del PESV
(Res. 40595/2022) y del Decreto 431/2017. Cualquier cambio posterior hay que
avisárselo a GESMOVIL para que actualicen su homologación.

### Actividad 1008, «Baterías: … ajustes de bordes …»

En una batería los terminales son los «bornes», pero según el comentario de
`supabase/seed-checklist.sql` esta descripción se copió tal cual de una
actividad oficial, así que el «bordes» probablemente viene del catálogo de la
Supertransporte. Con la homologación por id, corregirla o no ya no afecta el
reporte.

### Tokens que no abren el catálogo oficial

**El token de la maestra que trae el manual no sirve** para
`listar-actividades`: responde «Error en el token». Verificado contra el
servicio real el 21-sep-2026. Sirve para `nivelservicio` y `clase-vehiculo`,
que no necesitamos.

**El token de proveedor tecnológico tampoco.** Llegó de la Supertransporte en
`COMPAA_METROPOLITANA_DE_BUSES_S.A.rar`, cifrado con contraseña, emitido el
23-oct a nombre de GESMOVIL SAS. Probado el 4-nov-2026: mismo «Error en el
token». Es la credencial de GESMOVIL para transmitir, no para leer maestras.
No copiarlo a ningún archivo del repositorio.
