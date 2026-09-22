-- ---------------------------------------------------------------------------
-- Plataforma SICOV: alistamientos y mantenimientos
-- ---------------------------------------------------------------------------
-- COMBUSES registra aqui sus alistamientos y mantenimientos, y GESMOVIL los
-- consume por API para transmitirlos al ecosistema de la Superintendencia de
-- Transporte (SINST - VIGIA 2), como Aliado Tecnologico.
--
-- El modelo se diseña desde el "Manual de apis requeridas para integracion
-- alistamiento-mantenimientos-despachos", no desde lo que ya habia en la base.
-- Esa es la diferencia que importa: cada campo que el manual exige tiene su
-- columna, asi que no hay que rellenar huecos ni homologar nada al momento de
-- responder.
--
-- Decision de fondo: el checklist son las actividades OFICIALES de la
-- Supertransporte, guardadas por su id oficial. No hay tabla de homologacion
-- porque no hay nada que traducir -- el id que se guarda es el que se reporta.
--
-- Lo que ya existe y NO se toca:
--   flota_vehiculos, employees  -> se leen para validar placa y cedula
--   preoperacionales            -> el checklist urbano interno, sigue su vida
--   sicov-alistamiento          -> el push a Calisoftware, sigue funcionando
--   api_clientes, api_accesos   -> credenciales y auditoria, se reutilizan
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Catalogo oficial de actividades
-- ---------------------------------------------------------------------------
-- Espejo local de la maestra de la Supertransporte. Es la unica maestra que
-- esta plataforma necesita: el manual de alistamientos y mantenimientos no
-- pide municipios, nivel de servicio ni clase de vehiculo (esos son de la API
-- de despachos, que no esta en el alcance).
--
-- Se guarda local y no se consulta en caliente por dos razones: el formulario
-- de un conductor no puede depender de que un servicio de un tercero este
-- arriba, y el id oficial de una actividad no cambia a diario.
--
-- Fuente: https://rutasback.supertransporte.gov.co/api/v2/mantenimiento/listar-actividades
-- Requiere un token propio de COMBUSES; el publicado en el manual no sirve
-- para esta maestra (verificado: responde "Error en el token"). Mientras
-- llegue, la tabla se puede sembrar a mano -- ver README.
create table if not exists sicov_cat_actividades (
  id               integer     primary key,      -- id oficial, NO un serial nuestro
  descripcion      text        not null,
  aplica_alistamiento boolean  not null default true,
  aplica_mantenimiento boolean not null default true,
  grupo            text,                          -- para agrupar el formulario
  orden            integer,                       -- para ordenarlo
  activa           boolean     not null default true,
  sincronizado_en  timestamptz not null default now()
);

comment on table sicov_cat_actividades is
  'Catalogo oficial de actividades de la Supertransporte. La PK es el id oficial: es el que viaja en el reporte.';
comment on column sicov_cat_actividades.activa is
  'Una actividad retirada del catalogo se desactiva, no se borra: los registros historicos ya la referencian.';


-- ---------------------------------------------------------------------------
-- 2. Configuracion de empresa
-- ---------------------------------------------------------------------------
-- El NIT y la razon social son los mismos en cada respuesta. Van en tabla y no
-- en variables de entorno para que un cambio no exija volver a desplegar, y
-- para que quede rastro de cuando cambiaron.
create table if not exists sicov_config (
  clave           text primary key,
  valor           text,
  descripcion     text,
  actualizado_en  timestamptz not null default now()
);

insert into sicov_config (clave, valor, descripcion) values
  ('nit',          null, 'NIT de COMBUSES sin digito de verificacion. Lo exige la API de mantenimientos.'),
  ('razon_social', null, 'Razon social exacta como esta registrada ante la Supertransporte.'),
  -- El manual exige un responsable del alistamiento distinto del conductor.
  -- El alistamiento se llena sin login, asi que el conductor no puede
  -- "firmar" por un tercero: el responsable es el cargo que la empresa
  -- designo para supervisar el proceso, y se configura una vez aqui. El
  -- formulario puede elegir otro de sicov_usuarios cuando aplique.
  ('responsable_tipo_id',  '1', 'Tipo de identificacion del responsable del alistamiento (1 = cedula de ciudadania).'),
  ('responsable_num_id',  null, 'Cedula del responsable designado para el proceso de alistamiento.'),
  ('responsable_nombre',  null, 'Nombre completo del responsable designado.')
on conflict (clave) do nothing;


-- ---------------------------------------------------------------------------
-- 3. Quien puede registrar mantenimientos
-- ---------------------------------------------------------------------------
-- El alistamiento lo llena el conductor desde un link abierto (se valida
-- contra la flota, no contra un usuario). El mantenimiento lo registra el
-- taller con login, porque es quien afirma que un trabajo se ejecuto: eso
-- necesita un responsable con nombre, no un formulario anonimo.
create table if not exists sicov_usuarios (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  nombre      text        not null,
  cedula      text        not null,
  rol         text        not null default 'taller'
                check (rol in ('taller', 'coordinador', 'admin')),
  activo      boolean     not null default true,
  creado_en   timestamptz not null default now()
);

comment on table sicov_usuarios is
  'Personal autorizado a registrar mantenimientos. La cedula se copia aqui porque el manual la exige como responsable del mantenimiento.';


-- ---------------------------------------------------------------------------
-- 4. Alistamientos
-- ---------------------------------------------------------------------------
-- Un alistamiento es la verificacion previa a la operacion de un vehiculo.
-- El manual exige responsable Y conductor como personas distintas, asi que
-- van en columnas separadas y no se asume que sean la misma.

create table if not exists sicov_alistamientos (
  id                    bigserial   primary key,
  placa                 text        not null,
  -- Dia calendario colombiano al que corresponde el alistamiento. Se guarda
  -- aparte de registrado_en porque son cosas distintas: el dia que se reporta
  -- y el instante en que se grabo. Sin esta separacion, un alistamiento hecho
  -- a las 11 de la noche se reportaria en el dia siguiente.
  fecha                 date        not null,
  registrado_en         timestamptz not null default now(),

  -- Responsable del proceso (manual 7.2). Los tres campos son obligatorios.
  responsable_tipo_id   smallint    not null default 1,
  responsable_num_id    text        not null,
  responsable_nombre    text        not null,

  -- Conductor asociado (manual 7.3). Tambien obligatorios los tres.
  conductor_tipo_id     smallint    not null default 1,
  conductor_num_id      text        not null,
  conductor_nombre      text        not null,

  kilometraje           integer     check (kilometraje is null or kilometraje >= 0),
  observaciones         text,
  -- Resumen derivado de las actividades: si alguna quedo no conforme, el
  -- alistamiento tiene novedad. Lo calcula un trigger, no el cliente.
  estado                text        not null default 'OK'
                          check (estado in ('OK', 'CON_NOVEDAD')),

  creado_en             timestamptz not null default now(),

  -- Un vehiculo se alista una vez por dia. Si hay que corregir, se edita el
  -- registro del dia, no se crea un segundo que duplicaria el reporte.
  constraint sicov_alistamientos_placa_fecha_unica unique (placa, fecha)
);

comment on column sicov_alistamientos.fecha is
  'Dia colombiano que se reporta. Distinto de registrado_en, que es el instante real de captura.';

-- Las actividades verificadas en cada alistamiento, por su id OFICIAL. Esta
-- tabla es la que alimenta los campos 'actividades' y 'detalleActividades' del
-- manual, sin traduccion intermedia.
create table if not exists sicov_alistamiento_actividades (
  alistamiento_id  bigint  not null references sicov_alistamientos(id) on delete cascade,
  actividad_id     integer not null references sicov_cat_actividades(id) on delete restrict,
  -- Si la verificacion paso o no. Se reporta la actividad igual: lo que el
  -- regulador pide es que se verifico, y el estado queda para la operacion.
  conforme         boolean not null default true,
  observacion      text,
  primary key (alistamiento_id, actividad_id)
);


-- ---------------------------------------------------------------------------
-- 5. Mantenimientos
-- ---------------------------------------------------------------------------
-- Aqui se registra lo EJECUTADO, no lo solicitado. Es la diferencia con
-- flota_mantenimiento_solicitudes, que guarda intenciones: el manual pide
-- mantenimientos realizados, con su hora y su responsable.

create table if not exists sicov_mantenimientos (
  id                   bigserial   primary key,
  placa                text        not null,
  fecha                date        not null,
  -- El manual pide la hora aparte de la fecha. Es 'time' y no un timestamp
  -- porque es la hora en que se hizo el trabajo, un dato que el taller
  -- escribe, no el instante en que se grabo la fila.
  hora                 time        not null,

  -- 1 = preventivo, 2 = correctivo (manual 7.1). Se guarda como el numero que
  -- viaja en el reporte, con el check que impide cualquier otro valor: es un
  -- campo que el regulador valida.
  tipo                 smallint    not null check (tipo in (1, 2)),

  -- Responsable del mantenimiento (manual 7.3).
  responsable_tipo_id  smallint    not null default 1,
  responsable_num_id   text        not null,
  responsable_nombre   text        not null,

  -- Detalle libre, para lo que el catalogo oficial no cubra. El reporte
  -- prefiere las actividades oficiales y usa este texto solo si no hay
  -- ninguna seleccionada.
  detalle_libre        text,

  kilometraje          integer     check (kilometraje is null or kilometraje >= 0),
  observaciones        text,

  -- Quien lo registro en la plataforma. Distinto del responsable del trabajo:
  -- un coordinador puede digitar un mantenimiento que ejecuto un mecanico.
  registrado_por       uuid        references sicov_usuarios(user_id) on delete set null,
  creado_en            timestamptz not null default now()
);

comment on column sicov_mantenimientos.registrado_por is
  'Quien digito el registro. No es el responsable del trabajo: son datos distintos y el manual pide el segundo.';

create table if not exists sicov_mantenimiento_actividades (
  mantenimiento_id  bigint  not null references sicov_mantenimientos(id) on delete cascade,
  actividad_id      integer not null references sicov_cat_actividades(id) on delete restrict,
  observacion       text,
  primary key (mantenimiento_id, actividad_id)
);


-- ---------------------------------------------------------------------------
-- 6. Estado derivado del alistamiento
-- ---------------------------------------------------------------------------
-- El estado sale de las actividades, no de lo que diga el cliente. Si se
-- confiara en el formulario, un error de JavaScript podria marcar como OK un
-- alistamiento con fallas, y eso es justo lo que el registro debe evitar.
create or replace function sicov_recalcular_estado_alistamiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  v_id := coalesce(new.alistamiento_id, old.alistamiento_id);

  update sicov_alistamientos a
     set estado = case
                    when exists (
                      select 1 from sicov_alistamiento_actividades x
                       where x.alistamiento_id = v_id
                         and x.conforme = false
                    ) then 'CON_NOVEDAD'
                    else 'OK'
                  end
   where a.id = v_id;

  return null;
end;
$$;

drop trigger if exists trg_sicov_estado_alistamiento on sicov_alistamiento_actividades;
create trigger trg_sicov_estado_alistamiento
  after insert or update or delete on sicov_alistamiento_actividades
  for each row execute function sicov_recalcular_estado_alistamiento();


-- ---------------------------------------------------------------------------
-- 7. Indices
-- ---------------------------------------------------------------------------
-- Las dos APIs filtran siempre por rango de fechas, que es lo que el manual
-- obliga. Estos son los indices que sostienen ese patron.
create index if not exists idx_sicov_alist_fecha    on sicov_alistamientos (fecha);
create index if not exists idx_sicov_alist_placa    on sicov_alistamientos (placa, fecha desc);
create index if not exists idx_sicov_mant_fecha     on sicov_mantenimientos (fecha);
create index if not exists idx_sicov_mant_placa     on sicov_mantenimientos (placa, fecha desc);

-- El contador de intentos fallidos por IP y el limite por hora se apoyan en
-- api_accesos. Sin indice, cada peticion rechazada recorre la tabla entera,
-- que es justo lo que un abuso hace crecer.
create index if not exists idx_api_accesos_ip_fecha
  on api_accesos (ip, creado_en desc);
create index if not exists idx_api_accesos_cliente_fecha
  on api_accesos (cliente_id, creado_en desc);


-- ---------------------------------------------------------------------------
-- 8. Alcance de las credenciales de API
-- ---------------------------------------------------------------------------
-- api_clientes ya existe y la usa api-externa (programacion de turnos de
-- CombuAsigna). Reutilizarla evita montar un segundo sistema de credenciales,
-- pero abre un riesgo: sin un campo de alcance, la key de GESMOVIL serviria
-- tambien para leer la programacion de turnos.
--
-- Hay dos barreras, a proposito:
--   - Esta columna 'apis', que la funcion valida explicitamente.
--   - api-externa ya exige que 'bases' no este vacio, asi que un cliente de
--     SICOV (bases = '{}') recibe 403 de esa API aunque se olvide el chequeo.
-- Una sola barrera dependeria de que nadie se equivoque una vez.
alter table api_clientes
  add column if not exists apis text[] not null default array['combuasigna']::text[];

comment on column api_clientes.apis is
  'APIs que esta credencial puede consumir. Los clientes previos quedan en combuasigna por el default; el de GESMOVIL lleva solo sicov.';

update api_clientes
   set apis = array['combuasigna']::text[]
 where apis is null or cardinality(apis) = 0;


-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------
-- Todo lo que escribe pasa por edge functions con la service_role key, que
-- salta RLS. Estas tablas se activan sin politicas de escritura para que ni la
-- anon key ni un cliente del navegador puedan insertar: un registro de
-- alistamiento es una afirmacion ante el regulador, y solo debe nacer por el
-- camino que valida placa, cedula y actividades.
alter table sicov_cat_actividades            enable row level security;
alter table sicov_config                     enable row level security;
alter table sicov_usuarios                   enable row level security;
alter table sicov_alistamientos              enable row level security;
alter table sicov_alistamiento_actividades   enable row level security;
alter table sicov_mantenimientos             enable row level security;
alter table sicov_mantenimiento_actividades  enable row level security;

-- Unica excepcion de lectura: el catalogo de actividades. Es un catalogo
-- publico en origen, asi que no hay nada que proteger, y se limita a las filas
-- activas. Hoy los formularios lo reciben por las edge functions; esta
-- politica deja la puerta abierta a leerlo directo sin volver a tocar RLS.
--
-- 'create policy' no admite IF NOT EXISTS ni en PG 17, asi que se borra antes:
-- sin esto, correr la migracion dos veces falla y todo lo demas de este
-- archivo si es idempotente.
drop policy if exists sicov_cat_actividades_lectura on sicov_cat_actividades;
create policy sicov_cat_actividades_lectura
  on sicov_cat_actividades
  for select
  to authenticated
  using (activa = true);

-- El usuario autenticado puede leer su propia ficha, para que la plataforma
-- sepa su nombre y cedula sin una segunda consulta al servidor.
drop policy if exists sicov_usuarios_propio on sicov_usuarios;
create policy sicov_usuarios_propio
  on sicov_usuarios
  for select
  to authenticated
  using (user_id = auth.uid());
