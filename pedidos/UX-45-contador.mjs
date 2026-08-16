import fs from 'fs'

// Fuente REAL transpilado.
async function respuestaDe(rutaJs, { evals, invitados }) {
  const js = fs.readFileSync(rutaJs, 'utf8')
  let handler = null
  const tabla = (n) => {
    const q = {
      select(){return this}, eq(){return this}, order(){return this},
      single(){return this._r()}, maybeSingle(){return this._r()},
      then(r){return Promise.resolve(this._r()).then(r)},
      _r(){
        if (n==='trabajadores') return { data: { id:'t1', nombre:'Ana Pérez', rut:'11.111.111-1', email:'a@e.cl', whatsapp:'', comuna:'', fecha_solicitud:null }, error:null }
        if (n==='evaluaciones') return { data: evals, error:null }
        if (n==='empleadores_solicitados') return { data: Array.from({length: invitados}, (_,i)=>({id:'e'+i})), error:null }
        if (n==='documentos') return { data: [], error:null }
        return { data: [], error:null }
      },
    }
    return q
  }
  const ctx = {
    serve:(h)=>{handler=h},
    createClient:()=>({ from: tabla, auth:{ getUser: async()=>({data:{user:{id:'u1',email:'r@e.cl'}},error:null}) } }),
    Deno:{env:{get:()=> 'x'}},
    fetch: async()=>({ok:true,json:async()=>({})}),
    console:{log(){},error(){}},
    URL, Response, JSON, String, Object, Array, Promise, Set, Math, Number, Boolean,
  }
  new Function(...Object.keys(ctx), js.replace(/^import .*$/gm,'').replace(/^export .*$/gm,''))(...Object.values(ctx))
  const res = await handler({ method:'GET', url:'https://x/obtener-candidato?rut=11.111.111-1',
    headers:{get:(h)=>h==='x-user-token'?'tok':null} })
  const cuerpo = JSON.parse(await res.text())
  if (res.status && res.status !== 200) throw new Error(`status ${res.status}: ${JSON.stringify(cuerpo)}`)
  if (!cuerpo.evaluaciones) throw new Error('la respuesta no trae `evaluaciones`: ' + JSON.stringify(cuerpo).slice(0,200))
  return cuerpo
}

// Lo que hace dashboard.html con la respuesta, copiado de las dos lineas reales.
const pinta = (data) => {
  const evaluaciones = data.evaluaciones?.total || 0
  const empleadores  = data.evaluaciones?.invitados || 0
  return `${evaluaciones} / ${empleadores}`
}
const pintaAntes = (data) => {
  const evaluaciones = data.evaluaciones?.total || 0
  const empleadores  = data.evaluaciones?.total || 0
  return `${evaluaciones} / ${empleadores}`
}

const ev = (n, rechazo=false) => Array.from({length:n}, () => ({ rechazo, verificada:false, puntualidad:4, desempeno:4, relaciones:4, confiabilidad:4, email_evaluador:'x'+Math.random() }))

const CASOS = [
  ['1 invitado, 0 respuestas — el caso observado', { evals: [],       invitados: 1 }, '0 / 1'],
  ['3 invitados, 2 respuestas',                    { evals: ev(2),    invitados: 3 }, '2 / 3'],
  ['3 invitados, 3 respuestas',                    { evals: ev(3),    invitados: 3 }, '3 / 3'],
  ['sin evaluadores',                              { evals: [],       invitados: 0 }, '0 / 0'],
  ['2 invitados, 1 respuesta y 1 rechazo',         { evals: [...ev(1), ...ev(1, true)], invitados: 2 }, '1 / 2'],
]

console.log('caso                                          | antes    | después  | esperado | veredicto')
console.log('-'.repeat(100))
let malos = 0
for (const [nombre, datos, esperado] of CASOS) {
  const a = await respuestaDe('jsAntes/antes.js', datos)
  const d = await respuestaDe('js/fuente.js', datos)
  const pa = pintaAntes(a), pd = pinta(d)
  const ok = pd === esperado
  if (!ok) malos++
  console.log(`${nombre.padEnd(45)} | ${pa.padEnd(8)} | ${pd.padEnd(8)} | ${esperado.padEnd(8)} | ${ok ? '✅' : '❌'}`)
}

// No regresion: ningun campo existente cambia de valor ni desaparece.
const a = await respuestaDe('jsAntes/antes.js', { evals: ev(2), invitados: 3 })
const d = await respuestaDe('js/fuente.js',    { evals: ev(2), invitados: 3 })
const clavesA = Object.keys(a.evaluaciones), clavesD = Object.keys(d.evaluaciones)
const perdidas = clavesA.filter(k => !clavesD.includes(k))
const nuevas = clavesD.filter(k => !clavesA.includes(k))
const cambiadas = clavesA.filter(k => k !== 'lista' && JSON.stringify(a.evaluaciones[k]) !== JSON.stringify(d.evaluaciones[k]))
const otrasSecciones = ['trabajador','promedios','documentos'].filter(k => JSON.stringify(a[k]) !== JSON.stringify(d[k]))

console.log(`\nNo regresión`)
console.log(`  claves de \`evaluaciones\` perdidas : ${perdidas.length ? '❌ ' + perdidas.join(',') : '✅ ninguna'}`)
console.log(`  claves nuevas                     : ${nuevas.join(',') || '(ninguna)'}`)
console.log(`  claves existentes con otro valor  : ${cambiadas.length ? '❌ ' + cambiadas.join(',') : '✅ ninguna'}`)
console.log(`  trabajador / promedios / documentos: ${otrasSecciones.length ? '❌ cambian: ' + otrasSecciones.join(',') : '✅ idénticos'}`)

const okNoReg = !perdidas.length && !cambiadas.length && !otrasSecciones.length && nuevas.length === 1 && nuevas[0] === 'invitados'
console.log(`\n${malos === 0 && okNoReg ? '✅ los cinco casos, y el único cambio en la respuesta es `invitados`' : '❌ hay problemas'}`)

// ─── Orden de despliegue ─────────────────────────────────────────────────────
// El HTML sale por Vercel al fusionar; la funcion se despliega aparte. Si el
// HTML llegara primero, pediria un campo que la funcion vieja no manda.
console.log('\nOrden de despliegue')
for (const [nombre, datos] of [['3 invitados, 2 respuestas', { evals: ev(2), invitados: 3 }]]) {
  const vieja = await respuestaDe('jsAntes/antes.js', datos)
  const nueva = await respuestaDe('js/fuente.js', datos)
  console.log(`  HTML nuevo + función VIEJA : ${pinta(vieja)}   ${pinta(vieja) === '2 / 0' ? '⚠️  peor que el fallo actual' : ''}`)
  console.log(`  HTML viejo + función NUEVA : ${pintaAntes(nueva)}   (el fallo de siempre, sin empeorar)`)
  console.log(`  Los dos nuevos             : ${pinta(nueva)}   ✅`)
}
