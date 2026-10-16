// UX-73 · qué le llega de verdad al navegador del trabajador.
//
// Se pega en la consola de la MISMA pestaña donde está abierto el enlace de
// seguimiento, `https://huellalaboral.cl/estado.html?token=…`. Solo lee: hace
// la misma llamada que hace la página.
//
// La clave anon va escrita literal y se comprueba ANTES de llamar a nada. No se
// saca de la página con una expresión regular: un intento capturó 347
// caracteres y dio un fallo falso.
//
// COMPROBAR EL LARGO NO BASTA, y costó un intento fallido averiguarlo: el
// pegado cambió un carácter de la clave por uno parecido que no es ASCII, el
// largo siguió siendo 208, y `fetch` reventó con «String contains non
// ISO-8859-1 code point». Una cabecera HTTP solo admite ASCII. Por eso ahora se
// revisan las dos cosas, y el error dice en qué posición está el carácter malo.
(async () => {
  // Si el pegado vuelve a estropear la clave, poner esto en `true`: el bloque
  // usa entonces la variable `ANON_KEY` que la propia página ya tiene cargada,
  // que es el mismo valor y no pasa por el portapapeles. No es la expresión
  // regular de antes —no se busca nada en el texto de la página, se lee la
  // variable—, pero se sigue comprobando igual antes de usarla.
  const USAR_LA_CLAVE_DE_LA_PAGINA = false;

  const ANON_KEY_LITERAL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4Ymx6bXhjbWFlcnljdmRnZnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTgxNDUsImV4cCI6MjA4NzQzNDE0NX0.NCwvIYGT3hinm0EW3e8EkdSYZgHiCTNkuvDohR0SP0c';
  const SUPABASE_URL = 'https://dxblzmxcmaerycvdgfpy.supabase.co';

  function revisarClave(clave, origen) {
    if (typeof clave !== 'string' || !clave) {
      throw new Error(`UX-73: no hay clave anon (${origen}). No se llama a nada.`);
    }
    const malos = [...clave]
      .map((c, i) => [i, c])
      .filter(([, c]) => c.codePointAt(0) > 127);
    if (malos.length) {
      const detalle = malos
        .map(([i, c]) => `posición ${i}: «${c}» U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
        .join(' · ');
      throw new Error(
        `UX-73: la clave anon (${origen}) tiene ${malos.length} carácter(es) que no son ASCII, y una cabecera HTTP no los admite. ` +
        `${detalle}. El pegado la estropeó: el largo cuadra igual, así que no sirve comprobar solo el largo. ` +
        `Vuelve a copiarla, o pon USAR_LA_CLAVE_DE_LA_PAGINA en true. No se llama a nada.`);
    }
    if (clave.length !== 208) {
      throw new Error(`UX-73: la clave anon (${origen}) mide ${clave.length} caracteres y debe medir 208. No se llama a nada.`);
    }
    return clave;
  }

  // OJO con el nombre: si esta constante se llamara `ANON_KEY`, taparía la de la
  // página dentro de este bloque y leerla daría «Cannot access 'ANON_KEY' before
  // initialization». Lo pilló el arnés, no la consola del dueño.
  const CLAVE = USAR_LA_CLAVE_DE_LA_PAGINA
    ? revisarClave(typeof ANON_KEY === 'string' ? ANON_KEY : null, 'la de la página')
    : revisarClave(ANON_KEY_LITERAL, 'la escrita en el bloque');

  const token = new URLSearchParams(location.search).get('token');
  if (!token) {
    throw new Error('UX-73: esta pestaña no tiene `?token=` en la URL. Ábrela con el enlace de seguimiento del trabajador.');
  }

  const r = await fetch(`${SUPABASE_URL}/functions/v1/obtener-estado?token=${encodeURIComponent(token)}`,
    { headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` }, cache: 'no-store' });
  if (!r.ok) throw new Error(`UX-73: la función respondió ${r.status}. No hay nada que comprobar.`);

  const texto = await r.text();
  const data = JSON.parse(texto);
  const lista = data?.evaluaciones?.lista;
  if (!Array.isArray(lista)) {
    throw new Error('UX-73: la respuesta no trae `evaluaciones.lista`. Trae: ' + Object.keys(data || {}).join(', '));
  }

  const filas = {};
  lista.forEach((e, i) => {
    const k = Object.keys(e);
    filas[`elemento ${i + 1}`] = { claves: k.length, cuáles: k.join(', ') || '— ninguna —' };
  });
  if (lista.length) console.table(filas);

  console.log(`evaluaciones.lista → ${lista.length} elemento(s): ${JSON.stringify(data.evaluaciones)}`);
  console.log(`la pantalla muestra: ${document.getElementById('evalCount')?.textContent ?? '(no encuentro #evalCount en esta pestaña)'}`);

  // Dos redes, por si algún campo se colara fuera de `lista`.
  const CAMPOS = ['desempeno', 'puntualidad', 'confiabilidad', 'relaciones', 'comentarios',
                  'nombre_evaluador', 'email_evaluador', 'empresa_evaluador', 'rut_evaluador',
                  'rut_empresa', 'rechazo', 'empleador_id', 'verificada', 'fecha_completado'];
  const claves = [...new Set(lista.flatMap(e => Object.keys(e)))];
  const enElTexto = CAMPOS.filter(c => texto.includes(`"${c}"`));

  if (claves.length === 0 && enElTexto.length === 0 && lista.length === 0) {
    // Una lista vacía es consistente con el cambio Y con la función rota: no
    // distingue una cosa de la otra. Decir ✅ aquí sería comprobar sobre la nada.
    console.warn('⚠️  UX-73 NO CONCLUYENTE: la lista viene vacía, así que esto no demuestra nada.');
    console.warn('   Una lista vacía sale igual si el cambio está bien que si la función devolviera siempre cero.');
    console.warn('   Si el SQL dijo 0 evaluaciones válidas para este trabajador, la respuesta es correcta pero');
    console.warn('   la prueba hay que repetirla con un trabajador QUE TENGA al menos una evaluación válida.');
    console.warn('   Si el SQL dijo más de 0, esto es un fallo: avisa.');
  } else if (claves.length === 0 && enElTexto.length === 0) {
    console.log(`✅ UX-73 correcto: ${lista.length} elemento(s), ninguno con claves, y ningún campo de evaluación en toda la respuesta.`);
    console.log('   Compara ese número con el que dio el SQL: deben ser el mismo.');
  } else {
    console.error('❌ UX-73: todavía viaja contenido de las evaluaciones.' +
      (claves.length ? ` Claves en la lista: ${claves.join(', ')}.` : '') +
      (enElTexto.length ? ` Campos en la respuesta: ${enElTexto.join(', ')}.` : ''));
  }
})();
