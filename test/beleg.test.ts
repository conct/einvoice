import { describe, expect, it } from 'vitest';

import { betragAus, datumAus, liesBeleg, vollstaendig, type Belegdaten } from '../src/parse/beleg';

/*
 * Die Texte stammen nicht aus der Luft: So sieht aus, was eine Texterkennung
 * von einer deutschen Papierrechnung liefert - ohne Tabellenstruktur, mit
 * zusammengelaufenen Spalten, teils mit Erkennungsfehlern.
 */
const HANDWERKER = `
Elektro Brandt GmbH
Lange Reihe 14
20099 Hamburg

Rechnung Nr. 2026-0417
Rechnungsdatum: 12.11.2026
Kundennummer: 4711

Pos Leistung Menge Preis Betrag
1 Arbeitszeit Monteur 6,5 Std 58,00 377,00
2 Material laut Anlage 1 124,60 124,60

Nettobetrag 501,60
zzgl. 19 % MwSt. 95,30
Gesamtbetrag 596,90 EUR

Zahlbar bis 26.11.2026 ohne Abzug.
Bankverbindung: DE02100500000054540402
USt-IdNr. DE 812 345 678
`;

const KLEINUNTERNEHMER = `
Gartenpflege Sievers
Dorfstrasse 3
24340 Eckernfoerde

RECHNUNG

Beleg-Nr. GS-2026-88
Datum 03.10.2026

Heckenschnitt und Abfuhr 240,00

Gesamtbetrag 240,00 EUR
Kein Ausweis der Umsatzsteuer gemaess Paragraf 19 UStG.
Steuernummer: 20/123/45678
Zahlbar innerhalb von 14 Tagen.
`;

describe('Zahlen und Daten lesen', () => {
  it('liest deutsche und englische Schreibweise', () => {
    expect(betragAus('Gesamtbetrag 1.234,56 EUR')).toBe(1234.56);
    expect(betragAus('Total 1,234.56')).toBe(1234.56);
    expect(betragAus('Betrag 596,90')).toBe(596.9);
    expect(betragAus('Summe 240')).toBe(240);
    // Ohne Nachkommastellen sind Punkt und Komma Tausendertrenner.
    expect(betragAus('Summe 12.500')).toBe(12500);
    expect(betragAus('ohne Zahl')).toBeUndefined();
  });

  it('nimmt die letzte Zahl der Zeile - der Betrag steht rechts', () => {
    expect(betragAus('zzgl. 19 % MwSt. 95,30')).toBe(95.3);
    expect(betragAus('1 Arbeitszeit Monteur 6,5 Std 58,00 377,00')).toBe(377);
  });

  it('liest Datumsangaben und weist unmoegliche ab', () => {
    expect(datumAus('Rechnungsdatum: 12.11.2026')).toBe('2026-11-12');
    expect(datumAus('vom 3.1.26')).toBe('2026-01-03');
    expect(datumAus('2026-11-12')).toBe('2026-11-12');
    expect(datumAus('31.02.2026')).toBeUndefined();
    expect(datumAus('kein Datum')).toBeUndefined();
  });
});

describe('Eine Handwerkerrechnung lesen', () => {
  const befund = liesBeleg(HANDWERKER, '2026-11-26');
  const v = befund.vorschlag;

  it('findet Nummer, Datum und Frist', () => {
    expect(v.nummer).toBe('2026-0417');
    expect(v.datum).toBe('2026-11-12');
    expect(v.faellig).toBe('2026-11-26');
  });

  it('findet die Betraege und rechnet sie gegeneinander', () => {
    expect(v.netto).toBe(501.6);
    expect(v.steuer).toBe(95.3);
    expect(v.brutto).toBe(596.9);
    expect(v.waehrung).toBe('EUR');
    /*
     * Der Punkt der ganzen Uebung: 501,60 + 95,30 = 596,90. Geht die Probe
     * auf, ist der Betrag kein geratener Wert mehr.
     */
    expect(befund.funde.find((f) => f.feld === 'brutto')?.sicherheit).toBe('geprueft');
  });

  it('prueft die IBAN mit der Pruefsumme und nennt sie deshalb geprueft', () => {
    expect(v.iban).toBe('DE02100500000054540402');
    expect(befund.funde.find((f) => f.feld === 'iban')?.sicherheit).toBe('geprueft');
  });

  /*
   * Auf dem Blatt steht die IBAN in Vierergruppen. Wortweise gesucht, wie es
   * zuerst geschah, findet man sie nie - aufgefallen beim Durchlauf mit einem
   * echten Belegbild.
   */
  it('findet die IBAN auch in Vierergruppen', () => {
    const mitGruppen = liesBeleg('Bankverbindung: DE02 1005 0000 0054 5404 02');
    expect(mitGruppen.vorschlag.iban).toBe('DE02100500000054540402');
  });

  it('nimmt keine Zahlenkolonne fuer eine IBAN', () => {
    expect(liesBeleg('Kundennummer 4711 Auftrag 2026 0417 0001').vorschlag.iban).toBeUndefined();
  });

  it('liest die USt-IdNr. auch mit Leerzeichen', () => {
    expect(v.ustId).toBe('DE812345678');
  });

  /*
   * Der Absender ist die oberste brauchbare Zeile. Das ist schwach, und
   * genau deshalb steht es als "geraten" da - die Oberflaeche zeigt das Feld
   * zum Nachbessern.
   */
  it('raet den Absender aus dem Briefkopf und sagt, dass es geraten ist', () => {
    expect(v.absender).toBe('Elektro Brandt GmbH');
    expect(befund.funde.find((f) => f.feld === 'absender')?.sicherheit).toBe('geraten');
  });

  it('nennt zu jedem Fund die Zeile, in der er stand', () => {
    expect(befund.funde.find((f) => f.feld === 'brutto')?.beleg).toBe('Gesamtbetrag 596,90 EUR');
    expect(befund.hinweise).toEqual([]);
  });
});

describe('Eine Kleinunternehmerrechnung lesen', () => {
  const befund = liesBeleg(KLEINUNTERNEHMER, '2026-11-26');
  const v = befund.vorschlag;

  it('findet Nummer und Betrag ohne Steuerzeile', () => {
    expect(v.nummer).toBe('GS-2026-88');
    expect(v.datum).toBe('2026-10-03');
    expect(v.brutto).toBe(240);
    expect(v.steuer).toBeUndefined();
  });

  /* Ohne Datum im Text, aber mit Zahlungsziel in Tagen. */
  it('rechnet ein Zahlungsziel in Tagen auf ein Datum um', () => {
    expect(v.faellig).toBe('2026-10-17');
    expect(befund.funde.find((f) => f.feld === 'faellig')?.sicherheit).toBe('geraten');
  });

  /* Kleinunternehmer haben keine USt-IdNr. - die Steuernummer ist alles. */
  it('findet die Steuernummer', () => {
    expect(v.steuernummer).toBe('20/123/45678');
    expect(v.ustId).toBeUndefined();
  });
});

describe('Was fehlt, wird gesagt', () => {
  it('meldet fehlende Pflichtangaben, statt sie zu erfinden', () => {
    const befund = liesBeleg('Irgendein Zettel ohne alles');
    expect(befund.hinweise).toContain('Kein Rechnungsbetrag gefunden.');
    expect(befund.hinweise).toContain('Keine Rechnungsnummer gefunden.');
    expect(befund.hinweise).toContain('Kein Rechnungsdatum gefunden.');
    expect(vollstaendig(befund.vorschlag)).toBe(false);
  });

  it('meldet, wenn Netto und Steuer nicht zum Betrag passen', () => {
    const befund = liesBeleg(`
      Rechnung Nr. 5
      Datum 01.11.2026
      Nettobetrag 100,00
      zzgl. 19 % MwSt. 19,00
      Gesamtbetrag 219,00
    `);
    expect(befund.hinweise.join(' ')).toMatch(/ergeben 119\.00/);
    expect(befund.funde.find((f) => f.feld === 'brutto')?.sicherheit).toBe('muster');
  });

  it('meldet ein Zahlungsziel vor dem Rechnungsdatum', () => {
    const befund = liesBeleg(`
      Rechnung Nr. 7
      Rechnungsdatum 10.11.2026
      Zahlbar bis 01.11.2026
      Gesamtbetrag 50,00
    `);
    expect(befund.hinweise.join(' ')).toMatch(/vor dem Rechnungsdatum/);
  });

  it('meldet ein Rechnungsdatum in der Zukunft', () => {
    const befund = liesBeleg('Rechnung Nr. 8\nRechnungsdatum 10.11.2027\nGesamtbetrag 50,00', '2026-11-26');
    expect(befund.hinweise.join(' ')).toMatch(/Zukunft/);
  });

  it('haelt einen Vorschlag erst mit Nummer, Datum, Absender und Betrag fuer vollstaendig', () => {
    const fast: Partial<Belegdaten> = { nummer: '1', datum: '2026-11-01', waehrung: 'EUR' };
    expect(vollstaendig(fast)).toBe(false);
    expect(vollstaendig({ ...fast, absender: 'Jemand', brutto: 10 })).toBe(true);
    expect(vollstaendig({ ...fast, absender: 'Jemand', brutto: 0 })).toBe(false);
  });
});
