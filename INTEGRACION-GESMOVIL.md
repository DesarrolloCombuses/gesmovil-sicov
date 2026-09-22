# Integración SICOV — COMBUSES → GESMOVIL

Documento para el equipo técnico de GESMOVIL.

COMBUSES expone por API los alistamientos y mantenimientos registrados en su
plataforma, para que GESMOVIL los consuma y los transmita al ecosistema de la
Superintendencia de Transporte (SINST — VIGIA 2).

El contrato sigue el *Manual de apis requeridas para integración
alistamiento-mantenimientos-despachos*.

---

## 1. Qué está disponible

| Endpoint | Estado |
|---|---|
| `GET /alistamientos` | Disponible |
| `GET /mantenimientos` | Disponible |
| Despachos y llegadas | **Fuera de alcance.** Responde `404` con la lista de lo que sí existe. |

Esta plataforma cubre alistamiento y mantenimiento. Despachos y llegadas no
están implementados y no está previsto que lo estén por esta vía.

## 2. URL base

```
https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-gesmovil
```

## 3. Autenticación

Cabecera `X-API-Key` en cada petición.

```
X-API-Key: sicov_xxxxxxxx_<secreto>
```

La credencial se entrega **por canal cifrado, aparte de este documento**. No
viaja aquí a propósito.

Detalles que conviene conocer:

- COMBUSES guarda solo el SHA-256 de la clave. **No se puede recuperar.** Si se
  pierde, se genera otra y la anterior deja de servir.
- El prefijo (`sicov_xxxxxxxx`) queda visible en los registros de acceso de
  COMBUSES. Sirve para identificar qué credencial hizo cada consulta.
- Vigencia de un año, renovable. La fecha exacta va con la credencial.
- **No hay CORS.** Esto es servidor a servidor. Una llamada desde un navegador
  será bloqueada, y es intencionado: si la API fuera alcanzable desde una
  página web, la clave acabaría dentro de un frontend a la vista de cualquiera.

## 4. Parámetros

Los dos endpoints reciben los mismos, y **ambos son obligatorios**:

| Parámetro | Formato | Nota |
|---|---|---|
| `fechaInicio` | `AAAA-MM-DD` | No puede estar en el futuro |
| `fechaFin` | `AAAA-MM-DD` | No puede ser anterior a `fechaInicio` |

Límites:

- **Rango máximo: 92 días.** El manual no define paginación, así que la
  alternativa a limitar el rango sería truncar filas en silencio, y entonces
  GESMOVIL reportaría de menos sin enterarse. Para períodos más largos, dividir
  la consulta.
- **Antigüedad máxima: 400 días.** Más atrás que eso no es una consulta
  operativa.
- **Límite de peticiones: 120 por hora.** Al pasarse, `429` con `Retry-After`.

La fecha es el **día calendario colombiano** al que corresponde el registro, no
el instante en que se grabó. Se guardan por separado a propósito: un
alistamiento hecho a las 11 de la noche corresponde a ese día, no al siguiente.

## 5. `GET /alistamientos`

```bash
curl "https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-gesmovil/alistamientos\
?fechaInicio=2026-09-01&fechaFin=2026-09-22" \
     -H "X-API-Key: <credencial>"
```

```json
{
  "success": true,
  "data": [
    {
      "alistamiento_id": 3,
      "placa": "EQR790",
      "fechaAlistamiento": "2026-09-22 17:37:56",
      "responsable": {
        "tipoIdentificacion": 1,
        "numeroIdentificacion": "75083542",
        "nombre": "SANTIAGO BERNAL LONDOÑO"
      },
      "conductor": {
        "tipoIdentificacion": 1,
        "numeroIdentificacion": "1038803306",
        "nombre": "VILLADA FLOREZ GERLI"
      },
      "detalleActividades": "Niveles de aceite de motor, Fugas del motor",
      "actividades": [4, 1]
    }
  ]
}
```

| Campo | Nota |
|---|---|
| `alistamiento_id` | Consecutivo de COMBUSES. Único y estable. |
| `fechaAlistamiento` | Fecha **y hora**, en hora de Colombia (`-05:00`, sin horario de verano). |
| `responsable` | Responsable del proceso, de la configuración de la empresa. No lo digita el conductor. |
| `conductor` | Solo conductores activos de la nómina pueden registrar, así que este dato siempre corresponde a uno. |
| `actividades` | **Ids oficiales de la Superintendencia**, nunca ids internos de COMBUSES. Ver sección 8. |
| `detalleActividades` | Las descripciones oficiales de esos mismos ids, en el mismo orden. |

`tipoIdentificacion: 1` es cédula de ciudadanía.

Hay **un alistamiento por placa y por día** como máximo. Si se corrige algo, se
corrige ese registro; no se crea un segundo. Por eso `alistamiento_id` no se
duplica para una misma placa y fecha.

## 6. `GET /mantenimientos`

```json
{
  "success": true,
  "data": [
    {
      "mantenimiento_id": 1,
      "fecha": "2026-09-20",
      "placa": "EQR790",
      "hora": "14:30",
      "nit": "890920397",
      "razonSocial": "COMPAÑIA METROPOLITANA DE BUSES S.A.",
      "tipoIdentificacion": 1,
      "numeroIdentificacion": "75083542",
      "nombresResponsable": "SANTIAGO BERNAL LONDOÑO",
      "tipomantenimiento": 1,
      "detalleActividades": "Niveles de aceite de motor, Fugas del motor"
    }
  ]
}
```

| Campo | Nota |
|---|---|
| `tipomantenimiento` | `1` preventivo, `2` correctivo |
| `detalleActividades` | Descripciones oficiales de las actividades marcadas. Si el registro no marcó ninguna del catálogo, lleva el detalle en texto libre. |

A diferencia de alistamientos, aquí **no viaja un arreglo `actividades`**: el
manual pide el detalle como texto para este endpoint.

## 7. Códigos de respuesta

| Código | Cuándo | Qué hacer |
|---|---|---|
| `200` | Hay registros | Procesar `data` |
| `400` | Parámetros mal | Corregir la petición. El mensaje dice qué falla. |
| `401` | Falta la cabecera, o la credencial no vale / expiró | Revisar la credencial |
| `404` | **No hay registros en el rango** | No es un error. Ver abajo. |
| `429` | Más de 120 peticiones en una hora | Esperar lo que diga `Retry-After` |
| `503` | Falta configuración u homologación en COMBUSES | Avisar a COMBUSES. No se resuelve del lado de GESMOVIL. |
| `500` | Fallo inesperado | Reintentar; si persiste, avisar |

**Sobre el `404`:** el manual reserva ese código para «no se encontraron
registros». No es lo habitual en REST — un rango sin actividad es una respuesta
válida, no un error — pero es el contrato del manual y manda el contrato.
Conviene tratarlo como «cero registros», no como fallo de integración.

Todos los errores llegan con la misma envoltura:

```json
{ "success": false, "message": "texto explicando qué pasó" }
```

Cabeceras de respuesta:

| Cabecera | Para qué |
|---|---|
| `X-Api-Version` | Versión del contrato (hoy `v1`) |
| `X-Total-Registros` | Cuántos elementos trae `data` |
| `Cache-Control: no-store` | No cachear: son registros, no referencia |

## 8. Lo que falta para producción

**El catálogo oficial de actividades de alistamiento, con sus ids.**

El campo `actividades` viaja siempre con ids oficiales de la Superintendencia.
COMBUSES usa internamente su propio checklist de 40 puntos y lo traduce al
responder, siguiendo lo que indica el manual:

> «Procedimiento es consultar las actividades de alistamiento en el link
> anterior y homologar con las actividades de alistamiento que tiene la empresa
> de transporte.»

Para cargar esa homologación hace falta el catálogo oficial. Hoy COMBUSES solo
conoce dos pares id–descripción (los del ejemplo del manual), así que mientras
tanto:

```
GET /alistamientos  →  503

{
  "success": false,
  "message": "Hay 38 actividad(es) sin homologar con el catalogo oficial de la
              Superintendencia (...). Los registros se estan capturando, pero
              no se pueden reportar hasta completar la homologacion."
}
```

Es deliberado, y es todo o nada. Entregar solo las actividades que sí tienen
traducción produciría un reporte silenciosamente incompleto: diría que se
verificaron 2 puntos cuando fueron 40, y nadie lo notaría hasta una auditoría.
Y entregar ids internos sería peor: para la Superintendencia, el id `1011` no
significa «una actividad de COMBUSES», significa **otra actividad distinta**.

**Lo que se pide a GESMOVIL:** el archivo del catálogo oficial de actividades
de alistamiento, con id y descripción de cada una. GESMOVIL ya integra con
VIGIA 2, así que debería tenerlo.

Sobre el endpoint `GET /api/v2/mantenimiento/listar-actividades` de la
Superintendencia: se verificó contra el servicio real y la cabecera correcta es
`Authorization: Bearer`. Con el token del manual responde «Error en el token»
(ese token sí sirve para `nivelservicio` y `listar-clase-vehiculo`). Ninguna
variante del endpoint es pública.

**Importante:** la traducción se aplica **al leer**, no al guardar. El día que
se cargue la homologación, **todo el histórico ya capturado queda reportable de
inmediato**, sin tocar un solo registro. No se pierde nada de lo que se registre
mientras tanto.

## 9. Alcance de la flota

Solo entran los vehículos de la ruta **AEROPUERTO** (54 unidades, internos 703
a 759): el servicio al aeropuerto José María Córdova.

COMBUSES opera también rutas urbanas en Medellín con la misma empresa, pero el
SICOV-OTPC cubre el transporte intermunicipal por carretera. Los vehículos
urbanos no se alistan por esta vía y no aparecerán en las respuestas.

## 10. Recomendaciones de consumo

- **Una consulta diaria** del día anterior cubre la operación normal. Los
  alistamientos se registran antes de salir a ruta.
- **Reprocesar los últimos días** de vez en cuando: un registro puede
  corregirse después de haberse consultado, y en ese caso el
  `alistamiento_id` es el mismo. Conviene tratar el id como clave de
  actualización, no insertar siempre.
- **No asumir orden en `actividades`.** El arreglo no viene ordenado; si
  importa, ordenar del lado de GESMOVIL.
- **Guardar el `message` de los errores.** Están redactados para decir qué
  falta, y ahorran una ida y vuelta al diagnosticar.

## 11. Contacto

Dudas técnicas del contrato, credenciales o incidencias: el área de desarrollo
de COMBUSES.

Lo que COMBUSES necesita de GESMOVIL para cerrar la integración:

1. El catálogo oficial de actividades de alistamiento con sus ids (sección 8).
2. Confirmación de que el consumo funciona con la credencial entregada.
3. La IP o el rango de IP desde donde consumirán, si conviene restringirlo.
