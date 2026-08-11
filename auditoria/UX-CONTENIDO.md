# Huella Laboral — Auditoría UX de contenido y flujo

**Segundo pase · 31 de julio de 2026 · rama `auditoria`**
Foco exclusivo: correos y embudo. No CSS, no rediseño, no re-auditoría de seguridad.

Conector verificado antes de empezar: 19 edge functions, las mismas del primer pase.

---

## 0. El hallazgo que ordena todo lo demás

El primer pase encontró que el correo al evaluador dice esto:

> *"Tu respuesta estará visible para reclutadores en nuestra plataforma, pero **no será visible para el postulante**."*

Es la frase más valiosa del producto. Es lo que permite que alguien escriba una opinión honesta sobre un excolaborador sin miedo a la represalia.

**Esa frase no aparece en ninguna parte de `evaluar.html`.** Verificado: cero coincidencias de "confidencial", "anónim", "no será visible" o "postulante" en el archivo.

Es decir: la promesa que desbloquea la honestidad se hace en el correo, y **se olvida exactamente en la pantalla donde la persona escribe**. Entre leer el correo y escribir el comentario median un clic, un cambio de contexto y, con frecuencia, minutos u horas. Para cuando el evaluador está frente al campo "Comentarios adicionales", la garantía ya no está a la vista.

Esto no es un "falta X". Es que el producto tiene su mejor argumento y lo dice en el momento equivocado. De ahí salen UX-01 y buena parte de este informe.

---

## 1. Fase A — Inventario de los 7 correos

| ID | Función | Disparador | Destinatario | Estado emocional | Asunto | CTA | Destino |
|----|---------|-----------|--------------|------------------|--------|-----|---------|
| **M-1** | `crear-solicitud` | El trabajador envía el formulario | Cada evaluador declarado | **Frío total** — no conoce la marca, no espera nada, no gana nada | `<nombre> te solicita una referencia laboral` | Completar Evaluación | `evaluar.html?token=<uuid>` |
| **M-2** | `crear-solicitud` | Misma llamada | El trabajador | Esperando — acaba de actuar | `Solicitud de referencias recibida` | Ver mi evaluación | `estado.html?token=<token_consulta>` |
| **M-3** | `crear-solicitud` | Solo si adjuntó documentos | `contacto@huellalaboral.cl` | Operativo interno | `Nuevos documentos para validar` | Validar Documentos | `validar.html?token=<trabajador_id>` |
| **M-4** | `agregar-candidato` | El RUT ya existe en el sistema | El trabajador | Tibio — conoce la marca | `<reclutador> te agregó a un proceso de selección` | Actualizar mis Referencias | `trabajador.html` *(sin token)* |
| **M-5** | `agregar-candidato` | El RUT no existe | El email invitado | **Frío** — no conoce la marca | `<reclutador> te invita a solicitar tus referencias laborales` | Solicitar mis Referencias | `trabajador.html` *(sin token)* |
| **M-6** | `crear-reclutador` | Alta de reclutador | El reclutador | Cautivo — esperaba el correo | `Crea tu contraseña - Huella Laboral` | Crear mi Contraseña | `action_link` de Auth |
| **M-7** | `crear-reclutador` | Reactivación de usuario borrado | El reclutador | Cautivo | `Crea tu contraseña - Huella Laboral` | Crear mi Contraseña | `action_link` de Auth |

**Dos de los siete correos van a destinatarios completamente fríos: M-1 y M-5.** Son los que deciden si el producto entrega valor. Los cinco restantes van a gente que ya está dentro del sistema o lo espera.

---

## 2. Fase B — Diagnóstico correo por correo

### M-1 — Invitación al evaluador 🔴 *el correo que decide el producto*

| Criterio | | Detalle |
|---|:--:|---|
| Asunto da contexto | ✅ | `<nombre> te solicita una referencia laboral`. El nombre del trabajador va primero, que es lo único que ancla el correo a algo reconocible |
| Longitud en móvil | ⚠️ | ~44 caracteres con un nombre típico. Se corta justo en "referencia labo…". Sobrevive porque lo importante está al principio |
| `from` coherente con el enlace | ✅ | `noreply@contacto.huellalaboral.cl` → enlace a `huellalaboral.cl`. Coherente, sin acortadores |
| Primeras dos líneas: quién, por qué, qué | ✅ | "Somos Huella Laboral, una plataforma que gestiona referencias laborales…" → "<nombre> te ha solicitado una referencia…". El orden es correcto |
| Se entiende con imágenes bloqueadas | ✅ | No hay imágenes. Ninguna |
| Preheader | ❌ | Sin definir. La bandeja mostrará "Solicitud de Referencia Laboral Hola, Somos Huella Laboral…" — no es basura, pero desperdicia la única línea gratis |
| Un solo CTA sin scroll | ✅ | "Completar Evaluación" |
| Expectativa de esfuerzo | ❌ | "El proceso es muy simple" es una afirmación vacía. Y es **falsa**: son 6 campos de identificación más 4 calificaciones más consentimiento. Ver UX-02 |
| Confidencialidad | ✅ | La frase clave está, y bien situada. Es lo mejor del correo |
| Señales anti-phishing | ❌ | Sin enlace a privacidad, sin identificar al responsable, sin explicar cómo llegó su correo al sistema. **Esta última es la pregunta que se hace el lector y nadie responde** |
| ¿Sabe qué pasa tras el clic? | ❌ | No se anticipa nada del formulario |
| Forma de responder una duda | ❌ | `noreply@` sin MX ni `reply_to`: las respuestas rebotan (H-28) |
| Firma con identidad | ❌ | "Huella Laboral — Sistema de referencias laborales verificadas". Ni persona, ni empresa, ni contacto |
| Tono y tratamiento | ✅ | "tú", consistente con el resto |

**Veredicto:** el correo está bien estructurado y contiene su mejor argumento, pero **no responde la pregunta que el lector se está haciendo: "¿cómo consiguieron mi correo y por qué debería creerles?"**. Lo más importante que arreglar no es el copy: es que ese correo no cierra el bucle de confianza que él mismo abre.

---

### M-2 — Confirmación al trabajador 🟢

| Criterio | | Detalle |
|---|:--:|---|
| Asunto | ✅ | `Solicitud de referencias recibida`. Claro y esperado |
| Qué pasa ahora | ✅ | Explica que los evaluadores ya recibieron la solicitud |
| CTA | ✅ | "Ver mi evaluación" → `estado.html` |
| Advertencia de guardar el enlace | ✅ | "Guarda este link — es personal" |
| Derechos sobre los datos | ✅ | **Único de los siete que menciona la supresión de datos**, con dirección de contacto |
| Expectativa de plazos | ❌ | No dice cuánto tardan los evaluadores ni qué pasa si no responden |
| Tono | ✅ | Cálido y correcto |

**Veredicto:** el mejor correo del conjunto. Le falta una sola cosa: decir cuánto va a esperar y qué hará el sistema si nadie responde.

---

### M-3 — Aviso al validador interno 🟡

| Criterio | | Detalle |
|---|:--:|---|
| Contexto suficiente | ⚠️ | Da nombre y RUT del trabajador. No dice **qué** documentos llegaron (¿certificado, finiquito, ambos?), aunque la función lo sabe |
| Prioridad o antigüedad | ❌ | Sin señal de cuántos hay pendientes ni desde cuándo |
| CTA | ✅ | Directo al documento concreto |

**Veredicto:** funcional pero ciego. Es correo operativo que hace de cola de trabajo sin serlo: si se pierde un mensaje, ese trabajador queda sin validar y nadie lo detecta. Ver UX-12.

---

### M-4 — "Te agregaron a un proceso" 🟠

| Criterio | | Detalle |
|---|:--:|---|
| Asunto | ✅ | `<reclutador> te agregó a un proceso de selección`. Concreto |
| ¿A qué proceso? | ❌ | **No dice el cargo ni la empresa.** El objeto `proceso` está disponible en la función y no se usa. El destinatario no sabe a qué postuló |
| Qué se le pide | ⚠️ | "es un buen momento para verificar que estén actualizadas" — sugerencia difusa, no acción concreta |
| Coherencia del CTA | ⚠️ | El botón dice "Actualizar mis Referencias", pero el texto de abajo dice "Si tus referencias están al día, no necesitas hacer nada". El correo se contradice: pide clic y a la vez dice que no hace falta |
| Destino | ❌ | `trabajador.html` sin token ni contexto (H-29) |

**Veredicto:** el correo se anula a sí mismo. Lo más importante que arreglar es la contradicción entre el CTA y el párrafo siguiente — hoy el lector racional no hace clic.

---

### M-5 — Invitación al trabajador nuevo 🟠

| Criterio | | Detalle |
|---|:--:|---|
| Asunto | ✅ | `<reclutador> te invita a solicitar tus referencias laborales` |
| ¿A qué proceso? | ❌ | Mismo problema que M-4: sin cargo ni empresa |
| Explica el proceso | ✅ | **Bien hecho**: "completa tus datos, sube tus documentos (certificado de cotizaciones y finiquito), y nosotros contactaremos a tus antiguos jefes". Es el único correo que anticipa el esfuerzo real |
| Beneficio para el lector | ⚠️ | "puede ayudarte a destacar" es tibio para pedir dos documentos y los datos de tus exjefes |
| Destino | ❌ | Formulario en blanco pese a que el sistema tiene su RUT y su correo (H-29) |
| Expectativa de esfuerzo | ❌ | No dice cuánto tarda ni que necesita tener los PDF a mano |

**Veredicto:** explica bien el qué, no vende el porqué, y aterriza mal. Le pide bastante a alguien que aún no sabe qué gana.

---

### M-6 / M-7 — Crear contraseña 🟢

| Criterio | | Detalle |
|---|:--:|---|
| Asunto | ✅ | `Crea tu contraseña - Huella Laboral`. Esperado |
| Caducidad y un solo uso | ✅ | "Este enlace es personal, de un solo uso y expira en 24 horas". Correcto y tranquilizador |
| Diferenciación M-6 vs M-7 | ✅ | M-7 dice "Tu cuenta ha sido reactivada" |
| Textos por defecto sin traducir | ✅ | Ninguno: no se usan las plantillas de Auth, el correo se arma a mano |
| Qué puede hacer después | ⚠️ | No explica qué encontrará en el panel |

**Veredicto:** correctos. Destinatario cautivo, riesgo bajo. No tocar.

---

### Resumen de la Fase B

| Correo | Destinatario | Veredicto | Prioridad |
|--------|--------------|-----------|:---------:|
| M-1 | Evaluador (frío) | Abre un bucle de confianza que no cierra | 🔴 1 |
| M-5 | Trabajador nuevo (frío) | Explica el qué, no el porqué; aterriza mal | 🟠 2 |
| M-4 | Trabajador conocido | Se contradice a sí mismo | 🟠 3 |
| M-3 | Validador interno | Cola de trabajo ciega | 🟡 4 |
| M-2 | Trabajador | Bueno; falta expectativa de plazos | 🟢 5 |
| M-6/M-7 | Reclutador | Correctos | 🟢 — |

---

## 3. Fase C — El embudo, paso a paso

### 3.1 Camino del evaluador — prioridad máxima

```
       ┌──────────────────────────────────────────────────────────┐
  100  │ Correos enviados a evaluadores                           │
       └──────────────────────────────────────────────────────────┘
              ↓  filtro de spam · SPF/DKIM/DMARC correctos (Fase 4)
       ┌────────────────────────────────────────────────────┐
   ~85 │ Llegan a bandeja                                   │
       └────────────────────────────────────────────────────┘
              ↓  🔴 ABANDONO 1 — "¿quién es esto? ¿phishing?"
              ↓     M-1 no dice cómo consiguieron su correo
       ┌──────────────────────────────────┐
    ~? │ Abren el correo                  │
       └──────────────────────────────────┘
              ↓  🔴 ABANDONO 2 — sin expectativa de esfuerzo
       ┌────────────────────────┐
    ~? │ Hacen clic             │
       └────────────────────────┘
              ↓  🔴 ABANDONO 3 — EL MÁS GRANDE
              ↓     Aterrizan y lo primero que se les pide es su RUT
       ┌──────────────┐
    ~? │ Completan    │
       └──────────────┘
              ↓  🟡 sin recordatorios: quien no completó, se pierde (H-30)
       ┌────────┐
    ~? │ Envían │
       └────────┘
```

**No hay analítica instrumentada** —ni en el correo ni en las páginas—, así que los números concretos no existen. Es en sí mismo un hallazgo (UX-13): el embudo del que depende el producto no se mide en ningún punto.

#### Abandono 3 — el aterrizaje, y es peor de lo que parecía

`H-29` del primer pase decía que *el trabajador* llega a un formulario vacío. Al mirar el camino del evaluador aparece la versión grave del mismo problema.

`obtener-evaluacion` **devuelve estos campos**:

```js
empleador_nombre: empleador.nombre_evaluador,
empleador_email:  empleador.email_evaluador,
empleador_empresa: empleador.empresa,
```

Y `evaluar.html:687-690` **usa solo dos, los del trabajador**:

```js
document.getElementById('trabajadorNombre').textContent = data.trabajador_nombre || '';
document.getElementById('trabajadorNombreIntro').textContent = data.trabajador_nombre || '';
document.getElementById('trabajadorRut').textContent = data.trabajador_rut || '';
```

Los datos del evaluador llegan al navegador y **se descartan**. El resultado es que el evaluador debe teclear a mano:

| Campo | ¿Lo sabe el sistema? | ¿Obligatorio? |
|-------|:---:|:---:|
| Nombre completo | ✅ Sí, y lo envía | Sí, mínimo 3 caracteres |
| **RUT** | ❌ No | **Sí, con validación de dígito verificador** |
| Empresa | ✅ Sí, y la envía | Sí |
| RUT de la empresa | ❌ No | No |
| Cargo | ⚠️ Está en la tabla | Sí |
| Tiempo de trabajo | ⚠️ Está en la tabla | Sí |

**Pedirle el RUT a un desconocido es el momento de máxima fricción y máxima sospecha de todo el embudo.** Un correo inesperado que, tras un clic, exige tu número de identidad nacional para hacerle un favor a un excolaborador, en una página que no habías oído nombrar. Es exactamente el comportamiento que la gente aprendió a asociar con el fraude — y llega justo después de un correo que no explicó quién es Huella Laboral ni cómo obtuvo su dirección.

Y a esa altura, la garantía de confidencialidad ya no está en pantalla (§0).

**No estoy diciendo que el RUT sobre**: la trazabilidad de quién evalúa es el activo del producto (Fase 1). Lo que digo es que **se pide en el peor momento posible y sin justificarlo**. El campo no explica por qué se necesita.

#### Lo que sí está bien en este camino

Conviene no romperlo al arreglar lo anterior:

- **La validación del formulario es sólida**: valida los 6 campos, el dígito verificador del RUT, las 4 calificaciones y el consentimiento, con mensajes por campo en español claro ("RUT inválido. Verifica el dígito verificador."). Bien hecho.
- **La opción de rechazo** —"No conozco o no he trabajado con esta persona" / "No deseo realizar esta evaluación"— es un acierto de diseño. Da salida digna y evita evaluaciones tibias de compromiso. Al marcarla, el formulario se colapsa y no pide nada más.
- **La escala de 1 a 5 está etiquetada** (Insuficiente → Muy bueno), no son estrellas mudas.
- **Cada criterio tiene subtítulo explicativo** ("Cumplimiento de horarios, asistencia y compromisos de tiempo").
- **Doble clic bloqueado**, botón deshabilitado al enviar.

#### El enlace caducado

```
"Este enlace de evaluación no es válido o ya fue utilizado.
 Si crees que es un error, contacta a quien te lo envió."
```

Mezcla tres estados distintos —inválido, ya usado y expirado— en un solo mensaje, y la salida que ofrece ("contacta a quien te lo envió") **le pide al evaluador que contacte al trabajador que está siendo evaluado**. Es incómodo y es justo la interacción que el diseño quiere evitar: pone en contacto directo al evaluado con su evaluador, a espaldas del sistema (profundiza H-31).

#### La confirmación final

```
"¡Evaluación enviada correctamente!
 Gracias por tomarte el tiempo de completar esta evaluación. Tu opinión es muy valiosa."
```

Cordial, y no dice **nada** de lo que el evaluador podría querer saber: si podrá cambiarla (no), quién la verá (reclutadores), si el trabajador la verá (no), si le llegará algo más (no). Es el último momento de contacto con esa persona y se desperdicia en una fórmula de cortesía. UX-09.

### 3.2 Camino del trabajador

```
Reclutador lo agrega → M-4/M-5 → trabajador.html → sube documentos → ESPERA → ???
```

**El punto ciego está en la espera, y es total.**

`obtener-estado` devuelve `evaluaciones` (las completadas) y `documentos`. **No devuelve `empleadores_solicitados`.** Y `estado.html:244` solo hace:

```js
const totalEvals = (data.evaluaciones?.lista || []).filter(e => !e.rechazo).length;
```

Un contador de las que llegaron. Consecuencia: **el trabajador no puede saber a quién le llegó la invitación, quién respondió, quién no, ni cuánto falta.** Declaró cinco evaluadores, ve "2 evaluaciones recibidas", y no tiene forma de saber si los otros tres están pendientes, si rebotó el correo (H-20), o si caducó el enlace.

Y no puede hacer nada al respecto: no hay reenviar, no hay sustituir evaluador, no hay recordar. Su única acción posible es rehacer la solicitud entera, lo que duplica registros y correos (H-21).

Es el limbo más largo del producto —hasta 30 días— y el actor que lo sufre es el que más incentivo tiene para actuar.

**Lo que sí funciona:** `estado.html` presenta un "Resumen trayectoria laboral" con empleos en 5 años, permanencia máxima y causal de término. Es información útil y bien presentada. Y ofrece "Solicitar eliminación de mis datos" con dirección de contacto — buena señal de confianza.

**Si le rechazan un documento**, no ve el motivo aunque esté escrito en `razon_invalido` (H-22). Queda detenido sin saber que hay algo que corregir.

### 3.3 Camino del reclutador — cautivo, menor prioridad

- **`index.html`** comunica bien: *"Integramos referencias y datos laborales comprobables, para crear un perfil profesional confiable"*, con dos accesos claros (trabajador / panel) y el subtítulo "Sin registro. Solo completa tu información." — que baja bien la barrera de entrada del trabajador.
- **Una afirmación se pasa de frenada:** *"Cada evaluación queda registrada con la identidad del evaluador"*. Según Fase 1, la identidad del evaluador es **autodeclarada** salvo el correo; el único control es un test de dominio contra seis proveedores gratuitos. La frase promete verificación de identidad que hoy no existe. UX-14.
- **El panel muestra "Completado" cuando no lo está** (H-19). Desde UX es el peor fallo del reclutador: decide sobre información incompleta creyéndola completa.
- **Los perfiles del hero** (María González, Carlos Muñoz, Andrea Soto, con nota 4.4 y sello "Verificado") son una maqueta del producto dentro de `hero-visual`. Es práctica habitual y no lo considero engañoso; solo anoto que con nombres realistas y sello "Verificado" pueden leerse como testimonios de clientes. Un rótulo tipo "ejemplo" lo zanja. 🟢

---

## 4. Fase D — Consistencia transversal

| Dimensión | Estado |
|-----------|--------|
| **Tratamiento tú/usted** | ✅ **Uniforme.** "tú" en los 7 correos y en las páginas. Cero apariciones de "usted" en `evaluar`, `trabajador` y `estado` |
| **Voz y tono** | ✅ Una sola voz: sobria, institucional, sin exclamaciones salvo en la confirmación. Coherente con un producto que vende confianza |
| **Firma de los correos** | ⚠️ Dos variantes conviviendo: "Sistema de referencias laborales verificadas" (M-1, M-2, M-3, M-4, M-6, M-7) y "Referencias y trayectorias laborales verificadas" (M-5). Detalle menor pero es la línea de marca |
| **Guion largo vs guion medio** | ⚠️ "Huella Laboral —" en unos correos y "Huella Laboral -" en otros. Cosmético |
| **Textos por defecto sin traducir** | ✅ Ninguno. Al no usar las plantillas de Auth, no hay inglés residual |
| **Mensajes de error al usuario** | ✅ En español y comprensibles: "RUT inválido. Verifica el dígito verificador.", "Credenciales incorrectas", "El token ha expirado" |
| **Privacidad y términos antes de pedir datos** | ✅ Enlazados desde los bloques de consentimiento, no escondidos en el pie |
| **Lenguaje del consentimiento** | ⚠️ `evaluar.html:547` remite al "Anexo II aplicable a Evaluadores". Un evaluador frío no va a leer un anexo numerado; el registro jurídico choca con el tono del resto |
| **Momentos de espera** | ❌ **El agujero transversal.** Ver §4.1 |

### 4.1 Los momentos de espera: nadie sabe nada

Cada vez que un actor depende de otro, el que espera queda a ciegas. Sistemáticamente:

| Quién espera | A quién | Qué ve | Cuánto puede durar |
|--------------|---------|--------|--------------------|
| Trabajador | Sus evaluadores | Un contador de las completadas. **Los pendientes no existen en la interfaz** | Hasta 30 días |
| Trabajador | Al validador de documentos | Nada. Si le rechazan, tampoco el motivo (H-22) | Indefinido |
| Reclutador | A que el candidato complete | "Invitado", sin saber si el correo llegó | Indefinido |
| Evaluador | — | Tras enviar, nada más. No sabe si sirvió | — |
| Validador interno | — | Solo su bandeja de correo. Sin cola de trabajo | — |

**Ninguno de los cinco tiene visibilidad del otro lado.** No es un fallo suelto en una pantalla: es un patrón que atraviesa el producto entero. Y es de los pocos hallazgos que se arregla en un sitio —exponer los pendientes en `obtener-estado`— y mejora dos caminos a la vez.

---

## 5. Hallazgos nuevos

Severidad medida en **impacto sobre conversión**, no en riesgo técnico.

### 🔴 Rompen la conversión

**[UX-01] La garantía de confidencialidad no aparece donde se escribe**
El correo promete que el postulante no verá la evaluación; `evaluar.html` no lo menciona ni una vez (verificado: cero coincidencias). El evaluador redacta el campo libre sin la garantía a la vista, justo cuando decide entre ser honesto o poner una fórmula neutra. Es el mejor argumento del producto, dicho en el momento equivocado. **Impacto: calidad del dato, que es el activo.** Esfuerzo: S.

**[UX-02] Se pide el RUT a un desconocido, y seis campos que el sistema ya conoce**
`obtener-evaluacion` devuelve `empleador_nombre`, `empleador_email` y `empleador_empresa`; `evaluar.html` los descarta y presenta el formulario vacío. El evaluador teclea nombre, RUT (con validación de dígito verificador), empresa, cargo y tiempo. Pedir el número de identidad nacional a un contacto frío, sin explicar para qué, en el paso inmediatamente posterior al clic, es el mayor punto de abandono del embudo. **Es fricción autoinfligida: el dato ya viajó al navegador.** Esfuerzo: S para precargar; M si además se justifica el campo.

**[UX-03] M-1 no responde "¿cómo consiguieron mi correo?"**
Es la primera pregunta del lector y el correo no la menciona. Falta también enlace a privacidad, identidad del responsable y expectativa de esfuerzo. Profundiza H-32: no es que "falten señales anti-phishing", es que el correo abre un bucle de confianza —te pedimos una opinión sobre una persona— y no lo cierra. Esfuerzo: S.

### 🟠 Fricción alta

**[UX-04] El trabajador no puede ver quién respondió y quién no**
`obtener-estado` no devuelve `empleadores_solicitados`; `estado.html` solo cuenta las completadas. El trabajador no sabe si faltan tres evaluadores o si rebotaron sus correos, y no puede reenviar, sustituir ni recordar. Su única acción es rehacer la solicitud, que duplica todo (H-21). Limbo de hasta 30 días para el actor con más incentivo de todo el sistema. Esfuerzo: M.

**[UX-05] M-4 se contradice a sí mismo**
El CTA dice "Actualizar mis Referencias" y el párrafo siguiente dice "Si tus referencias están al día, no necesitas hacer nada". El lector racional no hace clic. Esfuerzo: S.

**[UX-06] M-4 y M-5 no dicen a qué proceso invitan**
Ni cargo ni empresa, pese a que la función tiene el `proceso_id`. "Te agregué a un proceso" sin decir cuál obliga a adivinar o ignorar. Esfuerzo: S.

**[UX-07] El rechazo del evaluador no llega a nadie**
Cuando alguien marca "No conozco a esta persona", eso se guarda en `evaluaciones.rechazo` y **no notifica ni al trabajador ni al reclutador**. Es una señal valiosísima —para el trabajador, que debe buscar otro evaluador; para el reclutador, como dato de verificación— y muere en la base. El trabajador sigue esperando una referencia que ya se sabe que no va a llegar. Esfuerzo: M.

**[UX-08] El enlace caducado deriva al evaluador hacia el evaluado**
"Contacta a quien te lo envió" pone en contacto directo al evaluador con la persona que está siendo evaluada, que es precisamente lo que el diseño confidencial quiere evitar. Además mezcla tres estados distintos en un mensaje. Profundiza H-31. Esfuerzo: M.

### 🟡 Roce

**[UX-09] La confirmación final no dice qué pasa después**
Último contacto con el evaluador, gastado en una fórmula de cortesía. No dice quién la verá, que el trabajador no la verá, ni que no podrá modificarla. Esfuerzo: S.

**[UX-10] Sin preheader en ninguno de los siete**
Se pierde la línea gratis de la bandeja de entrada. En M-1 podría llevar la garantía de confidencialidad o el tiempo estimado. Esfuerzo: S.

**[UX-11] M-3 es una cola de trabajo que no es una cola**
Sin decir qué documentos llegaron ni cuántos hay pendientes. Si se pierde un correo, ese trabajador queda sin validar y nadie lo nota. Esfuerzo: M.

**[UX-12] El consentimiento del evaluador remite a un "Anexo II"**
Registro jurídico dentro de un flujo diseñado para un desconocido con prisa. Choca con el tono del resto. Esfuerzo: S.

**[UX-13] El embudo no se mide en ningún punto**
Sin analítica en correos ni páginas: no hay aperturas, clics, inicios de formulario ni abandonos. No se puede saber cuál de los tres abandonos del §3.1 pesa más, ni si un cambio mejoró algo. **Cualquier optimización posterior es a ciegas.** Esfuerzo: M.

### 🟢 Pulido

**[UX-14] `index.html` promete verificación de identidad que no existe**
"Cada evaluación queda registrada con la identidad del evaluador" — la identidad es autodeclarada salvo el correo (Fase 1 §3.2). Ajustar el copy a lo que el sistema realmente garantiza. Esfuerzo: S.

**[UX-15] Firma de marca en dos variantes**
"Sistema de referencias laborales verificadas" vs. "Referencias y trayectorias laborales verificadas" (M-5). Y guion largo/medio mezclados. Esfuerzo: S.

**[UX-16] Los perfiles del hero pueden leerse como testimonios**
Maqueta de producto con nombres realistas y sello "Verificado". Práctica habitual, pero un rótulo de "ejemplo" evita la lectura equivocada. Esfuerzo: S.

---

## 6. Los tres arreglos de mayor retorno

Ordenados por impacto sobre el embudo dividido por esfuerzo.

### 1. Precargar los datos del evaluador y justificar el RUT — UX-02

**Por qué primero.** Ataca el abandono más grande, en el actor prioritario, y **el dato ya está en el navegador**: `obtener-evaluacion` lo envía y `evaluar.html` lo tira. Son tres asignaciones más una línea de texto junto al campo RUT explicando para qué se pide.

Pasa al evaluador de "rellena seis campos, empezando por tu número de identidad" a "confirma que estos datos son correctos". Es la diferencia entre un trámite y una confirmación.

**Esfuerzo: S. Impacto: el mayor del informe.**

### 2. Repetir la confidencialidad en `evaluar.html` — UX-01

**Por qué segundo.** No mueve la tasa de completado: mueve **la calidad de lo que se escribe**, que es el activo del producto. Una evaluación tibia cuenta como conversión y no vale nada.

Es un bloque de texto visible junto al campo de comentarios, con la misma frase que ya está redactada y aprobada en el correo. Copiar y pegar, literalmente.

**Esfuerzo: S. Impacto: calidad del dato.**

### 3. Exponer los evaluadores pendientes en `estado.html` — UX-04 + UX-07

**Por qué tercero.** Cierra el limbo más largo del producto y **arregla dos caminos con un cambio**: `obtener-estado` pasa a devolver `empleadores_solicitados` con su estado —pendiente, completado, rechazado, expirado— y `estado.html` los pinta.

Con eso el trabajador ve quién respondió, quién no y quién declinó, y deja de estar a ciegas durante 30 días. Habilita además el siguiente paso natural: reenviar o sustituir un evaluador.

**Esfuerzo: M. Impacto: desbloquea al actor con más incentivo.**

---

**Mención aparte:** los **recordatorios al evaluador** (H-30, primer pase) siguen siendo probablemente la mayor ganancia bruta de conversión del producto. No los pongo en el podio porque exigen infraestructura de tareas programadas —cron o cola—, que es un salto de esfuerzo respecto a los tres de arriba. Pero en cuanto exista esa infraestructura, van primero.

---

## 7. Supuestos (U-4)

1. **No hay analítica que yo no haya visto.** No encontré Google Analytics, píxeles ni tracking en los 12 HTML, ni parámetros de seguimiento en los enlaces de los correos. Si existiera medición por otra vía, UX-13 decae.
2. **Los perfiles del hero de `index.html` son maqueta ilustrativa**, no testimonios de clientes reales. Coherente con que la base tiene 2 trabajadores.
3. **El "Anexo II" del consentimiento existe** en `terminos.html` o en el PDF. No verifiqué su contenido: UX-12 es sobre el tono de la referencia, no sobre su validez.
4. **Los correos se renderizan como indica el HTML del código.** No pude enviarlos ni verlos en un cliente real (Regla Cero, y sin salida de red hacia el proyecto). El diagnóstico de preheader y de corte de asunto es por lectura del código, no por inspección visual.
5. **Las cifras del embudo en §3.1 son cualitativas.** Marcan dónde están los abandonos, no cuánta gente pierde cada uno — precisamente porque no hay medición (UX-13).

---

## 8. Relación con el primer pase

Este pase no repite hallazgos: los profundiza o abre capa nueva.

| Del primer pase | Qué añade este |
|---|---|
| H-28 `reply_to` ausente | Se mantiene. UX-03 explica por qué duele: el correo abre un bucle de confianza y ni siquiera deja responder |
| H-29 aterrizaje sin contexto | **Se amplía al evaluador (UX-02)**, que es peor: el dato ya viaja y se descarta, e incluye el RUT |
| H-30 sin recordatorios | Confirmado. Mayor ganancia bruta, pero exige infraestructura: ver §6 |
| H-31 enlace caducado sin salida | UX-08: además la salida que ofrece empuja hacia el evaluado |
| H-32 sin señales anti-phishing | UX-03: la pregunta concreta sin responder es "¿cómo consiguieron mi correo?" |
| H-33 sin `text` ni `List-Unsubscribe` | Sin cambios. Es entregabilidad, no contenido |
| H-34 sin guardado parcial | Sin cambios |
| H-19 "Completado" mal calculado | UX lo confirma como el peor fallo del panel del reclutador |
| H-22 `razon_invalido` invisible | UX-04 lo enmarca: es un caso del patrón general de espera a ciegas |
| — | **Nuevo:** UX-01, UX-04, UX-07, UX-13, UX-14 no tienen equivalente en el primer pase |
