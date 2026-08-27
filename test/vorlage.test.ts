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

describe('was die Vorlage nicht braucht', () => {
  it('meldet fehlende Spaltenkoepfe', () => {
    // Die vermessene Vorlage nennt eine Position und ihren Preis - mehr
    // braucht es dort nicht, also auch keine Kopfzeile.
    const ohne = schlageVorlageVor(
      seiteAus([
        [stueck(215, 375, 'Plakate > Elternabend #Medien'), stueck(528, 375, '65,00 Euro')],
      ]),
      A4_HOEHE,
    );
    expect(ohne.tabellenkopf).toBe(false);

    const mit = schlageVorlageVor(
      seiteAus([
        [stueck(57, 467, 'Pos.'), stueck(90, 467, 'Bezeichnung'), stueck(400, 467, 'Menge')],
      ]),
      A4_HOEHE,
    );
    expect(mit.tabellenkopf).toBe(true);
  });

  it('nennt nur die Kennzahlen, die die Vorlage fuehrt', () => {
    const vorschlag = schlageVorlageVor(
      seiteAus([
        [
          stueck(181, 539, 'Rechnungs-Nr. 2026/7910'),
          stueck(337, 539, 'Kunden-Nr. 2008'),
          stueck(456, 539, 'Rechnungsdatum: 12.8.2026'),
        ],
      ]),
      A4_HOEHE,
    );

    expect([...vorschlag.kennzahlenfelder].sort()).toEqual([
      'kundennummer',
      'rechnungsdatum',
      'rechnungsnummer',
    ]);
    // Leitweg-ID und Bestellnummer stehen weiterhin im XML, nur nicht auf dem
    // Blatt - dort liest sie der Empfaenger maschinell.
    expect(vorschlag.kennzahlenfelder).not.toContain('leitwegId');
  });

  it('erkennt, ob die Steuerzeile ihre Grundlage nennt', () => {
    const ohne = schlageVorlageVor(seiteAus([[stueck(355, 291, 'zzgl. 19 % MwSt.')]]), A4_HOEHE);
    expect(ohne.steuergrundlage).toBe(false);

    const mit = schlageVorlageVor(
      seiteAus([[stueck(355, 291, 'zzgl. 19 % USt. auf 10.381,50')]]),
      A4_HOEHE,
    );
    expect(mit.steuergrundlage).toBe(true);

    // Ohne Steuerzeile bleibt die Frage offen - eine Vorlage ohne
    // Steuerausweis sagt nichts darueber, wie wir einen setzen sollen.
    const stumm = schlageVorlageVor(seiteAus([[stueck(181, 483, 'Sehr geehrte Damen')]]), A4_HOEHE);
    expect(stumm.steuergrundlage).toBeUndefined();
  });
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

  it('liest auch die Woerter des Summenblocks', () => {
    /*
     * Die Vorlage schreibt "Ueberweisungsbetrag", nicht "Zahlbetrag", und
     * kuerzt die Steuer mit "MwSt." ab. Beides ist Hausbrauch und beides
     * gehoert uebernommen.
     */
    const seite = seiteAus([
      [stueck(344, 315, 'Gesamtbetrag netto'), stueck(528, 315, '65,00 Euro')],
      [stueck(355, 291, 'zzgl. 19 % MwSt.'), stueck(527, 291, '12,35 Euro')],
      [stueck(337, 267, 'Überweisungsbetrag'), stueck(526, 267, '77,35 Euro')],
    ]);

    const vorschlag = schlageVorlageVor(seite, A4_HOEHE);

    expect(vorschlag.beschriftungen.zwischensummeNetto).toBe('Gesamtbetrag netto');
    expect(vorschlag.beschriftungen.gesamtbetrag).toBe('Überweisungsbetrag');
    // Das Kuerzel steht mitten im Stueck, nicht am Anfang.
    expect(vorschlag.beschriftungen.steuerkuerzel).toBe('MwSt.');
  });

  it('haelt die Zwischensumme von der Endsumme auseinander', () => {
    // "Gesamtbetrag netto" und "Gesamtbetrag" unterscheiden sich nur durch
    // das Wort danach - ohne dieses Merkmal bekaeme der Block zweimal
    // dasselbe Wort.
    const netto = schlageVorlageVor(seiteAus([[stueck(344, 315, 'Gesamtbetrag netto')]]), A4_HOEHE);
    expect(netto.beschriftungen.zwischensummeNetto).toBe('Gesamtbetrag netto');
    expect(netto.beschriftungen.gesamtbetrag).toBeUndefined();

    const brutto = schlageVorlageVor(seiteAus([[stueck(344, 267, 'Gesamtbetrag')]]), A4_HOEHE);
    expect(brutto.beschriftungen.gesamtbetrag).toBe('Gesamtbetrag');
    expect(brutto.beschriftungen.zwischensummeNetto).toBeUndefined();
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
