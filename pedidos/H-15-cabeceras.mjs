// H-15 · prueba del bloque de consola que el dueño tiene que correr.
//
// El bloque no se puede probar contra producción —desde aquí no hay salida a huellalaboral.cl, y
// las cabeceras no existen hasta que se fusione el PR—, así que se prueba contra dos servidores
// locales que sirven los 12 HTML de verdad:
//
//   A · sin ninguna cabecera   → el bloque DEBE fallar y decir que faltan las 72
//   C · con las seis de `vercel.json`, leídas del archivo → el bloque DEBE dar ✅
//
// Lo que esto comprueba no es Vercel: es que el bloque sabe fallar. Un bloque de comprobación que
// solo sabe decir OK no comprueba nada.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const BLOQUE = await readFile(path.join(REPO, 'pedidos/H-15-cabeceras-consola.js'), 'utf8')
const VERCEL = JSON.parse(await readFile(path.join(REPO, 'vercel.json'), 'utf8'))

// Las cabeceras salen de `vercel.json`, no de una copia a mano: si alguien cambia el archivo y
// no el bloque, esta prueba lo nota.
const REGLA = VERCEL.headers.find(h => h.source === '/(.*)')
if (!REGLA || !REGLA.headers?.length) {
  throw new Error('vercel.json no tiene la regla de cabeceras para /(.*)')
}
console.log(`vercel.json declara ${REGLA.headers.length} cabeceras para /(.*)`)

const TIPOS = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' }

function servidor(cabeceras) {
  const s = createServer(async (req, res) => {
    const nombre = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'
    if (nombre.includes('..')) { res.writeHead(400).end(); return }
    for (const { key, value } of cabeceras) res.setHeader(key, value)
    try {
      const cuerpo = await readFile(path.join(REPO, nombre))
      res.writeHead(200, { 'content-type': TIPOS[path.extname(nombre)] ?? 'application/octet-stream' })
      res.end(cuerpo)
    } catch {
      res.writeHead(404).end('no está')
    }
  })
  return new Promise(r => s.listen(0, '127.0.0.1', () => r({ s, puerto: s.address().port })))
}

const sinCabeceras = await servidor([])
const conCabeceras = await servidor(REGLA.headers)

const navegador = await chromium.launch()

async function correr(puerto) {
  const pagina = await navegador.newPage()
  const salida = []
  pagina.on('console', m => salida.push(`[${m.type()}] ${m.text()}`))
  await pagina.goto(`http://127.0.0.1:${puerto}/index.html`)
  let error = null
  try {
    await pagina.evaluate(BLOQUE)
    // El bloque es una IIFE async y `evaluate` no espera su promesa, así que hay que esperar a
    // que imprima su veredicto. Con tope: si no lo imprime, la fase falla.
    const t0 = Date.now()
    while (!salida.some(l => /✅ H-15 correcto|❌ H-15 NO está bien/.test(l)) && Date.now() - t0 < 15000) {
      await pagina.waitForTimeout(100)
    }
  } catch (e) {
    error = e.message
  }
  await pagina.close()
  return { salida, error }
}

let malos = 0
const marca = ok => ok ? '✅' : '❌ FALLA'

console.log('\n' + '═'.repeat(88) + '\nA · servidor SIN cabeceras: el bloque debe fallar')
const a = await correr(sinCabeceras.puerto)
const aFalla = a.salida.some(l => l.includes('❌ H-15 NO está bien'))
const aFaltan72 = a.salida.some(l => /faltan 72/.test(l))
const aNoDaOk = !a.salida.some(l => l.includes('✅ H-15 correcto'))
console.log(`  dice que falla:            ${marca(aFalla)}`)
console.log(`  cuenta las 72 que faltan:  ${marca(aFaltan72)}`)
console.log(`  no dice ✅ por error:       ${marca(aNoDaOk)}`)
if (!aFalla || !aFaltan72 || !aNoDaOk) { malos++; console.log(a.salida.join('\n')) }

console.log('\n' + '═'.repeat(88) + '\nC · servidor CON las seis de vercel.json: el bloque debe dar ✅')
const c = await correr(conCabeceras.puerto)
const cOk = c.salida.some(l => l.includes('✅ H-15 correcto'))
const c72 = c.salida.some(l => /72\/72 cabeceras correctas/.test(l))
const cSinFallo = !c.salida.some(l => l.includes('❌ H-15 NO está bien'))
console.log(`  dice ✅:                    ${marca(cOk)}`)
console.log(`  cuenta 72/72:              ${marca(c72)}`)
console.log(`  no dice ❌:                 ${marca(cSinFallo)}`)
if (!cOk || !c72 || !cSinFallo) { malos++; console.log(c.salida.join('\n')) }

await navegador.close()
sinCabeceras.s.close()
conCabeceras.s.close()

console.log('\n' + '═'.repeat(88))
if (malos) {
  console.log(`❌ ${malos} de 2 fases mal. El bloque de consola no sirve como está.`)
  process.exit(1)
}
console.log('✅ Las dos fases en verde: el bloque distingue un sitio con cabeceras de uno sin ellas.')
