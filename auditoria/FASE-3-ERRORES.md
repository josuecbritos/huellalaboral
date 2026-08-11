# Fase 3 — Errores y robustez

---

## 1. Estático

### 1.1 Manejo de errores en el frontend: mejor de lo esperado

| Archivo | `fetch` | Comprueba `.ok` | `catch` |
|---------|:-------:|:---------------:|:-------:|
| `dashboard.html` | 10 | 7 | 9 |
| `admin.html` | 4 | 3 | 3 |
| `evaluar.html` | 2 | 2 | 2 |
| `validar.html` | 2 | 2 | 2 |
| `trabajador.html` | 1 | 1 | 1 |
| `login.html` | 1 | 1 | 1 |
| `estado.html` | 1 | 1 | 1 |
| `crear-password.html` | 1 | 1 | 1 |

Para un proyecto sin framework ni linter, la cobertura es alta: 18 de 22 llamadas comprueban el resultado y todas están dentro de un `try/catch`. No hay `catch` vacíos. Solo 1 `console.log` en producción. **Esto no es el problema del sistema.**

El problema está en el backend, y es el inverso: **7 de 7 envíos de correo no comprueban nada** (H-06).

### 1.2 Duplicación de JavaScript

1.569 líneas de JS únicas repartidas en 9 archivos, sin ningún módulo compartido:

| Archivo | Líneas JS |
|---------|----------:|
| `dashboard.html` | 496 |
| `trabajador.html` | 339 |
| `evaluar.html` | 200 |
| `admin.html` | 173 |
| `validar.html` | 131 |
| `crear-password.html` | 86 |
| `login.html` | 72 |
| `estado.html` | 55 |
| `index.html` | 17 |

La URL de Supabase y la anon key están **copiadas literalmente 22 veces** en 8 archivos.

**Consecuencia concreta, no teórica.** Los 22 bloques de cabeceras son casi idénticos:

```js
headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'x-user-token': localStorage.getItem('hl_token') }
```

Cuando haya que corregir H-16 —detectar el 401 y redirigir al login— hay que tocar 22 sitios. Se corregirán 20 y quedarán 2 con el bug. Ese es el coste real de la duplicación aquí, y es exactamente el mecanismo por el que H-09 existe: `obtener-evaluacion` comprueba la expiración y `guardar-evaluacion`, escrita aparte, no. La misma lógica, en dos sitios, divergida.

**Contraejemplo útil:** `evaluar.html` usa `textContent` en sus 20 inserciones y no tiene un solo `innerHTML`; `dashboard.html` tiene 15 `innerHTML`, dos de ellos explotables (H-07). La práctica correcta ya existe en el proyecto — simplemente no se propagó, porque no hay nada que la propague.

---

## 2. Caminos borde

| Caso | Estado | Detalle |
|------|:------:|---------|
| Doble clic en enviar | ✅ | `evaluar.html:854` y `trabajador.html:1377` hacen `btn.disabled = true` antes del envío. Bien resuelto |
| Doble envío desde la red (reintento, doble pestaña) | ⚠️ | El guardia es solo de interfaz. `guardar-evaluacion` comprueba `completado`, así que la segunda falla — correcto por casualidad más que por diseño |
| Token ya usado | ✅ | `obtener-evaluacion` devuelve "Esta evaluación ya fue completada" |
| Token expirado | ⚠️ | Mensaje claro al *leer*; **al escribir no se comprueba** (H-09) |
| Token manipulado | ✅ | 404 "Token inválido o expirado" |
| Sesión caída a mitad del flujo | ❌ | **H-16.** El JWT expira a la hora y no se renueva. Las llamadas empiezan a dar 401 y ninguna pantalla lo interpreta: el usuario ve fallos sin explicación y sin invitación a reconectarse |
| Evaluación duplicada del mismo evaluador | ⚠️ | Bloqueada por token. Pero si el trabajador declara al mismo evaluador dos veces, `crear-solicitud` genera **dos filas y dos tokens** sin deduplicar por email: dos evaluaciones válidas de la misma persona, que además cuentan doble en los promedios |
| Correo válido pero inexistente | ❌ | **Rebota en silencio.** Sin webhooks de Resend, `enviado: true` queda escrito pase lo que pase. El trabajador espera indefinidamente una referencia que nunca va a llegar, sin señal de que algo falló |
| Campos de texto sin límite | ❌ | El `<textarea>` de `evaluar.html:538` no tiene `maxlength`, y `comentarios` es `text` sin restricción. Cruza con H-07 |
| Tildes, ñ, emoji | ✅ | UTF-8 correcto en toda la cadena |
| Operaciones multipaso sin transacción | ❌ | Ver §2.1 |
| Idempotencia | ⚠️ | `crear-solicitud` **acumula**: cada reenvío añade empleadores nuevos sin eliminar los anteriores (comentario explícito en el código). Reenviar el formulario duplica invitaciones y correos |

### 2.1 `crear-solicitud` no es transaccional

Hace, en secuencia y sin transacción: upsert de trabajador → vinculación de invitaciones → N inserts de empleadores → 2 subidas a Storage → 2 upserts de documentos → hasta N+2 correos.

Cualquier fallo a mitad deja el sistema a medias, y el orden empeora las consecuencias:

- Si falla la subida del certificado (paso 4) tras haber insertado los empleadores (paso 3), se lanza `throw` y **la función responde 500 — pero los empleadores ya están insertados**. El trabajador ve un error, reintenta, y se crean otra vez: filas duplicadas y correos duplicados.
- Los correos van **después** de todas las escrituras, lo cual es el orden correcto. Pero como no se comprueba su resultado (H-06), un fallo de envío deja la base diciendo `enviado: true` sobre un correo que nunca salió.

`guardar-evaluacion` tiene el mismo patrón, más benigno: si falla el cierre automático del proceso, el `catch` lo registra y sigue — decisión razonable, porque la evaluación ya está guardada y es lo que importa.

### 2.2 El cierre automático de procesos es O(n²) y frágil

En `guardar-evaluacion`, tras insertar, recorre los procesos del trabajador y para cada uno recorre todos sus candidatos, y para cada candidato consulta sus empleadores. Con los volúmenes actuales (10 filas en `candidatos_proceso`) da igual. Con cientos de candidatos por proceso son cientos de consultas secuenciales dentro de la petición del evaluador, que es quien espera.

Y hay un caso lógico que conviene mirar:

```js
if (!empleadores?.length || empleadores.some(e => !e.completado)) { todosCompletos = false; break }
```

Un candidato **sin ningún empleador solicitado** cuenta como incompleto, así que basta un candidato invitado que nunca completó su solicitud para que el proceso **no se cierre nunca**. Es conservador —prefiere no cerrar— pero significa que el estado `Finalizado` depende de que todos los invitados respondan, y no hay caducidad que resuelva el caso de que uno no lo haga.

---

## 3. Máquina de estados real

Extraída del esquema y de las funciones, no supuesta.

### 3.1 `trabajadores.estado`

```
'pendiente' ──validar-documentos──▶ 'documentos_validados'
```

Dos estados. Datos reales: 1 y 1.

**Problemas:**
- La transición la dispara una función **sin autenticación** (H-03).
- **No hay vuelta atrás.** Si un documento se marca válido por error, no existe transición inversa ni endpoint para corregirlo.
- No hay estado para "documento rechazado". `validaciones_documentos.valido` puede ser `false` y `razon_invalido` puede rellenarse, pero `trabajadores.estado` solo avanza si `todosValidados`, así que un trabajador con documentos rechazados se queda en `'pendiente'`, indistinguible de quien no subió nada.

### 3.2 `procesos.estado`

```
'Activo' ──gestionar-proceso(finalizar)──▶ 'Finalizado'
        ──guardar-evaluacion (automático)─▶ 'Finalizado'
'Finalizado' ──agregar-candidato──▶ 'Activo'    (reactivación)
```

Datos reales: 2 `Activo`, 3 `Finalizado`. **Coherente en la práctica.**

**Discrepancia latente:** el default de la columna es `'activo'` en minúscula, y todo el código escribe `'Activo'`. Hoy no aparece ninguna fila en minúscula porque `crear-proceso` siempre pasa el valor explícito. Pero cualquier inserción que confíe en el default produce un `'activo'` que **ninguna comparación del código reconoce** — `.eq('estado', 'Finalizado')` y los filtros de la interfaz fallarían en silencio. Es una mina enterrada, no un fallo activo.

### 3.3 Estado del candidato: calculado, no almacenado

`agregar-candidato` deriva el estado en `obtenerDatosCandidato()`:

```js
let estado = 'Invitado'
if (evaluacionesValidas.length > 0) {
  estado = evaluacionesValidas.length === empleadoresCount ? 'Completado' : 'En proceso'
}
```

Donde `empleadoresCount` es `new Set(evaluacionesValidas.map(e => e.email_evaluador)).size` — el número de evaluadores **distintos que ya respondieron**, no el número de evaluadores **solicitados**.

Con esa definición, `evaluacionesValidas.length === empleadoresCount` es cierto siempre que no haya dos evaluaciones del mismo correo. **Es decir: un candidato aparece como "Completado" en cuanto responde su primer evaluador**, aunque falten tres.

Ese cálculo no coincide con el que usa `guardar-evaluacion` para cerrar el proceso, que sí consulta `empleadores_solicitados` y exige que todos estén `completado`. **Dos definiciones distintas de "completado" en el mismo sistema**: la que ve el reclutador en la tarjeta del candidato, y la que decide si el proceso se cierra. La primera es optimista y engaña.

### 3.4 Estados que existen en la base y no se muestran

| Estado | ¿Se muestra? |
|--------|--------------|
| `trabajadores.estado = 'pendiente'` | No aparece en ninguna interfaz |
| `documentos.validado = false` tras rechazo | No se distingue de "sin validar" |
| `validaciones_documentos.razon_invalido` | **Se escribe y no se lee en ningún sitio.** El validador puede explicar por qué rechazó un documento, y nadie ve nunca esa explicación |
| `empleadores_solicitados.fecha_expiracion` vencida | Ni la interfaz ni `obtener-estado` lo muestran: el trabajador no sabe que una invitación caducó |
| `evaluaciones.rechazo` | ✅ Sí se muestra, bien resuelto |

---

# HALLAZGOS DE FASE 3

### [H-19] "Completado" se calcula mal: un candidato figura completo con una sola evaluación
- **Severidad:** Media
- **Ubicación:** edge function `agregar-candidato`, función `obtenerDatosCandidato()`
- **Evidencia:** `empleadoresCount` cuenta evaluadores **que respondieron**, no solicitados, así que la comparación con `evaluacionesValidas.length` es casi siempre verdadera.
- **Impacto:** el reclutador ve "Completado" en candidatos a los que les faltan referencias, y decide sobre información incompleta creyéndola completa. Contradice el criterio de `guardar-evaluacion`, que sí consulta `empleadores_solicitados`.
- **Corrección:** contar contra `empleadores_solicitados` del trabajador, igual que hace `guardar-evaluacion`.
- **Esfuerzo:** S

### [H-20] Los rebotes de correo son invisibles
- **Severidad:** Media
- **Ubicación:** las 3 funciones que envían correo; sin webhooks de Resend
- **Evidencia:** `enviado: true` se escribe en el `INSERT`, antes del envío y sin relación con su resultado.
- **Impacto:** si el correo del evaluador está mal escrito o no existe, nadie lo sabe. El trabajador espera indefinidamente. Es el fallo que más silenciosamente rompe el producto: no hay error, solo ausencia.
- **Corrección:** consumir los webhooks `bounced` / `complained` / `delivered` y reflejar el estado en `estado.html`.
- **Esfuerzo:** M

### [H-21] `crear-solicitud` no es idempotente y acumula
- **Severidad:** Media
- **Ubicación:** edge function `crear-solicitud`
- **Evidencia:** comentario explícito, `// Se agregan los nuevos sin eliminar los anteriores`. Sin deduplicar por `email_evaluador`, sin transacción.
- **Impacto:** reenviar el formulario —por impaciencia o tras un fallo a mitad— duplica empleadores, tokens y correos. El mismo evaluador puede recibir dos invitaciones y emitir dos evaluaciones válidas, que cuentan doble en los promedios.
- **Corrección:** deduplicar por `(trabajador_id, email_evaluador)` con pendiente sin completar; envolver en RPC transaccional.
- **Esfuerzo:** M

### [H-22] `razon_invalido` se escribe y nunca se lee
- **Severidad:** Media
- **Ubicación:** `validaciones_documentos.razon_invalido`
- **Impacto:** cuando un documento se rechaza, el validador escribe el motivo y **el trabajador nunca lo ve**. Se queda con un proceso detenido, sin saber que hay algo que corregir ni qué. Un dato que ya existe y ya se captura resolvería el bloqueo.
- **Corrección:** exponerlo en `obtener-estado` y pintarlo en `estado.html`.
- **Esfuerzo:** S

### [H-23] Sin estado terminal para documento rechazado ni forma de deshacer
- **Severidad:** Media
- **Ubicación:** `trabajadores.estado`, edge function `validar-documentos`
- **Impacto:** un trabajador con documentos rechazados es indistinguible de uno que no subió nada. Y una validación errónea no se puede revertir: no hay transición inversa ni endpoint.
- **Corrección:** añadir `'documentos_rechazados'` y permitir revalidar.
- **Esfuerzo:** M

### [H-24] Procesos que no se cierran nunca por un invitado que no responde
- **Severidad:** Baja
- **Ubicación:** edge function `guardar-evaluacion`
- **Evidencia:** un candidato sin empleadores solicitados evalúa como incompleto, bloqueando el cierre del proceso entero.
- **Impacto:** basta un invitado que nunca completó su solicitud para que el proceso siga `Activo` para siempre. Sin caducidad que lo resuelva. El reclutador puede cerrarlo a mano, así que la vía de escape existe.
- **Corrección:** excluir del cálculo a los candidatos sin solicitud, o caducar invitaciones.
- **Esfuerzo:** S

### [H-25] `procesos.estado`: el default de la columna no coincide con el código
- **Severidad:** Baja
- **Ubicación:** `procesos.estado default 'activo'` vs. `'Activo'` en el código
- **Impacto:** ninguna fila afectada hoy, porque `crear-proceso` siempre pasa el valor. Cualquier inserción futura que confíe en el default crea un estado que ninguna comparación reconoce, y falla en silencio.
- **Corrección:** alinear el default, o normalizar las comparaciones.
- **Esfuerzo:** S

### [H-26] Sin límite de longitud en los comentarios
- **Severidad:** Baja
- **Ubicación:** `evaluar.html:538`, `evaluaciones.comentarios` (`text`)
- **Impacto:** nada impide enviar megabytes de texto, que luego se pintan enteros en el dashboard. Vector de degradación y superficie extra para H-07.
- **Corrección:** `maxlength` en el textarea y validación en `guardar-evaluacion`.
- **Esfuerzo:** S

### [H-27] Cierre de procesos O(n²) dentro de la petición del evaluador
- **Severidad:** Baja
- **Ubicación:** edge function `guardar-evaluacion`
- **Impacto:** consultas anidadas secuenciales por proceso × candidato × empleador. Irrelevante con 10 filas; con cientos de candidatos, el evaluador espera — y el evaluador es el actor con menos paciencia y más propensión al abandono de todo el sistema.
- **Corrección:** una sola consulta agregada, o mover el cierre a un proceso aparte.
- **Esfuerzo:** M
