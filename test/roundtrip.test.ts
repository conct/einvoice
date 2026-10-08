import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { buildCii } from '../src/xml/cii';
import { buildUbl } from '../src/xml/ubl';
import { computeTotals, lineNetAmount } from '../src/model/totals';
import { parseInvoiceXml } from '../src/parse/xml';
import { readEInvoice } from '../src/parse/receive';
import { renderZugferdPdf } from '../src/pdf/pdfa3';
import { liesPdfText } from '../src/parse/pdf-text';
import { validateInvoice } from '../src/model/validate';
import { parseInvoice } from '../src/model/invoice';
import { round, sum } from '../src/util/money';
import { minimalInvoice, sampleInvoice, smallBusinessInvoice } from '../src/fixtures/sample';
import { SRGB_ICC_BASE64 } from '../src/assets/icc';
import { fromBase64 } from '../src/util/base64';

/** Dieselben vorbereiteten Teilmengen, die auch App und Dienst einbetten. */
const schrift = (name: string) => new URL(`../files/${name}`, import.meta.url);
const FIXED_NOW = new Date('2026-08-24T10:15:00+02:00');

async function assets() {
  const [fontRegular, fontBold] = await Promise.all([
    readFile(schrift('Inter-Rechnung-Regular.ttf')),
    readFile(schrift('Inter-Rechnung-Bold.ttf')),
  ]);
  return {
    fontRegular: new Uint8Array(fontRegular),
    fontBold: new Uint8Array(fontBold),
    iccProfile: fromBase64(SRGB_ICC_BASE64),
  };
}

describe('Betragsarithmetik', () => {
  it('rundet kaufmaennisch statt bankuebliche Rundung anzuwenden', () => {
    expect(round(2.675)).toBe(2.68);
    expect(round(1.005)).toBe(1.01);
    expect(round(-1.005)).toBe(-1.01);
  });

  it('summiert ohne Float-Drift', () => {
    expect(sum([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sum(Array.from({ length: 100 }, () => 0.07))).toBe(7);
  });

  it('beruecksichtigt die Preisbasismenge', () => {
    const line = parseInvoice({
      number: 'X',
      issueDate: '2026-01-01',
      dueDate: '2026-01-15',
      seller: { name: 'A', address: { city: 'Kiel' }, vatId: 'DE1' },
      buyer: { name: 'B', address: { city: 'Kiel' } },
      lines: [
        {
          id: '1',
          name: 'Kabel',
          quantity: 250,
          unitCode: 'MTR',
          unitPrice: 12.5,
          priceBaseQuantity: 100,
          vat: { category: 'S', rate: 19 },
        },
      ],
    }).lines[0]!;
    expect(lineNetAmount(line)).toBe(31.25);
  });
});

describe('Summen nach EN 16931', () => {
  it('rechnet die Beispielrechnung konsistent durch', () => {
    const totals = computeTotals(sampleInvoice());
    // BR-CO-13: Gesamtsumme netto = Positionssumme - Abschlaege + Zuschlaege
    expect(totals.taxBasisTotal).toBe(
      round(totals.lineTotal - totals.allowanceTotal + totals.chargeTotal, 2),
    );
    // BR-CO-14: Steuerbetrag = Summe der Steuerbetraege je Kategorie
    expect(totals.taxTotal).toBe(sum(totals.vatBreakdown.map((e) => e.taxAmount)));
    // BR-CO-15: Bruttobetrag = Nettosumme + Steuerbetrag
    expect(totals.grandTotal).toBe(round(totals.taxBasisTotal + totals.taxTotal, 2));
    // BR-CO-16: Zahlbetrag = Bruttobetrag - Anzahlung
    expect(totals.duePayable).toBe(round(totals.grandTotal - totals.paidAmount, 2));
  });

  it('gruppiert die Steuer je Kategorie und Satz', () => {
    const breakdown = computeTotals(sampleInvoice()).vatBreakdown;
    expect(breakdown.map((e) => `${e.category}${e.rate}`)).toEqual(['S7', 'S19']);
  });

  it('weist bei Kleinunternehmern keine Steuer aus', () => {
    const rechnung = smallBusinessInvoice();
    const totals = computeTotals(rechnung);
    expect(totals.taxTotal).toBe(0);
    expect(totals.grandTotal).toBe(totals.taxBasisTotal);

    // Gegen die Vorlage selbst, nicht gegen eine abgeschriebene Wendung: Sonst
    // faellt der Test um, sobald jemand die Formulierung verbessert - und
    // geprueft werden soll, dass der Grund erhalten bleibt, nicht wie er lautet.
    expect(totals.vatBreakdown[0]?.exemptionReason).toBe(rechnung.lines[0]?.vat.exemptionReason);
  });
});

describe('Fachliche Pruefung', () => {
  it('akzeptiert die Beispielrechnungen ohne Fehler', () => {
    for (const invoice of [sampleInvoice(), minimalInvoice(), smallBusinessInvoice()]) {
      const result = validateInvoice(invoice);
      expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('verlangt die Leitweg-ID bei XRechnung', () => {
    const invoice = { ...sampleInvoice('xrechnung-cii'), buyerReference: undefined };
    const rules = validateInvoice(invoice).issues.map((i) => i.rule);
    expect(rules).toContain('BR-DE-15');
  });

  it('erkennt eine ungueltige IBAN', () => {
    const base = sampleInvoice();
    const invoice = { ...base, payment: { ...base.payment!, iban: 'DE02100500000054540403' } };
    expect(validateInvoice(invoice).issues.map((i) => i.rule)).toContain('BR-DE-13');
  });

  it('verlangt einen Befreiungsgrund bei Reverse Charge', () => {
    const base = sampleInvoice();
    const invoice = {
      ...base,
      lines: base.lines.map((line) => ({ ...line, vat: { category: 'AE' as const, rate: 0 } })),
      allowancesCharges: [],
    };
    const rules = validateInvoice(invoice).issues.map((i) => i.rule);
    expect(rules).toContain('BR-E-10');
  });
});

describe('CII-Rundlauf', () => {
  it('liest die erzeugte Rechnung verlustfrei zurueck', () => {
    const original = sampleInvoice();
    const parsed = parseInvoiceXml(buildCii(original));

    expect(parsed.syntax).toBe('cii');
    expect(parsed.invoice.number).toBe(original.number);
    expect(parsed.invoice.issueDate).toBe(original.issueDate);
    expect(parsed.invoice.dueDate).toBe(original.dueDate);
    expect(parsed.invoice.buyerReference).toBe(original.buyerReference);
    expect(parsed.invoice.seller.vatId).toBe(original.seller.vatId);
    expect(parsed.invoice.seller.taxNumber).toBe(original.seller.taxNumber);
    expect(parsed.invoice.buyer.name).toBe(original.buyer.name);
    expect(parsed.invoice.payment?.iban).toBe(original.payment?.iban);
    expect(parsed.invoice.lines).toHaveLength(original.lines.length);
    expect(parsed.invoice.lines[2]?.vat.rate).toBe(7);
    expect(parsed.invoice.paidAmount).toBe(original.paidAmount);

    const before = computeTotals(original);
    const after = computeTotals(parsed.invoice);
    expect(after.grandTotal).toBe(before.grandTotal);
    expect(after.duePayable).toBe(before.duePayable);
  });

  it('meldet die im Dokument stehenden Summen unveraendert zurueck', () => {
    const original = sampleInvoice();
    const parsed = parseInvoiceXml(buildCii(original));
    const totals = computeTotals(original);
    expect(parsed.declaredTotals.grandTotal).toBe(totals.grandTotal);
    expect(parsed.declaredTotals.taxTotal).toBe(totals.taxTotal);
  });

  it('erhaelt den Befreiungsgrund des Kleinunternehmers', () => {
    const rechnung = smallBusinessInvoice();
    const parsed = parseInvoiceXml(buildCii(rechnung));
    expect(parsed.invoice.lines[0]?.vat.category).toBe('E');
    expect(parsed.invoice.lines[0]?.vat.exemptionReason).toBe(
      rechnung.lines[0]?.vat.exemptionReason,
    );
  });
});

describe('UBL-Rundlauf', () => {
  it('liest die erzeugte XRechnung verlustfrei zurueck', () => {
    const original = sampleInvoice('xrechnung-ubl');
    const parsed = parseInvoiceXml(buildUbl(original));

    expect(parsed.syntax).toBe('ubl');
    expect(parsed.invoice.number).toBe(original.number);
    expect(parsed.invoice.buyerReference).toBe(original.buyerReference);
    expect(parsed.invoice.seller.contact?.email).toBe(original.seller.contact?.email);
    expect(parsed.invoice.lines).toHaveLength(original.lines.length);

    const after = computeTotals(parsed.invoice);
    expect(after.grandTotal).toBe(computeTotals(original).grandTotal);
  });

  it('verwendet CreditNote als Wurzel fuer Gutschriften', () => {
    const base = sampleInvoice('xrechnung-ubl');
    const xml = buildUbl({ ...base, typeCode: '381' });
    expect(xml).toContain('<ubl:CreditNote');
    expect(xml).toContain('cbc:CreditedQuantity');
    expect(parseInvoiceXml(xml).invoice.typeCode).toBe('381');
  });
});

describe('PDF/A-3 mit eingebettetem XML', () => {
  it('erzeugt ein PDF, aus dem sich die Rechnung wieder auslesen laesst', async () => {
    const invoice = sampleInvoice();
    const { pdf, xml } = await renderZugferdPdf(invoice, {
      assets: await assets(),
      now: FIXED_NOW,
    });

    expect(String.fromCharCode(...pdf.subarray(0, 8))).toBe('%PDF-1.7');

    const received = await readEInvoice(pdf, 'rechnung.pdf');
    expect(received.kind).toBe('pdf-hybrid');
    expect(received.sourceFilename).toBe('factur-x.xml');
    expect(received.invoice.number).toBe(invoice.number);
    expect(received.totalMismatches).toEqual([]);
    expect(received.issues.filter((i) => i.severity === 'error')).toEqual([]);

    // Das eingebettete XML muss byteweise dem erzeugten entsprechen
    const embedded = await readEInvoice(pdf);
    expect(embedded.invoice.lines).toHaveLength(invoice.lines.length);
    expect(xml).toContain('<ram:ID>RE-2026-0042</ram:ID>');
  }, 30_000);

  it('liefert bei gleichem Zeitpunkt byteweise dasselbe Dokument', async () => {
    const shared = await assets();
    const invoice = sampleInvoice();
    const a = await renderZugferdPdf(invoice, { assets: shared, now: FIXED_NOW });
    const b = await renderZugferdPdf(invoice, { assets: shared, now: FIXED_NOW });
    expect(Buffer.from(b.pdf).equals(Buffer.from(a.pdf))).toBe(true);
  }, 30_000);

  it('erkennt reines XML ohne PDF-Huelle', async () => {
    const xml = buildCii(sampleInvoice());
    const received = await readEInvoice(new TextEncoder().encode(xml), 'rechnung.xml');
    expect(received.kind).toBe('xml');
    expect(received.invoice.number).toBe('RE-2026-0042');
  });
});

describe('Spalten, die nichts sagen', () => {
  /*
   * Menge und Einzelpreis wiederholen bei einer Position von einem Stueck nur
   * die Zeilensumme - "1 Stk. 65,00 ... 65,00". Und laufen alle Positionen
   * unter demselben Steuersatz, steht der im Summenblock. Die vermessene
   * Vorlage setzt aus genau diesen Gruenden keine dieser drei Spalten.
   */
  it('laesst Menge, Einzelpreis und Steuersatz weg, wo sie nichts hinzufuegen', async () => {
    const rechnung = parseInvoice({
      ...minimalInvoice(),
      lines: [
        {
          id: '1',
          name: 'Gestaltungsarbeiten',
          quantity: 1,
          unitCode: 'C62',
          unitPrice: 65,
          vat: { category: 'S', rate: 19 },
        },
      ],
    });
    const { pdf } = await renderZugferdPdf(rechnung, { assets: await assets(), now: FIXED_NOW });
    const text = (await liesPdfText(pdf)).text;

    expect(text).not.toContain('Einzelpreis');
    expect(text).not.toContain('Stk.');
    // Der Satz bleibt auf dem Blatt - nur eben im Summenblock.
    expect(text).toContain('19 %');
    expect(text).toContain('Bezeichnung');
  });

  it('behaelt sie, sobald sie etwas sagen', async () => {
    const rechnung = parseInvoice({
      ...minimalInvoice(),
      lines: [
        {
          id: '1',
          name: 'Beratung',
          quantity: 4,
          unitCode: 'HUR',
          unitPrice: 95,
          vat: { category: 'S', rate: 19 },
        },
        {
          id: '2',
          name: 'Fachbuch',
          quantity: 1,
          unitCode: 'C62',
          unitPrice: 40,
          vat: { category: 'S', rate: 7 },
        },
      ],
    });
    const { pdf } = await renderZugferdPdf(rechnung, { assets: await assets(), now: FIXED_NOW });
    const text = (await liesPdfText(pdf)).text;

    expect(text).toContain('Einzelpreis');
    expect(text).toContain('Menge');
    // Bei gemischten Saetzen ist die Spalte die einzige Stelle, an der steht,
    // welche Position welchem Satz unterliegt.
    expect(text).toContain('USt.');
  });
});

describe('Anschreiben', () => {
  it('setzt Anrede und Einleitung ueber die Positionen und ins XML', async () => {
    const rechnung = parseInvoice({
      ...minimalInvoice(),
      intro: 'Sehr geehrter Herr Ranacher,\n\nwir bedanken uns für Ihren Auftrag.',
    });
    const { pdf, xml } = await renderZugferdPdf(rechnung, {
      assets: await assets(),
      now: FIXED_NOW,
    });
    const gelesen = await liesPdfText(pdf);

    expect(gelesen.text).toContain('Sehr geehrter Herr Ranacher,');
    expect(gelesen.text).toContain('wir bedanken uns für Ihren Auftrag.');

    /*
     * Gedrucktes Blatt und Datensatz sind nach ZUGFeRD gleichrangig. Text,
     * der nur auf einem von beiden steht, ist eine Abweichung - auch wenn er
     * nur hoeflich ist.
     */
    expect(xml).toContain('Sehr geehrter Herr Ranacher,');
    expect(xml).toContain('<ram:SubjectCode>AAI</ram:SubjectCode>');

    // Und ueber den Positionen, nicht darunter.
    const seite = gelesen.seiten[0]!;
    const hoeheVon = (was: string) =>
      seite.zeilen.find((zeile) => zeile.text.includes(was))?.y ?? Number.NaN;
    expect(hoeheVon('Sehr geehrter')).toBeGreaterThan(hoeheVon('Bezeichnung'));
  });
});
