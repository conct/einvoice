import { INVOICE_TYPE_CODES } from './codes';
import type { Invoice, InvoiceInput } from './invoice';

/**
 * Leitet aus einer herausgegebenen Rechnung das Folgedokument ab.
 *
 * Warum es das braucht: Mit dem Festschreiben ist eine Rechnung gesperrt - das
 * verlangt die Unveraenderbarkeit nach GoBD. Wer sich vertan hat, storniert
 * oder korrigiert. Die App sagt das dem Nutzer bereits; ohne diese Funktion
 * war der erste Tippfehler nach dem Festschreiben eine Sackgasse.
 *
 * Beide Wege erben Absender, Empfaenger und Positionen und verweisen auf die
 * Ursprungsrechnung (BT-25/BT-26). Die Regel dazu steht in validate.ts: Ohne
 * diesen Verweis kann der Empfaenger die Korrektur nicht zuordnen.
 *
 * **Die Betraege bleiben positiv.** Das Vorzeichen traegt die Dokumentart, wie
 * die EN 16931 es vorsieht: 381 sagt dem Empfaenger, dass er den Betrag
 * gutschreibt. Betraege zusaetzlich zu negieren waere eine doppelte Verneinung
 * - der Empfaenger bekaeme eine Gutschrift ueber minus 640 Euro und wuesste
 * nicht, in welche Richtung sie wirkt. Nachgemessen am 25.08.2026 gegen
 * Mustang und den KoSIT-Validator.
 */
export type Folgeart = 'storno' | 'korrektur';

export function folgedokument(invoice: Invoice, art: Folgeart, heute: string): InvoiceInput {
  const bezug = { number: invoice.number, issueDate: invoice.issueDate };

  return {
    ...invoice,
    // Die Nummer vergibt das Festschreiben, wie bei jeder anderen Rechnung
    // auch. Eine Stornorechnung traegt eine eigene, fortlaufende Nummer - nie
    // die der Ursprungsrechnung.
    number: '',
    typeCode: art === 'storno' ? INVOICE_TYPE_CODES.CREDIT_NOTE : INVOICE_TYPE_CODES.CORRECTED_INVOICE,
    issueDate: heute,
    precedingInvoice: bezug,

    // Beim Storno ist die Leistung dieselbe wie in der Ursprungsrechnung; ein
    // eigenes Faelligkeitsdatum ergibt keinen Sinn, gezahlt wird nichts.
    ...(art === 'storno' ? { dueDate: undefined, paidAmount: 0 } : {}),

    notes: [
      {
        text:
          art === 'storno'
            ? `Storno der Rechnung ${invoice.number} vom ${invoice.issueDate}.`
            : `Korrektur der Rechnung ${invoice.number} vom ${invoice.issueDate}.`,
      },
      ...invoice.notes,
    ],

    // Anhaenge der Ursprungsrechnung nicht mitschleppen - sie gehoeren zur
    // urspruenglichen Leistung, nicht zur Korrektur.
    attachments: [],
  };
}
