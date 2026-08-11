# Huella Laboral — Bitácora de cambios

Registro de cada hallazgo corregido: qué se cambió, cuándo se desplegó, qué se probó y con qué
resultado. **Se actualiza en cada iteración, antes de darla por cerrada.**

**Criterio de cierre:** código desplegado + prueba A (falla antes) + camino feliz intacto +
caminos hostiles rechazados + no regresión + limpieza + respaldo regenerado + visto bueno.

---

## Estado general

| | Cerrados | En curso | Pendientes | Total |
|---|:---:|:---:|:---:|:---:|
| Hallazgos | 1 | 0 | 49 | 50 |

**En curso:** ninguno. H-01 cerrado el 11/08/2026.

---

## H-01 · `crear-reclutador` no comprobaba autorización

🔴 Crítica · SEG · Esfuerzo S · **Estado: ✅ CERRADO** (11/08/2026)

### El problema

La función no leía `x-user-token`. Sin comprobación de autorización de ninguna clase: entraba
al `try`, parseaba el body y operaba con `SUPABASE_SERVICE_ROLE_KEY`. Con la anon key pública
—visible en el navegador— cualquiera podía crear una cuenta de reclutador, recibir el enlace de
contraseña en su propio buzón, y entrar al panel. Habilitaba H-04, H-05 y H-08. Por el mismo
agujero se podían reactivar usuarios eliminados vía `confirm_reactivate`.

### La decisión

**Alta cerrada:** solo `ADMIN_EMAIL` crea o reactiva cuentas.

Razón: `admin.html` es el único llamador y ya enviaba `x-user-token` en sus dos llamadas. Las
funciones hermanas (`listar-usuarios`, `gestionar-usuario`) ya tenían la comprobación. No fue
diseño nuevo, fue reponer lo que faltaba. Cero cambios en frontend, cero impacto en el flujo
legítimo.

La reactivación quedó tras la misma puerta, sin comprobación aparte: el bloque va antes del
`req.json()`, así que cubre `confirm_reactivate` por construcción.

### El cambio

- **Rama:** `claude/huella-laboral-context-improvements-rlhz3i` · commit `f1daa26`, fusionado a
  `main` en el merge `95cce48`
- **Archivo:** `supabase/functions/crear-reclutador/index.ts`
- **Diff contra el respaldo:** 21 líneas insertadas, 0 modificadas, 0 borradas
- **Despliegue:** 11 de agosto de 2026, 17:07 UTC. Versión 14 → **15**, `verify_jwt` sigue en
  `true`. Nuevo `ezbr_sha256`: `61f1889065d7fb7b…`. Antes de desplegar se confirmó que la versión
  viva era la 14 con `ezbr_sha256: 3554526edd20674c…`, o sea el punto de retorno seguía siendo
  válido. Tras desplegar se comprobó que ninguna de las otras 18 funciones cambió de versión
- **Desviación:** la variable se llama `tokenError`, no `authError`. Copiar el bloque literal de
  `listar-usuarios` habría colisionado con el `authError` que ya declara la línea 30 con `let` —
  `SyntaxError` en el arranque, la función no levanta.
- **El respaldo no se editó.** Debe seguir siendo copia literal de producción o el procedimiento
  de reversión redesplegaría el parche.

### Verificación

| Fase | Prueba | Esperado | Obtenido | Estado |
|------|--------|----------|----------|:------:|
| **A** | Llamada anónima con anon key | `200` · `success: true` (el fallo) | `200` · `success: true` | ✅ |
| **A** | ¿Llegó el correo de contraseña? | Recibido | Recibido | ✅ |
| **B** | Admin crea reclutador | `200` · `success: true` | `200` · `success: true` | ✅ |
| **B** | Llega el correo | Recibido | Recibido | ✅ |
| **C1** | Sin cabecera `x-user-token` | `401` · No autorizado | `401` · No autorizado | ✅ |
| **C2** | Token basura | `401` · Token inválido | `401` · Token inválido | ✅ |
| **C3** | Reclutador no admin | `403` · Acceso restringido | `403` · Acceso restringido | ✅ |
| **C4** | Reactivación sin autorización | `401`, sin `reactivated` | `401` · No autorizado | ✅ |
| **D1** | `admin.html` lista usuarios | Carga | Devolvió los 6 usuarios | ✅ |
| **D2** | Eliminar usuario desde `admin.html` | Funciona | Borrado sin error | ✅ |

**Evidencia del paso A** — 2026-08-11 15:56 UTC, ventana de incógnito, sin sesión, solo anon key:
usuario creado `11e91ada-ad2b-4465-be83-3684ee9f3354`, correo `josuebrito+h01antes@gmail.com`,
correo de creación de contraseña recibido. La vulnerabilidad no solo creaba la cuenta: entregaba
el acceso.

**Evidencia del paso B** — 2026-08-11 17:11 UTC: usuario `3a0f04a9-2ee1-452d-afce-dcde8b15ed2f`,
correo `josuebrito+h01feliz@gmail.com`. El camino feliz quedó intacto.

**Verificación independiente del despliegue** — versión 15 leída vía MCP, `ezbr_sha256`
`61f1889065d7fb7b…`, `verify_jwt: true`, bloque de autorización antes del `req.json()`.

**Nota sobre C4 — cómo se probó de verdad.** La reactivación sin autorización necesita un usuario
con `deleted = true`, y no había ninguno. En vez de dar la prueba por cubierta por inspección del
código —"el bloque va antes del `req.json()`, luego también cubre `confirm_reactivate`"—, se
encadenó con D2: el borrado suave de la fase D2 sobre el usuario de la fase A produjo justamente
el `deleted = true` que C4 requería. Las dos pruebas se ejecutaron de verdad y no dejaron datos
basura.

**El patrón, para los hallazgos que vienen:** cuando a un camino le falta el estado previo que lo
hace alcanzable, conviene buscar qué otra prueba del plan lo genera y encadenarlas, antes de
rebajar la prueba a una lectura del código. Un razonamiento sobre el código no es una ejecución.

### Criterio de cierre

- [x] Código desplegado — versión 15, 11/08 17:07 UTC
- [x] Prueba A: el fallo existía
- [x] Camino feliz intacto — fase B
- [x] Caminos hostiles rechazados — fases C1 a C4
- [x] No regresión — fases D1 y D2, `listar-usuarios` y `gestionar-usuario` siguen operativas
- [x] Limpieza: usuarios de prueba A y B eliminados
- [x] Respaldo regenerado a versión 15, y `MANIFEST.md` actualizado
- [x] Visto bueno del dueño

**Pendiente de reverificación:** el respaldo se regeneró desde `supabase/functions/crear-reclutador/index.ts`,
que es exactamente el archivo enviado al desplegar, y coincide con la lectura de la versión 15
hecha vía MCP tras el despliegue. La comparación byte a byte contra una llamada nueva a
`get_edge_function` no se pudo repetir al cerrar porque el conector se desconectó. Conviene
rehacerla la próxima vez que el conector esté disponible.

---

## Decisiones de producto tomadas durante el trabajo

Decisiones que no son de un solo hallazgo y que afectan cómo se abordan los siguientes.

| Fecha | Tema | Decisión | Razón |
|-------|------|----------|-------|
| 11/08 | Alta de reclutadores | Cerrada: solo `ADMIN_EMAIL` | Coherente con operación manual controlada en marcha blanca |
| 11/08 | H-08 · consulta por RUT | **Eliminar la búsqueda por RUT**, sin sustituto por ahora | El manual estratégico ya decidió que la validación pública será por QR o enlace único. No automatizar antes de validar |
| 11/08 | H-12 · `token_consulta` | **Se acepta como está.** No caduca ni se revoca | El enlace llega solo al correo del trabajador y él lo administra; la política de privacidad cubre la eliminación de datos a petición |
| 11/08 | UX-14 · copy de "verificada" | Diferido, se revisa al llegar al hallazgo | — |
| 11/08 | Metodología | Especificación aquí, ejecución en Claude Code | Claude Code ve el repo entero y valida antes de entregar |

**Nota sobre H-12:** eliminar todos los datos y revocar un enlace filtrado no son la misma cosa.
Queda anotado para revisión futura, no como pendiente abierto.

**Nota sobre H-08:** al eliminar la búsqueda por RUT hay que revisar qué se rompe en
`dashboard.html`, o el reclutador queda con un buscador que ya no responde.

---

## Registro de reversiones

Ninguna hasta la fecha.

| Fecha | Hallazgo | Motivo | Acción |
|-------|----------|--------|--------|
| — | — | — | — |
