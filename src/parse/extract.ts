import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { utf8Decode } from '../util/base64';

export interface ExtractedAttachment {
  filename: string;
  mimeType?: string;
  /** AFRelationship: Alternative kennzeichnet die gleichwertige XML-Darstellung */
  relationship?: string;
  description?: string;
  data: Uint8Array;
}

/**
 * Dateinamen, unter denen die verschiedenen Generationen des Standards ihre
 * XML-Rechnung ablegen. Die Reihenfolge ist die Suchreihenfolge.
 */
const KNOWN_INVOICE_FILENAMES = [
  'factur-x.xml',
  'zugferd-invoice.xml',
  'xrechnung.xml',
  'ZUGFeRD-invoice.xml',
  'order-x.xml',
];

/**
 * Liest alle eingebetteten Dateien aus einem PDF.
 *
 * Der Namensbaum EmbeddedFiles darf beliebig tief verschachtelt sein; grosse
 * Erzeuger nutzen das kaum, aber ein Empfangsmodul muss damit rechnen.
 */
export async function extractAttachments(pdf: Uint8Array): Promise<ExtractedAttachment[]> {
  const doc = await PDFDocument.load(pdf, {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
  });

  const found: ExtractedAttachment[] = [];
  const seen = new Set<PDFDict>();

  const readFileSpec = (spec: PDFDict): void => {
    if (seen.has(spec)) return;
    seen.add(spec);

    const ef = spec.lookupMaybe(PDFName.of('EF'), PDFDict);
    const stream = ef?.lookup(PDFName.of('F')) ?? ef?.lookup(PDFName.of('UF'));
    if (!(stream instanceof PDFRawStream)) return;

    const nameEntry = spec.lookup(PDFName.of('UF')) ?? spec.lookup(PDFName.of('F'));
    const filename = decodePdfText(nameEntry) ?? 'anhang.bin';
    const subtype = stream.dict.lookup(PDFName.of('Subtype'));

    found.push({
      filename,
      mimeType: subtype instanceof PDFName ? subtype.decodeText() : undefined,
      relationship: nameOf(spec.lookup(PDFName.of('AFRelationship'))),
      description: decodePdfText(spec.lookup(PDFName.of('Desc'))),
      data: decodePDFRawStream(stream).decode(),
    });
  };

  const walkNameTree = (node: PDFDict | undefined, depth = 0): void => {
    if (!node || depth > 32) return;
    const names = node.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (names) {
      // Der Baum speichert Paare: [Name, Dateispezifikation, Name, ...]
      for (let i = 1; i < names.size(); i += 2) {
        const spec = names.lookupMaybe(i, PDFDict);
        if (spec) readFileSpec(spec);
      }
    }
    const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
    if (kids) {
      for (let i = 0; i < kids.size(); i++) {
        walkNameTree(kids.lookupMaybe(i, PDFDict), depth + 1);
      }
    }
  };

  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  walkNameTree(names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict));

  // Zusaetzlich ueber die dokumentweite AF-Liste gehen: manche Erzeuger
  // referenzieren dort Dateien, die nicht im Namensbaum stehen.
  const af = doc.catalog.lookupMaybe(PDFName.of('AF'), PDFArray);
  if (af) {
    for (let i = 0; i < af.size(); i++) {
      const spec = af.lookupMaybe(i, PDFDict);
      if (spec) readFileSpec(spec);
    }
  }

  return found;
}

/**
 * Holt die XML-Rechnung aus einem hybriden PDF. Bevorzugt die bekannten
 * Dateinamen, faellt dann auf den Anhang mit AFRelationship "Alternative"
 * zurueck und zuletzt auf die erste XML-Datei ueberhaupt.
 */
export async function extractInvoiceXml(
  pdf: Uint8Array,
): Promise<{ filename: string; xml: string } | undefined> {
  const attachments = await extractAttachments(pdf);
  const byName = KNOWN_INVOICE_FILENAMES.map((name) =>
    attachments.find((a) => a.filename.toLowerCase() === name.toLowerCase()),
  ).find(Boolean);

  const candidate =
    byName ??
    attachments.find((a) => a.relationship === 'Alternative' && isXml(a)) ??
    attachments.find(isXml);

  if (!candidate) return undefined;
  return { filename: candidate.filename, xml: utf8Decode(candidate.data) };
}

function isXml(attachment: ExtractedAttachment): boolean {
  return (
    attachment.filename.toLowerCase().endsWith('.xml') ||
    (attachment.mimeType ?? '').includes('xml')
  );
}

function nameOf(value: unknown): string | undefined {
  return value instanceof PDFName ? value.decodeText() : undefined;
}

/** PDFString und PDFHexString haben beide decodeText(), sind aber nicht typgleich. */
function decodePdfText(value: unknown): string | undefined {
  if (value && typeof (value as { decodeText?: unknown }).decodeText === 'function') {
    return (value as { decodeText: () => string }).decodeText();
  }
  return undefined;
}
