# API SICOV de COMBUSES — Guía de consumo

Documento para el equipo técnico de GESMOVIL.

COMBUSES expone por API los alistamientos y mantenimientos de su flota. El
contrato sigue el *Manual de apis requeridas para integración
alistamiento-mantenimientos-despachos*, con la respuesta de `/alistamientos` en
el formato que indicó GESMOVIL el 9 de noviembre de 2026.

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
| `GET` | `/actividades` | Disponible. Catálogo de actividades de COMBUSES |
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

`/alistamientos` y `/mantenimientos` reciben los mismos, y los dos son
obligatorios. `/actividades` no recibe parámetros.

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
      "fechaAlistamiento": "2026-09-22",
      "placa": "EQR790",
      "responsable": {
        "tipoIdentificacion": 1,
        "numeroIdentificacion": 12345678,
        "nombre": "NOMBRE DEL RESPONSABLE"
      },
      "conductor": {
        "tipoIdentificacion": 1,
        "numeroIdentificacion": 87654321,
        "nombre": "NOMBRE DEL CONDUCTOR"
      },
      "detalleActividades": [
        { "id": 1000, "descripcion": "Niveles de aceite de motor" },
        { "id": 1001, "descripcion": "Fugas del motor" }
      ],
      "actividades": [1000, 1001]
    }
  ]
}
```

### Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `alistamiento_id` | entero | Consecutivo único y estable |
| `fechaAlistamiento` | texto | `AAAA-MM-DD`, día colombiano del alistamiento |
| `placa` | texto | Placa del vehículo |
| `responsable` | objeto | Responsable del proceso |
| `conductor` | objeto | Conductor que registró |
| `detalleActividades` | arreglo | Un objeto `{ id, descripcion }` por actividad |
| `actividades` | arreglo | Ids de actividad de COMBUSES (sección 7), en el mismo orden que `detalleActividades` |

`numeroIdentificacion` es numérico y `tipoIdentificacion: 1` es cédula de
ciudadanía. Las cédulas y los nombres de los ejemplos son ficticios: la API
entrega los reales.

**La homologación al catálogo de la Superintendencia la realiza GESMOVIL.** Los
ids de `actividades` son los de COMBUSES, desde el 1000, y su significado está
en `GET /actividades`.

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
      "numeroIdentificacion": "12345678",
      "nombresResponsable": "NOMBRE DEL RESPONSABLE",
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
detalle como texto. Aquí `numeroIdentificacion` también viaja como texto; el
cambio de formato de la `v3` aplica solo a `/alistamientos`.

## 7. `GET /actividades`

Catálogo completo de actividades de COMBUSES. Es la referencia para homologar
los ids que viajan en `actividades`.

```bash
curl "https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/sicov-gesmovil/actividades" \
     -H "X-API-Key: <credencial>"
```

### Respuesta

```json
{
  "success": true,
  "data": [
    {
      "id": 1000,
      "descripcion": "Niveles de aceite de motor",
      "grupo": "Motor y fluidos",
      "activa": true,
      "aplicaAlistamiento": true,
      "aplicaMantenimiento": true
    }
  ]
}
```

### Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | entero | El id que viaja en `actividades` y en `detalleActividades` |
| `descripcion` | texto | La que viaja en `detalleActividades` |
| `grupo` | texto | Agrupación dentro del checklist |
| `activa` | booleano | `false` si se retiró del checklist |
| `aplicaAlistamiento` | booleano | Se verifica en el alistamiento diario |
| `aplicaMantenimiento` | booleano | Se usa en mantenimientos |

Las actividades retiradas siguen apareciendo con `activa: false`, porque los
registros anteriores pueden llevarlas. Los ids no se reutilizan: si COMBUSES
agrega una actividad, aparece aquí con un id nuevo.

En `/alistamientos` cada actividad viaja con su `id`, que es lo que conviene
usar para homologar. En `/mantenimientos` el detalle es un texto que une las
descripciones con comas, y algunas descripciones tienen comas propias: no
conviene separarlo por comas.

## 8. Códigos de respuesta

| Código | Significado | Acción |
|---|---|---|
| `200` | Hay registros | Procesar `data` |
| `400` | Parámetros inválidos | Corregir la petición; `message` indica qué falla |
| `401` | Credencial ausente, inválida o vencida | Revisar la credencial |
| `404` | Sin registros en el rango | Tratar como cero registros, no como error |
| `429` | Límite de peticiones excedido | Esperar lo indicado en `Retry-After` |
| `503` | Falta configuración de COMBUSES | Reportarlo a COMBUSES |
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

Aparece si falta un dato de configuración de COMBUSES que el manual exige, como
el NIT o la razón social en `/mantenimientos`. El `message` nombra el dato. No
depende de la consulta: se resuelve del lado de COMBUSES.

### Rango de prueba

La operación diaria se registra desde el 7 de octubre de 2026. Para probar el
consumo hay además registros de prueba:

| Rango | Contenido |
|---|---|
| `2026-09-01` a `2026-09-04` | 4 alistamientos y 2 mantenimientos. Responde `200`. |

Uno de los alistamientos tiene una actividad no conforme, y los mantenimientos
cubren los dos valores de `tipomantenimiento`. Cada alistamiento de prueba
lleva 2 actividades; uno real lleva 40. El campo `actividades` es un arreglo en
ambos casos.

Estos registros **se retirarán antes de la puesta en producción** y no deben
transmitirse a la Superintendencia.

## 9. Cabeceras de respuesta

| Cabecera | Contenido |
|---|---|
| `X-Api-Version` | Versión del contrato (`v3`) |
| `X-Total-Registros` | Número de elementos en `data` |
| `Cache-Control` | `no-store` |

La `v3` dejó `/alistamientos` en el formato que indicó GESMOVIL:
`fechaAlistamiento` sin hora, `numeroIdentificacion` numérico y
`detalleActividades` como arreglo de `{ id, descripcion }`. La `v2` había
cambiado el contenido de `actividades`: en la `v1` llevaba ids oficiales de la
Superintendencia, y desde la `v2` lleva los ids de COMBUSES.

## 10. Recomendaciones de consumo

- **Una consulta diaria** del día anterior cubre la operación normal.
- **Reprocesar los últimos días** periódicamente: un registro puede corregirse
  después de haber sido consultado y conserva su id. Conviene usar el id como
  clave de actualización, no insertar siempre.
- **No asumir orden** en el arreglo `actividades`.
- **Consultar `/actividades` a diario.** Un id de `actividades` que no esté en
  la tabla de homologación de GESMOVIL indica que COMBUSES agregó una
  actividad.
- **Conservar el `message`** de los errores: indica la causa concreta.

## 11. Soporte

Dudas del contrato, credenciales o incidencias: área de desarrollo de COMBUSES.

Para cerrar la integración se requiere de GESMOVIL:

1. Copia de la tabla de homologación que construyan (id de COMBUSES → id
   oficial), para que COMBUSES pueda verificar lo que se reporta a su nombre.
2. Confirmación de que el consumo funciona con la credencial entregada.
3. La IP o rango de IP desde donde consumirán, si se desea restringir el acceso.
4. Confirmación de si VIGIA 2 espera el NIT con dígito de verificación. Hoy
   viaja como `890920397`; el DV es `5`.
5. Confirmación del formato esperado en `hora` de `/mantenimientos`. Hoy viaja
   como `HH:MM:SS`; los segundos son siempre `00`, porque la captura es a
   minuto. Se ajusta a `HH:MM` si VIGIA 2 lo requiere así.
