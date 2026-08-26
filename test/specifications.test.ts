import { afterEach, describe, expect, it } from 'vitest';

import {
  BUNDLED_SPECIFICATIONS,
  activeSpecifications,
  parseSpecificationSet,
  resetSpecifications,
  setActiveSpecifications,
  specificationAge,
} from '../src/model/specifications';
import { buildCii } from '../src/xml/cii';
import { buildUbl } from '../src/xml/ubl';
import { validateInvoice } from '../src/model/validate';
import { sampleInvoice, smallBusinessInvoice } from '../src/fixtures/sample';

afterEach(() => resetSpecifications());

describe('Spezifikationskennungen', () => {
  it('verwendet den Namensraum der XRechnung ab 3.0', () => {
    // Regressionsschutz fuer BR-DE-21: bis 2.3 hiess der Namensraum
    // "urn:xoev-de:kosit:standard", seit 3.0 "urn:xeinkauf.de:kosit".
    expect(BUNDLED_SPECIFICATIONS.xrechnung.id).toBe(
      'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
    );
    expect(BUNDLED_SPECIFICATIONS.xrechnung.id).not.toContain('xoev-de');
  });

  it('schreibt die aktive Kennung in CII und UBL', () => {
    const cii = buildCii(sampleInvoice('xrechnung-cii'));
    const ubl = buildUbl(sampleInvoice('xrechnung-ubl'));
    expect(cii).toContain(BUNDLED_SPECIFICATIONS.xrechnung.id);
    expect(ubl).toContain(BUNDLED_SPECIFICATIONS.xrechnung.id);
    expect(buildCii(sampleInvoice())).toContain(BUNDLED_SPECIFICATIONS.zugferdEn16931.id);
  });

  it('uebernimmt einen nachgeladenen Stand in erzeugte Dokumente', () => {
    setActiveSpecifications({
      ...BUNDLED_SPECIFICATIONS,
      label: 'test',
      xrechnung: {
        id: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.1',
        version: '3.1',
      },
    });
    expect(activeSpecifications().xrechnung.version).toBe('3.1');
    expect(buildCii(sampleInvoice('xrechnung-cii'))).toContain('xrechnung_3.1');
  });

  it('weist Kennungen ohne EN-16931-Praefix zurueck', () => {
    const angreifer = {
      ...BUNDLED_SPECIFICATIONS,
      xrechnung: { id: 'https://beliebig.example/kennung', version: '9.9' },
    };
    expect(() => parseSpecificationSet(angreifer)).toThrow(/Praefix/);
  });

  it('weist unvollstaendige Staende zurueck', () => {
    expect(() => parseSpecificationSet(null)).toThrow();
    expect(() =>
      parseSpecificationSet({ ...BUNDLED_SPECIFICATIONS, publishedAt: '24.08.2026' }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it('erkennt einen ueberfaelligen Stand', () => {
    const frisch = specificationAge('2026-09-01');
    expect(frisch.stale).toBe(false);
    expect(frisch.daysUntilStale).toBeGreaterThan(0);

    const alt = specificationAge('2027-10-01');
    expect(alt.stale).toBe(true);
    expect(alt.daysUntilStale).toBeLessThan(0);
    expect(alt.ageInDays).toBeGreaterThan(365);
  });
});

describe('Regeln aus dem Mustang-Lauf', () => {
  it('BR-CO-26: Steuernummer allein identifiziert den Verkaeufer nicht', () => {
    const base = smallBusinessInvoice();
    const ohneKennung = {
      ...base,
      seller: { ...base.seller, identifier: undefined, legalRegistrationId: undefined },
    };
    expect(validateInvoice(ohneKennung).issues.map((i) => i.rule)).toContain('BR-CO-26');

    // Mit Kennung (BT-29) ist die Regel erfuellt, obwohl keine USt-IdNr. vorliegt.
    expect(validateInvoice(base).issues.map((i) => i.rule)).not.toContain('BR-CO-26');
  });

  it('PEPPOL-EN16931-R041: Prozentsatz verlangt einen Basisbetrag', () => {
    const base = sampleInvoice();
    const ohneBasis = {
      ...base,
      lines: base.lines.map((line) => ({
        ...line,
        allowancesCharges: line.allowancesCharges.map((ac) => ({ ...ac, baseAmount: undefined })),
      })),
    };
    expect(validateInvoice(ohneBasis).issues.map((i) => i.rule)).toContain('PEPPOL-EN16931-R041');
    expect(validateInvoice(base).issues.map((i) => i.rule)).not.toContain('PEPPOL-EN16931-R041');
  });

  it('kein leeres Lieferelement ohne Leistungsdatum', () => {
    const base = sampleInvoice();
    const ohneLieferung = {
      ...base,
      deliveryDate: undefined,
      deliveryAddress: undefined,
      deliveryName: undefined,
      periodStart: undefined,
      periodEnd: undefined,
    };
    const xml = buildCii(ohneLieferung);
    expect(xml).toContain('<ram:ApplicableHeaderTradeDelivery/>');
    expect(xml).not.toMatch(
      /<ram:ApplicableHeaderTradeDelivery>\s*<\/ram:ApplicableHeaderTradeDelivery>/,
    );

    // Paragraf 14 UStG: fehlender Leistungszeitpunkt ist eine Warnung, kein Fehler.
    const issues = validateInvoice(ohneLieferung).issues;
    expect(issues.find((i) => i.rule === 'UStG-14-4-6')?.severity).toBe('warning');
  });

  it('die Beispieldaten bleiben fehlerfrei', () => {
    for (const invoice of [sampleInvoice(), smallBusinessInvoice()]) {
      expect(validateInvoice(invoice).issues.filter((i) => i.severity === 'error')).toEqual([]);
    }
  });
});
