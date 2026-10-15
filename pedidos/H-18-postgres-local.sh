#!/usr/bin/env bash
# H-18 · prueba del bloque de comprobación contra un Postgres local y desechable.
#
# El conector MCP no tiene el grupo `database`, así que ni la migración ni el bloque de
# comprobación se pueden ejecutar contra el proyecto. Esto los ejecuta contra una réplica
# mínima —la función de fechas y cuatro tablas, tres con su disparador— para que el bloque
# que corre el dueño en el editor SQL no sea la primera vez que se ejecuta.
#
# Cinco comprobaciones:
#   1 · el bloque encuentra solo las tablas cuyo disparador usa la función
#   2 · informa que la fecha de modificación cambió, y qué campo cambió
#   3 · el error intencional deshace el UPDATE: las fechas quedan como estaban
#   4 · con el search_path ya fijado, la función sigue funcionando
#   5 · control: con una función que no pone la fecha, el bloque dice ATENCIÓN y no OK
#
# Postgres no corre como root y la carpeta del scratchpad es 0700, así que el cúmulo va en
# el home de un usuario propio.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN=/usr/lib/postgresql/16/bin
USUARIO=pgtest
BASE=/home/$USUARIO
PUERTO=5433
T=$BASE/t

[ -x "$BIN/initdb" ] || { echo "No hay servidor Postgres en $BIN"; exit 1; }

id -u $USUARIO >/dev/null 2>&1 || useradd -m $USUARIO
rm -rf "$BASE/data" "$T"
install -d -o $USUARIO "$T"

su $USUARIO -c "$BIN/initdb -D $BASE/data -U $USUARIO --auth=trust" >"$BASE/initdb.log" 2>&1
su $USUARIO -c "$BIN/pg_ctl -D $BASE/data -l $BASE/server.log -o '-k $BASE -p $PUERTO -c listen_addresses=' -w start"
trap "su $USUARIO -c '$BIN/pg_ctl -D $BASE/data -m immediate stop' >/dev/null 2>&1 || true" EXIT

psql_() { su $USUARIO -c "$BIN/psql -h $BASE -p $PUERTO -U $USUARIO -d postgres $*"; }

cp "$REPO/pedidos/H-18-comprobacion.sql" "$T/comprobacion.sql"
cp "$REPO/supabase/migrations/20261012_h18_search_path_update_updated_at.sql" "$T/migracion.sql"

cat > "$T/esquema.sql" <<'SQL'
create function public.update_updated_at_column() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.trabajadores (
  id uuid primary key default gen_random_uuid(),
  nombre text, rut text, estado text default 'pendiente',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  storage_path text, envio_id uuid, updated_at timestamptz default now()
);
create table public.vacia          (id int primary key, updated_at timestamptz default now());
create table public.sin_disparador (id int primary key, updated_at timestamptz default now());

create trigger trg_trabajadores before update on public.trabajadores
  for each row execute function public.update_updated_at_column();
create trigger trg_documentos before update on public.documentos
  for each row execute function public.update_updated_at_column();
create trigger trg_vacia before update on public.vacia
  for each row execute function public.update_updated_at_column();

insert into public.trabajadores (nombre, rut) values ('Ana Pérez', '11.111.111-1'), ('Juan Soto', '22.222.222-2');
insert into public.documentos (storage_path) values ('certificados/a.pdf');
insert into public.sin_disparador (id) values (1);
SQL

cat > "$T/fechas.sql" <<'SQL'
select 'trabajadores' as tabla, max(updated_at) as ultima from public.trabajadores
union all select 'documentos', max(updated_at) from public.documentos;
SQL

cat > "$T/control.sql" <<'SQL'
begin;
create or replace function public.update_updated_at_column() returns trigger
language plpgsql as $$ begin return new; end; $$;
\i /home/pgtest/t/comprobacion.sql
rollback;
SQL

chown -R $USUARIO "$T"

linea() { printf '%s\n' "════════════════════════════════════════════════════════════════════════"; }
psql_ "-v ON_ERROR_STOP=1 -q -f $T/esquema.sql"

linea; echo "1 y 2 · El bloque, antes de aplicar la migración"
psql_ "-f $T/comprobacion.sql" 2>&1 || true

linea; echo "3 · Las fechas después del error intencional (no deben haberse movido)"
ANTES=$(psql_ "-tA -f $T/fechas.sql")
echo "$ANTES"

linea; echo "4 · Aplicar la migración y volver a correr el bloque"
psql_ "-v ON_ERROR_STOP=1 -f $T/migracion.sql"
psql_ "-tAc \"select proconfig from pg_proc where proname = 'update_updated_at_column'\""
psql_ "-f $T/comprobacion.sql" 2>&1 || true

linea; echo "5 · Control: una función que no pone la fecha"
psql_ "-f $T/control.sql" 2>&1 || true

linea; echo "Las fechas, al final de todo:"
psql_ "-tA -f $T/fechas.sql"
echo
echo "Si las dos fechas de arriba son las mismas que las del paso 3, nada se guardó."
