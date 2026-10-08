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

// Word-Dokumente aufschluesseln - die Umzugshilfe fuer alle, die ihre
// Rechnungen bisher in Word schreiben. Deutet nichts, holt nur heraus.
export {
  liesWordDokument,
  type WordAbsatz,
  type WordBlock,
  type WordDokument,
  type WordTabelle,
} from './parse/word';
export {
  positionenAus,
  schlageZuordnungVor,
  signaturVon,
  zahlAus,
  ROLLEN,
  type Spaltenrolle,
  type Uebernahme,
} from './parse/word-uebernahme';

// Text aus einem PDF holen - die Grundlage dafuer, aus einem Word-PDF ohne
// eingebettete Daten doch noch eine Rechnung zu machen.
export {
  liesPdfText,
  type PdfText,
  type Textseite,
  type Textstueck,
  type Textzeile,
} from './parse/pdf-text';
export { schlageKopfzeileVor, tabelleAusZeilen, type Tabellenbefund } from './parse/pdf-tabelle';

// Stammdaten aus einer fremden Rechnung - Anschriften, IBAN, Steuernummern.
// Jeder Fund traegt seine Sicherheit mit sich; zugeordnet wird von Hand.
export {
  findeStammdaten,
  type Anschrift,
  type Feld,
  type Fund,
  type Sicherheit,
  type Stammdatenfund,
} from './parse/stammdaten';

// Empfang und Auswertung eingehender E-Rechnungen
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

// Export fuer die Buchhaltung
export {
  buildDatevBuchungsstapel,
  type DatevErgebnis,
  type DatevMandant,
  type DatevOptionen,
} from './export/datev';
export {
  abgewandelt,
  istDebitorennummer,
  steuerfallFuer,
  SKR03,
  SKR04,
  VORLAGEN,
  type Erloeskonto,
  type Kontenrahmen,
  type Steuerfall,
} from './export/kontenrahmen';
export { cp1252, type Cp1252Ergebnis } from './util/cp1252';

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

export {
  alsHex,
  findeFussgrenze,
  findeGrenze,
  findeStrichstaerken,
  liesBriefpapier,
  type Beschriftung,
  type Briefpapier,
  type Farbe,
  type Flaeche,
  type Kreis,
  type Pfad,
  type Strich,
} from './parse/pdf-gestaltung';
export { alsSvg, zeichneBriefpapier, type Zeichenbefund } from './pdf/briefpapier';
export {
  schriftenImBriefkopf,
  setzeMitVorlagenschrift,
  type Vorlagenbefund,
} from './pdf/vorlagenschrift';
export { type Textlauf } from './parse/pdf-gestaltung';
export {
  kennungVon,
  profilAus,
  pruefeZuordnung,
  uebernimmBriefpapier,
  type Absenderprofil,
  type Herkunft,
  type Identitaet,
  type Zuordnung,
} from './absender/profil';
export { laufbreite, liefereBreiten, type Breiten } from './parse/pdf-breiten';
export {
  findeZahlungsklausel,
  bankverbindungImBogen,
  zahlungsklauselImBogen,
  zeilenImBogen,
  type Zahlungsklausel,
} from './absender/zahlungsklausel';
export { entschluesseleCcitt, type CcittAngaben, type Fehlerbild } from './parse/ccitt';
export { liesSeitenbilder, type Bildart, type Seitenbild } from './parse/pdf-bilder';
export { alsGraustufenPng, maskeAlsGrau } from './util/png';
export {
  beschriftungenMit,
  istBrauchbareBeschriftung,
  nurAbweichungen,
  STANDARD_BESCHRIFTUNGEN,
  type Beschriftungen,
} from './pdf/beschriftungen';
export type { Kennzahlenstellung } from './pdf/layout';
export { anschriftenAus } from './absender/anschrift';
export { schriftbogenAus } from './pdf/schriftbogen';
export {
  alsBogendatei,
  liesBogendatei,
  bogenmangelText,
  BOGENDATEI_ART,
  BOGENDATEI_FASSUNG,
  type Bogendatei,
  type Bogenbefund,
  type Bogenmangel,
  type Bogenquelle,
} from './absender/bogendatei';
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
export {
  schlageVorlageVor,
  schalterAusVorschlag,
  type Vorlagenvorschlag,
  type Vorlagenschalter,
} from './absender/vorlage';
export {
  belegteFlaechen,
  pruefeAlleStellungen,
  pruefeStellung,
  type Rahmen,
  type Stellungsbefund,
} from './pdf/stellungspruefung';
export { kennzahlenrahmen } from './pdf/layout';
