// UX-73 · prueba del bloque de consola que corre el dueño.
//
// La lección de UX-49: un bloque de comprobación es código aunque vaya dentro
// de un mensaje. Este se ejecuta antes de mandarlo, contra el `estado.html`
// real y dos respuestas simuladas:
//
//   A · la respuesta vieja, con la lista entera → el bloque DEBE decir ❌
//   C · la respuesta nueva, con [{},{}]        → el bloque DEBE decir ✅
//
// Y cuatro comprobaciones de que aborta cuando debe: sin `?token=`, con la
// clave anon de otro largo, **con un carácter de la clave cambiado por uno que
// no es ASCII manteniendo los 208** —el caso que se escapó la primera vez— y
// con la función devolviendo un error. Más la salida de emergencia: usar la
// clave que la propia página ya tiene cargada.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import fs from 'fs'
import path from 'path'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const BLOQUE = fs.readFileSync(path.join(REPO, 'pedidos/UX-73-consola.js'), 'utf8')

// La clave del bloque tiene que ser la que usan las páginas, y medir 208.
const CLAVE = BLOQUE.match(/const ANON_KEY_LITERAL = '([^']+)'/)?.[1]
const CLAVE_PAGINA = fs.readFileSync(path.join(REPO, 'estado.html'), 'utf8').match(/'(eyJ[A-Za-z0-9_\-.]+)'/)?.[1]
if (!CLAVE || CLAVE.length !== 208) throw new Error(`la clave del bloque mide ${CLAVE?.length}, no 208`)
if (CLAVE !== CLAVE_PAGINA) throw new Error('la clave del bloque no es la de estado.html')
console.log('la clave anon del bloque mide 208 y coincide con la de estado.html')

const VIEJA = JSON.stringify({
  trabajador: { nombre: 'Ana Pérez', rut: '11.111.111-1' },
  documentos: { cert_estado: 'validado', cert_razon_invalido: null, finiq_estado: 'validado',
                cert_empleos: 3, cert_permanencia: 4, causal_validada: true, causal_texto: 'renuncia' },
  evaluaciones: { lista: [
    { id: 'ev-1', desempeno: 5, puntualidad: 4, confiabilidad: 5, relaciones: 3,
      comentarios: 'COMENTARIO PRIVADO', nombre_evaluador: 'Jefa Uno', email_evaluador: 'jefa@ej.cl',
      empresa_evaluador: 'Yokono', rut_evaluador: '9.999.999-9', rechazo: null, verificada: true },
    { id: 'ev-2', desempeno: 2, puntualidad: 1, confiabilidad: 2, relaciones: 2,
      comentarios: 'OTRO COMENTARIO', nombre_evaluador: 'Jefe Dos', email_evaluador: 'jefe@ej.cl',
      empresa_evaluador: 'Andotek', rut_evaluador: '8.888.888-8', rechazo: null, verificada: false },
    { id: 'ev-3', rechazo: 'NO TRABAJO CONMIGO', comentarios: null },
  ] },
})
const NUEVA = JSON.stringify({
  trabajador: { nombre: 'Ana Pérez', rut: '11.111.111-1' },
  documentos: { cert_estado: 'validado', cert_razon_invalido: null, finiq_estado: 'validado',
                cert_empleos: 3, cert_permanencia: 4, causal_validada: true, causal_texto: 'renuncia' },
  evaluaciones: { lista: [{}, {}] },
})

const nav = await chromium.launch()

async function correr({ cuerpo = NUEVA, estado = 200, url = '?token=tc-1', bloque = BLOQUE }) {
  const pg = await (await nav.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
  const salida = []
  pg.on('console', m => salida.push(m.text()))
  pg.on('pageerror', e => salida.push('PAGEERROR ' + e.message))
  await pg.route('**/functions/v1/**', r => r.fulfill({ status: estado, contentType: 'application/json', body: cuerpo }))
  await pg.route('**://*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())
  await pg.goto('file://' + path.join(REPO, 'estado.html') + url, { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(400)
  const antes = salida.length
  try { await pg.evaluate(bloque) } catch (e) { salida.push('LANZO ' + e.message) }
  await pg.waitForTimeout(400)
  await pg.context().close()
  return salida.slice(antes)   // solo lo que imprimió el bloque, no la carga de la página
}

let malos = 0
const marca = ok => ok ? '✅' : '❌ FALLA'
const hay = (s, t) => s.some(l => l.includes(t))

console.log('\n' + '═'.repeat(90) + '\nA · la respuesta VIEJA, con la lista entera: el bloque debe decir ❌')
const a = await correr({ cuerpo: VIEJA })
const aFalla = hay(a, '❌ UX-73') && !hay(a, '✅ UX-73')
const aNombra = hay(a, 'comentarios') && hay(a, 'nombre_evaluador')
console.log(`  dice ❌ y no ✅:                 ${marca(aFalla)}`)
console.log(`  nombra los campos que viajan:   ${marca(aNombra)}`)
if (!aFalla || !aNombra) { malos++; console.log(a.join('\n')) }

console.log('\n' + '═'.repeat(90) + '\nC · la respuesta NUEVA, [{},{}]: el bloque debe decir ✅')
const c = await correr({ cuerpo: NUEVA })
const cOk = hay(c, '✅ UX-73 correcto') && !hay(c, '❌ UX-73')
const cCuenta = hay(c, '2 elemento(s)')
console.log(`  dice ✅ y no ❌:                 ${marca(cOk)}`)
console.log(`  cuenta los 2 elementos:         ${marca(cCuenta)}`)
if (!cOk || !cCuenta) { malos++; console.log(c.join('\n')) }

console.log('\n' + '═'.repeat(90) + '\nVACÍA · lista sin elementos: NO es un ✅, es un no concluyente')
const VACIA = JSON.stringify({
  trabajador: { nombre: 'Ana Pérez', rut: '11.111.111-1' },
  documentos: { cert_estado: 'validado', cert_razon_invalido: null, finiq_estado: 'validado',
                cert_empleos: 3, cert_permanencia: 4, causal_validada: true, causal_texto: 'renuncia' },
  evaluaciones: { lista: [] },
})
const v = await correr({ cuerpo: VACIA })
const vAvisa = hay(v, 'NO CONCLUYENTE') && !hay(v, '✅ UX-73 correcto') && !hay(v, '❌ UX-73')
console.log(`  avisa y no da ✅:               ${marca(vAvisa)}`)
if (!vAvisa) { malos++; console.log(v.join('\n')) }

console.log('\n' + '═'.repeat(90) + '\nAborta cuando debe')
const sinToken = await correr({ url: '' })
const okSinToken = hay(sinToken, 'no tiene `?token=`')
console.log(`  sin ?token= en la URL:          ${marca(okSinToken)}`)
if (!okSinToken) { malos++; console.log(sinToken.join('\n')) }

const clavePartida = BLOQUE.replace(/const ANON_KEY_LITERAL = '[^']+'/, "const ANON_KEY_LITERAL = 'eyJcorta'")
const malaClave = await correr({ bloque: clavePartida })
const okMalaClave = hay(malaClave, 'debe medir 208') && !hay(malaClave, '✅ UX-73') && !hay(malaClave, '❌ UX-73')
console.log(`  clave anon de otro largo:       ${marca(okMalaClave)}`)
if (!okMalaClave) { malos++; console.log(malaClave.join('\n')) }

// El caso que se escapó de verdad: el pegado cambia UN carácter por uno que no
// es ASCII. El largo sigue siendo 208, así que comprobar el largo no basta.
const guionLargo = CLAVE.slice(0, 50) + '–' + CLAVE.slice(51)
if (guionLargo.length !== 208) throw new Error('la clave estropeada debe seguir midiendo 208, o la prueba no prueba nada')
const mangled = await correr({ bloque: BLOQUE.replace(CLAVE, guionLargo) })
const okMangled = hay(mangled, 'no son ASCII') && hay(mangled, 'posición 50') && hay(mangled, 'U+2013')
                  && !hay(mangled, '✅ UX-73') && !hay(mangled, 'ISO-8859-1')
console.log(`  un carácter no ASCII, largo 208: ${marca(okMangled)}`)
if (!okMangled) { malos++; console.log(mangled.join('\n')) }

// Y la salida de emergencia: la clave de la página, que no pasa por el pegado.
const dePagina = await correr({ bloque: BLOQUE.replace('const USAR_LA_CLAVE_DE_LA_PAGINA = false', 'const USAR_LA_CLAVE_DE_LA_PAGINA = true')
                                             .replace(CLAVE, guionLargo) })
const okDePagina = hay(dePagina, '✅ UX-73 correcto')
console.log(`  con la clave de la página:      ${marca(okDePagina)}`)
if (!okDePagina) { malos++; console.log(dePagina.join('\n')) }

const error500 = await correr({ estado: 500, cuerpo: '{"error":"x"}' })
const ok500 = hay(error500, 'respondió 500') && !hay(error500, '✅ UX-73')
console.log(`  la función devuelve 500:        ${marca(ok500)}`)
if (!ok500) { malos++; console.log(error500.join('\n')) }

await nav.close()
console.log('\n' + '═'.repeat(90))
if (malos) { console.log(`❌ ${malos} comprobaciones mal. El bloque no sirve como está.`); process.exit(1) }
console.log('✅ El bloque distingue la respuesta vieja de la nueva, aborta en los cuatro casos en que no hay nada que medir, y la salida de emergencia funciona.')
