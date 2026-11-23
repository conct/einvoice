/**
 * Waehrungszeichen fuer die Anzeige - und nur dafuer.
 *
 * Im XML steht immer der Code nach ISO 4217 (BT-5). Das Zeichen ist eine
 * Frage der Darstellung auf dem Blatt und hat in den Daten nichts verloren:
 * Ein Empfaenger, der "€" einliest, weiss nicht, ob EUR gemeint war.
 *
 * ## Warum hier nicht jede Waehrung ein Zeichen bekommt
 *
 * Ein Zeichen taugt nur, wenn es **eindeutig** ist. "kr" steht in Daenemark,
 * Schweden, Norwegen und Island fuer vier verschiedene Waehrungen; "$" fuer
 * mindestens zwanzig. Auf einer Rechnung, die ueber die Grenze geht, ist der
 * Code dann die bessere Angabe - und deshalb bleibt er dort stehen.
 *
 * Aufgenommen ist, was im deutschsprachigen Zahlungsverkehr ueblich und
 * unverwechselbar ist. Fehlt eine Waehrung hier, ist das kein Mangel, sondern
 * die Entscheidung, lieber "SEK 1.200,00" zu schreiben als "kr 1.200,00".
 */

const ZEICHEN: Readonly<Record<string, string>> = {
  EUR: '€',
  GBP: '£',
  USD: '$',
  JPY: '¥',
  PLN: 'zł',
  CZK: 'Kč',
  HUF: 'Ft',
  RON: 'lei',
  BGN: 'лв',
  TRY: '₺',
  UAH: '₴',
  RUB: '₽',
  INR: '₹',
  KRW: '₩',
  ILS: '₪',
  THB: '฿',
  VND: '₫',
  PHP: '₱',
  NGN: '₦',
  BRL: 'R$',
};

/**
 * Das uebliche Zeichen zur Waehrung, oder nichts.
 *
 * Nichts heisst: Es gibt keins, oder es waere mehrdeutig. CHF, SEK, DKK, NOK,
 * ISK, CAD, AUD und NZD stehen deshalb bewusst nicht in der Liste - "Fr.",
 * "kr" und "$" sagen zu wenig.
 */
export function waehrungszeichen(code: string): string | undefined {
  return ZEICHEN[code.trim().toUpperCase()];
}

/**
 * Wie die Waehrung auf dem Blatt erscheinen soll.
 *
 * `'code'` schreibt EUR, `'symbol'` schreibt €. Die Vorgabe bleibt der Code:
 * Er ist in jeder Schrift darstellbar, eindeutig, und so sehen bereits
 * erzeugte Rechnungen unveraendert aus.
 */
export type Waehrungsdarstellung = 'code' | 'symbol';
