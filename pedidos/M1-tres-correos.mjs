import fs from 'fs'
import process from 'process'

// Fuente REAL transpilado, no una copia a mano.
async function correosDe(rutaJs, conDocumentos) {
  const js = fs.readFileSync(rutaJs, 'utf8')
  let handler = null
  const correos = []

  const consulta = (tabla) => {
    const q = {
      _t: tabla,
      select() { return this }, eq() { return this }, in() { return this },
      limit() { return this }, order() { return this }, is() { return this },
      insert(filas) { this._ins = filas; return this },
      update() { return this },
      single() { return this._r() }, maybeSingle() { return this._r() },
      then(r) { return Promise.resolve(this._r()).then(r) },
      _r() {
        if (this._t === 'trabajadores') {
          // Sin fila previa: es una solicitud nueva.
          return this._ins
            ? { data: { id: 'trab-1', token_consulta: 'tc-1', token_validacion: 'tv-1' }, error: null }
            : { data: null, error: null }
        }
        if (this._t === 'empleadores_solicitados') {
          // La funcion inserta UN objeto por vuelta del bucle y llama .single()
          return { data: { ...(this._ins ?? {}), id: 'emp-1' }, error: null }
        }
        if (this._t === 'documentos') return { data: null, error: null }
        if (this._t === 'candidatos_proceso') return { data: [], error: null }
        return { data: null, error: null }
      },
    }
    return q
  }

  const ctx = {
    serve: (h) => { handler = h },
    createClient: () => ({
      from: consulta,
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    }),
    Deno: { env: { get: (k) => (k === 'ADMIN_EMAIL' ? 'admin@huellalaboral.cl' : 'x') } },
    fetch: async (url, opt) => {
      if (String(url).includes('resend')) correos.push(JSON.parse(opt.body))
      return { ok: true, json: async () => ({}) }
    },
    crypto: { randomUUID: (() => { let n = 0; return () => `uuid-${++n}` })() },
    setTimeout: (fn) => fn(),   // anula el delay(600) entre envios
    console: { log(...a){ if (process.env.RUIDO) console.log('  [fn]', ...a) }, error(...a){ console.error('  [fn:err]', ...a) } },
    atob: (s) => s, Uint8Array, URL, Response, JSON, String, Object, Array, Promise, Set, Math, Number, Boolean, Date,
  }
  const src = js.replace(/^import .*$/gm, '').replace(/^export .*$/gm, '')
  new Function(...Object.keys(ctx), src)(...Object.values(ctx))

  const req = {
    method: 'POST',
    url: 'https://x/crear-solicitud',
    headers: { get: () => null },
    json: async () => ({
      trabajador: { nombre: 'Ana Pérez', rut: '11.111.111-1', email: 'ana@ej.cl', whatsapp: '+56900000000', comuna: 'Ñuñoa' },
      // Los nombres de campo son los que lee la funcion: emp.nombre, emp.email
      empleadores: [{ nombre: 'Jefe Uno', email: 'jefe+m1@ej.cl', empresa: 'Yokono', cargo: 'Analista' }],
      certificado_base64: conDocumentos ? 'ZmFrZQ==' : null,
      finiquito_base64: conDocumentos ? 'ZmFrZQ==' : null,
      causal_salida: 'renuncia',
    }),
  }
  const res = await handler(req)
  const cuerpo = await res.text?.().catch(() => '')
  if (!correos.length) {
    // Una comprobacion que no aborta no es una comprobacion.
    throw new Error(`${rutaJs}: no se genero ningun correo. status=${res?.status ?? '?'} cuerpo=${cuerpo}`)
  }
  return correos
}

// M-3 solo sale si el trabajador sube documentos: se corre con documentos para
// que los tres correos entren en la comparacion.
const antes = await correosDe('jsAntes/antes.js', true)
const despues = await correosDe('js/fuente.js', true)

// Comprobacion que aborta: si no salen los tres, el resto no significa nada.
const ESPERADOS = ['M-1', 'M-2', 'M-3']

const nombre = (c) => c.to?.includes('contacto@huellalaboral.cl') ? 'M-3' : (c.to === 'ana@ej.cl' ? 'M-2' : 'M-1')

const salieron = despues.map(nombre)
console.log(`Correos generados:  antes ${antes.length}  ·  despues ${despues.length}`)
console.log('Cuales:', salieron.join(', '))
for (const e of ESPERADOS) if (!salieron.includes(e)) throw new Error(`Falta ${e}. Salieron: ${salieron.join(', ')}`)
if (antes.length !== despues.length) throw new Error(`Cambio el numero de correos: ${antes.length} -> ${despues.length}`)
console.log('')

let malos = 0
const cambiosPorCorreo = {}
for (let i = 0; i < Math.max(antes.length, despues.length); i++) {
  const a = antes[i], d = despues[i]
  const la = (a?.html ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  const ld = (d?.html ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  const dif = []
  for (let k = 0; k < Math.max(la.length, ld.length); k++) if (la[k] !== ld[k]) dif.push([k, la[k], ld[k]])
  const asuntoIgual = a?.subject === d?.subject
  const okDest = a?.to === d?.to && a?.from === d?.from
  console.log(`${'═'.repeat(96)}\n${nombre(d)}  ·  para ${d.to}`)
  console.log(`  asunto ${asuntoIgual ? '✅ igual' : '❌ CAMBIA'}: ${d.subject}`)
  console.log(`  from/to ${okDest ? '✅ iguales' : '❌ CAMBIAN'}   ·   lineas del cuerpo: ${la.length} → ${ld.length}`)
  cambiosPorCorreo[nombre(d)] = dif.length
  console.log(`  lineas que cambian: ${dif.length}`)
  for (const [k, x, y] of dif) console.log(`    - ${x}\n    + ${y}`)
  if (!asuntoIgual || !okDest) malos++
}

// Los enlaces de M-1 y M-2, que son lo que no puede romperse aunque cambie el texto
const enlaceDe = (m, patron) => despues.find(c => nombre(c) === m)?.html.match(patron)?.[1]
const linkM1 = enlaceDe('M-1', /href="(https:\/\/huellalaboral\.cl\/evaluar\.html\?token=[^"]+)"/)
const linkM2 = enlaceDe('M-2', /href="(https:\/\/huellalaboral\.cl\/estado\.html\?token=[^"]+)"/)
console.log('═'.repeat(96))
console.log(`Boton de M-1: ${linkM1 ?? '❌ NO ENCONTRADO'}`)
console.log(`Boton de M-2: ${linkM2 ?? '❌ NO ENCONTRADO'}`)
if (!linkM1 || !linkM2) throw new Error('Falta el enlace de M-1 o M-2')
// El resumen se calcula, no se escribe a mano: la version anterior decia
// "solo cambia la frase de M-1" pasara lo que pasara, y siguio diciendolo
// cuando el cambio ya era otro.
const resumen = ESPERADOS.map(m => `${m}: ${cambiosPorCorreo[m]} linea(s)`).join(' · ')
console.log(`\n${malos === 0 ? `✅ Salen los ${despues.length} correos y los enlaces siguen. Cambios — ${resumen}` : `❌ ${malos} correos con cambios no pedidos`}`)
