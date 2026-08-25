/**
 * Fehler beim Einlesen einer empfangenen Rechnung.
 *
 * Eigene Datei, damit sowohl das Einlesemodul als auch die Syntaxauswertung
 * denselben Fehlertyp werfen koennen, ohne sich gegenseitig zu importieren.
 *
 * Der Grund fuer diesen Typ ueberhaupt: Beim Lesen fremder Dateien kommen
 * Ausnahmen aus Bibliotheken hoch, deren Wortlaut englisch und technisch ist -
 * "Failed to parse PDF document (line:147 col:11 offset=1732)". Das ist fuer
 * die Fehlersuche wertvoll und fuer den Empfaenger einer kaputten Rechnung
 * wertlos. Deshalb traegt jeder Fehler beides: eine Meldung, die man anzeigen
 * kann, und den technischen Wortlaut daneben.
 */
export type EInvoiceErrorCode =
  /** PDF ohne eingebettete XML-Rechnung - ein reines Bilddokument */
  | 'no-embedded-xml'
  /** Weder PDF noch XML, oder XML ohne bekanntes Wurzelelement */
  | 'unknown-format'
  /** Datei ist im Ansatz richtig, liess sich aber nicht auswerten */
  | 'parse-failed';

export class EInvoiceError extends Error {
  constructor(
    message: string,
    readonly code: EInvoiceErrorCode,
    /** Urspruenglicher Wortlaut, fuer Protokoll und Rueckfragen */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'EInvoiceError';
  }
}

/**
 * Verpackt eine fremde Ausnahme in eine anzeigbare Meldung.
 * Eigene Fehler werden unveraendert durchgereicht - sie sind bereits gut
 * formuliert.
 */
export function asEInvoiceError(
  fehler: unknown,
  message: string,
  code: EInvoiceErrorCode,
): EInvoiceError {
  if (fehler instanceof EInvoiceError) return fehler;
  return new EInvoiceError(message, code, fehler instanceof Error ? fehler.message : undefined);
}
