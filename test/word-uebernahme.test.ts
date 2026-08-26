import { describe, expect, it } from 'vitest';

import type { WordTabelle } from '../src/parse/word';
import {
  positionenAus,
  schlageZuordnungVor,
  signaturVon,
  zahlAus,
} from '../src/parse/word-uebernahme';

/**
 * Die Uebernahme aus Word.
 *
 * Hier liegt das groesste Risiko des ganzen Umzugswegs: Eine falsch gelesene
 * Zahl ergibt eine falsche Rechnung - und dagegen widerspricht kein Empfaenger,
 * anders als bei einem fehlerhaften XML. Deshalb prueft diese Datei vor allem
 * die Faelle, in denen etwas *fast* richtig waere.
 */

const vorlage = {
  id: '1',
  name: '',
  quantity: 1,
  unitCode: 'C62',
  unitPrice: 0,
  vat: { category: 'S' as const, rate: 19 },
};

describe('Zahlen aus einer Tabellenzelle', () => {
  it('liest deutsche Schreibweise', () => {
    expect(zahlAus('95,00')).toBe(95);
    expect(zahlAus('1.234,56')).toBe(1234.56);
    expect(zahlAus('3')).toBe(3);
    expect(zahlAus('0,5')).toBe(0.5);
  });

  it('uebersteht Waehrungszeichen und Leerraum', () => {
    expect(zahlAus(' 95,00 € ')).toBe(95);
    expect(zahlAus('EUR 1.234,56')).toBe(1234.56);
  });

  it('nimmt einen Punkt als Dezimaltrenner, wenn kein Komma da ist', () => {
    // "95.00" schreibt niemand als Tausendertrennung.
    expect(zahlAus('95.00')).toBe(95);
    expect(zahlAus('0.5')).toBe(0.5);
  });

  it('nimmt einen Punkt als Tausendertrenner bei drei Stellen', () => {
    // Der gefaehrlichste Fall: 1.234 als 1,234 zu lesen waere ein Faktor 1000.
    expect(zahlAus('1.234')).toBe(1234);
    expect(zahlAus('12.500')).toBe(12500);
  });

  it('gibt undefined statt null zurueck', () => {
    // Eine leere Menge ist keine Menge null, sondern eine fehlende Angabe -
    // sonst entstuende stillschweigend eine Position ueber 0,00 Euro.
    expect(zahlAus('')).toBeUndefined();
    expect(zahlAus('   ')).toBeUndefined();
    expect(zahlAus('Pauschale')).toBeUndefined();
    expect(zahlAus('-')).toBeUndefined();
  });

  it('liest negative Betraege', () => {
    expect(zahlAus('-45,00')).toBe(-45);
  });
});

describe('Spalten vorschlagen', () => {
  it('erkennt die ueblichen Ueberschriften', () => {
    expect(schlageZuordnungVor(['Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis'])).toEqual([
      'bezeichnung',
      'menge',
      'einheit',
      'einzelpreis',
    ]);
  });

  it('haelt Gesamt vom Einzelpreis fern', () => {
    // Der teuerste Verwechsler: Wer den Zeilenbetrag als Stueckpreis
    // uebernimmt, multipliziert ihn ein zweites Mal mit der Menge.
    const rollen = schlageZuordnungVor(['Leistung', 'Menge', 'Einzelpreis', 'Gesamt']);
    expect(rollen[2]).toBe('einzelpreis');
    expect(rollen[3]).toBe('ignorieren');
  });

  it('vergibt jede Rolle nur einmal', () => {
    const rollen = schlageZuordnungVor(['Menge', 'Anzahl']);
    expect(rollen.filter((rolle) => rolle === 'menge')).toHaveLength(1);
  });

  it('ignoriert, was es nicht kennt', () => {
    expect(schlageZuordnungVor(['Pos.', 'Irgendwas'])).toEqual(['ignorieren', 'ignorieren']);
  });
});

describe('Vorlagen wiedererkennen', () => {
  it('bildet dieselbe Signatur trotz Schreibweise', () => {
    expect(signaturVon(['Bezeichnung', ' Menge '])).toBe(signaturVon(['bezeichnung', 'menge']));
  });

  it('unterscheidet verschiedene Vorlagen', () => {
    expect(signaturVon(['Bezeichnung', 'Menge'])).not.toBe(signaturVon(['Leistung', 'Anzahl']));
  });
});

describe('Positionen bilden', () => {
  const tabelle: WordTabelle = {
    art: 'tabelle',
    zeilen: [
      ['Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis', 'Gesamt'],
      ['Beratung', '3', 'Std', '95,00', '285,00'],
      ['Anfahrt', '1', 'Pauschale', '45,00', '45,00'],
    ],
  };
  const rollen = ['bezeichnung', 'menge', 'einheit', 'einzelpreis', 'ignorieren'] as const;

  it('macht aus Zeilen Positionen', () => {
    const { positionen } = positionenAus(tabelle, [...rollen], true, vorlage);

    expect(positionen).toHaveLength(2);
    expect(positionen[0]).toMatchObject({
      id: '1',
      name: 'Beratung',
      quantity: 3,
      unitCode: 'Std',
      unitPrice: 95,
    });
    // Die Umsatzsteuer kommt aus der Vorlage, nicht aus der Tabelle.
    expect(positionen[0]?.vat).toEqual({ category: 'S', rate: 19 });
  });

  it('ueberspringt die Kopfzeile nur, wenn sie eine ist', () => {
    const ohneKopf = positionenAus(tabelle, [...rollen], false, vorlage);
    // Ohne Kopfzeile waere "Bezeichnung" eine Position mit unlesbarem Preis.
    expect(ohneKopf.positionen).toHaveLength(2);
    expect(ohneKopf.uebersprungen[0]?.grund).toMatch(/Einzelpreis/);
  });

  it('ueberspringt Summenzeilen statt sie zu buchen', () => {
    // Der Fall, der die Rechnung verdoppeln wuerde: Viele Vorlagen haengen
    // die Summen an dieselbe Tabelle an, ohne Bezeichnung.
    const mitSumme: WordTabelle = {
      art: 'tabelle',
      zeilen: [...tabelle.zeilen, ['', '', '', '', '330,00']],
    };
    const { positionen, uebersprungen } = positionenAus(mitSumme, [...rollen], true, vorlage);

    expect(positionen).toHaveLength(2);
    expect(uebersprungen).toHaveLength(1);
    expect(uebersprungen[0]?.grund).toMatch(/Summenzeile/);
  });

  it('nimmt Menge 1 an, wenn keine erkennbar ist', () => {
    const ohneMenge: WordTabelle = {
      art: 'tabelle',
      zeilen: [tabelle.zeilen[0]!, ['Pauschale', '', 'Stk', '450,00', '450,00']],
    };
    const { positionen } = positionenAus(ohneMenge, [...rollen], true, vorlage);
    expect(positionen[0]?.quantity).toBe(1);
  });

  it('nummeriert fortlaufend, auch wenn Zeilen wegfallen', () => {
    // BR-21 verlangt eindeutige Positionsnummern; eine Luecke durch eine
    // uebersprungene Zeile waere ein Mangel im erzeugten Dokument.
    const mitLuecke: WordTabelle = {
      art: 'tabelle',
      zeilen: [
        tabelle.zeilen[0]!,
        ['Erste', '1', 'Stk', '10,00', '10,00'],
        ['', '', '', '', '99,00'],
        ['Zweite', '1', 'Stk', '20,00', '20,00'],
      ],
    };
    const { positionen } = positionenAus(mitLuecke, [...rollen], true, vorlage);
    expect(positionen.map((position) => position.id)).toEqual(['1', '2']);
  });
});
