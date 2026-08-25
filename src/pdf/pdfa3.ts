import {
  AFRelationship,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import type { Invoice } from '../model/invoice';
import { computeTotals, type InvoiceTotals } from '../model/totals';
import { buildCii } from '../xml/cii';
import { utf8Encode } from '../util/base64';
import { formatDate } from '../util/date';
import { formatAmount } from '../util/money';
import { A4, DEFAULT_THEME, drawInvoice, type Theme } from './layout';
import { buildXmp, xmpDate, type FacturXConformanceLevel } from './xmp';
import { Zeichenpruefung, mitZeichenpruefung } from './zeichenvorrat';

/**
 * Binaerdaten, die der Renderer nicht selbst beschaffen kann. Die
 * Kernbibliothek kennt weder Dateisystem noch Bundler - Schriften und
 * Farbprofil liefert die aufrufende Plattform.
 */
export interface RenderAssets {
  /** TrueType- oder OpenType-Datei fuer den Fliesstext */
  fontRegular: Uint8Array;
  /** Fette Schnitt derselben Familie */
  fontBold: Uint8Array;
  /**
   * ICC-Profil fuer den OutputIntent. PDF/A verlangt einen definierten
   * Farbraum; ohne dieses Profil ist die Datei kein gueltiges PDF/A.
   */
  iccProfile: Uint8Array;
  /** Optionales Logo als PNG */
  logoPng?: Uint8Array;
}

export interface RenderOptions {
  assets: RenderAssets;
  /** Erzeugungszeitpunkt, explizit fuer reproduzierbare Ausgaben */
  now?: Date;
  producer?: string;
  creatorTool?: string;
  /** Profil, das im XMP als ConformanceLevel steht */
  conformanceLevel?: FacturXConformanceLevel;
  /** PDF/A-Konformitaetsstufe. U setzt vollstaendige Unicode-Zuordnung voraus. */
  pdfaConformance?: 'B' | 'U';
  /** Dateiname der eingebetteten Rechnung, ZUGFeRD 2.x erwartet factur-x.xml */
  attachmentName?: string;
  theme?: Theme;
  footerNote?: string;
  /**
   * Nur die tatsaechlich benutzten Zeichen einbetten. Bleibt aus.
   *
   * Die Teilmengenbildung von pdf-lib nummeriert die Glyphen neu, laesst die
   * Textbefehle aber auf den alten Nummern stehen - das Dokument besteht jede
   * Strukturpruefung und zeigt beim Oeffnen Buchstabensalat. Klein wird die
   * Datei stattdessen ueber eine vorbereitete Schrift, siehe
   * packages/einvoice-assets/tools/schrift-erzeugen.mjs.
   *
   * Bleibt als Schalter erhalten, weil der Vergleich beider Wege der einzige
   * Weg ist, den Fehler vorzufuehren: npm run schriftprobe --workspace
   * @erechnung/validate
   */
  subsetFonts?: boolean;
  /** Fertiges CII-XML verwenden, statt es neu zu erzeugen */
  xml?: string;
  totals?: InvoiceTotals;
}

export interface RenderResult {
  pdf: Uint8Array;
  xml: string;
  totals: InvoiceTotals;
}

const DEFAULT_PRODUCER = 'erechnung-core (pdf-lib)';

/**
 * Erzeugt ein ZUGFeRD-2.3-PDF: ein PDF/A-3b mit eingebetteter CII-Rechnung.
 *
 * Die vier Bestandteile, die ein normales PDF von einem ZUGFeRD-PDF trennen:
 *  1. eingebettete Schriften und ein OutputIntent mit ICC-Profil (PDF/A),
 *  2. die XML-Rechnung als Anhang mit AFRelationship "Alternative",
 *  3. ein XMP-Paket mit pdfaid- und Factur-X-Kennzeichnung,
 *  4. ein Info-Dictionary, das exakt zum XMP passt.
 */
export async function renderZugferdPdf(
  invoice: Invoice,
  options: RenderOptions,
): Promise<RenderResult> {
  const now = options.now ?? new Date();
  const totals = options.totals ?? computeTotals(invoice);
  const xml = options.xml ?? buildCii(invoice, { totals });
  const attachmentName = options.attachmentName ?? 'factur-x.xml';
  const producer = options.producer ?? DEFAULT_PRODUCER;
  const creatorTool = options.creatorTool ?? producer;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // Nur eingebettete Schriften sind PDF/A-konform. Standard-14-Schriften
  // waeren kleiner, aber die Datei waere damit ungueltig.
  const subset = options.subsetFonts ?? false;
  const regular = await doc.embedFont(options.assets.fontRegular, { subset });
  const bold = await doc.embedFont(options.assets.fontBold, { subset });
  const logo = options.assets.logoPng ? await doc.embedPng(options.assets.logoPng) : undefined;

  // Die eingebettete Schrift deckt nur das lateinische Schriftsystem ab. Ein
  // Zeichen ausserhalb davon wuerde nicht falsch, sondern gar nicht erscheinen
  // - deshalb faengt die Pruefung jeden Text ab, der ins Dokument geht.
  const pruefung = new Zeichenpruefung([options.assets.fontRegular, options.assets.fontBold]);
  const addPage = (): PDFPage =>
    mitZeichenpruefung(doc.addPage([A4.width, A4.height]), pruefung);

  drawInvoice(addPage, invoice, totals, {
    fonts: { regular, bold },
    theme: options.theme ?? DEFAULT_THEME,
    logo,
    footerNote: options.footerNote,
  });
  pruefung.wirfBeiLuecken();

  const title = `Rechnung ${invoice.number}`;
  const subject =
    `Rechnung ${invoice.number} vom ${formatDate(invoice.issueDate)} ueber ` +
    `${formatAmount(totals.grandTotal, invoice.currency)}`;

  doc.setTitle(title);
  doc.setAuthor(invoice.seller.name);
  doc.setSubject(subject);
  doc.setKeywords([invoice.number, 'ZUGFeRD', 'Factur-X', 'E-Rechnung']);
  doc.setProducer(producer);
  doc.setCreator(creatorTool);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  doc.setLanguage('de-DE');

  // Die XML-Rechnung ist die fuehrende Darstellung, deshalb "Alternative".
  await doc.attach(utf8Encode(xml), attachmentName, {
    mimeType: 'text/xml',
    description: 'Rechnungsdaten im ZUGFeRD-Format (UN/CEFACT CII)',
    creationDate: now,
    modificationDate: now,
    afRelationship: AFRelationship.Alternative,
  });

  for (const attachment of invoice.attachments) {
    if (!attachment.data) continue;
    await doc.attach(attachment.data, attachment.filename ?? `${attachment.id}.bin`, {
      mimeType: attachment.mimeType ?? 'application/octet-stream',
      description: attachment.description ?? attachment.id,
      creationDate: now,
      modificationDate: now,
      afRelationship: AFRelationship.Supplement,
    });
  }

  addOutputIntent(doc, options.assets.iccProfile);
  addXmpMetadata(doc, {
    title,
    author: invoice.seller.name,
    subject,
    keywords: `${invoice.number}, ZUGFeRD, Factur-X, E-Rechnung`,
    creatorTool,
    producer,
    createDate: xmpDate(now),
    modifyDate: xmpDate(now),
    pdfaConformance: options.pdfaConformance ?? 'B',
    documentFileName: attachmentName,
    conformanceLevel: options.conformanceLevel ?? 'EN 16931',
  });
  ensureFileIdentifier(doc, `${invoice.number}|${invoice.issueDate}|${now.getTime()}`);

  // Klassische Querverweistabelle statt Objektstroeme: PDF/A-3 erlaubt beides,
  // aeltere Pruefwerkzeuge kommen mit der klassischen Form zuverlaessiger klar.
  const pdf = await doc.save({ useObjectStreams: false });
  return { pdf, xml, totals };
}

/**
 * Haengt den OutputIntent mit ICC-Profil an. Der Schluessel GTS_PDFA1 ist trotz
 * der "1" auch fuer PDF/A-3 der vorgeschriebene Wert.
 */
function addOutputIntent(doc: PDFDocument, iccProfile: Uint8Array): void {
  const profileStream = doc.context.flateStream(iccProfile, {
    N: 3,
    Alternate: 'DeviceRGB',
  });
  const profileRef = doc.context.register(profileStream);

  const outputIntent = doc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB'),
    OutputCondition: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: profileRef,
  });

  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([outputIntent]));
}

/** Schreibt das XMP-Paket unkomprimiert in den Katalog. */
function addXmpMetadata(doc: PDFDocument, options: Parameters<typeof buildXmp>[0]): void {
  const xmp = buildXmp(options);
  const stream = doc.context.stream(utf8Encode(xmp), {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
}

/**
 * PDF/A verlangt eine Datei-Kennung im Trailer. pdf-lib setzt sie nicht von
 * selbst, deshalb wird sie hier aus stabilen Rechnungsmerkmalen abgeleitet.
 */
function ensureFileIdentifier(doc: PDFDocument, seed: string): void {
  const id = PDFHexString.of(hash128(seed));
  doc.context.trailerInfo.ID = doc.context.obj([id, id]);
}

/** FNV-1a in vier Durchgaengen, ergibt 32 Hexzeichen ohne Krypto-Abhaengigkeit. */
function hash128(seed: string): string {
  let out = '';
  for (let round = 0; round < 4; round++) {
    let hash = 0x811c9dc5 ^ round;
    const input = `${seed}#${round}`;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    out += hash.toString(16).padStart(8, '0');
  }
  return out.toUpperCase();
}
