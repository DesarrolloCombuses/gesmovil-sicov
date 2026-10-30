# Solicitud a GESMOVIL — catálogo oficial de actividades de alistamiento

Texto listo para enviar al equipo técnico de GESMOVIL. Es lo único que falta
para que puedan empezar a leer los alistamientos reales de COMBUSES.

---

## Mensaje

> **Asunto:** Catálogo oficial de actividades de alistamiento — SINST-VIGIA 2
>
> Buen día.
>
> La API de COMBUSES ya está disponible y probada: el rango **2026-09-01 a
> 2026-09-04** responde `200` en `/alistamientos` y en `/mantenimientos`, con
> datos de prueba que pueden consumir.
>
> Para habilitar los registros reales nos falta un dato que ustedes ya deben
> tener: **el catálogo oficial de actividades de alistamiento de la
> Superintendencia de Transporte, con el id y la descripción de cada una.**
>
> El campo `actividades` del contrato viaja con los ids del regulador. Hoy solo
> conocemos dos (`1` Fugas del motor y `4` Niveles de aceite de motor), así que
> cualquier rango con registros reales responde `503` indicando cuántas
> actividades faltan por homologar. No queremos asignar ids por aproximación:
> sería reportar una verificación con un código que no le corresponde.
>
> Basta con el listado completo en cualquier formato (JSON, Excel o el texto de
> la respuesta de `listar-actividades`). Lo cargamos y todo el histórico ya
> capturado queda disponible de inmediato, sin que ustedes tengan que repetir
> ninguna consulta.
>
> Adjuntamos las 40 actividades que COMBUSES verifica, por si ayuda a
> identificar la correspondencia.
>
> Quedamos atentos.

---

## Anexo: las 40 actividades del checklist de COMBUSES

Las dos marcadas son las únicas cuyo id oficial conocemos.

### Motor y fluidos
1. Niveles de aceite de motor — **id oficial 4**
2. Fugas del motor — **id oficial 1**
3. Niveles de refrigerante
4. Aditivos de radiador
5. Nivel de líquido de frenos
6. Nivel de aceite hidráulico de dirección
7. Ajuste de tapas
8. Correas y mangueras
9. Baterías: niveles de electrolito, ajustes de bordes y sulfatación

### Llantas y frenos
10. Presión de llantas
11. Profundidad de labrado y estado de llantas
12. Ajuste de tuercas y pernos de rines
13. Llanta de repuesto
14. Sistema de frenos: pedal y recorrido
15. Freno de estacionamiento
16. Sistema neumático: fugas y presión de aire

### Dirección y suspensión
17. Dirección: juego libre y respuesta
18. Suspensión: amortiguadores y muelles

### Luces y señalización
19. Luces altas y bajas
20. Direccionales y luces de parqueo
21. Luces de freno y reversa
22. Luces internas y de emergencia
23. Pito y alarma de reversa

### Visibilidad
24. Parabrisas: estado y limpieza
25. Limpiaparabrisas y nivel de agua
26. Espejos retrovisores

### Seguridad y emergencia
27. Extintor: carga y vigencia
28. Botiquín
29. Equipo de carretera
30. Cinturones de seguridad
31. Salidas de emergencia y martillos

### Carrocería e interior
32. Puertas de servicio: apertura y cierre
33. Pasamanos y sillas
34. Estado general de carrocería
35. Aseo interior del vehículo

### Documentación
36. SOAT vigente a bordo
37. Revisión técnico-mecánica vigente
38. Tarjeta de operación vigente

### Conductor
39. Licencia de conducción vigente
40. Aptitud del conductor para operar

---

## Nota interna (no va en el mensaje)

**Si GESMOVIL no lo entrega,** el catálogo se puede sacar del portal: entrando
a SINST-VIGIA 2 con las credenciales de COMBUSES, en F12 → Network →
`listar-actividades` está el JSON completo.

**El token de la maestra que trae el manual no sirve** para esa API: responde
«Error en el token». Verificado contra el servicio real el 21-sep-2026. Sirve
para `nivelservicio` y `clase-vehiculo`, que no necesitamos.

**Las 40 actividades todavía no las ha revisado el jefe de mantenimiento.** Se
armaron con el preoperacional que ya usaba COMBUSES y los requisitos del PESV
(Res. 40595/2022) y del Decreto 431/2017. Si él cambia alguna después de que
GESMOVIL devuelva el catálogo, esa actividad vuelve a quedar sin homologar.
Conviene cerrar las dos cosas en paralelo.

**Posible error de transcripción en la actividad 9.** La base dice «ajustes de
**bordes**»; en una batería los terminales son los **bornes**. La lista de
arriba reproduce lo que está en la base, no lo corregido, para que GESMOVIL vea
exactamente el texto que tenemos. Conviene confirmarlo con el jefe de
mantenimiento: si es un error, se corrige en `seed-checklist.sql` y en la tabla
`sicov_cat_actividades`, y como la homologación empareja por descripción contra
el catálogo oficial, cambiarlo antes de cargar evita tener que remapear después.

**Al cargar el catálogo:** `supabase/cargar-catalogo-oficial.sql`.
