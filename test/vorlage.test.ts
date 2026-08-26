import { describe, expect, it } from 'vitest';

import { schlageVorlageVor } from '../src/absender/vorlage';
import type { Textseite, Textstueck } from '../src/parse/pdf-text';

const A4_HOEHE = 841.89;

const stueck = (x: number, y: number, text: string): Textstueck => ({
  x,
  y,
  groesse: 9,
  breite: text.length * 4,
  text,
});

const seiteAus = (zeilen: Textstueck[][]): Textseite => ({
  zeilen: zeilen.map((stuecke) => ({
    y: stuecke[0]!.y,
    stuecke,
    text: stuecke.map((s) => s.text).join(' '),
  })),
});

describe('schlageVorlageVor', () => {
  it('liest die Wortwahl einer gestalteten Fremdrechnung', () => {
    // Genau so steht es auf der Vorlage - eine Zeile, drei Angaben.
    const seite = seiteAus([
      [
        stueck(181, 539, 'Rechnungs-Nr. 2026/7910'),
        stueck(337, 539, 'Kunden-Nr. 2008'),
        stueck(456, 539, 'Rechnungsdatum: 12.8.2026'),
      ],
    ]);

    const vorschlag = schlageVorlageVor(seite, A4_HOEHE);

    expect(vorschlag.beschriftungen.rechnungsnummer).toBe('Rechnungs-Nr.');
    expect(vorschlag.beschriftungen.kundennummer).toBe('Kunden-Nr.');
    expect(vorschlag.beschriftungen.rechnungsdatum).toBe('Rechnungsdatum:');
  });

  it('erkennt an drei Angaben in einer Zeile den quer gesetzten Block', () => {
    const seite = seiteAus([
      [
        stueck(181, 539, 'Rechnungs-Nr. 2026/7910'),
        stueck(337, 539, 'Kunden-Nr. 2008'),
        stueck(456, 539, 'Rechnungsdatum: 12.8.2026'),
      ],
    ]);

    expect(schlageVorlageVor(seite, A4_HOEHE).kennzahlen).toBe('unter-anschrift');
  });

  it('erkennt den Block neben dem Anschriftenfeld', () => {
    // Untereinander, auf Hoehe des Anschriftenfeldes (45 mm von oben).
    const seite = seiteAus([
      [stueck(354, 720, 'Rechnungsnummer'), stueck(475, 720, 'RE-2026-0042')],
      [stueck(354, 708, 'Rechnungsdatum'), stueck(475, 708, '24.08.2026')],
    ]);

    expect(schlageVorlageVor(seite, A4_HOEHE).kennzahlen).toBe('neben-anschrift');
  });

  it('haelt ein Wort aus dem Fliesstext nicht fuer eine Beschriftung', () => {
    /*
     * Die Fusszeile einer echten Rechnung endet mit "Rechnungsdatum ist
     * Leistungsdatum." Ohne die Schranken wurde daraus die Beschriftung des
     * Leistungsdatums - auf jeder kuenftigen Rechnung.
     */
    const seite = seiteAus([
      [
        stueck(
          181,
          29,
          'kannt. Es gelten unsere Allgemeinen Geschäftsbedingungen. Rechnungsdatum ist Leistungsdatum.',
        ),
      ],
    ]);

    expect(schlageVorlageVor(seite, A4_HOEHE).beschriftungen.leistungsdatum).toBeUndefined();
    expect(schlageVorlageVor(seite, A4_HOEHE).beschriftungen.rechnungsdatum).toBeUndefined();
  });

  it('uebernimmt keine Werte, nur die Woerter davor', () => {
    const vorschlag = schlageVorlageVor(
      seiteAus([[stueck(181, 539, 'Rechnungs-Nr. 2026/7910')]]),
      A4_HOEHE,
    );

    // Eine uebernommene Rechnungsnummer verstiesse gegen Paragraf 14 Abs. 4
    // UStG, sobald sie ein zweites Mal vergeben wird.
    expect(JSON.stringify(vorschlag.beschriftungen)).not.toContain('2026/7910');
  });

  it('meldet keine Stellung, wo keine zu erkennen ist', () => {
    const seite = seiteAus([[stueck(60, 400, 'Sehr geehrte Damen und Herren,')]]);
    expect(schlageVorlageVor(seite, A4_HOEHE).kennzahlen).toBeUndefined();
  });
});
