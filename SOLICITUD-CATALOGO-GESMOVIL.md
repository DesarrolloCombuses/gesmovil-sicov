# Solicitud a GESMOVIL — homologación de las actividades de alistamiento

Texto listo para enviar al equipo técnico de GESMOVIL. Es lo único que falta
para que puedan empezar a leer los alistamientos reales de COMBUSES.

GESMOVIL ofreció hacer la homologación si les enviamos nuestras actividades con
sus ids. El mensaje acepta y les pide devolver el resultado para cargarlo de
nuestro lado. Las razones están en las notas internas, al final.

---

## El adjunto

**`Actividades COMBUSES - homologacion GESMOVIL.xlsx`**, en la raíz del
proyecto. Trae las 40 actividades con su id real (1000 a 1039), una leyenda de
qué llenar y las columnas D y E en amarillo para GESMOVIL.

Si el checklist cambia antes de enviarlo, se regenera con:

```
python scripts/generar-excel-homologacion.py
```

Lee los ids del mismo endpoint con el que el formulario del conductor pinta el
checklist, así que salen como están en la base. Para comprobarlo desde
Supabase está [supabase/exportar-actividades-gesmovil.sql](supabase/exportar-actividades-gesmovil.sql).

---

## Mensaje

> **Asunto:** Actividades de alistamiento de COMBUSES para homologar — SINST-VIGIA 2
>
> Buen día.
>
> Como acordamos, adjuntamos en Excel las 40 actividades de alistamiento que
> verifica COMBUSES, cada una con su id en nuestro sistema (columna A).
>
> El archivo trae dos columnas en amarillo para que ustedes las completen:
>
> - **Id oficial Supertransporte (D):** el id de la actividad equivalente en el
>   catálogo de la Superintendencia. Si una actividad nuestra cubre varias
>   oficiales, todos los ids separados por coma.
> - **Descripción oficial (E):** la descripción tal como figura en el catálogo,
>   porque es la que viaja en `detalleActividades`.
>
> Si alguna no tiene equivalente oficial, por favor escriban **NO APLICA** en
> lugar de asignarle la más parecida.
>
> Las dos primeras ya vienen llenas (`4` Niveles de aceite de motor y `1` Fugas
> del motor), tomadas del ejemplo del manual. Les agradecemos confirmarlas.
>
> Les pedimos devolvernos el mismo archivo con esas columnas llenas. Con el
> archivo de vuelta lo cargamos en nuestra base, y la API empieza a
> entregar los ids oficiales en el campo `actividades` tal como lo describe el
> manual, sin cambios en su cliente. Todo lo capturado desde el 22 de
> septiembre queda disponible de inmediato.
>
> Aparte: el 23 de octubre la Supertransporte nos entregó el token de proveedor
> tecnológico a nombre de GESMOVIL SAS (NIT 900853057). ¿Ya lo recibieron
> ustedes directamente, o se lo hacemos llegar? Lo enviaríamos por un canal
> cifrado, no por este correo.
>
> Quedamos atentos.

---

## Notas internas (no van en el mensaje)

### Por qué pedimos la tabla de vuelta

GESMOVIL podría guardar la homologación solo en su sistema y que nuestra API
entregara los ids de COMBUSES. Se les pide devolverla porque:

- **COMBUSES es el sujeto obligado** y responde por la veracidad de lo que se
  reporta (cotización, sección 2.5). Con la tabla en nuestra base se puede
  revisar en cualquier momento qué se reporta en nombre de COMBUSES
  (`sicov_v_cobertura`). En el sistema de GESMOVIL sería una caja negra.
- **La API no cambia.** El manual pide ids oficiales en `actividades`, y la API
  ya está construida así. Entregar ids propios exigiría modificarla y
  redesplegarla.
- **Si algún día se cambia de proveedor, la homologación se queda en COMBUSES.**
- **Un cambio en el checklist se nota de inmediato.** Si se agrega una
  actividad, la API responde 503 nombrándola. Con la homologación del lado de
  GESMOVIL, el id nuevo les llegaría sin traducción y no sabemos qué haría su
  sistema con él.

Si GESMOVIL insiste en quedarse con el mapeo, hay que cambiar la API para que
entregue los ids propios. Es una decisión, no un obstáculo técnico.

### Si alguna vuelve como NO APLICA

Hoy la API no lo soporta. Una actividad sin fila en `sicov_homolog_actividades`
bloquea con 503 todo el rango donde aparezca, y no hay forma de decir «esta no
se reporta a propósito». Las candidatas son las de Documentación y Conductor.

Si llega alguna, hay que agregar esa marca al catálogo y que la API la omita
del reporte. Es un cambio pequeño, pero requiere una migración y redesplegar
`sicov-gesmovil`, y para eso hace falta `supabase login`.

### Al recibir el archivo

Se carga con `supabase/cargar-catalogo-oficial.sql`: la PARTE 1 con los pares
(id oficial, descripción oficial) y la PARTE 4 con los pares (id COMBUSES, id
oficial). La PARTE 2, que empareja por descripción, sobra en este caso.

### Las 40 actividades no las ha revisado el jefe de mantenimiento

Se armaron con el preoperacional que ya usaba COMBUSES y los requisitos del PESV
(Res. 40595/2022) y del Decreto 431/2017. Si él cambia alguna después de que
GESMOVIL devuelva la homologación, esa actividad vuelve a quedar sin traducir.

### Actividad «Baterías: … ajustes de bordes …»

En una batería los terminales son los «bornes», pero según el comentario de
`supabase/seed-checklist.sql` esta descripción se copió tal cual de una
actividad oficial. Lo más probable es que el «bordes» venga del catálogo de la
Supertransporte, así que **no corregirla**. Con la homologación por id, además,
el texto ya no afecta el emparejamiento.

### Tokens que no abren el catálogo

**El token de la maestra que trae el manual no sirve** para
`listar-actividades`: responde «Error en el token». Verificado contra el
servicio real el 21-sep-2026. Sirve para `nivelservicio` y `clase-vehiculo`,
que no necesitamos.

**El token de proveedor tecnológico tampoco.** Llegó de la Supertransporte en
`COMPAA_METROPOLITANA_DE_BUSES_S.A.rar`, cifrado con contraseña, emitido el
23-oct a nombre de GESMOVIL SAS. Probado el 4-nov-2026: mismo «Error en el
token». Es la credencial de GESMOVIL para transmitir, no para leer maestras.
No copiarlo a ningún archivo del repositorio.

Si GESMOVIL no respondiera, el catálogo se puede sacar del portal: entrando a
SINST-VIGIA 2 con las credenciales de COMBUSES, en F12 → Network →
`listar-actividades` está el JSON completo.
