# Huella Laboral — Documento técnico

**Qué es este documento.** El mapa de cómo está construido el sistema: dónde vive cada cosa y
qué la protege. Se consulta para saber **dónde tocar**. El porqué está en `FUNCIONAL.md`.

**Este documento describe el estado actual y se actualiza en cada iteración.** Documentación
desactualizada miente con autoridad.

**Actualizado:** 11 de agosto de 2026 · **Estado del código:** H-01 cerrado (`crear-reclutador`
versión 15, desplegada y verificada en producción)

---

## 1. Stack

| Capa | Qué es |
|------|--------|
| Frontend | 12 HTML planos, sin build, desplegados en Vercel |
| Backend | 19 edge functions en Supabase (Deno) |
| Datos | Postgres, 8 tablas en `public`, RLS activo en todas |
| Archivos | Supabase Storage, buckets `certificados` y `finiquitos` |
| Correo | Resend, `fetch` directo a su API |
| Proyecto | `dxblzmxcmaerycvdgfpy` · repo `josuecbritos/huellalaboral` |

**Secretos:** centralizados a nivel de proyecto, leídos con `Deno.env.get()`. Cero literales en
el código. Cero `service_role` en el historial de git.

## 2. Autenticación y roles

**`hl_token` es el `access_token` JWT de Supabase Auth**, no un token propio. `autenticar`
envuelve `signInWithPassword` y devuelve el token de Auth tal cual; `login.html` lo guarda en
`localStorage` como `hl_token`.

**El rol no viaja en el token.** Se deriva por ausencia:

- Autentica bien y **no tiene fila en `usuarios`** + email == `ADMIN_EMAIL` → **admin**
- Autentica bien y **tiene fila en `usuarios`** → **reclutador**

No existe columna de rol en ninguna tabla. **Consecuencia:** toda función que necesite saber si
el llamante es admin debe volver a comparar `authUser.email` contra `Deno.env.get('ADMIN_EMAIL')`.
No puede leerlo del token.

**`verify_jwt: true` está activo en las 19 funciones y no autentica a nadie.** El
`Authorization: Bearer` es la anon key, publicada en 8 HTML del repo. La anon key es un JWT
válido, así que pasa el gateway.

**Sesión:** el access token expira en 1 hora y no se renueva ni avisa (H-16).
**`hl_login_at`:** se escribe en `login.html` y no se lee en ninguna parte. Decorativo.

## 3. Los cuatro tokens del sistema

| Token | Quién lo usa | Qué es | Caducidad |
|-------|--------------|--------|-----------|
| `hl_token` | Reclutador, admin | JWT de Supabase Auth | 1 h, sin renovación |
| `token` (empleador) | Evaluador | UUID único en `empleadores_solicitados` | 30 días, un solo uso |
| `token_consulta` | Trabajador | UUID en `trabajadores` | **No caduca ni se revoca** |
| "token" de validación | Validador interno | **Es el `trabajador_id`** — no es un token | No aplica |

El cuarto no es una credencial: es un identificador que `crear-solicitud` entrega a anónimos.
Es la raíz de H-02 y H-03.

## 4. Las 19 edge functions

**AuthN:** ⛔ no mira `x-user-token` · 🔑 token en query/body · ✅ valida vía `auth.getUser()`
**AuthZ:** ⛔ ninguna · 👤 solo "está autenticado" · 🏷️ comprueba `ADMIN_EMAIL` · 🔒 comprueba pertenencia

| # | Función | Llamada desde | AuthN | AuthZ | Correos |
|---|---------|---------------|:-----:|:-----:|---------|
| 1 | `autenticar` | `login.html` | 🔑 email+pass | n/a | — |
| 2 | `establecer-password` | `crear-password.html` | 🔑 access_token | `!deleted` y `!activo` | — |
| 3 | `crear-reclutador` | `admin.html` | ✅ | 🏷️ | M-6, M-7 |
| 4 | `listar-usuarios` | `admin.html` | ✅ | 🏷️ | — |
| 5 | `gestionar-usuario` | `admin.html` | ✅ | 🏷️ | — |
| 6 | `crear-proceso` | `dashboard.html` | ✅ | 👤 | — |
| 7 | `listar-procesos` | `dashboard.html` | ✅ | 🔒 | — |
| 8 | `obtener-proceso` | `dashboard.html` | ✅ | ⛔ | — |
| 9 | `gestionar-proceso` | `dashboard.html` | ✅ | ⛔ | — |
| 10 | `obtener-stats` | `dashboard.html` | ✅ | ⛔ | — |
| 11 | `agregar-candidato` | `dashboard.html` | ✅ | ⛔ | M-4, M-5 |
| 12 | `obtener-candidato` | `dashboard.html` | ✅ | 👤 (cualquier RUT) | — |
| 13 | `crear-solicitud` | `trabajador.html` | ⛔ | ⛔ | M-1, M-2, M-3 |
| 14 | `obtener-estado` | `estado.html` | 🔑 `token_consulta` | Por token | — |
| 15 | `obtener-evaluacion` | `evaluar.html` | 🔑 UUID | Token + `!completado` + `!expirado` | — |
| 16 | `guardar-evaluacion` | `evaluar.html` | 🔑 UUID | Token + `!completado` | — |
| 17 | `obtener-validacion` | `validar.html` | ⛔ | ⛔ | — |
| 18 | `validar-documentos` | `validar.html` | ⛔ | ⛔ | — |
| 19 | `auth-test` | **huérfana** | ✅ | 👤 | — |

`crear-solicitud` es pública **por diseño**: el trabajador no tiene cuenta. `auth-test` no la
invoca ningún HTML; es un artefacto de prueba que quedó en producción (H-14).

## 5. Los 12 HTML

| Archivo | Actor | Sesión |
|---------|-------|--------|
| `index.html` | Público | No |
| `privacidad.html`, `terminos.html`, `links-afp.html` | Público | No |
| `login.html` | Reclutador, admin | Crea la sesión |
| `crear-password.html` | Reclutador invitado | Token de Auth en `location.hash` |
| `admin.html` | Admin | `hl_token` |
| `dashboard.html` | Reclutador | `hl_token` |
| `trabajador.html` | Trabajador | **No** — pública |
| `estado.html` | Trabajador | `token_consulta` en query string |
| `evaluar.html` | Evaluador | `token` en query string |
| `validar.html` | Validador interno | `trabajador_id` en query string |

## 6. Modelo de datos

```
auth.users
    │ 1:1 (usuarios.id → auth.users.id)
    ▼
usuarios ──1:N──▶ procesos ──1:N──▶ candidatos_proceso ──N:1──▶ trabajadores
(reclutador)                        (trabajador_id NULL              │
                                     = invitación por RUT)           │
                        ┌────────────────────────────────────────────┤
                        ▼                                            ▼
              empleadores_solicitados ──1:N──▶ evaluaciones     documentos
              (token UUID único)                                     │
                                                                     ▼
                                                       validaciones_documentos
```

| Tabla | Filas | Papel | Detalles que importan |
|-------|:-----:|-------|----------------------|
| `usuarios` | **4** | Reclutadores | PK = `auth.users.id`. **Sin columna de rol.** `activo`, `deleted` |
| `procesos` | 5 ⚠️ | Procesos de selección | `usuario_id` = dueño. Default `'activo'`, el código escribe `'Activo'` |
| `candidatos_proceso` | 10 ⚠️ | N:N proceso↔trabajador | `trabajador_id` NULL + `rut_invitado` = invitación pendiente |
| `trabajadores` | 2 ⚠️ | Personas evaluadas | `rut` unique. `token_consulta` con default `gen_random_uuid()` |
| `empleadores_solicitados` | 2 ⚠️ | Evaluadores invitados | `token` unique, `fecha_expiracion`, `completado` |
| `evaluaciones` | 2 ⚠️ | Las referencias | Notas 1-5 con CHECK. `comentarios` es **texto libre de terceros** |
| `documentos` | 4 ⚠️ | Certificado y finiquito | `storage_path` a los buckets |
| `validaciones_documentos` | 2 ⚠️ | Resultado de la validación | **`validador_id` existe y nunca se escribe** |

**Sobre los recuentos.** ⚠️ = **no verificado.** Esas cifras vienen de la auditoría del 31/07 y
no se han comprobado desde entonces. No son de fiar para decidir: `usuarios` decía 2 y el listado
real del 11/08 devolvió 6 —cuatro reclutadores reales (Andotek, Yokono, MJB, ImmerX) y dos de
prueba de H-01, ya eliminados—, o sea **4 filas activas** más el admin, que no tiene fila. Si ese
número estaba mal, los demás también pueden estarlo.

Esto no es una minucia de inventario: con 4 reclutadores reales en vez de 2, la exposición de
H-04 y H-05 —IDOR entre reclutadores— es bastante mayor de lo que este documento hacía pensar.

Los recuentos se verifican cuando el conector MCP tenga habilitado el grupo `database`. Hoy no lo
tiene, por decisión de seguridad: mantiene `apply_migration` bloqueado del lado del servidor y no
solo por convención.

**Estados**
- `trabajadores.estado`: `'pendiente'` → `'documentos_validados'`
- `procesos.estado`: `'Activo'` ⇄ `'Finalizado'`. El default del esquema (`'activo'`, minúscula)
  no coincide con ninguno de los dos (H-25).

**RLS:** activo en las 8 tablas. Verificado empíricamente: `GET /rest/v1/trabajadores` con la
anon key devuelve `[]` habiendo 2 registros.

**Storage:** solo `crear-solicitud` escribe; solo `obtener-validacion` lee, con
`createSignedUrl(..., 3600)`.

## 7. Correo

Los siete correos salen por Resend con `fetch` directo. Hechos transversales:

- Ninguno incluye `text` plano. Solo HTML.
- Ninguno define `reply_to`. El remitente es `noreply@`, sin MX.
- Ninguno define `List-Unsubscribe`.
- **El fallo de envío se traga.** Los siete van dentro de `try { await fetch(...) } catch {}` y
  no se comprueba el status de la respuesta. Un 429 por cuota o un 422 por dominio devuelven
  HTTP con error, no lanzan excepción: la función responde `success: true` igual (H-06).
- `crear-solicitud` espacia los envíos con `await delay(600)`. Es el único control de ritmo, y
  es intra-petición.
- El único destinatario codificado es `contacto@huellalaboral.cl` (M-3).
- DMARC está configurado.

## 8. Reglas de trabajo sobre este código

- **`apply_migration` está prohibido.** El esquema no se toca.
- **`deploy_edge_function` requiere aprobación explícita** del dueño en cada uso.
- **Punto de retorno:** `backup/edge-functions/*.ts`, commit `4622d62`. Contenido íntegro y
  literal de cada `index.ts` desplegado, con versión y `ezbr_sha256`. **No se edita en sitio:**
  si el respaldo deja de ser copia literal de producción, el procedimiento de reversión
  redespliega el parche.
- **No hay ambiente de staging.** Todo cambio va sobre producción.
- Ignorar `PLAN-EJECUCION.md` si aparece: quedó contradictorio.

## 9. Regenerar el respaldo

Después de cerrar un hallazgo y verificarlo, el respaldo de esa función debe regenerarse con la
nueva versión. Si no, el siguiente arreglo revertiría al código vulnerable.
