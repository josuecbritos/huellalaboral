import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { execSync } from 'child_process'
import fs from 'fs'
import process from 'process'
const REPO = '/home/user/huellalaboral'

// Los cinco casos del archivo de referencia, tal cual, mas la invitacion.
const CANDIDATOS = [
  { rut:'28.817.889-5', nombre:'Yajeisy del Carmen Farías Cortez', caso:'solo finiquito · el que motiva el pedido',
    doc:{ cert_estado:'sin_documento', finiq_estado:'pendiente_validacion' }, evals:0, invitados:1 },
  { rut:'19.207.968-3', nombre:'Mónica Alexandra González Ruíz', caso:'solo certificado',
    doc:{ cert_estado:'pendiente_validacion', finiq_estado:'sin_documento' }, evals:0, invitados:1 },
  { rut:'13.435.655-3', nombre:'Felipe Claps', caso:'todo validado',
    doc:{ cert_estado:'validado', finiq_estado:'validado', cert_empleos:3, cert_permanencia:5, causal_texto:'renuncia' }, evals:2, invitados:3 },
  { rut:'11.111.111-1', nombre:'Caso no válido', caso:'ambos rechazados',
    doc:{ cert_estado:'no_valido', finiq_estado:'no_valido', cert_razon_invalido:'El certificado está ilegible en la segunda página y no se distinguen las fechas de cotización' }, evals:0, invitados:1 },
  { rut:'20.000.000-0', nombre:'Sin documentos', caso:'no subió ninguno',
    doc:{ cert_estado:'sin_documento', finiq_estado:'sin_documento' }, evals:0, invitados:2 },
]
// Fila de invitacion pendiente: no pasa por obtener-candidato y debe seguir igual.
const PENDIENTE = { rut:'22.222.222-2', email:'pendiente@ej.cl' }

async function pinta(html, etiqueta) {
  fs.writeFileSync('/tmp/ux47.html', html)
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })
  await ctx.addInitScript(() => {
    localStorage.setItem('hl_token', 'x');
    localStorage.setItem('hl_usuario', JSON.stringify({ nombre: 'Reclutador', email: 'r@e.cl', empresa: 'Yokono' }));
  })
  const pg = await ctx.newPage()
  const errores = []
  pg.on('pageerror', e => errores.push(String(e)))
  // Playwright evalua las rutas en orden INVERSO al de registro: el comodin
  // va primero para que las especificas, registradas despues, tengan prioridad.
  await pg.route('**/functions/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }))
  await pg.route('**/functions/v1/listar-procesos*', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ procesos: [{ id:'p1', cargo:'Analista', descripcion:'', candidatos: CANDIDATOS.length, estado:'Activo', fecha:'2026-08-14' }] }) }))
  // obtener-proceso devuelve un ARRAY plano, con los datos del trabajador
  // anidados en `trabajadores`. Se reproduce esa forma, no una inventada.
  await pg.route('**/functions/v1/obtener-proceso*', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify([
      ...CANDIDATOS.map((c,i) => ({
        id: 'cp'+i, trabajador_id: 't'+i,
        trabajadores: { id:'t'+i, nombre:c.nombre, rut:c.rut, email:'x@y.cl' },
      })),
      { id:'cp-pend', trabajador_id:null, rut_invitado:PENDIENTE.rut, email_invitado:PENDIENTE.email },
    ]) }))
  await pg.route('**/functions/v1/obtener-candidato*', r => {
    const rut = decodeURIComponent(new URL(r.request().url()).searchParams.get('rut'))
    const c = CANDIDATOS.find(x => x.rut === rut)
    r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
      trabajador:{ id:'t', nombre:c.nombre, rut:c.rut },
      evaluaciones:{ total:c.evals, verificadas:0, rechazos:0, invitados:c.invitados, lista:[] },
      promedios:{ total: c.evals ? { promedio:4.5, puntualidad:4.5, desempeno:4.5, relaciones:4.5, confiabilidad:4.5 } : null, verificado:null },
      documentos: c.doc }) })
  })
  await pg.route('**://*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())
  await pg.goto('file:///tmp/ux47.html', { waitUntil: 'domcontentloaded' })
  await pg.waitForFunction(() => window.__listo === true, { timeout: 15000 }).catch(() => {})
  await pg.waitForTimeout(400)
  return { pg, ctx, errores }
}

const nav = await chromium.launch()
// Se entra directo a la tabla: se llama a la funcion que la pinta, con la
// sesion simulada, en vez de pasar por el login.
const preparar = (fuente) => fuente.replace('</body>', `
<script>
(async () => {
  document.querySelectorAll('.vista').forEach(v => v.classList.remove('active'));
  const v = document.getElementById('vista-candidatos'); if (v) v.classList.add('active');
  // La tabla la puebla verCandidatos(), que llama a obtener-proceso y a
  // obtener-candidato por cada fila. Las dos estan interceptadas, asi que se
  // usa el camino real de la pagina en vez de rellenar el estado a mano.
  // Lo unico que se siembra es la lista de procesos, que carga el login.
  procesos = [{ id:'p1', cargo:'Analista', descripcion:'', candidatos:5, estado:'Activo', fecha:'2026-08-14' }];
  await verCandidatos('p1');
  window.__listo = true;
})();
</script></body>`)

for (const [ref, etiqueta] of [['origin/main','ANTES'], [null,'DESPUÉS']]) {
  const fuente = ref ? execSync(`git show ${ref}:dashboard.html`, { cwd: REPO, encoding:'utf8', maxBuffer: 1<<28 })
                     : fs.readFileSync(REPO + '/dashboard.html','utf8')
  const { pg, ctx, errores } = await pinta(preparar(fuente), etiqueta)
  if (process.env.DEBUG) {
    console.log('  URL:', pg.url())
    console.log('  errores:', errores)
    console.log('  tbody:', (await pg.locator('#tablaCandidatos').innerHTML()).slice(0, 400))
    console.log('  candidatos global:', await pg.evaluate(() => typeof candidatos !== 'undefined' ? JSON.stringify(candidatos).slice(0,300) : 'undefined'))
  }
  const existe = await pg.evaluate(() => !!document.querySelector('#vista-candidatos thead th'))
  if (!existe) throw new Error(`${etiqueta}: no hay tabla en #vista-candidatos. URL: ` + pg.url())
  const r = await pg.evaluate(() => {
    const filas = [...document.querySelectorAll('#tablaCandidatos tr')]
    const ths = [...document.querySelectorAll('#vista-candidatos thead th')]
    return {
      filas: filas.map(tr => {
        const td = [...tr.querySelectorAll('td')]
        const esPendiente = tr.innerText.includes('Invitación pendiente')
        return { nombre: td[0]?.innerText.split('\n')[0], esPendiente,
                 celdas: td.slice(3,6).map(c => c.innerText.trim().replace(/\s+/g,' ')),
                 pills: td.slice(3,6).map(c => c.querySelector('span[style*="border-radius"]') ? 'etiqueta' : 'texto'),
                 centrado: td.slice(1,6).every(c => getComputedStyle(c).textAlign === 'center'),
                 desborda: td.slice(3,6).some(c => c.scrollWidth > c.clientWidth + 1) }
      }),
      thCentrados: ths.slice(1,6).every(t => getComputedStyle(t).textAlign === 'center'),
      thCandidatoIzq: getComputedStyle(ths[0]).textAlign !== 'center',
      nowrap: [...document.querySelectorAll('#tablaCandidatos span[style*="border-radius"]')]
        .filter(p => getComputedStyle(p).whiteSpace === 'nowrap').length,
      pendiente: (() => { const t = [...document.querySelectorAll('#tablaCandidatos tr')]
        .find(tr => tr.innerText.includes('Invitación pendiente'));
        return t ? t.innerText.replace(/\s+/g,' ').trim().slice(0,60) : null })(),
    }
  })
  console.log(`\n${'═'.repeat(112)}\n${etiqueta}${errores.length ? '  ❌ errores JS: ' + errores.join(' | ') : ''}`)
  if (!r.filas.length) throw new Error(`${etiqueta}: la tabla salió vacía. No hay nada que comprobar.`)
  if (r.filas.length !== CANDIDATOS.length + 1) throw new Error(`${etiqueta}: ${r.filas.length} filas, se esperaban ${CANDIDATOS.length + 1}`)
  for (let i=0;i<r.filas.length;i++) {
    const f = r.filas[i]
    const c = CANDIDATOS.find(x => x.nombre === f.nombre)
      || { caso: f.esPendiente ? 'invitación pendiente · fila con colspan' : '??? ' + f.nombre }
    console.log(`  ${c.caso.padEnd(42)} ${f.celdas.map((c,j)=>`${c || '(vacío)'}${f.pills[j]==='etiqueta'?' [etiq]':''}`).join('  |  ')}`)
  }
  console.log(`  encabezados de datos centrados: ${r.thCentrados ? '✅' : '❌'}   ·   «Candidato» a la izquierda: ${r.thCandidatoIzq ? '✅' : '❌'}`)
  const datos = r.filas.filter(f => !f.esPendiente)
  console.log(`  celdas centradas: ${datos.every(f=>f.centrado) ? '✅' : '❌'}   ·   desbordes: ${datos.some(f=>f.desborda) ? '❌ sí' : '✅ no'}`)
  console.log(`  etiquetas con nowrap: ${r.nowrap === 0 ? '✅ ninguna, pueden partir' : '❌ ' + r.nowrap}`)
  console.log(`  invitación pendiente: ${r.pendiente ? '✅ ' + r.pendiente : '❌ no aparece'}`)
  if (etiqueta === 'DESPUÉS') {
    await pg.screenshot({ path: '/tmp/claude-0/-home-user-huellalaboral/53db9c82-84b0-5875-b8ec-55032a30fd77/scratchpad/ux47-despues.png',
      clip: await pg.locator('#vista-candidatos table').boundingBox() })
  } else {
    await pg.screenshot({ path: '/tmp/claude-0/-home-user-huellalaboral/53db9c82-84b0-5875-b8ec-55032a30fd77/scratchpad/ux47-antes.png',
      clip: await pg.locator('#vista-candidatos table').boundingBox() })
  }
  await ctx.close()
}
await nav.close()
