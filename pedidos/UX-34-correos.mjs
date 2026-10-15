// UX-34 · fases A, B, C y D sobre el fuente REAL de `crear-solicitud`.
//
// No envia nada. Transpila el .ts, lo carga con los globales que Deno le da en
// produccion y captura lo que la funcion le habria mandado a Resend. Si lo
// probado no fuera el codigo desplegado, la prueba no valdria nada.
//
//   node pedidos/UX-34-correos.mjs
//
// Compara el codigo de `main` contra el de la rama. Aborta si no salen los tres
// correos: una comprobacion sobre la nada no comprueba nada.

import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

// pedidos/ cuelga de la raiz del repo: se sube un nivel desde este archivo.
const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ux34-'))

const NOMBRE_HOSTIL = 'Prueba <b>UX34</b> <a href="https://example.com">enlace inyectado</a>'
const RUT_HOSTIL = '11.111.111-1"><b>x</b>'
const NOMBRE_ACENTOS = 'José Ñúñez Prueba'

// ─── Preparar los dos fuentes ────────────────────────────────────────────────
fs.writeFileSync(path.join(TMP, 'main.ts'), execSync('git show origin/main:supabase/functions/crear-solicitud/index.ts', { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 }))
fs.writeFileSync(path.join(TMP, 'rama.ts'), fs.readFileSync(path.join(REPO, 'supabase/functions/crear-solicitud/index.ts'), 'utf8'))
try {
  execSync(`tsc --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --outDir ${TMP}/js ${TMP}/main.ts ${TMP}/rama.ts`, { stdio: 'pipe' })
} catch { /* tsc se queja de los tipos de Deno y emite el JS igual */ }
for (const f of ['main.js', 'rama.js'])
  if (!fs.existsSync(path.join(TMP, 'js', f))) throw new Error(`no se genero ${f}`)

// ─── Ejecutar la funcion con la base y Resend simulados ──────────────────────
async function correosDe(cual, { nombre, rut }) {
  const js = fs.readFileSync(path.join(TMP, 'js', cual + '.js'), 'utf8')
  let handler = null
  const correos = []

  const tabla = (n) => {
    const q = {
      select(){return this}, eq(){return this}, is(){return this}, limit(){return this},
      order(){return this}, update(){return this},
      insert(filas){ this._ins = filas; return this },
      single(){return this._r()}, maybeSingle(){return this._r()},
      then(r){ return Promise.resolve(this._r()).then(r) },
      _r(){
        // Trabajador nuevo: la primera consulta no lo encuentra y el insert lo crea.
        if (n === 'trabajadores') return this._ins
          ? { data: { id:'t1', token_consulta:'tc-1', token_validacion:'tv-1' }, error:null }
          : { data: null, error: null }
        // `empleadores_solicitados` inserta UN objeto por vuelta y llama .single()
        if (n === 'empleadores_solicitados') return { data: { ...(this._ins ?? {}), id:'emp-1' }, error:null }
        if (n === 'documentos') return { data: null, error: null }
        return { data: [], error: null }
      },
    }
    return q
  }

  const ctx = {
    serve: (h) => { handler = h },
    createClient: () => ({
      from: tabla,
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    }),
    Deno: { env: { get: () => 'x' } },
    fetch: async (url, opt) => {
      if (String(url).includes('resend')) correos.push(JSON.parse(opt.body))
      return { ok: true, json: async () => ({}) }
    },
    crypto: { randomUUID: (() => { let n = 0; return () => `uuid-${++n}` })() },
    setTimeout: (fn) => fn(),   // anula el delay(600) entre envios
    console: { log(){}, error(){} },
    atob: (s) => s, Uint8Array, URL, Response, JSON, String, Object, Array,
    Promise, Set, Math, Number, Boolean, Date,
  }
  new Function(...Object.keys(ctx), js.replace(/^import .*$/gm, '').replace(/^export .*$/gm, ''))(...Object.values(ctx))

  await handler({
    method: 'POST', url: 'https://x/crear-solicitud',
    headers: { get: () => null },
    json: async () => ({
      trabajador: { nombre, rut, email:'trabajador@ej.cl', whatsapp:'+56900000000', comuna:'Ñuñoa' },
      empleadores: [{ nombre:'Jefe Uno', email:'jefe@ej.cl', empresa:'Yokono', cargo:'Analista' }],
      // Con documentos para que salga tambien M-3, que solo se envia si los hay.
      certificado_base64: 'ZmFrZQ==', finiquito_base64: 'ZmFrZQ==', causal_salida: 'renuncia',
    }),
  })

  const nombreDe = (c) => c.to === 'contacto@huellalaboral.cl' ? 'M-3'
    : (c.to === 'trabajador@ej.cl' ? 'M-2' : 'M-1')
  const porNombre = {}
  for (const c of correos) porNombre[nombreDe(c)] = c
  for (const m of ['M-1','M-2','M-3'])
    if (!porNombre[m]) throw new Error(`${cual}: falta ${m}. Salieron: ${correos.map(nombreDe).join(', ') || 'ninguno'}`)
  return porNombre
}

const ETIQUETAS_VIVAS = /<b>UX34<\/b>|<a href="https:\/\/example\.com">/
const marca = (ok) => ok ? '✅' : '❌'
let malos = 0

// ─── A · el fallo existe en `main` ───────────────────────────────────────────
console.log('\n' + '═'.repeat(94) + '\nA · El de `main`, con nombre y RUT hostiles')
const a = await correosDe('main', { nombre: NOMBRE_HOSTIL, rut: RUT_HOSTIL })
for (const m of ['M-1','M-2','M-3']) {
  const vivas = ETIQUETAS_VIVAS.test(a[m].html)
  if (!vivas) malos++
  console.log(`  ${m}  etiquetas sin neutralizar en el HTML: ${marca(vivas)} ${vivas ? 'SI — el fallo existe' : 'no, y eso invalida la fase'}`)
}
const rutVivoA = a['M-3'].html.includes('"><b>x</b>')
console.log(`  M-3 el RUT rompe el atributo: ${marca(rutVivoA)} ${rutVivoA ? 'SI' : 'no'}`)
if (!rutVivoA) malos++
if (malos) { console.log('\n❌ La fase A no muestra el fallo. Detenerse y avisar.'); process.exit(1) }

// ─── C · la rama lo neutraliza ───────────────────────────────────────────────
console.log('\n' + '═'.repeat(94) + '\nC · El de la rama, mismos valores hostiles')
const c = await correosDe('rama', { nombre: NOMBRE_HOSTIL, rut: RUT_HOSTIL })
for (const m of ['M-1','M-2','M-3']) {
  const vivas = ETIQUETAS_VIVAS.test(c[m].html)
  const neutra = c[m].html.includes('&lt;b&gt;UX34&lt;/b&gt;')
  const ok = !vivas && neutra
  if (!ok) malos++
  console.log(`  ${m}  sin etiquetas vivas: ${marca(!vivas)}   neutralizadas (&lt;b&gt;…): ${marca(neutra)}`)
}
const rutNeutro = c['M-3'].html.includes('&quot;&gt;&lt;b&gt;x&lt;/b&gt;') && !c['M-3'].html.includes('"><b>x</b>')
console.log(`  M-3 el RUT ya no rompe el atributo: ${marca(rutNeutro)}`)
if (!rutNeutro) malos++

// ─── B · camino feliz: tildes y enes intactas ────────────────────────────────
console.log('\n' + '═'.repeat(94) + `\nB · El de la rama, con «${NOMBRE_ACENTOS}»`)
const b = await correosDe('rama', { nombre: NOMBRE_ACENTOS, rut: '11.111.111-1' })
for (const m of ['M-1','M-2','M-3']) {
  const literal = b[m].html.includes(NOMBRE_ACENTOS)
  const entidades = /&(amp|lt|gt|quot|#39);/.test(b[m].html.match(/<strong>[^<]*<\/strong>/g)?.join('') ?? '')
  const ok = literal && !entidades
  if (!ok) malos++
  console.log(`  ${m}  nombre literal con tildes y eñes: ${marca(literal)}   sin entidades: ${marca(!entidades)}`)
}
const asuntoIgual = b['M-1'].subject === `${NOMBRE_ACENTOS} te solicita una referencia laboral`
console.log(`  M-1 el asunto sigue en texto plano, sin escapar: ${marca(asuntoIgual)} ${JSON.stringify(b['M-1'].subject)}`)
if (!asuntoIgual) malos++

// ─── D · no regresion: solo cambian los cuatro valores ───────────────────────
console.log('\n' + '═'.repeat(94) + '\nD · `main` contra la rama, con un nombre inocuo')
const dMain = await correosDe('main', { nombre: 'Ana Pérez', rut: '11.111.111-1' })
const dRama = await correosDe('rama', { nombre: 'Ana Pérez', rut: '11.111.111-1' })
for (const m of ['M-1','M-2','M-3']) {
  const la = dMain[m].html.split('\n').map(s => s.trim()).filter(Boolean)
  const lb = dRama[m].html.split('\n').map(s => s.trim()).filter(Boolean)
  const dif = []
  for (let k = 0; k < Math.max(la.length, lb.length); k++) if (la[k] !== lb[k]) dif.push(k)
  const metaIgual = dMain[m].subject === dRama[m].subject && dMain[m].to === dRama[m].to && dMain[m].from === dRama[m].from
  const ok = dif.length === 0 && metaIgual
  if (!ok) malos++
  console.log(`  ${m}  lineas ${la.length} → ${lb.length}   que cambian: ${dif.length}   asunto/from/to iguales: ${marca(metaIgual)}  ${marca(ok)}`)
}
// Los enlaces y botones, que son lo que no puede romperse
const enlaces = [
  ['M-1', /href="(https:\/\/huellalaboral\.cl\/evaluar\.html\?token=[^"]+)"/],
  ['M-2', /href="(https:\/\/huellalaboral\.cl\/estado\.html\?token=[^"]+)"/],
  ['M-3', /href="(https:\/\/huellalaboral\.cl\/validar\.html\?token=[^"]+)"/],
]
for (const [m, re] of enlaces) {
  const ok = re.test(dRama[m].html) && dMain[m].html.match(re)?.[1] === dRama[m].html.match(re)?.[1]
  if (!ok) malos++
  console.log(`  ${m}  enlace intacto: ${marca(ok)} ${dRama[m].html.match(re)?.[1] ?? 'NO ENCONTRADO'}`)
}

console.log('\n' + (malos === 0
  ? '✅ A, B, C y D en verde. El fallo existía, queda neutralizado, los acentos sobreviven y nada más cambió.'
  : `❌ ${malos} comprobaciones fallidas`))
process.exit(malos === 0 ? 0 : 1)
