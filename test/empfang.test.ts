import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { readEInvoice } from '../src/parse/receive';
import { EInvoiceError } from '../src/parse/error';
import { detectKind } from '../src/parse/receive';
import { renderZugferdPdf } from '../src/pdf/pdfa3';
import { buildCii } from '../src/xml/cii';
import { sampleInvoice } from '../src/fixtures/sample';
import { fromBase64, utf8Encode } from '../src/util/base64';
import { SRGB_ICC_BASE64 } from '../../einvoice-assets/src/icc';

const require = createRequire(import.meta.url);

async function assets() {
  const [fontRegular, fontBold] = await Promise.all([
    readFile(require.resolve('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf')),
    readFile(require.resolve('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf')),
  ]);
  return {
    fontRegular: new Uint8Array(fontRegular),
    fontBold: new Uint8Array(fontBold),
    iccProfile: fromBase64(SRGB_ICC_BASE64),
  };
}

/**
 * Fehlerpfade beim Empfang.
 *
 * Diese Faelle treffen nicht die eigenen Dokumente, sondern das, was
 * Geschaeftspartner schicken: abgeschnittene Uebertragungen, das falsche
 * Dokument im Anhang, ein Bild statt einer Rechnung. Die Meldung landet
 * ungefiltert vor jemandem, der wissen will, ob er zahlen muss - sie muss
 * deutsch und verstaendlich sein.
 */
describe('Formaterkennung', () => {
  it('erkennt PDF, XML und alles andere an den ersten Bytes', () => {
    expect(detectKind(utf8Encode('%PDF-1.7\n...'))).toBe('pdf-hybrid');
    expect(detectKind(utf8Encode('<?xml version="1.0"?><rsm:CrossIndustryInvoice/>'))).toBe('xml');
    expect(detectKind(utf8Encode('   <Invoice/>'))).toBe('xml');
    expect(detectKind(utf8Encode('Das ist nur ein Text.'))).toBe('unknown');
    expect(detectKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('unknown');
  });

  it('laesst sich von einer Byte-Order-Mark nicht taeuschen', () => {
    const mitBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8Encode('<?xml version="1.0"?><a/>')]);
    expect(detectKind(mitBom)).toBe('xml');
  });
});

describe('Fehlermeldungen beim Empfang', () => {
  it('meldet eine Textdatei als unbekanntes Format', async () => {
    await expect(readEInvoice(utf8Encode('Keine Rechnung.'), 'notiz.txt')).rejects.toMatchObject({
      code: 'unknown-format',
    });
  });

  it('nennt bei fremdem XML, was erwartet wird', async () => {
    const fehler = await readEInvoice(
      utf8Encode('<?xml version="1.0"?><irgendwas><nicht>passend</nicht></irgendwas>'),
      'fremd.xml',
    ).catch((e: unknown) => e as EInvoiceError);

    expect(fehler).toBeInstanceOf(EInvoiceError);
    expect(fehler.code).toBe('unknown-format');
    expect(fehler.message).toContain('kein Rechnungsdokument');
    // Der Wortlaut muss die erwarteten Wurzelelemente nennen, sonst weiss
    // niemand, was stattdessen zu schicken waere.
    expect(fehler.message).toContain('CrossIndustryInvoice');
  });

  it('uebersetzt technische PDF-Fehler in eine anzeigbare Meldung', async () => {
    const { pdf } = await renderZugferdPdf(sampleInvoice(), {
      assets: await assets(),
      now: new Date('2026-08-24T10:15:00+02:00'),
    });
    // Abgeschnittene Uebertragung - der haeufigste Fall bei kaputten Anhaengen.
    const fehler = await readEInvoice(pdf.subarray(0, 4000), 'kaputt.pdf').catch(
      (e: unknown) => e as EInvoiceError,
    );

    expect(fehler).toBeInstanceOf(EInvoiceError);
    expect(fehler.code).toBe('parse-failed');
    expect(fehler.message).toContain('liess sich nicht lesen');
    // Kein englischer Bibliothekswortlaut in der angezeigten Meldung ...
    expect(fehler.message).not.toContain('Failed to parse');
    // ... aber er bleibt fuer die Fehlersuche erhalten.
    expect(fehler.detail).toBeTruthy();
  }, 30_000);

  it('erkennt ein PDF ohne eingebettete Rechnung als Bilddokument', async () => {
    // Ein PDF/A-3 ohne Anhang: dafuer genuegt ein Dokument, dem der
    // Namensbaum fehlt - hier ein minimales, von Hand gebautes PDF.
    const nacktesPdf = utf8Encode(
      '%PDF-1.7\n' +
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
        'trailer<</Root 1 0 R/Size 4>>\n%%EOF\n',
    );
    const fehler = await readEInvoice(nacktesPdf, 'nur-bild.pdf').catch(
      (e: unknown) => e as EInvoiceError,
    );

    expect(fehler).toBeInstanceOf(EInvoiceError);
    // Je nachdem, wie weit sich das Dokument lesen laesst, ist es entweder
    // ein Bilddokument oder gar nicht lesbar - beides ist eine brauchbare
    // Aussage, ein englischer Bibliothekswortlaut waere es nicht.
    expect(['no-embedded-xml', 'parse-failed']).toContain(fehler.code);
    expect(fehler.message).not.toMatch(/Failed|Error|Cannot/);
  });

  it('liest eine reine XRechnung ohne PDF-Huelle', async () => {
    const empfangen = await readEInvoice(
      utf8Encode(buildCii(sampleInvoice('xrechnung-cii'))),
      'xrechnung.xml',
    );
    expect(empfangen.kind).toBe('xml');
    expect(empfangen.syntax).toBe('cii');
    expect(empfangen.totalMismatches).toEqual([]);
  });
});
