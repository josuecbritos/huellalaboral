import fs from 'fs'
const CASOS = [['M-4', true], ['M-5', false]]

async function correoDe(rutaJs, existe) {
  const js = fs.readFileSync(rutaJs, 'utf8')
  let handler = null; const correos = []
  const cli = () => {
    const t = (n) => {
      const q = { select(){return this}, eq(){return this}, limit(){return this},
        single(){return this._r()}, maybeSingle(){return this._r()},
        insert(){return this}, update(){return this},
        then(r){return Promise.resolve(this._r()).then(r)},
        _r(){ if(n==='usuarios') return {data:{nombre:'Josué Britos',empresa:'Andotek'},error:null}
              if(n==='procesos') return {data:{cargo:'Operario de bodega'},error:null}
              if(n==='trabajadores') return {data: existe?{id:'t1',nombre:'Ana',rut:'11.111.111-1',email:'ana@ej.cl'}:null,error:null}
              if(n==='candidatos_proceso') return {data:null,error:null}
              return {data:[],error:null} } }
      if (n==='procesos') q.in = () => ({ eq: () => Promise.resolve({data:[{id:'p1'}],error:null}) })
      return q }
    return { from:t, auth:{ getUser: async()=>({data:{user:{id:'u1',email:'rec@andotek.cl'}},error:null}) } }
  }
  const ctx = { serve:(h)=>{handler=h}, createClient:cli,
    Deno:{env:{get:()=> 'x'}},
    fetch: async(u,o)=>{ if(String(u).includes('resend')) correos.push(JSON.parse(o.body)); return {ok:true,json:async()=>({})} },
    console:{log(){},error(){}}, URL, Response, JSON, String, Object, Array, Promise, Set, Math, Number, Boolean }
  new Function(...Object.keys(ctx), js.replace(/^import .*$/gm,'').replace(/^export .*$/gm,''))(...Object.values(ctx))
  const res = await handler({ method:'POST', url:'https://x/f',
    headers:{get:(h)=>h==='x-user-token'?'tok':null},
    json: async()=>({proceso_id:'p1',email:'ana@ej.cl',rut:'11.111.111-1'}) })
  return { correo: correos[0], cuerpo: JSON.parse(await res.text?.() ?? '{}') }
}

for (const [nombre, existe] of CASOS) {
  const a = await correoDe('jsAntes/antes.js', existe)
  const d = await correoDe('js/fuente.js', existe)
  const lineasA = a.correo.html.split('\n').map(s=>s.trim()).filter(Boolean)
  const lineasD = d.correo.html.split('\n').map(s=>s.trim()).filter(Boolean)
  const distintas = []
  const max = Math.max(lineasA.length, lineasD.length)
  for (let i=0;i<max;i++) if (lineasA[i] !== lineasD[i]) distintas.push([i, lineasA[i], lineasD[i]])
  console.log(`\n${'═'.repeat(96)}\n${nombre}  ·  lineas del cuerpo: antes ${lineasA.length}, despues ${lineasD.length}`)
  console.log(`from  ${a.correo.from === d.correo.from ? '✅ igual' : '❌ CAMBIO'}   to  ${a.correo.to === d.correo.to ? '✅ igual' : '❌ CAMBIO'}`)
  console.log(`asunto antes   : ${a.correo.subject}`)
  console.log(`asunto despues : ${d.correo.subject}`)
  console.log(`\nlineas del HTML que cambian: ${distintas.length}`)
  for (const [i, x, y] of distintas) { console.log(`  linea ${i}:\n    - ${x}\n    + ${y}`) }
  const boton = d.correo.html.includes('https://huellalaboral.cl/trabajador.html')
  console.log(`\nboton a trabajador.html: ${boton ? '✅ intacto' : '❌ PERDIDO'}`)
}
