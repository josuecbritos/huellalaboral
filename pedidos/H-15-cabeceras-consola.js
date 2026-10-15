// H-15 · comprobación de las seis cabeceras en las 12 páginas.
//
// Se pega en la consola del navegador con https://huellalaboral.cl abierto, DESPUÉS de fusionar
// el PR y de que Vercel haya desplegado. No cambia nada: solo pide las 12 páginas y lee sus
// cabeceras de respuesta.
//
// El aviso de origen NO aborta, a propósito: así el mismo bloque se puede ejecutar contra un
// servidor local para comprobar que sabe fallar (`pedidos/H-15-cabeceras.mjs`). Un bloque de
// comprobación que solo sabe decir OK no comprueba nada.
(async () => {
  const PAGINAS = [
    'index.html', 'login.html', 'crear-password.html', 'admin.html', 'dashboard.html',
    'trabajador.html', 'estado.html', 'evaluar.html', 'validar.html',
    'privacidad.html', 'terminos.html', 'links-afp.html',
  ];

  // Nombre corto para la tabla, nombre real de la cabecera, y el valor que debe traer.
  const CABECERAS = [
    ['frame',     'x-frame-options',           'DENY'],
    ['csp',       'content-security-policy',   "frame-ancestors 'none'"],
    ['nosniff',   'x-content-type-options',    'nosniff'],
    ['referrer',  'referrer-policy',           'strict-origin-when-cross-origin'],
    ['hsts',      'strict-transport-security', 'max-age=63072000'],
    ['permisos',  'permissions-policy',        'camera=(), microphone=(), geolocation=()'],
  ];

  if (location.origin !== 'https://huellalaboral.cl') {
    console.warn(`⚠️  Esto se ejecuta desde ${location.origin}, no desde https://huellalaboral.cl.`);
  }

  const filas = {};
  let faltan = 0, distintas = 0, noDoscientos = 0, errores = 0;

  for (const pagina of PAGINAS) {
    let r;
    try {
      r = await fetch('/' + pagina, { cache: 'no-store' });
    } catch (e) {
      filas[pagina] = { estado: 'ERROR: ' + e.message };
      errores++;
      continue;
    }

    const fila = { estado: r.status };
    if (r.status !== 200) noDoscientos++;

    for (const [corto, cabecera, esperado] of CABECERAS) {
      const valor = r.headers.get(cabecera);
      if (valor === null) {
        fila[corto] = 'falta';
        faltan++;
      } else if (valor.trim().toLowerCase() !== esperado.toLowerCase()) {
        fila[corto] = '≠ ' + valor;
        distintas++;
      } else {
        fila[corto] = valor;
      }
    }
    filas[pagina] = fila;
  }

  console.table(filas);

  const total = PAGINAS.length * CABECERAS.length;
  const bien = total - faltan - distintas;
  console.log(`${bien}/${total} cabeceras correctas · faltan ${faltan} · con otro valor ${distintas}`);

  if (faltan || distintas || noDoscientos || errores) {
    console.error(
      `❌ H-15 NO está bien: faltan ${faltan}, con otro valor ${distintas}, ` +
      `páginas que no devuelven 200: ${noDoscientos}, errores de red: ${errores}.\n` +
      'Si FALTAN TODAS, lo más probable es que el despliegue de Vercel no haya terminado ' +
      'o que la CDN siga sirviendo la respuesta anterior: espera y vuelve a correrlo.');
    throw new Error('H-15: comprobación fallida. La tabla de arriba dice dónde.');
  }

  console.log(`✅ H-15 correcto: ${PAGINAS.length} páginas × ${CABECERAS.length} cabeceras, ` +
              'todas presentes y con el valor esperado.');
})();
