// Fase A · Cadena de validacion de documentos
// Pegar en la consola de huellalaboral.cl con sesion de reclutador iniciada.
// SOLO LEE. No escribe nada en la base.

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4Ymx6bXhjbWFlcnljdmRnZnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTgxNDUsImV4cCI6MjA4NzQzNDE0NX0.NCwvIYGT3hinm0EW3e8EkdSYZgHiCTNkuvDohR0SP0c';
if (ANON.length !== 208) {
  throw new Error('ABORTA: la clave tiene ' + ANON.length + ' caracteres y deben ser 208. No sigas.');
}
const BASE = 'https://dxblzmxcmaerycvdgfpy.supabase.co/functions/v1';
const H = {
  'Content-Type': 'application/json',
  'apikey': ANON,
  'Authorization': 'Bearer ' + ANON,
  'x-user-token': localStorage.getItem('hl_token'),
};

(async () => {
  const res = await fetch(BASE + '/obtener-candidato?rut=' + encodeURIComponent('19.114.926-2'), { headers: H });
  if (res.status !== 200) {
    throw new Error('ABORTA: obtener-candidato devolvio ' + res.status + '. Revisa la sesion antes de seguir.');
  }
  const data = await res.json();
  const d = data.documentos || {};

  console.log('--- 19.114.926-2 · lo que muestra HOY el panel ---');
  console.table([{
    cert_empleos: d.cert_empleos,
    cert_permanencia: d.cert_permanencia,
    causal_validada: d.causal_validada,
    causal_texto: d.causal_texto,
    tiene_certificado: d.tiene_certificado,
    tiene_finiquito: d.tiene_finiquito,
  }]);

  const hayDato = [d.cert_empleos, d.cert_permanencia].some(v => v !== null && v !== undefined);
  console.log(hayDato
    ? '\n❌ EL FALLO EXISTE — la base tiene fecha_validacion NULL en los dos documentos de este\n' +
      '   trabajador, o sea no hay validacion vigente, y el panel muestra numeros igualmente.\n' +
      '   Son los de la validacion anterior a la resubida.'
    : '\n⚠️ No muestra numeros de certificado. Copia la tabla de arriba y mandamela antes de seguir:\n' +
      '   puede que este trabajador ya no sea el del caso.');

  console.log('\nCompleta la fase A a ojo, y anota lo que veas:');
  console.log('  1. Ficha del candidato 19.114.926-2 en el panel: ¿sale la insignia "✓ VALIDADA"?');
  console.log('  2. estado.html con su token_consulta: ¿sale la insignia y los numeros?');
  console.log('  3. Tabla de candidatos y vista de proceso: ¿"—" o datos?');
})();
