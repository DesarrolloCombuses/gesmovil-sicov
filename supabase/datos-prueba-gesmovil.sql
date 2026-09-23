-- ---------------------------------------------------------------------------
-- Datos de prueba para que GESMOVIL pruebe su integracion
-- ---------------------------------------------------------------------------
-- Copiar entero, pegar en el SQL Editor de Supabase y darle Run.
--
-- QUE CARGA
--
-- 4 alistamientos y 2 mantenimientos en un rango de fechas reservado para
-- pruebas: del 1 al 4 de septiembre de 2026. La plataforma empezo a capturar
-- de verdad el 22 de septiembre, asi que TODO lo anterior a esa fecha es dato
-- de prueba por definicion. Eso es lo que hace que la limpieza sea segura y
-- verificable con una sola condicion.
--
-- POR QUE UN RANGO SEPARADO Y NO FECHAS RECIENTES
--
-- El contrato del manual no tiene ningun campo para marcar un registro como
-- prueba: GESMOVIL no puede distinguir uno de prueba de uno real. Si estos
-- registros quedaran mezclados con los de la operacion, se transmitirian a la
-- Superintendencia como alistamientos que nunca ocurrieron, y el sujeto
-- obligado que responde por eso es COMBUSES.
--
-- Con el rango separado, la regla para borrarlos es una sola:
-- fecha < 2026-09-22.
--
-- Ademas, cada registro lleva la marca REGISTRO DE PRUEBA en 'observaciones'.
-- Ese campo NO viaja en la respuesta de la API, asi que no altera lo que ve
-- GESMOVIL, pero permite encontrarlos aunque alguien les cambie la fecha.
--
-- LAS PLACAS Y LOS CONDUCTORES NO VAN ESCRITOS AQUI
--
-- Se toman de flota_vehiculos y de employees al ejecutar. Por dos razones: el
-- archivo no lleva cedulas ni nombres de personas identificadas -- dato
-- personal bajo la Ley 1581, que no tiene por que quedar en el historial de
-- git -- y el script sirve igual en cualquier entorno sin editarlo.
--
-- SOLO USAN LAS DOS ACTIVIDADES HOMOLOGADAS
--
-- Las unicas cuyo id oficial conocemos: 'Niveles de aceite de motor' y
-- 'Fugas del motor'. Por eso estos registros SI se pueden reportar y devuelven
-- 200, mientras los reales de 40 actividades siguen dando 503: el guardia
-- comprueba lo que traen los registros consultados, no el catalogo entero.
--
-- Un alistamiento real lleva las 40. Estos llevan 2. Para probar un parser da
-- igual, porque 'actividades' es un arreglo en los dos casos, pero conviene
-- saberlo al comparar.
--
-- BORRAR ANTES DE QUE GESMOVIL REPORTE DE VERDAD
--   supabase/limpiar-datos-prueba.sql
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Alistamientos
-- ---------------------------------------------------------------------------
-- Se emparejan las 4 primeras placas de la ruta AEROPUERTO (la que cubre el
-- SICOV) con los 4 primeros conductores activos de la nomina, por orden, para
-- que el resultado sea el mismo cada vez que se corra.

with placas as (
  select placa, row_number() over (order by placa) as n
    from flota_vehiculos
   where nombre_ruta = 'AEROPUERTO'
),
conductores as (
  select
    cedula,
    -- Se quita el estado que la operacion pega al nombre ("Juan Perez
    -- [INCAPACITADO]"): es dato de salud de una persona identificada y no
    -- tiene por que viajar a un reporte del regulador.
    trim(regexp_replace(nombre, '\s*\[[^\]]*\]\s*', ' ', 'g')) as nombre,
    row_number() over (order by cedula) as n
  from employees
  where cargo = 'CONDUCTOR' and activo = true
),
responsable as (
  select
    max(valor) filter (where clave = 'responsable_num_id') as num_id,
    max(valor) filter (where clave = 'responsable_nombre') as nombre
  from sicov_config
),
plan as (
  select
    p.placa,
    ('2026-09-0' || d.n)::date as fecha,
    -- El '-05' no sobra. Un literal sin zona lo interpreta Postgres en la
    -- timezone de la sesion, y la del editor de Supabase es UTC: '05:12' se
    -- guardaria como 05:12 UTC, que en Colombia son las 00:12 del mismo dia.
    -- La API devuelve la columna 'fecha' junto a la hora colombiana de
    -- 'registrado_en', asi que ese desfase sale a la vista en la respuesta.
    ((('2026-09-0' || d.n) || ' ' || d.hora) || '-05')::timestamptz as registrado_en,
    c.cedula,
    c.nombre as conductor,
    d.km
  from (values
    (1, '05:12:00', 418200),
    (2, '04:58:00', 502340),
    (3, '05:31:00', 377100),
    (4, '05:05:00', 291870)
  ) as d(n, hora, km)
  join placas      p on p.n = d.n
  join conductores c on c.n = d.n
)
insert into sicov_alistamientos
  (placa, fecha, registrado_en,
   responsable_tipo_id, responsable_num_id, responsable_nombre,
   conductor_tipo_id, conductor_num_id, conductor_nombre,
   kilometraje, observaciones)
select
  pl.placa, pl.fecha, pl.registrado_en,
  1, r.num_id, r.nombre,
  1, pl.cedula, pl.conductor,
  pl.km,
  'REGISTRO DE PRUEBA para la integracion con GESMOVIL. Borrar antes de produccion.'
from plan pl
cross join responsable r
on conflict (placa, fecha) do nothing;


-- Actividades de cada alistamiento de prueba: las dos homologadas.
-- El del dia 3 lleva una no conforme a proposito, para que GESMOVIL vea los
-- dos estados. El 'estado' del alistamiento lo calcula el trigger.

insert into sicov_alistamiento_actividades (alistamiento_id, actividad_id, conforme, observacion)
select
  a.id,
  act.id,
  -- La unica no conforme: 'Fugas del motor' del alistamiento del dia 3.
  not (a.fecha = '2026-09-03' and act.descripcion = 'Fugas del motor'),
  case when a.fecha = '2026-09-03' and act.descripcion = 'Fugas del motor'
       then 'PRUEBA: fuga leve por el reten delantero' end
from sicov_alistamientos a
cross join sicov_cat_actividades act
where a.fecha < '2026-09-22'
  and act.descripcion in ('Niveles de aceite de motor', 'Fugas del motor')
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 2. Mantenimientos
-- ---------------------------------------------------------------------------
-- Uno preventivo (tipo 1) y uno correctivo (tipo 2), para que GESMOVIL vea los
-- dos valores de tipomantenimiento.

with placas as (
  select placa, row_number() over (order by placa) as n
    from flota_vehiculos
   where nombre_ruta = 'AEROPUERTO'
),
responsable as (
  select
    max(valor) filter (where clave = 'responsable_num_id') as num_id,
    max(valor) filter (where clave = 'responsable_nombre') as nombre
  from sicov_config
),
plan as (
  select p.placa, d.fecha, d.hora, d.tipo, d.detalle
  from (values
    (1, '2026-09-02'::date, '14:30'::time, 1, 'Cambio de aceite y filtros'),
    (2, '2026-09-04'::date, '09:15'::time, 2, 'Correccion de fuga en el sistema de refrigeracion')
  ) as d(n, fecha, hora, tipo, detalle)
  join placas p on p.n = d.n
)
insert into sicov_mantenimientos
  (placa, fecha, hora, tipo,
   responsable_tipo_id, responsable_num_id, responsable_nombre,
   detalle_libre, observaciones)
select
  pl.placa, pl.fecha, pl.hora, pl.tipo,
  1, r.num_id, r.nombre,
  pl.detalle,
  'REGISTRO DE PRUEBA para la integracion con GESMOVIL. Borrar antes de produccion.'
from plan pl
cross join responsable r
-- Un vehiculo SI puede tener varios mantenimientos el mismo dia, asi que la
-- tabla no tiene restriccion unica y un 'on conflict' no tendria a que
-- agarrarse. Este not exists es lo que evita duplicar al correr dos veces.
where not exists (
  select 1 from sicov_mantenimientos m
   where m.placa = pl.placa and m.fecha = pl.fecha and m.hora = pl.hora
);


insert into sicov_mantenimiento_actividades (mantenimiento_id, actividad_id)
select m.id, act.id
from sicov_mantenimientos m
cross join sicov_cat_actividades act
where m.fecha < '2026-09-22'
  and act.descripcion = case when m.tipo = 1
                             then 'Niveles de aceite de motor'
                             else 'Fugas del motor' end
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- Comprobacion
-- ---------------------------------------------------------------------------
-- Debe decir:  4  /  8  /  2  /  2  /  1
--
-- El ultimo es el numero de alistamientos CON_NOVEDAD, y que sea 1 prueba que
-- el trigger calculo el estado a partir de la actividad no conforme.

select
  (select count(*) from sicov_alistamientos  where fecha < '2026-09-22')  as alistamientos,
  (select count(*) from sicov_alistamiento_actividades a
     join sicov_alistamientos al on al.id = a.alistamiento_id
    where al.fecha < '2026-09-22')                                        as act_alistamiento,
  (select count(*) from sicov_mantenimientos where fecha < '2026-09-22')  as mantenimientos,
  (select count(*) from sicov_mantenimiento_actividades m
     join sicov_mantenimientos mm on mm.id = m.mantenimiento_id
    where mm.fecha < '2026-09-22')                                        as act_mantenimiento,
  (select count(*) from sicov_alistamientos
    where fecha < '2026-09-22' and estado = 'CON_NOVEDAD')                as con_novedad;
