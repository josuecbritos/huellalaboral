// UX-73 · fases A, B, C y D sobre el fuente REAL de `obtener-estado`.
//
// Transpila el .ts y lo carga con los globales que Deno le da en produccion,
// con la base simulada. No toca nada real. Si lo probado no fuera el codigo que
// se va a desplegar, la prueba no valdria nada.
//
//   node pedidos/UX-73-obtener-estado.mjs
//
// La base simulada RESPETA LAS COLUMNAS PEDIDAS, como hace PostgREST: si la
// funcion pide `rechazo`, solo recibe `rechazo`. Sin eso, la fase C pasaria
// aunque el cambio no sirviera de nada.

import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ux73-'))

// Dos validas con notas y comentario, y un rechazo. Los valores son reconocibles
// a proposito: si alguno aparece en la respuesta, se ve.
const EVALUACIONES = [
  {
    id: 'ev-1', trabajador_id: 't1', token: 'tok-1', empleador_id: 'emp-1',
    nombre_evaluador: 'Jefa Uno', email_evaluador: 'jefa@ej.cl', empresa_evaluador: 'Yokono',
    rut_evaluador: '9.999.999-9', rut_empresa: '76.000.000-0', cargo: 'Analista',
    tiempo_trabajo: '2-5', desempeno: 5, puntualidad: 4, confiabilidad: 5, relaciones: 3,
    comentarios: 'COMENTARIO PRIVADO UNO', rechazo: null, verificada: true,
    fecha_completado: '2026-10-10T10:00:00Z', created_at: '2026-10-10T10:00:00Z',
  },
  {
    id: 'ev-2', trabajador_id: 't1', token: 'tok-2', empleador_id: 'emp-2',
    nombre_evaluador: 'Jefe Dos', email_evaluador: 'jefe@ej.cl', empresa_evaluador: 'Andotek',
    rut_evaluador: '8.888.888-8', rut_empresa: '77.000.000-0', cargo: 'Operario',
    tiempo_trabajo: '1-2', desempeno: 2, puntualidad: 1, confiabilidad: 2, relaciones: 2,
    comentarios: 'COMENTARIO PRIVADO DOS', rechazo: null, verificada: false,
    fecha_completado: '2026-10-11T10:00:00Z', created_at: '2026-10-11T10:00:00Z',
  },
  {
    id: 'ev-3', trabajador_id: 't1', token: 'tok-3', empleador_id: 'emp-3',
    nombre_evaluador: 'Jefa Tres', email_evaluador: 'tres@ej.cl', empresa_evaluador: 'MJB',
    rut_evaluador: '7.777.777-7', rut_empresa: '78.000.000-0', cargo: 'Jefa de turno',
    tiempo_trabajo: '0-1', desempeno: null, puntualidad: null, confiabilidad: null, relaciones: null,
    comentarios: null, rechazo: 'NO TRABAJO CONMIGO', verificada: false,
    fecha_completado: null, created_at: '2026-10-12T10:00:00Z',
  },
]

const DOCUMENTOS = [
  {
    id: 'doc-1', trabajador_id: 't1', tipo: 'certificado', storage_path: 'certificados/a.pdf',
    envio_id: 'envio-1', causal_salida: null, validado: true,
    validaciones_documentos: [{
      id: 'v-1', envio_id: 'envio-1', valido: true, razon_invalido: null,
      empleos_ultimos_5_anos: 3, tiempo_maximo_un_empleador_anos: 4,
      finiquito_valido_y_coincide: null, tipo_documento: 'certificado',
    }],
  },
  {
    id: 'doc-2', trabajador_id: 't1', tipo: 'finiquito', storage_path: 'finiquitos/b.pdf',
    envio_id: 'envio-1', causal_salida: 'renuncia', validado: true,
    validaciones_documentos: [{
      id: 'v-2', envio_id: 'envio-1', valido: true, razon_invalido: null,
      empleos_ultimos_5_anos: null, tiempo_maximo_un_empleador_anos: null,
      finiquito_valido_y_coincide: true, tipo_documento: 'finiquito',
    }],
  },
]

const TRABAJADOR = { id: 't1', nombre: 'Ana Pérez', rut: '11.111.111-1' }

// ─── Preparar los dos fuentes ────────────────────────────────────────────────
const RUTA = 'supabase/functions/obtener-estado/index.ts'
fs.writeFileSync(path.join(TMP, 'main.ts'),
  execSync(`git show origin/main:${RUTA}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 }))
fs.writeFileSync(path.join(TMP, 'rama.ts'), fs.readFileSync(path.join(REPO, RUTA), 'utf8'))
try {
  execSync(`tsc --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --outDir ${TMP}/js ${TMP}/main.ts ${TMP}/rama.ts`, { stdio: 'pipe' })
} catch { /* tsc se queja de los tipos de Deno y emite el JS igual */ }
for (const f of ['main.js', 'rama.js'])
  if (!fs.existsSync(path.join(TMP, 'js', f))) throw new Error(`no se generó ${f}`)

// Proyecta como PostgREST: devuelve solo las columnas pedidas.
function proyectar(filas, columnas) {
  const cols = columnas.split(',').map(c => c.trim())
  if (cols.includes('*')) return filas
  return filas.map(f => Object.fromEntries(cols
    .map(c => c.replace(/\(.*\)$/, ''))
    .filter(c => c in f)
    .map(c => [c, f[c]])))
}

async function respuestaDe(cual) {
  const js = fs.readFileSync(path.join(TMP, 'js', cual + '.js'), 'utf8')
  let handler = null
  const consultas = []   // qué le pidió a la base, por tabla

  const tabla = (n) => ({
    _cols: '*',
    select(c) { this._cols = c ?? '*'; consultas.push({ tabla: n, columnas: this._cols }); return this },
    eq() { return this }, limit() { return this }, order() { return this },
    then(r) { return Promise.resolve(this._r()).then(r) },
    _r() {
      if (n === 'trabajadores') return { data: proyectar([TRABAJADOR], this._cols), error: null }
      if (n === 'evaluaciones') return { data: proyectar(EVALUACIONES, this._cols), error: null }
      if (n === 'documentos') return { data: DOCUMENTOS, error: null }
      return { data: [], error: null }
    },
  })

  const ctx = {
    serve: (h) => { handler = h },
    createClient: () => ({ from: tabla }),
    Deno: { env: { get: () => 'x' } },
    console: { log() {}, error() {} },
    URL, Response, JSON, String, Object, Array, Promise, Set, Math, Number, Boolean, Date,
  }
  new Function(...Object.keys(ctx), js.replace(/^import .*$/gm, '').replace(/^export .*$/gm, ''))(...Object.values(ctx))

  const res = await handler({
    method: 'GET',
    url: 'https://x/obtener-estado?token=tc-1',
    headers: { get: () => null },
  })
  const texto = await res.text()
  const cuerpo = JSON.parse(texto)

  // Aborta: sin respuesta útil no hay nada que comprobar.
  if (res.status !== 200) throw new Error(`${cual}: la función respondió ${res.status} — ${texto}`)
  if (!cuerpo.evaluaciones || !Array.isArray(cuerpo.evaluaciones.lista))
    throw new Error(`${cual}: la respuesta no trae evaluaciones.lista. Trae: ${Object.keys(cuerpo).join(', ')}`)
  if (!cuerpo.documentos) throw new Error(`${cual}: la respuesta no trae documentos`)

  return { cuerpo, texto, consultas }
}

// Lo que hace `estado.html` en su línea 347, copiado literal.
const contarComoLaPantalla = (data) => (data.evaluaciones?.lista || []).filter(e => !e.rechazo).length

const SENSIBLES = [
  'COMENTARIO PRIVADO UNO', 'COMENTARIO PRIVADO DOS', 'NO TRABAJO CONMIGO',
  'Jefa Uno', 'jefa@ej.cl', 'Yokono', '9.999.999-9', 'tok-1', 'emp-1',
]
const marca = (ok) => ok ? '✅' : '❌'
let malos = 0

const a = await respuestaDe('main')
const c = await respuestaDe('rama')

// ─── A · el fallo existe en `main` ───────────────────────────────────────────
console.log('═'.repeat(94) + '\nA · el código de `main`: ¿llega el contenido de las evaluaciones al navegador?')
const aFiltradas = a.cuerpo.evaluaciones.lista
const aClaves = [...new Set(aFiltradas.flatMap(e => Object.keys(e)))]
const aFiltro = SENSIBLES.filter(v => a.texto.includes(v))
console.log(`  elementos en evaluaciones.lista: ${aFiltradas.length}`)
console.log(`  claves por elemento: ${aClaves.length} — ${aClaves.slice(0, 8).join(', ')}…`)
console.log(`  valores sensibles presentes en la respuesta: ${aFiltro.length} de ${SENSIBLES.length}`)
console.log(`  pide a la base: ${a.consultas.filter(q => q.tabla === 'evaluaciones').map(q => q.columnas).join(' | ')}`)
const aExpone = aFiltro.length === SENSIBLES.length && aClaves.includes('comentarios') && aClaves.includes('desempeno')
console.log(`  ${marca(aExpone)} ${aExpone ? 'EL FALLO EXISTE: notas, comentarios y datos del evaluador viajan' : 'la fase A no reproduce el fallo'}`)
if (!aExpone) { malos++; console.log('  ⛔ Si A no muestra el fallo, lo demás no demuestra nada.') }

// ─── C · la rama no devuelve nada de las evaluaciones ────────────────────────
console.log('\n' + '═'.repeat(94) + '\nC · el código de la rama: ¿queda algo?')
const cLista = c.cuerpo.evaluaciones.lista
const cClaves = [...new Set(cLista.flatMap(e => Object.keys(e)))]
const cFiltro = SENSIBLES.filter(v => c.texto.includes(v))
const cPide = c.consultas.filter(q => q.tabla === 'evaluaciones').map(q => q.columnas).join(' | ')
console.log(`  elementos en evaluaciones.lista: ${cLista.length}`)
console.log(`  claves por elemento: ${cClaves.length === 0 ? 'ninguna' : cClaves.join(', ')}`)
console.log(`  valores sensibles presentes en la respuesta: ${cFiltro.length}${cFiltro.length ? ' — ' + cFiltro.join(', ') : ''}`)
console.log(`  pide a la base: ${cPide}`)
console.log(`  evaluaciones.lista serializado: ${JSON.stringify(c.cuerpo.evaluaciones)}`)
const cLimpio = cClaves.length === 0 && cFiltro.length === 0 && cPide === 'rechazo'
const cSinRechazos = cLista.length === 2   // tampoco se dice cuántos rechazaron
console.log(`  ${marca(cLimpio)} sin ninguna clave, sin ningún valor sensible, y a la base solo le pide \`rechazo\``)
console.log(`  ${marca(cSinRechazos)} el rechazo no aparece ni como elemento: ${cLista.length} elementos, no 3`)
if (!cLimpio || !cSinRechazos) malos++

// ─── B · la pantalla sigue contando lo mismo ─────────────────────────────────
console.log('\n' + '═'.repeat(94) + '\nB · el conteo de la línea 347 de `estado.html`, sin tocar la pantalla')
const nMain = contarComoLaPantalla(a.cuerpo)
const nRama = contarComoLaPantalla(c.cuerpo)
console.log(`  con el código de main: ${nMain}     con el de la rama: ${nRama}     esperado: 2`)
const bOk = nMain === 2 && nRama === 2
console.log(`  ${marca(bOk)} ${bOk ? 'la pantalla muestra el mismo número' : 'el número cambió: la pantalla mentiría'}`)
if (!bOk) malos++

// ─── B2 · la pantalla REAL, en un navegador ─────────────────────────────────
// La línea 347 copiada aquí arriba puede quedarse vieja. Esto carga el
// `estado.html` que hay en el repo —el mismo que está en producción, porque el
// pedido prohíbe tocarlo— y le sirve la respuesta nueva.
console.log('\n' + '═'.repeat(94) + '\nB2 · `estado.html` de verdad, en Chromium, con la respuesta de cada código')
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')
const nav = await chromium.launch()

async function pintar(texto, etiqueta) {
  const pg = await (await nav.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
  const errores = []
  pg.on('pageerror', e => errores.push(String(e)))
  await pg.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: texto }))
  await pg.route('**://*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())
  await pg.goto('file://' + path.join(REPO, 'estado.html') + '?token=tc-1', { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(500)
  const r = await pg.evaluate(() => ({
    cuenta: document.getElementById('evalCount')?.textContent ?? null,
    desc: document.getElementById('evalDesc')?.textContent ?? null,
    visible: document.getElementById('evalCount')?.getBoundingClientRect().width > 0,
    cuerpo: document.body.innerText,
  }))
  await pg.context().close()
  if (r.cuenta === null) throw new Error(`${etiqueta}: no existe #evalCount. La pantalla no cargó; no hay nada que medir.`)
  if (!r.visible) throw new Error(`${etiqueta}: #evalCount está oculto. Medir un elemento invisible no comprueba nada.`)
  if (errores.length) throw new Error(`${etiqueta}: errores de JS — ${errores.join(' | ')}`)
  return r
}

const pMain = await pintar(a.texto, 'main')
const pRama = await pintar(c.texto, 'rama')
await nav.close()
console.log(`  con main: «${pMain.cuenta} ${pMain.desc}»`)
console.log(`  con rama: «${pRama.cuenta} ${pRama.desc}»`)
const fugaEnPantalla = SENSIBLES.filter(v => pRama.cuerpo.includes(v))
const b2Ok = pMain.cuenta === '2' && pRama.cuenta === '2' && pMain.desc === pRama.desc && fugaEnPantalla.length === 0
console.log(`  ${marca(b2Ok)} ${b2Ok ? 'la pantalla sin tocar muestra lo mismo con las dos respuestas' : 'la pantalla cambia de comportamiento'}`)
if (!b2Ok) malos++

// ─── D · no regresión fuera de `evaluaciones` ────────────────────────────────
console.log('\n' + '═'.repeat(94) + '\nD · todo lo demás de la respuesta, main contra la rama')
const sinEvals = (o) => { const { evaluaciones, ...resto } = o; return JSON.stringify(resto, null, 1) }
const dIgual = sinEvals(a.cuerpo) === sinEvals(c.cuerpo)
const dDocs = a.consultas.filter(q => q.tabla === 'documentos').map(q => q.columnas).join(' | ')
          === c.consultas.filter(q => q.tabla === 'documentos').map(q => q.columnas).join(' | ')
console.log(`  claves de primer nivel: main [${Object.keys(a.cuerpo)}] · rama [${Object.keys(c.cuerpo)}]`)
console.log(`  ${marca(dIgual)} trabajador y documentos, idénticos`)
console.log(`  ${marca(dDocs)} a \`documentos\` se le pide exactamente lo mismo que antes`)
if (!dIgual) {
  malos++
  console.log('  main:', sinEvals(a.cuerpo))
  console.log('  rama:', sinEvals(c.cuerpo))
}
if (!dDocs) malos++

console.log('\n' + '═'.repeat(94))
fs.rmSync(TMP, { recursive: true, force: true })
if (malos) { console.log(`❌ ${malos} comprobaciones mal. No desplegar.`); process.exit(1) }
console.log('✅ A, B, C y D en verde.')
