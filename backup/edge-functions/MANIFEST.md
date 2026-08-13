# Respaldo de edge functions — punto de retorno

Recuperado vía MCP de Supabase el **8 de agosto de 2026**, proyecto `dxblzmxcmaerycvdgfpy`.

Regenerados después:

- `crear-reclutador.ts` el **11/08** al cerrar H-01 (versión 14 → 15).
- `obtener-proceso.ts`, `gestionar-proceso.ts`, `agregar-candidato.ts` y `obtener-stats.ts` el
  **11/08** al cerrar H-04, H-05 y H-10.
- `crear-solicitud.ts`, `obtener-validacion.ts` y `validar-documentos.ts` el **11/08** al cerrar
  H-02, H-03 y H-35.
- `crear-solicitud.ts`, `validar-documentos.ts`, `obtener-estado.ts`, `obtener-candidato.ts` y
  `agregar-candidato.ts` el **12/08** con la cadena de validación de documentos.
- `agregar-candidato.ts` el **13/08** al nombrar empresa y cargo en M-4 y M-5, dos veces:
  versión 12 → 13, y 13 → 14 al pasar el asunto de M-5 a pretérito. **La vigente es la 14.**
- `crear-solicitud.ts` el **13/08** al decir en M-1 de dónde salió el correo (versión 28 → 29).

**19 funciones · 3,004 líneas · 115,858 bytes (113.1 KB)**

Las líneas son líneas de contenido. Ningún archivo termina en salto de línea, así que `wc -l`
devuelve una menos por archivo: 2,985 + 19 = 3,004.

Contenido íntegro y literal de cada `index.ts` desplegado, un archivo por función,
sin resumir ni reformatear. `version` es la versión activa en producción al momento
del respaldo; `ezbr_sha256` es el hash que reporta Supabase para ese despliegue.

| Archivo | Versión | Líneas | Bytes | ezbr_sha256 |
|---------|--------:|-------:|------:|-------------|
| `crear-solicitud.ts` | 29 | 402 | 17,626 | `995c4fd2027d4a0a…` |
| `agregar-candidato.ts` | 14 | 482 | 20,511 | `dc96cc1e6098554f…` |
| `crear-reclutador.ts` | 15 | 235 | 9,784 | `61f1889065d7fb7b…` |
| `obtener-candidato.ts` | 10 | 203 | 8,073 | `0a2d25029e24236f…` |
| `guardar-evaluacion.ts` | 6 | 162 | 5,691 | `135ddbc708529bb1…` |
| `establecer-password.ts` | 6 | 116 | 4,252 | `3c38ab72175f3d99…` |
| `gestionar-usuario.ts` | 6 | 112 | 3,907 | `3bbb34491e55c9b9…` |
| `listar-procesos.ts` | 5 | 72 | 2,304 | `e6755386155abbb8…` |
| `obtener-evaluacion.ts` | 4 | 81 | 2,657 | `338cd97b8dc8057f…` |
| `validar-documentos.ts` | 6 | 180 | 6,653 | `eb8d2ac25ceab54f…` |
| `crear-proceso.ts` | 4 | 82 | 2,489 | `f77e34079efb1e7f…` |
| `autenticar.ts` | 3 | 108 | 3,646 | `89407d4afe037367…` |
| `listar-usuarios.ts` | 3 | 64 | 2,180 | `da020c2b3433b0ff…` |
| `obtener-estado.ts` | 4 | 145 | 5,767 | `8e9b0eb2f3e75d2b…` |
| `obtener-validacion.ts` | 3 | 114 | 4,123 | `b5e8f62d4d781b9e…` |
| `obtener-proceso.ts` | 3 | 116 | 4,295 | `f3c1110b5adc901a…` |
| `obtener-stats.ts` | 3 | 144 | 5,394 | `579d2aaea7922de9…` |
| `gestionar-proceso.ts` | 3 | 136 | 4,905 | `76d6df201f16825f…` |
| `auth-test.ts` | 1 | 50 | 1,601 | `53aade882951fc84…` |

## Comprobación del punto de retorno — 11 de agosto de 2026

| Qué se comprobó | Alcance | Resultado |
|-----------------|---------|-----------|
| Versión y `ezbr_sha256` de la tabla vs. `list_edge_functions` | Las 19 | Coinciden. Producción no se movió desde el respaldo |
| Líneas y bytes de la tabla vs. el archivo en disco | Las 19 | Coinciden. 2.918 líneas, 111.464 bytes |
| Fuente de producción vs. el archivo, byte a byte | `crear-reclutador.ts` | **Idéntico.** sha256 `dcd8ba6d80cd2425759a163c3261dbb96a73856c111fa7330f81edf36f264189` |

La tercera fila es la que convierte la literalidad de inferida en comprobada, y por ahora solo
cubre `crear-reclutador.ts`. Para el resto, lo comprobado es que producción está en la misma
versión y con el mismo `ezbr_sha256` que registra la tabla. El detalle por archivo está abajo.

**Los recuentos de esa tabla son del 11/08 y no se han rehecho.** Desde entonces se regeneró
`agregar-candidato.ts` dos veces y `crear-solicitud.ts` una (13/08), así que el total vigente es el de la cabecera —3.004
líneas, 115.858 bytes—, no el de la fila. La comprobación de versión y `ezbr_sha256` sí se repitió
antes de desplegar el 13/08: las 19 seguían donde el respaldo decía.

## Notas

- Las 19 tienen `verify_jwt: true`.
- **No hay secretos en el código.** Las cuatro variables sensibles se leen del entorno:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`.
  Esos valores **no** están en este respaldo y deben reponerse desde el panel de Supabase.
- Este respaldo cubre solo el código de las funciones. **No** incluye esquema de base
  de datos, políticas RLS, contenido de Storage ni configuración del proyecto.
- El respaldo original del 08/08 se tomó sin desplegar ni modificar nada. Los diez archivos
  regenerados después son distintos: se regeneran **tras** el despliegue, copiando el fuente que
  quedó vivo, y por eso llevan su propia comprobación abajo.

## Los diez archivos regenerados, y con qué rigor se comprobó cada uno

No todos tienen el mismo respaldo detrás. La columna dice exactamente qué se hizo, para que nadie
lea más garantía de la que hay.

| Archivo | Hallazgo | Cómo se comprobó que es copia de producción |
|---------|----------|---------------------------------------------|
| `crear-reclutador.ts` | H-01 | **Byte a byte.** `cmp` y `diff -u` sin diferencias contra `get_edge_function` |
| `obtener-proceso.ts` | H-04 | Leído de vuelta de producción tras desplegar y comparado |
| `gestionar-proceso.ts` | H-05 | Igual |
| `agregar-candidato.ts` | H-10, luego M-4/M-5 | **La v13 sí se leyó de vuelta y se comparó; la v14 que hay en el archivo, no.** Ver la nota de abajo |
| `obtener-stats.ts` | H-10 | Igual |
| `crear-solicitud.ts` | H-02/H-03, luego M-1 | **Solo copia del fuente enviado a desplegar.** No leída de vuelta. La vigente es la v29 del 13/08 |
| `obtener-validacion.ts` | H-02 | Igual |
| `validar-documentos.ts` | H-03 | Igual |
| `obtener-estado.ts` | Cadena de validación | Igual |
| `obtener-candidato.ts` | Cadena de validación | Igual |

Las cinco últimas son las de menor rigor y conviene decir por qué: releerlas de producción habría
costado mucho contexto sin añadir gran cosa. Lo que sostiene la equivalencia:

- El archivo del respaldo es copia literal del que se envió a desplegar, no una reconstrucción:
  `cmp` contra `supabase/functions/<nombre>/index.ts` sin diferencias.
- Ninguno termina en salto de línea, igual que el fuente que devuelve producción.
- En H-01 se demostró que el viaje de ida y vuelta por el MCP es fiel: lo enviado volvió idéntico.

**`agregar-candidato.ts` merece una nota aparte, porque su fila mezcla dos despliegues.** La v13 se
leyó de vuelta de producción y se comparó con el fuente. La **v14** —el cambio del asunto de M-5 a
pretérito, que es la que está en el archivo— se desplegó y **no** se releyó: el respaldo es copia
del fuente enviado, comprobada con `cmp` contra `supabase/functions/agregar-candidato/index.ts`.
Lo que sostiene la equivalencia es lo mismo que en las cinco de abajo, más un dato propio: la v13
del mismo archivo hizo el viaje de ida y vuelta sin perder nada.

Si en algún momento hace falta el punto de retorno con garantía plena, la comprobación pendiente
es un `get_edge_function` y un `cmp` por archivo. No es urgente, pero tampoco está hecha.

**Las 9 funciones no tocadas siguen con literalidad inferida** del respaldo del 08/08: se ha
comprobado que su versión y su `ezbr_sha256` no se han movido, lo que descarta que hayan cambiado
después, pero no que la copia se tomara sin pérdida ese día.
