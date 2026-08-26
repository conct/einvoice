import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

import { liesWordDokument } from '../src/parse/word';

/**
 * Word-Dokumente aufschluesseln.
 *
 * Die Pruefstuecke werden hier gebaut statt als Datei abgelegt: Eine .docx ist
 * ein ZIP, und ein ZIP im Repository laesst sich weder lesen noch in einem
 * Diff beurteilen. So steht im Test, was drinsteht.
 *
 * Geprueft wird vor allem, was diese Schicht **nicht** darf: raten. Sie holt
 * Absaetze und Tabellen heraus, in der Reihenfolge des Dokuments, und deutet
 * nichts. Was eine Rechnungsnummer ist, entscheidet spaeter der Mensch.
 */

/** Baut eine .docx mit dem angegebenen Rumpf-XML. */
function docx(rumpf: string): Uint8Array {
  const dokument =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${rumpf}</w:body></w:document>`;

  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'word/document.xml': strToU8(dokument),
  });
}

const absatz = (...laeufe: string[]): string =>
  `<w:p>${laeufe.map((text) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`).join('')}</w:p>`;

const zeile = (...zellen: string[]): string =>
  `<w:tr>${zellen.map((text) => `<w:tc>${absatz(text)}</w:tc>`).join('')}</w:tr>`;

const tabelle = (...zeilen: string[]): string => `<w:tbl>${zeilen.join('')}</w:tbl>`;

describe('Word-Dokument lesen', () => {
  it('holt Absaetze in der Reihenfolge des Dokuments', () => {
    const gelesen = liesWordDokument(
      docx(absatz('Rechnung Nr. 2026-0042') + absatz('Musterfirma GmbH')),
    );

    expect(gelesen.bloecke).toEqual([
      { art: 'absatz', text: 'Rechnung Nr. 2026-0042' },
      { art: 'absatz', text: 'Musterfirma GmbH' },
    ]);
    expect(gelesen.text).toBe('Rechnung Nr. 2026-0042\nMusterfirma GmbH');
  });

  it('setzt zerrissene Laeufe wieder zusammen', () => {
    // Word zerlegt einen Satz an jeder Formatgrenze in eigene w:r. "Rechnung "
    // und "Nr. 4" muessen "Rechnung Nr. 4" ergeben und nicht "RechnungNr. 4" -
    // deshalb trimValues: false im Parser.
    const gelesen = liesWordDokument(docx(absatz('Rechnung ', 'Nr. ', '4')));
    expect(gelesen.text).toBe('Rechnung Nr. 4');
  });

  it('liest eine Tabelle als Zeilen und Zellen', () => {
    // Der eigentliche Grund fuer das Ganze: Die Positionen stehen in einer
    // Tabelle, und die ist strukturiert. Freier Text waere Raterei.
    const gelesen = liesWordDokument(
      docx(
        tabelle(
          zeile('Bezeichnung', 'Menge', 'Einzelpreis', 'Gesamt'),
          zeile('Beratung', '3', '95,00', '285,00'),
          zeile('Anfahrt', '1', '45,00', '45,00'),
        ),
      ),
    );

    expect(gelesen.tabellen).toHaveLength(1);
    expect(gelesen.tabellen[0]?.zeilen).toEqual([
      ['Bezeichnung', 'Menge', 'Einzelpreis', 'Gesamt'],
      ['Beratung', '3', '95,00', '285,00'],
      ['Anfahrt', '1', '45,00', '45,00'],
    ]);
  });

  it('behaelt die Reihenfolge von Absatz und Tabelle bei', () => {
    // Ohne preserveOrder wuesste man nicht mehr, welche Ueberschrift zu
    // welcher Tabelle gehoert - bei zwei Tabellen (Positionen und Summen)
    // waere das der Unterschied zwischen richtig und falsch.
    const gelesen = liesWordDokument(
      docx(absatz('Positionen') + tabelle(zeile('a')) + absatz('Summen') + tabelle(zeile('b'))),
    );

    expect(gelesen.bloecke.map((block) => block.art)).toEqual([
      'absatz',
      'tabelle',
      'absatz',
      'tabelle',
    ]);
    expect((gelesen.bloecke[0] as { text: string }).text).toBe('Positionen');
  });

  it('macht aus Tabulator und Zeilenumbruch keinen Zusammenkleber', () => {
    // In Anschriften und Zellen trennen sie zwei Werte. Ohne sie stuende
    // "Musterweg 1Berlin" da.
    const gelesen = liesWordDokument(
      docx('<w:p><w:r><w:t>Musterweg 1</w:t><w:br/><w:t>Berlin</w:t></w:r></w:p>'),
    );
    expect(gelesen.text).toBe('Musterweg 1\nBerlin');
  });

  it('uebergeht leere Absaetze', () => {
    // Word ist voll davon - sie sind Abstandshalter und tragen nichts bei.
    const gelesen = liesWordDokument(docx(absatz('Text') + '<w:p/>' + absatz('  ')));
    expect(gelesen.bloecke).toHaveLength(1);
  });

  it('liest Text auch durch Verschachtelungen hindurch', () => {
    // w:hyperlink, w:smartTag und aehnliches legt Word um Text herum, ohne
    // dass es jemand angefordert haette.
    const gelesen = liesWordDokument(
      docx('<w:p><w:hyperlink><w:r><w:t>www.beispiel.de</w:t></w:r></w:hyperlink></w:p>'),
    );
    expect(gelesen.text).toBe('www.beispiel.de');
  });

  it('erklaert eine .doc statt kryptisch zu scheitern', () => {
    // Der haeufigste Fehlgriff. "unexpected end of data" hilft niemandem.
    const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => liesWordDokument(doc)).toThrowError(/Word 97/);
  });

  it('nennt jedes Fremdformat beim Namen', () => {
    // Frueher bekam jede Nicht-ZIP-Datei denselben Hinweis auf .doc - wer
    // versehentlich ein PDF waehlt, sucht den Fehler dann an der falschen
    // Stelle.
    expect(() => liesWordDokument(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toThrowError(/PDF/);
    expect(() =>
      liesWordDokument(new Uint8Array([0x7b, 0x5c, 0x72, 0x74, 0x66])),
    ).toThrowError(/RTF/);
    expect(() => liesWordDokument(new Uint8Array([1, 2, 3, 4]))).toThrowError(/keine Word-Datei/);
  });

  it('erklaert ein Archiv ohne Word-Dokument', () => {
    const fremd = zipSync({ 'egal.txt': strToU8('nichts') });
    expect(() => liesWordDokument(fremd)).toThrowError(/kein Word-Dokument/i);
  });

  it('deutet nichts', () => {
    // Die wichtigste Zusage dieser Schicht: Sie erkennt keine
    // Rechnungsnummer, keinen Betrag, keine Position. Sie gibt zurueck, was
    // dasteht. Eine geratene Zahl waere eine falsche Rechnung.
    const gelesen = liesWordDokument(docx(absatz('Rechnungsnummer: 2026-0042')));
    expect(gelesen).not.toHaveProperty('nummer');
    expect(gelesen.bloecke[0]).toEqual({ art: 'absatz', text: 'Rechnungsnummer: 2026-0042' });
  });
});
