# Pedido · H-01 · `crear-reclutador` no comprueba autorización

**Proyecto:** Huella Laboral · Supabase `dxblzmxcmaerycvdgfpy` · repo `josuecbritos/huellalaboral`
**Severidad:** 🔴 Crítica · SEG · Esfuerzo S
**Estado:** pedido abierto, sin ejecutar

## Problema

`crear-reclutador` no lee `x-user-token`. No hay comprobación de autorización de ninguna clase:
entra al `try`, parsea el body y opera con `SUPABASE_SERVICE_ROLE_KEY`.

Con la anon key pública, cualquiera puede crear una cuenta de reclutador y recibir el enlace de
contraseña en su propio buzón — esto habilita H-04, H-05 y H-08. Y por el mismo agujero,
reactivar usuarios eliminados vía `confirm_reactivate`.

`verify_jwt: true` no protege: la anon key es un JWT válido.

## Solución acordada

Alta cerrada: solo `ADMIN_EMAIL` crea o reactiva cuentas. Replica la comprobación que ya tienen
`listar-usuarios` y `gestionar-usuario` — 401 sin token, 401 con token inválido, 403 si el email
no es el de admin.

Que la comprobación cubra también el camino de reactivación.

## Alcance

Solo `crear-reclutador`. Contexto ya verificado que acota el trabajo:

- **`admin.html` ya envía `x-user-token`** en sus dos llamadas. Es el único llamador. No lo toques.
- **El `try/catch` vacío del envío Resend es H-06**, se atiende aparte. Déjalo como está aunque
  lo veas mal — el diff tiene que ser revisable.
- **Migraciones prohibidas.** El esquema no se toca.
- No cambies `verify_jwt` ni la configuración CORS.
- No modifiques la lógica de reactivación, huérfanos en Auth, rollback ni plantillas de correo.

## Criterios de aceptación

- [ ] 401 sin cabecera · 401 con token inválido · 403 si el email no es `ADMIN_EMAIL`
- [ ] Las tres respuestas con `corsHeaders` y `Content-Type: application/json`
- [ ] La reactivación queda cubierta por la misma comprobación
- [ ] `ADMIN_EMAIL` leído con `Deno.env.get()`, cero literales
- [ ] Diff contra `backup/edge-functions/crear-reclutador.ts` (commit `4622d62`): solo el bloque
      añadido, ninguna otra línea tocada
- [ ] `git status` limpio en el resto del repo

## Punto de retorno

`backup/edge-functions/crear-reclutador.ts`, commit `4622d62` — versión 14, verificado idéntico
a producción. Revertir = redesplegar ese archivo.

## Despliegue

**No despliegues.** Entrega el archivo modificado y el diff. El dueño despliega tras aprobar, y
corre después una verificación funcional propia sobre producción.
