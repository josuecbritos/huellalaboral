# Huella Laboral — Bitácora de cambios

Registro de cada hallazgo corregido: qué se cambió, cuándo se desplegó, qué se probó y con qué
resultado. **Se actualiza en cada iteración, antes de darla por cerrada.**

**Criterio de cierre:** código desplegado + prueba A (falla antes) + camino feliz intacto +
caminos hostiles rechazados + no regresión + limpieza + respaldo regenerado + visto bueno.

---

## Estado general

| | Cerrados | En curso | Pendientes | Total |
|---|:---:|:---:|:---:|:---:|
| Hallazgos | 5 | 0 | 45 | 50 |

**En curso:** ninguno. Cerrados el 11/08/2026: H-01, H-07, H-04, H-05 y H-10.

**Residuos de prueba en producción, ninguno limpiable hoy.** Tres filas creadas por pruebas de
verificación que no tienen vía de borrado: el trabajador con payload XSS de H-07 y los dos
candidatos de H-10. Detalle en cada hallazgo. La causa común es N-2.

**Punto de retorno.** Las 19 funciones de `backup/edge-functions/` coinciden con producción en
versión y `ezbr_sha256`. Cinco archivos se han regenerado tras un despliegue y llevan su propia
comprobación: `crear-reclutador.ts` está verificada **byte a byte** contra el fuente desplegado,
y las cuatro de H-04/H-05/H-10 por lectura de vuelta desde producción y comparación. Las otras
14 mantienen literalidad **inferida** del respaldo del 08/08. No es un pendiente de ningún
hallazgo: es el estado del respaldo. Detalle en `backup/edge-functions/MANIFEST.md`.

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

## H-04, H-05 y H-10 · IDOR entre reclutadores

🔴 Crítica (H-04, H-05) · 🟠 Alta (H-10) · SEG · Esfuerzo S · **Estado: ✅ CERRADOS** (11/08/2026)

### El problema

Cuatro funciones autenticaban pero **no comprobaban propiedad**: verificaban que el llamante fuera
un reclutador válido y luego operaban sobre el `proceso_id` que viniera en la petición, fuera de
quien fuera. `listar-procesos` ya lo hacía bien con `.eq('usuario_id', userId)`; estas cuatro no.

| Hallazgo | Función | Qué permitía |
|----------|---------|--------------|
| **H-04** | `obtener-proceso` | Leer la cartera de candidatos de cualquier reclutador, con nombre, RUT, correo, WhatsApp y comuna. De solo lectura, sin rastro |
| **H-05** | `gestionar-proceso` | `eliminar` borraba `candidatos_proceso` y el proceso ajeno. **Irreversible.** `finalizar` cerraba procesos ajenos |
| **H-10** | `agregar-candidato` | Inyectar candidatos en procesos ajenos. Y `reclutador_nombre` llegaba del cliente y salía en M-4 y M-5: invitaciones firmadas con el nombre de otro |
| **H-10** | `obtener-stats` | Recuentos agregados de procesos ajenos, sobre un array sin filtrar |

### La decisión

Un bloque de comprobación de propiedad **idéntico en las cuatro**, con dos funciones:
`filtrarProcesosPropios` como primitiva sobre un array y `esProcesoPropio` como envoltorio de un
solo id. Así el requisito de "idéntico en las cuatro" se cumple literalmente aunque `obtener-stats`
necesite el caso del array y las otras tres el de un id.

Tres decisiones que no son obvias:

**`404`, nunca `403`.** Un proceso ajeno y uno inexistente devuelven exactamente la misma respuesta.
Un `403` confirmaría la existencia del proceso, que es justo lo que la comprobación esconde.

**`obtener-stats` filtra en silencio en vez de rechazar la petición entera.** La pantalla de
estadísticas se rompería completa por un solo id inválido, y rechazar con un error distinto según
el id exista o no filtraría por diferencia. Los ids salen de `listar-procesos`, que ya filtra, así
que un id ajeno ahí es un fallo o un ataque, y en ambos casos lo correcto es devolver los números
propios del llamante.

**El bloque falla cerrado.** Si la consulta a `procesos` da error, lanza y el llamante devuelve
`500`. Un `catch` que devolviera los ids pedidos convertiría un error transitorio de red en el
mismo IDOR que esto viene a cerrar.

### El cambio

- **Rama:** `fix/H-04-bloque-propiedad` · commits `8af5be8` (convenciones) y `575bbf8` (el arreglo),
  PR #5
- **Archivos:** `supabase/functions/{obtener-proceso,gestionar-proceso,agregar-candidato,obtener-stats}/index.ts`
- **Despliegues:** 11 de agosto de 2026, uno por uno y con aprobación explícita en cada tanda

| Función | Versión | `ezbr_sha256` nuevo |
|---------|:-------:|---------------------|
| `obtener-proceso` | 2 → **3** | `f3c1110b5adc901a…` |
| `gestionar-proceso` | 2 → **3** | `76d6df201f16825f…` |
| `obtener-stats` | 2 → **3** | `579d2aaea7922de9…` |
| `agregar-candidato` | 10 → **11** | `bca77d9e7c7e9d23…` |

`verify_jwt` sigue en `true` en las cuatro. Antes de cada despliegue se confirmó que la versión
viva coincidía con el `MANIFEST`, y las cuatro saltaron exactamente una versión, lo que descarta
que alguien hubiera tocado producción entremedio. Las otras 15 funciones no se tocaron.

**`dashboard.html` no se modificó, y no fue un olvido.** Los HTML se despliegan al fusionar a
`main` y las edge functions por separado. Quitar `reclutador_nombre` del body antes de desplegar
`agregar-candidato` habría hecho que la versión viva —que aún lo exigía— devolviera `400` al
agregar candidatos. El campo se sigue enviando y la función lo ignora. Quitarlo es limpieza
posterior, no parte del arreglo.

### Verificación

| Fase | Función | Prueba | Obtenido | Estado |
|------|---------|--------|----------|:------:|
| **A** | `agregar-candidato` | Inyección Andotek→ImmerX antes de v11 | `200` · `tipo: 'existente'` · M-4 firmado "NOMBRE FALSO" | ✅ |
| **A** | `obtener-proceso` | — | **No se pudo hacer.** Ver abajo | ⚠️ |
| **B** | `obtener-proceso` | Proceso propio, ambas cuentas | `200`, dashboards cargando con normalidad | ✅ |
| **B** | `gestionar-proceso` | `finalizar` sobre proceso propio | `200` · `{success: true}` | ✅ |
| **B** | `agregar-candidato` | Alta propia con `reclutador_nombre: 'NOMBRE FALSO 3'` en el body | `200`, correo firmado **"Josué Brito"** | ✅ |
| **B** | `obtener-stats` | ImmerX sobre proceso propio | `{candidatos: 1, evaluaciones: 0}` | ✅ |
| **C** | `obtener-proceso` | Proceso ajeno e inexistente | `404` `{error:'Proceso no encontrado'}`, idénticos byte a byte | ✅ |
| **C** | `gestionar-proceso` | `finalizar` sobre ajeno e inexistente | `404` idénticos | ✅ |
| **C** | `agregar-candidato` | La misma inyección de la fase A, tras v11 | `404` | ✅ |
| **C** | `obtener-stats` | Andotek pidiendo el proceso de ImmerX | `{candidatos: 0, evaluaciones: 0}` | ✅ |
| **D** | `listar-procesos` | Sigue operativa | `200` | ✅ |
| **D** | `crear-proceso` | Alta desde el dashboard | Sin error | ✅ |
| **D** | `obtener-stats` | Andotek sobre proceso propio | `{candidatos: 1, evaluaciones: 0}` | ✅ |

**Por qué el cero de `obtener-stats` en la fase C prueba algo.** Un `{candidatos: 0}` podría ser
"no hay datos" en vez de "no es tuyo". Se descartó en la misma tanda: el mismo proceso devuelve
`{candidatos: 1}` a su dueño. El cero es por filtrado, no por ausencia.

**Por qué `eliminar` no se probó, y por qué está bien.** Destruye datos ajenos de forma
irreversible si la comprobación fallara. La comprobación va **antes** del despacho por acción, así
que `finalizar` la cubre por construcción — y también cubrirá cualquier acción que se añada
después. Es el mismo criterio que en C4 de H-01, pero al revés: allí se buscó ejecutar la prueba de
verdad en vez de razonar sobre el código; aquí se decide no ejecutarla porque el coste de que
falle no es un error, es pérdida de datos de un tercero.

**La fase A de `obtener-proceso` no se pudo hacer, y es un error de método.** El pedido la define
como "sobre producción vulnerable" y a la vez ordena desplegar primero y verificar después. Las dos
cosas no caben. Se desplegó sin señalar el choque, y con eso desapareció la condición que la prueba
necesitaba. **No se revirtió para recuperarla:** volver a la v2 habría reabierto el acceso a datos
de candidatos ajenos en producción, y eso cuesta más que la evidencia.

Se recuperó por otra vía: la fase A de H-10 sobre `agregar-candidato`, que seguía vulnerable,
demuestra la misma clase de fallo —operar sobre el `proceso_id` de otro— y de paso los dos fallos
de H-10 a la vez. La casilla de `obtener-proceso` queda en ⚠️ a propósito: no se va a marcar ✅ por
analogía.

**El patrón, para los hallazgos que vienen:** cuando el orden de despliegue que pide un pedido
destruye la condición previa que otra de sus pruebas necesita, hay que decirlo **antes** de
desplegar. Después ya no hay decisión que tomar.

### Criterio de cierre

- [x] Código desplegado — las cuatro, 11/08, con aprobación explícita en cada tanda
- [~] Prueba A: el fallo existía — demostrada en `agregar-candidato`; **no** en `obtener-proceso`
- [x] Camino feliz intacto — fase B en las cuatro
- [x] Caminos hostiles rechazados — fase C en las cuatro
- [x] No regresión — fase D, `listar-procesos` y `crear-proceso` operativas
- [ ] **Limpieza: incompleta.** Ver abajo
- [x] Respaldos regenerados y `MANIFEST.md` al día
- [x] Visto bueno del dueño

### Residuos en producción

Ninguno es limpiable hoy, por el hallazgo N-2 de abajo.

| Qué | Dónde | De qué prueba viene |
|-----|-------|---------------------|
| Candidato vinculado, RUT `11.111.111-1` | Proceso ImmerX `165a911f-e646-4fa4-bcb3-3674e70924f0` | Fase A de H-10 |
| Invitación pendiente `dc2c4b41-24c5-4173-baa0-cc3ad35f9b3e`, RUT `22.222.222-2` | El mismo proceso | Fase B de H-10 |
| Trabajador `e4f2571c-8d46-41c4-ba09-8d9624e2a986`, con payload XSS en el nombre | Proceso de Andotek | Fase A de H-07 |

El residuo de H-07 ya no es solo un dato raro: ahora se sabe que **tampoco se puede quitar del
proceso**, no solo que no se puede borrar de `trabajadores`.

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

## Hallazgos nuevos detectados durante el trabajo

No estaban en la auditoría. Se anotan al encontrarlos para que no dependan de que alguien
recuerde haberlos visto.

| # | Dónde | Qué pasa | Detectado en | Estado |
|---|-------|----------|--------------|--------|
| N-1 | `crear-solicitud`, líneas 254, 294 y 337 del respaldo | Interpola `${trabajador.nombre}` sin escapar en el HTML de los correos **M-1, M-2 y M-3**. No es XSS —los clientes de correo no ejecutan scripts— pero sí inyección de HTML en el correo a contacto frío que `FUNCIONAL.md` §7 llama el más frágil del sistema | H-07 | Abierto, sin pedido |
| N-2 | Producto, no una función concreta | **No existe forma de quitar un candidato de un proceso.** Ni por interfaz ni por edge function: `gestionar-proceso` solo borra filas de `candidatos_proceso` como parte de `eliminar` el proceso entero | H-10 | Abierto, sin pedido |

**Por qué N-1 no se arregló en H-07:** es una edge function, y el pedido de H-07 acotaba el
alcance a `dashboard.html` y `admin.html`. Se deja para decisión del dueño.

**N-2 es funcional antes que técnico.** Es la razón de que los tres residuos de prueba sigan en
producción, pero el problema real no son las pruebas: un reclutador que agrega un candidato por
error no tiene forma de deshacerlo salvo borrar el proceso completo, lo que se lleva por delante a
todos los demás candidatos. Cualquier arreglo tiene que decidir antes qué significa "quitar":
borrar la fila, o marcarla como retirada conservando la trazabilidad del consentimiento
(`FUNCIONAL.md` §6.3). Es decisión de producto, no de implementación.

---

## Registro de reversiones

Ninguna hasta la fecha.

| Fecha | Hallazgo | Motivo | Acción |
|-------|----------|--------|--------|
| — | — | — | — |
