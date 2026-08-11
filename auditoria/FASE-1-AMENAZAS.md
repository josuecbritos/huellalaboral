# Fase 1 — Modelo de amenazas

Ajustado al flujo real reconstruido en Fase 0. La tabla de `AUDITORIA.md` §4 era el punto de partida; esto es el cierre.

---

## 1. Qué cambia respecto a la tabla de partida

Fase 0 obliga a tres correcciones de encuadre:

1. **El actor con más poder no autenticado no es el evaluador: es cualquiera.** `crear-reclutador`, `crear-solicitud`, `obtener-validacion` y `validar-documentos` no leen `x-user-token`. La frontera del sistema no está en el login.
2. **T-5 (RLS permisiva) resulta ser la amenaza mejor cubierta**, no la peor. Ver Fase 2 §3. La puerta paralela está cerrada; las puertas principales, no.
3. **Falta una amenaza en la lista original: T-7, XSS almacenado.** El texto libre de las evaluaciones lo escribe un tercero no autenticado y se pinta con `innerHTML` en la sesión del reclutador. `AUDITORIA.md` §5.7 lo trata como ítem de frontend; con el flujo real a la vista es una cadena de compromiso completa y merece rango propio.

---

## 2. Tabla de amenazas cerrada

| ID | Amenaza | Estado tras Fase 2 | Hallazgos |
|----|---------|--------------------|-----------|
| **T-1** | Referencia falsificada | **Materializada por dos vías independientes** | H-02, H-03, H-09 |
| **T-2** | Enumeración de tokens/IDs | **Parcialmente materializada**: los UUID de evaluación son sólidos, pero `trabajador_id` se usa como credencial y se entrega a llamantes anónimos | H-02, H-03 |
| **T-3** | IDOR / acceso a historial ajeno | **Materializada**, tres funciones | H-02, H-04, H-05 |
| **T-4** | Escalada a admin | **Materializada**, pero no por donde apuntaba el playbook | H-01 |
| **T-5** | RLS ausente o permisiva | **No materializada.** RLS cierra por defecto en las 5 tablas sensibles | H-13 (fragilidad, no fuga) |
| **T-6** | Abuso de invitaciones | **Materializada y agravada** por el manejo de errores de Resend | H-06 |
| **T-7** | **XSS almacenado → robo de sesión** (nueva) | **Materializada** | H-07 |

---

## 3. T-1 en detalle — el diseño y sus controles

Tu instrucción (punto 3) es explícita: que el trabajador declare a sus evaluadores es el diseño correcto y no se cuestiona. Lo que sigue analiza **qué lo protege hoy y qué podría protegerlo sin tocar ese flujo**.

### 3.1 Qué protege el diseño hoy

| Control | Qué consigue | Límite real |
|---------|--------------|-------------|
| Token de evaluación `crypto.randomUUID()` | 122 bits de entropía criptográfica. Inadivinable | Solo protege contra adivinar. No dice nada de quién lo usa |
| Un solo uso (`completado`) | No se puede reescribir una evaluación | Se comprueba en `obtener-evaluacion` **y** en `guardar-evaluacion`: bien hecho |
| Expiración a 30 días | Acota la ventana | Se comprueba en `obtener-evaluacion` pero **no** en `guardar-evaluacion` (H-09) |
| La evaluación no es visible para el evaluado | Quita el incentivo a presionar al evaluador | Real y bien pensado. El correo lo dice explícitamente |
| Test de dominio → `verificada` | Separa correo corporativo de gratuito | Ver §3.2 |
| Traza en `evaluaciones` | Guarda nombre, RUT, email, empresa y fecha | Sin IP, sin user-agent, sin distinción entre lo declarado y lo verificado |

El control más fuerte no es criptográfico: es **que el evaluado no ve el resultado**. Elimina la coacción posterior, que es el vector más común en referencias laborales. Está bien visto y conviene no perderlo en ningún rediseño.

### 3.2 Qué protege exactamente el test de dominio, y qué no

Punto 2 de tus instrucciones: no es hallazgo de seguridad, va al backlog. Pero de esto depende la palabra "verificada", así que conviene que quede sin ambigüedad.

```js
const verificada = rechazo ? false : emailEvaluador?.includes('@') &&
                  !emailEvaluador.match(/@(gmail|hotmail|yahoo|outlook|live|icloud)\./i)
```

**Lo que sí consigue:** filtra al usuario que pone `sujefe@gmail.com` como referencia. Es un filtro de fricción — el 90 % de la falsificación oportunista y perezosa cae aquí, y cuesta cero. Para un MVP es una decisión defendible.

**Lo que no consigue, enumerado sin adornos:**

1. **No verifica identidad.** Nadie comprueba que quien abre el enlace sea la persona nombrada.
2. **No verifica pertenencia a la empresa.** No se contrasta `rut_empresa` contra ningún registro.
3. **Un dominio propio cuesta unos pocos dólares.** `mi-antigua-empresa.cl` registrado esta mañana pasa el test y sale marcado como ✓ VERIFICADA.
4. **La lista de dominios es incompleta**: `proton.me`, `zoho.com`, `yandex.com`, `gmx.com`, `mail.com` y cualquier proveedor gratuito fuera de esos seis pasan como corporativos.
5. **La regex exige punto tras el dominio.** `@gmail.cl`, `@outlook.es` — sí coinciden porque el patrón lleva `\.`; pero un `@gmail` sin TLD no. Es un detalle menor frente a los puntos 3 y 4.
6. **El evaluador puede sobrescribir sus propios datos.** `guardar-evaluacion` acepta `evaluador.nombre`, `.rut`, `.empresa`, `.rut_empresa` del formulario y los guarda por encima de lo que declaró el trabajador. El único campo que **no** se puede alterar es `email_evaluador`, que se toma de `empleadores_solicitados`. Es la decisión correcta — el email es el ancla — pero significa que el resto de la ficha del evaluador es autodeclarada.

**Redacción honesta de lo que hoy significa el sello:** *"la respuesta llegó a través de un enlace privado enviado a una dirección de correo de dominio no gratuito"*. Eso es verdad y es defendible. Lo que no se sostiene si alguien pregunta en detalle es *"verificamos que esta persona fue su jefe"*.

### 3.3 Controles compensatorios posibles sin romper el flujo

Ordenados por relación coste/beneficio. Ninguno exige que el trabajador deje de elegir a sus evaluadores.

| # | Control | Qué añade | Esfuerzo |
|---|---------|-----------|----------|
| C-1 | **Registrar IP y user-agent** en `evaluaciones` | Detecta que trabajador y evaluador enviaron desde la misma IP — la señal más barata contra el cómplice y el autoevaluado | **S** |
| C-2 | **Cotejar el dominio del evaluador con el de la empresa declarada** | Convierte "dominio no gratuito" en "dominio coherente con la empresa" | S |
| C-3 | **Marcar dominios registrados hace poco** (edad del dominio por WHOIS/RDAP) | Ataca directamente el punto 3 de §3.2 | M |
| C-4 | **Graduar el sello en vez de un booleano**: `autodeclarada` / `dominio corporativo` / `dominio coherente` / `identidad verificada` | El reclutador ve la fuerza real de cada referencia. Hoy `verificada` es sí/no y promete de más | M |
| C-5 | **Cotejar contra el certificado de cotizaciones**, que ya se sube y ya se valida: si la empresa del evaluador no aparece en el historial previsional, es señal fuerte | Aprovecha un dato que el sistema ya tiene y nadie cruza. Es el control con mejor relación coste/valor del conjunto | M |
| C-6 | **Ampliar la lista de proveedores gratuitos** y mantenerla | Tapa el punto 4. Es una tarde de trabajo | S |
| C-7 | **Verificación por segundo canal** (SMS, LinkedIn) para referencias de alto valor | El salto real de garantía | L |

**C-5 merece destacarse.** El sistema ya pide el certificado de cotizaciones, ya lo valida un humano y ya extrae `empleos_ultimos_5_anos`. Ese documento es la fuente de verdad previsional de con quién trabajó realmente la persona. Cruzar el empleador declarado contra ese historial es la única verificación del conjunto que no depende de la buena fe de nadie, y la infraestructura ya está montada.

---

## 4. T-4 — la escalada no llega por donde el playbook suponía

`AUDITORIA.md` §5.7 apuntaba a `admin.html:520`, que decide desde `localStorage`. **Esa vía está cerrada**: las tres funciones de admin (`listar-usuarios`, `gestionar-usuario`, `obtener-stats`) revalidan `authUser.email` contra `ADMIN_EMAIL`. Manipular `hl_usuario.rol` en el navegador solo pinta la interfaz; las llamadas fallan con 403.

La escalada real es **H-01**: `crear-reclutador` no comprueba nada, así que no hace falta ser admin para usar la función más sensible del panel de admin. No se escala a admin: se rodea el admin y se entra como reclutador, que es todo lo que hace falta para llegar a los datos.

---

## 5. T-2 — dos clases de token con seguridad opuesta

| Token | Origen | Entropía | Expira | Un uso | Veredicto |
|-------|--------|----------|--------|--------|-----------|
| `empleadores_solicitados.token` | `crypto.randomUUID()` | 122 bits | 30 días | Sí | **Correcto** |
| `trabajadores.token_consulta` | `gen_random_uuid()` (default de columna) | 122 bits | **Nunca** | No | Aceptable con reservas |
| "Token" de validación | **Es `trabajadores.id`** | 122 bits pero **no es un secreto** | — | — | **Roto por diseño** |

El tercero no es un problema de entropía: es que **un identificador no es una credencial**. `trabajadores.id` viaja en respuestas de API, se usa como clave foránea y `crear-solicitud` se lo devuelve a un llamante anónimo. Que sea un UUID impredecible no importa cuando el sistema lo reparte.

`token_consulta` no expira nunca y da acceso permanente al historial completo del trabajador. Va en un correo, que se reenvía, se filtra y sobrevive a cambios de trabajo. Sin caducidad ni revocación, es una llave para siempre.

---

## 6. T-6 — reclasificada al alza

Tu punto 6, incorporado. La amenaza original decía "spam y coste". El análisis de Fase 2 la convierte en algo peor: **denegación de servicio silenciosa y provocable por cualquiera**. Detalle completo en H-06.

---

## 7. T-7 — amenaza nueva

**XSS almacenado con robo de sesión.** El evaluador escribe texto libre sin autenticarse; `guardar-evaluacion` lo guarda sin sanear; `dashboard.html:1561` lo interpola crudo en `innerHTML`; `hl_token` vive en `localStorage`, accesible desde JavaScript. La cadena está completa y cada eslabón está verificado. H-07.
