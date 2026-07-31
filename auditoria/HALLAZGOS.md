# Huella Laboral — Informe consolidado de auditoría

**Fecha:** 31 de julio de 2026
**Alcance:** 12 archivos HTML, 19 edge functions, esquema `public`, Storage, configuración de Auth y DNS del dominio de envío.
**Naturaleza:** diagnóstico de solo lectura. **No se modificó nada del producto.** Todo lo escrito vive en `auditoria/`, en la rama `auditoria`.

---

## 1. Resumen ejecutivo

Huella Laboral está bien construido en varias capas que suelen fallar en proyectos de este tamaño: la autenticación de correo está correctamente montada, RLS cierra por defecto sobre las tablas sensibles, los buckets de Storage son privados, los secretos se leen todos por variable de entorno y no hay una sola credencial en los 122 commits del repositorio. El manejo de errores del frontend es más sólido de lo habitual en código sin framework.

El problema está concentrado en un punto y es sistemático: **de las 19 edge functions, todas operan con `service_role`, que salta el RLS — y seis no comprueban quién las llama o qué recurso piden.** Como el RLS no aplica dentro de una edge function, lo que esas seis no filtran no lo filtra nadie. Ahí viven los siete hallazgos críticos.

El más directo es **H-01**: `crear-reclutador` no lee `x-user-token` en absoluto. Con la anon key —publicada en 8 HTML, como corresponde a su diseño— cualquiera crea una cuenta de reclutador a su propio correo y entra al panel. Desde ahí quedan a mano los procesos y candidatos de todas las empresas (H-04), su borrado (H-05) y la consulta libre por RUT (H-08).

Los otros dos que conviene mirar juntos son **H-02** y **H-03**: `obtener-validacion` y `validar-documentos` usan el `trabajador_id` como si fuera una credencial, y ese identificador se lo devuelve `crear-solicitud` a cualquier llamante anónimo. Uno entrega URLs firmadas a certificados de cotizaciones y finiquitos; el otro permite falsificar el sello de validación documental, que es el único eslabón de la cadena de confianza en el que hoy interviene un humano de Huella Laboral.

**Busqué evidencia de explotación.** Los tres vectores que dejan rastro en la base salen limpios: no hay cuentas inesperadas, no hay validaciones anómalas, no hay solicitudes que no cuadren. H-02 es de solo lectura y no deja ningún rastro, así que **no puedo descartarlo**; es una zona ciega, no un resultado negativo. Atenúa el riesgo que el sistema tenga hoy 2 trabajadores y 4 documentos: aunque se hubiera explotado por completo, el universo afectado son 2 personas.

Y hay una fecha que reordena las prioridades: **la Ley 21.719 entra en vigencia el 1 de diciembre de 2026**, dentro de cuatro meses. `privacidad.html` cita la 19.628 y no la menciona.

**Momento favorable.** Con 2 trabajadores, 5 procesos y 4 documentos, cerrar esto ahora cuesta días y afecta a poquísimas personas. Los cinco hallazgos críticos de tipo autorización se corrigen replicando el bloque de 15 líneas que **ya existe** en `listar-usuarios`. La corrección no requiere rediseñar nada.

---

## 2. Cuadro de hallazgos

**34 hallazgos: 7 críticos, 5 altos, 12 medios, 10 bajos.**

| ID | Título | Sev. | Amenaza | Esf. |
|----|--------|------|---------|:----:|
| **H-01** | `crear-reclutador` no comprueba absolutamente nada | 🔴 Crítica | T-4 | S |
| **H-02** | `obtener-validacion` sin authn: expone documentos de identidad | 🔴 Crítica | T-3 | M |
| **H-03** | `validar-documentos` sin authn: falsificación del sello | 🔴 Crítica | T-1 | M |
| **H-04** | `obtener-proceso`: IDOR sobre procesos ajenos | 🔴 Crítica | T-3 | S |
| **H-05** | `gestionar-proceso`: borrado de procesos ajenos | 🔴 Crítica | T-3 | S |
| **H-06** | `crear-solicitud`: caída total del correo, silenciosa | 🔴 Crítica | T-6 | M |
| **H-07** | XSS almacenado en el dashboard → robo de `hl_token` | 🔴 Crítica | T-7 | S |
| **H-08** | Consulta libre por RUT sin base de licitud | 🟠 Alta | T-3 | M |
| **H-09** | `guardar-evaluacion` no comprueba la expiración | 🟠 Alta | T-1 | S |
| **H-10** | `agregar-candidato` / `obtener-stats` sin comprobar propiedad | 🟠 Alta | T-3, T-6 | S |
| **H-11** | `autenticar` sin rate limiting | 🟠 Alta | — | M |
| **H-12** | `token_consulta` no expira ni se revoca | 🟠 Alta | T-2 | M |
| **H-13** | `anon` con todos los privilegios sobre las 8 tablas | 🟡 Media | T-5 | S |
| **H-14** | `auth-test`: función huérfana en producción | 🟡 Media | — | S |
| **H-15** | Sin cabeceras de seguridad HTTP | 🟡 Media | T-7 | S |
| **H-16** | La sesión caduca a la hora sin renovación | 🟡 Media | — | M |
| **H-19** | "Completado" se calcula mal | 🟡 Media | — | S |
| **H-20** | Los rebotes de correo son invisibles | 🟡 Media | T-6 | M |
| **H-21** | `crear-solicitud` no es idempotente y acumula | 🟡 Media | — | M |
| **H-22** | `razon_invalido` se escribe y nunca se lee | 🟡 Media | — | S |
| **H-23** | Sin estado de documento rechazado ni forma de deshacer | 🟡 Media | — | M |
| **H-28** | `noreply@` sin buzón de vuelta ni `reply_to` | 🟡 Media | — | S |
| **H-29** | Las invitaciones aterrizan en un formulario vacío | 🟡 Media | — | M |
| **H-30** | Sin recordatorios al evaluador | 🟡 Media | — | M |
| **H-17** | Protección de contraseñas filtradas desactivada | 🟢 Baja | — | S |
| **H-18** | `update_updated_at_column` con `search_path` mutable | 🟢 Baja | — | S |
| **H-24** | Procesos que no se cierran por un invitado que no responde | 🟢 Baja | — | S |
| **H-25** | Default de `procesos.estado` no coincide con el código | 🟢 Baja | — | S |
| **H-26** | Sin límite de longitud en los comentarios | 🟢 Baja | T-7 | S |
| **H-27** | Cierre de procesos O(n²) en la petición del evaluador | 🟢 Baja | — | M |
| **H-31** | El enlace caducado no ofrece salida | 🟢 Baja | — | M |
| **H-32** | Correo sin señales anti-phishing ni expectativa de esfuerzo | 🟢 Baja | — | S |
| **H-33** | Sin `text` plano ni `List-Unsubscribe` | 🟢 Baja | T-6 | S |
| **H-34** | Formularios largos sin guardado parcial | 🟢 Baja | — | M |

Detalle completo de cada uno en `FASE-2-SEGURIDAD.md`, `FASE-3-ERRORES.md` y `FASE-4-USABILIDAD.md`.

---

## 3. Lo que está bien

No todo es hallazgo, y conviene no rehacer lo que ya funciona.

| Área | Estado |
|------|--------|
| **Autenticación de correo** | SPF, DKIM y DMARC verificados por DNS. `p=quarantine`, doble alineación, subdominio dedicado. Mejor que la media |
| **RLS** | Las 5 tablas sensibles cierran por defecto. Las 3 con políticas las tienen bien escritas, contra `auth.uid()` |
| **Storage** | Ambos buckets privados, con límite de tamaño y MIME acotado. URLs firmadas de 1 h |
| **Secretos** | Los 19 archivos usan `Deno.env.get()`. Cero literales. Cero `service_role` en 122 commits |
| **Funciones de admin** | `listar-usuarios`, `gestionar-usuario` y `obtener-stats` sí revalidan contra `ADMIN_EMAIL`. El `localStorage.rol` no es explotable |
| **Tokens de evaluación** | `crypto.randomUUID()`, un solo uso, expiración. Correctos |
| **Redirect URLs de Auth** | Literal fijo, sin comodines |
| **Consentimiento** | Existe y es obligatorio para trabajador y evaluador |
| **Confidencialidad frente al evaluado** | La evaluación no es visible para el postulante, y el correo lo dice. Es el mejor control anti-coacción del diseño |
| **Opción de rechazo** | El evaluador puede declinar sin puntuar. Evita evaluaciones tibias de compromiso |
| **Manejo de errores en frontend** | 18 de 22 `fetch` comprueban `.ok`; sin `catch` vacíos |
| **Doble clic** | Botones deshabilitados al enviar |
| **Consistencia visual** | Uniforme en los 12 HTML; `viewport` en todos |

---

## 4. Backlog priorizado

### Horizonte 1 — Urgente (días)

Todo lo crítico. El orden importa: H-01 primero, porque es la puerta de entrada que habilita a las demás.

| # | Acción | Hallazgos | Esf. |
|---|--------|-----------|:----:|
| 1 | **Añadir validación de admin a `crear-reclutador`** — copiar el bloque de `listar-usuarios` | H-01 | S |
| 2 | **Filtrar por dueño en `obtener-proceso` y `gestionar-proceso`** — añadir `.eq('usuario_id', authUser.id)` | H-04, H-05 | S |
| 3 | **Escapar `comentarios` y `nombre_evaluador`** en `dashboard.html` — usar `textContent`, como ya hace `evaluar.html` | H-07 | S |
| 4 | **Comprobar `response.ok`** en los 7 envíos de Resend | H-06 | S |
| 5 | **Token propio para el flujo de validación** — `token_validacion` en `trabajadores`, o exigir admin en las dos funciones | H-02, H-03 | M |
| 6 | **Rate limiting en `crear-solicitud` y `autenticar`** | H-06, H-11 | M |
| 7 | **Propiedad del proceso en `agregar-candidato` y `obtener-stats`**; tomar `reclutador_nombre` de la base | H-10 | S |
| 8 | **Comprobar expiración en `guardar-evaluacion`** | H-09 | S |
| 9 | **`vercel.json` con CSP, `Referrer-Policy`, `X-Frame-Options` y HSTS** | H-15 | S |
| 10 | **Eliminar `auth-test`** | H-14 | S |
| 11 | **Activar protección de contraseñas filtradas** — un clic | H-17 | S |
| 12 | **Revisar logs de Vercel** buscando accesos a `validar.html` desde IPs ajenas | — | S |

Los puntos 1 a 4 y 7 a 11 son todos de esfuerzo S y cierran cinco de los siete críticos. **Es una sesión de trabajo.**

**Sobre rotación de claves:** no hace falta. No hay ningún secreto expuesto — la anon key es pública por diseño y no se filtró nada más en 122 commits.

### Horizonte 2 — Estructural (semanas)

| # | Acción | Hallazgos | Esf. |
|---|--------|-----------|:----:|
| 13 | **Versionar el backend.** `supabase functions download` + `db pull` bajo control de versiones. Hoy las 19 funciones solo existen en el dashboard: sin historial, sin revisión, sin vuelta atrás. `crear-solicitud` va por la v26 y no hay forma de ver qué cambió | — | M |
| 14 | **Extraer el JS común a un módulo compartido.** URL y anon key están copiadas 22 veces; la lógica de cabeceras, otras tantas | H-16 y raíz de H-09 | M |
| 15 | **Manejo de sesión expirada**: renovar con `refresh_token` o detectar el 401 y redirigir con mensaje | H-16 | M |
| 16 | **Webhooks de Resend** (`bounced`, `complained`) y estado visible en `estado.html` | H-20 | M |
| 17 | **`REVOKE` de privilegios innecesarios a `anon`** | H-13 | S |
| 18 | **Caducidad y revocación de `token_consulta`** | H-12 | M |
| 19 | **Idempotencia en `crear-solicitud`**: deduplicar por email y envolver en RPC transaccional | H-21 | M |
| 20 | **Corregir el cálculo de "Completado"** | H-19 | S |
| 21 | **Exponer `razon_invalido`** y añadir estado de documento rechazado | H-22, H-23 | M |
| 22 | **CI mínimo**: escaneo de secretos y linter en cada push | — | M |
| 23 | **Entorno de staging** separado de producción | — | L |
| 24 | **Escribir `validador_id`** en `validaciones_documentos` | H-03 | S |

### Horizonte 2-bis — Cumplimiento, con fecha límite: 1 de diciembre de 2026

Cuatro meses. No es Horizonte 3.

| # | Acción | Esf. |
|---|--------|:----:|
| 25 | **Consentimiento granular y revocable** para la consulta del perfil por reclutadores (opción B de Fase 2 §8.2) | M |
| 26 | **Registro de accesos** — quién consultó qué ficha y cuándo, visible para el trabajador (opción C). Obligación futura y función de producto a la vez | S |
| 27 | **Actualizar `privacidad.html`** a la Ley 21.719 | S |
| 28 | **Política de retención** con plazos explícitos | S |
| 29 | **Mecanismo de derechos ARCO** — acceso, rectificación, cancelación, oposición y portabilidad. Hoy solo hay un correo en el pie de un mensaje | M |
| 30 | **Procedimiento de notificación de brechas en 72 h.** Sin logs de más de 24 h, hoy sería imposible determinar el alcance de una | M |
| 31 | **Registro de actividades de tratamiento** y DPA con Supabase y Resend | M |

### Horizonte 3 — Producto

| # | Acción | Hallazgos | Esf. |
|---|--------|-----------|:----:|
| 32 | **Recordatorios al evaluador** a los 3 y 10 días. El mayor punto de fuga del embudo, sobre infraestructura ya montada | H-30 | M |
| 33 | **`reply_to` en los 7 correos** — una línea cada uno, sobre un buzón que ya existe | H-28 | S |
| 34 | **Mejorar M-1**: expectativa de esfuerzo, señales anti-phishing, enlace a privacidad, preheader | H-32 | S |
| 35 | **Token de invitación en M-4/M-5** con precarga de RUT y correo | H-29 | M |
| 36 | **Cruzar el evaluador con el certificado de cotizaciones** (C-5 de Fase 1). El único control de verificación que no depende de la buena fe de nadie, sobre un documento que el sistema ya pide y ya valida | — | M |
| 37 | **Graduar el sello de verificación** en vez del booleano actual (C-4) | — | M |
| 38 | **Registrar IP y user-agent** en `evaluaciones` (C-1) — señal barata contra el autoevaluado y el cómplice | — | S |
| 39 | **Ampliar la lista de dominios gratuitos** (C-6) — hoy pasan `proton.me`, `zoho.com`, `yandex.com` y otros | — | S |
| 40 | **Salida para el enlace caducado** y guardado parcial de formularios | H-31, H-34 | M |
| 41 | **`text` plano y `List-Unsubscribe`** | H-33 | S |
| 42 | **Resto de higiene**: H-18, H-24, H-25, H-26, H-27 | varios | S |

---

## 5. Sobre la palabra "verificada"

Registrado como decisión consciente de MVP, no como hallazgo de seguridad, según tu indicación. Pero de esto depende la propuesta de valor, así que queda escrito sin ambigüedad.

Hoy, el sello ✓ VERIFICADA significa exactamente esto:

> *La respuesta llegó a través de un enlace privado enviado a una dirección de correo cuyo dominio no está en una lista de seis proveedores gratuitos.*

Eso es verdad y es defendible. Filtra la falsificación perezosa —el `sujefe@gmail.com`— a coste cero, que para un MVP es una decisión sensata.

Lo que **no** significa: que se haya verificado la identidad de quien evalúa, ni que pertenezca a la empresa que declara. Un dominio propio cuesta unos pocos dólares y pasa el filtro. La lista de seis proveedores deja fuera a `proton.me`, `zoho.com`, `yandex.com`, `gmx.com` y `mail.com`, que pasan como corporativos.

El camino de refuerzo más prometedor no es criptográfico ni burocrático: **es el certificado de cotizaciones que el sistema ya pide, ya sube a Storage y ya hace validar por un humano.** Ese documento dice con quién trabajó realmente la persona. Cruzar el empleador declarado contra ese historial (backlog #36) es la única verificación disponible que no depende de la buena fe de nadie, y la infraestructura está montada entera.

Mientras tanto, el control más fuerte del diseño no es el test de dominio: es que **el evaluado no ve el resultado**. Elimina la coacción posterior, que es el vector más común en referencias laborales. Conviene no perderlo en ningún rediseño.

---

## 6. Zonas no auditadas

Lo que quedó fuera de alcance, y por qué. Ninguna es un hueco silencioso.

| Zona | Motivo | Cómo cerrarla |
|------|--------|---------------|
| **Verificación empírica de RLS** | El proxy del entorno deniega `supabase.co`. Script escrito y listo | `bash auditoria/scripts/verificar-rls.sh` desde una máquina con salida a internet |
| **Valor de `ADMIN_EMAIL`** | Los secretos de edge functions no son leíbles por MCP. Verificado indirectamente: existe exactamente 1 cuenta Auth sin fila en `usuarios`, con acceso reciente | Dashboard → Edge Functions → Secrets. Comprobar minúsculas y sin espacios |
| **Explotación de H-02** | Es de solo lectura: no deja rastro en la base. Los logs del MCP son de 24 h y vuelven vacíos | Logs de Vercel y analytics de Supabase, que sí guardan histórico |
| **Contenido de `evaluaciones.comentarios`** | Es dato personal (D-5): no lo leí | Buscar `<script`, `onerror=` y `javascript:` en las 2 filas |
| **Plan y cuota de Resend** | No accesible por MCP | Panel de Resend. Verificar también si la API key es de solo envío |
| **Pruebas de entrega de correo** | Exigiría enviar correos reales desde producción (Regla Cero) | Enviar a Gmail, Outlook y Yahoo; anotar dónde cae cada uno |
| **Versiones anteriores de las funciones** | El MCP solo entrega la vigente | Se resuelve con el backlog #13 |
| **Accesibilidad y revisión visual a 375px** | No auditadas en profundidad | Revisión manual |

---

## 7. Correcciones a `AUDITORIA.md`

`AUDITORIA.md` no se modificó (Regla Cero). Las correcciones quedan aquí y en `FASE-0-MAPA.md` §0.

| # | Decía | Es |
|---|-------|-----|
| C-1 | 18 edge functions | **19**. Faltaba `auth-test`, huérfana. El método original solo veía las invocadas desde el frontend |
| C-2 | `evaluar.html:657` llama a `obtener-candidato` | Llama a `obtener-evaluacion`. `obtener-candidato` solo se invoca desde `dashboard.html` |
| C-3 | 122 commits | El clon llegó shallow con 49. Corregido con `git fetch --unshallow` |
| C-4 | §5.7: el rol en `localStorage` podría ser crítico | **No lo es.** Las funciones de admin revalidan. La escalada real es H-01 |
| C-5 | §7.1 anticipaba DMARC posiblemente en `p=none` | Está en `p=quarantine`, con doble alineación |

---

## 8. Nota de método

Un apunte que afecta a cómo leer este informe.

La primera versión de `verificar-rls.sh` **dio un aprobado completo sin haber enviado una sola petición**. El entorno bloquea `supabase.co`; `curl` devolvía `000`, y mi lógica trataba todo código distinto de `200` como "acceso bloqueado". El script imprimió "RLS aguanta" para las ocho tablas. Lo detecté porque `000` no es un código HTTP.

Está corregido —ahora hay un preflight que aborta con "NO se ha probado nada"— y lo dejo escrito porque el modo de fallo es más instructivo que el fallo: un verificador que confunde *sin red* con *acceso denegado* produce el peor informe posible, tranquilizador y falso.

Por eso, en este informe, lo verificado y lo no verificado están separados de forma explícita en cada sección, y la respuesta a "¿hubo explotación?" distingue entre *no hay indicios* y *no puedo saberlo*. Son cosas distintas y la diferencia importa.
