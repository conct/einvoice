import { describe, expect, it } from 'vitest';

import { istKleinunternehmerRechnung } from '../src/model/kleinunternehmer';
import { parseInvoice } from '../src/model/invoice';
import { sampleInvoice, smallBusinessInvoice } from '../src/fixtures/sample';

/**
 * Die Erkennung entscheidet ueber Geld: Sie sagt, welche Rechnung ohne
 * Bezahlung entstehen darf. Geprueft wird deshalb vor allem, dass sie sich
 * nicht ueberreden laesst - eine Erkennung, die zu grosszuegig ist,
 * verschenkt das Produkt.
 */
describe('Rechnung ohne Umsatzsteuerausweis erkennen', () => {
  it('erkennt eine Kleinunternehmerrechnung', () => {
    expect(istKleinunternehmerRechnung(smallBusinessInvoice())).toBe(true);
  });

  it('erkennt eine Rechnung mit Umsatzsteuer nicht als steuerfrei', () => {
    expect(istKleinunternehmerRechnung(sampleInvoice())).toBe(false);
  });

  it('faellt heraus, sobald eine einzige Position Umsatzsteuer traegt', () => {
    const rechnung = smallBusinessInvoice();
    const gemischt = parseInvoice({
      ...rechnung,
      lines: [
        ...rechnung.lines,
        {
          id: '2',
          name: 'Beratung',
          quantity: 1,
          unitPrice: 100,
          vat: { category: 'S', rate: 19 },
        },
      ],
    });

    expect(istKleinunternehmerRechnung(gemischt)).toBe(false);
  });

  it('verlangt einen Befreiungsgrund, nicht nur den Satz null', () => {
    // Kategorie E ohne Grund ist keine gueltige Befreiung - und waere sonst
    // der einfachste Weg, die Freimenge zu erschleichen.
    const rechnung = smallBusinessInvoice();
    const ohneGrund = parseInvoice({
      ...rechnung,
      lines: rechnung.lines.map((line) => ({
        ...line,
        vat: { category: 'E' as const, rate: 0 },
      })),
    });

    expect(istKleinunternehmerRechnung(ohneGrund)).toBe(false);
  });

  it('zaehlt andere Befreiungen nicht mit', () => {
    // Innergemeinschaftliche Lieferung ist ebenfalls steuerfrei, aber eine
    // andere Befreiung und eine andere Zielgruppe.
    const rechnung = smallBusinessInvoice();
    const innergemeinschaftlich = parseInvoice({
      ...rechnung,
      lines: rechnung.lines.map((line) => ({
        ...line,
        vat: {
          category: 'AE' as const,
          rate: 0,
          exemptionReason: 'Steuerschuldnerschaft des Leistungsempfaengers.',
        },
      })),
    });

    expect(istKleinunternehmerRechnung(innergemeinschaftlich)).toBe(false);
  });

  it('faellt heraus, wenn ein Abschlag Umsatzsteuer traegt', () => {
    const rechnung = smallBusinessInvoice();
    const mitAbschlag = parseInvoice({
      ...rechnung,
      allowancesCharges: [
        {
          isCharge: false,
          amount: 10,
          reason: 'Skonto',
          vat: { category: 'S', rate: 19 },
        },
      ],
    });

    expect(istKleinunternehmerRechnung(mitAbschlag)).toBe(false);
  });

  it('erkennt eine Rechnung ohne Positionen nicht als steuerfrei', () => {
    const rechnung = smallBusinessInvoice();
    expect(istKleinunternehmerRechnung({ ...rechnung, lines: [] })).toBe(false);
  });
});
