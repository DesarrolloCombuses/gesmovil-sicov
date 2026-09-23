-- ---------------------------------------------------------------------------
-- Auditoria: como esta consumiendo GESMOVIL la API
-- ---------------------------------------------------------------------------
-- Copiar entero, pegar en el SQL Editor de Supabase y darle Run.
--
-- Responde la pregunta "ya consumieron?" sin depender de los registros: un
-- alistamiento no guarda ninguna marca de haber sido leido. Lo que si queda
-- es la peticion, en api_accesos, y esa tabla sobrevive a la limpieza de los
-- datos de prueba.
--
-- OJO CON QUIEN APARECE
--
-- La credencial sicov_8a5a54fd es la misma que usamos nosotros para probar
-- con curl, asi que en el log conviven las dos cosas. Se distinguen por 'ip'
-- y por 'user_agent': las nuestras salen de la IP de COMBUSES y con curl.
-- Por eso al documento de integracion se le pidio a GESMOVIL su IP.
-- ---------------------------------------------------------------------------


-- 1. Resumen por dia. Para ver de un vistazo si hubo actividad y como les fue.

select
  date(a.creado_en at time zone 'America/Bogota') as dia,
  a.endpoint,
  a.status,
  count(*)                as llamadas,
  sum(a.filas_devueltas)  as filas_entregadas,
  count(distinct a.ip)    as ips
from api_accesos a
where a.key_prefijo = 'sicov_8a5a54fd'
group by 1, 2, 3
order by 1 desc, 2, 3;


-- 2. Quien llamo, desde donde y con que cliente HTTP.
--    Sirve para separar nuestras pruebas de las de GESMOVIL.

select
  a.ip,
  coalesce(a.user_agent, '(sin user-agent)') as cliente_http,
  count(*)                                                as llamadas,
  min(a.creado_en at time zone 'America/Bogota')           as primera,
  max(a.creado_en at time zone 'America/Bogota')           as ultima
from api_accesos a
where a.key_prefijo = 'sicov_8a5a54fd'
group by 1, 2
order by ultima desc;


-- 3. El detalle, peticion por peticion, la mas reciente primero.
--    'fecha_consultada' es el rango que pidieron, no el dia de la llamada.

select
  a.creado_en at time zone 'America/Bogota' as cuando,
  a.endpoint,
  a.fecha_consultada                        as rango_pedido,
  a.status,
  a.filas_devueltas,
  a.ip
from api_accesos a
where a.key_prefijo = 'sicov_8a5a54fd'
order by a.creado_en desc
limit 100;


-- 4. Ultimo acceso registrado sobre la credencial.
--    Si 'ultimo_acceso' es null, esa credencial no se ha usado nunca.

select
  nombre,
  key_prefijo,
  ultimo_acceso at time zone 'America/Bogota' as ultimo_acceso_colombia,
  expira_en     at time zone 'America/Bogota' as expira_colombia,
  limite_hora,
  activo
from api_clientes
where key_prefijo = 'sicov_8a5a54fd';
