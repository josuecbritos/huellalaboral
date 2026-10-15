// UX-49 · prueba del bloque de consola corregido.
//
// El primero que mandé usaba `document.querySelector('table')`, que en `dashboard.html` es la
// tabla de PROCESOS —6 `th`, y oculta mientras se ve un proceso, de ahí los anchos 0—, no la de
// candidatos. El bloque corregido se ancla a `#tablaCandidatos`.
//
// Dos fases, y la segunda es la que importa:
//   A · con el colspan a 8, como estaba antes del Paso 0 → el bloque DEBE decir ❌
//   C · con el archivo tal como está en `main`            → el bloque DEBE decir ✅
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import fs from 'fs'
import path from 'path'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const BLOQUE = fs.readFileSync(path.join(REPO, 'pedidos/UX-49-consola.js'), 'utf8')
const DASHBOARD = fs.readFileSync(path.join(REPO, 'dashboard.html'), 'utf8')

// Abre la vista de candidatos de un proceso sin candidatos, que es lo que dispara el estado vacío.
const prep = (h) => h.replace('</body>', `
<script>(async () => {
  document.querySelectorAll('.vista').forEach(v => v.classList.remove('active'));
  document.getElementById('vista-candidatos').classList.add('active');
  procesos = [{ id:'p1', cargo:'Analista', descripcion:'', candidatos:0, estado:'Activo', fecha:'2026-10-12' }];
  await verCandidatos('p1');
})();</script></body>`)

const nav = await chromium.launch()

async function correr(html, etiqueta) {
  const archivo = `/tmp/ux49-consola-${etiqueta}.html`
  fs.writeFileSync(archivo, prep(html))
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 800 } })
  await ctx.addInitScript(() => {
    localStorage.setItem('hl_token', 'x')
    localStorage.setItem('hl_usuario', JSON.stringify({ nombre:'R', email:'r@e.cl', empresa:'Y' }))
  })
  const pg = await ctx.newPage()
  const salida = []
  pg.on('console', m => salida.push(m.text()))
  pg.on('pageerror', e => salida.push('PAGEERROR ' + e))
  // El comodín va primero: Playwright evalúa las rutas en orden inverso.
  await pg.route('**/functions/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }))
  await pg.route('**/functions/v1/obtener-proceso*', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }))
  await pg.route('**://*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())
  await pg.goto('file://' + archivo, { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(600)
  let lanzo = null
  try { await pg.evaluate(BLOQUE) } catch (e) { lanzo = e.message }
  await ctx.close()
  return { salida, lanzo }
}

let malos = 0
const marca = ok => ok ? '✅' : '❌ FALLA'

// ── A · el estado anterior al Paso 0 ───────────────────────────────────────────────────────────
const roto = DASHBOARD.replace('<tr><td colspan="7"><div class="empty-state"><div class="empty-state-title">Sin candidatos',
                               '<tr><td colspan="8"><div class="empty-state"><div class="empty-state-title">Sin candidatos')
if (roto === DASHBOARD) throw new Error('No encontré la fila del estado vacío para romperla. La prueba A no probaría nada.')

console.log('═'.repeat(88) + '\nA · con colspan="8", como antes del Paso 0: el bloque debe decir ❌')
const a = await correr(roto, 'A')
const aFalla = a.salida.some(l => l.includes('❌ UX-49')) && !a.salida.some(l => l.includes('✅ UX-49'))
const aDice8 = a.salida.some(l => /colspan 8/.test(l))
console.log(`  dice ❌ y no ✅:            ${marca(aFalla)}`)
console.log(`  nombra el colspan 8:       ${marca(aDice8)}`)
if (!aFalla || !aDice8) { malos++; console.log(a.salida.join('\n')) }

// ── C · lo que hay en main ─────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(88) + '\nC · dashboard.html tal como está: el bloque debe decir ✅')
const c = await correr(DASHBOARD, 'C')
const cOk = c.salida.some(l => l.includes('✅ UX-49')) && !c.salida.some(l => l.includes('❌ UX-49'))
const cSiete = c.salida.some(l => /7 th.*colspan 7/.test(l))
const cSinError = !c.salida.some(l => l.startsWith('PAGEERROR')) && !c.lanzo
console.log(`  dice ✅ y no ❌:            ${marca(cOk)}`)
console.log(`  cuenta 7 th y colspan 7:   ${marca(cSiete)}`)
console.log(`  sin errores de JS:         ${marca(cSinError)}`)
if (!cOk || !cSiete || !cSinError) { malos++; console.log(c.salida.join('\n'), c.lanzo ?? '') }

await nav.close()
console.log('\n' + '═'.repeat(88))
if (malos) { console.log(`❌ ${malos} de 2 fases mal.`); process.exit(1) }
console.log('✅ Las dos fases en verde: el bloque mide la tabla de candidatos y sabe fallar.')
