import { describe, expect, it } from 'vitest';

import type { Textzeile } from '../src/parse/pdf-text';
import { schlageKopfzeileVor, tabelleAusZeilen } from '../src/parse/pdf-tabelle';

/**
 * Spalten aus einem PDF raten.
 *
 * Das ist die unsicherste Schicht des ganzen Umzugswegs - ein PDF traegt keine
 * Tabelle, nur Text an Koordinaten. Geprueft wird deshalb vor allem, dass die
 * Raterei dort aufhoert, wo sie nicht mehr traegt: Der Summenblock einer
 * Rechnung sieht einer Positionszeile zum Verwechseln aehnlich.
 */

/** Baut eine Zeile aus Paaren von x-Position und Text. */
const zeile = (y: number, ...stuecke: Array<[number, string]>): Textzeile => ({
  y,
  stuecke: stuecke.map(([x, text]) => ({ x, y, text })),
  text: stuecke.map(([, text]) => text).join(' '),
});

/** Nachgebaut aus einer erzeugten Rechnung - die x-Werte sind gemessen. */
const rechnung: Textzeile[] = [
  zeile(614, [57, 'Rechnung RE-2026-0042']),
  zeile(
    593,
    [61, 'Pos.'],
    [87, 'Bezeichnung'],
    [322, 'Menge'],
    [377, 'Einzelpreis'],
    [509, 'Betrag'],
  ),
  zeile(572, [61, '1'], [87, 'Konzeption'], [318, '84 Std.'], [394, '118,00'], [495, '9.912,00']),
  zeile(561, [87, 'Frontend, Anbindung']),
  zeile(540, [61, '2'], [87, 'Betrieb'], [318, '1 Mon.'], [394, '480,00'], [495, '432,00']),
  // Ab hier der Summenblock: genauso viele Stuecke, aber weiter rechts.
  zeile(500, [377, 'Zwischensumme netto'], [495, '10.344,00 EUR']),
  zeile(488, [377, 'Gesamtsumme netto'], [495, '10.344,00 EUR']),
  zeile(476, [377, 'Rechnungsbetrag'], [495, '12.309,36 EUR']),
];

describe('Kopfzeile vorschlagen', () => {
  it('nimmt die Zeile mit den meisten Stuecken', () => {
    expect(schlageKopfzeileVor(rechnung)).toBe(1);
  });

  it('meldet sich leer, wenn es keine Tabelle gibt', () => {
    expect(schlageKopfzeileVor([zeile(700, [57, 'Nur Fliesstext'])])).toBe(-1);
  });
});

describe('Spalten aus Koordinaten', () => {
  it('ordnet jedes Stueck der naechsten Ueberschrift zu', () => {
    const { tabelle } = tabelleAusZeilen(rechnung, 1);

    expect(tabelle.zeilen[0]).toEqual(['Pos.', 'Bezeichnung', 'Menge', 'Einzelpreis', 'Betrag']);
    // Rechtsbuendige Zahlen stehen links von ihrer Ueberschrift - trotzdem
    // gehoeren sie dorthin, weil sie ihr am naechsten sind.
    expect(tabelle.zeilen[1]).toEqual(['1', 'Konzeption', '84 Std.', '118,00', '9.912,00']);
  });

  it('hoert vor dem Summenblock auf', () => {
    // Der wichtigste Test: Summenzeilen haben genauso viele Stuecke wie eine
    // Position. Ohne die Regel ueber die fuehrenden Spalten zoege die Tabelle
    // Summen, Zahlungshinweis und Fusszeile mit hinein - und aus
    // "Rechnungsbetrag 12.309,36" wuerde eine Position.
    const { tabelle } = tabelleAusZeilen(rechnung, 1);

    const alleZellen = tabelle.zeilen.flat().join(' ');
    expect(alleZellen).not.toContain('Zwischensumme');
    expect(alleZellen).not.toContain('Rechnungsbetrag');
    expect(tabelle.zeilen).toHaveLength(4);
  });

  it('meldet Fortsetzungszeilen, statt sie zu verschlucken', () => {
    const { tabelle, fortsetzungen } = tabelleAusZeilen(rechnung, 1);

    expect(fortsetzungen).toEqual([2]);
    expect(tabelle.zeilen[2]).toEqual(['', 'Frontend, Anbindung', '', '', '']);
  });

  it('fasst zwei Stuecke derselben Spalte zusammen', () => {
    // "84" und "Std." setzt der Renderer als eigene Laeufe - in der Zelle
    // gehoeren sie zusammen.
    const geteilt = [
      zeile(593, [61, 'Pos.'], [322, 'Menge']),
      zeile(572, [61, '1'], [318, '84'], [330, 'Std.']),
    ];
    const { tabelle } = tabelleAusZeilen(geteilt, 0);
    expect(tabelle.zeilen[1]).toEqual(['1', '84 Std.']);
  });

  it('gibt nichts zurueck, wenn die gewaehlte Zeile keine Kopfzeile ist', () => {
    const { tabelle } = tabelleAusZeilen(rechnung, 0);
    expect(tabelle.zeilen).toHaveLength(0);
  });
});
