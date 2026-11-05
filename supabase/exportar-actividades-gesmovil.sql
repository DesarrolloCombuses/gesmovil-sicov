-- ---------------------------------------------------------------------------
-- Actividades de alistamiento de COMBUSES, para que GESMOVIL las homologue
-- ---------------------------------------------------------------------------
-- Copiar entero, pegar en el SQL Editor de Supabase y darle Run. Luego, encima
-- de la tabla de resultados: Export -> Download CSV. Ese CSV es el adjunto del
-- correo (ver SOLICITUD-CATALOGO-GESMOVIL.md).
--
-- Deben salir 40 filas. Las dos que ya tienen homologacion (Fugas del motor y
-- Niveles de aceite de motor) salen con el id oficial lleno; las demas, en
-- blanco para que GESMOVIL las complete.
--
-- Los ids no se pueden copiar de seed-checklist.sql: los asigna la secuencia
-- al insertar, asi que esta consulta es la unica fuente confiable.
--
-- Es una sola consulta a proposito: el editor de Supabase muestra solo el
-- resultado de la ultima, y una comprobacion al final taparia el listado.
-- ---------------------------------------------------------------------------

select
  a.id                                              as id_combuses,
  a.grupo,
  a.descripcion                                     as actividad_combuses,
  string_agg(o.id::text, ', ' order by o.id)        as id_oficial_supertransporte,
  string_agg(o.descripcion, ' + ' order by o.id)    as descripcion_oficial
from sicov_cat_actividades a
left join sicov_homolog_actividades h       on h.actividad_id = a.id
left join sicov_cat_actividades_oficiales o on o.id = h.oficial_id
where a.activa
  and a.aplica_alistamiento
group by a.id, a.grupo, a.descripcion, a.orden
order by a.orden, a.id;
