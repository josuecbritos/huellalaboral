# Huella Laboral — Bitácora de cambios

Registro de cada hallazgo corregido: qué se cambió, cuándo se desplegó, qué se probó y con qué
resultado. **Se actualiza en cada iteración, antes de darla por cerrada.**

**Criterio de cierre:** código desplegado + prueba A (falla antes) + camino feliz intacto +
caminos hostiles rechazados + no regresión + limpieza + respaldo regenerado + visto bueno.

---

## Estado general

| | Cerrados | En curso | Pendientes | Total |
|---|:---:|:---:|:---:|:---:|
| Hallazgos | 9 | 0 | 41 | 50 |

**Cerrados:** H-01, H-07, H-04, H-05 y H-10 el 11/08; H-02, H-03 y H-35 el 12/08.

**En curso:** **M-2**, un cambio de texto que el dueño hizo **a mano en el panel de Supabase** y que
se importó al repo después. Ya está en producción y verificado; falta fusionar el PR.

**Cerrados también:** UX-19 y UX-20 el 13/08 (PR #9). M-4 y M-5 el 13/08 (PR #10). M-1 el 13/08
(PR #11). La cadena de validación de documentos, que incluye H-22, se cerró el 12/08.

⚠️ **El repo dejó de ser la única fuente del código de las funciones el 13/08.** Antes de desplegar
cualquier función, comparar su versión y su `ezbr_sha256` contra `backup/edge-functions/MANIFEST.md`:
si no coinciden, producción tiene algo que el repo no. Detalle en la sección de M-2.

### Qué cuenta la tabla, y qué no

Aclarado por el dueño el 13/08, porque la numeración se prestaba a confusión:

| Identificador | De dónde sale | ¿Entra en los 50? |
|---------------|---------------|-------------------|
| `H-01` … `H-34` | Auditoría del 31/07 | **Sí** |
| `UX-01` … `UX-16` | Auditoría del 31/07 | **Sí** |
| `UX-17` en adelante | Detectados **usando el producto**, después de la auditoría | **No.** Van aparte; al 13/08 son ocho |
| `M-1` … `M-7` | **No son hallazgos.** Son los identificadores de los siete correos en `TECNICO.md` §7 | No |

Por eso la tabla no se movió al cerrar UX-19 y UX-20: son de los detectados usando el producto, no
de los 50. Y «M-4 y M-5» no es un hallazgo con número propio —es el trabajo sobre dos de los siete
correos—, así que tampoco cuenta. Los 41 pendientes siguen siendo `H-nn` y `UX-01`…`UX-16`.

### Datos de prueba en producción

**Se borran desde el editor SQL del panel.** Esto corrige lo que esta bitácora afirmó durante
varias iteraciones: que «no había forma de borrarlos». Era falso y venía de confundir dos cosas
distintas —lo que no existe es una **vía de producto** para quitar un candidato de un proceso, que
es UX-22 (antes anotado aquí como N-2)—. La consecuencia del error no fue técnica: se rechazaron
variantes de prueba por «no dejar residuo» cuando el residuo era limpiable en un minuto.

| Qué | Id | De dónde viene |
|-----|----|----------------|
| Trabajador con payload XSS en el nombre, y `estado: 'documentos_validados'` **falso** | `e4f2571c-8d46-41c4-ba09-8d9624e2a986` | Fase A de H-07, y fase A de H-03 |
| Candidato con RUT `11.111.111-1` en el proceso ImmerX `165a911f-…` | — | Fase A de H-10 |
| Invitación pendiente, RUT `22.222.222-2` | `dc2c4b41-24c5-4173-baa0-cc3ad35f9b3e` | Fase B de H-10 |
| Trabajador «sin documentos» con RUT `44.444.444-4` | `e2fccdec-891d-4017-9e14-c6a98aafa5bc` | Fase D de la cadena de validación |
| Trabajador con RUT `55.555.555-5`, correo `josuebrito+m5@gmail.com` | — | Bloque B de M-4/M-5, el 13/08 |
| Proceso «Analista Comercial — Agosto 2026» (Yokono), con `11.111.111-1` y `55.555.555-5` dentro | — | Bloques A, B y D de M-4/M-5, el 13/08 |
| Trabajador con RUT `88.888.888-8`, sin documentos | — | Verificación del cambio manual de M-2, el 13/08 |

**Punto de retorno.** Las 19 funciones de `backup/edge-functions/` coinciden con producción en
versión y `ezbr_sha256`. Diez archivos se han regenerado tras un despliegue y llevan su propia
comprobación, con distintos grados de rigor que el `MANIFEST` detalla uno a uno. Las otras
9 mantienen literalidad **inferida** del respaldo del 08/08. No es un pendiente de ningún
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
- [x] Punto de retorno comprobado byte a byte contra producción

**H-01 queda cerrado sin pendientes.**

**Punto de retorno comprobado** — 11 de agosto de 2026. La comparación byte a byte que quedó
pendiente al cerrar, porque el conector se había desconectado, se rehízo con el conector activo.
`get_edge_function('crear-reclutador')` devuelve versión **15**, `ezbr_sha256`
`61f1889065d7fb7bebf005adf43ed28a3228935b214c9e30d47ac02c9fbeec33`, `verify_jwt: true`, y su
fuente es **idéntico byte a byte** a `backup/edge-functions/crear-reclutador.ts`: sha256
`dcd8ba6d80cd2425759a163c3261dbb96a73856c111fa7330f81edf36f264189`, 9.784 bytes, 235 líneas
—234 saltos de línea, porque la última no termina en salto, así que `wc -l` devuelve 234—.
`cmp` y `diff -u` sin diferencias. El respaldo es copia literal, no inferida, y el procedimiento
de reversión devuelve producción a la versión 15 sin arrastrar nada.

**Cómo se comprobó, y qué prueba.** El MCP entrega el fuente dentro de un JSON en el contexto del
agente, no a disco, así que el volcado a archivo pasa por transcripción. Para que la comparación
no fuera complaciente, los dos rasgos que una retranscripción normaliza se fijaron leyendo el
texto de producción, no el respaldo: el espacio final va en las dos líneas del bloque `invite` y
no en las equivalentes del bloque `recovery`, y el fuente no termina en salto de línea. Los tres
valores que no se ajustaron —bytes, líneas y sha256— coincidieron. Una transcripción que hubiera
"corregido" el archivo no habría dado ese hash.

---

## H-07 · XSS almacenado en el panel del reclutador

🔴 Crítica · SEG · Esfuerzo S · **Estado: ✅ CERRADO** (11/08/2026)

### El problema

`dashboard.html` y `admin.html` construían HTML con plantillas y lo inyectaban con `innerHTML`
sin escapar nada. **No existía ninguna función de escape en el repo:** no era que faltara
aplicarla en un sitio, es que no había.

La cadena de ataque no necesita cuenta en ningún punto. `crear-solicitud` es pública por diseño
(`FUNCIONAL.md` §6.2), así que el atacante se declara evaluador de sí mismo, escribe el payload en
cualquier campo de texto, y el código se ejecuta **con la sesión del reclutador** que abra la
ficha, con acceso a `localStorage.getItem('hl_token')`.

**Sobrevive al arreglo de H-01.** H-01 cerró la creación de cuentas falsas; esto no crea una
cuenta, roba una real con todos sus permisos. Y como el rol se deriva comparando el email contra
`ADMIN_EMAIL` (`TECNICO.md` §2), si la víctima fuera el admin, el atacante hereda el panel entero.

### La decisión

Una función `escapeHtml` por archivo, aplicada a todo valor que haya tecleado una persona. Sin
librería: son archivos planos sin build. Los dos HTML son independientes y no comparten scripts,
así que la función se duplica físicamente y debe mantenerse idéntica en los dos.

`String(valor)` es deliberado y no cosmético: reproduce exactamente lo que interpolaba la
plantilla, de modo que `null` y `undefined` se siguen viendo igual que antes. Un `escapeHtml` que
devolviera cadena vacía para esos casos habría sido más bonito y habría cambiado el renderizado.

### El alcance real fue mayor que el del pedido

Esto importa más que el arreglo, y por eso queda escrito aparte.

El pedido señalaba tres bloques. Había **cinco**, más dos campos que no parecen campos:

| Dónde | Lo señalaba el pedido | Por qué importa |
|-------|:---------------------:|-----------------|
| `dashboard.html` · tarjetas de evaluación, camino de búsqueda por RUT | sí | Es el camino que **H-08 va a eliminar** |
| `dashboard.html` · tarjetas de evaluación, camino `verResultados` | **no** | Es el que el reclutador usa a diario |
| `dashboard.html` · tabla de candidatos | sí | — |
| `admin.html` · listado de usuarios | sí | — |
| `dashboard.html` · tabla de procesos (`cargo`, `descripcion`) | **no** | Hoy solo auto-XSS: `listar-procesos` sí filtra por `usuario_id` |

Las dos plantillas de tarjetas son casi gemelas, con los mismos campos bajo otros nombres
(`e.evaluador` / `e.nombre_evaluador`, `e.otros` / `e.comentarios`). El pedido apuntaba a la que
está condenada a desaparecer y no a la que se usa.

**Y dos campos disfrazados de traductores.** `formatearCausal` y `formatearTiempoTrabajo` hacen
`LABELS[valor] || valor`: si el código no está en su tabla, devuelven el valor crudo de la base.
Parecen convertir códigos a etiquetas y son un paso-a-través.

**El patrón, para los hallazgos que vienen:** un inventario de puntos vulnerables hecho leyendo
los usos de una API peligrosa —aquí `innerHTML`— encuentra los sitios, pero no encuentra las
funciones que devuelven dato de usuario sin parecerlo. Hay que seguir también de dónde sale cada
valor, no solo dónde entra.

### El cambio

- **Rama:** `fix/H-07` · commits `9c9e643` (convenciones en `CLAUDE.md`) y `e1650dd` (el arreglo),
  fusionados a `main` en el merge `a179053`, PR #3
- **Archivos:** `dashboard.html`, `admin.html`. Ninguna edge function, ninguna migración
- **Alcance:** 24 puntos escapados, 2 definiciones de `escapeHtml`
- **Despliegue:** Vercel, al fusionar el PR. **El merge es el despliegue**
- **Sin respaldo que regenerar:** no se tocó ninguna edge function

**Los `onclick` con datos interpolados quedaron sin escapar, a propósito.** `verResultados('${c.id}')`
y sus hermanos llevan UUID generados por la base. Aplicarles `escapeHtml` no habría protegido nada:
en un atributo, el parser decodifica `&#39;` de vuelta a `'` antes de que el motor de JS lo vea, así
que el escape HTML no neutraliza un contexto de cadena JavaScript. Lo que los protege es que el
valor sea un UUID. Si alguna vez uno de esos identificadores pasa a ser texto de usuario, el
arreglo no es escapar: es dejar de interpolarlo en el atributo.

### Verificación

| Fase | Prueba | Esperado | Obtenido | Estado |
|------|--------|----------|----------|:------:|
| **A** | Payload guardado vía `crear-solicitud` y abierto en el panel | El código se ejecuta (el fallo) | `alert` con `www.huellalaboral.cl` | ✅ |
| **A** | Nombre con `<Norte>` en pantalla | Se pierde texto | Truncado a "Müller & O'Brien" | ✅ |
| **B** | Mismo dato tras el despliegue | Sin ejecución | Sin `alert` | ✅ |
| **B** | Nombre completo visible | `Müller & O'Brien <Norte>` | Completo | ✅ |
| **C** | Payload como texto literal | Literal, no markup | Literal | ✅ |
| **D1** | Tabla de procesos | Carga normal | Carga normal | ✅ |
| **D2** | Listado de `admin.html` | Carga normal | Carga normal | ✅ |

**Evidencia de la fase A** — trabajador `e4f2571c-8d46-41c4-ba09-8d9624e2a986`, nombre
`<img src=x onerror="alert(document.domain)"> Müller & O'Brien <Norte>`.

**Cómo se generó el dato, y por qué así.** Con una llamada directa a `crear-solicitud` desde la
consola, con `empleadores: []` para no disparar los correos M-1, M-2 y M-3 a nadie. Sigue siendo
el flujo real del producto —pasa por la edge function y sus validaciones, no es un `INSERT`—, y
por eso demuestra lo que un `INSERT` no demostraría: que el payload **llega desde `crear-solicitud`
hasta la pantalla sin filtrarse en ningún punto intermedio**. La cadena de ataque es alcanzable,
no solo la plantilla vulnerable.

**Un único payload sirvió para A, B y C.** El mismo trabajador, leído antes y después del
despliegue, cubre la prueba de que el fallo existía, el camino feliz y el camino hostil. La cadena
`Müller & O'Brien <Norte>` hace de dato limpio y de payload a la vez: sus `&`, `'` y `<>` son
exactamente los metacaracteres que el escape tiene que tratar sin romper.

**Verificación independiente, antes de entregar.** Se extrajeron las plantillas reales de los dos
archivos —no copias reescritas— y se renderizaron en Chromium contra la versión anterior y la
corregida: 25 elementos vivos y payload ejecutándose antes, 0 y ninguno después. El banco detecta
el fallo en la versión vieja, así que no estaba midiendo el vacío.

### Un cambio visual que sí existe

`Consultora <Norte>` antes se parseaba como un elemento `<norte></norte>`: en pantalla se leía
"Consultora " y el resto desaparecía. Ahora se ve entero. El criterio "sin cambios visuales" del
pedido y su caso de prueba benigno nº 3 se rozan justo ahí, y se resolvió a favor de mostrar el
texto. Para datos sin metacaracteres el renderizado es idéntico byte a byte, comprobado con un
diff del HTML renderizado antes y después.

### Criterio de cierre

- [x] Código desplegado — merge `a179053`, Vercel
- [x] Prueba A: el fallo existía, y la cadena completa era alcanzable
- [x] Camino feliz intacto — fase B
- [x] Caminos hostiles rechazados — fase C
- [x] No regresión — fases D1 y D2
- [ ] **Limpieza: incompleta.** Ver abajo
- [x] Sin respaldo que regenerar
- [x] Visto bueno del dueño

**H-07 queda cerrado. La limpieza no.**

### Residuo en producción

El proceso de prueba lo borró el dueño desde `dashboard.html`. La fila del trabajador
`e4f2571c-8d46-41c4-ba09-8d9624e2a986` sigue en `trabajadores` con el payload en el campo `nombre`.
No es peligrosa —el payload ya no se ejecuta, que es justamente lo que se arregló— pero es un dato
de prueba con contenido raro en una base con datos personales reales.

**Corrección (12/08):** aquí se afirmó que «no hay forma de borrarla». Es falso. **Se borra desde
el editor SQL del panel.** El error fue mío y se propagó a varias iteraciones: confundí «el agente
no puede borrarla, porque el grupo `database` del conector está desactivado» con «no se puede
borrar». Lo primero es cierto; lo segundo no. La consecuencia no fue técnica sino de método: se
descartaron variantes de prueba por «no dejar residuo» cuando el residuo era limpiable en un minuto.

---

## H-02, H-03 y H-35 · El token de validación no era un token

🔴 Crítica (H-02, H-03) · 🟠 Funcional (H-35) · SEG · **Estado: ✅ CERRADOS** (12/08/2026)

### El problema

`validar.html?token=<valor>` recibía el **`trabajadores.id`**. No es una credencial: es la clave
primaria, y `crear-solicitud` la devolvía a llamantes anónimos en `{ success: true, trabajadorId }`.
Ambas funciones lo llevaban anotado en el código: `// TODO: Implementar tokens de validación separados`.

| Hallazgo | Qué permitía, sin autenticación de ninguna clase |
|----------|--------------------------------------------------|
| **H-02** · `obtener-validacion` | Leer nombre, RUT y correo, y obtener URLs firmadas al certificado de cotizaciones y al finiquito. Historial laboral y previsional completo |
| **H-03** · `validar-documentos` | Insertar en `validaciones_documentos` y dejar al trabajador en `documentos_validados`: **falsificar la verificación que el producto vende** |
| **H-35** | Al resubir documentos, quedaban en `validado: false` pero `trabajadores.estado` no se tocaba: quien ya estaba en `documentos_validados` seguía figurando como validado con papeles sin revisar |

`validar-documentos` era aún peor de lo que decía la auditoría: **no comprobaba siquiera que el
trabajador existiera**. Tomaba el token como id y operaba.

### La decisión

Credencial propia: `trabajadores.token_validacion` (UUID, único, no nulo) más
`token_validacion_usado`. Se descartó reusar `token_consulta` porque va al trabajador por correo
y le permitiría validar sus propios documentos.

Tres decisiones que no son obvias:

**Se consume al enviar la validación, no al abrir la página.** El validador tiene que poder abrir
el enlace, revisar los PDF, cerrar la pestaña y volver. Consumirlo al leer rompería el uso normal.

**No caduca.** El reenvío del correo ocurre con o sin caducidad, y si alguien puede leer la base el
problema es otro. Lo que invalida el token es usarlo o resubir documentos.

**Resubir documentos regenera el token**, aunque el anterior nunca se hubiera usado. Si el validador
tiene dos correos en la bandeja, el viejo no puede aprobar documentos que ya fueron sustituidos.

### El cambio

- **Rama:** `fix/H-02-H-03` · PR #6
- **Migración:** `supabase/migrations/20260811_token_validacion.sql`, aplicada por el dueño desde el
  panel. Comprobación posterior: 3 filas, 3 con token, **3 distintos**, 0 usados
- **Frontend:** `validar.html`, solo texto

| Función | Versión | `ezbr_sha256` |
|---------|:-------:|---------------|
| `obtener-validacion` | 2 → **3** | `b5e8f62d4d781b9e…` |
| `validar-documentos` | 4 → **5** | `51fb897e60b4d043…` |
| `crear-solicitud` | 26 → **27** | `4143653c738b6a3c…` |

`verify_jwt: true` en las tres, sin cambios. Las otras 16 funciones no se tocaron.

**El orden de despliegue se eligió, no salió así.** Primero las dos lectoras y `crear-solicitud` al
final: cierra el agujero de inmediato. Al revés, durante la ventana entre despliegues el ataque
habría seguido funcionando. Y la migración fue antes que todo, porque desplegar `crear-solicitud`
contra una tabla sin las columnas habría roto el alta de solicitudes, que es el flujo público.

**Por qué el `UPDATE` de la migración no sobra.** Rellena las filas existentes una a una en vez de
confiar en que el motor evalúe `gen_random_uuid()` por fila al añadir la columna. Si lo evaluara
una sola vez, las tres filas compartirían token y cualquiera podría validar los documentos de
cualquiera: el mismo agujero, pero peor. Los `3 distintos` de la comprobación son la prueba de que
quedó bien.

**`validaciones_documentos.validador_id` no se escribió**, y es una decisión, no un olvido. La
función no autentica a nadie y el validador interno es un buzón de correo, no un rol con cuenta.
Cualquier valor habría sido inventado. Para que la columna signifique algo hay que decidir antes
quién es el validador.

**Dos textos de `validar.html` contradecían el diseño nuevo** y se corrigieron: el bloque de error
decía «o ha expirado» cuando el token no expira, y el mensaje de envío decía «Intenta nuevamente»,
que tras consumir el token es un callejón sin salida. Solo texto, sin tocar lógica.

### Verificación

**Fase A — el dueño hizo una variante mejor que las dos que le propuse.** Yo ofrecía crear un
trabajador de prueba —que habría dejado un residuo nuevo imborrable— o usar el residuo de H-07 con
evidencia a medias. Él usó una tercera: abrió un correo antiguo de «Nuevos documentos para validar»
de la bandeja de `contacto@` y pegó su enlace en una ventana de incógnito.

| Fase | Prueba | Obtenido | Estado |
|------|--------|----------|:------:|
| **A** | Enlace antiguo (con `trabajador_id`) en incógnito, sin sesión | Pantalla completa: nombre, RUT, correo y los dos PDF abriendo | ✅ |
| **A** | `validar-documentos` con `e4f2571c…` (residuo de H-07) | `200` · `{success: true}`. Validación falsificada sobre un trabajador ajeno | ✅ |
| **B** | Solicitud nueva con RUT `11.111.111-1`; llega el M-3 | Token del enlace **distinto** del `trabajador_id` | ✅ |
| **B** | El enlace abre con datos y los dos PDF | Abre | ✅ |
| **B** | Cerrar la pestaña y reabrir el mismo enlace | **Sigue funcionando** — no se consume al leer | ✅ |
| **B** | Enviar la validación | Pantalla de éxito | ✅ |
| **C** | Seis llamadas: `trabajador_id`, token usado, inexistente y mal formado, leer y validar | Las seis `404 {"error":"Token inválido o ya utilizado"}`, **idénticas** | ✅ |
| **D** | Resubir con el mismo RUT | M-3 nuevo con token distinto; el anterior sigue dando `404`; el nuevo abre | ✅ |
| **D** | `estado.html` con `token_consulta` | Sigue funcionando | ✅ |
| **D** | H-35 comprobado **por SQL**: `19.114.926-2` | `estado: 'pendiente'`, y `fecha_validacion: null` en certificado y finiquito | ✅ |

Demostró los dos fallos **sobre la pantalla real y sin crear ningún dato nuevo**. Es el mejor
método de fase A de las cuatro iteraciones: usó evidencia que ya existía en producción en vez de
fabricarla.

**El patrón, para los hallazgos que vienen:** antes de generar datos de prueba en una base con
datos personales reales, mirar si el sistema ya contiene la evidencia. Un correo viejo en una
bandeja es un artefacto de producción tan válido como una llamada nueva, y no deja residuo.

**Antes de entregar** se ejercitó el código real —transpilado con `tsc` desde
`supabase/functions/`, sin reescribirlo— contra una base simulada: **40 comprobaciones en verde**,
incluidas las cuatro de los criterios de aceptación y el paso 2 de `crear-solicitud`, que no se
tocó. No sustituye a B/C/D contra producción; sirve para no entregar algo roto.

### Criterio de cierre — **incompleto a propósito**

- [x] Migración aplicada y comprobada — 3 filas, 3 tokens distintos
- [x] Código desplegado — las tres, con aprobación explícita
- [x] Prueba A: los dos fallos existían, demostrados en producción
- [ ] Camino feliz, hostiles y no regresión — **pendientes: B, C y D**
- [x] Respaldos regenerados y `MANIFEST.md` al día
- [ ] Visto bueno del dueño

**H-02, H-03 y H-35 quedan cerrados.**

**H-35 se comprobó por SQL, no por inspección del código.** El trabajador `19.114.926-2`, validado
y luego resubido, quedó en `estado: 'pendiente'` con `fecha_validacion: null` en los dos documentos.
Es la diferencia entre "el código lo hace" y "la base lo refleja".

**Un fallo del bloque de pruebas que entregué, anotado porque el patrón importa.** El preámbulo
extraía la clave anon de la página con un regex y en `validar.html` capturó 347 caracteres en vez de
208; las seis llamadas murieron con `401 UNAUTHORIZED_LEGACY_JWT` y el bloque imprimió un
`❌ C FALLA` **falso**. La comprobación de longitud estaba puesta, pero era un `console.log`: avisó
y dejó seguir. **Una comprobación que no aborta no es una comprobación.** En adelante, los bloques
de verificación llevan la clave literal y `throw` si no cuadra.

---

## Cadena de validación de documentos · incluye H-22

🔴 Crítica · SEG/FUNC · **Estado: ✅ CERRADO** (12/08/2026)

### De dónde salió

**No de la auditoría: de la fase D del Bloque 3.** Al resubir documentos y validarlos por segunda
vez marcándolos como no válidos, `estado.html` seguía mostrando los números de la **primera**
validación y la insignia «✓ VALIDADA». Cuatro defectos encadenados, todos anteriores al Bloque 3.
El efecto conjunto: **el producto muestra como verificado lo que no lo está.**

| # | Defecto |
|---|---------|
| 1.1 | Tres funciones leían `validaciones_documentos[0]`, sin ordenar ni filtrar. `documentos` se **actualiza** al resubir conservando su `id`, así que las validaciones viejas siguen colgando de la misma fila |
| 1.2 | El finiquito se insertaba con `valido: true` **fijo** —comentario literal: «Siempre true si llegó aquí»—. No podía ser no válido, dijera lo que dijera el validador |
| 1.3 | `causalValidada = ... \|\| null` convertía un `false` explícito en `null`, así que la insignia roja que las dos pantallas ya tenían escrita **no podía aparecer nunca** |
| 1.4 | H-22: «no válido», «pendiente de validar» y «no entregó documentos» se veían los tres como `—` |

### La evidencia de la fase A

Sobre `11.111.111-1`, validado dos veces. Cuatro filas en `validaciones_documentos`: las de las
13:22 con certificado válido y 3 empleos, las de las 13:28 con certificado **no válido** y causal
que **no coincide**. El panel mostraba los datos de las 13:22 y la insignia «✓ VALIDADA».
**Mostraba lo contrario de la verdad.**

También quedó confirmado 1.2 en la base: la fila del finiquito de las 13:28 tiene `valido: true`
pese a que el validador marcó que no coincide.

**Mi bloque de fase A apuntaba al trabajador equivocado.** Elegí `19.114.926-2` porque sabía que
tenía `fecha_validacion: null`, y de ahí deduje «lo que muestre es caducado». Faltaba un paso:
`null` también es lo que se ve cuando **nunca hubo validación**, que era su caso. La prueba era
vacua. El dueño encontró el caso real. **Saber parte del estado de un dato no es saber su estado.**

### La decisión

Un **código de envío** en `documentos` y en `validaciones_documentos`: `envio_id`. Una validación
cuenta solo si su `envio_id` coincide con el del documento. El valor es `token_validacion`, que ya
se regenera exactamente cuando se suben documentos.

Se descartó **comparar por fecha**: implícito y frágil.

El relleno de lo existente usa `documentos.fecha_validacion`, y no es una suposición:
`crear-solicitud` la pone a `null` al resubir y `validar-documentos` la escribe al validar.

**Para ordenar se usa `created_at` y no `fecha_validacion`**, porque
`validaciones_documentos.fecha_validacion` no la escribe nadie: el `insert` de `validar-documentos`
no la incluye. La migración lleva un `raise exception` que la detiene si `created_at` no existiera,
en vez de rellenar con un orden arbitrario.

**Finiquito, opción A:** `valido` se deriva de `valido_y_coincide`. `validar.html` no manda un
campo de validez general, y la opción negativa del formulario dice literalmente «No - Finiquito
inválido o causal no coincide», así que el campo ya cubre las dos cosas por diseño. No inventa
nada. Separar los dos juicios queda anotado como mejora futura.

### El cambio

- **Rama:** `fix/validaciones-vigentes` · PR #7
- **Migración:** `20260812_envio_id_validaciones.sql`, aplicada por el dueño. Comprobación
  posterior: 4 documentos con envío, 2 pendientes — coincide con el conteo previo

| Función | Versión | `ezbr_sha256` |
|---------|:-------:|---------------|
| `crear-solicitud` | 27 → **28** | `4ee7818dcb5335a5…` |
| `validar-documentos` | 5 → **6** | `eb8d2ac25ceab54f…` |
| `obtener-estado` | 3 → **4** | `8e9b0eb2f3e75d2b…` |
| `obtener-candidato` | 9 → **10** | `0a2d25029e24236f…` |
| `agregar-candidato` | 11 → **12** | `7ce3e052fb5d9d89…` |

**El orden de despliegue se eligió:** `crear-solicitud` de las primeras. Si las lectoras se
despliegan antes, los documentos subidos en la ventana quedan sin `envio_id` y se verían pendientes
**para siempre**, aunque después se validaran. Es la única de las cinco cuyo retraso deja datos
mal, no solo pantallas mal.

### Verificación

Antes de entregar: las cinco compilan, los dos HTML parsean, y el código real transpilado con `tsc`
pasa **21 comprobaciones** contra una base simulada que reproduce el caso de producción —cuatro
validaciones, dos envíos, solo la vigente se muestra—.

- [x] Migración aplicada y comprobada
- [x] Código desplegado, con aprobación explícita
- [x] Prueba A: el fallo existía, demostrado en producción sobre `11.111.111-1`
- [x] Camino feliz intacto — fase B
- [x] Lo caducado deja de mostrarse — fase C
- [x] No regresión — fase D
- [x] Respaldos regenerados y `MANIFEST.md` al día
- [x] Visto bueno del dueño

### Verificación en producción — 12/08

| Fase | Prueba | Obtenido | Estado |
|------|--------|----------|:------:|
| **B.1** | `13.435.655-3`, ya validado antes de la migración | `validado`/`validado`, 3 empleos, 2 años. **La migración no rompió lo vigente** | ✅ |
| **B.2** | Ciclo nuevo con `11.111.111-1`, validado como válido | `validado`/`validado`, 1 empleo, 5 años, visible en la ficha | ✅ |
| **C.1** | Resubir sin validar | `pendiente_validacion` en ambos, `cert_empleos: null`. En pantalla «Pendiente de validación» en las tres tarjetas; **los números anteriores desaparecieron** | ✅ |
| **C.2** | Validar marcando ambos como no válidos | «No válido — ‹motivo›» y la insignia roja **✗ NO VALIDADA**. El motivo del certificado llega y se muestra | ✅ |
| **C.3** | `19.114.926-2`, nunca validado | `pendiente_validacion`, sin datos caducados | ✅ |
| **D** | Ciclo completo | Salieron M-1, M-2 y M-3. `estado.html` con `token_consulta` muestra lo mismo que el panel | ✅ |
| **D** | Trabajador nuevo sin documentos (`44.444.444-4`) | `sin_documento` en ambos, sin errores | ✅ |

**C.2 es la prueba que cierra los cuatro defectos a la vez.** La insignia roja apareció por primera
vez desde que existe el código que la dibuja: hasta hoy el `|| null` la hacía inalcanzable.

### Pendiente decidido aparte

**`reenviar-validacion`.** Tras la migración, un trabajador sin validación vigente solo puede
revalidarse si vuelve a subir sus documentos. Se propuso una función nueva llamada desde
`admin.html` que regenere el token y reenvíe el M-3 sin pedirle nada al trabajador. El dueño la
dejó como **pedido aparte**, a decidir al cerrar este.

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

### Datos de prueba que dejó esta verificación

Se borran desde el editor SQL del panel. Ver la corrección en «Estado general».

| Qué | Dónde | De qué prueba viene |
|-----|-------|---------------------|
| Candidato vinculado, RUT `11.111.111-1` | Proceso ImmerX `165a911f-e646-4fa4-bcb3-3674e70924f0` | Fase A de H-10 |
| Invitación pendiente `dc2c4b41-24c5-4173-baa0-cc3ad35f9b3e`, RUT `22.222.222-2` | El mismo proceso | Fase B de H-10 |
| Trabajador `e4f2571c-8d46-41c4-ba09-8d9624e2a986`, con payload XSS en el nombre | Proceso de Andotek | Fase A de H-07 |

Lo que UX-22 impide no es borrarlos, sino **quitar un candidato de un proceso desde el producto**.

---

## UX-19 y UX-20 · Favicon en las 12 pantallas, y logo según el fondo

🔵 Presentación · UX · Esfuerzo S · **Estado: ✅ CERRADOS** (13/08/2026) · PR #9 fusionado

### El problema

**UX-19 — ninguna de las 12 páginas tenía favicon.** Cero coincidencias de `favicon` o
`rel="icon"` en el repo, comprobado antes de tocar nada. La pestaña salía con el icono genérico
del navegador en pantallas donde a un desconocido se le pide su RUT y se le piden documentos.

**UX-20 — el logo llevaba el fondo blanco incrustado, y la causa estaba en el archivo, no en el
CSS.** `Huella_Laboral.png` era un **JPEG con extensión `.png`**: `file` devuelve
`JPEG image data, JFIF standard 1.01 … 704x192`. El JPEG no admite canal alfa, así que el fondo
blanco viajaba dentro de la imagen. Se veía como un recuadro blanco en las dos pantallas donde
el logo va sobre azul.

Las dos pantallas, verificadas leyendo el CSS de las 12 y no dando por buena la lista del pedido:

| Pantalla | Contenedor | Fondo |
|----------|------------|-------|
| `dashboard.html` | `.sidebar` | `var(--azul)` |
| `estado.html` | `nav` | `var(--azul)` |

Las otras diez usan `var(--fondo)` o el fondo claro de la página, y ahí el recuadro no se nota.

### La decisión

**Un archivo por color de fondo, no un solo PNG transparente.** Un logo azul sobre `var(--azul)`
sería ilegible aunque el fondo fuera transparente: el problema no se agota quitando el recuadro.
De ahí el negativo blanco para las dos pantallas oscuras.

**El bloque de favicon queda idéntico en los 12**, byte a byte. Es la parte del pedido que más
fácil se degrada con el tiempo —una variante por página, y cambiar el icono pasa de tocar tres
archivos a revisar doce—. Va después del `</title>`, que es la única línea presente y en la misma
forma en los 12 archivos.

**Rutas absolutas** (`/favicon.ico`), no relativas. Los 12 HTML están hoy en la raíz del
despliegue, pero una ruta relativa ata el bloque a esa suposición y el requisito es justo el
contrario: que el bloque no dependa de la página.

**`Huella_Laboral.png` no se borra.** Queda como punto de retorno hasta que la fusión esté
verificada en producción. Ya no lo referencia ningún HTML.

### El cambio

Cuatro líneas por archivo, en los 12: tres de favicon y una de logo. Ni una más — ningún tamaño,
ninguna posición, ninguna clase y ningún atributo `style` se tocaron; el diff conserva cada uno
literalmente.

| Archivo | Logo | Bloque de favicon |
|---------|------|-------------------|
| `dashboard.html`, `estado.html` | → `logo-huella-laboral-blanco.png` | Idéntico |
| Los otros diez | → `logo-huella-laboral.png` | Idéntico |

### Verificación

No lleva fases A/B/C/D: no hay comportamiento que capturar, es presentación. Lo que sí se puede
medir es la maquetación, y se midió con Chromium: los 12 HTML de `origin/main` contra los 12 de
la rama, misma ventana, comparando la caja del logo al centipíxel.

| Qué | Resultado |
|-----|-----------|
| Caja del logo (ancho × alto × posición) antes vs. después | **Idéntica en las 12**, al centipíxel |
| El bloque de favicon es el mismo en los 12 | ✅ Un solo `sha256` para las 12 copias |
| Tres `<link rel="icon">` por página, ninguno antes | ✅ 12/12 |
| Ningún archivo referenciado que no cargue | ✅ 12/12 |
| **Control: ¿la comprobación sabe fallar?** | ✅ Con un logo de 600×192 en vez de 704×192, las 12 dan ❌ y `crear-password.html` además desplaza el logo 11 px en horizontal |

La última fila es la que hace útiles a las otras. Una comparación que da ✅ pase lo que pase no
comprueba nada; ya pasó en la cadena de validación con una comprobación que detectaba el problema
y no abortaba. El control se corrió de verdad, no se razonó.

El arnés queda en `pedidos/maqueta-UX-19-UX-20.mjs`. Detecta si los archivos reales están en la
raíz y lo dice al arrancar; mientras faltaban, medía con un relleno de 704×192.

**Esta medición se corrió dos veces.** La primera, con los cuatro archivos aún sin subir, dejaba
una afirmación condicionada —«la maquetación no cambia *siempre que* los logos sean 704×192»—. El
dueño los subió (commit `f5be6fe`) y se repitió con los reales: **mismo resultado, ya sin
condición**.

### Los archivos, comprobados y no supuestos

Antes de repetir la medición se comprobó qué son de verdad los cinco archivos, en vez de fiarse
del nombre. Es exactamente el error que originó UX-20: `Huella_Laboral.png` decía `.png` y era
un JPEG.

| Archivo | Qué es | Dimensiones | Transparente |
|---------|--------|------------:|-------------:|
| `logo-huella-laboral.png` | PNG RGBA | 704×192 | 76,6 % |
| `logo-huella-laboral-blanco.png` | PNG RGBA | 704×192 | 76,6 % |
| `favicon-32.png` | PNG RGBA | 32×32 | 17,2 % |
| `apple-touch-icon.png` | PNG RGBA | 180×180 | 20,7 % |
| `favicon.ico` | ICO, 3 iconos | 16, 32, 48 | — |
| `Huella_Laboral.png` *(el antiguo)* | **JPEG** | 704×192 | **0 %** |

La última fila es el diagnóstico de UX-20 medido en píxeles: **0 % de transparencia**, y el 80 %
de su tinta es clara, que es el fondo blanco viajando dentro de la imagen.

Los dos logos nuevos tienen **la misma silueta** —76,6 % transparente los dos— y se diferencian
solo en el color de la tinta:

| Logo | Luminancia media de la tinta | Contraste sobre `var(--azul)` #0E2A47 |
|------|-----------------------------:|--------------------------------------:|
| `logo-huella-laboral.png` | 38 (100 % tinta oscura) | **1:1 — invisible** |
| `logo-huella-laboral-blanco.png` | 255 (100 % tinta clara) | **14,57:1** |

Ese `1:1` es la justificación de que hagan falta dos archivos y no uno transparente: sobre el
azul, el logo azul desaparece aunque el fondo sea transparente. El negativo pasa WCAG AA (3:1
para texto grande) con holgura.

### Revisión visual, ya con los archivos reales

Renderizadas las cuatro pantallas representativas y miradas una a una:

| Pantalla | Qué se comprobó | Resultado |
|----------|-----------------|-----------|
| `dashboard.html` · `.sidebar` | Negativo blanco sobre azul | ✅ Sin recuadro. Las líneas horizontales del diseño se conservan |
| `estado.html` · `nav` | Negativo blanco sobre azul | ✅ Igual. Cabe en los 56 px de la barra |
| `index.html` · `nav` | Logo azul sobre claro | ✅ Igual que antes del cambio |
| `validar.html` · `.header` | Logo azul, el de 180 px | ✅ Igual que antes |

**Queda una salvedad conocida y aceptada:** `favicon-32.png` es un círculo blanco opaco con la
huella azul —solo 17,2 % transparente—, así que en pestañas de tema claro el círculo se funde con
el fondo y queda flotando la huella. Está aceptado por el dueño y es la razón de que el bloque
sea idéntico en los 12: cambiarlo es sustituir tres archivos.

### Criterio de cierre

| Requisito | Estado |
|-----------|--------|
| Los cinco archivos en la raíz | ✅ `a948f7e` (favicon.ico) y `f5be6fe` (los otros cuatro) |
| Los archivos son lo que dicen ser | ✅ Comprobado con `file` y por píxeles, no por el nombre |
| Favicon idéntico en los 12 | ✅ Un solo `sha256` para las 12 copias |
| Logo por fondo, 2 blancos y 10 azules | ✅ |
| Maquetación intacta | ✅ Medido con los archivos reales, sin condición |
| Revisión visual sobre el azul | ✅ Sin recuadro, contraste 14,57:1 |
| `Huella_Laboral.png` conservado | ✅ Sin referencias desde ningún HTML |
| Documentación | ✅ `CAMBIOS.md` y `TECNICO.md` §5 |
| PR abierto, sin fusionar | ✅ PR #9 |

**Ya se puede fusionar.** El bloqueo era de orden, no de código: los 12 HTML apuntaban a dos
archivos que no estaban en `main`, y fusionar antes habría dejado las 12 pantallas sin logo en
cuanto Vercel desplegara. El PR no podía traer los binarios —llegaron como imágenes pegadas en el
chat, y de una imagen renderizada no se reconstruye el binario—, así que el orden era forzoso:
primero los archivos a `main`, después el PR. Ambas cosas hechas.

Ni edge functions ni migración: el cambio es solo de frontend. **Queda cerrado al fusionar**, que
es lo único pendiente.

---

## M-4 y M-5 · Los correos no decían de qué empresa ni a qué cargo

🔵 Presentación · UX · Esfuerzo S · **Estado: ✅ CERRADOS** (13/08/2026) · PR #10 fusionado

### El problema

Los dos correos que envía `agregar-candidato` nombraban al reclutador y nada más. El trabajador
recibía un nombre de persona suelto: con tres postulaciones abiertas, no podía saber cuál era.

Los datos existían y no se consultaban. `procesos.cargo` es obligatorio en `crear-proceso` y
`usuarios.empresa` lo es en `crear-reclutador`. La función ya consultaba las dos tablas —`procesos`
para comprobar propiedad, `usuarios` para el nombre del reclutador— y no pedía ninguno de los dos
campos.

### La decisión

**El cargo no sube al asunto.** El asunto se corta entre los 35 y 50 caracteres en el móvil;
«Andotek te invita a un proceso de selección» son 44, y con el cargo pasaría de 80 y se cortaría
justo donde está el dato útil. El cargo va en el cuerpo, que tiene espacio.

**El verbo se mantiene distinto entre los dos correos** —«agregó» en M-4, «invitó» en M-5—. Son
situaciones distintas y uniformarlas perdería información.

**Los dos asuntos van en pretérito, y eso se corrigió después de desplegar.** La primera versión
dejó M-5 en presente —«te invita»—, que sonaba a publicidad y desentonaba con el «te agregó» de
M-4. Los dos correos describen un hecho que ya ocurrió. Se desplegó una v14 solo para el asunto:
la apertura del cuerpo ya decía «te ha invitado a participar» y no se tocó.

**El asunto de respaldo de M-5 deja de ser el original.** Antes de este hallazgo era «te invita a
solicitar tus referencias laborales»; ahora, sin empresa, es `${reclutador_nombre} te invitó a un
proceso de selección`. Es la única parte de M-4/M-5 donde el respaldo **no** reproduce el texto
previo, y es deliberado: el verbo es decisión de redacción, no consecuencia de qué campos hay.
Lo que el respaldo decide es quién firma, no cómo se conjuga.

**Los respaldos son por campo, no todo o nada.** Sin empresa el asunto vuelve al de antes y firma
el reclutador; sin cargo se omite su cola. Se trata como ausente lo mismo `null` que la cadena
vacía tras recortar espacios: que un campo sea obligatorio en su formulario no impide que llegue
en blanco, y «para el cargo de  .» es peor que una frase corta.

**El asunto lleva los valores crudos y el cuerpo los lleva escapados.** No es una inconsistencia:
el asunto de Resend es texto plano, y escaparlo mostraría «Fábrica &amp;amp; Cía» literal en la
bandeja de entrada. El cuerpo es HTML y sigue el criterio de H-07.

**Se escapan los tres, no los dos del pedido.** El pedido pedía escapar `empresa` y `cargo`. El
nombre del reclutador va en la misma frase, lo teclea un humano igual que los otros dos, y estaba
sin escapar desde antes. Escaparlo es una línea en código que ya se estaba tocando; dejarlo fuera
habría sido aplicar el criterio a dos de tres valores de la misma oración. **Alcance algo mayor
que el del pedido, y se anota como tal.** No es N-1: aquel es `crear-solicitud` y sigue abierto.

**El cargo cuesta una consulta más.** El pedido pedía evitarla si se podía, y no se pudo sin pagar
un precio peor: la única forma era pedir `cargo` dentro de `filtrarProcesosPropios`, que es
**idéntico en cuatro funciones a propósito**, de modo que tocarlo aquí obligaba a tocar las otras
tres —fuera de alcance— y rompía la uniformidad de la comprobación de propiedad para ahorrar una
búsqueda por clave primaria. Mal negocio sobre un invariante de seguridad. La consulta va
**después** de la comprobación: un proceso ajeno devuelve 404 antes de llegar a ella.

### El cambio

`agregar-candidato` v12 → **v13**, `verify_jwt: true` sin cambios. Una función, ningún HTML,
ninguna migración.

| Dónde | Qué |
|-------|-----|
| `select` de `usuarios` | `nombre` → `nombre, empresa` |
| Consulta nueva a `procesos` | `select('cargo')`, después de la comprobación de propiedad |
| `textoOpcional` | Trata `null` y la cadena vacía tras recortar como ausentes |
| `escapeHtml` | Igual que el de H-07. Solo para el cuerpo |
| `aperturaCorreo` | Construye la frase de M-4 y M-5 con los respaldos por campo |

### Verificación

**Sin fase A**, y el pedido lo dice: el fallo se lee en el código, no hay que capturarlo.

Las pruebas se corrieron sobre el **fuente real transpilado**, no sobre una copia a mano: si lo
probado no es lo desplegado, la prueba no vale nada.

**Matriz de respaldos — 12 combinaciones, las 12 según §2 y §3:**

| Caso | Asunto M-4 | Apertura |
|------|-----------|----------|
| Ambos | `Andotek te agregó…` | `<b>Josué</b>, de <b>Andotek</b>, te ha agregado … para el cargo de <b>Operario de bodega</b>.` |
| Sin cargo | `Andotek te agregó…` | `…, de <b>Andotek</b>, te ha agregado a un proceso de selección.` |
| Sin empresa | `Josué Britos te agregó…` | `<b>Josué</b> te ha agregado … para el cargo de <b>Operario de bodega</b>.` |
| Ninguno | `Josué Britos te agregó…` | Como antes del cambio |
| Cadena vacía | Igual que «ninguno» | Igual que «ninguno» |

M-5 se comportó igual, con su propio verbo y su propio asunto de respaldo.

**No regresión, medida y no razonada.** Se generó el correo completo con el código de `origin/main`
y con el nuevo, y se compararon línea a línea:

| | M-4 | M-5 |
|---|---|---|
| Líneas del cuerpo antes / después | 19 / 19 | 22 / 22 |
| Líneas que cambian | **1** | **1** |
| `from`, `to` | Iguales | Iguales |
| Botón a `trabajador.html` | Intacto | Intacto |

La única línea que cambia en cada correo es la de apertura. El resto del cuerpo, el botón, los
enlaces, los estilos y el pie quedaron literalmente iguales.

**Escapado:**

| Entrada | Asunto (texto plano) | Cuerpo (HTML) |
|---------|---------------------|---------------|
| `Fábrica & Cía <SA>` | `Fábrica & Cía <SA> …` crudo | `Fábrica &amp;amp; Cía &amp;lt;SA&amp;gt;` |
| Reclutador `<img src=x onerror=alert(1)>` | No aparece | Escapado, sin etiqueta viva en el HTML |

### La verificación en producción

Corrida por el dueño sobre el proceso «Analista Comercial — Agosto 2026», reclutador Josué Brito,
empresa Yokono.

| Bloque | Qué se comprobó | Resultado |
|--------|-----------------|-----------|
| **A · M-4** | Candidato `11.111.111-1` | Asunto «Yokono te agregó a un proceso de selección»; apertura «Josué Brito, de Yokono, te ha agregado a un proceso de selección para el cargo de Analista Comercial — Agosto 2026» ✅ |
| **B · M-5** | Candidato nuevo `55.555.555-5` | Apertura «Josué Brito, de Yokono, te ha invitado a participar en un proceso de selección para el cargo de Analista Comercial — Agosto 2026» ✅ |
| **C · Respaldos** | Cargo o empresa ausentes | ⚠️ **No se marca en verde.** No es reproducible por interfaz |
| **D · No regresión** | Los dos candidatos en el proceso, botón de M-5 | ✅ Abre `trabajador.html` |

**El cargo con guion y fecha se lee bien en los dos.** No es un detalle menor: «Analista
Comercial — Agosto 2026» lleva una raya y una fecha dentro de un `<strong>`, y era el caso donde
un escapado mal hecho se habría notado.

### Criterio de cierre

| Requisito | Estado |
|-----------|--------|
| Código desplegado | ✅ v14, `verify_jwt: true` |
| Prueba A | — No aplica, el pedido la excluye |
| Camino feliz | ✅ Bloques A y B por bandeja de entrada |
| Respaldos | ⚠️ Probados sobre el fuente real; **no reproducibles por interfaz**, ver abajo |
| No regresión | ✅ Bloque D, y una sola línea cambia por correo medido contra `origin/main` |
| Respaldo regenerado | ✅ v14, `MANIFEST.md` actualizado |
| Documentación | ✅ `CAMBIOS.md` y `TECNICO.md` §7 |
| PR abierto, sin fusionar | ✅ PR #10 |

**El asunto en pretérito de M-5 no se ha visto en una bandeja de entrada.** Se desplegó después de
que el dueño corriera A y B, así que lo verificado es el asunto en presente. El cambio es de una
línea, no toca el cuerpo y se comprobó sobre el fuente real, pero conviene que conste: lo que pasó
por bandeja fue la v13.

**Sobre el bloque C.** El pedido pedía comprobar al menos el caso de cargo ausente y decirlo si no
se podía provocar desde la interfaz. **No se puede:** `cargo` es obligatorio en el formulario de
`crear-proceso` y `empresa` lo es en el de `crear-reclutador`, así que por producto no hay forma de
llegar a un proceso sin cargo ni a un reclutador sin empresa. Lo que se probó son las cinco
combinaciones sobre el fuente real, que es la única vía que queda sin `execute_sql`. **Se dice en
vez de darlo por bueno.**

Ni migración ni HTML: el cambio es solo de la función.

---

## M-1 · El contacto frío no decía de dónde había salido el correo

🔵 Presentación · UX · Esfuerzo S · **Estado: ✅ CERRADO** (13/08/2026) · PR #11 fusionado

### El problema

M-1 es **el único contacto frío del producto**. Llega a un exjefe que no conoce Huella Laboral, no
pidió nada y no gana nada con responder. El correo se presentaba y aclaraba que el postulante no
vería la respuesta —las dos cosas bien—, pero no decía **cómo se consiguió su dirección**.

Un correo de un remitente desconocido que ya tiene tu correo personal parece una filtración de
datos. Y es el punto exacto donde el embudo pierde gente: justo antes de pedirle el RUT.

### El cambio

Una frase, dentro del párrafo que ya existía.

| | Texto |
|---|---|
| **Antes** | `<strong>${trabajador.nombre}</strong> te ha solicitado una referencia laboral para usar en su proceso de postulación.` |
| **Ahora** | `…para usar en su proceso de postulación, y <strong>nos entregó tu correo como una de sus jefaturas anteriores</strong>.` |

`crear-solicitud` v28 → **v29**, `verify_jwt: true` sin cambios. **Una línea de diff.** Ni el
asunto, ni el resto del cuerpo, ni el botón, ni el pie, ni los estilos. Sin imágenes ni logo: es
transaccional. M-2 y M-3 salen de la misma función y no se tocaron.

### Verificación

**Sin fase A**, y el pedido lo dice: el texto está a la vista en el código.

`crear-solicitud` es la función más delicada del producto, así que la comprobación no se limitó a
M-1: se generaron **los tres correos** con el código de `origin/main` y con el nuevo, sobre el
fuente real transpilado, y se compararon línea a línea.

| Correo | Destinatario | Asunto | Líneas del cuerpo | Líneas que cambian |
|--------|--------------|--------|-------------------|--------------------|
| **M-1** | evaluador | ✅ igual | 17 → 17 | **1** — la frase pedida |
| **M-2** | trabajador | ✅ igual | 17 → 17 | **0** |
| **M-3** | `contacto@huellalaboral.cl` | ✅ igual | 13 → 13 | **0** |

Y el enlace de M-1: `https://huellalaboral.cl/evaluar.html?token=…` con el token del evaluador,
intacto.

### Dos fallos del arnés, y por qué se cuentan

El arnés dio **cero correos** en la primera pasada y no se enteró: comparó 0 contra 0 y siguió.
Es la misma lección que ya está escrita en la cadena de validación —*una comprobación que no
aborta no es una comprobación*— y se repitió. Se corrigió con un `throw` si no sale ningún correo,
y otro si cambia el número entre las dos versiones.

Después dio **dos** correos y el resumen dijo «los tres». M-3 solo se envía si el trabajador sube
documentos, y la petición de prueba iba sin ellos. Es un acierto de la función, no un fallo, pero
el mensaje era falso: **una frase de resumen escrita a mano puede mentir aunque los datos estén
bien**. Se corrigió comprobando contra una lista explícita de los tres esperados.

Los dos fallos eran del arnés, no del código, y ninguno habría cambiado el resultado final. Se
anotan porque el patrón —dar por bueno un verde que no se ganó— ya costó una falsa alarma antes.

### Criterio de cierre

| Requisito | Estado |
|-----------|--------|
| Código desplegado | ✅ v29, `verify_jwt: true` |
| Prueba A | — No aplica, el pedido la excluye |
| Camino feliz | ⏳ **Pendiente del dueño**: solicitud desde `trabajador.html` con evaluador con alias |
| No regresión | ✅ M-2 y M-3 sin una línea de diferencia; el botón de M-1 conserva su token |
| Respaldo regenerado | ✅ v29, `MANIFEST.md` actualizado |
| Documentación | ✅ `CAMBIOS.md` y `TECNICO.md` §7 |
| PR abierto, sin fusionar | ✅ |

**H-06 y H-21 siguen abiertos en esta función y no se tocaron**, como pedía el pedido. Conviene
recordar por qué importa aquí: con H-06, si Resend rechaza el envío de M-1 la función responde
`success: true` igual, así que la verificación por bandeja de entrada **es** la comprobación —no
hay otra señal.

Ni migración ni HTML: el cambio es solo de la función.

---

## M-2 · Cambio hecho a mano en producción, importado al repo después

🔵 Presentación · UX · Esfuerzo XS · **Estado: ✅ EN PRODUCCIÓN, importado al repo** (13/08/2026)

### Lo primero, porque es lo que no se puede perder de vista

**Este cambio no salió del repositorio: entró en él.** El dueño editó `crear-solicitud` en el
editor del panel de Supabase y desplegó desde ahí. Durante un rato, **producción fue la única
copia de ese texto**: no existía en ninguna rama, en ningún PR ni en el respaldo.

El dueño avisó antes de que se descubriera en una comparación, que es lo que evitó el daño real.
Si no lo hubiera hecho, el siguiente despliegue desde el repo —el de cualquier hallazgo que toque
esta función— habría **pisado el cambio sin que nadie se enterara**, porque el fuente del repo era
la v29 y se habría enviado tal cual.

### El cambio

Dos líneas de M-2, la confirmación al trabajador. Ni el asunto, ni M-1, ni M-3, ni lógica.

| | Antes (repo, v29) | Ahora (producción, v30) |
|---|---|---|
| Frase sobre el botón | «Puedes hacer seguimiento a tu solicitud **de evaluación** en el siguiente link:» | «Puedes hacer seguimiento a tu solicitud en el siguiente link:» |
| Texto del botón | «Ver mi evaluación» | «Ver el estado de mi solicitud» |

### La decisión

**`estado.html` es seguimiento, no una carta de presentación.** Decisión de producto del dueño,
tomada el 13/08. «Ver mi evaluación» prometía un resultado que muchas veces todavía no existe —el
trabajador entra recién enviada la solicitud y no hay nada que ver—, y «solicitud de evaluación»
tampoco era exacto: lo que el trabajador solicita son **referencias**.

### Cómo se importó, y con qué se comprobó

No se dio por buena la descripción del cambio: se leyó la **v30 de producción** con
`get_edge_function` y se aplicaron sobre el repo las dos líneas que efectivamente diferían.

| Comprobación | Resultado |
|--------------|-----------|
| Versión y `ezbr_sha256` de producción | v30 · `9d4f76e88eeff58e…` |
| **El tamaño cuadra con la aritmética de los dos cambios** | Quitar « de evaluación» son −15 bytes; el botón, +11. El archivo pasó de 17.626 a **17.622**, exactamente −4 |
| Los tres correos, regenerados y comparados contra `origin/main` | M-2 cambia **2** líneas; M-1 y M-3, **0** |
| Los enlaces de los botones | `evaluar.html?token=…` y `estado.html?token=…` intactos |
| Bandeja de entrada | ✅ Comprobado por el dueño: solicitud sin documentos con `88.888.888-8`, 200, correo con las dos frases nuevas y el resto idéntico |

La fila del tamaño es la que hace trabajo de verdad: **un tercer cambio inadvertido habría
descuadrado la cuenta.** Sin ella, la importación sería confiar en que la descripción era completa.

### Lo que esto deja abierto

**Un cambio en el panel no deja rastro en el repositorio, y el repositorio no se entera.** No hay
nada que lo impida ni que lo detecte solo: el aviso del dueño fue el único mecanismo. Mientras el
punto de retorno siga siendo `backup/edge-functions/`, la única defensa es comparar versión y
`ezbr_sha256` de las 19 contra el `MANIFEST` **antes de cualquier despliegue** — que es lo que ya
se hace, y lo que habría detectado este caso en la siguiente iteración.

Queda anotado como **UX-25** en la tabla de hallazgos nuevos, aunque no es de interfaz: es de
proceso.

### Criterio de cierre

| Requisito | Estado |
|-----------|--------|
| Código en producción | ✅ v30, `verify_jwt: true` |
| Repo coincide con producción | ✅ Reconstruido desde la v30 y comprobado por tamaño |
| Camino feliz | ✅ Bandeja de entrada, por el dueño, con `88.888.888-8` |
| No regresión | ✅ M-1 y M-3 sin una línea de diferencia; los dos enlaces en pie |
| Respaldo regenerado | ✅ v30, `MANIFEST.md` actualizado con la versión y el hash reales |
| Documentación | ✅ `CAMBIOS.md` y `TECNICO.md` §7 |
| PR abierto, sin fusionar | ✅ |

**No se redesplegó nada**, y es importante: desplegar desde el repo antes de importar habría
pisado el cambio del dueño. El orden fue leer producción primero, escribir el repo después.

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
| UX-22 | Producto, no una función concreta | **No existe forma de quitar un candidato de un proceso.** Ni por interfaz ni por edge function: `gestionar-proceso` solo borra filas de `candidatos_proceso` como parte de `eliminar` el proceso entero. Se anotó primero como «N-2» | H-10 | Abierto, sin pedido |
| UX-25 | Proceso, no código | **Un cambio hecho en el editor del panel de Supabase no deja rastro en el repositorio, y nada lo detecta solo.** El 13/08 producción tuvo durante un rato una versión de `crear-solicitud` que no existía en ninguna rama. El siguiente despliegue desde el repo la habría pisado en silencio. Lo único que lo evitó fue que el dueño avisara | Cambio manual de M-2 | Abierto, sin pedido |
| N-3 | `dashboard.html`, las tres tarjetas de la ficha | **Las tarjetas están diseñadas para un número grande** («3», «5 años») y desde la cadena de validación reciben frases. «No válido — ‹motivo›» desborda, y el motivo lo escribe el validador **sin límite de largo**. La causal muestra un guion con la insignia debajo. El dato es correcto; el formato no | Fase C de la cadena de validación | Abierto, sin pedido |

**Por qué N-1 no se arregló en H-07:** es una edge function, y el pedido de H-07 acotaba el
alcance a `dashboard.html` y `admin.html`. Se deja para decisión del dueño.

**UX-22 es funcional antes que técnico**, y **no** tiene que ver con limpiar datos de prueba —eso
se hace por SQL—. El problema real: un reclutador que agrega un candidato por error no tiene forma
de deshacerlo salvo borrar el proceso completo, lo que se lleva por delante a todos los demás
candidatos. Cualquier arreglo tiene que decidir antes qué significa "quitar":
borrar la fila, o marcarla como retirada conservando la trazabilidad del consentimiento
(`FUNCIONAL.md` §6.3). Es decisión de producto, no de implementación.

---

## Registro de reversiones

Ninguna hasta la fecha.

| Fecha | Hallazgo | Motivo | Acción |
|-------|----------|--------|--------|
| — | — | — | — |
