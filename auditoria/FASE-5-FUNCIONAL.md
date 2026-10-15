# Fase 5 — Funcionalidades esperadas

**Ejecutada el 16 de agosto de 2026** · Contra `main` en `edc3d2a` · 12 HTML y 19 edge functions
leídos, más el estándar del mercado de verificación de referencias.

---

## 1. Qué es este pase y qué no es

`FASE-4-USABILIDAD.md` recorrió el producto por actor, pero **leyendo el código**: su propia
sección 1.6 declara que las pruebas empíricas no se realizaron. Preguntó *si lo que existe funciona
bien*. Este pase pregunta otra cosa: **qué funcionalidades espera cada actor que aquí no existen**,
comparando contra lo que el mercado ya trata como base.

Es el complemento de lectura de la auditoría de UX pendiente. **No sustituye el recorrido en
teléfono**, que sigue abierto (UX-36, UX-37): lo que exige ver píxeles no se encuentra leyendo.

**Referencias de mercado consultadas:** Xref, SkillSurvey (iCIMS), Checkster (Harver), RefNow,
HiPeople, Refensa, RefAssured.

---

## 2. La línea base del mercado

Lo que estas plataformas tratan como funcionalidad mínima, no como diferenciador:

| Actor | Base del mercado |
|-------|------------------|
| **Evaluador** | Encuesta corta, completable en un par de minutos desde el teléfono; expectativa de tiempo declarada; posibilidad de guardar el avance; recordatorios automáticos |
| **Trabajador** | Aviso cuando la referencia se inicia y cuando se completa; seguimiento del progreso sin escribir a nadie; posibilidad de corregir o sustituir un evaluador |
| **Reclutador** | Aviso al llegar cada respuesta; nómina de invitados con su estado; reenvío manual; reporte exportable; señales anti-fraude sobre la relación candidato–evaluador |

**Buena noticia:** la mitad de esa base ya está en el backlog con código —H-29, H-30, H-31, H-34,
UX-31, UX-33, UX-41, UX-43, UX-44, UX-22, Bloque 3c—. Lo que sigue es **lo que no estaba
registrado en ninguna parte**.

---

## 3. Hallazgos

Diez hallazgos, **UX-57 a UX-66**. Cada uno con el punto exacto del código donde se comprobó la
ausencia.

### [UX-57] Ni el correo ni el formulario dicen cuánto toma la evaluación

**Actor:** evaluador · **Verificado en:** plantilla de M-1 en `crear-solicitud/index.ts`;
`evaluar.html`

El correo de invitación dice que *el proceso es muy simple*, sin cifra. `evaluar.html` no menciona
duración en ninguna parte; la única alusión al tiempo es el agradecimiento de la pantalla de éxito.
El evaluador llega desde un remitente que no conoce y tiene que decidir si abrir sin saber en qué se
está metiendo. Fase 4 ya había marcado la expectativa de tiempo como ausente en su tabla del
evaluador, pero **no quedó registrada como hallazgo con código**, así que nadie la iba a arreglar.

**Cuesta poco:** es texto en dos lugares. Entra por la vía corta.

---

### [UX-58] El trabajador no ve a quién invitó ni en qué estado está cada uno

**Actor:** trabajador · **Verificado en:** `obtener-estado/index.ts` líneas 78-90 y su respuesta,
líneas 116-133

`obtener-estado` consulta tres cosas: el trabajador, sus **evaluaciones completadas** y sus
documentos. **Nunca consulta la tabla de evaluadores invitados.** La respuesta que recibe
`estado.html` no contiene ni un campo sobre ellos.

Consecuencia: el trabajador escribió el correo de su exjefe en el formulario, y desde ese momento no
puede verificar que lo escribió bien, ni saber si el correo salió, ni quién falta por responder. Su
pantalla de seguimiento le muestra el resultado y le oculta el proceso.

**Es la contracara de H-06.** Si el correo rebota, el sistema no se entera (H-06) *y* el trabajador
tampoco tiene cómo sospecharlo.

---

### [UX-59] No se puede corregir ni sustituir un evaluador

**Actor:** trabajador · **Verificado en:** las 19 funciones; ninguna actualiza
`empleadores_solicitados` salvo para marcar completado

Un dígito mal escrito en el correo del exjefe deja el proceso muerto sin aviso. La única salida es
rehacer la solicitud entera, **que duplica las filas de evaluadores (H-21)** y deja al candidato con
un registro sucio.

El mercado lo resuelve con una función explícita de reemplazo de referencia. Aquí no existe ni la
corrección ni el reemplazo.

**Depende de UX-58:** sustituir a alguien exige primero poder verlo.

---

### [UX-60] Si el trabajador pierde el correo, pierde su enlace de seguimiento

**Actor:** trabajador · **Verificado en:** `token_consulta` solo se genera en `crear-solicitud` y
se lee en `obtener-estado`; ninguna función lo reenvía

El enlace de `estado.html` no caduca —así se decidió en H-12, es su vía de trazabilidad—, pero
**tampoco es recuperable**. Un correo borrado o un buzón cambiado y el trabajador queda sin acceso a
su propia solicitud, sin nadie a quien pedírselo salvo escribiendo a `contacto@`.

La decisión de H-12 —que el enlace no caduque— solo tiene sentido si el enlace sobrevive. Hoy no
sobrevive a la bandeja de entrada.

---

### [UX-61] El reclutador ve quién respondió, no quién falta

**Actor:** reclutador · **Verificado en:** `obtener-candidato/index.ts` línea 120;
`dashboard.html` líneas 1446 y 1671

Desde UX-45 el panel muestra la fracción correcta —«2 / 5»— porque `obtener-candidato` ya cuenta a
los invitados. Pero los cuenta con `select('id')`: **trae los identificadores y descarta nombre,
correo y fecha de envío.**

El panel sí muestra nombre y correo del evaluador en las tarjetas de evaluación, pero esos datos
salen de las evaluaciones **ya completadas**. De los tres que faltan no se ve nada: ni quiénes son,
ni a qué dirección se les escribió, ni cuándo.

Por eso hoy hay que anotar fuera del sistema a quién invitó cada candidato, que es literalmente la
recomendación vigente para el piloto. **El dato ya está en la base y ya se consulta**; solo se
descarta al armar la respuesta.

---

### [UX-62] Nadie puede reenviar una invitación

**Actor:** reclutador y trabajador · **Verificado en:** `gestionar-proceso/index.ts` líneas 93 y
101 — solo `finalizar` y `eliminar`; búsqueda de reenvío en las 19 funciones sin resultados

Los correos se envían una vez, dentro de `crear-solicitud`, y no hay ninguna vía para volver a
enviarlos. Un correo perdido, caído en spam o borrado por error no tiene remedio.

**Distinto de H-30**, que son recordatorios automáticos por plazo. Esto es el botón manual: *sé que
este no llegó, mándalo de nuevo ahora*. Es más barato que H-30 y cubre el caso urgente del piloto.

---

### [UX-63] El reclutador no se entera cuando llega una respuesta

**Actor:** reclutador · **Verificado en:** `guardar-evaluacion.ts` — cero llamadas a Resend

La función escribe la evaluación, marca al evaluador como completado y evalúa si cierra procesos.
**No notifica a nadie.** El reclutador se entera entrando al panel a mirar, y como no hay ordenamiento
útil (UX-55) ni indicador de novedad, tiene que revisar candidato por candidato.

El estándar del mercado es avisar al reclutador en cuanto la referencia se completa. Es lo que
convierte el panel en algo que se consulta cuando hay motivo, en vez de algo que hay que vigilar.

---

### [UX-64] No hay forma de exportar ni imprimir el reporte de un candidato

**Actor:** reclutador · **Verificado en:** `dashboard.html` — sin export, sin CSV, sin PDF, sin
`window.print()`

Las referencias verificadas son el producto, y hoy solo existen dentro de la pantalla. Para llevarlas
a un comité de selección, adjuntarlas a una terna o archivarlas hay que hacer capturas.

También es el punto donde el producto se vuelve compartible dentro de la empresa del reclutador, que
es como estas plataformas se propagan.

---

### [UX-65] Nada impide que el evaluador sea el propio trabajador

**Actor:** integridad del producto · **Verificado en:** `crear-solicitud/index.ts` líneas 137-155

El bucle que inserta evaluadores **no compara el correo ni el RUT del evaluador contra los del
trabajador**, ni contra los de los otros evaluadores de la misma solicitud. Un candidato puede
poner su propio correo como el de su exjefe, recibir la invitación y autoevaluarse.

Todas las plataformas del mercado tienen algún grado de detección de referencias fraudulentas. Aquí
el producto se llama *referencias laborales verificadas*: **la comprobación más barata que existe no
está hecha.** No exige algoritmo, exige tres comparaciones de igualdad.

El filtro de dominios que ya existe en `guardar-evaluacion` —marcar como verificada la respuesta que
viene de correo corporativo— no cubre esto: un candidato con correo corporativo propio pasa.

---

### [UX-66] El cuestionario es fijo y está incrustado en la página

**Actor:** reclutador · **Verificado en:** `evaluar.html` — atributos escritos en el HTML

No hay plantillas por cargo ni preguntas configurables. El mercado lo trata como base; **para este
producto es madurez, no piloto.** Se registra para completar el mapa, con prioridad baja explícita.

---

## 4. Lo que este pase descartó

- **Confirmación al evaluador tras enviar:** existe pantalla de éxito en `evaluar.html`. No es
  hallazgo.
- **Consentimiento y privacidad:** ya cubierto y correcto según Fase 4.
- **Fricción de entrada del evaluador:** un clic desde el correo, sin registro. Es de lo mejor
  resuelto del producto.

---

## 5. Cómo se agrupan

**Visibilidad y control sobre las invitaciones — UX-58, UX-61, UX-62.** Son la misma pieza vista
desde los dos lados: el trabajador no ve a quién invitó, el reclutador no ve quién falta, y nadie
puede reenviar. Los tres datos ya existen en la base. **Es la mitigación operativa de H-06** —el
riesgo número uno del piloto— y hoy se sustituye con anotaciones fuera del sistema.

**Integridad — UX-65.** Independiente y barato. Toca la función más delicada del sistema, que es la
razón por la que UX-34 se aplazó; conviene que viajen juntos.

**Texto — UX-57.** Vía corta.

**Salida del producto — UX-63, UX-64.** Lo que hace que el reclutador use el panel sin vigilarlo y
pueda llevarse el resultado.

**Recuperación — UX-59, UX-60.** Dependen de UX-58.

**Madurez — UX-66.** Después de todo lo demás.

---

## 6. Lo que este pase no cubre

Sigue pendiente el recorrido en teléfono: **once pantallas sin ver en un dispositivo real**
(UX-37) y `index.html` sin diagnóstico (UX-36). Leyendo el código no se encuentra lo que se ve mal,
solo lo que no está. Esa mitad requiere al dueño con un teléfono.
