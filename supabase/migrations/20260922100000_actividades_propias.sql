-- ---------------------------------------------------------------------------
-- Actividades propias + homologacion al catalogo oficial
-- ---------------------------------------------------------------------------
-- POR QUE ESTE CAMBIO
--
-- El diseño original usaba las actividades OFICIALES de la Supertransporte
-- como checklist, para no tener que homologar nada. Eso sigue siendo lo mas
-- limpio, pero tiene un requisito que hoy no se cumple: hace falta el catalogo
-- oficial, y su API pide un token que COMBUSES todavia no tiene (verificado:
-- todas las variantes del endpoint responden "Falta el token" o "Token
-- invalido").
--
-- Esperar a ese token significaria no capturar ni un alistamiento. Asi que se
-- adopta el camino que el propio manual describe:
--
--   "Procedimiento es consultar las actividades de alistamiento en el link
--    anterior y homologar con las actividades de alistamiento que tiene la
--    empresa de transporte."
--
-- O sea: COMBUSES tiene SUS actividades, y se traducen a las oficiales al
-- momento de reportar.
--
-- LO QUE ESTO HABILITA
--
-- Se empieza a capturar hoy. La traduccion se aplica al LEER (en la API), no
-- al guardar, asi que el dia que llegue el catalogo oficial y se cargue el
-- mapeo, los alistamientos ya registrados se pueden reportar hacia atras sin
-- tocar un solo registro.
--
-- QUE PASA MIENTRAS NO HAYA HOMOLOGACION
--
-- La API de GESMOVIL responde 503 para /alistamientos y lo dice con esas
-- palabras. No entrega ids sin homologar: para la Supertransporte, el id 1001
-- no es "una actividad nuestra", es otra actividad distinta de la que se
-- verifico. Un reporte equivocado es peor que ninguno.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Catalogo OFICIAL de la Supertransporte (hoy vacio)
-- ---------------------------------------------------------------------------
-- Lo llena sicov-sync-catalogos cuando exista el token. La PK es el id
-- oficial: es el numero que viaja en el reporte.
create table if not exists sicov_cat_actividades_oficiales (
  id               integer     primary key,
  descripcion      text        not null,
  -- grupo y orden los trae la maestra si los publica. No se usan para
  -- reportar, pero sirven para leer el catalogo en el mismo orden en que lo
  -- lista el regulador cuando toque revisar la homologacion a mano.
  grupo            text,
  orden            integer,
  activa           boolean     not null default true,
  sincronizado_en  timestamptz not null default now()
);

comment on table sicov_cat_actividades_oficiales is
  'Catalogo oficial de la Supertransporte. Se llena con sicov-sync-catalogos; la PK es el id oficial.';


-- ---------------------------------------------------------------------------
-- 2. Las actividades de COMBUSES
-- ---------------------------------------------------------------------------
-- sicov_cat_actividades pasa a ser el checklist propio. Los ids arrancan en
-- 1000 a proposito: asi, viendo un numero suelto, se sabe de cual catalogo es.
-- El oficial usa numeros bajos (su ejemplo son el 1 y el 4).

-- Las dos filas oficiales que se habian sembrado se mueven a su tabla, que es
-- donde corresponden ahora.
insert into sicov_cat_actividades_oficiales (id, descripcion)
select id, descripcion from sicov_cat_actividades where id in (1, 4)
on conflict (id) do nothing;

-- Y se quitan de las propias. Solo si nadie las uso todavia: si ya hay
-- alistamientos que las referencian, se dejan y se limpian a mano -- borrar
-- una actividad ya usada rompe el historial de lo que se verifico.
delete from sicov_cat_actividades
 where id in (1, 4)
   and not exists (
     select 1 from sicov_alistamiento_actividades a where a.actividad_id = sicov_cat_actividades.id
   )
   and not exists (
     select 1 from sicov_mantenimiento_actividades m where m.actividad_id = sicov_cat_actividades.id
   );

-- Secuencia para los ids propios, desde 1000.
create sequence if not exists sicov_cat_actividades_id_seq as integer start with 1000 minvalue 1000;
alter table sicov_cat_actividades
  alter column id set default nextval('sicov_cat_actividades_id_seq');
alter sequence sicov_cat_actividades_id_seq owned by sicov_cat_actividades.id;

comment on table sicov_cat_actividades is
  'Checklist de alistamiento y mantenimiento de COMBUSES. Ids desde 1000 para no confundirlos con los oficiales. Se traducen al reportar via sicov_homolog_actividades.';

-- Dos actividades con la misma descripcion son la misma actividad: el
-- conductor veria el punto repetido y no sabria cual marcar. Ademas, con el id
-- autogenerado, sin esta restriccion volver a correr el seed insertaria las 40
-- otra vez -- nunca habria conflicto que detectar.
create unique index if not exists idx_sicov_cat_actividades_descripcion
  on sicov_cat_actividades (descripcion);


-- ---------------------------------------------------------------------------
-- 3. La homologacion
-- ---------------------------------------------------------------------------
-- N:M en las dos direcciones, y no es teorico: un punto nuestro
-- ("Niveles de refrigerante y aceite") puede cubrir dos oficiales, y una
-- oficial puede quedar cubierta por varios puntos nuestros. Forzar 1:1
-- obligaria a elegir uno y perder el resto.
create table if not exists sicov_homolog_actividades (
  actividad_id  integer not null references sicov_cat_actividades(id) on delete cascade,
  oficial_id    integer not null references sicov_cat_actividades_oficiales(id) on delete restrict,
  primary key (actividad_id, oficial_id)
);

comment on table sicov_homolog_actividades is
  'Traduccion de cada actividad de COMBUSES a la oficial de la Supertransporte. Sin fila aqui, esa actividad no se puede reportar.';

create index if not exists idx_sicov_homolog_oficial
  on sicov_homolog_actividades (oficial_id);


-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table sicov_cat_actividades_oficiales enable row level security;
alter table sicov_homolog_actividades       enable row level security;


-- ---------------------------------------------------------------------------
-- 5. Vista de cobertura
-- ---------------------------------------------------------------------------
-- Responde de un vistazo: cuanto del checklist se puede reportar hoy. Sin
-- esto, la unica forma de saberlo es que la API devuelva 503 y toque adivinar
-- por que.
create or replace view sicov_v_cobertura as
select
  a.id,
  a.descripcion,
  a.grupo,
  a.activa,
  -- La API consulta por separado: para /alistamientos solo cuentan las
  -- actividades de alistamiento, y un hueco en las de mantenimiento no tiene
  -- por que frenar ese reporte.
  a.aplica_alistamiento,
  a.aplica_mantenimiento,
  count(h.oficial_id)                            as oficiales_mapeadas,
  count(h.oficial_id) > 0                        as reportable,
  string_agg(o.descripcion, ' + ' order by o.id) as equivale_a
from sicov_cat_actividades a
left join sicov_homolog_actividades h on h.actividad_id = a.id
left join sicov_cat_actividades_oficiales o on o.id = h.oficial_id
group by a.id, a.descripcion, a.grupo, a.activa,
         a.aplica_alistamiento, a.aplica_mantenimiento, a.orden
order by a.orden nulls last, a.id;

comment on view sicov_v_cobertura is
  'Que actividades del checklist propio ya se pueden reportar y a que oficial equivalen.';
