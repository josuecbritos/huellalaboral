import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { execSync } from 'child_process'
import fs from 'fs'
const REPO = '/home/user/huellalaboral'

const nav = await chromium.launch()
async function medir(html, etiqueta) {
  fs.writeFileSync('/tmp/ux49.html', html)
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 800 } })
  await ctx.addInitScript(() => {
    localStorage.setItem('hl_token', 'x')
    localStorage.setItem('hl_usuario', JSON.stringify({ nombre:'R', email:'r@e.cl', empresa:'Y' }))
  })
  const pg = await ctx.newPage()
  const errores = []
  pg.on('pageerror', e => errores.push(String(e)))
  // El comodin va primero: Playwright evalua las rutas en orden inverso.
  await pg.route('**/functions/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }))
  // Proceso SIN candidatos: array vacio, que es lo que dispara el estado vacio.
  await pg.route('**/functions/v1/obtener-proceso*', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }))
  await pg.route('**://*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())
  await pg.goto('file:///tmp/ux49.html', { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(600)
  const r = await pg.evaluate(() => {
    const ths = [...document.querySelectorAll('#vista-candidatos thead th')]
    const td = document.querySelector('#tablaCandidatos td')
    if (!ths.length || !td) return null
    const anchoCabecera = ths.reduce((a, t) => a + t.getBoundingClientRect().width, 0)
    const b = td.getBoundingClientRect()
    const tabla = document.querySelector('#vista-candidatos table')
    return {
      th: ths.length, colspan: td.getAttribute('colspan'),
      // Cuantas columnas calcula el navegador de verdad
      columnas: tabla.querySelectorAll('thead th').length,
      anchoTabla: Math.round(tabla.getBoundingClientRect().width),
      ultimoTh: Math.round(ths[ths.length-1].getBoundingClientRect().right),
      derechaFila: Math.round(td.getBoundingClientRect().right),
      anchoCabecera: Math.round(anchoCabecera), anchoFila: Math.round(b.width),
      texto: td.innerText.split('\n')[0],
      cuelga: Math.round(b.right) > Math.round(ths[ths.length-1].getBoundingClientRect().right) + 1,
    }
  })
  await ctx.close()
  // Comprobacion que aborta: sin cabecera o sin fila no hay nada que medir.
  if (!r) throw new Error(`${etiqueta}: no hay cabecera o no hay fila de estado vacio. Nada que medir.`)
  if (errores.length) throw new Error(`${etiqueta}: errores JS — ${errores.join(' | ')}`)
  return r
}

const prep = (h) => h.replace('</body>', `
<script>(async () => {
  document.querySelectorAll('.vista').forEach(v => v.classList.remove('active'));
  document.getElementById('vista-candidatos').classList.add('active');
  procesos = [{ id:'p1', cargo:'Analista', descripcion:'', candidatos:0, estado:'Activo', fecha:'2026-10-12' }];
  await verCandidatos('p1');
})();</script></body>`)

for (const [ref, et] of [['origin/main','ANTES'], [null,'DESPUÉS']]) {
  const fuente = ref ? execSync(`git show ${ref}:dashboard.html`, { cwd: REPO, encoding:'utf8', maxBuffer: 1<<28 })
                     : fs.readFileSync(REPO + '/dashboard.html','utf8')
  const r = await medir(prep(fuente), et)
  console.log(`${et.padEnd(8)} th:${r.th} colspan:${r.colspan} tabla:${r.anchoTabla}px cabecera:${r.anchoCabecera}px fila:${r.anchoFila}px  últimoTh termina en ${r.ultimoTh}, la fila en ${r.derechaFila}  ${r.cuelga ? '❌ cuelga' : '✅ cuadra'}`)
}
await nav.close()
