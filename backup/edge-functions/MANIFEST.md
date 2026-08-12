# Respaldo de edge functions — punto de retorno

Recuperado vía MCP de Supabase el **8 de agosto de 2026**, proyecto `dxblzmxcmaerycvdgfpy`.

Regenerados después:

- `crear-reclutador.ts` el **11/08** al cerrar H-01 (versión 14 → 15).
- `obtener-proceso.ts`, `gestionar-proceso.ts`, `agregar-candidato.ts` y `obtener-stats.ts` el
  **11/08** al cerrar H-04, H-05 y H-10.

**19 funciones · 2,690 líneas · 99,156 bytes (96.8 KB)**

Contenido íntegro y literal de cada `index.ts` desplegado, un archivo por función,
sin resumir ni reformatear. `version` es la versión activa en producción al momento
del respaldo; `ezbr_sha256` es el hash que reporta Supabase para ese despliegue.

| Archivo | Versión | Líneas | Bytes | ezbr_sha256 |
|---------|--------:|-------:|------:|-------------|
| `crear-solicitud.ts` | 26 | 369 | 15,620 | `e98e255beb35d065…` |
| `agregar-candidato.ts` | 11 | 357 | 14,124 | `bca77d9e7c7e9d23…` |
| `crear-reclutador.ts` | 15 | 235 | 9,784 | `61f1889065d7fb7b…` |
| `obtener-candidato.ts` | 9 | 162 | 5,810 | `dcd511dabb97f863…` |
| `guardar-evaluacion.ts` | 6 | 162 | 5,691 | `135ddbc708529bb1…` |
| `establecer-password.ts` | 6 | 116 | 4,252 | `3c38ab72175f3d99…` |
| `gestionar-usuario.ts` | 6 | 112 | 3,907 | `3bbb34491e55c9b9…` |
| `listar-procesos.ts` | 5 | 72 | 2,304 | `e6755386155abbb8…` |
| `obtener-evaluacion.ts` | 4 | 81 | 2,657 | `338cd97b8dc8057f…` |
| `validar-documentos.ts` | 4 | 126 | 3,931 | `3a8b84a2d37997d7…` |
| `crear-proceso.ts` | 4 | 82 | 2,489 | `f77e34079efb1e7f…` |
| `autenticar.ts` | 3 | 108 | 3,646 | `89407d4afe037367…` |
| `listar-usuarios.ts` | 3 | 64 | 2,180 | `da020c2b3433b0ff…` |
| `obtener-estado.ts` | 3 | 104 | 3,504 | `81a431f3297027b9…` |
| `obtener-validacion.ts` | 2 | 94 | 3,062 | `5ea07f36a8943354…` |
| `obtener-proceso.ts` | 3 | 116 | 4,295 | `f3c1110b5adc901a…` |
| `obtener-stats.ts` | 3 | 144 | 5,394 | `579d2aaea7922de9…` |
| `gestionar-proceso.ts` | 3 | 136 | 4,905 | `76d6df201f16825f…` |
| `auth-test.ts` | 1 | 50 | 1,601 | `53aade882951fc84…` |

## Notas

- Las 19 tienen `verify_jwt: true`.
- **No hay secretos en el código.** Las cuatro variables sensibles se leen del entorno:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`.
  Esos valores **no** están en este respaldo y deben reponerse desde el panel de Supabase.
- Este respaldo cubre solo el código de las funciones. **No** incluye esquema de base
  de datos, políticas RLS, contenido de Storage ni configuración del proyecto.
- El respaldo original del 08/08 se tomó sin desplegar ni modificar nada. Los cinco archivos
  regenerados después son distintos: se regeneran **tras** el despliegue, copiando el fuente que
  quedó vivo, y por eso llevan su propia comprobación abajo.

## Los cinco archivos regenerados, y cómo se comprobaron

| Archivo | Hallazgo | Fecha | Cómo se comprobó que es copia de producción |
|---------|----------|-------|---------------------------------------------|
| `crear-reclutador.ts` | H-01 | 11/08 | **Byte a byte.** `cmp` y `diff -u` sin diferencias contra `get_edge_function` |
| `obtener-proceso.ts` | H-04 | 11/08 | Leído de vuelta de producción tras desplegar y comparado con el archivo |
| `gestionar-proceso.ts` | H-05 | 11/08 | Igual |
| `agregar-candidato.ts` | H-10 | 11/08 | Igual |
| `obtener-stats.ts` | H-10 | 11/08 | Igual |

Las cuatro de H-04/H-05/H-10 se comprobaron con un grado menos de rigor que `crear-reclutador.ts`:
se leyó el fuente vivo con `get_edge_function` y se comparó con el archivo, pero no se hizo el
`cmp` byte a byte. Tres cosas sostienen la equivalencia igualmente:

- El archivo del respaldo es copia del que se envió a desplegar, no una reconstrucción.
- Ninguna de las cuatro termina en salto de línea, igual que el fuente que devuelve producción.
- En H-01 se demostró que el viaje de ida y vuelta por el MCP es fiel: lo enviado volvió idéntico.

**Las 14 funciones no tocadas siguen con literalidad inferida** del respaldo del 08/08: se ha
comprobado que su versión y su `ezbr_sha256` no se han movido, lo que descarta que hayan cambiado
después, pero no que la copia se tomara sin pérdida ese día.
