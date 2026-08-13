// UX-19 y UX-20 · comprueba que cambiar el logo no mueve la maquetacion.
//
// Renderiza los 12 HTML de origin/main y los 12 de la rama en la misma ventana
// de Chromium y compara la caja del logo al centipixel.
//
//   node pedidos/maqueta-UX-19-UX-20.mjs
//
// Mientras falten los cuatro PNG, usa un relleno de 704x192 con alfa: para la
// maquetacion lo unico que importa del archivo son sus dimensiones. En cuanto
// esten en la raiz del repo los usa a ellos y lo dice al empezar. Repetirlo
// entonces convierte la comprobacion de condicionada en real.
//
// Para ver que la comprobacion sabe fallar, generar el relleno con otro tamano:
//   python3 pedidos/stub-704x192.py            # 704x192 -> las 12 en verde
//   sed 's/704, 192/600, 192/' pedidos/stub-704x192.py | python3   # -> las 12 en rojo

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const REPO = path.dirname(new URL('.', import.meta.url).pathname.replace(/\/$/, ''))
const PAGINAS = ['index.html','login.html','crear-password.html','dashboard.html','admin.html',
  'estado.html','evaluar.html','links-afp.html','privacidad.html','terminos.html',
  'trabajador.html','validar.html']
const NUEVOS = ['logo-huella-laboral.png','logo-huella-laboral-blanco.png','favicon-32.png','apple-touch-icon.png']

// El relleno solo se usa para los que aun no existen.
const STUB = '/tmp/stub-704x192.png'
const faltan = NUEVOS.filter(n => !fs.existsSync(path.join(REPO, n)))
if (faltan.length) {
  execSync(`python3 ${path.join(REPO, 'pedidos/stub-704x192.py')}`, { cwd: '/tmp' })
  console.log(`⚠️  Faltan en el repo: ${faltan.join(', ')}`)
  console.log('   Se miden con un relleno de 704x192. El resultado vale mientras los archivos')
  console.log('   reales tengan ese tamano; si no, la caja se mueve.\n')
} else {
  console.log('✅ Los cuatro archivos estan en el repo: se miden los reales.\n')
}

// Dos arboles servidos desde disco:
//   ANTES   = los 12 HTML de origin/main, con el JPEG real
//   DESPUES = los 12 HTML de la rama
function montar(dir, ref) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  for (const p of PAGINAS) {
    const html = ref === 'main'
      ? execSync(`git show origin/main:${p}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 })
      : fs.readFileSync(path.join(REPO, p), 'utf8')
    fs.writeFileSync(path.join(dir, p), html)
  }
  fs.copyFileSync(path.join(REPO, 'Huella_Laboral.png'), path.join(dir, 'Huella_Laboral.png'))
  fs.copyFileSync(path.join(REPO, 'favicon.ico'), path.join(dir, 'favicon.ico'))
  for (const n of NUEVOS) {
    const real = path.join(REPO, n)
    fs.copyFileSync(fs.existsSync(real) ? real : STUB, path.join(dir, n))
  }
}
montar('/tmp/ux-antes', 'main')
montar('/tmp/ux-despues', 'rama')

const nav = await chromium.launch()
// Sin JS de pagina: dashboard/admin/estado redirigen al no haber sesion, y la
// maquetacion del logo es CSS pura. Asi se mide la pagina pedida, no su destino.
const medir = async (dir) => {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false })
  const out = {}
  for (const p of PAGINAS) {
    const pg = await ctx.newPage()
    const rotas = []
    await pg.route('**://*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())
    pg.on('requestfailed', r => { if (r.url().startsWith('file:')) rotas.push(r.url().split('/').pop()) })
    pg.on('response', r => { if (r.url().startsWith('file:') && r.status() >= 400) rotas.push(r.url().split('/').pop()) })
    await pg.goto('file://' + path.join(dir, p), { waitUntil: 'domcontentloaded' })
    // Archivos locales: la decodificacion es inmediata, pero se espera igual
    // para que la caja se mida sobre la imagen ya cargada y no sobre el alt.
    await pg.waitForTimeout(300)
    const img = pg.locator('img[src*="Huella_Laboral"], img[src*="logo-huella-laboral"]').first()
    const iconos = pg.locator('link[rel*="icon"]')
    const n = await iconos.count()
    out[p] = {
      logo: await img.boundingBox(),
      src: await img.getAttribute('src'),
      iconos: [],
      rotas,
    }
    for (let i = 0; i < n; i++)
      out[p].iconos.push(await iconos.nth(i).getAttribute('rel') + '|' + await iconos.nth(i).getAttribute('href'))
    await pg.close()
  }
  await ctx.close()
  return out
}

const antes = await medir('/tmp/ux-antes')
const despues = await medir('/tmp/ux-despues')
await nav.close()

const caja = c => c ? `${c.width.toFixed(2)}×${c.height.toFixed(2)} @${c.x.toFixed(0)},${c.y.toFixed(0)}` : 'SIN LOGO'
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const BLOQUE = ['icon|/favicon.ico','icon|/favicon-32.png','apple-touch-icon|/apple-touch-icon.png']

console.log('pagina              | caja del logo ANTES        | caja del logo DESPUES      | archivo destino                | ico | veredicto')
console.log('-'.repeat(140))
let malos = 0
for (const p of PAGINAS) {
  const a = antes[p], d = despues[p]
  const mismaCaja = eq(a.logo, d.logo)
  const bloqueOk = eq(d.iconos, BLOQUE) && a.iconos.length === 0
  const sinRotas = d.rotas.length === 0
  const ok = mismaCaja && bloqueOk && sinRotas
  if (!ok) malos++
  const motivo = ok ? '✅' : '❌ ' + [!mismaCaja && 'CAJA DISTINTA', !bloqueOk && 'bloque icono', !sinRotas && 'no carga: ' + d.rotas.join(',')].filter(Boolean).join(' · ')
  console.log(p.padEnd(19), '|', caja(a.logo).padEnd(26), '|', caja(d.logo).padEnd(26), '|', d.src.padEnd(30), '|', String(d.iconos.length).padEnd(3), '|', motivo)
}
console.log('\nBloque de iconos identico en las 12:',
  new Set(PAGINAS.map(p => despues[p].iconos.join(' '))).size === 1 ? '✅ un solo bloque' : '❌ hay variantes')
console.log(malos === 0
  ? '\n✅ 12/12 · misma caja al pixel, tres iconos, ningun archivo roto'
  : `\n❌ ${malos}/12 con diferencia`)
