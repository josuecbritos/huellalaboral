import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const REPO = '/home/user/huellalaboral'

// Los siete casos del archivo de referencia, tal cual.
const CASOS = [
  ['1 · Todo validado, causal más larga', {cert_estado:'validado', finiq_estado:'validado', cert_empleos:3, cert_permanencia:5, causal_texto:'vencimiento_plazo'}],
  ['2 · Subidos, sin validar',            {cert_estado:'pendiente_validacion', finiq_estado:'pendiente_validacion'}],
  ['3 · Los dos no válidos, motivo largo',{cert_estado:'no_valido', finiq_estado:'no_valido', cert_razon_invalido:'El certificado está ilegible en la segunda página y no se distinguen las fechas de cotización'}],
  ['4 · Certificado válido, finiquito no',{cert_estado:'validado', finiq_estado:'no_valido', cert_empleos:3, cert_permanencia:5}],
  ['5 · Solo el certificado',             {cert_estado:'validado', finiq_estado:'sin_documento', cert_empleos:3, cert_permanencia:5}],
  ['6 · Sin documentos',                  {cert_estado:'sin_documento', finiq_estado:'sin_documento'}],
  ['7 · Escapado',                        {cert_estado:'no_valido', finiq_estado:'no_valido', cert_razon_invalido:'<img src=x onerror="alert(1)"> Müller & O\'Brien'}],
]

const nav = await chromium.launch()
let malos = 0
for (const [nombre, documentos] of CASOS) {
  const ctx = await nav.newContext({ viewport: { width: 900, height: 900 } })
  const pg = await ctx.newPage()
  const alertas = []
  pg.on('dialog', async d => { alertas.push(d.message()); await d.dismiss() })
  const errores = []
  pg.on('pageerror', e => errores.push(String(e)))

  // Se intercepta la llamada real a obtener-estado y se responde con el caso.
  await pg.route('**/functions/v1/obtener-estado*', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      trabajador: { nombre: 'Ana Pérez', rut: '11.111.111-1' },
      documentos,
      evaluaciones: { lista: [{ rechazo: false }, { rechazo: false }] },
    }),
  }))
  await pg.route('**://*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())

  await pg.goto('file://' + REPO + '/estado.html?token=x', { waitUntil: 'domcontentloaded' })
  await pg.waitForSelector('#contenido', { state: 'visible', timeout: 5000 })
  await pg.waitForTimeout(150)

  const r = await pg.evaluate(() => {
    const t = (id) => document.getElementById(id)
    const caja = (el) => { const b = el.getBoundingClientRect(); return { y: Math.round(b.top), h: Math.round(b.height) } }
    const tarjetas = [...document.querySelectorAll('.grid-datos > div')]
    const insignias = ['certEmpleosBadge','certPermanenciaBadge','causalBadge'].map(id => caja(t(id)))
    return {
      valores: ['certEmpleos','certPermanencia','causalTexto'].map(id => t(id).innerText.trim()),
      tamanos: ['certEmpleos','certPermanencia','causalTexto'].map(id => {
        const s = t(id).querySelector('span'); return s ? getComputedStyle(s).fontSize : '?' }),
      badges: ['certEmpleosBadge','certPermanenciaBadge','causalBadge'].map(id => t(id).innerText.trim() || '(vacía)'),
      insigniasY: insignias.map(i => i.y),
      subtitulo: t('resumenSubtitulo').innerText.trim(),
      enlaceSubtitulo: t('resumenSubtitulo').querySelector('a')?.getAttribute('href') || null,
      // El aviso ambar se elimino: si reaparece, es un error.
      aviso: !!document.getElementById('avisoNoValido'),
      // Que el motivo hostil no haya creado elementos
      imgs: document.querySelectorAll('.grid-datos img, #resumenSubtitulo img').length,
      // Ninguna insignia puede ser roja ni gris de 'sin documento'.
      insigniasProhibidas: [...document.querySelectorAll('#certEmpleosBadge span, #certPermanenciaBadge span, #causalBadge span')]
        .map(x => x.textContent.trim()).filter(x => /NO VÁLIDO|SIN DOCUMENTO/.test(x)),
      // Que no se desborde
      desborda: tarjetas.some(d => d.scrollWidth > d.clientWidth + 1),
      cabecera: t('nombreTrabajador').innerText.trim() + ' · ' + t('metaTrabajador').innerText.trim(),
      evals: t('evalCount').innerText.trim() + ' ' + t('evalDesc').innerText.trim(),
    }
  })

  const alineadas = new Set(r.insigniasY).size === 1
  const ok = alineadas && !r.desborda && !r.imgs && !alertas.length && !errores.length
    && !r.aviso && !r.insigniasProhibidas.length
  if (!ok) malos++
  console.log(`\n${'═'.repeat(94)}\n${nombre}`)
  console.log(`  valores  : ${r.valores.map((v,i)=>`${JSON.stringify(v)} (${r.tamanos[i]})`).join('  |  ')}`)
  console.log(`  insignias: ${r.badges.join('  |  ')}`)
  console.log(`  alineadas: ${alineadas ? '✅ sí, y=' + r.insigniasY[0] : '❌ NO — ' + r.insigniasY.join(',')}   ·   desborda: ${r.desborda ? '❌ SÍ' : '✅ no'}`)
  console.log(`  subtitulo: ${JSON.stringify(r.subtitulo)}`)
  console.log(`  enlace   : ${r.enlaceSubtitulo ?? '(ninguno)'}`)
  console.log(`  aviso ámbar: ${r.aviso ? '❌ EXISTE' : '✅ eliminado'}   ·   <img> creados: ${r.imgs}   ·   alertas: ${alertas.length}   ·   errores JS: ${errores.length}`)
  if (r.insigniasProhibidas.length) console.log(`  ❌ insignias prohibidas: ${r.insigniasProhibidas.join(', ')}`)
  console.log(`  no tocado: ${r.cabecera}  ·  ${r.evals}`)
  if (errores.length) console.log('  ❌', errores.join(' | '))
  await ctx.close()
}
await nav.close()
console.log(`\n${malos === 0 ? '✅ 7/7 · solo dos insignias, sin aviso ámbar, sin motivo, sin elementos inyectados' : `❌ ${malos}/7 con problemas`}`)
