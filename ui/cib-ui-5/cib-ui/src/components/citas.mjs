// Splits the dictation into plain text and quoted fragments; each fragment lists the cards that quote it.
export function marcarCitas(texto, citas) {
  const rangos = [];
  citas.forEach((cita, i) => {
    const inicio = cita ? texto.indexOf(cita) : -1;
    if (inicio < 0) return;
    const fin = inicio + cita.length;
    const igual = rangos.find(r => r.inicio === inicio && r.fin === fin);
    if (igual) igual.citas.push(i);
    else if (!rangos.some(r => inicio < r.fin && fin > r.inicio)) rangos.push({ inicio, fin, citas: [i] });
  });
  rangos.sort((a, b) => a.inicio - b.inicio);
  const partes = [];
  let desde = 0;
  for (const r of rangos) {
    if (r.inicio > desde) partes.push({ texto: texto.slice(desde, r.inicio), citas: [] });
    partes.push({ texto: texto.slice(r.inicio, r.fin), citas: r.citas });
    desde = r.fin;
  }
  if (desde < texto.length) partes.push({ texto: texto.slice(desde), citas: [] });
  return partes;
}
