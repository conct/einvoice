/**
 * Betragsarithmetik. Rechnungsbetraege duerfen nicht ueber Float-Addition
 * driften: EN 16931 verlangt, dass Summen exakt aufgehen (BR-CO-10 ff.),
 * sonst schlaegt jede Schematron-Pruefung fehl. Deshalb wird intern in
 * ganzzahligen Kleinsteinheiten gerechnet.
 */

/** Kaufmaennische Rundung (halb von Null weg) auf n Nachkommastellen. */
export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) throw new RangeError(`Kein endlicher Betrag: ${value}`);
  const factor = 10 ** decimals;
  // Das Epsilon faengt Faelle wie 1.005 ab, die binaer knapp unter der Haelfte liegen.
  const scaled = value * factor;
  const eps = Math.sign(scaled) * 1e-9;
  return Math.round(scaled + eps) / factor;
}

/** Summe mit Rundung nach jedem Schritt, damit keine Restcents entstehen. */
export function sum(values: readonly number[], decimals = 2): number {
  let total = 0;
  for (const v of values) total = round(total + round(v, decimals), decimals);
  return total;
}

/**
 * Formatierung fuer XML: Punkt als Dezimaltrenner, feste Nachkommastellen,
 * kein Tausendertrenner, "-0.00" wird zu "0.00".
 */
export function decimal(value: number, decimals = 2): string {
  const r = round(value, decimals);
  const out = (Object.is(r, -0) ? 0 : r).toFixed(decimals);
  return out === `-${(0).toFixed(decimals)}` ? (0).toFixed(decimals) : out;
}

/** Anzeigeformat fuer das PDF, z.B. "1.234,56". */
export function formatAmount(value: number, currency?: string, decimals = 2): string {
  const r = round(value, decimals);
  const neg = r < 0;
  const [int = '0', frac = ''] = Math.abs(r).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = decimals > 0 ? `${grouped},${frac}` : grouped;
  return `${neg ? '-' : ''}${body}${currency ? ` ${currency}` : ''}`;
}

/** Anzeigeformat fuer Mengen: bis zu 4 Nachkommastellen, ohne Nullen am Ende. */
export function formatQuantity(value: number): string {
  const s = round(value, 4).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}
