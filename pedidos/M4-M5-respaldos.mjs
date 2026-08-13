import fs from 'fs'

// Se carga el fuente REAL transpilado, no una copia a mano: si el codigo
// desplegado difiere del que se prueba, la prueba no vale nada.
const js = fs.readFileSync('js/fuente.js', 'utf8')

const RECLUTADOR = { id: 'u1', email: 'rec@andotek.cl' }

function clienteFalso(fila_usuario, fila_proceso, trabajadorExiste) {
  const tabla = (nombre) => {
    const q = {
      _t: nombre, _sel: null,
      select(s) { this._sel = s; return this },
      eq() { return this }, in() { return this }, limit() { return this },
      single() { return this._res() }, maybeSingle() { return this._res() },
      insert() { return this }, update() { return this },
      then(r) { return Promise.resolve(this._res()).then(r) },
      _res() {
        if (nombre === 'usuarios')  return { data: fila_usuario, error: null }
        if (nombre === 'procesos')  return { data: fila_proceso, error: null }
        if (nombre === 'trabajadores') return { data: trabajadorExiste ? { id: 't1', nombre: 'Ana', rut: '11.111.111-1', email: 'ana@ej.cl' } : null, error: null }
        if (nombre === 'candidatos_proceso') return { data: null, error: null }
        return { data: [], error: null }
      },
    }
    // filtrarProcesosPropios espera un array de filas: el proceso es propio.
    if (nombre === 'procesos') {
      q.in = () => ({ eq: () => Promise.resolve({ data: [{ id: 'p1' }], error: null }) })
    }
    return q
  }
  return { from: tabla, auth: { getUser: async () => ({ data: { user: RECLUTADOR }, error: null }) } }
}

// Ejecuta el fuente real con los globales que Deno le da en produccion.
async function ejecutar({ empresa, cargo, trabajadorExiste, nombreRec }) {
  let handler = null
  const correos = []
  const ctx = {
    serve: (h) => { handler = h },
    createClient: () => clienteFalso({ nombre: nombreRec ?? 'Josué Britos', empresa }, { cargo }, trabajadorExiste),
    Deno: { env: { get: (k) => ({ SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', RESEND_API_KEY: 'x' }[k]) } },
    fetch: async (url, opt) => {
      if (String(url).includes('resend')) correos.push(JSON.parse(opt.body))
      return { ok: true, json: async () => ({}) }
    },
    console: { log() {}, error() {} },
    URL, Response, JSON, String, Object, Array, Promise, Set, Math, Number, Boolean,
  }
  const src = js.replace(/^import .*$/gm, '').replace(/^export .*$/gm, '')
  new Function(...Object.keys(ctx), src)(...Object.values(ctx))

  const req = {
    method: 'POST',
    url: 'https://x/agregar-candidato',
    headers: { get: (h) => (h === 'x-user-token' ? 'tok' : null) },
    json: async () => ({ proceso_id: 'p1', email: 'ana@ej.cl', rut: '11.111.111-1' }),
  }
  const res = await handler(req)
  return { correo: correos[0], status: res.status ?? 200 }
}

const CASOS = [
  ['ambos presentes',  { empresa: 'Andotek',  cargo: 'Operario de bodega' }],
  ['sin cargo',        { empresa: 'Andotek',  cargo: null }],
  ['sin empresa',      { empresa: null,       cargo: 'Operario de bodega' }],
  ['ninguno',          { empresa: null,       cargo: null }],
  ['cadena vacia',     { empresa: '   ',      cargo: '' }],
  ['con & y <',     { empresa: 'Fábrica & Cía <SA>', cargo: 'Jefe de "turno"' }],
]

// El nombre del reclutador no estaba en la lista a escapar del pedido, pero
// acaba en la misma frase y lo teclea un humano. Se comprueba aparte.
const hostil = await ejecutar({ empresa: 'Andotek', cargo: 'Bodega', trabajadorExiste: true,
  nombreRec: '<img src=x onerror=alert(1)>' })
console.log('\nNombre de reclutador hostil')
console.log('  asunto (texto plano, crudo a proposito):', hostil.correo.subject)
console.log('  cuerpo :', hostil.correo.html.match(/<p>(<strong>.*?)<\/p>/s)[1].trim())
console.log('  ¿queda una etiqueta viva en el HTML?',
  /<img/i.test(hostil.correo.html) ? '❌ SI' : '✅ no, escapada')

for (const correo of ['M-4', 'M-5']) {
  const existe = correo === 'M-4'
  console.log(`\n${'═'.repeat(100)}\n${correo} · ${existe ? 'trabajador ya en el sistema' : 'trabajador nuevo'}\n${'═'.repeat(100)}`)
  for (const [nombre, datos] of CASOS) {
    const { correo: c } = await ejecutar({ ...datos, trabajadorExiste: existe })
    const apertura = c.html.match(/<p>(?:Hola,<\/p>\s*<p>)?(<strong>.*?<\/p>)/s)?.[1]?.replace('</p>', '') ?? '¿?'
    console.log(`\n  ▸ ${nombre}`)
    console.log(`    asunto : ${c.subject}`)
    console.log(`    cuerpo : ${apertura.trim()}`)
  }
}
