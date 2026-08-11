# Huella Laboral — Documento funcional

**Qué es este documento.** La referencia de qué hace el producto y por qué. Se consulta
**antes** de cambiar cualquier cosa, para verificar que el cambio no rompe un principio del
diseño. Si un arreglo choca con algo de aquí, se detiene y se decide — no se implementa.

**Qué no es.** No es el manual estratégico (etapas, métricas, ruta comercial); ese vive aparte.
No es el documento técnico (`TECNICO.md`), que explica cómo está construido.

**Actualizado:** 11 de agosto de 2026 · **Fuentes:** Manual Estratégico 2026.1 ·
`auditoria/FASE-0-MAPA.md`

---

## 1. La tesis

Huella Laboral no compite con las bolsas de empleo ni con el currículum. Compite con la
**incertidumbre al contratar**. Convierte parte de la trayectoria y reputación laboral de una
persona en evidencia verificable, portable y controlada por el propio trabajador.

La reputación laboral debería ser un activo acumulativo que acompañe al trabajador y que él
decida cuándo compartir. Hoy queda dispersa entre contratos, cotizaciones, jefaturas anteriores
y recuerdos informales, y se reconstruye desde cero en cada cambio de trabajo.

**La plataforma no es dueña de la reputación del trabajador.** Administra un proceso de
recopilación, validación y presentación. El trabajador otorga consentimiento, conoce qué
información se incorpora y controla su uso.

## 2. Qué somos y qué no somos

| Somos | No somos, en esta etapa |
|-------|-------------------------|
| Una credencial que complementa el CV | Una bolsa laboral generalista |
| Un proceso de verificación voluntario | Un sistema secreto de calificación de personas |
| Una infraestructura de confianza | Un reemplazo de LinkedIn o Laborum |
| Una base de evidencia con consentimiento | Una app móvil como prioridad |
| Un futuro índice de talento verificado | Un algoritmo que decide quién es buen trabajador |

## 3. Principios no negociables

Un cambio que contradiga cualquiera de estos se detiene y se decide, no se implementa.

1. La confianza vale más que la velocidad.
2. No automatizar antes de validar.
3. El trabajador recibe valor antes que nosotros ingresos.
4. Las empresas son el cliente de largo plazo.
5. **La información se utiliza con consentimiento y trazabilidad.**
6. Cada nuevo participante debe aumentar el valor del ecosistema.
7. Construimos reputación verificable, no otro currículum.

---

## 4. Los actores

Cinco actores con capacidad de escritura. **Tres de ellos no tienen cuenta** — operan solo con
un token en la URL. Esto no es un descuido: es una decisión de producto. Pedirle cuenta a un
ex-jefe al que se le solicita una referencia mataría la tasa de respuesta.

| Actor | ¿Cuenta? | Qué hace | Por qué importa |
|-------|:--------:|----------|-----------------|
| **Admin** | Sí | Crea, activa y desactiva reclutadores | Alta cerrada: coherente con operación manual controlada en marcha blanca |
| **Reclutador** | Sí | Crea procesos, agrega candidatos, consulta fichas | Único actor que consulta resultados |
| **Trabajador** | No | Solicita referencias, sube documentos, ve su estado | Es quien inicia el consentimiento. El sujeto de los datos |
| **Evaluador** | No | Responde una evaluación, una sola vez | Contacto frío. Cada fricción añadida le cuesta al embudo |
| **Validador interno** | No | Marca documentos como válidos | Es un buzón de correo, no un rol del sistema |

## 5. El ciclo de vida

Quien inicia es el **reclutador**, no el trabajador. El trabajador entra porque lo invitaron, o
porque llega por su cuenta a la página pública.

```
[0] ADMIN crea la cuenta del reclutador
      └─▶ correo con enlace para crear contraseña (24 h)

[1] RECLUTADOR entra, crea un proceso, agrega candidatos por RUT
      ├─ el RUT ya existe  → correo de recordatorio al trabajador
      └─ el RUT no existe  → correo de invitación

[2] TRABAJADOR (página pública, sin cuenta)
      ├─ declara sus evaluadores: nombre, empresa y correo
      ├─ sube certificado de cotizaciones y finiquito
      └─▶ tres correos: al evaluador, a sí mismo, al validador interno

[3] EVALUADOR (sin cuenta, enlace único, 30 días)
      └─ responde la pauta o declara que no conoce a la persona

[4] VALIDADOR INTERNO revisa los documentos y los marca

[5] RECLUTADOR consulta el resultado

[6] TRABAJADOR hace seguimiento con su propio enlace
```

## 6. Reglas del flujo que no se pueden romper

Cada una tiene su razón. Si un cambio las toca, es una decisión de producto.

### 6.1 La evaluación es confidencial respecto del evaluado

El correo al evaluador promete que el postulante no verá lo que escriba. **Esa promesa es lo
que sostiene la calidad del dato**, que es el activo del producto: sin ella, el evaluador
escribe una fórmula neutra en vez de una opinión honesta.

Cualquier cambio que exponga la evaluación al trabajador, o que ponga en contacto directo al
evaluador con el evaluado, rompe el producto — no solo una pantalla.

### 6.2 El trabajador declara a sus propios evaluadores

Nadie verifica que el correo declarado pertenezca a la empresa declarada. Es una debilidad
conocida y aceptada en esta etapa.

**Consecuencia para el copy:** "verificada" significa hoy que el dominio del correo no es de un
proveedor gratuito. Es un test de dominio, no de identidad. El manual exige distinguir siempre
lo declarado de lo verificado.

### 6.3 El consentimiento nace del trabajador

El trabajador entrega sus datos voluntariamente y autoriza el proceso. Todo acceso a esos datos
debe poder trazarse hasta ese consentimiento.

**Consecuencia:** un reclutador tiene base para consultar a los candidatos de sus propios
procesos — personas que aceptaron participar. No la tiene sobre cualquier RUT de la base.

### 6.4 La validación pública será por QR o enlace único

Decisión del manual estratégico. Una búsqueda abierta por RUT requiere revisión legal y
controles de privacidad, y no se implementa por ahora.

**Distinguir dos canales:** el reclutador autenticado (con cuenta, clave y trazabilidad) y la
validación pública por QR (sin cuenta, el control viene de que el trabajador entregó el enlace).
Son problemas distintos y no se resuelven igual.

### 6.5 El evaluador responde una sola vez

Enlace de un solo uso, con caducidad a 30 días. Una vez enviada, la evaluación no se modifica.

### 6.6 El enlace del trabajador llega solo a su correo

`token_consulta` no caduca ni se revoca. **Decisión aceptada:** el enlace llega únicamente al
correo del trabajador y él lo administra; la política de privacidad cubre la eliminación de
datos a petición. Anotado para revisión futura: eliminar todos los datos y revocar un enlace no
son la misma cosa.

---

## 7. Los siete correos

Todos salen por Resend desde `noreply@contacto.huellalaboral.cl`.

| ID | Cuándo | A quién | Para qué |
|----|--------|---------|----------|
| M-1 | El trabajador envía el formulario | Cada evaluador declarado | Solicitar la referencia |
| M-2 | Misma llamada | El trabajador | Confirmar y dar su enlace de seguimiento |
| M-3 | Si adjuntó documentos | `contacto@huellalaboral.cl` | Avisar que hay documentos por validar |
| M-4 | Se agrega un candidato que ya existe | El trabajador | Recordarle actualizar referencias |
| M-5 | Se agrega un candidato nuevo | El invitado | Invitarlo a solicitar referencias |
| M-6 | Alta de reclutador | El reclutador | Crear su contraseña |
| M-7 | Reactivación de un reclutador | El reclutador | Recrear su contraseña |

**M-1 es el correo más frágil del sistema.** Va a un contacto frío que no pidió nada, y de su
respuesta depende que exista producto. Todo lo que se le añada de fricción o de sospecha se
paga en tasa de respuesta.

## 8. Qué está deliberadamente postergado

Del manual estratégico. Estas ausencias son decisiones, no pendientes:

App móvil · IA o scoring · APIs e integraciones complejas · scraping o carga masiva ·
marketplace completo · automatizar tareas que todavía cambian · pedir credenciales de terceros.

**Filtro para nuevas ideas:** ¿reduce incertidumbre relevante? ¿aumenta el valor o la facilidad
de uso de la credencial? ¿fortalece el efecto de red? ¿puede probarse manualmente antes de
desarrollarse? ¿es necesaria para la etapa actual? ¿existe una métrica que diga si funcionó?
Si responde "no" a tres o más, se posterga.

## 9. Dónde estamos

**Etapa 0 — Marcha blanca.** Criterio de cierre: 10 procesos completos sin fallas críticas.

El trabajo de corrección de hallazgos es la casilla "Recorrer el MVP de extremo a extremo y
documentar fallas" de la ruta de 90 días. Volúmenes actuales: 2 reclutadores, 5 procesos, 2
trabajadores. Cerrar los agujeros ahora cuesta poco y la superficie de datos personales
expuesta es pequeña.
