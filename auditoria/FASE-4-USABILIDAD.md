# Fase 4 — Usabilidad

Auditada por flujo y actor, con los actores que salieron de Fase 0.

---

## 1. Correos transaccionales (§7.1)

### 1.1 Infraestructura de entregabilidad — verificada por DNS

Consultado directamente contra `8.8.8.8`. Esto no es análisis del código: son los registros reales publicados hoy.

| Registro | Valor | Veredicto |
|----------|-------|-----------|
| **Subdominio dedicado** | `contacto.huellalaboral.cl` | ✅ Correcto. Aísla la reputación de envío del dominio principal |
| **DKIM** | `resend._domainkey.contacto.huellalaboral.cl` → clave RSA publicada y resolviendo | ✅ Publicado y correcto |
| **SPF (envío)** | `send.contacto.huellalaboral.cl` → `v=spf1 include:amazonses.com -all` | ✅ Patrón estándar de Resend, con `-all` |
| **SPF (raíz)** | `huellalaboral.cl` → `v=spf1 include:_spf.google.com -all` | ✅ Correcto y bien separado: la raíz es Google Workspace, el envío transaccional va por el subdominio |
| **DMARC** | `p=quarantine; rua=mailto:contacto@huellalaboral.cl; pct=100` | ✅ Política estricta, en raíz y en subdominio |
| **Alineación** | `From: noreply@contacto.huellalaboral.cl`; DKIM firma `contacto.huellalaboral.cl`; Return-Path bajo `send.contacto.huellalaboral.cl` | ✅ **Alinean ambos**, SPF y DKIM, en modo relajado |
| **MX raíz** | 5 registros (Google Workspace) | ✅ `contacto@huellalaboral.cl` es un buzón real |
| **Límite de 10 lookups SPF** | 1 include por registro | ✅ Sin riesgo |

**Esta parte está bien hecha, y conviene decirlo con claridad**: DMARC en `p=quarantine` con doble alineación es mejor de lo que se encuentra en la mayoría de productos de este tamaño. `AUDITORIA.md` §7.1 anticipaba que la política podría estar en `p=none`; no lo está. No hay hallazgo aquí.

Dos matices menores:

- **La clave DKIM es de 1024 bits** (módulo de 992 bits medido sobre el DER). Es el valor por defecto de Resend y lo aceptan todos los receptores; 2048 es la recomendación actual. Backlog, no hallazgo.
- **`rua` apunta a un buzón humano.** Los informes DMARC son XML agregado: si nadie los procesa, el buzón se llena de adjuntos ilegibles y la señal se pierde. Conviene un servicio de agregación.

### 1.2 El problema real: `noreply@` sin buzón de vuelta

`contacto.huellalaboral.cl` **no tiene registros MX** (verificado). Y ninguno de los siete correos define `reply_to`.

El evaluador es un desconocido al que le llega una petición fría. Su reacción más natural ante la duda —"¿esto es real?", "¿quién eres?"— es **responder al correo**. Esa respuesta no llega a ninguna parte: rebota. Se pierde exactamente la persona que estaba dispuesta a colaborar pero quería confirmar antes. H-28.

### 1.3 Cuota, reintentos y fallos

- **Plan de Resend:** no verificable desde aquí. El plan gratuito son 3.000 correos al mes con **tope de 100 al día**. Con `crear-solicitud` abierto sin autenticación (H-06), ese tope lo agota un tercero en minutos.
- **Qué pasa al chocar contra el tope:** nada visible. Ya está desarrollado en H-06 — se responde `success: true` igual. Es la intersección más peligrosa de toda la auditoría: un fallo de infraestructura invisible sobre el canal del que depende el producto.
- **Reintentos:** no hay.
- **Webhooks de Resend:** no configurados (H-20).
- **Lista de supresión:** Resend la gestiona sola, pero sin webhooks un destinatario suprimido produce silencio, no un estado visible.
- **API key de Resend:** `Deno.env.get('RESEND_API_KEY')` ✅. No pude verificar si es de solo envío o de acceso completo — comprobación tuya en el panel de Resend.
- **`text` además de `html`:** ausente en los 7. Solo-HTML es señal de spam en varios filtros.
- **`List-Unsubscribe`:** ausente. Para correo transaccional puro es discutible, pero M-4 y M-5 (invitaciones no solicitadas) sí lo necesitan.
- **Dominio de los enlaces:** `huellalaboral.cl`, coherente con el remitente `contacto.huellalaboral.cl`. ✅ Sin acortadores ni dominios de tracking.
- **Peso y estructura:** HTML sencillo, sin imágenes, sin CSS que rompa en clientes antiguos. ✅ Se entiende perfectamente con las imágenes bloqueadas, porque no hay ninguna.
- **Plantillas de Supabase Auth:** no se usan en el flujo de alta. `crear-reclutador` genera el `action_link` y arma el correo a mano en Resend, así que no hay textos por defecto en inglés en ese camino. ✅

### 1.4 El correo al evaluador (M-1) — el que decide el producto

Es el correo del que depende todo: llega frío, a alguien que no conoce la marca, cuya primera hipótesis razonable es que es phishing.

**Asunto:** `<nombre> te solicita una referencia laboral`

✅ Lleva el nombre del trabajador al principio, que es lo único que da contexto inmediato. Cabe en móvil. Es un buen asunto.

**Cuerpo, evaluado punto por punto:**

| Criterio | Estado |
|----------|--------|
| Quién escribe, por qué llega, qué se pide, en ese orden | ✅ Los tres primeros párrafos hacen exactamente eso |
| Un solo CTA visible sin scroll | ✅ "Completar Evaluación" |
| "no será visible para el postulante" | ✅ **Lo mejor del correo.** Es la frase que desbloquea la respuesta honesta, y está bien colocada |
| Expectativa de esfuerzo | ⚠️ Dice "El proceso es muy simple", que es vago. "Te toma 3 minutos" reduce el abandono de forma medible |
| Señales anti-phishing | ❌ **Es la carencia grave.** Sin enlace a la política de privacidad, sin explicación de qué es Huella Laboral más allá de una línea, sin mención de quién es el responsable, sin forma de verificar que es legítimo |
| Preheader | ❌ Sin definir: los clientes mostrarán el arranque del HTML |
| Legible con imágenes bloqueadas | ✅ No hay imágenes |
| Móvil | ✅ `max-width: 600px`, diseño de una columna |
| Recordatorios | ❌ **No existen.** Se envía una vez. Si no responde, silencio hasta que expire a los 30 días |

**Sobre el preheader**, conviene ser preciso: el HTML abre con un `<div>` y un `<h1>`, así que el fragmento que se ve en la bandeja será "Solicitud de Referencia Laboral Hola, Somos Huella Laboral…". No es basura ilegible —el caso malo que anticipaba el playbook— pero desperdicia la única línea gratis para reforzar contexto o urgencia.

**El hueco más caro es la ausencia de recordatorios.** Un correo frío que se envía una sola vez tiene una tasa de respuesta que un segundo envío mejora sustancialmente. Hoy, si el evaluador lo abre en mal momento y no vuelve, la referencia se pierde y el trabajador no se entera hasta que caduca. Con la infraestructura de correo ya bien montada, es de las mejoras con mejor relación esfuerzo/impacto del backlog.

### 1.5 Resto de correos

| Correo | Observación |
|--------|-------------|
| M-2 (confirmación al trabajador) | ✅ El mejor del conjunto. Explica, da enlace de seguimiento, advierte de guardarlo, e incluye vía de supresión de datos en el pie. Es el único de los siete que menciona derechos |
| M-3 (aviso al validador) | Interno. Funcional |
| M-4 / M-5 (invitaciones) | ⚠️ Ambos llevan al genérico `trabajador.html` **sin token ni contexto**. La persona llega a un formulario en blanco y tiene que reescribir su RUT, que el sistema ya conoce. Fricción evitable, y punto de abandono. H-29 |
| M-6 / M-7 (crear contraseña) | ✅ Correctos. Dicen que el enlace es de un solo uso y caduca en 24 h |

**Consistencia:** los siete tratan de "tú", tono uniforme, todo en español, mismo pie. ✅ No hay textos del proveedor sin traducir.

### 1.6 Pruebas empíricas — no realizadas

`AUDITORIA.md` §7.1 pide enviar a Gmail, Outlook y Yahoo, y revisar `Authentication-Results`. **No lo hice**: implicaría disparar correos reales desde el sistema en producción, lo que la Regla Cero prohíbe, y además el entorno no tiene salida de red hacia el proyecto.

Con SPF, DKIM y DMARC verificados y alineados, la predicción razonable es `spf=pass`, `dkim=pass`, `dmarc=pass`. Queda pendiente **dónde cae** cada uno —entrada, promociones o spam—, que depende de reputación y contenido, no solo de autenticación. Es una prueba de diez minutos que conviene hacer antes de escalar envíos.

---

## 2. Por actor (§7.2)

### 2.1 Evaluador — prioridad máxima

Llega desde fuera, sin cuenta, sin incentivo, sospechando phishing.

| Pregunta | Respuesta |
|----------|-----------|
| ¿Entiende en 5 segundos qué es esto? | ⚠️ Parcialmente. El asunto y las dos primeras líneas funcionan; falta la señal de legitimidad |
| ¿Cuánta fricción antes de empezar? | ✅ **Muy poca, y está bien resuelto.** Un clic desde el correo, sin registro, con sus datos ya precargados desde `obtener-evaluacion` |
| ¿Sabe qué pasa con lo que escribe? | ✅ **Sí, y es el acierto del diseño.** El correo dice que será visible para reclutadores y no para el postulante. Bloque de consentimiento en el formulario |
| ¿Puede negarse? | ✅ Existe la opción de rechazo ("no conocer o no desear evaluar"), que se registra sin puntuaciones. Muy bien pensado: evita evaluaciones tibias de compromiso |
| ¿Entiende en qué punto está? | ✅ Formulario de una sola pantalla |
| ¿Expectativa de tiempo? | ❌ No la hay |
| ¿Y si el enlace caducó? | ⚠️ Mensaje claro ("El token ha expirado") pero **sin salida**: no hay forma de pedir uno nuevo. Callejón sin salida |
| ¿Se puede guardar a medias? | ❌ No. Si cierra la pestaña, pierde lo escrito |
| ¿Móvil? | ✅ `viewport` en los 12 HTML |
| Doble envío | ✅ Botón deshabilitado al enviar |

**Lo mejor del flujo del evaluador:** la fricción es mínima y la promesa de confidencialidad es explícita. Son las dos cosas que más pesan en que un desconocido responda.

**Lo peor:** el callejón del enlace caducado, y que no haya recordatorios.

### 2.2 Trabajador

| Pregunta | Respuesta |
|----------|-----------|
| ¿Entiende qué es y qué gana? | ✅ `index.html` y `trabajador.html` lo explican |
| Fricción | ⚠️ **Es el formulario más pesado del sistema**: datos personales, N evaluadores con nombre, RUT, email, empresa, cargo y tiempo, más dos PDF. Todo de una vez, sin guardado parcial |
| Llegando desde M-4/M-5 | ❌ Aterriza en un formulario vacío pese a que el sistema ya tiene su RUT y su correo (H-29) |
| ¿Sabe qué pasa con sus datos? | ✅ Consentimiento explícito y obligatorio (`trabajador.html:745`) |
| ¿Sabe en qué punto está? | ✅ `estado.html` cumple bien esa función |
| ¿Expectativa de tiempos? | ❌ No sabe cuánto tardarán sus evaluadores ni qué pasa si no responden |
| ¿Si un evaluador no responde? | ❌ **Nada.** Sin recordatorios, sin poder reenviar, sin poder sustituir al evaluador. El proceso queda colgado y solo puede rehacer la solicitud entera — lo que duplica registros (H-21) |
| ¿Si le rechazan un documento? | ❌ No ve el motivo, aunque esté escrito (H-22) |
| ¿Se puede guardar a medias? | ❌ No |
| ¿Puede borrar sus datos? | ⚠️ Solo escribiendo a `contacto@`, mencionado en el pie de un correo |

### 2.3 Reclutador

| Pregunta | Respuesta |
|----------|-----------|
| Fricción de entrada | ✅ Login simple; alta gestionada por el admin |
| ¿Entiende el estado de cada candidato? | ❌ **Ve "Completado" cuando no lo está** (H-19). Es el peor fallo de usabilidad del panel, porque induce a decidir sobre información incompleta creyéndola completa |
| Estados de interfaz | ⚠️ Hay estado de carga ("Cargando evaluaciones…") y estado vacío. Los de error dependen del `catch` |
| Sesión | ❌ Expira a la hora sin aviso ni renovación (H-16) |
| Móvil | ⚠️ Tiene `viewport`, pero un panel con tablas de candidatos a 375px necesita revisión específica |

### 2.4 Validador interno

Sin cuenta, sin autenticación (H-02, H-03), sin identidad registrada (`validador_id` nunca se escribe). Desde el punto de vista de usabilidad funciona —recibe correo, abre enlace, ve los PDF con URL firmada, marca—, pero no hay bandeja de trabajo: si se pierde el correo, no hay forma de encontrar lo pendiente. Con volumen, es un cuello de botella sin instrumentación.

### 2.5 Admin

Flujo mínimo y correcto: listar, crear, activar, desactivar, eliminar. La reactivación de usuarios borrados está bien resuelta, con confirmación en dos pasos (`confirm_reactivate`). ✅

---

## 3. Transversal (§7.3)

| Punto | Estado |
|-------|--------|
| Propuesta de valor en `index.html` | ✅ Clara |
| Estados de carga / vacío / error / éxito | ⚠️ Los dos primeros existen en el dashboard; los de error son irregulares |
| Mensajes de error | ⚠️ Mezcla. Los de las funciones están en español y son claros ("Credenciales incorrectas", "El token ha expirado"). Pero varias devuelven `error.message` crudo en el 500, que puede filtrar detalles internos — nombres de tabla o restricciones de Postgres. Menor, pero es filtración de información |
| Confianza: privacidad y términos antes de pedir datos | ✅ Enlazados desde los formularios de consentimiento, no solo en el pie |
| Accesibilidad | No auditada en profundidad. Los formularios usan `<label>`, que es la base |
| Móvil | ✅ `viewport` en los 12; revisión visual a 375px pendiente |
| Consistencia entre los 12 HTML | ✅ Tipografía, paleta (`#0E2A47`) y tono uniformes. Tratamiento de "tú" consistente |

---

# HALLAZGOS DE FASE 4

### [H-28] `noreply@` sin buzón de vuelta ni `reply_to`
- **Severidad:** Media
- **Ubicación:** los 7 correos; `contacto.huellalaboral.cl` sin registros MX (verificado por DNS)
- **Evidencia:** `from: 'Huella Laboral <noreply@contacto.huellalaboral.cl>'`, sin `reply_to` en ninguno. Consulta MX del subdominio: sin registros.
- **Impacto:** el evaluador es un desconocido cuya reacción natural ante la duda es responder al correo. Esa respuesta rebota. Se pierde justo a quien iba a colaborar pero quería confirmar primero. Cruza directamente con la carencia de señales anti-phishing.
- **Corrección:** `reply_to: 'contacto@huellalaboral.cl'` en los siete envíos — es un buzón real de Google Workspace, ya verificado. Una línea por correo.
- **Esfuerzo:** S

### [H-29] Las invitaciones aterrizan en un formulario vacío
- **Severidad:** Media
- **Ubicación:** M-4 y M-5 en `agregar-candidato`; `trabajador.html`
- **Evidencia:** ambos enlazan a `https://huellalaboral.cl/trabajador.html`, sin token ni parámetros, aunque `candidatos_proceso` ya guarda `rut_invitado` y `email_invitado`.
- **Impacto:** la persona invitada llega a un formulario en blanco y debe reescribir datos que el sistema ya tiene. Fricción innecesaria en el punto exacto donde se decide si el candidato entra o abandona, y en el flujo más largo del producto.
- **Corrección:** token de invitación en el enlace y precarga de RUT y correo.
- **Esfuerzo:** M

### [H-30] Sin recordatorios al evaluador
- **Severidad:** Media
- **Ubicación:** flujo de `crear-solicitud`
- **Impacto:** M-1 se envía una vez. Si el evaluador lo abre en mal momento, la referencia se pierde en silencio durante 30 días. Es el mayor punto de fuga del embudo, sobre un canal cuya infraestructura ya está bien montada.
- **Corrección:** recordatorios a los 3 y 10 días, con copy distinto, para invitaciones no completadas y no expiradas.
- **Esfuerzo:** M

### [H-31] El enlace de evaluación caducado no ofrece salida
- **Severidad:** Baja
- **Ubicación:** `obtener-evaluacion`, `evaluar.html`
- **Impacto:** el evaluador que llega tarde ve "El token ha expirado" y no puede hacer nada. Alguien dispuesto a colaborar se queda fuera y el trabajador no se entera.
- **Corrección:** ofrecer "solicitar un enlace nuevo", que avise al trabajador.
- **Esfuerzo:** M

### [H-32] Correo sin señales anti-phishing ni expectativa de esfuerzo
- **Severidad:** Baja
- **Ubicación:** M-1 en `crear-solicitud`
- **Impacto:** el correo pide a un desconocido que haga clic y opine sobre una persona, sin enlace a privacidad, sin identificar al responsable del tratamiento y sin decir cuánto cuesta. Todo trabaja a favor de la hipótesis "esto es phishing".
- **Corrección:** añadir "te toma 3 minutos", enlace a `privacidad.html`, identidad del responsable y una línea sobre por qué recibe esto. Definir preheader.
- **Esfuerzo:** S

### [H-33] Sin `text` plano ni `List-Unsubscribe`
- **Severidad:** Baja
- **Ubicación:** los 7 envíos
- **Impacto:** solo-HTML puntúa peor en varios filtros de spam. `List-Unsubscribe` es especialmente pertinente en M-4 y M-5, que son invitaciones no solicitadas.
- **Corrección:** añadir `text` a los siete y cabecera `List-Unsubscribe` (RFC 8058) a los de invitación.
- **Esfuerzo:** S

### [H-34] Formularios largos sin guardado parcial
- **Severidad:** Baja
- **Ubicación:** `trabajador.html`, `evaluar.html`
- **Impacto:** el formulario del trabajador es largo —datos, N evaluadores, dos PDF— y se pierde entero si algo falla. En móvil, donde llegará la mayoría desde el correo, la probabilidad de interrupción es alta.
- **Corrección:** autoguardado en `localStorage` por paso.
- **Esfuerzo:** M
