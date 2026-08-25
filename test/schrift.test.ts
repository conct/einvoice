import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

import { renderZugferdPdf } from '../src/pdf/pdfa3';
import { sampleInvoice } from '../src/fixtures/sample';
import { fromBase64 } from '../src/util/base64';
import { SRGB_ICC_BASE64 } from '../../einvoice-assets/src/icc';

/** Dieselben vorbereiteten Teilmengen, die auch App und Dienst einbetten. */
const schrift = (name: string) =>
  new URL(`../../einvoice-assets/files/${name}`, import.meta.url);
const FESTER_ZEITPUNKT = new Date('2026-08-24T10:15:00+02:00');

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

/** Anzahl Glyphen einer eingebetteten TrueType-Schrift, aus der maxp-Tabelle. */
function glyphenzahl(schrift: Uint8Array): number {
  const sicht = new DataView(schrift.buffer, schrift.byteOffset, schrift.byteLength);
  const anzahl = sicht.getUint16(4);
  for (let i = 0; i < anzahl; i++) {
    const eintrag = 12 + i * 16;
    if (String.fromCharCode(...schrift.subarray(eintrag, eintrag + 4)) === 'maxp') {
      return sicht.getUint16(sicht.getUint32(eintrag + 8) + 4);
    }
  }
  return 0;
}

async function pruefeZuordnung(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf, { throwOnInvalidObject: false });

  // Bei Identity-H stehen die Glyphennummern als Hexpaare im Textbefehl.
  let hoechste = 0;
  const inhalt = doc.getPage(0).node.Contents();
  const stroeme =
    inhalt instanceof PDFArray ? inhalt.asArray().map((r) => doc.context.lookup(r)) : [inhalt];
  for (const strom of stroeme) {
    if (!(strom instanceof PDFRawStream)) continue;
    const text = Buffer.from(decodePDFRawStream(strom).decode()).toString('latin1');
    for (const treffer of text.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = treffer[1] ?? '';
      for (let i = 0; i + 4 <= hex.length; i += 4) {
        hoechste = Math.max(hoechste, parseInt(hex.slice(i, i + 4), 16));
      }
    }
  }

  const groessen: number[] = [];
  for (const [, objekt] of doc.context.enumerateIndirectObjects()) {
    if (!('lookup' in objekt) || typeof objekt.lookup !== 'function') continue;
    const datei = (objekt as { lookup: (n: PDFName) => unknown }).lookup(PDFName.of('FontFile2'));
    if (datei instanceof PDFRawStream) groessen.push(glyphenzahl(decodePDFRawStream(datei).decode()));
  }

  return { hoechste, kleinsteSchrift: Math.min(...groessen), schriften: groessen.length };
}

/**
 * Das erzeugte PDF muss lesbar sein - nicht nur formal richtig.
 *
 * Anlass: ein Dokument bestand veraPDF, Mustang und den KoSIT-Validator und
 * war trotzdem unleserlich. Beim Verkleinern der Schrift nummeriert pdf-lib
 * die Glyphen neu, laesst die Textbefehle aber auf den alten Nummern stehen.
 * Alles jenseits der neuen Glyphenzahl zeichnet nichts, alles darunter den
 * falschen Buchstaben.
 *
 * Keine Strukturpruefung kann das sehen: Schrift eingebettet, ToUnicode
 * vorhanden, PDF/A-3 erfuellt. Nur der Abgleich zwischen Textbefehl und
 * Schriftumfang faellt darauf herein - und genau den macht dieser Test.
 */
describe('Schriftzuordnung im erzeugten PDF', () => {
  it('verweist auf keine Glyphe ausserhalb der eingebetteten Schrift', async () => {
    const { pdf } = await renderZugferdPdf(sampleInvoice(), {
      assets: await assets(),
      now: FESTER_ZEITPUNKT,
    });

    const befund = await pruefeZuordnung(pdf);
    expect(befund.schriften).toBeGreaterThan(0);
    expect(befund.hoechste).toBeGreaterThan(0);
    expect(befund.hoechste).toBeLessThan(befund.kleinsteSchrift);
  }, 30_000);

  it('faellt auf, wenn die Teilmengenbildung wieder eingeschaltet wird', async () => {
    // Dokumentiert den Fehler, statt ihn nur zu vermeiden: schlaegt dieser
    // Test eines Tages fehl, hat pdf-lib das Problem behoben. Dringend ist das
    // nicht mehr - seit die eingebettete Schrift eine vorbereitete Teilmenge
    // ist, wiegt eine Rechnung 70 statt 436 kB.
    const { pdf } = await renderZugferdPdf(sampleInvoice(), {
      assets: await assets(),
      now: FESTER_ZEITPUNKT,
      subsetFonts: true,
    });

    const befund = await pruefeZuordnung(pdf);
    expect(befund.hoechste).toBeGreaterThanOrEqual(befund.kleinsteSchrift);
  }, 30_000);
});

/**
 * Die Kehrseite der kleinen Schrift.
 *
 * Eingebettet ist nur noch das lateinische Schriftsystem. Ein Zeichen
 * ausserhalb davon wird nicht ersetzt und nicht falsch gezeichnet, sondern gar
 * nicht - im fertigen PDF stuende an der Stelle des Kundennamens nichts.
 * Genau dieselbe Art von stillem Fehler wie oben, nur an anderer Stelle,
 * deshalb bricht die Erzeugung ab statt eine lueckenhafte Rechnung zu liefern.
 */
describe('Zeichen ausserhalb der eingebetteten Schrift', () => {
  it('bricht ab, statt die Stelle leer zu lassen', async () => {
    const rechnung = sampleInvoice();
    rechnung.buyer.name = 'Ковалёв Handel GmbH';

    await expect(
      renderZugferdPdf(rechnung, { assets: await assets(), now: FESTER_ZEITPUNKT }),
    ).rejects.toThrow(/kennt folgende Zeichen nicht/);
  }, 30_000);

  it('nennt alle fehlenden Zeichen auf einmal, nicht nur das erste', async () => {
    const rechnung = sampleInvoice();
    rechnung.buyer.name = 'Ω Handel';
    rechnung.notes = [{ text: 'Lieferung ab 天津' }];

    const fehler = await renderZugferdPdf(rechnung, {
      assets: await assets(),
      now: FESTER_ZEITPUNKT,
    }).catch((error: unknown) => error);

    expect(fehler).toBeInstanceOf(Error);
    for (const zeichen of ['Ω', '天', '津']) {
      expect((fehler as Error).message).toContain(zeichen);
    }
  }, 30_000);

  it('laesst die Zeichen durch, die auf einer Rechnung aus der EU vorkommen', async () => {
    const rechnung = sampleInvoice();
    rechnung.buyer.name = 'Świętokrzyska Spółka z o.o.';
    rechnung.seller.name = 'Ärztehaus GROSSE STRAẞE – Büro';
    rechnung.notes = [{ text: 'Rumaenisch: Șerban Țepeș · 3,5 ‰ · 12 m² · £ ¥ ₺' }];

    const { pdf } = await renderZugferdPdf(rechnung, {
      assets: await assets(),
      now: FESTER_ZEITPUNKT,
    });
    expect(pdf.length).toBeGreaterThan(0);
  }, 30_000);
});
