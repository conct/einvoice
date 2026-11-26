import { describe, expect, it } from 'vitest';

import { buildCii } from '../src/xml/cii';
import { buildUbl } from '../src/xml/ubl';
import { parseInvoice } from '../src/model/invoice';
import { parseInvoiceXml } from '../src/parse/xml';
import { validateInvoice } from '../src/model/validate';
import { waehrungszeichen } from '../src/model/waehrung';
import { renderZugferdPdf } from '../src/pdf/pdfa3';
import { liesPdfText } from '../src/parse/pdf-text';
import { sampleInvoice, minimalInvoice } from '../src/fixtures/sample';
import { SRGB_ICC_BASE64 } from '../src/assets/icc';
import { fromBase64 } from '../src/util/base64';
import { readFileSync } from 'node:fs';

describe('Waehrungszeichen', () => {
  it('kennt die gebraeuchlichen', () => {
    expect(waehrungszeichen('EUR')).toBe('€');
    expect(waehrungszeichen('eur')).toBe('€');
    expect(waehrungszeichen('GBP')).toBe('£');
    expect(waehrungszeichen('PLN')).toBe('zł');
    expect(waehrungszeichen('CZK')).toBe('Kč');
  });

  /*
   * Die wichtige Haelfte: Wo das Zeichen mehrdeutig ist, gibt es keins. "kr"
   * steht fuer vier Waehrungen, "$" fuer zwanzig - auf einer Rechnung, die
   * ueber die Grenze geht, ist der Kode dann die bessere Angabe.
   */
  it('gibt fuer mehrdeutige Waehrungen nichts zurueck', () => {
    for (const code of ['CHF', 'SEK', 'DKK', 'NOK', 'ISK', 'CAD', 'AUD', 'NZD', 'XXX']) {
      expect(waehrungszeichen(code), code).toBeUndefined();
    }
  });
});

const schrift = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../files/${name}`, import.meta.url)));

const assets = () => ({
  fontRegular: schrift('Inter-Rechnung-Regular.ttf'),
  fontBold: schrift('Inter-Rechnung-Bold.ttf'),
  iccProfile: fromBase64(SRGB_ICC_BASE64),
});

describe('Waehrung auf dem Blatt', () => {
  it('schreibt ohne Angabe das Zeichen', async () => {
    const { pdf, befunde } = await renderZugferdPdf(minimalInvoice(), { assets: assets() });
    const { text } = await liesPdfText(pdf);
    expect(text).toContain('€');
    expect(text).not.toContain('EUR');
    expect(befunde).toBeUndefined();
  });

  it('schreibt mit waehrungsdarstellung "code" den Kode', async () => {
    const { pdf } = await renderZugferdPdf(minimalInvoice(), {
      assets: assets(),
      waehrungsdarstellung: 'code',
    });
    const { text } = await liesPdfText(pdf);
    expect(text).toContain('EUR');
    expect(text).not.toContain('€');
  });

  /*
   * Der Kode bleibt der Kode, auch wo ein Zeichen vorhanden waere - sonst
   * waere 'code' nur eine Bitte und keine Angabe.
   */
  it('bleibt mit "code" auch bei einer Fremdwaehrung mit Zeichen beim Kode', async () => {
    const inZloty = parseInvoice({ ...minimalInvoice(), currency: 'PLN' });
    const { pdf, befunde } = await renderZugferdPdf(inZloty, {
      assets: assets(),
      waehrungsdarstellung: 'code',
    });
    const { text } = await liesPdfText(pdf);
    expect(text).toContain('PLN');
    expect(text).not.toContain('zł');
    expect(befunde).toBeUndefined();
  });

  /*
   * Fuer CHF gibt es kein eindeutiges Zeichen. Statt zu raten bleibt der Kode
   * stehen, und das Ergebnis sagt, warum - sonst sucht jemand den Fehler in
   * seiner Schrift.
   */
  it('bleibt beim Kode, wo es kein Zeichen gibt, und sagt es', async () => {
    const roh = minimalInvoice();
    const inFranken = parseInvoice({ ...roh, currency: 'CHF' });
    const { pdf, befunde } = await renderZugferdPdf(inFranken, { assets: assets() });
    const { text } = await liesPdfText(pdf);
    expect(text).toContain('CHF');
    expect(befunde?.join(' ')).toMatch(/CHF.*kein eindeutiges Waehrungszeichen/);
  });

  /*
   * Der Fall, der ohne diese Pruefung die ganze Rechnung gekostet haette: Die
   * mitgelieferten Teilmengen von Inter kennen kein "฿" (THB) und kein "лв"
   * (BGN) - nachgesehen mit `npm run zeichen`. Ohne Ausweichen wuerde der
   * Zeichenvorrat-Waechter das Rendern abbrechen, und zwar an einem Zeichen,
   * das nur die Anzeige betrifft.
   */
  it('weicht auf den Kode aus, wenn die Schrift das Zeichen nicht kennt', async () => {
    const roh = minimalInvoice();
    const inBaht = parseInvoice({ ...roh, currency: 'THB' });
    const { pdf, befunde } = await renderZugferdPdf(inBaht, { assets: assets() });
    const { text } = await liesPdfText(pdf);
    expect(text).toContain('THB');
    expect(befunde?.join(' ')).toMatch(/kennt "฿" nicht/);
  });

  /* Was die Schrift kennt, erscheint auch - hier das Zeichen der Hrywnja. */
  it('setzt auch ein selteneres Zeichen, wenn die Schrift es kennt', async () => {
    const inHrywnja = parseInvoice({ ...minimalInvoice(), currency: 'UAH' });
    const { pdf, befunde } = await renderZugferdPdf(inHrywnja, { assets: assets() });
    const { text } = await liesPdfText(pdf);
    expect(text).toContain('₴');
    expect(befunde).toBeUndefined();
  });
});

describe('Fremdwaehrung im XML', () => {
  const inFranken = () =>
    parseInvoice({
      ...sampleInvoice(),
      currency: 'CHF',
      vatAccountingCurrency: 'EUR',
      vatTotalInAccountingCurrency: 2100.5,
    });

  it('schreibt BT-6 vor BT-5, wie das CII-Schema es verlangt', () => {
    const xml = buildCii(inFranken());
    const bt6 = xml.indexOf('<ram:TaxCurrencyCode>');
    const bt5 = xml.indexOf('<ram:InvoiceCurrencyCode>');
    expect(bt6).toBeGreaterThan(-1);
    expect(bt6).toBeLessThan(bt5);
  });

  it('schreibt den Steuerbetrag zweimal, je Waehrung einmal', () => {
    const xml = buildCii(inFranken());
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="CHF">');
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">2100.50</ram:TaxTotalAmount>');
  });

  it('legt in UBL einen zweiten TaxTotal-Block an, ohne Aufschluesselung', () => {
    const xml = buildUbl(inFranken());
    expect(xml).toContain('<cbc:TaxCurrencyCode>EUR</cbc:TaxCurrencyCode>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="EUR">2100.50</cbc:TaxAmount>');
  });

  it('liest beides wieder ein - und verliert den Steuerbetrag nicht', () => {
    for (const xml of [buildCii(inFranken()), buildUbl(inFranken())]) {
      const gelesen = parseInvoiceXml(xml);
      expect(gelesen.invoice.currency).toBe('CHF');
      expect(gelesen.invoice.vatAccountingCurrency).toBe('EUR');
      expect(gelesen.invoice.vatTotalInAccountingCurrency).toBe(2100.5);
      /*
       * Der eigentliche Fallstrick: Mit zwei TaxTotalAmount-Elementen stand
       * der ausgewiesene Steuerbetrag vorher auf undefined, weil ein Leser
       * auf einer Liste nichts findet.
       */
      expect(gelesen.declaredTotals.taxTotal).toBeCloseTo(2004.69, 2);
    }
  });

  it('verlangt BT-111, wenn BT-6 gesetzt ist', () => {
    const ohneBetrag = parseInvoice({
      ...sampleInvoice(),
      currency: 'CHF',
      vatAccountingCurrency: 'EUR',
    });
    const treffer = validateInvoice(ohneBetrag).issues.filter((i) => i.rule === 'BR-53');
    expect(treffer).toHaveLength(1);
    expect(treffer[0]?.severity).toBe('error');
  });

  it('weist einen Betrag ohne Waehrung ab', () => {
    const ohneWaehrung = parseInvoice({
      ...sampleInvoice(),
      vatTotalInAccountingCurrency: 100,
    });
    expect(
      validateInvoice(ohneWaehrung).issues.filter((i) => i.rule === 'BR-53'),
    ).not.toHaveLength(0);
  });

  it('weist bei Fremdwaehrung ohne Euroangabe auf den Steuerberater hin', () => {
    const roh = parseInvoice({ ...sampleInvoice(), currency: 'CHF' });
    const treffer = validateInvoice(roh).issues.filter((i) => i.rule === 'BT-6');
    expect(treffer).toHaveLength(1);
    expect(treffer[0]?.severity).toBe('warning');
  });

  it('schweigt bei einer Rechnung in Euro', () => {
    expect(
      validateInvoice(sampleInvoice()).issues.filter((i) => i.rule === 'BT-6' || i.rule === 'BR-53'),
    ).toHaveLength(0);
  });
});
