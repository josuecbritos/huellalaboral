-- H-02 · H-03 — Token de validación propio para el validador interno
--
-- Hoy `validar.html?token=<valor>` recibe el `trabajadores.id`, que no es una
-- credencial: es la clave primaria, y `crear-solicitud` se la devuelve a
-- llamantes anónimos. Con ese valor cualquiera lee el certificado de
-- cotizaciones y el finiquito (H-02) y puede marcar los documentos como
-- validados (H-03).
--
-- Esta migración añade la credencial que falta. NO se aplica desde el conector:
-- `apply_migration` está prohibido. La aplica el dueño desde el panel de
-- Supabase, y las funciones nuevas no se despliegan hasta que esté aplicada.
--
-- Es aditiva: no borra ni renombra nada, y ninguna función desplegada hoy lee
-- estas columnas. Aplicarla sin desplegar el código deja el sistema exactamente
-- como está.

begin;

-- 1. Las columnas. `token_validacion` entra como nullable para poder rellenarla
--    fila a fila en el paso 2; el default y el NOT NULL se ponen después.
alter table public.trabajadores
  add column if not exists token_validacion uuid,
  add column if not exists token_validacion_usado boolean not null default false;

-- 2. Rellenar las filas existentes, una a una.
--
--    Esto NO es redundante con el default. Se hace con un UPDATE explícito en
--    vez de confiar en que el motor evalúe `gen_random_uuid()` por fila al
--    añadir la columna. Si lo evaluara una sola vez, todas las filas
--    compartirían el mismo token y cualquiera podría validar los documentos de
--    cualquiera — exactamente el agujero que esto viene a cerrar, pero peor.
--    Con el UPDATE no depende del comportamiento del motor.
update public.trabajadores
   set token_validacion = gen_random_uuid()
 where token_validacion is null;

-- 3. Ahora sí: default para las filas nuevas, y NOT NULL.
alter table public.trabajadores
  alter column token_validacion set default gen_random_uuid(),
  alter column token_validacion set not null;

-- 4. Unicidad. Sin esto, dos trabajadores podrían acabar compartiendo token por
--    un error de código y el índice tampoco ayudaría a la búsqueda.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'trabajadores_token_validacion_key'
       and conrelid = 'public.trabajadores'::regclass
  ) then
    alter table public.trabajadores
      add constraint trabajadores_token_validacion_key unique (token_validacion);
  end if;
end $$;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Comprobación. Ejecutar después de aplicar la migración.
--
-- Las tres cifras tienen que ser iguales entre sí: cada trabajador con un token
-- propio, ninguno nulo, ninguno repetido. Si `distintos` fuera menor que
-- `filas`, hay tokens compartidos y NO hay que desplegar el código.
--
--   select count(*)                        as filas,
--          count(token_validacion)         as con_token,
--          count(distinct token_validacion) as distintos,
--          count(*) filter (where token_validacion_usado) as ya_usados
--     from public.trabajadores;
--
-- `ya_usados` debe ser 0 recién aplicada.
-- ─────────────────────────────────────────────────────────────────────────────
