import { rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import type { Invoice, Party } from '../model/invoice';
import type { InvoiceTotals } from '../model/totals';
import { formatAmount, formatQuantity } from '../util/money';
import { formatDate } from '../util/date';
import { beschriftungenMit, type Beschriftungen } from './beschriftungen';

/** A4 in PostScript-Punkten */
export const A4 = { width: 595.28, height: 841.89 } as const;

/** 1 mm in Punkten */
const MM = 2.834645669;

export interface Theme {
  accent: RGB;
  text: RGB;
  muted: RGB;
  hairline: RGB;
  zebra: RGB;
}

export const DEFAULT_THEME: Theme = {
  accent: rgb(0.06, 0.32, 0.55),
  text: rgb(0.11, 0.12, 0.14),
  muted: rgb(0.42, 0.45, 0.5),
  hairline: rgb(0.82, 0.84, 0.87),
  zebra: rgb(0.965, 0.972, 0.98),
};

export interface LayoutFonts {
  regular: PDFFont;
  bold: PDFFont;
}

export interface LayoutContext {
  fonts: LayoutFonts;
  theme: Theme;
  logo?: PDFImage;
  /** Freitext fuer die Fusszeile, z.B. Geschaeftsfuehrer und Registergericht */
  footerNote?: string;
  /**
   * Das Zahlungsziel steht bereits fest im Briefpapier - dann hier weglassen.
   *
   * Der Anlass: Ein uebernommener Briefbogen kann seine Zahlungsklausel
   * mitbringen ("innerhalb von 8 Tagen ohne Abzug"). Steht sie dann noch einmal
   * im Zahlungsblock, widerspricht sie sich womoeglich sogar - zwei Fristen auf
   * einem Blatt.
   *
   * Weggelassen wird nur die **Anzeige**. Im XML bleibt die Angabe stehen: EN
   * 16931 verlangt mit BR-CO-25 entweder ein Faelligkeitsdatum oder eine
   * Zahlungsbedingung, und der Empfaenger liest maschinell das XML. Auf dem
   * Papier steht sie ja weiterhin, nur einmal statt zweimal.
   */
  zahlungszielImBriefpapier?: boolean;
  /**
   * Unter dem Inhalt liegt ein uebernommener Briefbogen.
   *
   * Dann entfaellt der eigene Briefkopf - Logo, Absenderzeilen und die
   * Rueckabsenderzeile ueber dem Anschriftenfeld stehen bereits auf dem Bogen.
   * Beides zu zeichnen ergaebe den Absender doppelt, in zwei Schriften und an
   * zwei Stellen.
   */
  eigenerBriefbogen?: boolean;
  /**
   * Beschriftungen, soweit sie vom Standard abweichen.
   *
   * Vollstaendig gemacht wird der Satz beim Zeichnen, nicht hier - so muss
   * keine Stelle im Layout nachsehen, ob ein Wort vorhanden ist.
   */
  beschriftungen?: Partial<Beschriftungen>;
  /**
   * Wo der Kennzahlenblock steht - Rechnungsnummer, -datum, Faelligkeit.
   *
   * Ein uebernommener Briefbogen setzt ihn oft woandershin als wir; auf einer
   * vermessenen Fremdrechnung stand er auf halber Hoehe quer ueber die Seite,
   * nicht rechts untereinander.
   *
   * Feste Stellungen statt freier Koordinaten: Wer Felder frei verschiebt,
   * verliert womoeglich eine Pflichtangabe nach Paragraf 14 UStG, waehrend sie
   * im XML weiterhin steht - und genau dieses Auseinanderlaufen faellt in
   * einer Pruefung auf. Das Anschriftenfeld selbst bleibt ohnehin auf 45 mm,
   * sonst passt der Brief nicht mehr in den Fensterumschlag.
   */
  kennzahlen?: Kennzahlenstellung;
  /**
   * Soll die eigene Fusszeile gezeichnet werden?
   *
   * Falsch, wenn der Briefbogen eine mitbringt. Die Seitenzahl bleibt davon
   * unberuehrt.
   */
  eigeneFusszeile?: boolean;
  /**
   * Wo das Anschriftenfeld beginnt, wenn der Bogen es vorgibt.
   *
   * Ein uebernommener Bogen hat seine Rueckabsenderzeile und seine Trennlinie
   * an einer bestimmten Hoehe; unser Feld muss darunter anfangen, sonst
   * schreiben beide uebereinander. Gerendert nachgemessen: Ohne diese Angabe
   * lag "21244 Buchholz in der Nordheide" auf der Rueckabsenderzeile des
   * Bogens.
   *
   * Wird auf das Fenster nach DIN 5008 begrenzt - ein Bogen, der sein Feld
   * ausserhalb hat, darf unseres nicht aus dem Umschlag schieben.
   */
  anschriftOben?: number;
  /**
   * Der Satzspiegel, wenn der Briefbogen einen vorgibt.
   *
   * Unsere Vorgabe sind 20 mm Rand. Eine gestaltete Vorlage hat ihren eigenen -
   * die vermessene setzt von 25,0 bis 200,0 mm. Gerendert nachgemessen stand
   * unser Inhalt dadurch fuenf Millimeter links neben der Rueckabsenderzeile
   * des Bogens und zehn Millimeter innerhalb seiner Trennlinien. Nichts
   * fluchtete.
   *
   * Abgelesen wird er an den durchgehenden Linien des Bogens; die markieren
   * seine Satzbreite genauer als der linkeste Text, der auch eine Marke am
   * Rand sein kann.
   */
  satzspiegel?: { links: number; rechts: number };
  /**
   * Schlichter Tabellenstil - ohne gefuelltes Kopfband und ohne Zebrastreifen.
   *
   * Der Anlass: Auf der vermessenen Vorlage steht in der ganzen Rechnung keine
   * einzige gefuellte Flaeche, nur Text und Haarlinien. Die einzige Farbe ist
   * das Firmenzeichen. Wir haben daraus ein rotes Kopfband gemacht - eine
   * Gestaltung, die es dort nie gab, und in der Hausfarbe des Zeichens
   * obendrein.
   *
   * Ein uebernommener Bogen soll unseren Aufbau nicht erfinden lassen, was er
   * nicht hat.
   */
  schlichteTabelle?: boolean;
  /**
   * Die Vorlage setzt keine Ueberschrift - wir dann auch nicht.
   *
   * Gemessen an ihren Schriftgroessen: Steht im ganzen Rechnungsinhalt nichts
   * merklich Groesseres als der Fliesstext, gibt es dort keine Ueberschrift.
   * Auf der vermessenen Vorlage ist alles zehn Punkt; unsere waren sechzehn,
   * in der Farbe des Firmenzeichens.
   *
   * Gilt **nur fuer die gewoehnliche Rechnung**. Eine Gutschrift oder eine
   * Berichtigung muss als solche bezeichnet sein - da ist die Ueberschrift
   * keine Gestaltung, sondern die Angabe, um welche Art Beleg es sich handelt.
   */
  ohneTitel?: boolean;
}

/** Der linke Rand des Satzspiegels - vom Bogen, sonst die Vorgabe. */
const satzLinks = (ctx: LayoutContext): number => ctx.satzspiegel?.links ?? PAGE.left;

/** Der rechte Rand des Satzspiegels. */
const satzRechts = (ctx: LayoutContext): number => ctx.satzspiegel?.rechts ?? PAGE.right;

export type Kennzahlenstellung =
  /** Rechts neben dem Anschriftenfeld, untereinander. Die Vorgabe. */
  | 'neben-anschrift'
  /** Rechts oben, oberhalb des Anschriftenfeldes. */
  | 'ueber-anschrift'
  /** Unter dem Anschriftenfeld, quer in einer Zeile. */
  | 'unter-anschrift';

/** Die Hoehe einer Zeile im Kennzahlenblock. */
const KENNZAHLENZEILE = 12;

/**
 * Wie viele Kennzahlen quer nebeneinander stehen duerfen.
 *
 * Vier: Die Satzbreite betraegt 475 Punkte, also je 119 - genug fuer
 * "RE-2026-0042" und "04011000-12345-67". Bei sieben blieben 68, und dann
 * steht eine abgeschnittene Rechnungsnummer auf der Rechnung.
 */
const QUERSPALTEN = 4;

/**
 * Wo das Anschriftenfeld beginnt.
 *
 * Nach DIN 5008 liegt das Fenster zwischen 45 und 90 mm von oben. Innerhalb
 * dessen darf ein uebernommener Briefbogen bestimmen - er hat sein Feld dort,
 * wo seine Rueckabsenderzeile und seine Trennlinie es vorsehen. Ausserhalb
 * nicht: Ein Bogen, der sein Feld hoeher oder tiefer setzt, wuerde unseres aus
 * dem Umschlag schieben, und der Brief kaeme nicht an.
 */
function anschriftenhoehe(wunsch?: number): number {
  const oben = A4.height - 45 * MM;
  const unten = A4.height - 90 * MM;
  if (wunsch === undefined) return oben;
  return Math.max(unten, Math.min(oben, wunsch));
}

const PAGE = {
  left: 20 * MM,
  right: A4.width - 20 * MM,
  top: A4.height - 15 * MM,
  bottom: 22 * MM,
} as const;

/** Spaltenraster der Positionstabelle, Anteile der verfuegbaren Breite */
const COLUMNS = [
  { key: 'pos', beschriftung: 'pos' as const, width: 26, align: 'left' as const },
  { key: 'name', beschriftung: 'bezeichnung' as const, width: 0, align: 'left' as const },
  { key: 'qty', beschriftung: 'menge' as const, width: 58, align: 'right' as const },
  { key: 'price', beschriftung: 'einzelpreis' as const, width: 72, align: 'right' as const },
  { key: 'vat', beschriftung: 'umsatzsteuer' as const, width: 38, align: 'right' as const },
  { key: 'total', beschriftung: 'betrag' as const, width: 76, align: 'right' as const },
];

interface Cursor {
  page: PDFPage;
  y: number;
  pageIndex: number;
}

/**
 * Zeichnet das menschenlesbare Bild der Rechnung.
 *
 * Das Bild ist nach ZUGFeRD gleichrangig zum eingebetteten XML: bei
 * Abweichungen gilt das XML als fuehrend, aber der Empfaenger darf sich auf
 * das Sichtbare verlassen. Beide stammen deshalb aus derselben Datenquelle
 * und denselben berechneten Summen.
 */
export function drawInvoice(
  addPage: () => PDFPage,
  invoice: Invoice,
  totals: InvoiceTotals,
  context: LayoutContext,
): PDFPage[] {
  const pages: PDFPage[] = [];
  const cursor: Cursor = { page: addPage(), y: PAGE.top, pageIndex: 0 };
  pages.push(cursor.page);

  /*
   * Wo Inhalt auf einer Folgeseite beginnen darf.
   *
   * Ohne Briefbogen der obere Rand. Mit Bogen darunter - gerendert
   * nachgemessen stand sonst "Rechnung RE-2026-0042 - Fortsetzung" mitten im
   * Briefkopf der zweiten Seite. Seite eins war davon unberuehrt, weil dort
   * das Anschriftenfeld den Anfang setzt; deshalb faellt es nur auf, wenn man
   * ueberhaupt eine zweite Seite ansieht.
   */
  const seitenanfang = context.anschriftOben !== undefined ? context.anschriftOben : PAGE.top;

  const nextPage = () => {
    cursor.page = addPage();
    cursor.pageIndex += 1;
    cursor.y = seitenanfang;
    pages.push(cursor.page);
    drawContinuationHeader(cursor, invoice, context);
  };

  const ensure = (needed: number) => {
    if (cursor.y - needed < PAGE.bottom + 40) nextPage();
  };

  if (!context.eigenerBriefbogen) drawLetterhead(cursor, invoice, context);
  drawAddressAndMeta(cursor, invoice, context);
  drawTitle(cursor, invoice, context);
  drawLineTable(cursor, invoice, totals, context, ensure, nextPage);
  drawTotals(cursor, invoice, totals, context, ensure);
  drawVatBreakdown(cursor, invoice, totals, context, ensure);
  drawPaymentBlock(cursor, invoice, totals, context, ensure);
  drawNotes(cursor, invoice, context, ensure);

  pages.forEach((page, index) => drawFooter(page, index, pages.length, invoice, context));
  return pages;
}

// --- Bausteine --------------------------------------------------------------

function drawLetterhead(cursor: Cursor, invoice: Invoice, ctx: LayoutContext): void {
  const { page } = cursor;
  const seller = invoice.seller;

  // Wie tief der Kopf reicht - danach richten sich die Absenderzeilen.
  let kopfhoehe = 28;

  if (ctx.logo) {
    const maxWidth = 150;
    const maxHeight = 48;
    const scale = Math.min(maxWidth / ctx.logo.width, maxHeight / ctx.logo.height, 1);
    const width = ctx.logo.width * scale;
    const height = ctx.logo.height * scale;
    page.drawImage(ctx.logo, { x: satzRechts(ctx) - width, y: PAGE.top - height, width, height });

    // Die tatsaechliche Hoehe und nicht ein fester Wert: Ein breites, flaches
    // Logo wird auf 150 Punkte Breite eingepasst und ist dann womoeglich nur
    // 28 Punkte hoch. Ein fester Abstand verschenkte den Platz darunter - und
    // bei einem hohen Logo schob er die Absenderzeilen in den
    // Kennzahlenblock. Genau das ist am 26.08.2026 passiert.
    kopfhoehe = height + 8;
  } else {
    drawRight(page, seller.tradingName ?? seller.name, satzRechts(ctx), PAGE.top - 12, {
      font: ctx.fonts.bold,
      size: 13,
      color: ctx.theme.accent,
    });
  }

  const lines = [
    seller.address.line1,
    seller.address.line2,
    [seller.address.postcode, seller.address.city].filter(Boolean).join(' '),
    seller.contact?.phone ? `Tel. ${seller.contact.phone}` : undefined,
    seller.contact?.email,
  ].filter((value): value is string => Boolean(value));

  let y = PAGE.top - kopfhoehe;
  for (const line of lines) {
    drawRight(page, line, satzRechts(ctx), y, {
      font: ctx.fonts.regular,
      size: 8,
      color: ctx.theme.muted,
    });
    y -= 10;
  }
  cursor.y = Math.min(cursor.y, y) - 6;
}

function drawAddressAndMeta(cursor: Cursor, invoice: Invoice, ctx: LayoutContext): void {
  const { page } = cursor;
  const addressTop = anschriftenhoehe(ctx.anschriftOben);

  // Rueckabsender und Trennlinie nur ohne eigenen Briefbogen - ein
  // uebernommener bringt beides mit.
  if (!ctx.eigenerBriefbogen) {
    drawText(
      page,
      `${invoice.seller.name} - ${invoice.seller.address.line1} - ${invoice.seller.address.postcode ?? ''} ${invoice.seller.address.city}`,
      satzLinks(ctx),
      addressTop + 14,
      { font: ctx.fonts.regular, size: 6.5, color: ctx.theme.muted },
    );
    page.drawLine({
      start: { x: satzLinks(ctx), y: addressTop + 11 },
      end: { x: satzLinks(ctx) + 85 * MM, y: addressTop + 11 },
      thickness: 0.4,
      color: ctx.theme.hairline,
    });
  }

  let y = addressTop;
  for (const line of addressLines(invoice.buyer)) {
    drawText(page, line, satzLinks(ctx), y, {
      font: ctx.fonts.regular,
      size: 10,
      color: ctx.theme.text,
    });
    y -= 12.5;
  }

  // Kennzahlenblock rechts neben dem Anschriftenfeld
  const wort = beschriftungenMit(ctx.beschriftungen);
  const metaRows: Array<[string, string | undefined]> = [
    [wort.rechnungsnummer, invoice.number],
    [wort.rechnungsdatum, formatDate(invoice.issueDate)],
    [wort.leistungsdatum, invoice.deliveryDate ? formatDate(invoice.deliveryDate) : undefined],
    [
      wort.leistungszeitraum,
      invoice.periodStart && invoice.periodEnd
        ? `${formatDate(invoice.periodStart)} - ${formatDate(invoice.periodEnd)}`
        : undefined,
    ],
    [wort.faelligAm, invoice.dueDate ? formatDate(invoice.dueDate) : undefined],
    [wort.kundennummer, invoice.buyer.identifier],
    [wort.leitwegId, invoice.buyerReference],
    [wort.bestellnummer, invoice.orderReference],
    [wort.projekt, invoice.projectReference],
  ];

  const gefuellt = metaRows.filter((zeile): zeile is [string, string] => Boolean(zeile[1]));
  const metaY = zeichneKennzahlen(page, gefuellt, ctx, addressTop, cursor.y);

  cursor.y = Math.min(y, metaY) - 22;
}

/**
 * Setzt den Kennzahlenblock in der gewaehlten Stellung.
 *
 * Gibt zurueck, wie tief er reicht - danach richtet sich, wo der Fliesstext
 * weitergeht.
 */
function zeichneKennzahlen(
  page: PDFPage,
  zeilen: Array<[string, string]>,
  ctx: LayoutContext,
  addressTop: number,
  cursorY: number,
): number {
  if (zeilen.length === 0) return cursorY;

  const stellung = ctx.kennzahlen ?? 'neben-anschrift';

  if (stellung === 'unter-anschrift') {
    /*
     * Quer unter dem Anschriftenfeld, so wie es gestaltete Rechnungen oft
     * halten - Beschriftung ueber dem Wert.
     *
     * Umgebrochen nach hoechstens vier Spalten. Anfangs wurde die Satzbreite
     * durch die Zahl der Felder geteilt; bei sieben blieben je 68 Punkte, und
     * gerendert stand da "RE-2026-00...", "04011000-1...", "BST-2026-8...".
     * Eine Rechnungsnummer, die nicht vollstaendig auf der Rechnung steht, ist
     * schlimmer als eine zweite Zeile.
     */
    let oben = addressTop - 45 * MM;

    for (let anfang = 0; anfang < zeilen.length; anfang += QUERSPALTEN) {
      const reihe = zeilen.slice(anfang, anfang + QUERSPALTEN);
      const breite = (satzRechts(ctx) - satzLinks(ctx)) / QUERSPALTEN;

      for (const [nummer, [label, value]] of reihe.entries()) {
        const x = satzLinks(ctx) + nummer * breite;
        drawText(page, kuerzeAufBreite(label, ctx.fonts.regular, 8, breite - 6), x, oben, {
          font: ctx.fonts.regular,
          size: 8,
          color: ctx.theme.muted,
        });
        drawText(page, kuerzeAufBreite(value, ctx.fonts.bold, 8.5, breite - 6), x, oben - 11, {
          font: ctx.fonts.bold,
          size: 8.5,
          color: ctx.theme.text,
        });
      }

      oben -= 26;
    }

    return oben + 26 - 11;
  }

  /*
   * Rechtsbuendig untereinander. "ueber-anschrift" setzt hoeher an, bleibt
   * aber unter dem Briefkopf: Beide sind an derselben Kante ausgerichtet -
   * ueberlappen sie, druckt der eine ueber den anderen, und auf der Rechnung
   * steht "Tel. +4RE-2026-0042".
   */
  const metaX = satzLinks(ctx) + 105 * MM;
  let metaY =
    stellung === 'ueber-anschrift'
      ? Math.min(addressTop + 20 * MM, cursorY)
      : Math.min(addressTop + 6, cursorY);

  for (const [label, value] of zeilen) {
    drawText(page, label, metaX, metaY, {
      font: ctx.fonts.regular,
      size: 8,
      color: ctx.theme.muted,
    });
    drawRight(page, value, satzRechts(ctx), metaY, {
      font: ctx.fonts.bold,
      size: 8.5,
      color: ctx.theme.text,
    });
    metaY -= KENNZAHLENZEILE;
  }

  return metaY;
}

function drawTitle(cursor: Cursor, invoice: Invoice, ctx: LayoutContext): void {
  const label = documentLabel(invoice.typeCode);

  // 380 ist die gewoehnliche Rechnung. Bei allem anderen bleibt die
  // Bezeichnung stehen, auch wenn die Vorlage keine setzt.
  if (ctx.ohneTitel === true && invoice.typeCode === '380') {
    cursor.y -= 6;
    return;
  }

  drawText(cursor.page, `${label} ${invoice.number}`, satzLinks(ctx), cursor.y, {
    font: ctx.fonts.bold,
    size: 16,
    color: ctx.theme.accent,
  });
  cursor.y -= 12;
  if (invoice.precedingInvoice) {
    drawText(
      cursor.page,
      `Bezug: Rechnung ${invoice.precedingInvoice.number}` +
        (invoice.precedingInvoice.issueDate
          ? ` vom ${formatDate(invoice.precedingInvoice.issueDate)}`
          : ''),
      satzLinks(ctx),
      cursor.y,
      { font: ctx.fonts.regular, size: 8.5, color: ctx.theme.muted },
    );
    cursor.y -= 12;
  }
  cursor.y -= 10;
}

function columnLayout(
  wort: Beschriftungen,
  ctx: LayoutContext,
): Array<{
  key: string;
  label: string;
  x: number;
  width: number;
  align: 'left' | 'right';
}> {
  const fixed = COLUMNS.reduce((acc, column) => acc + column.width, 0);
  const flexible = satzRechts(ctx) - satzLinks(ctx) - fixed;
  let x = satzLinks(ctx);
  return COLUMNS.map((column) => {
    const width = column.width === 0 ? flexible : column.width;
    const entry = {
      key: column.key,
      label: wort[column.beschriftung],
      x,
      width,
      align: column.align,
    };
    x += width;
    return entry;
  });
}

function drawTableHead(cursor: Cursor, ctx: LayoutContext): void {
  const columns = columnLayout(beschriftungenMit(ctx.beschriftungen), ctx);
  const { page } = cursor;
  const schlicht = ctx.schlichteTabelle === true;

  if (schlicht) {
    // Statt eines Bandes eine Linie darunter - so haelt es die Vorlage.
    page.drawLine({
      start: { x: satzLinks(ctx), y: cursor.y - 4 },
      end: { x: satzRechts(ctx), y: cursor.y - 4 },
      thickness: 0.6,
      color: ctx.theme.text,
    });
  } else {
    page.drawRectangle({
      x: satzLinks(ctx),
      y: cursor.y - 4,
      width: satzRechts(ctx) - satzLinks(ctx),
      height: 18,
      color: ctx.theme.accent,
    });
  }

  for (const column of columns) {
    const options = {
      font: ctx.fonts.bold,
      size: 8,
      color: schlicht ? ctx.theme.text : rgb(1, 1, 1),
    };
    if (column.align === 'right') {
      drawRight(page, column.label, column.x + column.width - 4, cursor.y + 1, options);
    } else {
      drawText(page, column.label, column.x + 4, cursor.y + 1, options);
    }
  }
  cursor.y -= 20;
}

function drawLineTable(
  cursor: Cursor,
  invoice: Invoice,
  totals: InvoiceTotals,
  ctx: LayoutContext,
  ensure: (needed: number) => void,
  _nextPage: () => void,
): void {
  const columns = columnLayout(beschriftungenMit(ctx.beschriftungen), ctx);
  const nameColumn = columns.find((c) => c.key === 'name');
  drawTableHead(cursor, ctx);

  invoice.lines.forEach((line, index) => {
    const nameWidth = (nameColumn?.width ?? 200) - 8;
    const nameLines = wrapText(line.name, ctx.fonts.bold, 9, nameWidth);
    const descriptionLines = line.description
      ? wrapText(line.description, ctx.fonts.regular, 8, nameWidth)
      : [];
    const periodText =
      line.periodStart && line.periodEnd
        ? `Zeitraum ${formatDate(line.periodStart)} - ${formatDate(line.periodEnd)}`
        : undefined;
    const extraLines = [
      ...descriptionLines,
      ...(periodText ? [periodText] : []),
      ...line.attributes.map((a) => `${a.name}: ${a.value}`),
    ];
    const rowHeight = 8 + nameLines.length * 11 + extraLines.length * 9.5;

    ensure(rowHeight + 4);
    if (cursor.y === PAGE.top) drawTableHead(cursor, ctx);

    if (index % 2 === 1 && ctx.schlichteTabelle !== true) {
      cursor.page.drawRectangle({
        x: satzLinks(ctx),
        y: cursor.y - rowHeight + 10,
        width: satzRechts(ctx) - satzLinks(ctx),
        height: rowHeight,
        color: ctx.theme.zebra,
      });
    }

    const baseY = cursor.y;
    const cell = (key: string, text: string, bold = false, size = 9) => {
      const column = columns.find((c) => c.key === key);
      if (!column) return;
      const options = {
        font: bold ? ctx.fonts.bold : ctx.fonts.regular,
        size,
        color: ctx.theme.text,
      };
      if (column.align === 'right') {
        drawRight(cursor.page, text, column.x + column.width - 4, baseY, options);
      } else {
        drawText(cursor.page, text, column.x + 4, baseY, options);
      }
    };

    cell('pos', line.id);
    cell('qty', `${formatQuantity(line.quantity)} ${unitLabel(line.unitCode)}`);
    cell('price', formatAmount(line.unitPrice, undefined, line.unitPrice % 1 === 0 ? 2 : 2));
    cell(
      'vat',
      line.vat.category === 'S' ? `${formatQuantity(line.vat.rate)} %` : line.vat.category,
    );
    cell('total', formatAmount(totals.lineAmounts[index] ?? 0), true);

    let textY = baseY;
    for (const text of nameLines) {
      drawText(cursor.page, text, (nameColumn?.x ?? satzLinks(ctx)) + 4, textY, {
        font: ctx.fonts.bold,
        size: 9,
        color: ctx.theme.text,
      });
      textY -= 11;
    }
    for (const text of extraLines) {
      drawText(cursor.page, text, (nameColumn?.x ?? satzLinks(ctx)) + 4, textY, {
        font: ctx.fonts.regular,
        size: 8,
        color: ctx.theme.muted,
      });
      textY -= 9.5;
    }

    cursor.y -= rowHeight;
    cursor.page.drawLine({
      start: { x: satzLinks(ctx), y: cursor.y + 7 },
      end: { x: satzRechts(ctx), y: cursor.y + 7 },
      thickness: 0.4,
      color: ctx.theme.hairline,
    });
  });

  cursor.y -= 10;
}

function drawTotals(
  cursor: Cursor,
  invoice: Invoice,
  totals: InvoiceTotals,
  ctx: LayoutContext,
  ensure: (needed: number) => void,
): void {
  const wort = beschriftungenMit(ctx.beschriftungen);
  const rows: Array<[string, string, boolean]> = [];
  rows.push([wort.zwischensummeNetto, formatAmount(totals.lineTotal, invoice.currency), false]);
  for (const ac of invoice.allowancesCharges) {
    rows.push([
      `${ac.isCharge ? wort.zuschlag : wort.abschlag}${ac.reason ? ` (${ac.reason})` : ''}`,
      formatAmount(ac.isCharge ? ac.amount : -ac.amount, invoice.currency),
      false,
    ]);
  }
  if (totals.allowanceTotal !== 0 || totals.chargeTotal !== 0) {
    rows.push([wort.gesamtsummeNetto, formatAmount(totals.taxBasisTotal, invoice.currency), false]);
  }
  for (const tax of totals.vatBreakdown) {
    const label =
      tax.category === 'S'
        ? `zzgl. ${formatQuantity(tax.rate)} % USt. auf ${formatAmount(tax.taxableAmount)}`
        : `${vatCategoryLabel(tax.category)} auf ${formatAmount(tax.taxableAmount)}`;
    rows.push([label, formatAmount(tax.taxAmount, invoice.currency), false]);
  }
  if (totals.roundingAmount !== 0) {
    rows.push([wort.rundung, formatAmount(totals.roundingAmount, invoice.currency), false]);
  }
  rows.push([
    `${documentLabel(invoice.typeCode)}sbetrag`,
    formatAmount(totals.grandTotal, invoice.currency),
    true,
  ]);
  if (totals.paidAmount !== 0) {
    rows.push([wort.bereitsGezahlt, formatAmount(-totals.paidAmount, invoice.currency), false]);
    rows.push([wort.zahlbetrag, formatAmount(totals.duePayable, invoice.currency), true]);
  }

  ensure(rows.length * 14 + 24);
  const boxLeft = satzLinks(ctx) + 95 * MM;

  for (const [label, value, emphasised] of rows) {
    if (emphasised) {
      cursor.page.drawLine({
        start: { x: boxLeft, y: cursor.y + 11 },
        end: { x: satzRechts(ctx), y: cursor.y + 11 },
        thickness: 0.8,
        color: ctx.theme.accent,
      });
    }
    const font = emphasised ? ctx.fonts.bold : ctx.fonts.regular;
    const size = emphasised ? 10 : 8.5;

    // Die Beschriftung kann Freitext enthalten - der Grund eines Abschlags
    // steht so in der Rechnung, wie der Aussteller ihn geschrieben hat. Ohne
    // Grenze laeuft sie ueber den Betrag und ueber den rechten Rand hinaus.
    const platz = satzRechts(ctx) - font.widthOfTextAtSize(value, size) - 8 - boxLeft;
    drawText(cursor.page, kuerzeAufBreite(label, font, size, platz), boxLeft, cursor.y, {
      font,
      size,
      color: emphasised ? ctx.theme.text : ctx.theme.muted,
    });
    drawRight(cursor.page, value, satzRechts(ctx), cursor.y, { font, size, color: ctx.theme.text });
    cursor.y -= emphasised ? 16 : 13;
  }
  cursor.y -= 8;
}

function drawVatBreakdown(
  cursor: Cursor,
  invoice: Invoice,
  totals: InvoiceTotals,
  ctx: LayoutContext,
  ensure: (needed: number) => void,
): void {
  const reasons = totals.vatBreakdown.filter((tax) => tax.exemptionReason);
  if (reasons.length === 0) return;
  ensure(reasons.length * 12 + 16);
  for (const tax of reasons) {
    drawText(
      cursor.page,
      `${vatCategoryLabel(tax.category)}: ${tax.exemptionReason}`,
      satzLinks(ctx),
      cursor.y,
      {
        font: ctx.fonts.regular,
        size: 8,
        color: ctx.theme.muted,
      },
    );
    cursor.y -= 11;
  }
  cursor.y -= 8;
  void invoice;
}

function drawPaymentBlock(
  cursor: Cursor,
  invoice: Invoice,
  totals: InvoiceTotals,
  ctx: LayoutContext,
  ensure: (needed: number) => void,
): void {
  const payment = invoice.payment;
  const lines: string[] = [];
  if (!ctx.zahlungszielImBriefpapier) {
    if (payment?.terms) lines.push(payment.terms);
    else if (invoice.dueDate) {
      lines.push(
        `Zahlbar ohne Abzug bis zum ${formatDate(invoice.dueDate)} auf das unten genannte Konto.`,
      );
    }
  }
  if (payment?.iban) {
    lines.push(
      [
        payment.accountName ? `Kontoinhaber: ${payment.accountName}` : undefined,
        `IBAN: ${formatIban(payment.iban)}`,
        payment.bic ? `BIC: ${payment.bic}` : undefined,
      ]
        .filter(Boolean)
        .join('   '),
    );
  }
  if (payment?.remittanceInformation) {
    lines.push(`Verwendungszweck: ${payment.remittanceInformation}`);
  } else if (payment?.iban) {
    lines.push(`Verwendungszweck: ${invoice.number}`);
  }
  if (payment?.meansCode === '59') {
    lines.push(
      `Der Betrag von ${formatAmount(totals.duePayable, invoice.currency)} wird per SEPA-Lastschrift eingezogen.` +
        (payment.mandateReference ? ` Mandatsreferenz: ${payment.mandateReference}` : ''),
    );
  }
  if (lines.length === 0) return;

  ensure(lines.length * 12 + 30);
  drawText(cursor.page, beschriftungenMit(ctx.beschriftungen).zahlung, satzLinks(ctx), cursor.y, {
    font: ctx.fonts.bold,
    size: 9,
    color: ctx.theme.text,
  });
  cursor.y -= 13;
  for (const line of lines) {
    for (const wrapped of wrapText(
      line,
      ctx.fonts.regular,
      8.5,
      satzRechts(ctx) - satzLinks(ctx),
    )) {
      drawText(cursor.page, wrapped, satzLinks(ctx), cursor.y, {
        font: ctx.fonts.regular,
        size: 8.5,
        color: ctx.theme.text,
      });
      cursor.y -= 11;
    }
  }
  cursor.y -= 8;
}

function drawNotes(
  cursor: Cursor,
  invoice: Invoice,
  ctx: LayoutContext,
  ensure: (needed: number) => void,
): void {
  if (invoice.notes.length === 0) return;
  ensure(invoice.notes.length * 14 + 10);
  for (const note of invoice.notes) {
    for (const wrapped of wrapText(
      note.text,
      ctx.fonts.regular,
      8.5,
      satzRechts(ctx) - satzLinks(ctx),
    )) {
      drawText(cursor.page, wrapped, satzLinks(ctx), cursor.y, {
        font: ctx.fonts.regular,
        size: 8.5,
        color: ctx.theme.muted,
      });
      cursor.y -= 11;
    }
    cursor.y -= 4;
  }
}

function drawContinuationHeader(cursor: Cursor, invoice: Invoice, ctx: LayoutContext): void {
  // Von der Marke aus, die der Aufrufer gesetzt hat - nicht vom Seitenrand.
  // Mit Briefbogen liegt sie tiefer, sonst schreibt die Fortsetzungszeile in
  // den Briefkopf.
  const oben = cursor.y;
  drawText(
    cursor.page,
    `${documentLabel(invoice.typeCode)} ${invoice.number} - Fortsetzung`,
    satzLinks(ctx),
    oben - 6,
    { font: ctx.fonts.bold, size: 9, color: ctx.theme.muted },
  );
  cursor.y = oben - 30;
}

function drawFooter(
  page: PDFPage,
  index: number,
  total: number,
  invoice: Invoice,
  ctx: LayoutContext,
): void {
  const seller = invoice.seller;
  const y = PAGE.bottom;

  /*
   * Bringt der Briefbogen eine eigene Fusszeile mit, entfaellt unsere.
   *
   * Gerendert nachgemessen: Sonst stehen zwei uebereinander - unsere mit
   * Registergericht und Steuernummer, seine mit Zahlungshinweis und AGB. Der
   * Absender hat sich fuer eine entschieden, als er seinen Bogen entwarf.
   *
   * Die Seitenzahl bleibt trotzdem, sobald es mehr als eine Seite gibt: Sie
   * gehoert zum Dokument, nicht zum Bogen, und ein Empfaenger muss sehen
   * koennen, ob ihm ein Blatt fehlt.
   */
  if (ctx.eigeneFusszeile === false) {
    if (total > 1) {
      drawRight(page, `Seite ${index + 1} von ${total}`, satzRechts(ctx), y + 16, {
        font: ctx.fonts.regular,
        size: 7,
        color: ctx.theme.muted,
      });
    }
    return;
  }

  page.drawLine({
    start: { x: satzLinks(ctx), y: y + 26 },
    end: { x: satzRechts(ctx), y: y + 26 },
    thickness: 0.4,
    color: ctx.theme.hairline,
  });

  const identity = [
    seller.name,
    seller.legalRegistrationId ? `Register: ${seller.legalRegistrationId}` : undefined,
    seller.vatId ? `USt-IdNr.: ${seller.vatId}` : undefined,
    seller.taxNumber ? `Steuernummer: ${seller.taxNumber}` : undefined,
  ]
    .filter(Boolean)
    .join('  |  ');

  const options = { font: ctx.fonts.regular, size: 7, color: ctx.theme.muted };
  drawText(page, identity, satzLinks(ctx), y + 16, options);
  if (ctx.footerNote) drawText(page, ctx.footerNote, satzLinks(ctx), y + 7, options);
  drawRight(page, `Seite ${index + 1} von ${total}`, satzRechts(ctx), y + 16, options);
  drawRight(
    page,
    'Diese Rechnung enthaelt strukturierte Daten nach ZUGFeRD 2.3.',
    satzRechts(ctx),
    y + 7,
    {
      ...options,
      size: 6.5,
    },
  );
}

// --- Hilfsfunktionen --------------------------------------------------------

interface TextOptions {
  font: PDFFont;
  size: number;
  color: RGB;
}

function drawText(page: PDFPage, text: string, x: number, y: number, options: TextOptions): void {
  page.drawText(text, { x, y, font: options.font, size: options.size, color: options.color });
}

function drawRight(
  page: PDFPage,
  text: string,
  right: number,
  y: number,
  options: TextOptions,
): void {
  const width = options.font.widthOfTextAtSize(text, options.size);
  page.drawText(text, {
    x: right - width,
    y,
    font: options.font,
    size: options.size,
    color: options.color,
  });
}

/**
 * Kuerzt auf die verfuegbare Breite und haengt ein Auslassungszeichen an.
 *
 * Gebraucht wird das dort, wo eine Beschriftung und ein Betrag in derselben
 * Zeile stehen und der Betrag nicht weichen darf. Lieber ein sichtbar
 * gekuerzter Text als zwei uebereinandergedruckte.
 */
/**
 * Wo der Kennzahlenblock zu liegen kommt - als Rechteck.
 *
 * Dieselben Zahlen wie beim Zeichnen, und zwar aus denselben Ausdruecken.
 * Eine zweite Rechnung fuer dasselbe waere die Stelle, an der Pruefung und
 * Wirklichkeit auseinanderlaufen - und dann meldet die Pruefung "frei", wo
 * die Rechnung ueberdruckt.
 *
 * `obergrenze` ist, wie tief der Briefkopf reicht; ohne eigenen Briefkopf ist
 * das der obere Seitenrand.
 */
export function kennzahlenrahmen(
  stellung: Kennzahlenstellung,
  zeilen: number,
  obergrenze: number = PAGE.top,
  anschriftOben?: number,
  satzspiegel?: { links: number; rechts: number },
): { x1: number; y1: number; x2: number; y2: number } {
  const ctx = { satzspiegel } as LayoutContext;
  const addressTop = anschriftenhoehe(anschriftOben);

  if (stellung === 'unter-anschrift') {
    const oben = addressTop - 45 * MM;
    const reihen = Math.ceil(Math.max(1, zeilen) / QUERSPALTEN);
    return {
      x1: satzLinks(ctx),
      y1: oben - (reihen - 1) * 26 - KENNZAHLENZEILE,
      x2: satzRechts(ctx),
      y2: oben + 9,
    };
  }

  const start =
    stellung === 'ueber-anschrift'
      ? Math.min(addressTop + 20 * MM, obergrenze)
      : Math.min(addressTop + 6, obergrenze);

  return {
    x1: satzLinks(ctx) + 105 * MM,
    y1: start - zeilen * KENNZAHLENZEILE,
    x2: satzRechts(ctx),
    y2: start + 9,
  };
}

export function kuerzeAufBreite(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (maxWidth <= 0 || font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  let gekuerzt = text;
  while (gekuerzt.length > 1 && font.widthOfTextAtSize(`${gekuerzt}…`, size) > maxWidth) {
    gekuerzt = gekuerzt.slice(0, -1);
  }
  return `${gekuerzt.trimEnd()}…`;
}

/** Weicher Umbruch an Wortgrenzen, harte Trennung nur bei ueberlangen Woertern. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else chunk += char;
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function addressLines(party: Party): string[] {
  return [
    party.name,
    party.tradingName && party.tradingName !== party.name ? party.tradingName : undefined,
    party.contact?.name,
    party.address.line1,
    party.address.line2,
    [party.address.postcode, party.address.city].filter(Boolean).join(' '),
    party.address.countryCode !== 'DE' ? party.address.countryCode : undefined,
  ].filter((value): value is string => Boolean(value));
}

function formatIban(iban: string): string {
  return iban
    .replace(/\s/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function documentLabel(typeCode: string): string {
  switch (typeCode) {
    case '381':
      return 'Gutschrift';
    case '384':
      return 'Rechnungskorrektur';
    case '386':
      return 'Abschlagsrechnung';
    case '389':
      return 'Gutschrift (Selbstfakturierung)';
    default:
      return 'Rechnung';
  }
}

function vatCategoryLabel(category: string): string {
  switch (category) {
    case 'AE':
      return 'Steuerschuldnerschaft des Leistungsempfaengers';
    case 'K':
      return 'Innergemeinschaftliche Lieferung';
    case 'G':
      return 'Ausfuhrlieferung';
    case 'E':
      return 'Steuerbefreit';
    case 'O':
      return 'Nicht steuerbar';
    case 'Z':
      return 'Nullsatz';
    default:
      return 'Umsatzsteuer';
  }
}

function unitLabel(unitCode: string): string {
  switch (unitCode) {
    case 'C62':
      return 'Stk.';
    case 'HUR':
      return 'Std.';
    case 'DAY':
      return 'Tage';
    case 'MON':
      return 'Mon.';
    case 'KGM':
      return 'kg';
    case 'MTR':
      return 'm';
    case 'MTK':
      return 'qm';
    case 'LTR':
      return 'l';
    case 'KMT':
      return 'km';
    case 'LS':
      return 'pausch.';
    default:
      return unitCode;
  }
}
