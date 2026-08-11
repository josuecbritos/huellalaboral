# Huella Laboral — Bitácora de cambios

Registro de cada hallazgo corregido: qué se cambió, cuándo se desplegó, qué se probó y con qué
resultado. **Se actualiza en cada iteración, antes de darla por cerrada.**

**Criterio de cierre:** código desplegado + prueba A (falla antes) + camino feliz intacto +
caminos hostiles rechazados + no regresión + limpieza + respaldo regenerado + visto bueno.

---

## Estado general

| | Cerrados | En curso | Pendientes | Total |
|---|:---:|:---:|:---:|:---:|
| Hallazgos | 0 | 1 | 49 | 50 |

**En curso:** H-01 — desplegado no · verificación A completa.

---

## H-01 · `crear-reclutador` no comprobaba autorización

🔴 Crítica · SEG · Esfuerzo S · **Estado: en verificación**

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

- **Rama:** `claude/huella-laboral-context-improvements-rlhz3i` · commit `f1daa26`
- **Archivo:** `supabase/functions/crear-reclutador/index.ts`
- **Diff contra el respaldo:** 21 líneas insertadas, 0 modificadas, 0 borradas
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
| **B** | Admin crea reclutador | `200` · `success: true` | | ⬜ |
| **B** | Llega el correo | Recibido | | ⬜ |
| **C1** | Sin cabecera `x-user-token` | `401` · No autorizado | | ⬜ |
| **C2** | Token basura | `401` · Token inválido | | ⬜ |
| **C3** | Reclutador no admin | `403` · Acceso restringido | | ⬜ |
| **C4** | Reactivación sin autorización | `401`, sin `reactivated` | | ⬜ |
| **D1** | `admin.html` lista usuarios | Carga | | ⬜ |
| **D2** | Eliminar usuario desde `admin.html` | Funciona | | ⬜ |

**Evidencia del paso A** — 2026-08-11 15:56 UTC, ventana de incógnito, sin sesión, solo anon key:
usuario creado `11e91ada-ad2b-4465-be83-3684ee9f3354`, correo `josuebrito+h01antes@gmail.com`,
correo de creación de contraseña recibido. La vulnerabilidad no solo creaba la cuenta: entregaba
el acceso.

### Pendiente

- [ ] Desplegar (versión 15)
- [ ] Fases B, C, D
- [ ] Eliminar los usuarios de prueba A y B
- [ ] Regenerar el respaldo de `crear-reclutador` a versión 15
- [ ] Actualizar `TECNICO.md` §4: `crear-reclutador` pasa a ✅ / 🏷️

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
