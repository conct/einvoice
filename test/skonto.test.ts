import { describe, expect, it } from 'vitest';

import { buildCii } from '../src/xml/cii';
import { buildUbl } from '../src/xml/ubl';
import { parseInvoice } from '../src/model/invoice';
import { parseInvoiceXml } from '../src/parse/xml';
import { validateInvoice } from '../src/model/validate';
import {
  liesZahlungsbedingungen,
  skontobetrag,
  skontofrist,
  skontosatz,
  skontozeile,
  zahlungsbedingungen,
} from '../src/model/skonto';
import { sampleInvoice } from '../src/fixtures/sample';

describe('Schreibweise der XRechnung', () => {
  it('schreibt eine Stufe mit zwei Nachkommastellen und Punkt', () => {
    expect(skontozeile({ tage: 14, prozent: 2 })).toBe('#SKONTO#TAGE=14#PROZENT=2.00#');
    expect(skontozeile({ tage: 7, prozent: 2.5 })).toBe('#SKONTO#TAGE=7#PROZENT=2.50#');
  });

  it('nimmt den Basisbetrag mit, wenn einer dabeisteht', () => {
    expect(skontozeile({ tage: 30, prozent: 1, basisbetrag: 1000 })).toBe(
      '#SKONTO#TAGE=30#PROZENT=1.00#BASISBETRAG=1000.00#',
    );
  });

  it('setzt die Stufen vor den freien Text', () => {
    const bt20 = zahlungsbedingungen({
      terms: 'Zahlbar ohne Abzug bis zum 31.12.2026.',
      skonto: [
        { tage: 10, prozent: 3 },
        { tage: 20, prozent: 1 },
      ],
    });
    expect(bt20).toBe(
      '#SKONTO#TAGE=10#PROZENT=3.00#\n' +
        '#SKONTO#TAGE=20#PROZENT=1.00#\n' +
        'Zahlbar ohne Abzug bis zum 31.12.2026.',
    );
  });

  /*
   * BR-DE-18 verlangt hinter dem letzten Block einen Zeilenumbruch, auch ohne
   * folgenden Text. Der Pruefer der KoSIT weist eine Rechnung ohne ihn ab -
   * am 23.11.2026 gegen XRechnung 3.0.2 nachgesehen.
   */
  it('schliesst die letzte Stufe mit einem Zeilenumbruch ab', () => {
    expect(zahlungsbedingungen({ skonto: [{ tage: 14, prozent: 2 }] })).toBe(
      '#SKONTO#TAGE=14#PROZENT=2.00#\n',
    );
  });

  it('laesst BT-20 leer, wenn es nichts zu sagen gibt', () => {
    expect(zahlungsbedingungen({})).toBeUndefined();
    expect(zahlungsbedingungen({ terms: '   ' })).toBeUndefined();
  });
});

describe('Zahlungsbedingungen lesen', () => {
  it('findet die Stufen wieder und laesst den Text stehen', () => {
    const gelesen = liesZahlungsbedingungen(
      '#SKONTO#TAGE=14#PROZENT=2.00#\nZahlbar ohne Abzug bis zum 31.12.2026.',
    );
    expect(gelesen.skonto).toEqual([{ tage: 14, prozent: 2 }]);
    expect(gelesen.terms).toBe('Zahlbar ohne Abzug bis zum 31.12.2026.');
  });

  it('liest den Basisbetrag mit', () => {
    expect(liesZahlungsbedingungen('#SKONTO#TAGE=30#PROZENT=1.50#BASISBETRAG=800.00#').skonto).toEqual(
      [{ tage: 30, prozent: 1.5, basisbetrag: 800 }],
    );
  });

  it('ist bei fremden Dateien nachsichtig', () => {
    const gelesen = liesZahlungsbedingungen('  #skonto#tage=7 # prozent=3,00 #  ');
    expect(gelesen.skonto).toEqual([{ tage: 7, prozent: 3 }]);
  });

  /*
   * Der wichtige Fall: Eine Zeile, die aussieht wie Skonto, aber unbrauchbare
   * Zahlen traegt, darf keine erfundene Stufe werden. Sie bleibt Text - dann
   * sieht der Mensch, dass dort etwas steht, und niemand zieht einen Betrag
   * ab, den die Datei nicht hergibt.
   */
  it('macht aus Unsinn keine Stufe, sondern laesst ihn als Text stehen', () => {
    for (const unsinn of [
      '#SKONTO#TAGE=0#PROZENT=2.00#',
      '#SKONTO#TAGE=14#PROZENT=0#',
      '#SKONTO#TAGE=14#PROZENT=200.00#',
      '#SKONTO#TAGE=1.5#PROZENT=2.00#',
      '#SKONTO#PROZENT=2.00#',
      '#SKONTO#TAGE=14#',
    ]) {
      const gelesen = liesZahlungsbedingungen(unsinn);
      expect(gelesen.skonto, unsinn).toBeUndefined();
      expect(gelesen.terms, unsinn).toBe(unsinn);
    }
  });

  it('kommt mit leerer Angabe zurecht', () => {
    expect(liesZahlungsbedingungen(undefined)).toEqual({});
    expect(liesZahlungsbedingungen('')).toEqual({});
  });
});

describe('Rechnen und Anzeigen', () => {
  it('rechnet den Abzug auf den Zahlbetrag', () => {
    expect(skontobetrag({ tage: 14, prozent: 2 }, 119)).toBe(2.38);
  });

  it('nimmt den Basisbetrag, wenn einer gesetzt ist', () => {
    expect(skontobetrag({ tage: 14, prozent: 2, basisbetrag: 100 }, 119)).toBe(2);
  });

  it('zaehlt die Tage ab dem Rechnungsdatum', () => {
    expect(skontofrist({ tage: 14, prozent: 2 }, '2026-11-23')).toBe('2026-12-07');
  });

  it('schreibt einen Satz, den ein Mensch lesen kann', () => {
    const satz = skontosatz([{ tage: 14, prozent: 2 }], {
      rechnungsdatum: '2026-11-23',
      zahlbetrag: 119,
      waehrung: 'EUR',
      faelligAm: '2026-12-21',
    });
    expect(satz).toBe(
      'Bei Zahlung bis 07.12.2026 abzüglich 2 % Skonto (2,38 EUR) = 116,62 EUR, ' +
        'sonst bis 21.12.2026 ohne Abzug.',
    );
  });

  it('ordnet mehrere Stufen nach Tagen', () => {
    const satz = skontosatz(
      [
        { tage: 20, prozent: 1 },
        { tage: 10, prozent: 3 },
      ],
      { rechnungsdatum: '2026-11-23', zahlbetrag: 100, waehrung: 'EUR' },
    );
    expect(satz).toMatch(/^Bei Zahlung bis 03\.12\.2026 abzüglich 3 % Skonto \(3,00 EUR\) = 97,00 EUR/);
    expect(satz).toMatch(/bis 13\.12\.2026 abzüglich 1 % \(1,00 EUR\) = 99,00 EUR/);
    expect(satz).toMatch(/sonst ohne Abzug\.$/);
  });
});

describe('Skonto im Dokument', () => {
  const mitSkonto = () => {
    const roh = sampleInvoice();
    return parseInvoice({
      ...roh,
      payment: {
        ...roh.payment,
        terms: 'Zahlbar ohne Abzug bis zum Fälligkeitstag.',
        skonto: [{ tage: 14, prozent: 2 }],
      },
    });
  };

  it('steht im CII in der Beschreibung der Zahlungsbedingungen', () => {
    const xml = buildCii(mitSkonto());
    expect(xml).toContain('#SKONTO#TAGE=14#PROZENT=2.00#');
    expect(xml).toMatch(/<ram:Description>#SKONTO#/);
  });

  it('steht im UBL in der Anmerkung zu den Zahlungsbedingungen', () => {
    const xml = buildUbl(mitSkonto());
    expect(xml).toContain('#SKONTO#TAGE=14#PROZENT=2.00#');
    expect(xml).toMatch(/<cbc:Note>#SKONTO#/);
  });

  it('ueberlebt den Weg hinaus und zurueck', () => {
    for (const xml of [buildCii(mitSkonto()), buildUbl(mitSkonto())]) {
      const gelesen = parseInvoiceXml(xml);
      expect(gelesen.invoice.payment?.skonto).toEqual([{ tage: 14, prozent: 2 }]);
      expect(gelesen.invoice.payment?.terms).toBe('Zahlbar ohne Abzug bis zum Fälligkeitstag.');
    }
  });

  it('warnt vor einer Textzeile, die mit # beginnt', () => {
    const roh = sampleInvoice();
    const rechnung = parseInvoice({
      ...roh,
      payment: {
        ...roh.payment,
        terms: 'Nachtrag zur Bestellung\n#2 gilt zusätzlich.',
        skonto: [{ tage: 14, prozent: 2 }],
      },
    });
    const befund = validateInvoice(rechnung);
    const treffer = befund.issues.filter((i) => i.rule === 'BR-DE-18');
    expect(treffer).toHaveLength(1);
    expect(treffer[0]?.severity).toBe('error');
    expect(treffer[0]?.path).toBe('payment.terms');
  });

  it('nimmt eine gewoehnliche Textzeile nicht uebel', () => {
    expect(
      validateInvoice(mitSkonto()).issues.filter((i) => i.rule === 'BR-DE-18'),
    ).toHaveLength(0);
  });

  it('weist unbrauchbare Angaben schon im Modell ab', () => {
    const roh = sampleInvoice();
    for (const stufe of [
      { tage: 0, prozent: 2 },
      { tage: 14, prozent: 0 },
      { tage: 14, prozent: 101 },
      { tage: 14.5, prozent: 2 },
      { tage: 14, prozent: 2, basisbetrag: -1 },
    ]) {
      expect(() =>
        parseInvoice({ ...roh, payment: { ...roh.payment, skonto: [stufe] } }),
      ).toThrow();
    }
  });
});
