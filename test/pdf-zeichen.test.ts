import { describe, expect, it } from 'vitest';

import { leseToUnicode, winAnsi } from '../src/parse/pdf-text';

/*
 * Wie aus Glyphennummern wieder Buchstaben werden. Anlass: Ein Eurozeichen
 * kam aus einer PDF-Rechnung als U+FFFD, und der Betrag der ganzen Rechnung
 * blieb leer (26.11.2026, in CHOOZY gemessen).
 */
describe('ToUnicode-Tabelle', () => {
  it('liest Einzelzeichen und Bereiche wie bisher', () => {
    const karte = leseToUnicode(`
      1 beginbfchar
      <0003> <0020>
      endbfchar
      1 beginbfrange
      <0010> <0012> <0041>
      endbfrange
    `);
    expect(karte.get(0x03)).toBe(' ');
    expect([karte.get(0x10), karte.get(0x11), karte.get(0x12)].join('')).toBe('ABC');
  });

  it('liest auch Bereiche mit einer Liste von Zielen', () => {
    const karte = leseToUnicode(`
      1 beginbfrange
      <0020> <0022> [<0034> <20AC> <00660069>]
      endbfrange
    `);
    expect(karte.get(0x20)).toBe('4');
    expect(karte.get(0x21)).toBe('€');
    // Ligatur: ein Glyph, zwei Buchstaben.
    expect(karte.get(0x22)).toBe('fi');
  });

  it('setzt Ersatzpaare zusammen', () => {
    const karte = leseToUnicode('1 beginbfchar <0005> <D83DDE00> endbfchar');
    expect(karte.get(0x05)).toBe('😀');
  });
});

describe('Einfache Schriften ohne Tabelle', () => {
  it('lesen 0x80 als Eurozeichen, nicht als Steuerzeichen', () => {
    expect(winAnsi(0x80)).toBe('€');
    expect(winAnsi(0x84)).toBe('„');
    expect(winAnsi(0x96)).toBe('–');
  });

  it('lassen ASCII und Latin-1 oberhalb von 0x9F, wie sie sind', () => {
    expect(winAnsi(0x41)).toBe('A');
    expect(winAnsi(0xe4)).toBe('ä');
    expect(winAnsi(0xdf)).toBe('ß');
  });
});

describe('Eine echte PDF mit Standardschrift', () => {
  /*
   * So war die Rechnung gebaut, an der CHOOZY den Fehler fand, und so sind
   * die Angebote desselben Absenders gebaut: Helvetica als Standardschrift,
   * WinAnsi, keine ToUnicode-Tabelle. Bis 5.4.4 kam "Gesamtbetrag 2500,00 "
   * heraus - mit einem unsichtbaren Steuerzeichen statt des Eurozeichens.
   */
  it('liefert das Eurozeichen und damit den Betrag', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const { liesPdfText } = await import('../src/parse/pdf-text');
    const { betragAmZeilenende } = await import('../src/parse/beleg');

    const doc = await PDFDocument.create();
    const schrift = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([595, 842]).drawText('Gesamtbetrag 409,50 €', { x: 50, y: 700, size: 11, font: schrift });
    const text = (await liesPdfText(await doc.save())).text;

    expect(text).toContain('Gesamtbetrag 409,50 €');
    const zeile = text.split('\n').find((z) => z.includes('Gesamtbetrag')) ?? '';
    expect(betragAmZeilenende(zeile)).toBe(409.5);
  });
});
