import { computeTotals } from '../model/totals';
import { validateInvoice, type ValidationIssue } from '../model/validate';
import { utf8Decode } from '../util/base64';
import { round } from '../util/money';
import { extractInvoiceXml, type ExtractedAttachment, extractAttachments } from './extract';
import { parseInvoiceXml, type ParsedInvoice } from './xml';

export type SourceKind = 'pdf-hybrid' | 'xml' | 'pdf-without-xml' | 'unknown';

export interface ReceivedInvoice extends ParsedInvoice {
  kind: SourceKind;
  /** Dateiname der XML-Quelle, bei hybriden PDF der Name des Anhangs */
  sourceFilename?: string;
  /** Weitere Anhaenge des PDF, z.B. Stundennachweise */
  attachments: ExtractedAttachment[];
  /** Abweichungen zwischen den Summen im Dokument und der Nachrechnung */
  totalMismatches: Array<{ field: string; declared: number; computed: number }>;
  issues: ValidationIssue[];
}

/**
 * Liest eine empfangene E-Rechnung ein - hybrides PDF oder reines XML.
 *
 * Seit dem 1. Januar 2025 muss jedes Unternehmen in Deutschland E-Rechnungen
 * entgegennehmen koennen. Fuer den Empfang zaehlt nicht das Bild, sondern das
 * XML: die Funktion liefert deshalb immer das strukturierte Dokument und
 * meldet, wenn die im Dokument genannten Summen nicht aufgehen.
 */
export async function readEInvoice(bytes: Uint8Array, filename?: string): Promise<ReceivedInvoice> {
  const kind = detectKind(bytes);

  if (kind === 'pdf-hybrid' || kind === 'pdf-without-xml') {
    const attachments = await extractAttachments(bytes);
    const found = await extractInvoiceXml(bytes);
    if (!found) {
      throw new EInvoiceError(
        'Das PDF enthaelt keine eingebettete XML-Rechnung. Es ist damit keine E-Rechnung, sondern ein reines Bilddokument.',
        'no-embedded-xml',
      );
    }
    return finish(parseInvoiceXml(found.xml), 'pdf-hybrid', found.filename, attachments);
  }

  if (kind === 'xml') {
    return finish(parseInvoiceXml(utf8Decode(bytes)), 'xml', filename, []);
  }

  throw new EInvoiceError(
    'Unbekanntes Dateiformat - erwartet wird ein PDF oder eine XML-Datei.',
    'unknown-format',
  );
}

export class EInvoiceError extends Error {
  constructor(
    message: string,
    readonly code: 'no-embedded-xml' | 'unknown-format' | 'parse-failed',
  ) {
    super(message);
    this.name = 'EInvoiceError';
  }
}

function finish(
  parsed: ParsedInvoice,
  kind: SourceKind,
  sourceFilename: string | undefined,
  attachments: ExtractedAttachment[],
): ReceivedInvoice {
  const computed = computeTotals(parsed.invoice);
  const declared = parsed.declaredTotals;

  const comparisons: Array<[string, number | undefined, number]> = [
    ['Positionssumme', declared.lineTotal, computed.lineTotal],
    ['Gesamtsumme netto', declared.taxBasisTotal, computed.taxBasisTotal],
    ['Umsatzsteuer', declared.taxTotal, computed.taxTotal],
    ['Bruttobetrag', declared.grandTotal, computed.grandTotal],
    ['Zahlbetrag', declared.duePayable, computed.duePayable],
  ];

  const totalMismatches = comparisons
    .filter(([, value]) => value !== undefined)
    .map(([field, value, computedValue]) => ({
      field,
      declared: round(value ?? 0, 2),
      computed: round(computedValue, 2),
    }))
    .filter((entry) => Math.abs(entry.declared - entry.computed) > 0.005);

  return {
    ...parsed,
    kind,
    sourceFilename,
    attachments: attachments.filter((a) => a.filename !== sourceFilename),
    totalMismatches,
    issues: validateInvoice(parsed.invoice).issues,
  };
}

/** Formaterkennung anhand der ersten Bytes, nicht anhand der Dateiendung. */
export function detectKind(bytes: Uint8Array): SourceKind {
  if (bytes.length >= 5) {
    const head = String.fromCharCode(...bytes.subarray(0, 5));
    if (head === '%PDF-') return 'pdf-hybrid';
  }
  // Byte-Order-Mark ueberspringen, dann nach der XML-Deklaration suchen
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const probe = utf8Decode(bytes.subarray(start, Math.min(bytes.length, start + 512))).trimStart();
  if (probe.startsWith('<?xml') || probe.startsWith('<')) return 'xml';
  return 'unknown';
}
