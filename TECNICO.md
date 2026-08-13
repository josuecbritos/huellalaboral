# Huella Laboral — Documento técnico

**Qué es este documento.** El mapa de cómo está construido el sistema: dónde vive cada cosa y
qué la protege. Se consulta para saber **dónde tocar**. El porqué está en `FUNCIONAL.md`.

**Este documento describe el estado actual y se actualiza en cada iteración.** Documentación
desactualizada miente con autoridad.

**Actualizado:** 11 de agosto de 2026 · **Estado del código:** cerrados H-01 (`crear-reclutador`
v15), H-07 (`dashboard.html` y `admin.html`), H-04/H-05/H-10 (`obtener-proceso` v3,
`gestionar-proceso` v3, `agregar-candidato` v11, `obtener-stats` v3) y H-02/H-03/H-35
(`obtener-validacion` v3, más una migración) y la cadena de validación de documentos
(`crear-solicitud` v28, `validar-documentos` v6, `obtener-estado` v4, `obtener-candidato` v10,
`agregar-candidato` v12, más una segunda migración). Todos desplegados en producción.

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
| `token_validacion` | Validador interno | UUID único en `trabajadores` | **No caduca**, un solo uso |

**El cuarto era el `trabajador_id` hasta H-02/H-03 (11/08).** No era una credencial: era la clave
primaria, y `crear-solicitud` la devolvía a cualquier llamante anónimo en `{ success, trabajadorId }`.
Ahora es una columna propia con su `token_validacion_usado`.

Dos diferencias con los otros tres que conviene tener presentes:

- **No caduca, y es decisión tomada.** Lo que lo invalida es usarlo, o que el trabajador vuelva a
  subir documentos. Poner caducidad no habría cambiado nada: el reenvío del correo ocurre igual, y
  si alguien lee la base el problema es otro.
- **Se consume al enviar la validación, no al abrir la página.** El validador tiene que poder abrir
  el enlace, revisar los PDF, cerrar la pestaña y volver. Consumirlo al leer rompería ese uso.

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
| 8 | `obtener-proceso` | `dashboard.html` | ✅ | 🔒 | — |
| 9 | `gestionar-proceso` | `dashboard.html` | ✅ | 🔒 | — |
| 10 | `obtener-stats` | `dashboard.html` | ✅ | 🔒 (filtra el array) | — |
| 11 | `agregar-candidato` | `dashboard.html` | ✅ | 🔒 | M-4, M-5 |
| 12 | `obtener-candidato` | `dashboard.html` | ✅ | 👤 (cualquier RUT) | — |
| 13 | `crear-solicitud` | `trabajador.html` | ⛔ | ⛔ | M-1, M-2, M-3 |
| 14 | `obtener-estado` | `estado.html` | 🔑 `token_consulta` | Por token | — |
| 15 | `obtener-evaluacion` | `evaluar.html` | 🔑 UUID | Token + `!completado` + `!expirado` | — |
| 16 | `guardar-evaluacion` | `evaluar.html` | 🔑 UUID | Token + `!completado` | — |
| 17 | `obtener-validacion` | `validar.html` | 🔑 `token_validacion` | Token + `!usado` | — |
| 18 | `validar-documentos` | `validar.html` | 🔑 `token_validacion` | Token + `!usado`, se consume | — |
| 19 | `auth-test` | **huérfana** | ✅ | 👤 | — |

`crear-solicitud` es pública **por diseño**: el trabajador no tiene cuenta. `auth-test` no la
invoca ningún HTML; es un artefacto de prueba que quedó en producción (H-14).

**Queda una sola fila con AuthZ ⛔: `crear-solicitud`, y es intencional** (`FUNCIONAL.md` §4 y §5:
el trabajador no tiene cuenta). Cerrarla con autenticación rompe el flujo, no lo arregla.

`crear-solicitud` sigue devolviendo `trabajadorId` a llamantes anónimos. Desde H-02/H-03 eso ya no
abre nada —el validador usa `token_validacion`— pero es un identificador interno que sale al
exterior sin necesidad, y conviene no volver a construir nada encima.

### `filtrarProcesosPropios` está duplicado a propósito en cuatro funciones

Desde H-04/H-05/H-10, las funciones **8, 9, 10 y 11** llevan el mismo bloque de comprobación de
propiedad: `filtrarProcesosPropios` y su envoltorio `esProcesoPropio`. **Es el mismo código, copiado
cuatro veces**, no un módulo compartido: cada edge function se despliega por separado y no hay
build que resuelva imports entre ellas.

**Un cambio en ese bloque va en las cuatro, y las cuatro se redespliegan.** Cambiarlo en una sola
deja el sistema en un estado peor que el original, porque la documentación diría que la
comprobación existe y sería cierto solo en parte.

Para comprobar que siguen siendo idénticas:

```
for f in obtener-proceso gestionar-proceso agregar-candidato obtener-stats; do
  sed -n '/─── Comprobación de propiedad/,/^}$/p' supabase/functions/$f/index.ts | sha256sum
done
```

Los cuatro hashes tienen que coincidir. Al cerrar H-04/H-05/H-10 valían `6df77bf555422d38…`.

**Lo que devuelve cada una cuando el proceso no es del llamante:**

- Funciones 8, 9 y 11 → `404` con `{error: 'Proceso no encontrado'}`, **idéntico** al de un
  proceso inexistente. Nunca `403`: un `403` confirmaría que el proceso existe.
- Función 10 no deniega, **filtra**: devuelve `200` con los recuentos de los procesos propios que
  hubiera en el array, o `{candidatos: 0, evaluaciones: 0}` si no había ninguno. Un cero ahí puede
  significar "no tienes datos" o "ninguno de esos procesos es tuyo", y no se distinguen a propósito.

### `validacionVigente` está duplicado a propósito en tres funciones

Misma razón que el bloque de arriba, distintas funciones: **14, 12 y 11** —`obtener-estado`,
`obtener-candidato` y `agregar-candidato`— llevan idénticos `validacionVigente` y
`estadoDocumento`. Un cambio va en las tres.

```
for f in obtener-estado obtener-candidato agregar-candidato; do
  sed -n '/─── Validación vigente/,/^}$/p' supabase/functions/$f/index.ts | sha256sum
done
```

Al cerrar la cadena de validación valían `02cc749e091bff9b…`. **`agregar-candidato` lleva los dos
bloques**, el de propiedad y el de vigencia: es la única función en las dos listas.

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

**Escapado de datos externos (desde H-07, 11/08).** `dashboard.html` y `admin.html` definen cada
uno su propia función `escapeHtml`, y **toda plantilla que inyecte con `innerHTML` un valor
tecleado por una persona debe pasar por ella**. Los dos archivos son independientes y no comparten
scripts, así que la función está duplicada a propósito: si se cambia, se cambia en los dos.

Tres cosas que no son obvias y cuestan un hallazgo si se olvidan:

- **`formatearCausal` y `formatearTiempoTrabajo` devuelven dato de usuario.** Hacen
  `LABELS[valor] || valor`: si el código no está en su tabla, sale el valor crudo de la base.
  Parecen traductores de códigos y son un paso-a-través.
- **`escapeHtml` no protege un `onclick`.** En un atributo, el parser decodifica `&#39;` a `'`
  antes de que el motor de JS lo vea. Los `onclick` del panel interpolan UUID de la base y eso es
  lo que los protege. Si alguno pasara a llevar texto de usuario, la solución no es escapar: es
  dejar de interpolarlo ahí.
- Los otros diez HTML no tienen `escapeHtml` porque hoy no inyectan dato de usuario con
  `innerHTML`. Comprobado en H-07; si se añade uno, hay que añadir también la función.

### Imagen de marca: favicon y los dos logos (desde UX-19 y UX-20, 13/08)

**El archivo antiguo `Huella_Laboral.png` era un JPEG con extensión `.png`.** No un PNG mal
comprimido: JPEG en el contenido, `.png` solo en el nombre. `file` lo confirma —
`JPEG image data, JFIF standard 1.01 … 704x192`—. Como el JPEG no admite canal alfa, el logo
llevaba el fondo blanco incrustado, y eso es lo que dibujaba el recuadro blanco en las dos
pantallas donde va sobre azul. La extensión no lo delataba y el navegador tampoco: sirve la
imagen igual, guiándose por los bytes y no por el nombre.

Se sustituye por dos PNG con transparencia, de las mismas dimensiones (704×192), **uno por
color de fondo**:

| Fondo del contenedor | Archivo | Pantallas |
|----------------------|---------|-----------|
| `var(--azul)` | `logo-huella-laboral-blanco.png` | `dashboard.html` (`.sidebar`), `estado.html` (`nav`) |
| Claro | `logo-huella-laboral.png` | Las otras diez |

`Huella_Laboral.png` **se conserva** como punto de retorno hasta que la fusión esté verificada.
Ya no lo referencia ningún HTML.

**El bloque de favicon es idéntico en los 12**, y es un requisito, no una coincidencia: cambiar
el icono en el futuro debe ser sustituir tres archivos en la raíz y nada más. Va justo después
del `</title>`, que es la única posición común a los 12 archivos.

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

Las rutas son **absolutas** (`/favicon.ico`) a propósito: los 12 HTML están en la raíz del
despliegue de Vercel, y una ruta relativa se rompería si alguno pasara a colgar de un
subdirectorio.

Dos cosas que cuestan un rato si se olvidan:

- **Las dimensiones son lo que sostiene la maquetación.** Diez páginas fijan `height: 36px` con
  `width: auto`, `crear-password.html` fija `height: 40px` y `validar.html` fija `width: 180px`
  con alto libre. En los tres casos el navegador deriva la otra dimensión de la proporción
  intrínseca del archivo. Un reemplazo que no sea 704×192 **mueve la caja**, y en
  `crear-password.html` además desplaza el logo en horizontal porque su contenedor está centrado.
  Si algún día se cambia el logo, se comprueba antes su tamaño.
- **El favicon elegido es un círculo blanco con la huella azul.** En pestañas de tema claro el
  círculo se funde con el fondo y queda flotando la huella. Está aceptado; es la razón por la
  que el bloque debe poder cambiarse de un tirón.

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
| `validaciones_documentos` | — | Resultado de la validación | Una fila **por cada** validación; las viejas no se borran. `envio_id` dice cuál es la vigente. **`validador_id` existe y sigue sin escribirse** — ver abajo |

### La cadena de validación: `envio_id`

`documentos` se **actualiza** al resubir, conservando su `id`. `validaciones_documentos`
**inserta** una fila por validación y nunca borra. Sin más, las validaciones viejas siguen
colgando del mismo `documento_id` que las nuevas y no se distinguen por la relación: leer
`validaciones_documentos[0]` devolvía cualquiera de ellas.

**`envio_id` es la llave que las separa.** Lo pone `crear-solicitud` en cada fila de `documentos`
con el valor de `token_validacion`, y `validar-documentos` lo copia a cada validación que inserta.
Una validación es **vigente** solo si su `envio_id` coincide con el del documento.

- `envio_id` nulo en un documento = subido pero sin validación vigente. Es un estado legítimo.
- Los cuatro estados que las funciones de lectura devuelven ahora: `sin_documento`,
  `pendiente_validacion`, `no_valido`, `validado`. Antes los cuatro se veían como un `—`.
- **No se compara por fecha**, a propósito: sería implícito y frágil.

**`validaciones_documentos.validador_id` sigue vacío, y en H-02/H-03 se decidió no rellenarlo.**
El pedido pedía escribirlo «si hay un identificador razonable disponible; si no, dejarlo y decirlo,
no inventar un valor». No lo hay: `validar-documentos` no autentica a nadie —es token, anónimo por
diseño— y el validador interno es un buzón de correo, no un rol con cuenta (`FUNCIONAL.md` §4).
Cualquier valor sería inventado. **Para que la columna signifique algo hace falta antes decidir
quién es el validador**, y eso es diseño de producto, no implementación.

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
- El único destinatario codificado es `contacto@huellalaboral.cl` (M-3). Es el correo que lleva el
  enlace de validación; desde H-02/H-03 ese enlace usa `token_validacion` y no el `trabajador_id`.
  **Ojo con la nomenclatura:** los pedidos de auditoría llaman «M-8» a este mismo correo. No hay un
  octavo correo — son siete, y este es el M-3.
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
