/**
 * Trae el catalogo OFICIAL de actividades de la Supertransporte
 * ---------------------------------------------------------------------------
 * Llena sicov_cat_actividades_oficiales, que es el lado derecho de la
 * homologacion: el checklist que llena el conductor es el de COMBUSES
 * (sicov_cat_actividades, ids desde 1000), y sicov_homolog_actividades traduce
 * de uno al otro al momento de reportar.
 *
 * Hasta que este catalogo exista y este mapeado, la API de GESMOVIL responde
 * 503 para /alistamientos: los registros se siguen capturando, pero no se
 * entregan con ids que la Supertransporte leeria como otra actividad.
 *
 * Los demas catalogos del manual (municipios, nivel de servicio, clase de
 * vehiculo) son de la API de despachos, que no esta en el alcance.
 *
 * Se despliega CON verify_jwt (el default), asi que solo se invoca con la
 * service_role key o un JWT del proyecto: no es un endpoint publico.
 *
 *   supabase functions deploy sicov-sync-catalogos
 *   curl -X POST "https://<ref>.supabase.co/functions/v1/sicov-sync-catalogos" \
 *        -H "Authorization: Bearer $SERVICE_ROLE_KEY"
 *
 * Variables de entorno:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (las pone Supabase)
 *   SUPERTRANSPORTE_TOKEN                     token de la maestra
 *   SUPERTRANSPORTE_URL_ACTIVIDADES           opcional, para cambiar la URL
 *
 * Estado del acceso, verificado el 21-sep-2026 contra el servicio real:
 *   - La cabecera es 'Authorization: Bearer'. Con 'token:' o 'x-token:'
 *     responde "Falta el token de autenticacion".
 *   - El token del manual NO sirve para esta maestra ("Error en el token");
 *     si sirve para nivelservicio y clase-vehiculo, que no necesitamos.
 *   - Ninguna variante del endpoint es publica: /api/v1 responde "Token
 *     invalido" y las demas rutas no existen.
 *
 * Como conseguir el catalogo sin esperar el token: el portal SINST-VIGIA 2
 * llama a esta misma maestra con la sesion del usuario. Entrando con las
 * credenciales de COMBUSES, en F12 -> Network -> listar-actividades esta el
 * JSON completo. Ver README.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TIMEOUT_MS = 20_000;

const URL_ACTIVIDADES =
  Deno.env.get("SUPERTRANSPORTE_URL_ACTIVIDADES")?.trim() ||
  "https://rutasback.supertransporte.gov.co/api/v2/mantenimiento/listar-actividades";

type Fila = Record<string, unknown>;

// Formas confirmadas contra los servicios de la Supertransporte: uno devuelve
// { array_data: [...] } y otro un array en la raiz. Difieren entre si, asi que
// la tolerancia no es precaucion teorica: ya hacen falta las dos ramas.
function extraerLista(cuerpo: unknown): Fila[] {
  if (Array.isArray(cuerpo)) return cuerpo as Fila[];
  if (cuerpo && typeof cuerpo === "object") {
    const obj = cuerpo as Fila;
    for (const clave of ["array_data", "data", "items", "result", "results", "value", "lista", "registros"]) {
      if (Array.isArray(obj[clave])) return obj[clave] as Fila[];
    }
  }
  return [];
}

/** Primer campo presente de entre varios nombres posibles, sin importar la capitalizacion. */
function primerCampo(fila: Fila, candidatos: string[]): string | null {
  for (const c of candidatos) {
    const clave = Object.keys(fila).find((k) => k.toLowerCase() === c.toLowerCase());
    if (!clave) continue;
    const v = fila[clave];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return null;
}

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const token = Deno.env.get("SUPERTRANSPORTE_TOKEN")?.trim();
  if (!token) {
    return json({ success: false, message: "Falta la variable SUPERTRANSPORTE_TOKEN." }, 503);
  }

  const ahora = new Date().toISOString();
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(URL_ACTIVIDADES, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: control.signal,
    });
    const texto = await resp.text();

    if (!resp.ok) {
      // Se devuelve el cuerpo del servicio recortado: cuando el token no vale,
      // el mensaje de la Supertransporte dice si falta o si es incorrecto, y
      // esa distincion es justo la que hay que leer.
      return json(
        {
          success: false,
          message: `La maestra respondio HTTP ${resp.status}.`,
          respuesta: texto.slice(0, 300),
        },
        502,
      );
    }

    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return json({ success: false, message: "La maestra no devolvio JSON.", respuesta: texto.slice(0, 200) }, 502);
    }

    const lista = extraerLista(cuerpo);
    if (lista.length === 0) {
      return json({ success: false, message: "La respuesta no trajo ninguna fila reconocible." }, 502);
    }

    const filas = lista
      .map((f, i) => {
        const id = primerCampo(f, ["id", "idActividad", "actividad_id", "codigo"]);
        const descripcion = primerCampo(f, ["descripcion", "description", "nombre", "detalle"]);
        if (!id || !descripcion) return null;
        const n = Number(id);
        // La PK es integer: un id no numerico no pertenece a este catalogo.
        if (!Number.isInteger(n)) return null;
        return {
          id: n,
          descripcion,
          grupo: primerCampo(f, ["grupo", "categoria", "seccion"]),
          // Se conserva el orden en que las publica la maestra: es el orden en
          // que el regulador las lista, y asi el formulario se parece a lo que
          // el inspector espera ver.
          orden: i + 1,
          activa: true,
          sincronizado_en: ahora,
        };
      })
      .filter(Boolean) as Fila[];

    if (filas.length === 0) {
      return json({ success: false, message: `Llegaron ${lista.length} filas pero ninguna tenia id y descripcion.` }, 502);
    }

    // upsert y no delete+insert: los registros de alistamiento apuntan a estos
    // ids por clave ajena, y borrar el catalogo para repoblarlo los tumbaria.
    const { error: errDb } = await db
      .from("sicov_cat_actividades_oficiales")
      .upsert(filas, { onConflict: "id" });

    if (errDb) {
      return json({ success: false, message: `No se pudo guardar: ${errDb.message}` }, 500);
    }

    // Lo que ya no viene en la maestra se desactiva, no se borra: los
    // alistamientos historicos ya lo referencian y su reporte debe seguir
    // siendo reproducible.
    const vigentes = filas.map((f) => Number(f.id));
    const { error: errBaja, count } = await db
      .from("sicov_cat_actividades_oficiales")
      .update({ activa: false }, { count: "exact" })
      .not("id", "in", `(${vigentes.join(",")})`)
      .eq("activa", true);

    if (errBaja) {
      console.error("[sicov-sync-catalogos] no se pudieron desactivar las retiradas:", errBaja.message);
    }

    return json({
      success: true,
      sincronizado_en: ahora,
      actividades_vigentes: filas.length,
      actividades_desactivadas: count ?? 0,
    });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    return json({ success: false, message: `Fallo consultando la maestra: ${msg}` }, 502);
  } finally {
    clearTimeout(reloj);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
