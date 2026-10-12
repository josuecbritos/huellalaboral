-- H-18 · comprobación. No guarda nada: termina con un error intencional que lo deshace todo.
do $h18$
declare
  r           record;
  v_col       text;
  v_ctid      tid;
  v_antes     jsonb;
  v_despues   jsonb;
  v_clave     text;
  v_distintas text[];
  v_conf      text;
  v_tablas    int := 0;
  v_reporte   text;
begin
  select coalesce(array_to_string(p.proconfig, ', '), 'SIN FIJAR')
    into v_conf
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'update_updated_at_column';

  v_reporte :=
      'H-18 · comprobación de update_updated_at_column. NADA DE ESTO SE GUARDA.' || chr(10)
   || 'search_path de la función: ' || coalesce(v_conf, 'LA FUNCIÓN NO EXISTE') || chr(10)
   || '(esperado tras aplicar la migración: search_path=pg_catalog, public)' || chr(10)
   || chr(10) || 'Tablas cuyo disparador la usa:' || chr(10);

  for r in
    select n.nspname as esquema, c.relname as tabla, t.tgname as disparador
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace pn on pn.oid = p.pronamespace
     where p.proname = 'update_updated_at_column'
       and pn.nspname = 'public'
       and not t.tgisinternal
     order by n.nspname, c.relname, t.tgname
  loop
    v_tablas := v_tablas + 1;

    -- Primera columna de la tabla: se le asigna su propio valor, para que el UPDATE
    -- no cambie ningún dato y aun así dispare el trigger.
    select a.attname
      into v_col
      from pg_attribute a
     where a.attrelid = format('%I.%I', r.esquema, r.tabla)::regclass
       and a.attnum > 0
       and not a.attisdropped
     order by a.attnum
     limit 1;

    v_ctid := null;
    v_antes := null;
    execute format('select t.ctid, to_jsonb(t) from %I.%I t limit 1', r.esquema, r.tabla)
       into v_ctid, v_antes;

    if v_antes is null then
      v_reporte := v_reporte
        || format('  %-26s %-28s tabla vacía, no hay fila que actualizar', r.tabla, r.disparador)
        || chr(10);
      continue;
    end if;

    execute format(
        'update %I.%I as t set %I = t.%I where t.ctid = $1 returning to_jsonb(t)',
        r.esquema, r.tabla, v_col, v_col)
       into v_despues
      using v_ctid;

    select coalesce(array_agg(clave order by clave), array[]::text[])
      into v_distintas
      from jsonb_object_keys(v_antes) as clave
     where v_antes -> clave is distinct from v_despues -> clave;

    if coalesce(array_length(v_distintas, 1), 0) = 1 then
      v_clave := v_distintas[1];
      v_reporte := v_reporte
        || format('  %-26s %-28s OK · solo cambió %s: %s → %s',
                  r.tabla, r.disparador, v_clave,
                  v_antes ->> v_clave, v_despues ->> v_clave)
        || chr(10);
    elsif coalesce(array_length(v_distintas, 1), 0) = 0 then
      v_reporte := v_reporte
        || format('  %-26s %-28s ATENCIÓN · no cambió ningún campo: el disparador no puso la fecha',
                  r.tabla, r.disparador)
        || chr(10);
    else
      v_reporte := v_reporte
        || format('  %-26s %-28s ATENCIÓN · cambiaron varios campos: %s',
                  r.tabla, r.disparador, array_to_string(v_distintas, ', '))
        || chr(10);
    end if;
  end loop;

  if v_tablas = 0 then
    v_reporte := v_reporte
      || '  ninguna · ningún disparador usa la función (revisar antes de dar nada por bueno)'
      || chr(10);
  end if;

  raise exception '%', v_reporte || chr(10)
    || '*** ESTE ERROR ES INTENCIONAL. Es lo que deshace el UPDATE de cada tabla. ***'
    || chr(10)
    || '*** Si lo ves, la comprobación terminó bien y la base quedó como estaba. ***';
end
$h18$;
