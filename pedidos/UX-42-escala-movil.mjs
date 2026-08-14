import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { execSync } from 'child_process'
import fs from 'fs'
const REPO = '/home/user/huellalaboral'

// ANTES = evaluar.html de origin/main · DESPUES = el de la rama
fs.mkdirSync('/tmp/esc', { recursive: true })
// #formWrapper nace con display:none y lo destapa el JS al cargar la
// evaluacion. Se destapa aqui, en la copia, porque el arnes mide sin JS de
// pagina: evaluar.html redirige o se queda en blanco sin un token real.
const destapar = (html) => {
  const out = html.replace('<div id="formWrapper" style="display:none;">', '<div id="formWrapper">')
  if (out === html) throw new Error('no se encontro el display:none de #formWrapper')
  return out
}
fs.writeFileSync('/tmp/esc/antes.html', destapar(execSync('git show origin/main:evaluar.html', { cwd: REPO, encoding: 'utf8', maxBuffer: 1<<28 })))
fs.writeFileSync('/tmp/esc/despues.html', destapar(fs.readFileSync(REPO + '/evaluar.html', 'utf8')))
fs.copyFileSync(REPO + '/logo-huella-laboral.png', '/tmp/esc/logo-huella-laboral.png')

const VISTAS = [
  ['móvil 320', { width: 320, height: 700 }],
  ['móvil 360', { width: 360, height: 780 }],
  ['móvil 390', { width: 390, height: 844 }],
  ['móvil 430', { width: 430, height: 932 }],
  ['escritorio 1280', { width: 1280, height: 900 }],
]

const nav = await chromium.launch()
const medir = async (archivo, viewport) => {
  const ctx = await nav.newContext({ viewport, javaScriptEnabled: false })
  const pg = await ctx.newPage()
  await pg.route('**://*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())
  await pg.goto('file:///tmp/esc/' + archivo, { waitUntil: 'domcontentloaded' })
  // #formWrapper nace con display:none y lo muestra el JS al cargar la
  // evaluacion. Sin esto todo mide 0 y la comprobacion no comprueba nada.
  await pg.waitForTimeout(150)
  const r = await pg.evaluate(() => {
    const grupo = document.querySelector('.escala-opciones')
    const g = grupo.getBoundingClientRect()
    const cajas = [...grupo.querySelectorAll('.escala-opcion label')].map(l => {
      const b = l.getBoundingClientRect()
      const txt = l.querySelector('.escala-texto')
      return {
        w: +b.width.toFixed(2), h: +b.height.toFixed(2),
        der: +b.right.toFixed(2),
        // Lineas que ocupa la palabra: alto del span / altura de una linea
        lineas: Math.round(txt.getBoundingClientRect().height / parseFloat(getComputedStyle(txt).lineHeight)),
        palabra: txt.textContent,
        recortado: txt.scrollWidth > txt.clientWidth + 1,
      }
    })
    return { grupoDer: +g.right.toFixed(2), grupoW: +g.width.toFixed(2), cajas }
  })
  await ctx.close()
  if (!r.cajas.length || r.cajas.every(c => c.w === 0 && c.h === 0))
    throw new Error(`${archivo} @${viewport.width}px: las cajas miden 0. No hay nada que medir.`)
  if (r.cajas.length !== 5)
    throw new Error(`${archivo}: se esperaban 5 opciones, hay ${r.cajas.length}`)
  return r
}

let malos = 0
for (const [nombre, viewport] of VISTAS) {
  const a = await medir('antes.html', viewport)
  const d = await medir('despues.html', viewport)
  const esc = nombre.startsWith('escritorio')

  const fmt = (x) => {
    const alturas = new Set(x.cajas.map(c => c.h))
    const anchos = new Set(x.cajas.map(c => c.w))
    const seSale = x.cajas.some(c => c.der > x.grupoDer + 0.5)
    const multilinea = x.cajas.filter(c => c.lineas > 1).map(c => c.palabra)
    const cuadradas = x.cajas.every(c => Math.abs(c.w - c.h) < 1)
    return { alturas: [...alturas], anchos: [...anchos].map(v=>v.toFixed(1)), seSale, multilinea, cuadradas }
  }
  const A = fmt(a), D = fmt(d)

  // En escritorio no debe cambiar NADA. En movil, las cinco iguales y cuadradas.
  // A 320 px el alto del texto manda sobre `aspect-ratio` y las cajas quedan
  // iguales pero no cuadradas. Se exige cuadradas de 360 para arriba.
  const exigeCuadradas = !esc && viewport.width >= 360
  const ok = esc
    ? JSON.stringify(a.cajas) === JSON.stringify(d.cajas)
    : (D.alturas.length === 1 && D.anchos.length === 1 && !D.seSale && !D.multilinea.length
       && (!exigeCuadradas || D.cuadradas))
  if (!ok) malos++

  console.log(`\n${'═'.repeat(92)}\n${nombre}`)
  console.log(`  ANTES    alturas ${A.alturas.join('/')}  anchos ${A.anchos.join('/')}  ${A.seSale ? '❌ se sale' : 'cabe'}  ${A.multilinea.length ? '❌ 2 líneas: '+A.multilinea.join(',') : '1 línea'}  ${A.cuadradas ? 'cuadradas' : 'no cuadradas'}`)
  console.log(`  DESPUÉS  alturas ${D.alturas.join('/')}  anchos ${D.anchos.join('/')}  ${D.seSale ? '❌ se sale' : 'cabe'}  ${D.multilinea.length ? '❌ 2 líneas: '+D.multilinea.join(',') : '1 línea'}  ${D.cuadradas ? '✅ cuadradas' : '❌ no cuadradas'}`)
  console.log(`  ${esc ? (ok ? '✅ escritorio idéntico al centipíxel' : '❌ EL ESCRITORIO CAMBIÓ') : (ok ? '✅' : '❌')}`)
}
await nav.close()
console.log(`\n${malos === 0 ? '✅ móvil arreglado y escritorio intacto' : `❌ ${malos} vistas con problemas`}`)
