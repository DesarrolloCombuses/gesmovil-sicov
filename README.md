# Plataforma SICOV — alistamientos y mantenimientos

Plataforma para que COMBUSES **registre** sus alistamientos y mantenimientos, y
para que GESMOVIL los **consuma por API** y los transmita al ecosistema de la
Superintendencia de Transporte (SINST – VIGIA 2), como Aliado Tecnológico.

Son dos mitades:

| | Quién | Qué |
|---|---|---|
| **Captura** | conductor y taller | formularios web que alimentan las tablas `sicov_*` |
| **Entrega** | GESMOVIL | API de solo lectura con el contrato del manual |

El contrato de salida es el del *Manual de apis requeridas para integración
alistamiento-mantenimientos-despachos*. Los dos PDF de origen (ese manual y la
propuesta económica de GESMOVIL) están en la raíz del repo.

## La decisión que lo ordena todo

**El checklist son las actividades oficiales de la Supertransporte, guardadas
por su id oficial.** No hay tabla de homologación en ningún punto del sistema,
porque no hay nada que traducir: el id que el conductor marca es el mismo que
viaja en el reporte.

Eso es lo que se gana al diseñar el modelo desde el manual en vez de adaptar
tablas que ya existían para otra cosa. Cada campo que el manual exige tiene su
columna, así que no hay huecos que rellenar al responder.

## Alcance

Cubre **alistamientos y mantenimientos**. El manual describe también despachos
y llegadas; esos no están aquí, y pedirlos a la API devuelve un 404 que lo dice.

Lo que ya existía en el proyecto y **no se toca**:

- `sicov-alistamiento` — el *push* a `sicov.calisoftware.com.co`. Sigue
  funcionando; esta plataforma es independiente y no comparte nada con ella.
- `preoperacionales` — el checklist urbano interno, con su propia vida.
- `flota_vehiculos` y `employees` — se **leen** para validar placa y cédula,
  nunca se escriben.
- `api_clientes` y `api_accesos` — credenciales y auditoría, se reutilizan.

## Piezas

```
supabase/migrations/20260921120000_sicov_plataforma.sql   modelo de datos
supabase/functions/
  sicov-alistar/            registro de alistamientos (público, sin login)
  sicov-mantenimiento/      registro de mantenimientos (con login)
  sicov-gesmovil/           API de lectura para GESMOVIL
  sicov-sync-catalogos/     trae el catálogo oficial de actividades
web/                        la PWA
  index.html                portada y botón de instalar
  alistamiento.html         formulario del conductor
  mantenimiento.html        formulario del taller
  manifest.webmanifest
  sw.js                     service worker — aquí vive la versión
  assets/                   app.css, comun.js, los dos JS, iconos
scripts/
  generar-api-key.mjs       credencial de un consumidor
  generar-iconos.ps1        dibuja los PNG del manifest
  publicar-web.ps1          sube la PWA con los Cache-Control correctos
  servir-local.ps1          servidor de pruebas en localhost
```

### Modelo de datos

```
sicov_cat_actividades          catálogo oficial (la PK es el id de la Supertransporte)
sicov_config                   NIT, razón social, responsable del proceso
sicov_usuarios                 quién puede registrar mantenimientos

sicov_alistamientos            uno por placa y día
  └ sicov_alistamiento_actividades    qué se verificó, y si quedó conforme

sicov_mantenimientos           trabajos ejecutados
  └ sicov_mantenimiento_actividades
```

Un par de cosas que no son obvias:

- **`fecha` y `registrado_en` son distintos**: el día que se reporta y el
  instante en que se grabó. Sin esa separación, un alistamiento hecho a las 11
  de la noche se reportaría en el día siguiente.
- **El `estado` del alistamiento lo calcula un trigger**, no el formulario. Si
  se confiara en el cliente, un error de JavaScript podría marcar como OK un
  alistamiento con fallas — justo lo que el registro debe evitar.
- **`registrado_por` no es el responsable**: un coordinador puede digitar un
  mantenimiento que ejecutó un mecánico, y el manual pide el segundo.

## Puesta en marcha

```bash
supabase link --project-ref cbplebkmxrkaafqdhiyi
supabase db push

# Registro
supabase functions deploy sicov-alistar --no-verify-jwt   # link público
supabase functions deploy sicov-mantenimiento             # requiere login

# Entrega y catálogo
supabase functions deploy sicov-gesmovil --no-verify-jwt  # valida su X-API-Key
supabase secrets set SUPERTRANSPORTE_TOKEN=<token>
supabase functions deploy sicov-sync-catalogos            # solo nosotros
```

Sobre los `--no-verify-jwt`: `sicov-alistar` no lleva JWT porque el conductor no
tiene cuenta, y `sicov-gesmovil` porque valida su propia `X-API-Key` (obligar
además a un JWT del proyecto significaría darle a GESMOVIL una segunda
credencial sin ganar nada).

**1. Configurar la empresa.**

```sql
update sicov_config set valor = '<nit sin dígito de verificación>' where clave = 'nit';
update sicov_config set valor = '<razón social exacta>'            where clave = 'razon_social';
update sicov_config set valor = '<cédula del responsable>'         where clave = 'responsable_num_id';
update sicov_config set valor = '<nombre del responsable>'         where clave = 'responsable_nombre';
```

Sin el responsable, `sicov-alistar` rechaza los registros con un 503 que lo
dice. Sin el NIT, la API de mantenimientos responde lo mismo.

**2. Sincronizar el catálogo de actividades.** Ver la sección siguiente: hace
falta un token que todavía no tenemos.

**3. Autorizar al personal del taller.** Crear el usuario en Supabase Auth
(Authentication → Users) y luego:

```sql
insert into sicov_usuarios (user_id, nombre, cedula, rol) values
  ('<uuid del usuario>', 'Nombre Completo', '<cédula>', 'taller');
```

Roles: `taller` registra a su nombre; `coordinador` y `admin` pueden además
atribuir un trabajo a otra persona.

**4. Publicar la PWA.** Configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en
[web/assets/comun.js](web/assets/comun.js) — están los dos en un solo sitio, y
la anon key es pública por diseño. Después crear el bucket en el panel (Storage
→ New bucket → `sicov`, marcado como **público**) y publicar:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publicar-web.ps1
```

El link que se reparte a los conductores queda en
`https://<ref>.supabase.co/storage/v1/object/public/sicov/alistamiento.html`.

**5. Dar de alta a GESMOVIL.**

```bash
node scripts/generar-api-key.mjs "GESMOVIL S.A.S." 120 365
```

Imprime la key en claro (única vez que existe: la base solo guarda su SHA-256) y
el SQL de alta. Entregar por canal cifrado, no por correo en texto plano.

## La PWA y el manejo de versiones

Es HTML, CSS y JS sin build ni dependencias que compilar. Se instala en la
pantalla de inicio y abre sin buscar el enlace, que es lo que cuenta cuando el
conductor está de pie junto al vehículo.

### Publicar una versión nueva

1. Subir `VERSION` en [web/sw.js](web/sw.js) (primera línea de código).
2. `powershell -ExecutionPolicy Bypass -File scripts/publicar-web.ps1`

Eso es todo. **`VERSION` es la fuente única**: el nombre del caché la incluye,
así que cada versión estrena caché y los anteriores se borran al activar — no
hay forma de quedarse con una mezcla de archivos de dos versiones. La UI
muestra la versión en el pie, preguntándosela al worker en vez de guardar una
segunda copia del número que acabaría discrepando.

Funciona porque el navegador compara `sw.js` byte a byte con el instalado.
Por eso `publicar-web.ps1` lo sube con `max-age=0`: si Storage lo sirviera con
una hora de caché, una versión nueva tardaría hasta una hora en detectarse. Los
assets sí van con caché de 7 días, porque el worker los pide con
`{cache: "reload"}` al instalar y salta el caché HTTP.

El script sube `sw.js` **al final**, después de los assets. Al revés, un
teléfono podría instalar la versión nueva y pedir archivos que aún no están
arriba.

### Actualizar sin perder trabajo

Una versión nueva **no se activa sola** si hay un formulario a medio llenar.
Activarla recarga la página, y el conductor perdería el checklist.

- Formulario limpio → se actualiza sola, sin preguntar.
- Formulario con algo escrito → cinta azul arriba con un botón «Actualizar»,
  y se aplica cuando él quiera.

Cada formulario declara cómo sabe si tiene trabajo a medias
(`SICOV.registrarGuardia`), así que la lógica de versiones no necesita conocer
los campos de cada uno.

### Qué funciona sin red

| | Sin conexión |
|---|---|
| Abrir la app y el formulario de alistamiento | ✅ |
| Ver el checklist y la lista de vehículos | ✅ del último catálogo guardado |
| Llenar el formulario | ✅ y no se pierde |
| **Enviar el registro** | ❌ requiere señal |
| Mantenimientos (login) | ❌ requiere señal |

**El envío requiere red a propósito.** Un alistamiento es una afirmación ante
el regulador y tiene una restricción de uno por placa y día; guardarlo en el
teléfono para mandarlo después acabaría en duplicados o en un «creí que lo
había enviado». La cinta lo dice con esas palabras y lo escrito no se pierde:
el conductor busca señal y vuelve a tocar Registrar.

Si más adelante hace falta, una cola con IndexedDB es el siguiente paso — pero
hay que resolver primero qué pasa con el registro encolado de un día que ya
pasó, y quién responde por él.

El formulario de mantenimientos no funciona offline porque importa supabase-js
de un CDN, y el login necesita red de todas formas. El de alistamiento no usa
ningún CDN precisamente por eso.

### Probar antes de publicar

```powershell
powershell -ExecutionPolicy Bypass -File scripts/servir-local.ps1
```

Hace falta un servidor porque un service worker no se registra desde `file://`;
`localhost` cuenta como origen seguro. En Chrome, F12 → Application → Manifest
y → Service Workers, y F12 → Network → Offline para comprobar que abre sin red.

### Los iconos

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generar-iconos.ps1
```

Se dibujan con `System.Drawing` (viene con Windows) en vez de traer un binario
de imágenes, así que son reproducibles desde el repo y no hay un PNG suelto que
nadie sabe de dónde salió. El maskable deja el dibujo en el 58% central porque
Android recorta hasta un 20% por lado.

## El catálogo de actividades

Esto es lo único que bloquea la puesta en marcha, y no es código.

Verificado el 21-sep-2026 contra los servicios reales:

| Servicio | Resultado |
|---|---|
| `listar-actividades` | ❌ «Error en el token» — el token del manual no sirve aquí |
| `nivelservicio` | ✅ responde (no lo necesitamos) |
| `listar-clase-vehiculo` | ✅ responde (no lo necesitamos) |

La cabecera correcta es `Authorization: Bearer` — con `token:` o `x-token:` el
servicio responde «Falta el token de autenticación», así que reconoce la
primera y rechaza el valor.

**Hay que pedirle a GESMOVIL un token de COMBUSES para esa maestra.** Con él:

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/sicov-sync-catalogos" \
     -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

### Mientras llega

Los formularios se pintan **desde la tabla**, así que sembrarla a mano funciona
igual y el sync posterior la corrige. El manual solo muestra dos actividades
oficiales en su ejemplo, y son las únicas que se pueden afirmar:

```sql
insert into sicov_cat_actividades (id, descripcion, grupo, orden) values
  (1, 'Fugas del motor',            'Motor', 1),
  (4, 'Niveles de aceite de motor', 'Motor', 2)
on conflict (id) do nothing;
```

No inventes los demás ids: un id equivocado hace que el reporte afirme que se
verificó algo distinto de lo que se verificó.

El sincronizador desactiva (no borra) lo que ya no venga en la maestra: los
alistamientos históricos apuntan a esos ids y su reporte debe seguir siendo
reproducible.

## La API para GESMOVIL

```
GET /sicov-gesmovil/alistamientos?fechaInicio=AAAA-MM-DD&fechaFin=AAAA-MM-DD
GET /sicov-gesmovil/mantenimientos?fechaInicio=AAAA-MM-DD&fechaFin=AAAA-MM-DD
```

Autenticación: cabecera `X-API-Key`. Respuesta `{ success, data }`.

Códigos: `200` exitosa · `400` parámetros inválidos · `401` no autorizado ·
`404` sin registros o endpoint inexistente · `429` límite superado · `503`
configuración incompleta.

**Sobre el 404:** el manual reserva ese código para «No se encontraron
registros», así que un rango sin actividad responde 404 y no un `200` con lista
vacía. No es lo habitual en REST, pero es el contrato que espera el cliente.

**Límite de rango:** 92 días. El manual no define paginación, y la alternativa
sería truncar filas en silencio: GESMOVIL reportaría de menos sin enterarse.

## Decisiones de diseño

**El conductor sin login, el taller con login.** El alistamiento se valida
contra la flota, no contra un usuario: solo se puede escribir sobre una placa
que existe y con actividades del catálogo. El mantenimiento es distinto — es la
afirmación de que un trabajo se ejecutó, y el manual exige un responsable con
nombre y cédula. Un formulario anónimo no puede sostener eso.

**Tener cuenta no es estar autorizado.** `verify_jwt` solo prueba que hay una
sesión del proyecto; quién puede registrar mantenimientos se comprueba además
contra `sicov_usuarios`.

**Ningún punto del checklist viene premarcado.** Hay que tocar OK o Falla en
cada uno. Un formulario que llegara todo en «OK» se enviaría sin mirar el
vehículo, y eso vaciaría de sentido el registro. Un toque por punto sigue
siendo rápido.

**El responsable del alistamiento sale de la configuración, no del
formulario.** El conductor no puede designar a un tercero como responsable de
su propio alistamiento.

**Sin CORS en `sicov-gesmovil`, con CORS en las de registro.** La primera es
servidor-a-servidor: si se pudiera llamar desde un navegador, la API key
acabaría dentro de un frontend a la vista de cualquiera. Las de registro sí las
llama un navegador, por definición.

**Credenciales compartidas con alcance separado.** `api_clientes` ya existía
para `api-externa` (programación de turnos de CombuAsigna) y se reutiliza, con
una columna `apis` que acota qué API puede consumir cada credencial. Dos
barreras a propósito: esa columna, y que `api-externa` ya exige `bases` no
vacío — un cliente de SICOV (`bases = '{}'`) recibe 403 de esa API aunque se
olvide el chequeo. Una sola barrera dependería de que nadie se equivoque una vez.

**Rate limiting contra la base, no en memoria.** Cada petición cae en una
instancia nueva de la función, así que un contador en el proceso nace vacío
siempre y no frena nada. El coste está donde toca: la consulta de intentos
fallidos solo se hace cuando la credencial ya falló.

**Nada se escribe desde el navegador.** Todas las tablas tienen RLS sin
políticas de escritura; los registros solo nacen por las edge functions, que
validan placa, cédula y actividades. Un alistamiento es una afirmación ante el
regulador.

**Estado de salud fuera de las respuestas.** La operación pega el estado al
nombre (`"Juan Pérez [INCAPACITADO]"`). Eso es dato de salud de una persona
identificada, sensible bajo la Ley 1581 de 2012. Se limpia antes de mostrarlo
en una lista pública y antes de reportarlo.

## Pendiente

- **El token de la maestra de actividades** (ver arriba). Es el único bloqueo
  real.
- **`employees` sirve mejor de lo que parecía.** Un comentario en
  `preoperacional-publico` dice que la tabla solo tiene unos pocos conductores
  bien marcados, pero eso era filtrando por las dos rutas del preoperacional
  urbano. Sin ese filtro, `cargo = 'CONDUCTOR'` y `activo = true` dan **298
  conductores** (verificado contra la función desplegada), y `flota_vehiculos`
  trae **135 placas** — con más rutas de las esperadas: AEROPUERTO, ZAMORA,
  ARANJUEZ - GUADALUPE y TERMINAL 313. El formulario igual acepta una cédula
  que no esté en la lista: si está, usa el nombre oficial y evita el error de
  tipeo.
- **Errata del manual**, por si GESMOVIL pregunta: los ejemplos JSON de
  despachos tienen comas finales sobrantes (no son JSON válido); las tablas de
  despachos numeran «7.3» tres veces; `fechaAlistamiento` se describe como
  fecha y hora pero el ejemplo trae solo fecha (aquí se envían ambas).
- **Sin type-check local.** No hay Deno ni Node en la máquina de desarrollo, así
  que el TypeScript de las edge functions no se ha compilado. El primer
  `functions deploy` es lo que lo confirmaría.
- **La PWA no se ha abierto en un navegador.** El servidor local sirve los
  archivos con los tipos y cachés correctos (verificado), y los ids que el JS
  busca existen en cada HTML (verificado), pero el registro del service worker,
  la instalación y el aviso de versión nueva hay que verlos en Chrome con
  `servir-local.ps1`.
