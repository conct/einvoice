/**
 * Datumsangaben werden durchgaengig als ISO-Kalendertag "YYYY-MM-DD" gehalten.
 * Kein Date-Objekt, keine Zeitzone - eine Rechnung vom 31.12. darf nicht durch
 * UTC-Verschiebung zum 30.12. werden.
 */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** CII nutzt das Format 102: YYYYMMDD. */
export function toCiiDate(value: IsoDate): string {
  return value.replace(/-/g, '');
}

/** Anzeigeformat fuer das PDF: 31.12.2026 */
export function formatDate(value: IsoDate): string {
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

/** Kalendertage auf ein ISO-Datum addieren (fuer Zahlungsziele). */
export function addDays(value: IsoDate, days: number): IsoDate {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
