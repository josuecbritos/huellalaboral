// UX-73 · qué le llega de verdad al navegador del trabajador.
//
// Se pega en la consola de la MISMA pestaña donde está abierto el enlace de
// seguimiento, `https://huellalaboral.cl/estado.html?token=…`. Solo lee: hace
// la misma llamada que hace la página.
//
// La clave anon va escrita literal y se comprueba que mide 208 caracteres
// ANTES de llamar a nada. No se saca de la página con una expresión regular:
// un intento capturó 347 caracteres y dio un fallo falso.
(async () => {
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4Ymx6bXhjbWFlcnljdmRnZnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTgxNDUsImV4cCI6MjA4NzQzNDE0NX0.NCwvIYGT3hinm0EW3e8EkdSYZgHiCTNkuvDohR0SP0c';
  const SUPABASE_URL = 'https://dxblzmxcmaerycvdgfpy.supabase.co';

  if (ANON_KEY.length !== 208) {
    throw new Error(`UX-73: la clave anon mide ${ANON_KEY.length} caracteres y debe medir 208. No se llama a nada.`);
  }

  const token = new URLSearchParams(location.search).get('token');
  if (!token) {
    throw new Error('UX-73: esta pestaña no tiene `?token=` en la URL. Ábrela con el enlace de seguimiento del trabajador.');
  }

  const r = await fetch(`${SUPABASE_URL}/functions/v1/obtener-estado?token=${encodeURIComponent(token)}`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }, cache: 'no-store' });
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

  if (claves.length === 0 && enElTexto.length === 0) {
    console.log(`✅ UX-73 correcto: ${lista.length} elemento(s), ninguno con claves, y ningún campo de evaluación en toda la respuesta.`);
    console.log('   Compara ese número con el que dio el SQL: deben ser el mismo.');
  } else {
    console.error('❌ UX-73: todavía viaja contenido de las evaluaciones.' +
      (claves.length ? ` Claves en la lista: ${claves.join(', ')}.` : '') +
      (enElTexto.length ? ` Campos en la respuesta: ${enElTexto.join(', ')}.` : ''));
  }
})();
