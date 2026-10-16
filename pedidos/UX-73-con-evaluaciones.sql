-- UX-73 · qué trabajadores tienen evaluaciones, para elegir uno con el que la
-- comprobación signifique algo. Solo lee.
--
-- Hace falta porque una `evaluaciones.lista` vacía es consistente con el cambio
-- Y con la función rota: no distingue una cosa de la otra. Para comprobar de
-- verdad hay que abrir el enlace de alguien que tenga al menos una válida.
--
-- Mismo cuidado que en el otro: `count(e.id) filter (...)` y no
-- `count(*) filter (...)`, o el LEFT JOIN cuenta como válida la fila vacía de
-- quien no tiene ninguna.
select
  t.nombre,
  t.rut,
  count(e.id) filter (where e.rechazo is null)     as evaluaciones_validas,
  count(e.id) filter (where e.rechazo is not null) as rechazos,
  case
    when t.token_consulta is null then '*** SIN token_consulta: no tiene enlace ***'
    else 'https://huellalaboral.cl/estado.html?token=' || t.token_consulta
  end                                              as enlace_de_seguimiento
from public.trabajadores t
left join public.evaluaciones e on e.trabajador_id = t.id
group by t.id, t.nombre, t.rut, t.token_consulta
order by count(e.id) filter (where e.rechazo is null) desc, t.nombre;
