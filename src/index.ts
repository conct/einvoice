/**
 * @erechnung/core - isomorphe Kernbibliothek fuer deutsche E-Rechnungen.
 *
 * Alles hier laeuft unveraendert in Node (Cloud-Rendering), im Browser
 * (Expo Web) und in React Native (native App). Es gibt bewusst keinen Zugriff
 * auf Dateisystem, DOM oder plattformspezifische Krypto - Binaerdaten wie
 * Schriften und Farbprofil reicht die aufrufende Schicht herein.
 */

// Datenmodell und Codelisten
export * from './model/codes';
export * from './model/invoice';
export * from './model/totals';
export { istKleinunternehmerRechnung } from './model/kleinunternehmer';
export { folgedokument, type Folgeart } from './model/folgedokument';
export * from './model/validate';
export * from './model/specifications';

// Syntaxen
export { buildCii, type CiiOptions } from './xml/cii';
export { buildUbl, type UblOptions } from './xml/ubl';

// PDF/A-3
export {
  renderZugferdPdf,
  type RenderAssets,
  type RenderOptions,
  type RenderResult,
} from './pdf/pdfa3';
export { buildXmp, xmpDate, type FacturXConformanceLevel, type XmpOptions } from './pdf/xmp';
export { ZeichenvorratFehler, ohneUnsichtbare } from './pdf/zeichenvorrat';
export { A4, DEFAULT_THEME, wrapText, type Theme } from './pdf/layout';
export { farbeAusHex, istPng, pngFarbtyp, themaMitAkzent } from './pdf/gestaltung';

// Empfang und Auswertung eingehender E-Rechnungen
// Text und Breiten aus einem PDF - die Grundlage dafuer, ein erzeugtes
// Dokument nachzulesen, und das Handwerkszeug fuer jeden eigenen Leser.
export {
  leseInhalt,
  liesPdfText,
  seiteninhalt,
  type PdfText,
  type Textseite,
  type Textstueck,
  type Textzeile,
  type Wert,
} from './parse/pdf-text';
export { laufbreite, liefereBreiten, type Breiten } from './parse/pdf-breiten';

export { extractAttachments, extractInvoiceXml, type ExtractedAttachment } from './parse/extract';
export {
  parseInvoiceXml,
  type DeclaredTotals,
  type InvoiceSyntax,
  type ParsedInvoice,
} from './parse/xml';
export {
  detectKind,
  readEInvoice,
  EInvoiceError,
  type EInvoiceErrorCode,
  type ReceivedInvoice,
  type SourceKind,
} from './parse/receive';

// Hilfsfunktionen, die Anwendungen ohnehin brauchen
export { decimal, formatAmount, formatQuantity, round, sum } from './util/money';
export { addDays, formatDate, isIsoDate, toCiiDate, type IsoDate } from './util/date';
export { fromBase64, toBase64, utf8Decode, utf8Encode } from './util/base64';
export { escapeXml, sanitizeXmlText, XmlWriter } from './util/xml';

import type { Invoice } from './model/invoice';
import { computeTotals } from './model/totals';
import { buildCii } from './xml/cii';
import { buildUbl } from './xml/ubl';

/**
 * Erzeugt die XML-Datei zum gewaehlten Profil. Fuer 'zugferd-en16931' ist das
 * die Datei, die anschliessend ins PDF/A-3 eingebettet wird; fuer die beiden
 * XRechnung-Profile ist sie bereits das fertige Dokument.
 */
export function buildInvoiceXml(invoice: Invoice): { xml: string; filename: string } {
  const totals = computeTotals(invoice);
  switch (invoice.profile) {
    case 'xrechnung-ubl':
      return {
        xml: buildUbl(invoice, { totals }),
        filename: `${invoice.number}-xrechnung-ubl.xml`,
      };
    case 'xrechnung-cii':
      return {
        xml: buildCii(invoice, { totals }),
        filename: `${invoice.number}-xrechnung-cii.xml`,
      };
    default:
      return { xml: buildCii(invoice, { totals }), filename: 'factur-x.xml' };
  }
}

// Ein uebernommener Briefbogen: die Beschreibung und das Zeichnen daraus.
// Gelesen und vermessen wird eine fremde Vorlage nicht mehr hier - siehe
// README, Abschnitt "Was hier nicht liegt".
export type {
  Beschriftung,
  Briefpapier,
  Farbe,
  Flaeche,
  Kreis,
  Pfad,
  Strich,
  Textlauf,
} from './pdf/briefpapier-typen';
export { alsHex } from './pdf/gestaltung';
export { alsSvg, zeichneBriefpapier, type Zeichenbefund } from './pdf/briefpapier';
export {
  schriftenImBriefkopf,
  setzeMitVorlagenschrift,
  type Vorlagenbefund,
} from './pdf/vorlagenschrift';
export {
  beschriftungenMit,
  istBrauchbareBeschriftung,
  nurAbweichungen,
  STANDARD_BESCHRIFTUNGEN,
  type Beschriftungen,
} from './pdf/beschriftungen';
export type { Kennzahlenstellung } from './pdf/layout';
export {
  familienkern,
  pruefeSchrift,
  pruefeSchriftpaar,
  schriftmangelText,
  MAX_SCHRIFT_BYTES,
  RECHNUNGSZEICHEN,
  type Schriftbefund,
  type Schriftmangel,
} from './pdf/eigenschrift';
export { kennzahlenrahmen } from './pdf/layout';
