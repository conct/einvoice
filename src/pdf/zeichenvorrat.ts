import type { PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/**
 * Prueft, ob eine Schrift jedes Zeichen zeichnen kann, das im Dokument steht.
 *
 * Der Anlass ist derselbe wie bei der Glyphenpruefung in tools/validate: Eine
 * Schrift, die ein Zeichen nicht kennt, beschwert sich nicht - pdf-lib setzt
 * die Glyphe 0 und die Stelle bleibt im fertigen PDF einfach leer. Kein
 * Validator sieht das, denn strukturell ist das Dokument in Ordnung.
 *
 * Seit die eingebettete Schrift nur noch das lateinische Schriftsystem
 * abdeckt (siehe packages/einvoice-assets/tools/schrift-erzeugen.mjs), ist das
 * kein hypothetischer Fall mehr: Ein Kunde mit griechischem oder kyrillischem
 * Namen trifft ihn sofort. Lieber ein Abbruch mit klarer Meldung als eine
 * Rechnung mit einer Luecke an der Stelle des Empfaengers.
 */

/** Sammelt die Zeichen, die in keiner der uebergebenen Schriften vorkommen. */
export class Zeichenpruefung {
  private readonly vorrat: Set<number>;
  private readonly fehlend = new Map<number, string>();

  constructor(schriften: Uint8Array[]) {
    // Geprueft wird gegen den Schnitt beider Schnitte: ein Zeichen, das nur
    // die fette Schrift kennt, faellt im Fliesstext trotzdem aus.
    this.vorrat = schriften
      .map((schrift) => new Set<number>(fontkit.create(schrift).characterSet))
      .reduce((a, b) => new Set([...a].filter((zeichen) => b.has(zeichen))));
  }

  /** Merkt sich jedes Zeichen des Textes, das die Schrift nicht kennt. */
  pruefe(text: string): void {
    for (const zeichen of text) {
      const nummer = zeichen.codePointAt(0);
      if (nummer === undefined || this.vorrat.has(nummer)) continue;
      // Zeilenumbrueche und Tabulatoren zeichnet ohnehin niemand.
      if (nummer === 0x0a || nummer === 0x0d || nummer === 0x09) continue;
      this.fehlend.set(nummer, zeichen);
    }
  }

  /**
   * Bricht ab, wenn Zeichen fehlen - mit allen auf einmal, nicht mit dem
   * ersten. Wer einen Kundenstamm einliest, will nicht zehnmal nacheinander
   * erfahren, dass noch ein Zeichen fehlt.
   */
  wirfBeiLuecken(): void {
    if (this.fehlend.size === 0) return;

    const liste = [...this.fehlend.entries()]
      .sort(([a], [b]) => a - b)
      .map(([nummer, zeichen]) => `${zeichen} (U+${nummer.toString(16).toUpperCase().padStart(4, '0')})`)
      .join(', ');

    throw new Error(
      `Die eingebettete Schrift kennt folgende Zeichen nicht: ${liste}. ` +
        'Sie wuerden im PDF nicht falsch, sondern gar nicht erscheinen, deshalb ' +
        'wird die Rechnung nicht erzeugt. Abhilfe: die Zeichen im Rechnungstext ' +
        'ersetzen, oder den Zeichenvorrat der Schrift erweitern (siehe ' +
        'packages/einvoice-assets/tools/schrift-erzeugen.mjs).',
    );
  }
}

/**
 * Legt die Pruefung um eine Seite, bevor sie beschrieben wird.
 *
 * Geprueft wird an der Stelle, an der der Text tatsaechlich ins Dokument geht,
 * und nicht an den Rechnungsdaten: Ein Teil des Textes entsteht erst beim
 * Zeichnen - formatierte Betraege, Datumsangaben, feste Beschriftungen. Wer
 * stattdessen die Eingabedaten durchsucht, prueft nicht das, was hinterher im
 * PDF steht, und uebersieht genau die Faelle, die niemand erwartet hat.
 */
export function mitZeichenpruefung(seite: PDFPage, pruefung: Zeichenpruefung): PDFPage {
  const zeichnen = seite.drawText.bind(seite);
  seite.drawText = (text, optionen) => {
    pruefung.pruefe(text);
    zeichnen(text, optionen);
  };
  return seite;
}
