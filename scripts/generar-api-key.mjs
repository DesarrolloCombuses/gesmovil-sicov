#!/usr/bin/env node
/**
 * Genera una credencial para un consumidor de la API SICOV.
 *
 *   node scripts/generar-api-key.mjs "GESMOVIL S.A.S." [limite_hora] [dias_vigencia]
 *
 * Imprime dos cosas: la key en claro (para entregar al cliente) y el SQL de
 * alta (para ejecutar en el SQL editor de Supabase).
 *
 * La base guarda solo el SHA-256 de la key, nunca la key. Eso significa que
 * esta salida es la unica vez que existe en claro: si se pierde, no se
 * recupera, se genera otra. Es a proposito -- si nosotros pudieramos leerla,
 * tambien podria leerla cualquiera que entre a la base.
 *
 * La key en claro NO se escribe a ningun archivo: quedaria en el disco y en el
 * historial de git. Se copia de la terminal al gestor de contrasenas y se
 * entrega a GESMOVIL por un canal cifrado, no por correo en texto plano.
 */

import { randomBytes, createHash } from "node:crypto";

const nombre = process.argv[2];
const limiteHora = Number(process.argv[3] ?? 120);
const diasVigencia = Number(process.argv[4] ?? 365);

if (!nombre) {
  console.error('Uso: node scripts/generar-api-key.mjs "NOMBRE DEL CLIENTE" [limite_hora] [dias_vigencia]');
  process.exit(1);
}
if (!Number.isInteger(limiteHora) || limiteHora < 1) {
  console.error("limite_hora debe ser un entero positivo.");
  process.exit(1);
}
if (!Number.isInteger(diasVigencia) || diasVigencia < 1) {
  console.error("dias_vigencia debe ser un entero positivo.");
  process.exit(1);
}

// El prefijo va en claro en la base y en los registros de acceso: sirve para
// saber cual credencial se uso sin poder reconstruirla. El secreto son 32
// bytes de randomBytes (CSPRNG), no Math.random.
const prefijo = `sicov_${randomBytes(4).toString("hex")}`;
const secreto = randomBytes(32).toString("hex");
const key = `${prefijo}_${secreto}`;
const hash = createHash("sha256").update(key).digest("hex");

const expira = new Date(Date.now() + diasVigencia * 86_400_000).toISOString();

// Para el ejemplo de prueba: el mes en curso hasta hoy. La API rechaza un
// rango futuro, asi que no sirve usar la fecha de expiracion.
const hoy = new Date().toISOString().slice(0, 10);
const primeroDelMes = hoy.slice(0, 8) + "01";

// Comillas simples escapadas: un nombre con apostrofe romperia el SQL.
const nombreSql = nombre.replace(/'/g, "''");

console.log(`
================================================================
  CREDENCIAL PARA: ${nombre}
================================================================

  API Key (entregar al cliente, no se vuelve a mostrar):

      ${key}

  Prefijo (queda visible en api_accesos):  ${prefijo}
  Limite por hora:                         ${limiteHora}
  Expira:                                  ${expira.slice(0, 10)}

----------------------------------------------------------------
  SQL de alta -- ejecutar en el SQL editor de Supabase
----------------------------------------------------------------

insert into api_clientes
  (nombre, key_prefijo, key_hash, bases, apis, limite_hora, expira_en, activo)
values
  ('${nombreSql}',
   '${prefijo}',
   '${hash}',
   '{}',                      -- sin bases: api-externa le responde 403
   '{sicov}',                 -- alcance: solo la API SICOV
   ${limiteHora},
   '${expira}',
   true);

----------------------------------------------------------------
  Prueba, una vez ejecutado el SQL
----------------------------------------------------------------

curl -s "https://<project-ref>.supabase.co/functions/v1/sicov-gesmovil/alistamientos?fechaInicio=${primeroDelMes}&fechaFin=${hoy}" \\
     -H "X-API-Key: ${key}"

  Un 404 con "No se encontraron registros" tambien es exito: significa que la
  credencial sirve y no hay alistamientos en ese rango.

================================================================
`);
