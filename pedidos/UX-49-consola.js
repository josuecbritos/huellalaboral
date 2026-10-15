// UX-49 · comprobación del estado vacío de la tabla de candidatos.
//
// Se pega en la consola con un PROCESO SIN CANDIDATOS abierto en el panel.
//
// Se ancla a `#tablaCandidatos`, no a la primera `<table>` de la página: `dashboard.html` tiene
// dos tablas, y la primera es la de procesos —6 `th`, y oculta mientras se ve un proceso—.
(() => {
  const tbody = document.getElementById('tablaCandidatos');
  const tabla = tbody?.closest('table');
  if (!tabla) throw new Error('UX-49: no encuentro la tabla de candidatos. ¿Estás en el panel con un proceso abierto?');

  const ths = [...tabla.querySelectorAll('thead th')];
  const celda = tbody.querySelector('td');
  if (!ths.length || !celda) throw new Error('UX-49: la tabla no tiene cabecera o no tiene filas. Nada que medir.');

  const visible = tabla.getBoundingClientRect().width > 0;
  if (!visible) throw new Error('UX-49: la tabla de candidatos está oculta. Abre un proceso antes de medir.');

  const texto = celda.innerText.split('\n')[0].trim();
  const esEstadoVacio = /sin candidatos/i.test(celda.innerText);
  const derechaUltimoTh = Math.round(ths[ths.length - 1].getBoundingClientRect().right);
  const derechaFila = Math.round(celda.getBoundingClientRect().right);

  console.table({
    cabecera: { columnas: ths.length, 'termina en px': derechaUltimoTh },
    fila:     { columnas: celda.colSpan, 'termina en px': derechaFila },
  });
  console.log(`primera fila del cuerpo: «${texto}»${esEstadoVacio ? '' : '  ⚠️  no parece el estado vacío'}`);

  const cuadra = ths.length === celda.colSpan;
  const alineados = Math.abs(derechaUltimoTh - derechaFila) <= 1;

  if (cuadra && alineados) {
    console.log(`✅ UX-49 correcto: ${ths.length} th y colspan ${celda.colSpan}, y la fila termina donde la cabecera.`);
  } else {
    console.error('❌ UX-49: ' +
      (cuadra ? '' : `la cabecera tiene ${ths.length} th y la fila declara colspan ${celda.colSpan}. `) +
      (alineados ? '' : `la cabecera termina en ${derechaUltimoTh}px y la fila en ${derechaFila}px. `));
  }
  if (!esEstadoVacio) {
    console.warn('⚠️  La primera fila no dice «Sin candidatos»: esto midió una fila de datos, no el estado vacío. Abre un proceso que no tenga candidatos.');
  }
})();
