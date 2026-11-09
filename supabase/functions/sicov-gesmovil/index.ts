/**
 * API SICOV de solo lectura para GESMOVIL
 * ---------------------------------------------------------------------------
 * COMBUSES designa a GESMOVIL como Aliado Tecnologico: GESMOVIL consume por
 * aqui los alistamientos y mantenimientos registrados en la plataforma y los
 * transmite al ecosistema de la Superintendencia de Transporte
 * (SINST - VIGIA 2).
 *
 * El contrato es el del "Manual de apis requeridas para integracion
 * alistamiento-mantenimientos-despachos". Las tablas de origen se diseñaron
 * desde ese manual, asi que cada campo exigido tiene su columna: no hay
 * huecos que rellenar ni codigos que traducir al responder.
 *
 * Endpoints (GET, solo lectura):
 *
 *   GET /alistamientos?fechaInicio=AAAA-MM-DD&fechaFin=AAAA-MM-DD
 *   GET /mantenimientos?fechaInicio=AAAA-MM-DD&fechaFin=AAAA-MM-DD
 *   GET /actividades       catalogo de actividades de COMBUSES, sin rango
 *
 * Autenticacion: cabecera  X-API-Key: <key>
 *
 * Decisiones deliberadas:
 *
 *   - NO se habilita CORS. Esto es servidor-a-servidor. Si se pudiera llamar
 *     desde un navegador, la API key acabaria dentro de un frontend a la vista
 *     de cualquiera. Que el navegador lo bloquee es la intencion.
 *
 *   - Las actividades salen con el id y la descripcion de COMBUSES (ids desde
 *     1000), tal como las marco el conductor. La homologacion al catalogo de
 *     la Supertransporte la hace GESMOVIL de su lado: asi lo pidieron, y el
 *     catalogo oficial no abre con ninguno de los tokens que tenemos. Para que
 *     puedan traducir, GET /actividades entrega el catalogo completo.
 *
 *     Hasta la v1 era al reves: la API traducia contra
 *     sicov_homolog_actividades y respondia 503 si faltaba alguna traduccion.
 *     Esa tabla sigue en la base, pero la API ya no la lee.
 *
 *   - La forma de /alistamientos es la que pidio GESMOVIL el 9-nov-2026 (v3),
 *     no la literal del manual: detalleActividades es una lista de
 *     { id, descripcion }, fechaAlistamiento lleva solo la fecha y las cedulas
 *     van como numero. GESMOVIL rechazo la v2, que seguia el manual al pie de
 *     la letra (detalle como texto unido por comas, fecha con hora, cedulas
 *     como texto). /mantenimientos sigue como en el manual: no lo objetaron.
 *
 *   - Los despachos y llegadas del manual no estan aqui: esta plataforma cubre
 *     alistamiento y mantenimiento. Pedirlos devuelve 404 con la lista de lo
 *     que si existe, en vez de un error mudo.
 *
 * Variables de entorno (las pone Supabase, nunca van en el codigo):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VERSION = "v3";

// Alcance que debe tener la credencial en api_clientes.apis. La misma tabla
// sirve a otras APIs externas del proyecto, asi que el alcance se valida
// siempre: una key de CombuAsigna no puede leer la operacion SICOV.
const API_SCOPE = "sicov";

// Tope del rango consultable. El manual no define paginacion, asi que la
// alternativa a limitar el rango seria truncar filas en silencio y que
// GESMOVIL reporte de menos sin enterarse. Preferible un 400 explicito.
const RANGO_MAX_DIAS = 92;

// Mas atras que esto no es una consulta operativa, es un volcado historico.
const DIAS_ATRAS_MAX = 400;

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------
// El manual fija la envoltura: { success, data }. No se le agregan campos
// nuestros al cuerpo, para que el parser de GESMOVIL no tenga que tolerar
// extras. Lo nuestro (version, conteo) va en cabeceras.

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Api-Version": VERSION,
      ...extra,
    },
  });
}

function ok(data: unknown[]): Response {
  // El manual reserva el 404 para "no se encontraron registros". No es lo
  // habitual en REST (un rango sin actividad es una respuesta valida, no un
  // error), pero es el contrato que espera el cliente y manda el contrato.
  if (data.length === 0) {
    return json({ success: false, message: "No se encontraron registros en el rango consultado." }, 404);
  }
  return json({ success: true, data }, 200, { "X-Total-Registros": String(data.length) });
}

function error(status: number, mensaje: string, extra: Record<string, string> = {}): Response {
  return json({ success: false, message: mensaje }, status, extra);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Una fila cualquiera de la base: con select anidado no se puede anotar. */
type Fila = Record<string, unknown>;

async function sha256(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const buffer = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ipDe(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "desconocida";
}

/** Texto limpio o null. Un "" en un reporte regulatorio no dice nada. */
function txt(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === "" ? null : s;
}

/**
 * Numero de identificacion como numero JSON, que es como lo pide GESMOVIL y
 * como lo trae el ejemplo del manual.
 *
 * Solo se convierte lo que es un numero sin perdida: digitos, sin cero a la
 * izquierda (Number("0123") seria 123, otra persona) y dentro del rango entero
 * seguro. Lo demas sale como texto tal cual. Un documento que no sea una
 * cedula limpia tiene que llegar a GESMOVIL reconocible, no convertido en
 * otro numero ni en null.
 */
function numeroId(valor: unknown): number | string | null {
  const s = txt(valor);
  if (!s) return null;
  return /^[1-9]\d{0,14}$/.test(s) ? Number(s) : s;
}

interface Rango {
  inicio: string;
  fin: string;
}

/**
 * Valida fechaInicio/fechaFin. Devuelve el mensaje listo en vez de lanzar,
 * para que el router pueda registrar el acceso fallido antes de responder.
 *
 * Las dos tablas guardan 'fecha' como date del dia colombiano, asi que aqui no
 * hace falta convertir zonas: se compara dia contra dia. La conversion vive en
 * el registro, que es donde se decide a que dia pertenece una captura.
 */
function leerRango(url: URL): { rango: Rango } | { mensaje: string } {
  const inicio = txt(url.searchParams.get("fechaInicio"));
  const fin = txt(url.searchParams.get("fechaFin"));

  if (!inicio || !fin) {
    return { mensaje: "Faltan los parametros obligatorios fechaInicio y fechaFin (AAAA-MM-DD)." };
  }
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  if (!formato.test(inicio) || !formato.test(fin)) {
    return { mensaje: "fechaInicio y fechaFin deben tener el formato AAAA-MM-DD." };
  }

  const dInicio = new Date(`${inicio}T00:00:00Z`);
  const dFin = new Date(`${fin}T00:00:00Z`);
  if (Number.isNaN(dInicio.getTime()) || Number.isNaN(dFin.getTime())) {
    return { mensaje: "fechaInicio o fechaFin no es una fecha real." };
  }
  // Se compara contra el dia colombiano, no el UTC: entre las 19:00 y la
  // medianoche de Colombia ya es el dia siguiente en UTC, y pedir "hoy" no
  // puede salir rechazado por eso.
  const hoyCol = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const dHoy = new Date(`${hoyCol}T00:00:00Z`);

  if (dFin.getTime() < dInicio.getTime()) {
    return { mensaje: "fechaFin no puede ser anterior a fechaInicio." };
  }
  if (dInicio.getTime() > dHoy.getTime()) {
    return { mensaje: "fechaInicio no puede estar en el futuro." };
  }
  const dias = Math.round((dFin.getTime() - dInicio.getTime()) / 86_400_000) + 1;
  if (dias > RANGO_MAX_DIAS) {
    return { mensaje: `El rango no puede superar ${RANGO_MAX_DIAS} dias (se pidieron ${dias}). Divide la consulta.` };
  }
  if (Math.round((dHoy.getTime() - dInicio.getTime()) / 86_400_000) > DIAS_ATRAS_MAX) {
    return { mensaje: `fechaInicio no puede ser de mas de ${DIAS_ATRAS_MAX} dias atras.` };
  }

  return { rango: { inicio, fin } };
}

// ---------------------------------------------------------------------------
// Freno para las peticiones SIN credencial valida
// ---------------------------------------------------------------------------
// El limite por hora se cuenta por cliente, asi que no cubre a quien no tiene
// credencial: cualquiera puede lanzar peticiones con keys inventadas y, aunque
// no vea nada, cada intento consulta la base y escribe en api_accesos.
//
// La cuenta va contra api_accesos y no en memoria: cada peticion cae en una
// instancia nueva de la funcion, asi que un contador en el proceso nace vacio
// siempre y no frena nada. El coste esta donde toca: la consulta solo se hace
// cuando la credencial ya fallo, asi que una peticion legitima no la paga.
const FALLOS_MAX_IP = 20;
const VENTANA_FALLOS_MS = 10 * 60 * 1000;

async function fallosRecientes(db: ReturnType<typeof createClient>, ip: string): Promise<number> {
  if (ip === "desconocida") return 0;
  const desde = new Date(Date.now() - VENTANA_FALLOS_MS).toISOString();
  const { count, error: errCount } = await db
    .from("api_accesos")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("status", 400)
    .gte("creado_en", desde);
  if (errCount) {
    // Si no se puede contar, no se frena: preferible dejar pasar que tumbar el
    // servicio por un fallo del contador.
    console.error("[sicov-gesmovil] no se pudo contar intentos fallidos:", errCount.message);
    return 0;
  }
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Autenticacion
// ---------------------------------------------------------------------------

interface Cliente {
  id: number;
  nombre: string;
  key_prefijo: string;
  limite_hora: number;
  apis: string[];
}

// Union con los dos campos declarados como opcionales en la rama contraria.
// Sin esto, leer auth.fallo sobre la union no compila.
type ResultadoAuth =
  | { fallo: Response; cliente?: undefined }
  | { fallo?: undefined; cliente: Cliente };

async function autenticar(req: Request, db: ReturnType<typeof createClient>): Promise<ResultadoAuth> {
  const key = req.headers.get("x-api-key")?.trim();
  if (!key) {
    return { fallo: error(401, "Falta la cabecera X-API-Key.") };
  }

  const hash = await sha256(key);
  const { data, error: errDb } = await db
    .from("api_clientes")
    .select("id, nombre, key_prefijo, limite_hora, expira_en, apis")
    .eq("key_hash", hash)
    .eq("activo", true)
    .maybeSingle();

  if (errDb) {
    console.error("[sicov-gesmovil] error consultando api_clientes:", errDb.message);
    return { fallo: error(500, "No se pudo validar la credencial.") };
  }
  // Mismo mensaje para key inexistente, desactivada y sin alcance: no damos
  // pistas de si la key existio alguna vez ni de que le falta.
  if (!data) {
    return { fallo: error(401, "Credencial no valida.") };
  }
  if (data.expira_en && new Date(data.expira_en) < new Date()) {
    return { fallo: error(401, "La credencial expiro.") };
  }
  if (!Array.isArray(data.apis) || !data.apis.includes(API_SCOPE)) {
    return { fallo: error(401, "Credencial no valida.") };
  }

  const desde = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db
    .from("api_accesos")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", data.id)
    .gte("creado_en", desde);

  if ((count ?? 0) >= data.limite_hora) {
    return {
      fallo: error(429, `Superaste el limite de ${data.limite_hora} consultas por hora.`, { "Retry-After": "600" }),
    };
  }

  return { cliente: data as Cliente };
}

async function registrarAcceso(
  db: ReturnType<typeof createClient>,
  cliente: Cliente | null,
  req: Request,
  endpoint: string,
  status: number,
  fecha: string | null,
  filas: number | null,
) {
  try {
    const ip = ipDe(req);
    await db.from("api_accesos").insert({
      cliente_id: cliente?.id ?? null,
      key_prefijo: cliente?.key_prefijo ?? null,
      endpoint,
      fecha_consultada: fecha,
      status,
      filas_devueltas: filas,
      ip: ip === "desconocida" ? null : ip,
      user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    });
    if (cliente) {
      await db.from("api_clientes").update({ ultimo_acceso: new Date().toISOString() }).eq("id", cliente.id);
    }
  } catch (e) {
    // El registro no puede tumbar la respuesta al cliente.
    console.error("[sicov-gesmovil] no se pudo registrar el acceso:", e);
  }
}

// ---------------------------------------------------------------------------
// Configuracion de empresa
// ---------------------------------------------------------------------------

type Config = Record<string, string | null>;

async function leerConfig(db: ReturnType<typeof createClient>): Promise<Config> {
  const { data } = await db.from("sicov_config").select("clave, valor");
  const cfg: Config = {};
  for (const fila of (data || []) as Fila[]) {
    cfg[String(fila.clave)] = txt(fila.valor);
  }
  return cfg;
}

/**
 * Corta la respuesta si falta configuracion que el manual marca obligatoria.
 * Entregar el reporte con el NIT vacio no ayuda a nadie: GESMOVIL lo rechaza
 * igual, pero mas tarde y sin decir por que. Un 503 nombra lo que falta.
 */
function faltaConfig(cfg: Config, claves: string[]): Response | null {
  const faltan = claves.filter((k) => !cfg[k]);
  if (faltan.length === 0) return null;
  return error(
    503,
    `Configuracion incompleta en sicov_config: ${faltan.join(", ")}. Un responsable de COMBUSES debe completarla.`,
  );
}

// ---------------------------------------------------------------------------
// Lectura paginada
// ---------------------------------------------------------------------------
// PostgREST corta cada respuesta en 1000 filas (db-max-rows del proyecto), y lo
// hace en silencio: no hay error ni cabecera que avise. Con unos 51
// alistamientos diarios, un mes pasa de 1000, y GESMOVIL habria recibido hasta
// el dia 20 y algo creyendo que era todo. Verificado el 4-nov-2026: pedir del
// 1-oct al 4-nov devolvia 1000 filas que terminaban el 27-oct.
//
// Se pide pagina tras pagina hasta que una llegue vacia. Se avanza por lo que
// llego y no por lo que se pidio, para que siga funcionando si alguien cambia
// el tope del proyecto a un valor menor.
const PAGINA = 1000;

// 92 dias de la flota completa no llegan a 6 paginas. Pasar de esto indica que
// la consulta no esta avanzando, y es mejor un 500 que un bucle sin fin.
const PAGINAS_MAX = 50;

type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

async function leerTodo(tabla: string, pedir: (desde: number, hasta: number) => Pagina): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (let n = 0; n < PAGINAS_MAX; n++) {
    const { data, error: errDb } = await pedir(filas.length, filas.length + PAGINA - 1);
    if (errDb) throw new Error(`${tabla}: ${errDb.message}`);
    const lote = (data || []) as Fila[];
    if (lote.length === 0) return filas;
    filas.push(...lote);
  }
  throw new Error(`${tabla}: mas de ${PAGINAS_MAX} paginas en una sola consulta`);
}

// ---------------------------------------------------------------------------
// Actividades: el catalogo de COMBUSES
// ---------------------------------------------------------------------------
// Se lee completo, inactivas incluidas: un alistamiento de hace tres meses
// puede llevar una actividad que despues se retiro del checklist, y su
// descripcion tiene que seguir saliendo. Por la misma razon /actividades las
// entrega todas, con la marca 'activa'.

interface ActividadCatalogo {
  id: number;
  descripcion: string;
  grupo: string | null;
  activa: boolean;
  aplicaAlistamiento: boolean;
  aplicaMantenimiento: boolean;
}

async function leerCatalogo(db: ReturnType<typeof createClient>): Promise<ActividadCatalogo[]> {
  const { data, error: errDb } = await db
    .from("sicov_cat_actividades")
    .select("id, descripcion, grupo, activa, aplica_alistamiento, aplica_mantenimiento")
    .order("orden", { ascending: true, nullsFirst: false })
    .order("id");

  if (errDb) throw new Error(`sicov_cat_actividades: ${errDb.message}`);

  return ((data || []) as Fila[]).map((f) => ({
    id: Number(f.id),
    descripcion: txt(f.descripcion) ?? "",
    grupo: txt(f.grupo),
    activa: f.activa === true,
    aplicaAlistamiento: f.aplica_alistamiento === true,
    aplicaMantenimiento: f.aplica_mantenimiento === true,
  }));
}

interface Actividades {
  ids: number[];
  /** Para /alistamientos (v3): una entrada por actividad. */
  lista: { id: number; descripcion: string }[];
  /** Para /mantenimientos: las descripciones unidas por comas, como el manual. */
  detalle: string;
}

/**
 * Los campos de actividades a partir de las marcadas en un registro. Salen en
 * el orden del checklist y no en el de captura, y los ids y las descripciones
 * en el mismo orden entre si.
 *
 * Recorrer el catalogo en vez de las marcas no pierde nada: la llave foranea
 * garantiza que toda actividad marcada existe en el catalogo.
 */
function aplanarActividades(crudas: unknown, catalogo: ActividadCatalogo[]): Actividades {
  const marcadas = new Set<number>();
  for (const fila of Array.isArray(crudas) ? (crudas as Fila[]) : []) {
    const id = Number(fila.actividad_id);
    if (Number.isInteger(id)) marcadas.add(id);
  }

  const elegidas = catalogo.filter((a) => marcadas.has(a.id));
  return {
    ids: elegidas.map((a) => a.id),
    lista: elegidas.map((a) => ({ id: a.id, descripcion: a.descripcion })),
    detalle: elegidas.map((a) => a.descripcion).join(", "),
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

type RespuestaEndpoint = { data: unknown[]; fallo?: undefined } | { data?: undefined; fallo: Response };

type Manejador = (
  db: ReturnType<typeof createClient>,
  rango: Rango,
  cfg: Config,
) => Promise<RespuestaEndpoint>;

/** Manual: "Exposicion de API para Consulta de Alistamientos". */
async function endpointAlistamientos(
  db: ReturnType<typeof createClient>,
  rango: Rango,
  _cfg: Config,
): Promise<RespuestaEndpoint> {
  const catalogo = await leerCatalogo(db);

  // Columna por columna, NUNCA '*'. La tabla tiene campos que no pueden salir
  // de aqui: apto_descanso, apto_sustancias y apto_observacion son el
  // autorreporte del conductor sobre su propio estado -- dato de salud de una
  // persona identificada, categoria especial bajo la Ley 1581 -- y el contrato
  // del manual no los pide. Un '*' los mandaria a GESMOVIL y de ahi al
  // regulador sin que nadie lo hubiera decidido.
  const registros = await leerTodo("sicov_alistamientos", (desde, hasta) =>
    db
      .from("sicov_alistamientos")
      .select(`
        id, placa, fecha,
        responsable_tipo_id, responsable_num_id, responsable_nombre,
        conductor_tipo_id, conductor_num_id, conductor_nombre,
        sicov_alistamiento_actividades ( actividad_id )
      `)
      .gte("fecha", rango.inicio)
      .lte("fecha", rango.fin)
      // El id desempata dentro del dia. Sin un orden total, dos paginas
      // seguidas pueden repetir o saltarse alistamientos de la misma fecha.
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta)
  );

  const salida = registros.map((f: Fila) => {
    const act = aplanarActividades(f.sicov_alistamiento_actividades, catalogo);
    // Campos en el orden del ejemplo de GESMOVIL. A un parser JSON le da igual,
    // pero asi su ejemplo y nuestra respuesta se comparan a ojo.
    return {
      alistamiento_id: f.id,
      // Solo la fecha, AAAA-MM-DD, del dia colombiano: asi la pidio GESMOVIL y
      // asi la trae el ejemplo del manual. Hasta la v2 iba con la hora.
      fechaAlistamiento: txt(f.fecha),
      placa: txt(f.placa),
      responsable: {
        tipoIdentificacion: Number(f.responsable_tipo_id),
        numeroIdentificacion: numeroId(f.responsable_num_id),
        nombre: txt(f.responsable_nombre),
      },
      conductor: {
        tipoIdentificacion: Number(f.conductor_tipo_id),
        numeroIdentificacion: numeroId(f.conductor_num_id),
        nombre: txt(f.conductor_nombre),
      },
      detalleActividades: act.lista,
      actividades: act.ids,
    };
  });

  return { data: salida };
}

/** Manual: "Exposicion de API para Consulta de Mantenimientos". */
async function endpointMantenimientos(
  db: ReturnType<typeof createClient>,
  rango: Rango,
  cfg: Config,
): Promise<RespuestaEndpoint> {
  // El manual exige nit y razonSocial en cada mantenimiento.
  const faltaCfg = faltaConfig(cfg, ["nit", "razon_social"]);
  if (faltaCfg) return { fallo: faltaCfg };

  const catalogo = await leerCatalogo(db);

  const registros = await leerTodo("sicov_mantenimientos", (desde, hasta) =>
    db
      .from("sicov_mantenimientos")
      .select(`
        id, placa, fecha, hora, tipo, detalle_libre,
        responsable_tipo_id, responsable_num_id, responsable_nombre,
        sicov_mantenimiento_actividades ( actividad_id )
      `)
      .gte("fecha", rango.inicio)
      .lte("fecha", rango.fin)
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta)
  );

  const salida = registros.map((f: Fila) => {
    const act = aplanarActividades(f.sicov_mantenimiento_actividades, catalogo);
    return {
      mantenimiento_id: f.id,
      fecha: txt(f.fecha),
      placa: txt(f.placa),
      hora: txt(f.hora),
      nit: cfg.nit,
      razonSocial: cfg.razon_social,
      tipoIdentificacion: Number(f.responsable_tipo_id),
      numeroIdentificacion: txt(f.responsable_num_id),
      nombresResponsable: txt(f.responsable_nombre),
      tipomantenimiento: Number(f.tipo),
      // Se prefiere el detalle armado con las descripciones del catalogo; el
      // texto libre solo entra si no se marco ninguna actividad.
      detalleActividades: act.detalle || txt(f.detalle_libre) || "",
    };
  });

  return { data: salida };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const MANEJADORES: Record<string, Manejador> = {
  alistamientos: endpointAlistamientos,
  mantenimientos: endpointMantenimientos,
};

Deno.serve(async (req) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  // La ruta llega como /sicov-gesmovil/<endpoint>
  const partes = url.pathname.split("/").filter(Boolean);
  const endpoint = partes[partes.length - 1] || "";

  let cliente: Cliente | null = null;

  try {
    if (req.method !== "GET") {
      // Sin registrar: no hay credencial validada todavia, y un metodo raro no
      // debe poder escribir en api_accesos.
      return error(405, "Metodo no permitido. Los endpoints son GET.");
    }

    const auth = await autenticar(req, db);

    if (auth.fallo) {
      // Se cuenta despues de fallar, no antes: el coste lo paga quien insiste.
      if ((await fallosRecientes(db, ipDe(req))) >= FALLOS_MAX_IP) {
        return error(429, "Demasiados intentos fallidos. Reintenta mas tarde.", { "Retry-After": "600" });
      }
      await registrarAcceso(db, null, req, endpoint, auth.fallo.status, null, null);
      return auth.fallo;
    }
    cliente = auth.cliente;

    // El catalogo va antes de leer el rango porque no depende de fechas: es
    // lo que GESMOVIL necesita para traducir los ids, y no tiene por que
    // inventar un rango para pedirlo.
    if (endpoint === "actividades") {
      const catalogo = await leerCatalogo(db);
      const respuesta = ok(catalogo);
      await registrarAcceso(db, cliente, req, endpoint, respuesta.status, null, catalogo.length);
      return respuesta;
    }

    const manejador = MANEJADORES[endpoint];
    if (!manejador) {
      await registrarAcceso(db, cliente, req, endpoint, 404, null, null);
      return error(
        404,
        "Endpoint no encontrado. Esta plataforma expone alistamientos, mantenimientos y actividades; despachos y llegadas no estan en su alcance.",
      );
    }

    const leido = leerRango(url);
    if ("mensaje" in leido) {
      await registrarAcceso(db, cliente, req, endpoint, 400, null, null);
      return error(400, leido.mensaje);
    }
    const { rango } = leido;

    const cfg = await leerConfig(db);
    const res = await manejador(db, rango, cfg);
    if (res.fallo) {
      await registrarAcceso(db, cliente, req, endpoint, res.fallo.status, rango.inicio, null);
      return res.fallo;
    }

    const respuesta = ok(res.data);
    await registrarAcceso(db, cliente, req, endpoint, respuesta.status, rango.inicio, res.data.length);
    return respuesta;
  } catch (e) {
    console.error("[sicov-gesmovil] fallo atendiendo", endpoint, e);
    await registrarAcceso(db, cliente, req, endpoint, 500, null, null);
    return error(500, "Error interno atendiendo la consulta.");
  }
});
