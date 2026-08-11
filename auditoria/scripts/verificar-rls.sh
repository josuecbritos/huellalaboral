#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Verificador empírico de RLS — Huella Laboral (paso 5.3, pre-autorizado D-3)
#
# Comprueba si la anon key sirve para leer o escribir en PostgREST saltándose
# las edge functions. El MCP entra con service_role y salta RLS, así que leer
# las políticas no basta: esto las prueba desde fuera, como lo haría cualquiera.
#
# RESTRICCIONES (D-3):
#   - Solo la clave anon PÚBLICA, leída de los HTML del repo. Nunca service_role.
#   - Lecturas, y escrituras que DEBEN fallar.
#   - Ningún dato real se escribe. Ningún dato personal se imprime: solo se
#     cuentan filas y se registran códigos HTTP.
# ---------------------------------------------------------------------------
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
URL="https://dxblzmxcmaerycvdgfpy.supabase.co"

ANON="$(grep -ohE "eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+" "$REPO"/*.html | sort -u | head -1)"
if [ -z "$ANON" ]; then echo "No se encontró la anon key en los HTML."; exit 1; fi
# Salvaguarda: abortar si la clave no es de rol anon. El payload base64url del
# JWT suele venir sin padding, así que se lo añadimos antes de decodificar.
PAYLOAD_B64="$(echo "$ANON" | cut -d. -f2)"
while [ $(( ${#PAYLOAD_B64} % 4 )) -ne 0 ]; do PAYLOAD_B64="${PAYLOAD_B64}="; done
CLAIMS="$(echo "$PAYLOAD_B64" | tr '_-' '/+' | base64 -d 2>/dev/null || true)"
case "$CLAIMS" in
  *'"role":"anon"'*) : ;;
  *) echo "ABORTADO: la clave encontrada no es de rol anon."; exit 1 ;;
esac

TABLAS="trabajadores evaluaciones documentos empleadores_solicitados validaciones_documentos usuarios procesos candidatos_proceso"
FALLOS=0

hdr=(-H "apikey: $ANON" -H "Authorization: Bearer $ANON")

# ---------------------------------------------------------------------------
# PREFLIGHT — sin esto el script miente.
#
# Si la petición no sale de la máquina, curl devuelve 000. Interpretar ese 000
# como "RLS bloqueó el acceso" es exactamente el error que hace inútil a un
# verificador: informa de que todo está bien porque no probó nada. Abortamos
# antes de emitir ningún veredicto.
# ---------------------------------------------------------------------------
PING="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${hdr[@]}" "$URL/rest/v1/" || true)"
if [ "$PING" = "000" ]; then
  echo "ABORTADO: no hay conexión con $URL (curl devuelve 000)."
  echo
  echo "  NO se ha probado nada. Este script no puede distinguir 'RLS bloqueó"
  echo "  la lectura' de 'la petición nunca salió de la máquina', así que"
  echo "  prefiere no dar ningún veredicto antes que dar uno falso."
  echo
  echo "  Causa típica: proxy de salida o cortafuegos. Ejecútalo desde una"
  echo "  máquina con salida directa a internet."
  exit 2
fi
echo "Preflight OK — $URL responde (HTTP $PING). Empieza la verificación."
echo

echo "=================================================================="
echo " 1. LECTURA anónima directa contra PostgREST  (esperado: 0 filas)"
echo "=================================================================="
printf "%-26s %-6s %-8s %s\n" TABLA HTTP FILAS VEREDICTO
for t in $TABLAS; do
  body="$(curl -s "${hdr[@]}" "$URL/rest/v1/$t?select=*&limit=5")"
  code="$(curl -s -o /dev/null -w '%{http_code}' "${hdr[@]}" "$URL/rest/v1/$t?select=*&limit=5")"
  if echo "$body" | grep -q '^\['; then
    n="$(echo "$body" | grep -o '"id"' | wc -l | tr -d ' ')"
  else n="err"; fi
  if [ "$code" = "000" ]; then v="INDETERMINADO (sin conexion)"; FALLOS=$((FALLOS+1))
  elif [ "$n" = "0" ] || [ "$code" != "200" ]; then v="OK (bloqueado)"
  else v="!! FUGA !!"; FALLOS=$((FALLOS+1)); fi
  printf "%-26s %-6s %-8s %s\n" "$t" "$code" "$n" "$v"
done

echo
echo "=================================================================="
echo " 2. ESCRITURA anónima  (esperado: rechazo 401/403/404)"
echo "=================================================================="
printf "%-26s %-6s %s\n" TABLA HTTP VEREDICTO
# Payloads sintácticamente válidos pero que NUNCA deben llegar a insertarse.
declare -A PAYLOAD=(
  [trabajadores]='{"nombre":"AUDIT-NO-INSERTAR","rut":"00000000-0","email":"audit@invalid.test"}'
  [evaluaciones]='{"token":"AUDIT-NO-INSERTAR","puntualidad":5,"desempeno":5}'
  [procesos]='{"cargo":"AUDIT-NO-INSERTAR"}'
)
for t in trabajadores evaluaciones procesos; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${hdr[@]}" \
        -H "Content-Type: application/json" -d "${PAYLOAD[$t]}" "$URL/rest/v1/$t")"
  if [ "$code" = "000" ]; then v="INDETERMINADO (sin conexion)"; FALLOS=$((FALLOS+1))
  elif [ "$code" = "201" ] || [ "$code" = "200" ]; then v="!! ESCRITURA ACEPTADA !!"; FALLOS=$((FALLOS+1))
  else v="OK (rechazado)"; fi
  printf "%-26s %-6s %s\n" "$t" "$code" "$v"
done

echo
echo "=================================================================="
echo " 3. STORAGE anónimo  (esperado: rechazo)"
echo "=================================================================="
for b in certificados finiquitos; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${hdr[@]}" "$URL/storage/v1/object/list/$b" -X POST -H "Content-Type: application/json" -d '{"prefix":"","limit":3}')"
  if [ "$code" = "000" ]; then v="INDETERMINADO (sin conexion)"; FALLOS=$((FALLOS+1))
  elif [ "$code" = "200" ]; then v="!! LISTABLE !!"; FALLOS=$((FALLOS+1))
  else v="OK (bloqueado)"; fi
  printf "%-26s %-6s %s\n" "$b" "$code" "$v"
done

echo
echo "=================================================================="
if [ "$FALLOS" -eq 0 ]; then
  echo " RESULTADO: RLS aguanta. La puerta paralela (anon -> PostgREST) está cerrada."
else
  echo " RESULTADO: $FALLOS FALLO(S). Hay acceso anónimo directo a la base."
fi
echo "=================================================================="
exit 0
