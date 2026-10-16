#!/usr/bin/env bash
# UX-73 · prueba del SQL de `pedidos/UX-73-enlace.sql` contra un Postgres local
# y desechable. El conector no tiene el grupo `database`, así que el SQL que
# corre el dueño no puede ejecutarse desde la sesión: esto evita mandárselo sin
# haberlo ejecutado nunca.
#
# Cuatro casos, y el segundo es el que importa:
#   1 · trabajador con 2 válidas y 1 rechazo → 2, 1, 3, y el enlace completo
#   2 · trabajador SIN evaluaciones          → 0, no 1. Es la trampa del LEFT JOIN
#   3 · trabajador sin `token_consulta`      → lo dice, en vez de devolver null
#   4 · el listado de quién tiene evaluaciones → ordena por válidas, 2 arriba
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN=/usr/lib/postgresql/16/bin
U=pgtest; BASE=/home/$U; PUERTO=5433; T=$BASE/t73

[ -x "$BIN/initdb" ] || { echo "No hay servidor Postgres en $BIN"; exit 1; }
id -u $U >/dev/null 2>&1 || useradd -m $U
rm -rf "$BASE/data73" "$T"; install -d -o $U "$T"

su $U -c "$BIN/initdb -D $BASE/data73 -U $U --auth=trust" >"$BASE/initdb73.log" 2>&1
su $U -c "$BIN/pg_ctl -D $BASE/data73 -l $BASE/server73.log -o '-k $BASE -p $PUERTO -c listen_addresses=' -w start"
trap "su $U -c '$BIN/pg_ctl -D $BASE/data73 -m immediate stop' >/dev/null 2>&1 || true" EXIT

psql_() { su $U -c "$BIN/psql -h $BASE -p $PUERTO -U $U -d postgres $*"; }

cat > "$T/esquema.sql" <<'SQL'
create table public.trabajadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, rut text unique not null,
  token_consulta uuid default gen_random_uuid()
);
create table public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid references public.trabajadores(id),
  rechazo text
);

-- 1 · el de la prueba: dos válidas y un rechazo
insert into public.trabajadores (nombre, rut) values ('Ana Pérez', '11.111.111-1');
insert into public.evaluaciones (trabajador_id, rechazo)
select id, null from public.trabajadores where rut = '11.111.111-1';
insert into public.evaluaciones (trabajador_id, rechazo)
select id, null from public.trabajadores where rut = '11.111.111-1';
insert into public.evaluaciones (trabajador_id, rechazo)
select id, 'NO TRABAJO CONMIGO' from public.trabajadores where rut = '11.111.111-1';

-- 2 · sin ninguna evaluación
insert into public.trabajadores (nombre, rut) values ('Juan Soto', '22.222.222-2');

-- 3 · sin token_consulta
insert into public.trabajadores (nombre, rut, token_consulta) values ('Sin Token', '33.333.333-3', null);
SQL

cp "$REPO/pedidos/UX-73-enlace.sql" "$T/enlace.sql"
cp "$REPO/pedidos/UX-73-con-evaluaciones.sql" "$T/con-evaluaciones.sql"
# Los casos 2 y 3 usan el mismo SQL cambiando solo el RUT.
sed "s/'11.111.111-1'/'22.222.222-2'/" "$T/enlace.sql" > "$T/enlace2.sql"
sed "s/'11.111.111-1'/'33.333.333-3'/" "$T/enlace.sql" > "$T/enlace3.sql"
chown -R $U "$T"

psql_ "-v ON_ERROR_STOP=1 -q -f $T/esquema.sql"
linea() { printf '%s\n' "════════════════════════════════════════════════════════════════════════"; }

linea; echo "1 · dos válidas y un rechazo → se esperan 2, 1, 3"
psql_ "-x -f $T/enlace.sql"
linea; echo "2 · sin evaluaciones → se espera 0, no 1"
psql_ "-x -f $T/enlace2.sql"
linea; echo "3 · sin token_consulta → lo dice en vez de devolver null"
psql_ "-x -f $T/enlace3.sql"
linea; echo "4 · quién tiene evaluaciones → Ana primero con 2, los otros dos con 0"
psql_ "-f $T/con-evaluaciones.sql"
