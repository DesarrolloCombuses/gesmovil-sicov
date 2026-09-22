-- ---------------------------------------------------------------------------
-- Checklist de alistamiento diario de COMBUSES
-- ---------------------------------------------------------------------------
-- REVISA ESTA LISTA ANTES DE EJECUTARLA. Es una propuesta, no un dato oficial.
--
-- De donde sale cada cosa:
--
--   - Los 11 puntos que COMBUSES ya usa hoy en el preoperacional urbano
--     (fluidos, llantas, frenos, luces, visibilidad, cinturones, emergencia,
--     puertas, documentacion, direccion/suspension y aptitud del conductor),
--     abiertos al detalle que exige un alistamiento SICOV.
--
--   - Las 5 actividades oficiales que se alcanzan a leer en el manual de la
--     Supertransporte (pagina 20): "Aditivos de radiador", "Ajuste de tapas",
--     "Baterias: niveles de electrolito, ajustes de bordes y sulfatacion",
--     "Botiquin" y "Equipo de carretera". Marcan el nivel de granularidad que
--     espera el regulador, y van incluidas tal cual para que despues el mapeo
--     sea directo.
--
--   - Practica corriente de alistamiento de buses.
--
-- Quien conoce la operacion de COMBUSES es el jefe de mantenimiento: que
-- revise, quite lo que no aplique y agregue lo que falte. Cambiar la lista
-- despues es facil (insert/update), pero cuanto antes se estabilice, mas
-- comparables quedan los registros entre si.
--
-- Los ids se asignan solos desde 1000. No los escribas a mano.
-- ---------------------------------------------------------------------------

insert into sicov_cat_actividades
  (descripcion, grupo, orden, aplica_alistamiento, aplica_mantenimiento)
values
  -- --- Motor y fluidos -----------------------------------------------------
  ('Niveles de aceite de motor',                                  'Motor y fluidos',  10, true,  true),
  ('Fugas del motor',                                             'Motor y fluidos',  11, true,  true),
  ('Niveles de refrigerante',                                     'Motor y fluidos',  12, true,  true),
  ('Aditivos de radiador',                                        'Motor y fluidos',  13, true,  true),
  ('Nivel de liquido de frenos',                                  'Motor y fluidos',  14, true,  true),
  ('Nivel de aceite hidraulico de direccion',                     'Motor y fluidos',  15, true,  true),
  ('Ajuste de tapas',                                             'Motor y fluidos',  16, true,  true),
  ('Correas y mangueras',                                         'Motor y fluidos',  17, true,  true),
  ('Baterias: niveles de electrolito, ajustes de bordes y sulfatacion', 'Motor y fluidos', 18, true, true),

  -- --- Llantas y frenos ----------------------------------------------------
  ('Presion de llantas',                                          'Llantas y frenos', 20, true,  true),
  ('Profundidad de labrado y estado de llantas',                  'Llantas y frenos', 21, true,  true),
  ('Ajuste de tuercas y pernos de rines',                         'Llantas y frenos', 22, true,  true),
  ('Llanta de repuesto',                                          'Llantas y frenos', 23, true,  true),
  ('Sistema de frenos: pedal y recorrido',                        'Llantas y frenos', 24, true,  true),
  ('Freno de estacionamiento',                                    'Llantas y frenos', 25, true,  true),
  ('Sistema neumatico: fugas y presion de aire',                  'Llantas y frenos', 26, true,  true),

  -- --- Direccion y suspension ----------------------------------------------
  ('Direccion: juego libre y respuesta',                          'Direccion y suspension', 30, true, true),
  ('Suspension: amortiguadores y muelles',                        'Direccion y suspension', 31, true, true),

  -- --- Luces y señalizacion ------------------------------------------------
  ('Luces altas y bajas',                                         'Luces y señalizacion', 40, true, true),
  ('Direccionales y luces de parqueo',                            'Luces y señalizacion', 41, true, true),
  ('Luces de freno y reversa',                                    'Luces y señalizacion', 42, true, true),
  ('Luces internas y de emergencia',                              'Luces y señalizacion', 43, true, true),
  ('Pito y alarma de reversa',                                    'Luces y señalizacion', 44, true, true),

  -- --- Visibilidad ---------------------------------------------------------
  ('Parabrisas: estado y limpieza',                               'Visibilidad', 50, true, true),
  ('Limpiaparabrisas y nivel de agua',                            'Visibilidad', 51, true, true),
  ('Espejos retrovisores',                                        'Visibilidad', 52, true, true),

  -- --- Seguridad y emergencia ----------------------------------------------
  ('Extintor: carga y vigencia',                                  'Seguridad y emergencia', 60, true, true),
  ('Botiquin',                                                    'Seguridad y emergencia', 61, true, true),
  ('Equipo de carretera',                                         'Seguridad y emergencia', 62, true, true),
  ('Cinturones de seguridad',                                     'Seguridad y emergencia', 63, true, true),
  ('Salidas de emergencia y martillos',                           'Seguridad y emergencia', 64, true, true),

  -- --- Carroceria e interior -----------------------------------------------
  ('Puertas de servicio: apertura y cierre',                      'Carroceria e interior', 70, true, true),
  ('Pasamanos y sillas',                                          'Carroceria e interior', 71, true, true),
  ('Estado general de carroceria',                                'Carroceria e interior', 72, true, true),
  ('Aseo interior del vehiculo',                                  'Carroceria e interior', 73, true, false),

  -- --- Documentacion -------------------------------------------------------
  -- El alistamiento verifica que esten a bordo y vigentes; el SICOV los pide
  -- aparte con sus fechas, pero el conductor igual debe confirmarlos antes de
  -- salir.
  ('SOAT vigente a bordo',                                        'Documentacion', 80, true, false),
  ('Revision tecnico-mecanica vigente',                           'Documentacion', 81, true, false),
  ('Tarjeta de operacion vigente',                                'Documentacion', 82, true, false),

  -- --- Conductor -----------------------------------------------------------
  -- Autorreporte de aptitud. Lo exige la gestion del conductor del PESV
  -- (Res. 40595/2022) y el Decreto 431/2017 sobre alcohol y psicoactivos, y ya
  -- estaba en el preoperacional que usa COMBUSES.
  ('Licencia de conduccion vigente',                              'Conductor', 90, true, false),
  ('Aptitud del conductor para operar',                           'Conductor', 91, true, false)
-- Por descripcion, que es lo unico estable: el id lo pone la secuencia, asi
-- que sin esto volver a correr el seed insertaria las 40 de nuevo.
on conflict (descripcion) do nothing;


-- ---------------------------------------------------------------------------
-- Comprobacion
-- ---------------------------------------------------------------------------

select grupo, count(*) as actividades
  from sicov_cat_actividades
 where activa and aplica_alistamiento
 group by grupo
 order by min(orden);

select count(*) as total_alistamiento
  from sicov_cat_actividades
 where activa and aplica_alistamiento;
