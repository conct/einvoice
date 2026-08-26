import { describe, expect, it } from 'vitest';

import {
  beschriftungenMit,
  istBrauchbareBeschriftung,
  nurAbweichungen,
  STANDARD_BESCHRIFTUNGEN,
} from '../src/pdf/beschriftungen';

describe('beschriftungenMit', () => {
  it('uebernimmt die eigene Wortwahl', () => {
    // So steht es auf einer echten Fremdrechnung.
    const wort = beschriftungenMit({
      rechnungsnummer: 'Rechnungs-Nr.',
      kundennummer: 'Kunden-Nr.',
    });

    expect(wort.rechnungsnummer).toBe('Rechnungs-Nr.');
    expect(wort.kundennummer).toBe('Kunden-Nr.');
    // Alles Uebrige bleibt bei der Vorgabe.
    expect(wort.rechnungsdatum).toBe('Rechnungsdatum');
  });

  it('ersetzt Unbrauchbares durch die Vorgabe, statt es zu uebernehmen', () => {
    /*
     * Eine leere Beschriftung liesse einen Wert ohne Erklaerung stehen - eine
     * Nummer, von der niemand weiss, welche es ist.
     */
    const wort = beschriftungenMit({
      rechnungsnummer: '   ',
      kundennummer: 'x'.repeat(80),
      betrag: 'Zeile\neins',
    });

    expect(wort.rechnungsnummer).toBe('Rechnungsnummer');
    expect(wort.kundennummer).toBe('Kundennummer');
    expect(wort.betrag).toBe('Betrag');
  });

  it('liefert ohne Angabe den vollstaendigen Standardsatz', () => {
    expect(beschriftungenMit()).toEqual(STANDARD_BESCHRIFTUNGEN);
    expect(beschriftungenMit({})).toEqual(STANDARD_BESCHRIFTUNGEN);
  });
});

describe('nurAbweichungen', () => {
  it('speichert nur, was vom Standard abweicht', () => {
    /*
     * Den ganzen Satz abzulegen waere der Fehler, den man erst Jahre spaeter
     * bemerkt: Eine verbesserte Vorgabe erreichte niemanden mehr.
     */
    const abweichend = nurAbweichungen({
      rechnungsnummer: 'Rechnungs-Nr.',
      rechnungsdatum: 'Rechnungsdatum',
      projekt: '  ',
    });

    expect(abweichend).toEqual({ rechnungsnummer: 'Rechnungs-Nr.' });
  });
});

describe('istBrauchbareBeschriftung', () => {
  it('weist Leeres, Langes und Umbrueche ab', () => {
    expect(istBrauchbareBeschriftung('Rechnung Nr.')).toBe(true);
    expect(istBrauchbareBeschriftung('')).toBe(false);
    expect(istBrauchbareBeschriftung('  ')).toBe(false);
    expect(istBrauchbareBeschriftung('a'.repeat(41))).toBe(false);
    expect(istBrauchbareBeschriftung('zwei\nZeilen')).toBe(false);
    expect(istBrauchbareBeschriftung(undefined)).toBe(false);
  });
});
