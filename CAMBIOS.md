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
correo `josuebrito+h01feliz@gmail.com`. El camino feliz quedó intacto. El correo de creación de
contraseña **llegó**; el dueño lo confirmó expresamente el 11/08 al revisar esta tabla. Se anota
aquí porque el pedido original detallaba nueve pruebas y la tabla marca diez: la fila del correo
de B se había dado por buena sobre una afirmación global, no sobre evidencia propia. Confirmada
punto por punto, la fila se sostiene.

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

**Punto de retorno comprobado** — 11 de agosto de 2026. La comparación byte a byte que quedó
pendiente al cerrar, porque el conector se había desconectado, se rehízo con el conector activo.
`get_edge_function('crear-reclutador')` devuelve versión **15**, `ezbr_sha256`
`61f1889065d7fb7bebf005adf43ed28a3228935b214c9e30d47ac02c9fbeec33`, `verify_jwt: true`, y su
fuente es **idéntico byte a byte** a `backup/edge-functions/crear-reclutador.ts`: sha256
`dcd8ba6d80cd2425759a163c3261dbb96a73856c111fa7330f81edf36f264189`, 9.784 bytes, 235 líneas.
`cmp` y `diff -u` sin diferencias. El respaldo es copia literal, no inferida, y el procedimiento
de reversión devuelve producción a la versión 15 sin arrastrar nada.

**Cómo se comprobó, y qué prueba.** El MCP entrega el fuente dentro de un JSON en el contexto del
agente, no a disco, así que el volcado a archivo pasa por transcripción. Para que la comparación
no fuera complaciente, los dos rasgos que una retranscripción normaliza se fijaron leyendo el
texto de producción, no el respaldo: el espacio final va en las dos líneas del bloque `invite` y
no en las equivalentes del bloque `recovery`, y el fuente no termina en salto de línea. Los tres
valores que no se ajustaron —bytes, líneas y sha256— coincidieron. Una transcripción que hubiera
"corregido" el archivo no habría dado ese hash.

**Alcance:** comprobado `crear-reclutador`, que es el respaldo regenerado. Las otras 18 copias del
commit `4622d62` siguen con literalidad **inferida**, no comprobada contra una lectura nueva.

---

## Correcciones de documentación

Cambios que no tocan código pero sí lo que los documentos afirman. Se registran porque un dato
falso en `FUNCIONAL.md` o `TECNICO.md` dirige mal la siguiente iteración.

| Fecha | Documento | Qué decía | Qué dice | Por qué |
|-------|-----------|-----------|----------|---------|
| 11/08 | `TECNICO.md` §6 | `usuarios`: 2 filas | 4 filas activas, más el admin sin fila | El listado real del 11/08 devolvió 6 registros: 4 reclutadores reales y 2 de prueba de H-01, ya eliminados |
| 11/08 | `TECNICO.md` §6 | Los otros 7 recuentos sin marcar | Marcados ⚠️ no verificado | Son del 31/07. Si el de `usuarios` estaba mal, los demás también pueden estarlo |
| 11/08 | `FUNCIONAL.md` §9 | «2 reclutadores, 5 procesos, 2 trabajadores» | «4 reclutadores» verificado; procesos y trabajadores marcados ⚠️ | Mismo dato ya corregido en `TECNICO.md` y `CLAUDE.md`. `FUNCIONAL.md` manda, y era el único de los tres que seguía diciendo 2 |

La corrección de `FUNCIONAL.md` §9 se hizo con autorización expresa del dueño el 11/08, por
tratarse de contenido aprobado. Se limitó a la cifra y a marcar las dos que siguen sin comprobar;
no se tocó nada más del documento.

**Consecuencia que no es de inventario:** con 4 reclutadores reales en vez de 2, la exposición de
H-04 y H-05 —IDOR entre reclutadores— es mayor de lo que la documentación hacía pensar. El dato
cambia la prioridad, no solo el recuento.

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
