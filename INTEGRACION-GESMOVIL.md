# API SICOV de COMBUSES — Guía de consumo

Documento para el equipo técnico de GESMOVIL.

COMBUSES expone por API los alistamientos y mantenimientos de su flota. El
contrato sigue el *Manual de apis requeridas para integración
alistamiento-mantenimientos-despachos*.

> **Nota interna (no va en el documento que se envía):** este archivo es la
> fuente del Word que se entrega a GESMOVIL, y está escrito para ellos. El
> razonamiento de diseño de la plataforma —homologación, alcance de la flota,
> decisiones de captura— vive en `README.md` y en los comentarios de las
> migraciones. Aquí solo va lo que GESMOVIL necesita para conectarse.

---

## 1. Endpoints

| Método | Ruta | Estado |
|---|---|---|
| `GET` | `/alistamientos` | Disponible |
| `GET` | `/mantenimientos` | Disponible |
| — | `/despachos`, `/llegadas` | No disponibles. Responden `404`. |

## 2. URL base

```
https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-gesmovil
```

## 3. Autenticación

Cabecera `X-API-Key` en cada petición.

```
X-API-Key: sicov_xxxxxxxx_<secreto>
```

La credencial se entrega por canal cifrado, aparte de este documento.

- Vigencia de un año, renovable.
- No se puede recuperar si se pierde: se emite una nueva y la anterior deja de
  servir.
- **No hay CORS.** La integración es servidor a servidor; una llamada desde un
  navegador será bloqueada.

## 4. Parámetros

Ambos endpoints reciben los mismos, y los dos son obligatorios.

| Parámetro | Formato | Regla |
|---|---|---|
| `fechaInicio` | `AAAA-MM-DD` | No puede estar en el futuro |
| `fechaFin` | `AAAA-MM-DD` | No puede ser anterior a `fechaInicio` |

### Límites

| Límite | Valor | Al excederlo |
|---|---|---|
| Rango de la consulta | 92 días | `400` |
| Antigüedad máxima | 400 días | `400` |
| Peticiones | 120 por hora | `429` con `Retry-After` |

Para períodos mayores a 92 días, dividir la consulta en tramos.

Las fechas corresponden al **día calendario colombiano** del registro, no al
instante en que se grabó.

## 5. `GET /alistamientos`

```bash
curl "https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-gesmovil/alistamientos\
?fechaInicio=2026-09-01&fechaFin=2026-09-22" \
     -H "X-API-Key: <credencial>"
```

### Respuesta

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

### Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `alistamiento_id` | entero | Consecutivo único y estable |
| `placa` | texto | Placa del vehículo |
| `fechaAlistamiento` | texto | Fecha y hora, en hora de Colombia (`-05:00`) |
| `responsable` | objeto | Responsable del proceso |
| `conductor` | objeto | Conductor que registró |
| `actividades` | arreglo | Ids oficiales de la Superintendencia |
| `detalleActividades` | texto | Descripciones de esos ids, en el mismo orden |

`tipoIdentificacion: 1` es cédula de ciudadanía.

Hay como máximo **un alistamiento por placa y por día**. Una corrección
modifica ese registro y conserva su `alistamiento_id`.

La flota cubierta es la de la ruta **AEROPUERTO**: 54 vehículos, internos 703 a
759.

## 6. `GET /mantenimientos`

```json
{
  "success": true,
  "data": [
    {
      "mantenimiento_id": 1,
      "fecha": "2026-09-20",
      "placa": "EQR790",
      "hora": "14:30:00",
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

### Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `mantenimiento_id` | entero | Consecutivo único y estable |
| `fecha` | texto | `AAAA-MM-DD` |
| `hora` | texto | `HH:MM:SS` |
| `nit` | texto | NIT de COMBUSES, sin dígito de verificación |
| `razonSocial` | texto | Razón social de COMBUSES |
| `tipomantenimiento` | entero | `1` preventivo, `2` correctivo |
| `detalleActividades` | texto | Actividades ejecutadas |

Este endpoint **no devuelve un arreglo `actividades`**: el manual pide el
detalle como texto.

## 7. Códigos de respuesta

| Código | Significado | Acción |
|---|---|---|
| `200` | Hay registros | Procesar `data` |
| `400` | Parámetros inválidos | Corregir la petición; `message` indica qué falla |
| `401` | Credencial ausente, inválida o vencida | Revisar la credencial |
| `404` | Sin registros en el rango | Tratar como cero registros, no como error |
| `429` | Límite de peticiones excedido | Esperar lo indicado en `Retry-After` |
| `503` | Servicio no disponible temporalmente | Ver abajo |
| `500` | Fallo inesperado | Reintentar; si persiste, reportar |

Los errores llegan con la misma envoltura:

```json
{ "success": false, "message": "texto explicando qué pasó" }
```

### Sobre el `404`

El manual reserva ese código para «no se encontraron registros». Un rango sin
actividad devuelve `404`, no `200` con lista vacía. Conviene no tratarlo como
fallo de integración.

### Sobre el `503`

Aparece cuando algún registro del rango consultado incluye una actividad que
todavía no tiene asignado su id oficial de la Superintendencia. El `message`
indica cuántas son y nombra las primeras.

La comprobación es **por registro, no sobre el catálogo completo**: un rango
puede responder `200` mientras otro responde `503`.

**Se solicita a GESMOVIL el catálogo oficial de actividades de alistamiento**
(id y descripción de cada una). Una vez cargado, los registros ya capturados
quedan disponibles de inmediato, incluido el histórico.

### Rango de prueba

Para poder programar y validar el consumo antes de que ese catálogo esté
cargado, hay registros de prueba disponibles:

| Rango | Contenido |
|---|---|
| `2026-09-01` a `2026-09-04` | 4 alistamientos y 2 mantenimientos. Responde `200`. |

Uno de los alistamientos tiene una actividad no conforme, y los mantenimientos
cubren los dos valores de `tipomantenimiento`. Cada alistamiento de prueba
lleva 2 actividades; uno real lleva 40. El campo `actividades` es un arreglo en
ambos casos.

Estos registros **se retirarán antes de la puesta en producción** y no deben
transmitirse a la Superintendencia. Las consultas fuera de ese rango responden
hoy `503` o `404`.

## 8. Cabeceras de respuesta

| Cabecera | Contenido |
|---|---|
| `X-Api-Version` | Versión del contrato (`v1`) |
| `X-Total-Registros` | Número de elementos en `data` |
| `Cache-Control` | `no-store` |

## 9. Recomendaciones de consumo

- **Una consulta diaria** del día anterior cubre la operación normal.
- **Reprocesar los últimos días** periódicamente: un registro puede corregirse
  después de haber sido consultado y conserva su id. Conviene usar el id como
  clave de actualización, no insertar siempre.
- **No asumir orden** en el arreglo `actividades`.
- **Conservar el `message`** de los errores: indica la causa concreta.

## 10. Soporte

Dudas del contrato, credenciales o incidencias: área de desarrollo de COMBUSES.

Para cerrar la integración se requiere de GESMOVIL:

1. El catálogo oficial de actividades de alistamiento con sus ids (sección 7).
2. Confirmación de que el consumo funciona con la credencial entregada.
3. La IP o rango de IP desde donde consumirán, si se desea restringir el acceso.
4. Confirmación de si VIGIA 2 espera el NIT con dígito de verificación. Hoy
   viaja como `890920397`; el DV es `5`.
5. Confirmación del formato esperado en `hora` de `/mantenimientos`. Hoy viaja
   como `HH:MM:SS`; los segundos son siempre `00`, porque la captura es a
   minuto. Se ajusta a `HH:MM` si VIGIA 2 lo requiere así.
