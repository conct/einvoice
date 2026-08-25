import { describe, expect, it } from 'vitest';

import { folgedokument } from '../src/model/folgedokument';
import { parseInvoice } from '../src/model/invoice';
import { validateInvoice } from '../src/model/validate';
import { computeTotals } from '../src/model/totals';
import { sampleInvoice } from '../src/fixtures/sample';

const HEUTE = '2026-08-25';

/** Wie in der App: die Nummer entsteht erst beim Festschreiben. */
const mitNummer = (entwurf: ReturnType<typeof folgedokument>, nummer: string) =>
  parseInvoice({ ...entwurf, number: nummer });

describe('Storno', () => {
  it('verweist auf die Ursprungsrechnung und traegt die Art 381', () => {
    const storno = mitNummer(folgedokument(sampleInvoice(), 'storno', HEUTE), 'ST-2026-1');

    expect(storno.typeCode).toBe('381');
    expect(storno.precedingInvoice?.number).toBe('RE-2026-0042');
    expect(storno.issueDate).toBe(HEUTE);
  });

  it('behaelt positive Betraege - das Vorzeichen traegt die Dokumentart', () => {
    // Eine Gutschrift ueber minus 640 Euro waere eine doppelte Verneinung: Der
    // Empfaenger wuesste nicht, in welche Richtung sie wirkt. Nachgemessen
    // gegen Mustang: Art 381 mit positiven Betraegen verletzt keine der 180
    // Schematron-Regeln.
    const ursprung = sampleInvoice();
    const storno = mitNummer(folgedokument(ursprung, 'storno', HEUTE), 'ST-2026-1');

    expect(computeTotals(storno).grandTotal).toBe(computeTotals(ursprung).grandTotal);
    expect(storno.lines.every((line) => line.unitPrice >= 0)).toBe(true);
  });

  it('traegt eine eigene Nummer und nicht die der Ursprungsrechnung', () => {
    const entwurf = folgedokument(sampleInvoice(), 'storno', HEUTE);
    expect(entwurf.number).toBe('');
  });

  it('nennt die Ursprungsrechnung im Text', () => {
    const entwurf = folgedokument(sampleInvoice(), 'storno', HEUTE);
    expect(entwurf.notes?.[0]?.text).toContain('RE-2026-0042');
  });

  it('schleppt die Anhaenge der Ursprungsrechnung nicht mit', () => {
    const entwurf = folgedokument(sampleInvoice(), 'storno', HEUTE);
    expect(entwurf.attachments).toEqual([]);
  });

  it('erfuellt die fachlichen Regeln', () => {
    const storno = mitNummer(folgedokument(sampleInvoice(), 'storno', HEUTE), 'ST-2026-1');
    const fehler = validateInvoice(storno).issues.filter((i) => i.severity === 'error');
    expect(fehler).toEqual([]);
  });
});

describe('Korrektur', () => {
  it('traegt die Art 384 und den Verweis', () => {
    const korrektur = mitNummer(folgedokument(sampleInvoice(), 'korrektur', HEUTE), 'KO-2026-1');

    expect(korrektur.typeCode).toBe('384');
    expect(korrektur.precedingInvoice?.number).toBe('RE-2026-0042');
  });

  it('erfuellt die fachlichen Regeln', () => {
    const korrektur = mitNummer(folgedokument(sampleInvoice(), 'korrektur', HEUTE), 'KO-2026-1');
    const fehler = validateInvoice(korrektur).issues.filter((i) => i.severity === 'error');
    expect(fehler).toEqual([]);
  });

  it('behaelt Positionen und Empfaenger zum Bearbeiten', () => {
    const ursprung = sampleInvoice();
    const korrektur = mitNummer(folgedokument(ursprung, 'korrektur', HEUTE), 'KO-2026-1');

    expect(korrektur.lines).toHaveLength(ursprung.lines.length);
    expect(korrektur.buyer.name).toBe(ursprung.buyer.name);
  });
});

describe('Der Verweis ist Pflicht', () => {
  it('beanstandet ein Storno ohne Bezug zur Ursprungsrechnung', () => {
    // Der Gegenbeweis zu den Tests oben: Faellt der Verweis weg, muss die
    // Pruefung anschlagen - sonst prueft sie ihn gar nicht.
    const ohneBezug = parseInvoice({
      ...folgedokument(sampleInvoice(), 'storno', HEUTE),
      number: 'ST-2026-1',
      precedingInvoice: undefined,
    });

    const regeln = validateInvoice(ohneBezug).issues.map((i) => i.rule);
    expect(regeln.some((regel) => regel.includes('BR-'))).toBe(true);
  });
});
