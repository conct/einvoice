import { describe, expect, it } from 'vitest';

import { istKassenbonCode, liesKassenbonCode } from '../src/parse/kassenbon';

/*
 * Der Code, wie ihn eine Kasse auf den Bon druckt - hier mit den Zahlen des
 * Kaufland-Bons vom 16.10.2026, an dem die Texterkennung dreimal
 * unterschiedlich scheiterte: 61,51 zu 19 %, 4,30 zu 7 %, zusammen 65,81.
 *
 * Die Zeitangabe steht in UTC, 16:00:35 Z sind 18:00:35 in Mitteleuropa.
 */
const BON =
  'V0;KAS-0001;Kassenbeleg-V1;Beleg^61.51_4.30_0.00_0.00_0.00^65.81:Unbar;91385;4711;'
  + '2026-10-16T15:58:12.000Z;2026-10-16T16:00:35.000Z;ecdsa-plain-SHA256;unixTime;MEUCIQ...;MFkwEw...';

describe('Den QR-Code eines Kassenbons lesen', () => {
  const bon = liesKassenbonCode(BON);

  it('erkennt ihn ueberhaupt als Kassenbeleg', () => {
    expect(istKassenbonCode(BON)).toBe(true);
    expect(istKassenbonCode('4006381333931')).toBe(false);
    expect(istKassenbonCode('https://beispiel.de/bon/4711')).toBe(false);
    expect(liesKassenbonCode('irgendwas')).toBeUndefined();
  });

  /*
   * DER PUNKT DER UEBUNG: Diese Zahlen sind nicht gelesen, sondern von der
   * Kasse geschrieben. Keine Texterkennung dazwischen.
   */
  it('nennt die Betraege je Steuersatz', () => {
    expect(bon?.saetze).toEqual([
      { satz: 19, brutto: 61.51, netto: 51.69, steuer: 9.82 },
      { satz: 7, brutto: 4.3, netto: 4.02, steuer: 0.28 },
    ]);
  });

  it('rechnet sie zusammen', () => {
    expect(bon?.brutto).toBe(65.81);
    expect(bon?.netto).toBe(55.71);
    expect(bon?.steuer).toBe(10.1);
  });

  /* Saetze ohne Umsatz stehen zwar im Code, gehoeren aber in keinen Beleg. */
  it('laesst die leeren Saetze weg', () => {
    expect(bon?.saetze).toHaveLength(2);
  });

  it('liest Kasse, Vorgangsnummer und Zeitpunkt', () => {
    expect(bon?.kasse).toBe('KAS-0001');
    expect(bon?.vorgang).toBe('91385');
    expect(bon?.zeitpunkt).toBe('2026-10-16T16:00:35.000Z');
    expect(bon?.datum).toBe('2026-10-16');
  });

  it('liest die Zahlungen', () => {
    expect(bon?.zahlungen).toEqual([{ betrag: 65.81, art: 'Unbar' }]);
  });

  it('hat nichts zu bemaengeln', () => {
    expect(bon?.hinweise).toEqual([]);
  });
});

describe('Was der Code selbst hergibt', () => {
  /*
   * Die einzige Probe, die ohne Zertifikat moeglich ist: Was bezahlt wurde,
   * muss dem entsprechen, was sich auf die Steuersaetze verteilt.
   */
  it('meldet, wenn Zahlungen und Steuersaetze nicht zusammenpassen', () => {
    const bon = liesKassenbonCode(
      'V0;KAS-0001;Kassenbeleg-V1;Beleg^61.51_4.30_0.00_0.00_0.00^12.00:Bar;91385;1;'
      + '2026-10-16T12:00:00.000Z;2026-10-16T12:00:00.000Z;ecdsa-plain-SHA256;unixTime;s;k',
    );
    expect(bon?.brutto).toBe(65.81);
    expect(bon?.hinweise.join(' ')).toMatch(/Zahlungen ergeben 12\.00/);
  });

  it('kommt mit mehreren Zahlungen zurecht', () => {
    const bon = liesKassenbonCode(
      'V0;KAS-0001;Kassenbeleg-V1;Beleg^11.90_0.00_0.00_0.00_0.00^5.00:Bar_6.90:Unbar;7;1;'
      + '2026-10-16T12:00:00.000Z;2026-10-16T12:00:00.000Z;ecdsa-plain-SHA256;unixTime;s;k',
    );
    expect(bon?.zahlungen).toHaveLength(2);
    expect(bon?.hinweise).toEqual([]);
  });

  /* Die Waehrung haengt bei Fremdwaehrungen als drittes Stueck an. */
  it('stoert sich nicht an einer angehaengten Waehrung', () => {
    const bon = liesKassenbonCode(
      'V0;KAS-0001;Kassenbeleg-V1;Beleg^11.90_0.00_0.00_0.00_0.00^11.90:Bar:EUR;7;1;'
      + '2026-10-16T12:00:00.000Z;2026-10-16T12:00:00.000Z;ecdsa-plain-SHA256;unixTime;s;k',
    );
    expect(bon?.zahlungen).toEqual([{ betrag: 11.9, art: 'Bar' }]);
  });

  /*
   * Ein Storno ist bei der TSE ein gewoehnlicher Beleg mit negativen
   * Betraegen - kein eigener Vorgangstyp.
   */
  it('liest einen Storno mit negativen Betraegen', () => {
    const bon = liesKassenbonCode(
      'V0;KAS-0001;Kassenbeleg-V1;Beleg^-11.90_0.00_0.00_0.00_0.00^-11.90:Bar;8;1;'
      + '2026-10-16T12:00:00.000Z;2026-10-16T12:00:00.000Z;ecdsa-plain-SHA256;unixTime;s;k',
    );
    expect(bon?.brutto).toBe(-11.9);
    expect(bon?.saetze[0]?.steuer).toBe(-1.9);
  });

  /* Ein anderer Vorgangstyp ist kein Kassenbeleg - etwa eine Bestellung. */
  it('nimmt nur Kassenbelege', () => {
    expect(
      liesKassenbonCode('V0;KAS-0001;Bestellung-V1;Bestellung^1^;7;1;a;b;c;d;e;f'),
    ).toBeUndefined();
  });
});
