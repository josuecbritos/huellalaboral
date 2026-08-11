# Respaldo de edge functions — punto de retorno

Recuperado vía MCP de Supabase el **8 de agosto de 2026**, proyecto `dxblzmxcmaerycvdgfpy`.
`crear-reclutador.ts` regenerado el **11 de agosto de 2026** al cerrar H-01 (versión 14 → 15).

**19 funciones · 2,475 líneas · 89,921 bytes (87.8 KB)**

Contenido íntegro y literal de cada `index.ts` desplegado, un archivo por función,
sin resumir ni reformatear. `version` es la versión activa en producción al momento
del respaldo; `ezbr_sha256` es el hash que reporta Supabase para ese despliegue.

| Archivo | Versión | Líneas | Bytes | ezbr_sha256 |
|---------|--------:|-------:|------:|-------------|
| `crear-solicitud.ts` | 26 | 369 | 15,620 | `e98e255beb35d065…` |
| `agregar-candidato.ts` | 10 | 295 | 11,438 | `013946e5009b08ae…` |
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
| `obtener-proceso.ts` | 2 | 68 | 2,302 | `87f3bc6c841d31aa…` |
| `obtener-stats.ts` | 2 | 88 | 2,931 | `37456d6a1f22ab6a…` |
| `gestionar-proceso.ts` | 2 | 87 | 2,812 | `931b23ccd43bd84e…` |
| `auth-test.ts` | 1 | 50 | 1,601 | `53aade882951fc84…` |

## Notas

- Las 19 tienen `verify_jwt: true`.
- **No hay secretos en el código.** Las cuatro variables sensibles se leen del entorno:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`.
  Esos valores **no** están en este respaldo y deben reponerse desde el panel de Supabase.
- Este respaldo cubre solo el código de las funciones. **No** incluye esquema de base
  de datos, políticas RLS, contenido de Storage ni configuración del proyecto.
- Nada se desplegó ni se modificó en producción al generar este respaldo.
