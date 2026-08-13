-- Cadena de validación de documentos — `envio_id`
--
-- Hoy una validación no está atada al envío de documentos que validó. Cada
-- validación INSERTA una fila en `validaciones_documentos` y las anteriores no
-- se borran ni se marcan; la fila de `documentos` se ACTUALIZA al resubir,
-- conservando su `id`. Resultado: las validaciones viejas apuntan al mismo
-- `documento_id` que las nuevas y no se distinguen por la relación. Tres
-- funciones leen `validaciones_documentos[0]` sin ordenar ni filtrar, así que
-- el producto muestra como verificado lo que ya no lo está.
--
-- Esta migración añade la llave que faltaba: un código de envío, común al
-- documento y a la validación que lo juzgó. Una validación cuenta solo si su
-- `envio_id` coincide con el del documento.
--
-- NO se aplica desde el conector: `apply_migration` está prohibido. La aplica
-- el dueño desde el panel.
--
-- Es aditiva y las columnas son nullable a propósito: `null` significa «sin
-- validación vigente», que es un estado legítimo y hoy no lo puede expresar.
-- Ninguna función desplegada lee estas columnas, así que aplicarla sin
-- desplegar el código deja el sistema exactamente como está.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Guarda: por qué columna se ordena
--
-- El relleno del paso 2 necesita la validación MÁS RECIENTE de cada documento,
-- y ninguna función del repo ordena `validaciones_documentos` hoy, así que el
-- nombre de la columna de fecha no está confirmado en el código. Se asume
-- `created_at`, que es la convención del resto del esquema.
--
-- Si no existe, esta migración se detiene aquí en vez de rellenar con un orden
-- arbitrario: elegir la validación equivocada dejaría datos caducados
-- presentados como vigentes, que es justo lo que viene a arreglar.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'validaciones_documentos'
       and column_name  = 'created_at'
  ) then
    raise exception
      'validaciones_documentos no tiene columna created_at. Detener y avisar: hace falta saber por cuál ordenar antes de rellenar.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Las columnas
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.documentos
  add column if not exists envio_id uuid;

alter table public.validaciones_documentos
  add column if not exists envio_id uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Relleno de lo existente. Nadie tiene que resubir nada.
--
-- El criterio no es una suposición: `crear-solicitud` pone `fecha_validacion` a
-- null al resubir, y `validar-documentos` la escribe al validar. Un documento
-- con `fecha_validacion` NO nula fue validado después de su última subida, y
-- como resubir es lo único que regenera `token_validacion`, el token actual de
-- su trabajador es el mismo que estaba vigente cuando se validó.
--
-- Un documento con `fecha_validacion` nula se queda en null: pasa a mostrarse
-- como pendiente de validación, que es la verdad.
-- ─────────────────────────────────────────────────────────────────────────────
update public.documentos d
   set envio_id = t.token_validacion
  from public.trabajadores t
 where d.trabajador_id = t.id
   and d.fecha_validacion is not null
   and d.envio_id is null;

-- La validación más reciente de cada documento hereda el mismo código. Las
-- anteriores se quedan sin `envio_id` y por tanto dejan de contar, que es
-- exactamente el efecto buscado.
update public.validaciones_documentos v
   set envio_id = d.envio_id
  from public.documentos d
 where v.documento_id = d.id
   and d.envio_id is not null
   and v.id = (
     select v2.id
       from public.validaciones_documentos v2
      where v2.documento_id = d.id
      order by v2.created_at desc
      limit 1
   );

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPROBACIÓN PREVIA — correr ANTES de aplicar
--
-- Al 12/08 daba 4 y 2. Si `quedarian_pendientes` sale muy por encima de 2, el
-- estado de la base cambió desde que se escribió esto: detenerse y avisar.
--
--   select
--     count(*) filter (where fecha_validacion is not null) as validados_vigentes,
--     count(*) filter (where fecha_validacion is null)     as quedarian_pendientes
--   from public.documentos;
--
-- Y la que resuelve la duda del paso 0 — qué columnas tiene de verdad la tabla:
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'validaciones_documentos'
--    order by ordinal_position;
--
-- ─────────────────────────────────────────────────────────────────────────────
-- COMPROBACIÓN POSTERIOR — correr DESPUÉS de aplicar
--
--   select
--     (select count(*) from public.documentos where envio_id is not null)              as docs_con_envio,
--     (select count(*) from public.documentos where envio_id is null)                  as docs_pendientes,
--     (select count(*) from public.validaciones_documentos where envio_id is not null)  as validaciones_vigentes,
--     (select count(*) from public.validaciones_documentos where envio_id is null)      as validaciones_caducadas;
--
-- `docs_con_envio` debe coincidir con `validados_vigentes` de la comprobación
-- previa, y `validaciones_vigentes` no puede ser mayor que `docs_con_envio`:
-- cada documento tiene como mucho una validación vigente.
-- ─────────────────────────────────────────────────────────────────────────────
