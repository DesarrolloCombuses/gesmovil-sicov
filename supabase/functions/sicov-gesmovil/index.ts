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
 * Endpoints (GET, solo lectura, rango de fechas obligatorio):
 *
 *   GET /alistamientos?fechaInicio=AAAA-MM-DD&fechaFin=AAAA-MM-DD
 *   GET /mantenimientos?fechaInicio=AAAA-MM-DD&fechaFin=AAAA-MM-DD
 *
 * Autenticacion: cabecera  X-API-Key: <key>
 *
 * Decisiones deliberadas:
 *
 *   - NO se habilita CORS. Esto es servidor-a-servidor. Si se pudiera llamar
 *     desde un navegador, la API key acabaria dentro de un frontend a la vista
 *     de cualquiera. Que el navegador lo bloquee es la intencion.
 *
 *   - Las actividades salen SIEMPRE con su id OFICIAL de la Supertransporte,
 *     nunca con el id interno de COMBUSES. El formulario usa el checklist
 *     propio (ids desde 1000) y la traduccion se aplica aqui, al leer, contra
 *     sicov_homolog_actividades.
 *
 *   - Si alguna actividad activa del checklist no tiene traduccion, la
 *     respuesta es 503 y no entrega nada. Es todo o nada: un reporte con seis
 *     de treinta puntos se ve valido y no se nota hasta una auditoria. El
 *     mensaje del 503 nombra las que faltan.
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

const VERSION = "v1";

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
 * Hora HH:MM:SS del dia colombiano de un timestamptz.
 * Se convierte a America/Bogota y no se deja en UTC: la hora que el reporte
 * debe llevar es la de la operacion, no la del servidor.
 */
function horaDe(iso: unknown): string {
  const s = txt(iso);
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
// Homologacion: lo nuestro -> lo oficial
// ---------------------------------------------------------------------------
// Los registros guardan las actividades de COMBUSES (ids desde 1000). Lo que
// el reporte debe llevar son los ids OFICIALES de la Supertransporte, asi que
// se traducen aqui, al leer.
//
// Traducir al leer y no al guardar es lo que permite que un alistamiento
// registrado antes de tener el mapeo se pueda reportar despues, sin tocar el
// registro: el dia que se cargue la homologacion, el historico entero queda
// reportable.

interface Oficial {
  id: number;
  descripcion: string;
}

/** actividad propia -> las oficiales que la cubren */
type MapaHomolog = Map<number, Oficial[]>;

async function leerHomologacion(db: ReturnType<typeof createClient>): Promise<MapaHomolog> {
  const { data, error: errDb } = await db
    .from("sicov_homolog_actividades")
    .select("actividad_id, sicov_cat_actividades_oficiales ( id, descripcion )");

  if (errDb) throw new Error(`sicov_homolog_actividades: ${errDb.message}`);

  const mapa: MapaHomolog = new Map();
  for (const fila of (data || []) as Fila[]) {
    const propia = Number(fila.actividad_id);
    const oficial = fila.sicov_cat_actividades_oficiales as Fila | null;
    if (!Number.isInteger(propia) || !oficial) continue;

    const lista = mapa.get(propia) ?? [];
    lista.push({ id: Number(oficial.id), descripcion: String(oficial.descripcion) });
    mapa.set(propia, lista);
  }
  return mapa;
}

/**
 * Ids de actividad que aparecen en estos registros y no tienen traduccion.
 *
 * Se comprueba contra LOS REGISTROS CONSULTADOS y no contra el catalogo
 * completo. Al principio era al contrario, y era peor por dos razones:
 *
 *   - Imprecisa. Un hueco en cualquier punto del checklist bloqueaba rangos de
 *     fechas cuyos registros si eran traducibles por entero.
 *
 *   - Y sobre todo, inutil para arrancar. Sin el catalogo oficial completo no
 *     habia forma de que la API devolviera un 200 ni una vez, asi que GESMOVIL
 *     no podia probar su cliente contra una respuesta real.
 *
 * Lo que no cambia es que sigue siendo todo o nada por registro: si una sola
 * actividad de un alistamiento no se puede traducir, ese alistamiento no sale.
 * Entregarlo con las demas diria que se verificaron dos puntos cuando fueron
 * cuarenta, y eso no se nota hasta una auditoria.
 */
function actividadesSinMapeo(registros: Fila[], campo: string, homolog: MapaHomolog): number[] {
  const faltan = new Set<number>();
  for (const registro of registros) {
    const crudas = registro[campo];
    for (const fila of Array.isArray(crudas) ? (crudas as Fila[]) : []) {
      const id = Number(fila.actividad_id);
      if (Number.isInteger(id) && !homolog.has(id)) faltan.add(id);
    }
  }
  return [...faltan].sort((a, b) => a - b);
}

/** 503 nombrando las actividades que faltan, para que se arregle el mismo dia. */
async function errorSinHomologar(
  db: ReturnType<typeof createClient>,
  ids: number[],
): Promise<Response> {
  // Se piden las descripciones: un mensaje con "1002, 1003, 1014" obliga a
  // consultar la base para saber de que actividades habla.
  const { data } = await db.from("sicov_cat_actividades").select("descripcion").in("id", ids);
  const nombres = ((data || []) as Fila[]).map((f) => txt(f.descripcion)).filter(Boolean) as string[];

  const ejemplos = nombres.slice(0, 3).join("; ");
  const resto = nombres.length > 3 ? ` y ${nombres.length - 3} mas` : "";

  return error(
    503,
    // "los registros" y no "los alistamientos": el mismo mensaje lo usan los
    // dos endpoints, y desde /mantenimientos hablar de alistamientos hace
    // dudar de si se consulto lo que se queria.
    `Los registros de este rango incluyen ${ids.length} actividad(es) sin homologar con el ` +
      `catalogo oficial de la Superintendencia (${ejemplos}${resto}). Los registros se estan ` +
      `capturando, pero no se pueden reportar hasta completar la homologacion.`,
  );
}

interface Actividades {
  ids: number[];
  detalle: string;
}

/**
 * Traduce las actividades de un registro a los dos campos del manual, usando
 * el mapa de homologacion. Varias actividades nuestras pueden caer en la misma
 * oficial (por eso se deduplica) y una nuestra puede cubrir varias.
 */
function aplanarActividades(crudas: unknown, homolog: MapaHomolog): Actividades {
  const ids: number[] = [];
  const detalle: string[] = [];

  for (const fila of Array.isArray(crudas) ? (crudas as Fila[]) : []) {
    const propia = Number(fila.actividad_id);
    if (!Number.isInteger(propia)) continue;

    for (const oficial of homolog.get(propia) ?? []) {
      if (ids.includes(oficial.id)) continue;
      ids.push(oficial.id);
      detalle.push(oficial.descripcion);
    }
  }

  return { ids, detalle: detalle.join(", ") };
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
  const homolog = await leerHomologacion(db);

  const { data, error: errDb } = await db
    .from("sicov_alistamientos")
    .select(`
      id, placa, fecha, registrado_en,
      responsable_tipo_id, responsable_num_id, responsable_nombre,
      conductor_tipo_id, conductor_num_id, conductor_nombre,
      sicov_alistamiento_actividades ( actividad_id )
    `)
    .gte("fecha", rango.inicio)
    .lte("fecha", rango.fin)
    .order("fecha", { ascending: true });

  if (errDb) throw new Error(`sicov_alistamientos: ${errDb.message}`);

  const registros = (data || []) as Fila[];

  const sinMapeo = actividadesSinMapeo(registros, "sicov_alistamiento_actividades", homolog);
  if (sinMapeo.length > 0) return { fallo: await errorSinHomologar(db, sinMapeo) };

  const salida = registros.map((f: Fila) => {
    const act = aplanarActividades(f.sicov_alistamiento_actividades, homolog);
    return {
      alistamiento_id: f.id,
      placa: txt(f.placa),
      // El manual describe fechaAlistamiento como fecha y hora, y su ejemplo
      // trae solo fecha. Se manda fecha y hora: es mas informacion, cabe en el
      // formato del ejemplo, y la hora real esta en registrado_en.
      fechaAlistamiento: `${txt(f.fecha)} ${horaDe(f.registrado_en)}`.trim(),
      responsable: {
        tipoIdentificacion: Number(f.responsable_tipo_id),
        numeroIdentificacion: txt(f.responsable_num_id),
        nombre: txt(f.responsable_nombre),
      },
      conductor: {
        tipoIdentificacion: Number(f.conductor_tipo_id),
        numeroIdentificacion: txt(f.conductor_num_id),
        nombre: txt(f.conductor_nombre),
      },
      detalleActividades: act.detalle,
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

  const homolog = await leerHomologacion(db);

  const { data, error: errDb } = await db
    .from("sicov_mantenimientos")
    .select(`
      id, placa, fecha, hora, tipo, detalle_libre,
      responsable_tipo_id, responsable_num_id, responsable_nombre,
      sicov_mantenimiento_actividades ( actividad_id )
    `)
    .gte("fecha", rango.inicio)
    .lte("fecha", rango.fin)
    .order("fecha", { ascending: true });

  if (errDb) throw new Error(`sicov_mantenimientos: ${errDb.message}`);

  const registros = (data || []) as Fila[];

  // Un mantenimiento puede no llevar ninguna actividad del catalogo, porque
  // admite detalle libre. Pero si lleva alguna sin homologar, saldria con el
  // detalle recortado -- y un detalle recortado no se distingue de uno bien
  // descrito. Se corta.
  const sinMapeo = actividadesSinMapeo(registros, "sicov_mantenimiento_actividades", homolog);
  if (sinMapeo.length > 0) return { fallo: await errorSinHomologar(db, sinMapeo) };

  const salida = registros.map((f: Fila) => {
    const act = aplanarActividades(f.sicov_mantenimiento_actividades, homolog);
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
      // Se prefiere el detalle armado con las descripciones oficiales; el
      // texto libre solo entra si no se marco ninguna actividad del catalogo.
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

    const manejador = MANEJADORES[endpoint];
    if (!manejador) {
      await registrarAcceso(db, cliente, req, endpoint, 404, null, null);
      return error(
        404,
        "Endpoint no encontrado. Esta plataforma expone alistamientos y mantenimientos; despachos y llegadas no estan en su alcance.",
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
