-- ===========================================================================
-- BORRAR LOS DATOS DE PRUEBA DE GESMOVIL
-- ===========================================================================
-- Copiar entero, pegar en el SQL Editor de Supabase y darle Run.
--
-- CORRER ESTO ANTES DE QUE GESMOVIL EMPIECE A REPORTAR DE VERDAD.
--
-- Mientras estos registros esten en la base son indistinguibles de los reales:
-- el contrato del manual no tiene ningun campo para marcar un registro como
-- prueba. Si quedan, se transmiten a la Superintendencia como alistamientos y
-- mantenimientos que nunca ocurrieron, y el sujeto obligado que responde por
-- eso es COMBUSES.
--
-- El corte es la fecha. La plataforma empezo a capturar de verdad el 22 de
-- septiembre de 2026, asi que todo lo anterior es dato de prueba. Si algun dia
-- hubiera que registrar un alistamiento real con fecha anterior a esa, hay que
-- revisar este archivo antes de correrlo.
--
-- Las actividades de cada registro se van solas: la clave ajena es
-- 'on delete cascade'.
-- ===========================================================================

begin;

delete from sicov_alistamientos  where fecha < '2026-09-22';
delete from sicov_mantenimientos where fecha < '2026-09-22';

-- ---------------------------------------------------------------------------
-- Comprobacion antes de confirmar
-- ---------------------------------------------------------------------------
-- Los cuatro primeros numeros deben ser 0. El quinto y el sexto son lo que
-- queda de la operacion real, que no se toca.

select
  (select count(*) from sicov_alistamientos  where fecha < '2026-09-22') as alist_prueba,
  (select count(*) from sicov_mantenimientos where fecha < '2026-09-22') as mant_prueba,
  (select count(*) from sicov_alistamiento_actividades a
     where not exists (select 1 from sicov_alistamientos al where al.id = a.alistamiento_id))
                                                                          as act_alist_huerfanas,
  (select count(*) from sicov_mantenimiento_actividades m
     where not exists (select 1 from sicov_mantenimientos mm where mm.id = m.mantenimiento_id))
                                                                          as act_mant_huerfanas,
  (select count(*) from sicov_alistamientos  where fecha >= '2026-09-22') as alist_reales,
  (select count(*) from sicov_mantenimientos where fecha >= '2026-09-22') as mant_reales;

commit;


-- ---------------------------------------------------------------------------
-- Por si acaso
-- ---------------------------------------------------------------------------
-- Si alguien movio las fechas de los registros de prueba, el corte por fecha
-- no los alcanza. Esta consulta los encuentra por la marca que llevan en
-- 'observaciones', que no viaja en la respuesta de la API.
--
-- Devuelve filas = quedan registros de prueba. Borrarlos a mano.

select 'alistamiento' as que, id, placa, fecha, estado
  from sicov_alistamientos
 where observaciones ilike '%REGISTRO DE PRUEBA%'
union all
select 'mantenimiento', id, placa, fecha, tipo::text
  from sicov_mantenimientos
 where observaciones ilike '%REGISTRO DE PRUEBA%';
