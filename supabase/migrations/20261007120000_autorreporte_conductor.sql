-- ---------------------------------------------------------------------------
-- Autorreporte de condiciones del conductor
-- ---------------------------------------------------------------------------
-- Dos declaraciones que el conductor firma antes de empezar el checklist:
-- descanso/fatiga y alcohol/sustancias.
--
-- POR QUE NO SON ACTIVIDADES DEL CHECKLIST
--
-- Las 40 actividades viajan a la Superintendencia a traves de GESMOVIL. Estas
-- dos NO: son declaraciones del conductor sobre su propio estado -- dato de
-- salud de una persona identificada, categoria especial bajo la Ley 1581 --
-- y el contrato del manual no las pide. Meterlas en el checklist las habria
-- empujado al reporte sin que nadie lo decidiera.
--
-- Quedan en columnas propias de la tabla, y la API de GESMOVIL selecciona
-- columna por columna, nunca '*': aunque alguien las olvide, no se filtran.
--
-- POR QUE EL DEFECTO ES NULL Y NO 'true'
--
-- Null significa "no se pregunto". Es lo que corresponde a los alistamientos
-- anteriores a este cambio: poner 'true' diria que esos conductores declararon
-- estar aptos, que es una afirmacion que nadie hizo. En un registro que puede
-- acabar en un expediente laboral o en una investigacion de accidente, esa
-- diferencia importa.
--
-- Marco: Decreto 431/2017 (alcohol y psicoactivos en transporte de pasajeros)
-- y Resolucion 40595/2022, que incluye el autorreporte de condiciones del
-- conductor dentro de la gestion del PESV.
-- ---------------------------------------------------------------------------

alter table sicov_alistamientos
  add column if not exists apto_descanso    boolean,
  add column if not exists apto_sustancias  boolean,
  -- Lo que el conductor quiera explicar si declara que no esta en condiciones.
  -- Opcional: obligar a justificar una respuesta incomoda empuja a cambiarla.
  add column if not exists apto_observacion text;

comment on column sicov_alistamientos.apto_descanso is
  'Autorreporte: declara estar descansado y sin fatiga ni somnolencia. NULL = no se pregunto (registros anteriores al cambio). NO viaja a la API de GESMOVIL.';
comment on column sicov_alistamientos.apto_sustancias is
  'Autorreporte: declara no haber consumido alcohol, sustancias psicoactivas ni medicamentos que afecten la conduccion. NULL = no se pregunto. NO viaja a la API de GESMOVIL.';
comment on column sicov_alistamientos.apto_observacion is
  'Lo que el conductor explique si declara no estar en condiciones. Dato de salud: no viaja a la API.';


-- ---------------------------------------------------------------------------
-- El estado tiene que reflejar tambien el autorreporte
-- ---------------------------------------------------------------------------
-- Un alistamiento con los 40 puntos conformes pero con el conductor
-- declarandose fatigado NO es un alistamiento OK. Si el estado solo mirara las
-- actividades, ese registro saldria en verde y nadie lo veria.
--
-- El trigger de actividades sigue como estaba, pero ahora el calculo vive en
-- una funcion que mira las dos cosas, y se dispara tambien cuando cambian las
-- columnas del autorreporte.

create or replace function sicov_estado_de_alistamiento(p_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when exists (
             select 1 from sicov_alistamiento_actividades x
              where x.alistamiento_id = p_id and x.conforme = false
           ) then 'CON_NOVEDAD'
           -- 'is false' y no '= false': con NULL (no se pregunto) la
           -- comparacion daria NULL y el case caeria al else, que es lo que se
           -- quiere -- pero escrito asi queda explicito que NULL no es novedad.
           when (select a.apto_descanso is false or a.apto_sustancias is false
                   from sicov_alistamientos a where a.id = p_id)
             then 'CON_NOVEDAD'
           else 'OK'
         end;
$$;

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
     set estado = sicov_estado_de_alistamiento(v_id)
   where a.id = v_id;
  return null;
end;
$$;

-- Y uno nuevo sobre la propia tabla, para cuando el autorreporte se graba o se
-- corrige. 'before' y no 'after': asi escribe el estado en la fila que ya se
-- esta guardando, sin un segundo update que volveria a disparar el trigger.
create or replace function sicov_estado_por_autorreporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.apto_descanso is false or new.apto_sustancias is false then
    new.estado := 'CON_NOVEDAD';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sicov_estado_autorreporte on sicov_alistamientos;
create trigger trg_sicov_estado_autorreporte
  before insert or update of apto_descanso, apto_sustancias on sicov_alistamientos
  for each row execute function sicov_estado_por_autorreporte();


-- ---------------------------------------------------------------------------
-- Comprobacion
-- ---------------------------------------------------------------------------
-- Las tres columnas deben existir y estar en NULL para todo lo ya registrado.

select
  count(*)                                             as alistamientos,
  count(apto_descanso)                                 as con_autorreporte,
  count(*) filter (where apto_descanso is null)        as sin_preguntar
from sicov_alistamientos;
