# Huella Laboral — contexto de arranque

Herramienta de **referencias laborales verificadas**: un trabajador solicita referencias a sus
ex-jefaturas, se validan sus documentos, y un reclutador consulta el resultado.

**Está en marcha blanca, sobre producción y con datos personales reales.** No hay staging.

Volumen: 4 reclutadores reales (verificado el 11/08). El resto de los recuentos de `TECNICO.md` §6
son del 31/07 y están marcados como **no verificados** — no decidir en base a ellos sin comprobarlos.

---

## Los tres documentos, y cuándo se lee cada uno

Este archivo es el índice. El contenido vive en los otros tres.

| Documento | Cuándo se lee |
|-----------|---------------|
| **`FUNCIONAL.md`** | **Antes de cambiar cualquier cosa.** Qué hace el producto y por qué |
| **`TECNICO.md`** | Para ubicar dónde tocar. Cómo está construido |
| **`CAMBIOS.md`** | Para ver qué se hizo antes y por qué. Bitácora |

**`FUNCIONAL.md` manda.** Tiene siete principios no negociables y una sección de reglas del flujo
(§6) que no se pueden romper. **Si un cambio choca con alguna, detenerse y preguntar al dueño —
no implementar.** No es una recomendación: varias de esas reglas parecen defectos técnicos y son
decisiones de producto.

Los tres casos donde más fácil se confunde un defecto con una decisión:

- **`crear-solicitud` es pública a propósito** (`FUNCIONAL.md` §4 y §5): el trabajador no tiene
  cuenta. Cerrarla con autenticación rompe el flujo, no lo arregla.
- **El trabajador declara a sus propios evaluadores** (§6.2). Debilidad conocida y aceptada.
- **`token_consulta` no caduca ni se revoca** (§6.6). Decisión tomada, no pendiente abierto.

Antes de tocar una edge function: la tabla de `TECNICO.md` §4 dice qué valida hoy cada una de las
19 y desde dónde se la llama; `FUNCIONAL.md` §6 dice qué de eso es intencional.

## Reglas de trabajo

- **`apply_migration` prohibido.** El esquema no se toca.
- **`deploy_edge_function` requiere aprobación explícita del dueño en cada uso.** No se despliega
  por iniciativa propia, ni siquiera un cambio ya aprobado como código.
- **No hay staging.** Todo cambio va sobre producción.
- **Punto de retorno:** `backup/edge-functions/*.ts`, commit `4622d62` — copia íntegra y literal
  de las 19 funciones desplegadas, con versión y `ezbr_sha256`. **No se edita en sitio:** si el
  respaldo deja de ser copia literal de producción, revertir redesplegaría el parche. El código
  corregido va en `supabase/functions/<nombre>/index.ts`.
- **Un hallazgo por vez.** No se avanza al siguiente sin confirmación del dueño.
- **Ignorar `PLAN-EJECUCION.md`** si aparece: quedó contradictorio.

### Una rama por hallazgo, no por sesión

El nombre de la rama **lo fija el pedido, no la sesión**. Hasta ahora se creaban por sesión con
sufijo aleatorio, y como una sesión no equivale a un hallazgo, H-01 terminó repartido en dos ramas
y ninguna decía qué contenía.

- Si la rama del hallazgo ya existe, se continúa en ella aunque sea una sesión nueva. No se crea otra.
- Todos los commits del hallazgo van ahí: implementación, correcciones tras la verificación y
  cierre documental.
- Al cerrar: PR a `main`, el dueño fusiona, y la rama se borra. `main` queda con un merge por hallazgo.

**No se commitea a `main` directamente.** `main` es lo que Vercel despliega: en un hallazgo de
frontend, un commit malo sale a producción sin escala. El PR es la única barrera que queda.

### El grupo `database` del conector no se va a activar

Decisión del dueño, en firme. Ya se pidió dos veces y la respuesta fue la misma. Queda escrita
para no volver a plantearla. Consecuencias que se asumen, no se rodean:

- **Sin `execute_sql` ni `list_tables`.** Los datos de prueba se generan por el flujo real del
  producto, no por SQL. Un `INSERT` directo se saltaría las validaciones de las edge functions, y
  entonces la prueba no demostraría que el ataque es alcanzable.
- **Los siete recuentos ⚠️ de `TECNICO.md` §6 se quedan así.** No son un pendiente bloqueante.
  Cuando un hallazgo necesite un recuento concreto, se obtiene desde la consola del navegador.
- **`TECNICO.md` §6 sigue siendo cierto:** `apply_migration` está bloqueado del lado del servidor.
  Esa es la razón de la decisión y se mantiene.

## El ciclo de cada iteración

1. Leer `FUNCIONAL.md` (¿choca con un principio?) y `CAMBIOS.md` (¿ya se decidió algo de esto?).
2. Ubicar en `TECNICO.md` dónde tocar.
3. Implementar sobre el respaldo como línea base. Entregar el archivo y el diff.
4. Verificar antes de entregar: prueba A (que el fallo existía), camino feliz intacto, caminos
   hostiles rechazados, no regresión.
5. Desplegar **solo con aprobación explícita**.
6. **Actualizar la documentación antes de dar la iteración por cerrada**, no después:
   - `CAMBIOS.md` **siempre** — el cambio, la decisión, la tabla de verificación.
   - `TECNICO.md` **cuando el cambio altere lo que describe** (típicamente la tabla §4).
   - Regenerar el respaldo de esa función a la nueva versión.

Documentación desactualizada miente con autoridad. El paso 6 es parte del trabajo, no el papeleo
posterior.

**Criterio de cierre** (de `CAMBIOS.md`): código desplegado + prueba A + camino feliz intacto +
caminos hostiles rechazados + no regresión + limpieza + respaldo regenerado + visto bueno.

## Stack

| Capa | Qué es |
|------|--------|
| Frontend | 12 HTML planos, sin build, en Vercel |
| Backend | 19 edge functions en Supabase (Deno) |
| Datos | Postgres, 8 tablas en `public`, RLS activo en todas |
| Archivos | Supabase Storage: `certificados`, `finiquitos` |
| Correo | Resend, `fetch` directo a su API |
| Proyecto | `dxblzmxcmaerycvdgfpy` · repo `josuecbritos/huellalaboral` |

**Secretos:** leídos con `Deno.env.get()`, cero literales en el código. `verify_jwt: true` está
activo en las 19 funciones **y no autentica a nadie**: el `Authorization: Bearer` es la anon key,
pública por diseño. La identidad real viaja en la cabecera `x-user-token`.
