# Fase 0 — Mapa del sistema

**Estado:** cerrada, pendiente de confirmación del usuario.
**Fecha:** 2026-07-31
**Alcance:** 12 HTML del repo + 19 edge functions + esquema `public` de Supabase.
**Método:** lectura del código real (frontend vía repo, backend vía MCP, esquema vía `list_tables`). Nada inferido del nombre de los archivos.

---

## 0. Correcciones a §0.1 de AUDITORIA.md

`AUDITORIA.md` no se modifica (Regla Cero). Las correcciones se registran aquí.

| # | §0.1 dice | Realidad verificada | Cómo se verificó |
|---|-----------|---------------------|------------------|
| C-1 | "**18** edge functions" | **19**. Falta `auth-test` en la lista. | `list_edge_functions` devuelve 19 entradas, todas `ACTIVE`. |
| C-2 | "`evaluar.html:657` … lo mandan a `obtener-candidato`" | `evaluar.html:665` llama a **`obtener-evaluacion`**. `obtener-candidato` se llama solo desde `dashboard.html`. | `grep -onE "functions/v1/[a-z-]+" *.html` |
| C-3 | "122 commits" (implícito: clon completo) | El clon llegó **shallow con 49 commits**. Tras `git fetch --unshallow`: 122. | `git rev-parse --is-shallow-repository` → `true`; `git rev-list --count HEAD` → 49 → 122 |

**Causa raíz de C-1**, según el usuario: el método de inventario original partía de las llamadas del frontend, así que solo podía encontrar funciones invocadas desde algún HTML. Las **huérfanas eran invisibles por construcción**. Esto no es un detalle de conteo: define una clase de activo — código en producción que ningún flujo de usuario ejercita — que hay que enumerar explícitamente. Ver §5.

---

## 1. Q-1 — Ciclo de vida real del producto

Reconstruido siguiendo los datos, no los nombres de archivo.

**Quién inicia:** el **reclutador**, no el trabajador. El trabajador entra al sistema porque un reclutador lo invitó, o porque llega por su cuenta a `trabajador.html`, que es una página pública sin sesión.

**Quién es evaluado:** el **trabajador**, que no tiene cuenta en el sistema.

**Quién valida:** dos cosas distintas que conviene no confundir:
- La **evaluación** la escribe el ex-jefe (*evaluador*), que tampoco tiene cuenta.
- Los **documentos** los valida un **operador interno de Huella Laboral** que recibe un correo a `contacto@huellalaboral.cl`. No es un rol del sistema: es una dirección de correo. No hay tabla, ni cuenta, ni autenticación asociada.

### Flujo completo

```
[0] ADMIN  ──crear-reclutador──▶ crea cuenta Auth + fila en `usuarios` (activo=false)
                                 └─▶ email Resend "Crea tu contraseña" (link Auth, 24h)
                                        │
[1] RECLUTADOR ◀─establecer-password──── crear-password.html (token en location.hash)
                                         └─▶ usuarios.activo = true
    │
    ├──autenticar──▶ hl_token + hl_usuario en localStorage        (login.html)
    ├──crear-proceso──▶ procesos (usuario_id = dueño)             (dashboard.html)
    └──agregar-candidato──▶ busca trabajador por RUT
         ├─ CASO A existe    → candidatos_proceso + email recordatorio ─▶ trabajador.html
         └─ CASO B no existe → candidatos_proceso(rut_invitado) + email invitación ─▶ trabajador.html
                                                                    │
[2] TRABAJADOR (sin cuenta, página pública) ◀───────────────────────┘
    └──crear-solicitud──▶ upsert `trabajadores` (por RUT)
         ├─ vincula invitaciones pendientes por rut_invitado
         ├─ crea N filas `empleadores_solicitados`, token = crypto.randomUUID(), +30 días
         ├─ sube certificado/finiquito a Storage, filas en `documentos`
         └─ dispara 3 correos:
              (a) a cada evaluador  ─▶ evaluar.html?token=<uuid empleador>
              (b) al trabajador     ─▶ estado.html?token=<token_consulta>
              (c) a contacto@huellalaboral.cl ─▶ validar.html?token=<trabajador_id>
                                                                    │
[3] EVALUADOR (sin cuenta) ◀────────────────────────────────────────┤
    ├──obtener-evaluacion?token──▶ valida: existe, !completado, !expirado
    └──guardar-evaluacion──▶ inserta `evaluaciones`, marca completado=true
         └─ si todos los empleadores de todos los candidatos del proceso están completos
            ──▶ procesos.estado = 'Finalizado'
                                                                    │
[4] VALIDADOR INTERNO (sin cuenta) ◀────────────────────────────────┘
    ├──obtener-validacion?token=<trabajador_id>──▶ signed URLs 1h a los PDFs
    └──validar-documentos──▶ `validaciones_documentos`, documentos.validado=true
         └─ trabajadores.estado = 'documentos_validados'

[5] RECLUTADOR consulta el resultado
    ├──obtener-proceso?proceso_id──▶ candidatos del proceso + trabajadores(*)
    ├──obtener-candidato?rut──────▶ ficha completa + promedios + evaluaciones
    └──obtener-stats──────────────▶ conteos

[6] TRABAJADOR hace seguimiento
    └──obtener-estado?token=<token_consulta>──▶ su propio estado y evaluaciones
```

### Observación estructural sobre el flujo

El trabajador **declara quiénes son sus evaluadores**: nombre, empresa y **correo**, en un formulario público sin sesión (`trabajador.html` → `crear-solicitud`). El sistema envía la invitación a la dirección que el propio evaluado escribió. No hay ningún paso, en ninguna de las 19 funciones, que verifique que esa dirección pertenece a la empresa declarada ni que la persona existe.

Lo único que se comprueba es, en `guardar-evaluacion`, si el dominio del correo **no** es de una lista de proveedores gratuitos:

```js
const verificada = rechazo ? false : emailEvaluador?.includes('@') &&
                  !emailEvaluador.match(/@(gmail|hotmail|yahoo|outlook|live|icloud)\./i)
```

Eso es todo lo que hay detrás de la palabra "verificada" del producto. Es un test de dominio, no de identidad. Material de Fase 1 (T-1), se anota aquí porque es una propiedad del flujo, no un hallazgo suelto.

---

## 2. Q-2 — Relación entre Supabase Auth y `hl_token`

**Respuesta: no corren en paralelo. `autenticar` envuelve a Supabase Auth y devuelve el token de Supabase Auth tal cual. `hl_token` no es un token propio.**

Evidencia, en `autenticar`:

```js
const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({ email, password })
...
token: authData.session.access_token
```

`login.html:422` guarda ese valor en `localStorage` como `hl_token`. Por tanto **`hl_token` es el `access_token` JWT de Supabase Auth**, no un identificador propio. Se confirma por el otro extremo: las funciones que lo reciben lo validan con `supabase.auth.getUser(userToken)`, que solo acepta JWT de Auth.

Lo que sí es propio es la **capa de autorización**, y ahí está el detalle que importa:

- **El rol no viaja en el token.** `autenticar` lo calcula y lo manda en el cuerpo JSON, y el frontend lo guarda en `hl_usuario.rol`.
- **El rol se deriva por ausencia:** si el usuario autenticó bien pero **no tiene fila en `usuarios`**, y su email coincide con `Deno.env.get('ADMIN_EMAIL')`, entonces es `admin`. Si tiene fila, es `reclutador`. No existe columna de rol en ninguna tabla.
- En consecuencia, cualquier función que necesite saber si el llamante es admin tiene que **volver a comparar** `authUser.email` contra `ADMIN_EMAIL`. No puede leerlo del token.

Ese contrato — "el rol se recalcula en cada función" — se cumple en unas funciones y en otras no. El detalle está en §4 y es materia de Fase 2 (Q-4).

**Nota sobre `hl_login_at`:** se escribe en `login.html:424` y **no se lee en ningún archivo del repo**. Verificado con `grep -rn "hl_login_at" *.html`: una sola coincidencia, la escritura. Es decorativo; no caduca nada.

---

## 3. Q-10 — Inventario de correos

Todos salen por **Resend**, con `fetch` directo a `https://api.resend.com/emails`, y todos con el mismo remitente: `Huella Laboral <noreply@contacto.huellalaboral.cl>`.

| # | Función | Disparador | Destinatario | Asunto | CTA / destino |
|---|---------|-----------|--------------|--------|---------------|
| M-1 | `crear-solicitud` | El trabajador envía el formulario | Cada evaluador declarado | `<nombre> te solicita una referencia laboral` | `evaluar.html?token=<uuid>` |
| M-2 | `crear-solicitud` | Misma llamada | El trabajador | `Solicitud de referencias recibida` | `estado.html?token=<token_consulta>` |
| M-3 | `crear-solicitud` | Solo si adjuntó algún documento | `contacto@huellalaboral.cl` (fijo en el código) | `Nuevos documentos para validar` | `validar.html?token=<trabajador_id>` |
| M-4 | `agregar-candidato` | CASO A: el RUT ya existe | El trabajador | `<reclutador> te agregó a un proceso de selección` | `trabajador.html` (sin token) |
| M-5 | `agregar-candidato` | CASO B: el RUT no existe | El email invitado | `<reclutador> te invita a solicitar tus referencias laborales` | `trabajador.html` (sin token) |
| M-6 | `crear-reclutador` | Alta de reclutador | El reclutador | `Crea tu contraseña - Huella Laboral` | `action_link` de Auth (`type: 'invite'`) |
| M-7 | `crear-reclutador` | Reactivación de un usuario borrado | El reclutador | `Crea tu contraseña - Huella Laboral` | `action_link` de Auth (`type: 'recovery'`) |

**Siete correos, tres funciones.** Las otras 16 no envían nada.

Hechos transversales, verificados en el código de los tres emisores:

- **Ninguno incluye `text`.** Todos son solo `html`.
- **Ninguno define `reply_to`.** El remitente es `noreply@`.
- **Ninguno define cabeceras `List-Unsubscribe`.**
- **El fallo de envío se traga.** Los siete van dentro de `try { await fetch(...) } catch { console.error(...) }` y **no se comprueba el `status` de la respuesta de Resend**. Un 429 por cuota o un 422 por dominio devuelven HTTP con error, no lanzan excepción: el `catch` no se dispara y la función responde `success: true` igual. Nadie se entera.
- **M-6 y M-7 no usan las plantillas de Supabase Auth.** `crear-reclutador` llama a `generateLink()` solo para obtener el `action_link` y luego arma el correo a mano en Resend. Las plantillas de Auth quedan fuera de este camino.
- `crear-solicitud` espacia los envíos con `await delay(600)` entre correos. Es el único control de ritmo que existe, y es intra-petición: no limita nada entre peticiones distintas.
- El único destinatario codificado en el código es `contacto@huellalaboral.cl` (M-3).

El análisis de entregabilidad, copy, DNS y cuota es Fase 4 (§7.1). Aquí queda el inventario.

---

## 4. Tabla de actores

Derivados del esquema y del código, no del vocabulario del producto.

| Actor | ¿Tiene cuenta? | Cómo se identifica | Dónde existe | Pantallas | Qué puede hacer |
|-------|----------------|--------------------|--------------|-----------|-----------------|
| **Admin** | Sí (Auth) | Email == `ADMIN_EMAIL` **y sin fila en `usuarios`** | Solo en `auth.users` | `admin.html` | Crear, activar, desactivar y borrar reclutadores |
| **Reclutador** | Sí (Auth) | Fila en `usuarios` con `activo=true`, `deleted=false` | `auth.users` + `usuarios` | `login`, `dashboard`, `crear-password` | Crear procesos, agregar candidatos, consultar fichas por RUT |
| **Trabajador** | **No** | UUID `token_consulta` en la URL | `trabajadores` | `trabajador.html`, `estado.html` | Solicitar referencias, subir documentos, ver su estado |
| **Evaluador** | **No** | UUID `token` en la URL, un solo uso | `empleadores_solicitados` | `evaluar.html` | Rellenar o rechazar una evaluación, una vez |
| **Validador interno** | **No** | **Nada.** El "token" es el `trabajador_id` | No existe como entidad | `validar.html` | Marcar documentos como válidos |
| **Anónimo** | No | — | — | `index`, `privacidad`, `terminos`, `links-afp`, `trabajador` | Ver contenido público y crear una solicitud |

Dos observaciones que cambian cómo hay que leer el resto de la auditoría:

1. **Tres de los cinco actores con capacidad de escritura no tienen cuenta.** El trabajador, el evaluador y el validador operan solo con un token en el query string. La seguridad de esos tres flujos es exactamente la seguridad de esos tokens (Q-5, Fase 2).
2. **El "validador" no es un actor del sistema, es un buzón de correo.** `validaciones_documentos` tiene una columna `validador_id uuid`, pero `validar-documentos` **nunca la escribe**. Queda siempre `NULL`. No hay traza de quién validó qué.

---

## 5. Las 19 edge functions

Estado de autenticación tal como está en el código hoy. `verify_jwt: true` en las 19, lo que — como razona §5.4 de `AUDITORIA.md` — **no autentica a nadie**: el `Authorization: Bearer` es la anon key, publicada en 8 HTML del repo.

Leyenda de **AuthN**: ⛔ no mira `x-user-token` · 🔑 token en query/body · ✅ valida `x-user-token` vía `auth.getUser()`
Leyenda de **AuthZ**: ⛔ ninguna · 👤 solo "está autenticado" · 🏷️ comprueba `ADMIN_EMAIL` · 🔒 comprueba pertenencia del recurso

| # | Función | Llamada desde | AuthN | AuthZ | Quién *debería* poder llamarla | Correos |
|---|---------|---------------|-------|-------|-------------------------------|---------|
| 1 | `autenticar` | `login.html` | 🔑 email+password | n/a | Cualquiera (es el login) | — |
| 2 | `establecer-password` | `crear-password.html` | 🔑 `access_token` de Auth | Comprueba `!deleted` y `!activo` | Reclutador invitado | — |
| 3 | `crear-reclutador` | `admin.html` | **⛔** | **⛔** | **Solo admin** | M-6, M-7 |
| 4 | `listar-usuarios` | `admin.html` | ✅ | 🏷️ | Solo admin | — |
| 5 | `gestionar-usuario` | `admin.html` | ✅ | 🏷️ | Solo admin | — |
| 6 | `crear-proceso` | `dashboard.html` | ✅ | 👤 (usa `authUser.id` como dueño) | Reclutador | — |
| 7 | `listar-procesos` | `dashboard.html` | ✅ | 🔒 (`.eq('usuario_id', authUser.id)`) | Reclutador, los suyos | — |
| 8 | `obtener-proceso` | `dashboard.html` | ✅ | **⛔ sin filtro por dueño** | Reclutador, los suyos | — |
| 9 | `gestionar-proceso` | `dashboard.html` | ✅ | **⛔ sin filtro por dueño** | Reclutador, los suyos | — |
| 10 | `obtener-stats` | `dashboard.html` | ✅ | **⛔ acepta `proceso_ids` del cliente** | Reclutador, los suyos | — |
| 11 | `agregar-candidato` | `dashboard.html` | ✅ | **⛔ no comprueba dueño del `proceso_id`** | Reclutador, los suyos | M-4, M-5 |
| 12 | `obtener-candidato` | `dashboard.html` | ✅ | 👤 (cualquier RUT) | Reclutador — *ver nota* | — |
| 13 | `crear-solicitud` | `trabajador.html` | **⛔** | **⛔** | Público por diseño | M-1, M-2, M-3 |
| 14 | `obtener-estado` | `estado.html` | 🔑 `token_consulta` | Por token | Trabajador dueño del token | — |
| 15 | `obtener-evaluacion` | `evaluar.html` | 🔑 `token` UUID | Por token + `!completado` + `!expirado` | Evaluador invitado | — |
| 16 | `guardar-evaluacion` | `evaluar.html` | 🔑 `token` UUID | Por token + `!completado` | Evaluador invitado | — |
| 17 | `obtener-validacion` | `validar.html` | **⛔** (`token` = `trabajador_id`) | **⛔** | Solo validador interno | — |
| 18 | `validar-documentos` | `validar.html` | **⛔** (`token` = `trabajador_id`) | **⛔** | Solo validador interno | — |
| 19 | **`auth-test`** | **NINGUNO — huérfana** | ✅ | 👤 | *Indeterminado: ver §5.1* | — |

*Nota sobre `obtener-candidato`:* acepta cualquier RUT de cualquier reclutador autenticado. Puede ser deliberado — el producto es una base consultable de referencias — pero entonces es una **decisión de producto sobre datos personales de terceros**, no un descuido. Necesita confirmación tuya; se audita en Fase 2 según cuál sea la respuesta.

### 5.1 Funciones huérfanas

**Solo una de las 19 no es invocada desde ningún HTML: `auth-test`.**

Método: `grep -onE "functions/v1/[a-z-]+" *.html` sobre los 12 archivos → 18 slugs distintos. La diferencia con las 19 desplegadas es exactamente `auth-test`. Las otras 18 tienen al menos un llamador.

**Qué hace `auth-test`** (código completo leído, v1, desplegada 2026-04-06, nunca actualizada):

1. Exige `x-user-token`; si falta → 401.
2. Crea un cliente con `SUPABASE_SERVICE_ROLE_KEY` desde `Deno.env.get()`.
3. `supabase.auth.getUser(userToken)`; si es inválido → 401.
4. Si es válido, devuelve `{ ok: true, email: user.email, id: user.id }`.

**Lectura:** el nombre y la forma encajan con un artefacto de prueba — es la comprobación mínima de "¿funciona la validación de `x-user-token`?", desplegada el mismo día que se añadió esa validación al resto de funciones (`listar-procesos` v5, `obtener-stats` v2 y otras se actualizaron ese día). Lo tratamos como artefacto de prueba, según tu instrucción, y el código no contradice esa hipótesis.

**Qué no hace:** no escribe nada, no envía correos, no acepta parámetros y no devuelve datos de terceros — solo el email y el id **del portador del propio token**. Un atacante sin token válido no obtiene nada; con un token válido, obtiene datos que ya son suyos.

**Lo que sí aporta como superficie**, y que corresponde valorar en Fase 2:
- Es un **oráculo de validez de tokens** sin coste ni efectos secundarios: permite comprobar si un `hl_token` robado o caducado sigue vivo sin tocar ningún flujo de negocio ni dejar rastro en datos.
- No tiene rate limiting, como ninguna de las 19.
- Nadie la vigila: al no estar en ningún flujo, un fallo o un cambio de comportamiento no lo detectaría ningún usuario.

No es, por sí sola, la vía de entrada más grave del sistema — hay otras bastante peores en la misma tabla. Pero confirma la categoría: **existe código en producción que el inventario basado en el frontend no ve**, y el inventario correcto es `list_edge_functions`, no el `grep`.

---

## 6. Modelo de datos

8 tablas en `public`, **todas con `rls_enabled: true`**. Que las políticas concretas sirvan de algo es Q-6 y se resuelve en Fase 2; aquí solo consta que RLS no está apagado.

```
auth.users
    │ 1:1 (usuarios.id → auth.users.id)
    ▼
usuarios ──1:N──▶ procesos ──1:N──▶ candidatos_proceso ──N:1──▶ trabajadores
(reclutador)                         (trabajador_id NULL                │
                                      = invitación por RUT)             │
                                                                        │
                        ┌───────────────────────────────────────────────┤
                        ▼                                               ▼
              empleadores_solicitados ──1:N──▶ evaluaciones      documentos
              (una por evaluador,              (empleador_id,     (certificado
               token UUID único)                trabajador_id)     | finiquito)
                                                                        │
                                                                        ▼
                                                          validaciones_documentos
```

| Tabla | Filas | Papel | Detalles que importan |
|-------|-------|-------|----------------------|
| `usuarios` | 2 | Reclutadores | PK = `auth.users.id`. **Sin columna de rol.** `activo`, `deleted` |
| `procesos` | 5 | Procesos de selección | `usuario_id` = dueño. Default `'activo'` minúscula, pero el código escribe `'Activo'` y `'Finalizado'` |
| `candidatos_proceso` | 10 | N:N proceso↔trabajador | `trabajador_id` NULL + `rut_invitado` = invitación pendiente |
| `trabajadores` | 2 | Personas evaluadas | `rut` **unique**. `token_consulta uuid default gen_random_uuid()` |
| `empleadores_solicitados` | 2 | Evaluadores invitados | `token` **unique** (varchar, valor de `crypto.randomUUID()`), `fecha_expiracion`, `completado` |
| `evaluaciones` | 2 | Las referencias | Notas 1-5 con `CHECK`. `verificada`. `comentarios` es **texto libre de terceros** |
| `documentos` | 4 | Certificado y finiquito | `storage_path` a los buckets `certificados` / `finiquitos` |
| `validaciones_documentos` | 2 | Resultado de la validación | **`validador_id` existe pero nunca se escribe** |

Volúmenes de dos dígitos: el sistema está en fase muy temprana. Relevante para priorizar: cerrar los agujeros ahora cuesta poco, y la superficie de datos personales expuesta hoy es pequeña.

**Máquina de estados** (detectada; se verifica en Fase 3):
- `trabajadores.estado`: `'pendiente'` → `'documentos_validados'`. Solo dos valores en el código.
- `procesos.estado`: `'Activo'` ⇄ `'Finalizado'`. Se cierra automáticamente en `guardar-evaluacion` y se reabre en `agregar-candidato`. El default del esquema, `'activo'`, no coincide en mayúscula con ninguno de los dos.

**Storage:** dos buckets, `certificados` y `finiquitos`. Solo `crear-solicitud` escribe y solo `obtener-validacion` lee, con `createSignedUrl(..., 3600)`. Si los buckets son públicos o no, no lo he verificado — Fase 2 (§5.6).

---

## 7. Hallazgos críticos anticipados

D-7 obliga a reportar lo Crítico en el momento, sin esperar al informe. El análisis formal, con severidad definitiva y corrección propuesta, va en Fase 2. Aquí queda constancia de lo que apareció al leer el código para levantar el mapa.

Todos comparten la misma causa: **la función no revalida nada, y opera con `service_role`, que salta el RLS**. La defensa en profundidad no aplica: si la función no filtra, no filtra nadie.

| ID | Función | Qué permite | Amenaza |
|----|---------|-------------|---------|
| **P-1** | `crear-reclutador` | **No lee `x-user-token` en absoluto.** Cualquiera con la anon key crea una cuenta de reclutador a su propio correo, recibe el enlace de "Crea tu contraseña" y entra al dashboard. Desde ahí, P-2 y P-3 quedan a mano. | T-4 |
| **P-2** | `obtener-validacion` | Sin autenticación. El "token" **es el `trabajador_id`**. Con un UUID de trabajador devuelve nombre, RUT, email y **URLs firmadas a los PDF** de certificado de cotizaciones y finiquito. | T-3 |
| **P-3** | `validar-documentos` | Sin autenticación, mismo "token". Cualquiera marca los documentos de cualquier trabajador como válidos y le pone `estado='documentos_validados'`. Es el eslabón que sostiene la promesa de "verificado". | T-1 |
| **P-4** | `obtener-proceso` | Autenticada, pero **no comprueba quién es el dueño del proceso**. Cualquier reclutador lee los candidatos de cualquier proceso ajeno, con `trabajadores(*)` completo. | T-3 |
| **P-5** | `gestionar-proceso` | Autenticada, sin comprobación de dueño. Cualquier reclutador **finaliza o borra** cualquier proceso ajeno, y sus `candidatos_proceso` con él. | T-3 |
| **P-6** | `crear-solicitud` | Sin autenticación y sin rate limiting. Cada llamada dispara hasta N+2 correos a direcciones arbitrarias, con el remitente de Huella Laboral. | T-6 |

Sobre P-1 y P-2 conviene ver cómo encadenan: `crear-solicitud` devuelve `{ success: true, trabajadorId }` a un llamante anónimo, y ese `trabajadorId` es exactamente la credencial que P-2 y P-3 aceptan como "token".

---

## 8. Zonas no auditables o pendientes

| Zona | Estado | Fase |
|------|--------|------|
| Políticas RLS concretas y GRANTs | No consultadas todavía | 2 (Q-6) |
| Buckets de Storage: ¿públicos? | No verificado | 2 |
| Valor de `ADMIN_EMAIL` y demás secretos | No consultable por MCP; se confirmó que **todos** se leen con `Deno.env.get()`, ninguno literal en el código (Q-7 respondida a favor) | 2 |
| Configuración de Auth (confirmación de correo, redirect URLs, duración de sesión) | No consultada | 2 (§5.6) |
| DNS del dominio: SPF, DKIM, DMARC | No consultado | 4 (§7.1) |
| Plan y cuota de Resend, webhooks | No consultable por MCP | 4 |
| `dashboard-test.html`, `evaluar_dummy.html` | Historial completo ya disponible tras `--unshallow`; sin revisar | 2 (Q-9) |
| Versiones anteriores de las edge functions | El MCP solo entrega la versión vigente. `crear-solicitud` va por la v26 y no hay historial. | — |

---

## 9. Supuestos (D-6)

1. ~~**`ADMIN_EMAIL` está definido** en las variables de entorno del proyecto.~~ **Deja de ser supuesto: confirmado por el usuario en Edge Functions → Secrets.** Ver `FASE-2-SEGURIDAD.md` §1.
2. **El validador interno es una persona de Huella Laboral** que lee `contacto@huellalaboral.cl`, no un rol delegado a terceros.
3. **`huellalaboral.cl` es el dominio de producción**, ya que está codificado en los enlaces de los siete correos.
4. Los conteos de filas vienen de las estadísticas de `list_tables`; son aproximados y no requirieron ningún `SELECT` sobre datos personales (D-5).

---

## 10. Respuestas de Fase 0

| Pregunta | Estado |
|----------|--------|
| **Q-1** ciclo de vida real | ✅ §1 |
| **Q-2** Auth vs `hl_token` | ✅ §2 — `hl_token` **es** el `access_token` de Supabase Auth; el rol va aparte y se recalcula por función |
| **Q-10** inventario de correos | ✅ §3 — 7 correos, 3 funciones emisoras |
| Q-7 secretos (adelantada) | ✅ Los 19 usan `Deno.env.get()`. Cero valores literales. Confirmación formal en Fase 2 |
| Q-9, Q-3, Q-4, Q-5, Q-6, Q-8 | Fases 1 y 2 |
