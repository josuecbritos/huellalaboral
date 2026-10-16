-- UX-73 · el enlace de seguimiento del trabajador de prueba y cuántas
-- evaluaciones válidas tiene. Solo lee: ni un INSERT, ni un UPDATE.
--
-- El número de `evaluaciones_validas` es el que tiene que mostrar la pantalla.
--
-- `count(e.id) filter (...)` y no `count(*) filter (...)`: con el LEFT JOIN, un
-- trabajador sin ninguna evaluación trae una fila con todo a null, y `count(*)`
-- la contaría como una evaluación válida. `count(e.id)` no cuenta nulos.
select
  t.nombre,
  t.rut,
  case
    when t.token_consulta is null then '*** SIN token_consulta: este trabajador no tiene enlace ***'
    else 'https://huellalaboral.cl/estado.html?token=' || t.token_consulta
  end                                              as enlace_de_seguimiento,
  count(e.id) filter (where e.rechazo is null)     as evaluaciones_validas,
  count(e.id) filter (where e.rechazo is not null) as rechazos,
  count(e.id)                                      as filas_en_evaluaciones
from public.trabajadores t
left join public.evaluaciones e on e.trabajador_id = t.id
where t.rut = '11.111.111-1'
group by t.id, t.nombre, t.rut, t.token_consulta;
