/**
 * Registro de mantenimientos -- requiere login
 * ---------------------------------------------------------------------------
 * El taller o el coordinador registra los mantenimientos EJECUTADOS. A
 * diferencia del alistamiento, esto si lleva usuario: un mantenimiento es la
 * afirmacion de que un trabajo se hizo, y el manual exige un responsable con
 * nombre y cedula. Un formulario anonimo no puede sostener eso.
 *
 * Se despliega con verify_jwt (el default), asi que Supabase rechaza lo que no
 * traiga un JWT valido antes de llegar aqui. Pero eso solo prueba que hay una
 * sesion del proyecto: quien puede registrar se comprueba ademas contra
 * sicov_usuarios, porque tener cuenta no es lo mismo que estar autorizado.
 *
 * Endpoints:
 *   GET  /sicov-mantenimiento/formulario   datos para pintar el formulario
 *   POST /sicov-mantenimiento/registrar    graba el mantenimiento
 *
 * Desplegar:
 *   supabase functions deploy sicov-mantenimiento
 *
 * Variables de entorno (las pone Supabase):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MAX_ACTIVIDADES = 200;

// Un mantenimiento se registra despues de hacerlo, pero no meses despues: mas
// atras que esto suele ser un error de digitacion del año.
const DIAS_ATRAS_MAX = 365;

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

function hoyCol(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function cedulaLimpia(valor: unknown): string | null {
  const s = txt(valor);
  if (!s) return null;
  const d = s.replace(/[^\d]/g, "");
  if (d.length < 6 || d.length > 11) return null;
  return d;
}

function placaLimpia(valor: unknown): string | null {
  const s = txt(valor);
  if (!s) return null;
  const p = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (p.length < 5 || p.length > 7) return null;
  return p;
}

/** Fecha AAAA-MM-DD que exista de verdad, no futura y no demasiado antigua. */
function fechaValida(valor: unknown): { fecha: string } | { mensaje: string } {
  const s = txt(valor);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { mensaje: "La fecha debe tener el formato AAAA-MM-DD." };
  }
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { mensaje: "La fecha no existe." };
  // Rechaza 2026-02-31, que Date normalizaria a marzo en silencio.
  if (d.toISOString().slice(0, 10) !== s) return { mensaje: "La fecha no existe." };

  const hoy = new Date(`${hoyCol()}T00:00:00Z`);
  if (d.getTime() > hoy.getTime()) return { mensaje: "La fecha no puede estar en el futuro." };
  if (Math.round((hoy.getTime() - d.getTime()) / 86_400_000) > DIAS_ATRAS_MAX) {
    return { mensaje: `La fecha no puede ser de mas de ${DIAS_ATRAS_MAX} dias atras.` };
  }
  return { fecha: s };
}

/** Hora HH:MM o HH:MM:SS -> HH:MM:SS, que es lo que espera el tipo time. */
function horaValida(valor: unknown): { hora: string } | { mensaje: string } {
  const s = txt(valor);
  if (!s) return { mensaje: "Indica la hora del mantenimiento." };
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return { mensaje: "La hora debe tener el formato HH:MM." };
  const h = Number(m[1]);
  const min = Number(m[2]);
  const seg = Number(m[3] ?? "0");
  if (h > 23 || min > 59 || seg > 59) return { mensaje: "La hora no es valida." };
  const dos = (n: number) => String(n).padStart(2, "0");
  return { hora: `${dos(h)}:${dos(min)}:${dos(seg)}` };
}

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------------
// Quien esta registrando
// ---------------------------------------------------------------------------
// verify_jwt ya garantiza que el JWT es valido. Aqui se resuelve a que persona
// corresponde y si esta autorizada: tener cuenta en el proyecto no autoriza a
// afirmar que un mantenimiento se ejecuto.

interface Usuario {
  user_id: string;
  nombre: string;
  cedula: string;
  rol: string;
}

async function quienEs(req: Request): Promise<{ usuario: Usuario } | { fallo: Response }> {
  const cabecera = req.headers.get("authorization") ?? "";
  const jwt = cabecera.toLowerCase().startsWith("bearer ") ? cabecera.slice(7).trim() : "";
  if (!jwt) return { fallo: malo("Falta la cabecera Authorization.", 401) };

  const { data: auth, error: errAuth } = await db.auth.getUser(jwt);
  if (errAuth || !auth?.user) return { fallo: malo("Sesion no valida.", 401) };

  const { data: fila } = await db
    .from("sicov_usuarios")
    .select("user_id, nombre, cedula, rol, activo")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!fila || fila.activo !== true) {
    return {
      fallo: malo("Tu usuario no esta autorizado para registrar mantenimientos.", 403),
    };
  }

  return {
    usuario: {
      user_id: String(fila.user_id),
      nombre: String(fila.nombre),
      cedula: String(fila.cedula),
      rol: String(fila.rol),
    },
  };
}

// ---------------------------------------------------------------------------
// GET /formulario
// ---------------------------------------------------------------------------

async function formulario(usuario: Usuario): Promise<Response> {
  const [vehiculos, actividades] = await Promise.all([
    db.from("flota_vehiculos").select("placa, interno, nombre_ruta").order("placa"),
    db.from("sicov_cat_actividades")
      .select("id, descripcion, grupo, orden")
      .eq("activa", true)
      .eq("aplica_mantenimiento", true)
      .order("orden", { ascending: true, nullsFirst: false })
      .order("id"),
  ]);

  const lista = (actividades.data || []) as Fila[];

  return json({
    success: true,
    usuario: { nombre: usuario.nombre, cedula: usuario.cedula, rol: usuario.rol },
    vehiculos: ((vehiculos.data || []) as Fila[]).map((v) => ({
      placa: txt(v.placa),
      interno: txt(v.interno),
      ruta: txt(v.nombre_ruta),
    })),
    actividades: lista.map((a) => ({
      id: Number(a.id),
      descripcion: txt(a.descripcion),
      grupo: txt(a.grupo),
    })),
    tipos: [
      { id: 1, nombre: "Preventivo" },
      { id: 2, nombre: "Correctivo" },
    ],
    // Sin catalogo no hay checklist. El mantenimiento admite detalle libre,
    // asi que el formulario puede funcionar igual, pero conviene avisarlo.
    catalogoVacio: lista.length === 0,
  });
}

// ---------------------------------------------------------------------------
// POST /registrar
// ---------------------------------------------------------------------------

async function registrar(req: Request, usuario: Usuario): Promise<Response> {
  let payload: Fila;
  try {
    payload = await req.json();
  } catch {
    return malo("Body JSON invalido.");
  }

  // --- Vehiculo ---
  const placa = placaLimpia(payload.placa);
  if (!placa) return malo("Indica la placa del vehiculo.");

  const { data: veh } = await db.from("flota_vehiculos").select("placa").eq("placa", placa).maybeSingle();
  if (!veh) return malo(`La placa ${placa} no esta registrada en la flota.`, 403);

  // --- Cuando ---
  const f = fechaValida(payload.fecha);
  if ("mensaje" in f) return malo(f.mensaje);
  const h = horaValida(payload.hora);
  if ("mensaje" in h) return malo(h.mensaje);

  // --- Tipo: 1 preventivo, 2 correctivo ---
  const tipo = Number(payload.tipo);
  if (tipo !== 1 && tipo !== 2) {
    return malo("El tipo de mantenimiento debe ser 1 (preventivo) o 2 (correctivo).");
  }

  // --- Responsable del trabajo ---
  // Por defecto es quien registra. Un coordinador o admin puede declarar a
  // otra persona (el mecanico que lo ejecuto); el rol taller no, para que no
  // se pueda atribuir un trabajo a un tercero cualquiera.
  let respCedula = usuario.cedula;
  let respNombre = usuario.nombre;

  const otraCedula = cedulaLimpia(payload.responsableCedula);
  const otroNombre = txt(payload.responsableNombre);
  if (otraCedula && otraCedula !== usuario.cedula) {
    if (usuario.rol !== "coordinador" && usuario.rol !== "admin") {
      return malo("Tu rol no permite registrar un mantenimiento a nombre de otra persona.", 403);
    }
    if (!otroNombre) return malo("Indica el nombre del responsable.");
    respCedula = otraCedula;
    respNombre = otroNombre;
  }

  // --- Actividades del catalogo oficial (opcionales aqui) ---
  // El manual pide 'detalleActividades' como texto para mantenimientos, no un
  // array de ids. Se permiten las dos vias: las oficiales si el catalogo las
  // cubre, y el texto libre para lo que no. Pero algo tiene que haber.
  const crudas = Array.isArray(payload.actividades) ? payload.actividades : [];
  const detalleLibre = txt(payload.detalleLibre);
  if (crudas.length === 0 && !detalleLibre) {
    return malo("Describe el mantenimiento: marca actividades del catalogo o escribe el detalle.");
  }
  if (crudas.length > MAX_ACTIVIDADES) return malo("Demasiadas actividades en un solo registro.");

  const pedidas = new Map<number, string | null>();
  for (const cruda of crudas) {
    const item = (typeof cruda === "object" && cruda !== null ? cruda : { id: cruda }) as Fila;
    const id = Number(item.id);
    if (!Number.isInteger(id)) return malo("Hay una actividad con id invalido.");
    pedidas.set(id, txt(item.observacion));
  }

  if (pedidas.size) {
    const ids = Array.from(pedidas.keys());
    const { data: validas } = await db
      .from("sicov_cat_actividades")
      .select("id")
      .in("id", ids)
      .eq("activa", true)
      .eq("aplica_mantenimiento", true);
    const idsValidos = new Set(((validas || []) as Fila[]).map((a) => Number(a.id)));
    const sobran = ids.filter((id) => !idsValidos.has(id));
    if (sobran.length) {
      return malo(`Estas actividades no existen en el catalogo oficial: ${sobran.join(", ")}.`);
    }
  }

  // --- Kilometraje ---
  let kilometraje: number | null = null;
  if (payload.kilometraje !== undefined && payload.kilometraje !== null && payload.kilometraje !== "") {
    const km = Number(payload.kilometraje);
    if (!Number.isFinite(km) || km < 0) return malo("El kilometraje no es valido.");
    kilometraje = Math.round(km);
  }

  // --- Insercion ---
  const { data: creado, error: errIns } = await db
    .from("sicov_mantenimientos")
    .insert({
      placa,
      fecha: f.fecha,
      hora: h.hora,
      tipo,
      responsable_tipo_id: 1,
      responsable_num_id: respCedula,
      responsable_nombre: respNombre,
      detalle_libre: detalleLibre,
      kilometraje,
      observaciones: txt(payload.observaciones),
      registrado_por: usuario.user_id,
    })
    .select("id")
    .single();

  if (errIns) {
    console.error("[sicov-mantenimiento] insert:", errIns.message);
    return malo("No se pudo guardar el mantenimiento.", 500);
  }

  const mantenimientoId = Number((creado as Fila).id);

  if (pedidas.size) {
    const { error: errAct } = await db.from("sicov_mantenimiento_actividades").insert(
      Array.from(pedidas, ([actividad_id, observacion]) => ({
        mantenimiento_id: mantenimientoId,
        actividad_id,
        observacion,
      })),
    );
    if (errAct) {
      // Se deshace: un mantenimiento cuyas actividades no entraron reportaria
      // un detalle incompleto, y es preferible que el taller lo reintente.
      await db.from("sicov_mantenimientos").delete().eq("id", mantenimientoId);
      console.error("[sicov-mantenimiento] insert actividades:", errAct.message);
      return malo("No se pudieron guardar las actividades. Intenta de nuevo.", 500);
    }
  }

  return json(
    {
      success: true,
      message: "Mantenimiento registrado.",
      mantenimiento: { id: mantenimientoId, placa, fecha: f.fecha, hora: h.hora, tipo },
    },
    201,
  );
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
    const quien = await quienEs(req);
    if ("fallo" in quien) return quien.fallo;

    if (req.method === "GET" && accion === "formulario") return await formulario(quien.usuario);
    if (req.method === "POST" && accion === "registrar") return await registrar(req, quien.usuario);

    return malo("Ruta no encontrada. Disponibles: GET /formulario, POST /registrar.", 404);
  } catch (e) {
    console.error("[sicov-mantenimiento] fallo atendiendo", accion, e);
    return malo("Error interno.", 500);
  }
});
