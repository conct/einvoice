import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import { renderZugferdPdf } from '../src/pdf/pdfa3';
import { sampleInvoice } from '../src/fixtures/sample';
import { fromBase64 } from '../src/util/base64';
import { SRGB_ICC_BASE64 } from '../../einvoice-assets/src/icc';

/** Dieselben vorbereiteten Teilmengen, die auch App und Dienst einbetten. */
const schrift = (name: string) => new URL(`../../einvoice-assets/files/${name}`, import.meta.url);
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

/** Glyphennummer -> Zeichen, aus der ToUnicode-CMap des Dokuments. */
function toUnicode(text: string): Map<number, string> {
  const karte = new Map<number, string>();
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const eintrag of (block[1] ?? '').matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      karte.set(
        parseInt(eintrag[1] ?? '0', 16),
        String.fromCodePoint(parseInt((eintrag[2] ?? '').slice(0, 4), 16)),
      );
    }
  }
  return karte;
}

interface Zuordnung {
  schriften: number;
  nummern: number;
  ohneCmap: number;
  falsch: string[];
}

/**
 * Rechnet nach, ob jede gezeichnete Glyphennummer den Buchstaben zeigt, den
 * das Dokument an dieser Stelle behauptet.
 *
 * Der Weg fuehrt bewusst ueber die Schrift selbst und nicht ueber ToUnicode
 * allein: Die ToUnicode-Tabelle war beim Fehler vom 25.08.2026 korrekt - sie
 * hat ihn gerade deshalb verdeckt. Erst der Ruecklauf ueber die cmap der
 * eingebetteten Schrift zeigt, ob die Nummer im Textbefehl und die Nummer in
 * der Schrift dasselbe meinen.
 */
async function pruefeZuordnung(pdf: Uint8Array): Promise<Zuordnung> {
  const doc = await PDFDocument.load(pdf, { throwOnInvalidObject: false });
  const seite = doc.getPage(0);

  const schriften = new Map<
    string,
    { quelle: number; font: ReturnType<typeof fontkit.create> | undefined; unicode: Map<number, string> }
  >();

  const mittel = seite.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
  for (const [name, verweis] of mittel?.entries() ?? []) {
    const oben = doc.context.lookup(verweis);
    if (!(oben instanceof PDFDict)) continue;

    const tabelle = oben.lookup(PDFName.of('ToUnicode'));
    let stufe = oben;
    const nachkommen = stufe.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
    if (nachkommen) stufe = nachkommen.lookupMaybe(0, PDFDict) ?? stufe;

    const beschreibung = stufe.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
    const verweisDatei = beschreibung?.get(PDFName.of('FontFile2'));
    const datei = beschreibung?.lookup(PDFName.of('FontFile2'));
    if (!(datei instanceof PDFRawStream)) continue;

    let font: ReturnType<typeof fontkit.create> | undefined;
    try {
      font = fontkit.create(decodePDFRawStream(datei).decode());
    } catch {
      font = undefined;
    }

    schriften.set(name.asString(), {
      quelle: verweisDatei && 'objectNumber' in verweisDatei ? verweisDatei.objectNumber : 0,
      font,
      unicode:
        tabelle instanceof PDFRawStream
          ? toUnicode(Buffer.from(decodePDFRawStream(tabelle).decode()).toString('latin1'))
          : new Map(),
    });
  }

  const inhalt = seite.node.Contents();
  const stroeme =
    inhalt instanceof PDFArray ? inhalt.asArray().map((v) => doc.context.lookup(v)) : [inhalt];
  let roh = '';
  for (const strom of stroeme) {
    if (strom instanceof PDFRawStream) {
      roh += Buffer.from(decodePDFRawStream(strom).decode()).toString('latin1');
    }
  }

  // pdf-lib legt je Textblock eine eigene Ressource an, die auf dieselbe
  // Schriftdatei zeigt - zusammengefasst wird deshalb nach Datei.
  const jeDatei = new Map<number, { schluessel: string; nummern: Set<number> }>();
  let aktuell: string | undefined;
  for (const treffer of roh.matchAll(/\/([^\s/[\]<>]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>/g)) {
    if (treffer[1]) {
      aktuell = `/${treffer[1]}`;
      continue;
    }
    const schrift = aktuell ? schriften.get(aktuell) : undefined;
    if (!schrift || !aktuell) continue;

    const eintrag = jeDatei.get(schrift.quelle) ?? { schluessel: aktuell, nummern: new Set<number>() };
    const hex = treffer[2] ?? '';
    for (let i = 0; i + 4 <= hex.length; i += 4) eintrag.nummern.add(parseInt(hex.slice(i, i + 4), 16));
    jeDatei.set(schrift.quelle, eintrag);
  }

  const befund: Zuordnung = { schriften: jeDatei.size, nummern: 0, ohneCmap: 0, falsch: [] };

  for (const { schluessel, nummern } of jeDatei.values()) {
    const schrift = schriften.get(schluessel);
    if (!schrift?.font) {
      befund.ohneCmap++;
      continue;
    }

    try {
      // fontkit wirft nicht beim Einlesen, sondern beim ersten Nachschlagen.
      schrift.font.glyphForCodePoint(0x41);
    } catch {
      befund.ohneCmap++;
      continue;
    }

    for (const nummer of nummern) {
      const zeichen = schrift.unicode.get(nummer);
      if (zeichen === undefined || zeichen === ' ' || zeichen === ' ') continue;
      befund.nummern++;

      let umriss = false;
      try {
        umriss = nummer < schrift.font.numGlyphs && schrift.font.getGlyph(nummer).path.commands.length > 0;
      } catch {
        umriss = false;
      }
      if (!umriss) {
        befund.falsch.push(`${zeichen}: Glyph ${nummer} hat keinen Umriss`);
        continue;
      }

      const laut = schrift.font.glyphForCodePoint(zeichen.codePointAt(0) ?? 0)?.id;
      if (laut !== undefined && laut !== 0 && laut !== nummer) {
        befund.falsch.push(`${zeichen}: gezeichnet als ${nummer}, Schrift sagt ${laut}`);
      }
    }
  }

  return befund;
}

/**
 * Das erzeugte PDF muss lesbar sein - nicht nur formal richtig.
 *
 * Anlass: ein Dokument bestand veraPDF, Mustang und den KoSIT-Validator und
 * war trotzdem unleserlich. Beim Verkleinern der Schrift nummeriert pdf-lib
 * die Glyphen neu, laesst die Textbefehle aber auf den alten Nummern stehen.
 *
 * Keine Strukturpruefung kann das sehen: Schrift eingebettet, ToUnicode
 * vorhanden, PDF/A-3 erfuellt. Nur der Ruecklauf ueber die Schrift selbst
 * faellt darauf herein - und genau den macht dieser Test.
 */
describe('Schriftzuordnung im erzeugten PDF', () => {
  it('zeichnet an jeder Glyphennummer das Zeichen, das dort stehen soll', async () => {
    const { pdf } = await renderZugferdPdf(sampleInvoice(), {
      assets: await assets(),
      now: FESTER_ZEITPUNKT,
    });

    const befund = await pruefeZuordnung(pdf);
    expect(befund.schriften).toBeGreaterThan(0);
    expect(befund.ohneCmap).toBe(0);
    // Ohne nachgerechnete Nummern waere der Test gruen, ohne etwas geprueft zu
    // haben - der Fehler, den die Vorfassung dieses Tests gemacht hat.
    expect(befund.nummern).toBeGreaterThan(50);
    expect(befund.falsch).toEqual([]);
  }, 30_000);

  it('faellt auf, wenn die Teilmengenbildung wieder eingeschaltet wird', async () => {
    // Dokumentiert den Fehler, statt ihn nur zu vermeiden: schlaegt dieser
    // Test eines Tages fehl, hat pdf-lib das Problem behoben.
    //
    // Geprueft wird, dass die Zuordnung dann nicht mehr nachrechenbar ist:
    // fontkit wirft die cmap bei der Teilmengenbildung weg, und was man nicht
    // nachrechnen kann, hat man nicht geprueft. Die Vorfassung dieses Tests
    // verglich stattdessen die hoechste Glyphennummer mit der kleinsten
    // eingebetteten Schrift und war damit gruen, ohne den Fehler zu treffen.
    const { pdf } = await renderZugferdPdf(sampleInvoice(), {
      assets: await assets(),
      now: FESTER_ZEITPUNKT,
      subsetFonts: true,
    });

    const befund = await pruefeZuordnung(pdf);
    expect(befund.ohneCmap).toBeGreaterThan(0);
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

  it('stolpert nicht ueber unsichtbare Zeichen aus der Zwischenablage', async () => {
    // Anlass: Der Renderdienst lehnte am 25.08.2026 eine Rechnung mit
    // "Die Schrift kennt U+200B nicht" ab. U+200B ist ein unsichtbares
    // Leerzeichen, das beim Einfuegen aus einer Webseite mitkommt - der
    // Nutzer konnte es weder sehen noch finden. Dass die Schrift es nicht
    // kennt, ist richtig: Es soll ja nichts darstellen.
    const rechnung = sampleInvoice();
    rechnung.buyer.name = 'Stadtwerke​Buchholz AoeR';
    rechnung.notes = [{ text: 'Weich­es Trennzeichen und ﻿Markierung' }];

    const { pdf } = await renderZugferdPdf(rechnung, {
      assets: await assets(),
      now: FESTER_ZEITPUNKT,
    });
    expect(pdf.length).toBeGreaterThan(0);

    // Und sie duerfen nicht als Glyphe im Dokument landen.
    const befund = await pruefeZuordnung(pdf);
    expect(befund.falsch).toEqual([]);
  }, 30_000);

  it('bricht weiterhin bei Zeichen ab, die etwas darstellen sollen', async () => {
    // Der Gegenbeweis zum vorigen Test: Waeren jetzt alle unbekannten Zeichen
    // geduldet, faende die Pruefung gar nichts mehr.
    const rechnung = sampleInvoice();
    rechnung.buyer.name = 'Ω Handel';

    await expect(
      renderZugferdPdf(rechnung, { assets: await assets(), now: FESTER_ZEITPUNKT }),
    ).rejects.toThrow(/kennt folgende Zeichen nicht/);
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

    // Auch hier wieder nachrechnen: dass nichts geworfen wurde, heisst noch
    // nicht, dass die Sonderzeichen richtig gezeichnet sind.
    const befund = await pruefeZuordnung(pdf);
    expect(befund.falsch).toEqual([]);
  }, 30_000);
});
