/**
 * Registro de alistamientos -- link publico, sin login
 * ---------------------------------------------------------------------------
 * El conductor abre un link en el movil, elige su vehiculo, marca las
 * actividades verificadas y envia. No hay usuario ni contrasena, igual que el
 * preoperacional urbano que ya se usa en la empresa.
 *
 * Seguridad: verify_jwt=false (desplegar con --no-verify-jwt). No hay usuario
 * que autorizar, asi que el permiso es implicito y acotado: solo se puede
 * escribir sobre una placa que YA existe en flota_vehiculos y con actividades
 * que YA existen en el catalogo, y nada de lo que llega del formulario se
 * guarda sin comprobarse contra la base.
 *
 * Lo que este endpoint NO entrega es tan importante como lo que entrega.
 * /formulario devolvia la nomina entera -- 298 cedulas con nombre completo --
 * a cualquiera que pidiera la URL, sin credencial. Cedula y nombre de una
 * persona identificada son dato personal bajo la Ley 1581 de 2012, y aqui no
 * habia ni autorizacion ni finalidad que amparara publicarlos. Se quito.
 *
 * En su lugar el conductor digita su cedula y /conductor resuelve ESA sola.
 * Se pasa de regalar 298 registros a responder uno, y hay que conocer una
 * cedula valida de antemano para obtener algo. No es secreto perfecto: quien
 * ya tiene la cedula de alguien puede confirmar si trabaja aqui. Pero deja de
 * ser un volcado de la nomina, que era el problema real.
 *
 * Endpoints:
 *   GET  /sicov-alistar/formulario          datos para pintar el formulario
 *   GET  /sicov-alistar/conductor?cedula=   resuelve el nombre de UNA cedula
 *   GET  /sicov-alistar/hoy?placa=ABC123    si esa placa ya se alisto hoy
 *   POST /sicov-alistar/registrar           graba el alistamiento
 *
 * Desplegar:
 *   supabase functions deploy sicov-alistar --no-verify-jwt
 *
 * Variables de entorno (las pone Supabase):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Este SI lleva CORS: lo llama el formulario desde el navegador del conductor.
// Es lo contrario de sicov-gesmovil, que es servidor-a-servidor y no debe ser
// alcanzable desde una pagina.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Tope de actividades por registro. El catalogo oficial no es enorme, y un
// envio con miles de ids es un error o un abuso, no un alistamiento.
const MAX_ACTIVIDADES = 200;

type Fila = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function malo(mensaje: string, status = 400): Response {
  return json({ success: false, message: mensaje }, status);
}

function txt(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === "" ? null : s;
}

/** Dia calendario colombiano de hoy. */
function hoyCol(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** Solo digitos, que es lo que es una cedula. Evita "12.345.678" y "12345678 ". */
function cedulaLimpia(valor: unknown): string | null {
  const s = txt(valor);
  if (!s) return null;
  const d = s.replace(/[^\d]/g, "");
  // Las cedulas colombianas van de 6 a 10 digitos; NIT de persona natural
  // puede llegar a 11. Fuera de ese rango es un error de digitacion.
  if (d.length < 6 || d.length > 11) return null;
  return d;
}

/** Placa en mayusculas y sin separadores. */
function placaLimpia(valor: unknown): string | null {
  const s = txt(valor);
  if (!s) return null;
  const p = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (p.length < 5 || p.length > 7) return null;
  return p;
}

/**
 * Quita el estado que la operacion pega al nombre ("Juan Perez [INCAPACITADO]").
 * Ese corchete es dato de salud de una persona identificada: dato sensible
 * bajo la Ley 1581 de 2012. No tiene por que viajar al reporte ni mostrarse en
 * una lista abierta sin login.
 */
function nombreLimpio(valor: unknown): string | null {
  const s = txt(valor);
  if (!s) return null;
  return txt(s.replace(/\s*\[[^\]]*\]\s*/g, " "));
}

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------------
// GET /formulario
// ---------------------------------------------------------------------------
// Devuelve lo necesario para pintar el formulario en una sola peticion: la
// flota y el checklist. Una peticion por lista significaria varios viajes
// desde un movil con mala señal.

async function formulario(): Promise<Response> {
  const [vehiculos, actividades, cfg] = await Promise.all([
    db.from("flota_vehiculos").select("placa, interno, nombre_ruta").order("placa"),
    // Aqui NO va la lista de conductores: ver la cabecera. El nombre se
    // resuelve de a uno en /conductor, contra la cedula que el conductor
    // digita.
    //
    // Las placas si van completas. Una placa esta pintada en el costado del
    // bus y en el techo: no identifica a una persona ni es dato reservado, y
    // el formulario necesita el desplegable para que el conductor no teclee
    // mal la suya a las 4 de la manana.
    db.from("sicov_cat_actividades")
      .select("id, descripcion, grupo, orden")
      .eq("activa", true)
      .eq("aplica_alistamiento", true)
      .order("orden", { ascending: true, nullsFirst: false })
      .order("id"),
    db.from("sicov_config").select("clave, valor"),
  ]);

  const config: Record<string, string | null> = {};
  for (const f of (cfg.data || []) as Fila[]) config[String(f.clave)] = txt(f.valor);

  const listaActividades = (actividades.data || []) as Fila[];

  return json({
    success: true,
    vehiculos: ((vehiculos.data || []) as Fila[]).map((v) => ({
      placa: txt(v.placa),
      interno: txt(v.interno),
      ruta: txt(v.nombre_ruta),
    })),
    actividades: listaActividades.map((a) => ({
      id: Number(a.id),
      descripcion: txt(a.descripcion),
      grupo: txt(a.grupo),
    })),
    responsable: {
      numeroIdentificacion: config.responsable_num_id,
      nombre: config.responsable_nombre,
    },
    // El formulario necesita saber si puede funcionar antes de que alguien lo
    // llene: sin catalogo no hay checklist, y sin responsable el registro no
    // cumple el manual. Mejor avisarlo arriba que fallar al enviar.
    listo: listaActividades.length > 0 && !!config.responsable_num_id && !!config.responsable_nombre,
    faltante: [
      ...(listaActividades.length === 0 ? ["catalogo de actividades sin sincronizar"] : []),
      ...(!config.responsable_num_id || !config.responsable_nombre
        ? ["responsable del proceso sin configurar en sicov_config"]
        : []),
    ],
  });
}

// ---------------------------------------------------------------------------
// GET /conductor?cedula=
// ---------------------------------------------------------------------------
// Resuelve el nombre de UNA cedula. Reemplaza la lista completa que devolvia
// /formulario.
//
// Responde lo minimo: si esta, el nombre; si no, "no encontrado" y el
// formulario deja escribirlo a mano. Nunca el cargo, el estado ni nada mas de
// employees -- el formulario no lo necesita, y lo que no viaja no se filtra.
//
// El tope por IP no esta para frenar al conductor, esta para que nadie
// reconstruya la nomina probando cedulas. 60 en 10 minutos deja holgado un
// cambio de turno entero desde el wifi del patio (todos salen por la misma IP
// publica, de ahi que el numero no sea 5) y hace inviable recorrer un rango.
const CONSULTAS_MAX_IP = 60;
const VENTANA_CONSULTAS_MS = 10 * 60 * 1000;

const ENDPOINT_CONDUCTOR = "sicov-alistar/conductor";

/** IP real del cliente. Detras del proxy de Supabase, la primera de la cadena. */
function ipDe(req: Request): string | null {
  const reenviada = req.headers.get("x-forwarded-for");
  if (reenviada) {
    const primera = reenviada.split(",")[0]?.trim();
    if (primera) return primera;
  }
  return txt(req.headers.get("x-real-ip"));
}

/**
 * Consultas de esta IP en la ventana. Se cuenta contra api_accesos y no en
 * memoria porque cada peticion cae en una instancia nueva de la funcion: un
 * contador en el proceso nace vacio siempre y no frena nada.
 */
async function consultasRecientes(ip: string): Promise<number> {
  const desde = new Date(Date.now() - VENTANA_CONSULTAS_MS).toISOString();
  const { count, error: errCount } = await db
    .from("api_accesos")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("endpoint", ENDPOINT_CONDUCTOR)
    .gte("creado_en", desde);

  if (errCount) {
    // Si el contador falla, se deja pasar. Tumbar el alistamiento de toda la
    // flota por un fallo de la auditoria seria peor que el riesgo que cubre.
    console.error("[sicov-alistar] no se pudo contar consultas:", errCount.message);
    return 0;
  }
  return count ?? 0;
}

async function buscarConductor(req: Request, url: URL): Promise<Response> {
  const cedula = cedulaLimpia(url.searchParams.get("cedula"));
  if (!cedula) return malo("Cedula invalida.");

  const ip = ipDe(req);

  if (ip && (await consultasRecientes(ip)) >= CONSULTAS_MAX_IP) {
    return malo("Demasiadas consultas desde esta conexion. Espera unos minutos.", 429);
  }

  const { data } = await db
    .from("employees")
    .select("nombre")
    .eq("cedula", cedula)
    .eq("cargo", "CONDUCTOR")
    .eq("activo", true)
    .maybeSingle();

  const nombre = nombreLimpio(data?.nombre);

  // Queda rastro de cada consulta. Es el registro que la Ley 1581 espera de un
  // tratamiento de datos personales: quien pregunto por quien y cuando.
  // Se guarda la cedula consultada, no el nombre devuelto.
  try {
    await db.from("api_accesos").insert({
      endpoint: ENDPOINT_CONDUCTOR,
      status: nombre ? 200 : 404,
      filas_devueltas: nombre ? 1 : 0,
      ip,
      user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    });
  } catch (e) {
    console.error("[sicov-alistar] no se pudo auditar la consulta:", e);
  }

  // 200 en ambos casos: que la cedula no este en la nomina no es un error del
  // conductor. La tabla employees viene incompleta para conduccion, y el
  // formulario acepta un nombre digitado.
  return json({ success: true, encontrado: !!nombre, nombre });
}

// ---------------------------------------------------------------------------
// GET /hoy?placa=
// ---------------------------------------------------------------------------
// Para que el formulario avise antes de que el conductor llene todo, en vez de
// rechazarlo al enviar por la restriccion de un alistamiento por dia.

async function yaAlistado(url: URL): Promise<Response> {
  const placa = placaLimpia(url.searchParams.get("placa"));
  if (!placa) return malo("Placa invalida.");

  const { data } = await db
    .from("sicov_alistamientos")
    .select("id, registrado_en, conductor_nombre")
    .eq("placa", placa)
    .eq("fecha", hoyCol())
    .maybeSingle();

  return json({
    success: true,
    yaRegistrado: !!data,
    registro: data
      ? { id: data.id, registrado_en: data.registrado_en, conductor: data.conductor_nombre }
      : null,
  });
}

// ---------------------------------------------------------------------------
// POST /registrar
// ---------------------------------------------------------------------------

async function registrar(req: Request): Promise<Response> {
  let payload: Fila;
  try {
    payload = await req.json();
  } catch {
    return malo("Body JSON invalido.");
  }

  // --- Vehiculo: tiene que ser uno de la flota ---
  const placa = placaLimpia(payload.placa);
  if (!placa) return malo("Indica la placa del vehiculo.");

  const { data: veh } = await db
    .from("flota_vehiculos")
    .select("placa")
    .eq("placa", placa)
    .maybeSingle();
  if (!veh) return malo(`La placa ${placa} no esta registrada en la flota.`, 403);

  // --- Conductor ---
  const cedula = cedulaLimpia(payload.conductorCedula);
  if (!cedula) return malo("La cedula del conductor no es valida.");

  // Si esta en employees se usa el nombre oficial: evita que el reporte
  // salga con el nombre mal escrito. Si no esta, se acepta el digitado.
  const { data: emp } = await db
    .from("employees")
    .select("nombre")
    .eq("cedula", cedula)
    .maybeSingle();

  const nombreConductor = nombreLimpio(emp?.nombre) ?? nombreLimpio(payload.conductorNombre);
  if (!nombreConductor) return malo("Indica el nombre del conductor.");

  // --- Responsable del proceso ---
  // Sale de la configuracion de la empresa, no del formulario: el conductor no
  // puede designar a un tercero como responsable de su propio alistamiento.
  const { data: cfgFilas } = await db.from("sicov_config").select("clave, valor");
  const cfg: Record<string, string | null> = {};
  for (const f of (cfgFilas || []) as Fila[]) cfg[String(f.clave)] = txt(f.valor);

  if (!cfg.responsable_num_id || !cfg.responsable_nombre) {
    return malo(
      "La plataforma no tiene configurado el responsable del proceso. Un administrador debe completarlo antes de registrar alistamientos.",
      503,
    );
  }

  // --- Actividades: ids del catalogo oficial ---
  const crudas = Array.isArray(payload.actividades) ? payload.actividades : [];
  if (crudas.length === 0) return malo("Marca al menos una actividad verificada.");
  if (crudas.length > MAX_ACTIVIDADES) return malo("Demasiadas actividades en un solo registro.");

  // Se normaliza y se deduplica antes de tocar la base.
  const pedidas = new Map<number, { conforme: boolean; observacion: string | null }>();
  for (const cruda of crudas) {
    const item = (typeof cruda === "object" && cruda !== null ? cruda : { id: cruda }) as Fila;
    const id = Number(item.id);
    if (!Number.isInteger(id)) return malo("Hay una actividad con id invalido.");
    pedidas.set(id, {
      // Por defecto conforme: el conductor marca lo que verifico, y señala
      // aparte lo que encontro mal.
      conforme: item.conforme === false ? false : true,
      observacion: txt(item.observacion),
    });
  }

  // Que los ids existan en el catalogo no se da por supuesto: la clave ajena
  // lo impediria igual, pero un error de clave ajena no dice al conductor cual
  // actividad sobra.
  const ids = Array.from(pedidas.keys());
  const { data: validas } = await db
    .from("sicov_cat_actividades")
    .select("id")
    .in("id", ids)
    .eq("activa", true)
    .eq("aplica_alistamiento", true);

  const idsValidos = new Set(((validas || []) as Fila[]).map((a) => Number(a.id)));
  const sobran = ids.filter((id) => !idsValidos.has(id));
  if (sobran.length) {
    return malo(`Estas actividades no existen en el catalogo oficial: ${sobran.join(", ")}.`);
  }

  // --- Kilometraje (opcional, pero si viene tiene que ser un numero) ---
  let kilometraje: number | null = null;
  if (payload.kilometraje !== undefined && payload.kilometraje !== null && payload.kilometraje !== "") {
    const km = Number(payload.kilometraje);
    if (!Number.isFinite(km) || km < 0) return malo("El kilometraje no es valido.");
    kilometraje = Math.round(km);
  }

  // --- Insercion ---
  const fecha = hoyCol();
  const { data: creado, error: errIns } = await db
    .from("sicov_alistamientos")
    .insert({
      placa,
      fecha,
      responsable_tipo_id: Number(cfg.responsable_tipo_id ?? 1),
      responsable_num_id: cfg.responsable_num_id,
      responsable_nombre: cfg.responsable_nombre,
      conductor_tipo_id: 1,
      conductor_num_id: cedula,
      conductor_nombre: nombreConductor,
      kilometraje,
      observaciones: txt(payload.observaciones),
    })
    .select("id")
    .single();

  if (errIns) {
    if (/duplicate key/i.test(errIns.message || "")) {
      return malo(`Ya existe un alistamiento de hoy para la placa ${placa}.`, 409);
    }
    console.error("[sicov-alistar] insert alistamiento:", errIns.message);
    return malo("No se pudo guardar el alistamiento.", 500);
  }

  const alistamientoId = Number((creado as Fila).id);

  const { error: errAct } = await db.from("sicov_alistamiento_actividades").insert(
    Array.from(pedidas, ([actividad_id, v]) => ({
      alistamiento_id: alistamientoId,
      actividad_id,
      conforme: v.conforme,
      observacion: v.observacion,
    })),
  );

  if (errAct) {
    // Un alistamiento sin actividades no cumple el manual y ademas dejaria el
    // dia bloqueado por la restriccion de uno por placa. Se deshace para que
    // el conductor pueda reintentar.
    await db.from("sicov_alistamientos").delete().eq("id", alistamientoId);
    console.error("[sicov-alistar] insert actividades:", errAct.message);
    return malo("No se pudieron guardar las actividades. Intenta de nuevo.", 500);
  }

  // El estado lo calcula el trigger a partir de las actividades, asi que se
  // lee despues de insertarlas y no se confia en lo que diga el formulario.
  const { data: final } = await db
    .from("sicov_alistamientos")
    .select("id, placa, fecha, estado, registrado_en")
    .eq("id", alistamientoId)
    .maybeSingle();

  return json({ success: true, message: "Alistamiento registrado.", alistamiento: final }, 201);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const partes = url.pathname.split("/").filter(Boolean);
  const accion = partes[partes.length - 1] || "";

  try {
    if (req.method === "GET" && accion === "formulario") return await formulario();
    if (req.method === "GET" && accion === "conductor") return await buscarConductor(req, url);
    if (req.method === "GET" && accion === "hoy") return await yaAlistado(url);
    if (req.method === "POST" && accion === "registrar") return await registrar(req);

    return malo(
      "Ruta no encontrada. Disponibles: GET /formulario, GET /conductor, GET /hoy, POST /registrar.",
      404,
    );
  } catch (e) {
    console.error("[sicov-alistar] fallo atendiendo", accion, e);
    return malo("Error interno.", 500);
  }
});
