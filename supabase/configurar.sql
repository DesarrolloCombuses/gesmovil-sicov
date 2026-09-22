-- ---------------------------------------------------------------------------
-- Configuracion inicial de la plataforma SICOV
-- ---------------------------------------------------------------------------
-- Se ejecuta UNA VEZ, despues de la migracion, en el SQL Editor del panel.
--
-- No es una migracion: son los datos propios de COMBUSES, que ningun archivo
-- del repo puede saber. Cambia los <PLACEHOLDERS> antes de ejecutar.
--
-- Mientras haya un placeholder sin reemplazar, la plataforma responde 503 y
-- dice que le falta -- no se registra nada a medias.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Datos de la empresa  (VERIFICADO CONTRA EL RUT)
-- ---------------------------------------------------------------------------
-- Fuente: RUT de la DIAN, formulario 141264854098, actualizado el 31-jul-2026.
--
--   Casilla 5    NIT            890920397   (DV 5, que NO va aqui)
--   Casilla 35   Razon social   COMPAÑIA METROPOLITANA DE BUSES S.A.
--   Casilla 37   Sigla          COMBUSES S.A.
--   Casilla 41   Direccion      CL 55 46 14 OF 1204, Medellin
--   Casilla 46   Actividad      4921 (transporte de pasajeros)
--
-- QUEDA RESUELTA LA DUDA QUE HABIA AQUI: la cotizacion de GESMOVIL dice
-- "COMPAÑIA METROPOLITANA DE BUSES Y CIA S.C.A.". El RUT dice S.A., y coincide
-- con el RUES. Son formas juridicas distintas (Sociedad Anonima vs Sociedad en
-- Comandita por Acciones), asi que el dato de la cotizacion esta equivocado.
--
-- Vale la pena que GESMOVIL lo corrija antes de firmar: el contrato de
-- designacion como Aliado Tecnologico se firma con la razon social del RUT.
--
-- Esta razon social viaja en cada mantenimiento que se reporta, y el sujeto
-- obligado que responde por su veracidad es COMBUSES. Por eso la fuente es el
-- RUT y no un directorio ni la propuesta de un proveedor.
--
-- El DV no se incluye porque el campo del manual es 'nit' a secas. Si GESMOVIL
-- confirma que VIGIA 2 lo espera como 890920397-5, se cambia aqui y basta: la
-- API lo entrega tal cual esta guardado.

update sicov_config set valor = '890920397', actualizado_en = now()
 where clave = 'nit';

update sicov_config set valor = 'COMPAÑIA METROPOLITANA DE BUSES S.A.', actualizado_en = now()
 where clave = 'razon_social';


-- ---------------------------------------------------------------------------
-- 2. Responsable del proceso de alistamiento  (OBLIGATORIO)
-- ---------------------------------------------------------------------------
-- El manual exige un responsable DISTINTO del conductor. Como el alistamiento
-- se llena sin login, el conductor no puede designar a un tercero: aqui se
-- declara, una vez, a quien la empresa puso a supervisar el proceso.
--
-- Saca el nombre y la cedula de la nomina en vez de teclearlos: una cedula con
-- un digito cambiado no la detecta nadie hasta que la Supertransporte rechace
-- el reporte.
--
--   select cedula, nombre, cargo, activo
--     from employees
--    where nombre ilike '%<apellido del responsable>%'
--    order by activo desc;
--
-- El nombre se guarda en orden natural (nombres y luego apellidos): el manual
-- pide un nombre completo y su ejemplo va asi ("Juan Perez Perez"), que es
-- como lo espera leer quien revisa el reporte. La nomina suele tenerlo en
-- orden de archivo, con los apellidos primero.

update sicov_config set valor = '<CEDULA DEL RESPONSABLE>', actualizado_en = now()
 where clave = 'responsable_num_id';

update sicov_config set valor = '<NOMBRES Y APELLIDOS DEL RESPONSABLE>', actualizado_en = now()
 where clave = 'responsable_nombre';


-- ---------------------------------------------------------------------------
-- Rutas cubiertas por el SICOV
-- ---------------------------------------------------------------------------
-- COMBUSES opera urbano e intermunicipal con la misma empresa, y el SICOV-OTPC
-- cubre lo intermunicipal por carretera. Solo las placas de estas rutas
-- aparecen en el formulario, y solo estas se aceptan al registrar: sin este
-- filtro se alistarian buses urbanos que no le corresponden al reporte.
--
-- Tiene que coincidir EXACTO con flota_vehiculos.nombre_ruta. Varias rutas se
-- separan por coma; los espacios alrededor no importan.

insert into sicov_config (clave, valor, descripcion)
values (
  'rutas_sicov',
  'AEROPUERTO',
  'Rutas de flota_vehiculos.nombre_ruta cubiertas por el SICOV, separadas por coma.'
)
on conflict (clave) do update
  set valor          = excluded.valor,
      descripcion    = excluded.descripcion,
      actualizado_en = now();


-- ---------------------------------------------------------------------------
-- 3. Catalogo de actividades  (PROVISIONAL -- leer antes de ejecutar)
-- ---------------------------------------------------------------------------
-- Lo correcto es traerlo de la maestra oficial con sicov-sync-catalogos, pero
-- eso necesita un token de COMBUSES que GESMOVIL todavia no ha entregado (el
-- publicado en el manual responde "Error en el token" para esta maestra).
--
-- Estas dos son las UNICAS actividades oficiales que el manual muestra, en su
-- ejemplo de homologacion. Sirven para probar el flujo completo de punta a
-- punta hoy mismo, no para operar: un checklist de dos puntos no es una
-- verificacion preoperacional.
--
-- NO agregues ids inventados. Un id equivocado hace que el reporte afirme
-- ante la Supertransporte que se verifico algo distinto de lo que se
-- verifico, y el sujeto obligado que responde por eso es COMBUSES.
--
-- Cuando llegue el token, el sync trae el catalogo completo y corrige estas
-- dos si hace falta (hace upsert por id, no borra nada).

insert into sicov_cat_actividades (id, descripcion, grupo, orden) values
  (1, 'Fugas del motor',            'Motor', 1),
  (4, 'Niveles de aceite de motor', 'Motor', 2)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 4. Comprobacion
-- ---------------------------------------------------------------------------
-- Debe devolver 'LISTO' en las tres filas. Si alguna dice FALTA, revisa
-- arriba: la plataforma no va a aceptar registros hasta que las tres esten.

select 'datos de empresa' as que,
       case when (select valor from sicov_config where clave = 'nit') is not null
             and (select valor from sicov_config where clave = 'nit') not like '<%'
             and (select valor from sicov_config where clave = 'razon_social') is not null
             and (select valor from sicov_config where clave = 'razon_social') not like '<%'
            then 'LISTO' else 'FALTA' end as estado
union all
select 'responsable del proceso',
       case when (select valor from sicov_config where clave = 'responsable_num_id') is not null
             and (select valor from sicov_config where clave = 'responsable_num_id') not like '<%'
             and (select valor from sicov_config where clave = 'responsable_nombre') is not null
             and (select valor from sicov_config where clave = 'responsable_nombre') not like '<%'
            then 'LISTO' else 'FALTA' end
union all
select 'catalogo de actividades (' || (select count(*)::text from sicov_cat_actividades where activa) || ')',
       case when (select count(*) from sicov_cat_actividades where activa) > 0
            then 'LISTO' else 'FALTA' end;


-- ---------------------------------------------------------------------------
-- 5. Usuario del taller  (para registrar mantenimientos)
-- ---------------------------------------------------------------------------
-- El alistamiento no necesita usuarios. El mantenimiento si: es quien afirma
-- que un trabajo se ejecuto.
--
-- Primero crear la cuenta en el panel: Authentication -> Users -> Add user
-- (con correo y contraseña). Despues copiar su UUID aqui.
--
-- Roles:
--   taller       registra mantenimientos a su propio nombre
--   coordinador  puede ademas atribuir el trabajo a otra persona
--   admin        igual que coordinador

-- insert into sicov_usuarios (user_id, nombre, cedula, rol) values
--   ('<UUID DEL USUARIO>', '<NOMBRE COMPLETO>', '<CEDULA>', 'coordinador');
