import type { Invoice } from './invoice';

/**
 * Erkennt eine Rechnung ohne Umsatzsteuerausweis nach Paragraf 19 UStG.
 *
 * Warum das hier steht und nicht als Schalter im Profil: Der Haken
 * "Kleinunternehmer" in den Einstellungen ist eine Voreinstellung fuer neue
 * Entwuerfe, keine Schranke. Jeder kann ihn setzen, niemand prueft ihn. Ein
 * kostenloser Zugang, der daran haengt, waere kostenlos fuer jeden, der ein
 * Kaestchen ankreuzt.
 *
 * Diese Pruefung fragt stattdessen das Dokument: Weist es Umsatzsteuer aus
 * oder nicht? Das ist nachrechenbar und laesst sich nicht behaupten.
 *
 * Und sie traegt sich selbst: Wer regelbesteuert ist, kann diesen Weg nicht
 * benutzen, ohne Rechnungen ohne Umsatzsteuer auszustellen - das kostet den
 * eigenen Steuerausweis und dem Kunden den Vorsteuerabzug. Die Schranke steht
 * nicht in der App, sondern im Steuerrecht. Deshalb haelt sie ohne Kontrolle.
 *
 * Bewusst eng gefasst: Verlangt werden Kategorie E, Satz null und ein
 * Befreiungsgrund an *jeder* Position. Eine Rechnung, die auch nur eine
 * Position mit Umsatzsteuer enthaelt, faellt heraus - ebenso eine mit
 * innergemeinschaftlicher Lieferung (AE) oder Reverse Charge, denn das sind
 * andere Befreiungen und andere Zielgruppen.
 */
export function istKleinunternehmerRechnung(invoice: Invoice): boolean {
  if (invoice.lines.length === 0) return false;

  const positionenOhneSteuer = invoice.lines.every(
    (line) =>
      line.vat.category === 'E' &&
      line.vat.rate === 0 &&
      Boolean(line.vat.exemptionReason ?? line.vat.exemptionReasonCode),
  );
  if (!positionenOhneSteuer) return false;

  // Zu- und Abschlaege auf Dokumentebene duerfen ebenfalls keine Steuer
  // tragen, sonst weist die Rechnung insgesamt doch Umsatzsteuer aus.
  return invoice.allowancesCharges.every(
    (eintrag) => eintrag.vat.category === 'E' && eintrag.vat.rate === 0,
  );
}
