// B, C y D · Cadena de validacion de documentos
// Pegar en la consola de huellalaboral.cl CON SESION DE RECLUTADOR.
// Solo lee. Los pasos que escriben se hacen a mano por la interfaz.

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4Ymx6bXhjbWFlcnljdmRnZnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTgxNDUsImV4cCI6MjA4NzQzNDE0NX0.NCwvIYGT3hinm0EW3e8EkdSYZgHiCTNkuvDohR0SP0c';
if (ANON.length !== 208) throw new Error('ABORTA: clave de ' + ANON.length + ' caracteres, deben ser 208.');
const BASE = 'https://dxblzmxcmaerycvdgfpy.supabase.co/functions/v1';
const H = { 'Content-Type':'application/json', 'apikey':ANON, 'Authorization':'Bearer '+ANON,
            'x-user-token': localStorage.getItem('hl_token') };

async function ficha(rut) {
  const r = await fetch(BASE + '/obtener-candidato?rut=' + encodeURIComponent(rut), { headers: H });
  if (r.status !== 200) throw new Error('ABORTA: ' + rut + ' devolvio ' + r.status);
  return (await r.json()).documentos || {};
}
function mostrar(rut, d) {
  console.log('--- ' + rut + ' ---');
  console.table([{ cert_estado: d.cert_estado, finiq_estado: d.finiq_estado,
                   cert_empleos: d.cert_empleos, cert_permanencia: d.cert_permanencia,
                   causal_validada: d.causal_validada, razon: d.cert_razon_invalido }]);
  return d;
}
const esperado = (d, cert, finiq, nombre) => {
  const bien = d.cert_estado === cert && d.finiq_estado === finiq;
  console.log((bien ? 'OK    ' : 'FALLA ') + nombre + '  (cert=' + d.cert_estado + ' finiq=' + d.finiq_estado + ')');
  return bien;
};

// ─── B · lo vigente sigue funcionando ───────────────────────────────────────
// B.1 — la migracion no rompio lo que ya estaba validado
window.B1 = async () => esperado(mostrar('13.435.655-3', await ficha('13.435.655-3')),
  'validado', 'validado', 'B.1 · 13.435.655-3 conserva su validacion');

// B.2 — despues de subir y validar como VALIDO por la interfaz
window.B2 = async () => esperado(mostrar('11.111.111-1', await ficha('11.111.111-1')),
  'validado', 'validado', 'B.2 · ciclo nuevo validado');

// ─── C · lo caducado deja de mostrarse ──────────────────────────────────────
// C.1 — despues de RESUBIR sin validar
window.C1 = async () => {
  const d = mostrar('11.111.111-1', await ficha('11.111.111-1'));
  const ok = esperado(d, 'pendiente_validacion', 'pendiente_validacion', 'C.1 · resubido queda pendiente');
  console.log((d.cert_empleos === null ? 'OK    ' : 'FALLA ') + 'C.1b · sin numeros caducados (cert_empleos=' + d.cert_empleos + ')');
  return ok && d.cert_empleos === null;
};
// C.2 — despues de validar marcando NO VALIDO
window.C2 = async () => {
  const d = mostrar('11.111.111-1', await ficha('11.111.111-1'));
  const ok = esperado(d, 'no_valido', 'no_valido', 'C.2 · no valido');
  console.log((d.causal_validada === false ? 'OK    ' : 'FALLA ') + 'C.2b · causal_validada es false, no null (insignia roja) → ' + d.causal_validada);
  console.log((d.cert_razon_invalido ? 'OK    ' : 'FALLA ') + 'C.2c · llega el motivo (H-22) → ' + d.cert_razon_invalido);
  return ok && d.causal_validada === false && !!d.cert_razon_invalido;
};
// C.3 — el que nunca fue validado
window.C3 = async () => esperado(mostrar('19.114.926-2', await ficha('19.114.926-2')),
  'pendiente_validacion', 'pendiente_validacion', 'C.3 · 19.114.926-2 pendiente, no con datos caducados');

// ─── D · no regresion ───────────────────────────────────────────────────────
// D.1 — un trabajador sin documentos no rompe nada. Cambia el RUT si tienes otro.
window.D1 = async (rut) => {
  const d = mostrar(rut, await ficha(rut));
  return esperado(d, 'sin_documento', 'sin_documento', 'D.1 · ' + rut + ' sin documentos');
};

console.log('Cargado. Llama a B1(), B2(), C1(), C2(), C3() o D1("rut") en el momento que toca.');
console.log('Ver el guion de pasos manuales en el mensaje que acompaña este archivo.');
