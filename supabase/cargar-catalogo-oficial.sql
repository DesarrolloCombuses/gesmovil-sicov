-- ---------------------------------------------------------------------------
-- Cargar el catalogo oficial de la Supertransporte y homologar el checklist
-- ---------------------------------------------------------------------------
-- Copiar entero, pegar en el SQL Editor de Supabase y darle Run.
--
-- ESTE ES EL UNICO PASO QUE FALTA PARA QUE GESMOVIL PUEDA LEER
--
-- Hoy la API devuelve 503 en cualquier rango con alistamientos reales, porque
-- 38 de las 40 actividades del checklist no tienen asignado su id oficial. El
-- campo 'actividades' del contrato viaja con ids del regulador, no con los
-- nuestros, y un id inventado seria un reporte falso.
--
-- ANTES DE CORRER ESTO HAY QUE TENER LOS IDS OFICIALES
--
-- Dos vias para conseguirlos:
--
--   a) Pedirselos a GESMOVIL. Ellos ya transmiten a VIGIA 2 por otras
--      empresas, asi que tienen el catalogo. Es lo mas rapido.
--
--   b) Sacarlos del portal. Entrando a SINST-VIGIA 2 con las credenciales de
--      COMBUSES, en F12 -> Network -> listar-actividades esta el JSON
--      completo con id y descripcion de cada una.
--
--   El token de la maestra que trae el manual NO sirve para esta API: da
--   "Error en el token". Se verifico contra el servicio real. Sirve para
--   nivelservicio y clase-vehiculo, que no necesitamos.
--
-- COMO SE USA ESTE ARCHIVO
--
-- La PARTE 1 se reemplaza con los datos reales: una fila por actividad del
-- catalogo oficial. Las dos que ya conocemos quedan de ejemplo del formato.
--
-- La PARTE 2 empareja automaticamente por descripcion, que resuelve las que
-- coinciden exactamente. La PARTE 3 lista las que quedaron sin emparejar, para
-- mapearlas a mano en la PARTE 4.
--
-- POR QUE LA HOMOLOGACION Y NO RENOMBRAR NUESTRAS ACTIVIDADES
--
-- Los alistamientos ya capturados apuntan a los ids propios. Cambiarlos
-- romperia el historico; en cambio, al traducirse en el momento de leer, todo
-- lo capturado desde el 22 de septiembre queda reportable de inmediato sin
-- recapturar nada.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- PARTE 1. El catalogo oficial
-- ===========================================================================
-- REEMPLAZAR con los pares (id, descripcion) reales del regulador.
-- El id es la clave primaria: es el que viaja en el reporte.

insert into sicov_cat_actividades_oficiales (id, descripcion) values
  (1,  'Fugas del motor'),
  (4,  'Niveles de aceite de motor')
  -- (5,  'Presion de llantas'),
  -- (6,  '...'),
on conflict (id) do update
  -- Si el regulador corrige una descripcion, se actualiza. El id no cambia.
  set descripcion = excluded.descripcion,
      sincronizado_en = now();


-- ===========================================================================
-- PARTE 2. Emparejar por descripcion
-- ===========================================================================
-- Resuelve de una vez las que se llaman igual en los dos catalogos. Compara en
-- minusculas y sin espacios de sobra, que es donde suelen diferir.

insert into sicov_homolog_actividades (actividad_id, oficial_id)
select a.id, o.id
  from sicov_cat_actividades a
  join sicov_cat_actividades_oficiales o
    on lower(trim(o.descripcion)) = lower(trim(a.descripcion))
 where a.activa = true
   and a.aplica_alistamiento = true
on conflict do nothing;


-- ===========================================================================
-- PARTE 3. Que quedo sin homologar
-- ===========================================================================
-- Cada fila de aqui es una actividad que todavia bloquea el reporte. Hay que
-- decidir a mano a cual oficial corresponde y escribirla en la PARTE 4.
--
-- Si sale vacio, la homologacion esta completa: pasar directo a la
-- comprobacion del final.

select a.id        as id_propio,
       a.grupo,
       a.descripcion
  from sicov_cat_actividades a
 where a.activa = true
   and a.aplica_alistamiento = true
   and not exists (
     select 1 from sicov_homolog_actividades h where h.actividad_id = a.id
   )
 order by a.grupo, a.orden;


-- ===========================================================================
-- PARTE 4. Mapeo manual de lo que no coincidio por nombre
-- ===========================================================================
-- Un par por linea: (id de la nuestra, id oficial). Los ids propios salen de
-- la PARTE 3; los oficiales, del catalogo de la PARTE 1.
--
-- Descomentar y completar. Mientras este comentado no hace nada, asi que el
-- archivo se puede correr entero aunque este paso no se haya decidido todavia.

-- insert into sicov_homolog_actividades (actividad_id, oficial_id) values
--   (1001, 12),
--   (1002, 13)
-- on conflict do nothing;


-- ===========================================================================
-- Comprobacion
-- ===========================================================================
-- 'sin_homologar' tiene que llegar a 0 para que la API deje de devolver 503.
-- Mientras sea mayor que 0, ese numero es exactamente el que aparece en el
-- mensaje de error que ve GESMOVIL.

select
  (select count(*) from sicov_cat_actividades_oficiales)        as catalogo_oficial,
  (select count(*) from sicov_cat_actividades
    where activa and aplica_alistamiento)                       as checklist_propio,
  (select count(*) from sicov_homolog_actividades)              as homologadas,
  (select count(*) from sicov_cat_actividades a
    where a.activa and a.aplica_alistamiento
      and not exists (select 1 from sicov_homolog_actividades h
                       where h.actividad_id = a.id))            as sin_homologar;
