/**
 * Minimaler XML-Schreiber. Bewusst ohne DOM und ohne Abhaengigkeit, damit der
 * Erzeuger in Node, im Browser und in React Native identisch laeuft.
 *
 * CII und UBL sind sequenzgebundene Schemata: die Reihenfolge der Elemente ist
 * Teil der Gueltigkeit. Ein Baum aus Objekten wuerde das verschleiern, deshalb
 * schreibt der Generator linear und die Quellcode-Reihenfolge entspricht der
 * Schema-Reihenfolge.
 */

export type XmlAttributes = Record<string, string | number | undefined>;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Entfernt Zeichen, die XML 1.0 nicht erlaubt. Aus Eingabefeldern und
 * Zwischenablagen landen sonst Steuerzeichen im Dokument, die jeden Parser
 * beim Empfaenger scheitern lassen.
 */
export function sanitizeXmlText(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const allowed =
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000;
    if (allowed) out += char;
  }
  return out;
}

export class XmlWriter {
  private readonly parts: string[] = [];
  private readonly stack: string[] = [];
  private readonly indentText: string;

  constructor(options: { indent?: string; declaration?: boolean } = {}) {
    this.indentText = options.indent ?? '  ';
    if (options.declaration !== false) {
      this.parts.push('<?xml version="1.0" encoding="UTF-8"?>\n');
    }
  }

  private get pad(): string {
    return this.indentText.repeat(this.stack.length);
  }

  private static attrs(attributes?: XmlAttributes): string {
    if (!attributes) return '';
    let out = '';
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === '') continue;
      out += ` ${key}="${escapeXml(String(value))}"`;
    }
    return out;
  }

  open(tag: string, attributes?: XmlAttributes): this {
    this.parts.push(`${this.pad}<${tag}${XmlWriter.attrs(attributes)}>\n`);
    this.stack.push(tag);
    return this;
  }

  close(tag?: string): this {
    const open = this.stack.pop();
    if (!open) throw new Error('XmlWriter: close() ohne offenes Element');
    if (tag && tag !== open) {
      throw new Error(`XmlWriter: erwartet </${open}>, bekommen </${tag}>`);
    }
    this.parts.push(`${this.pad}</${open}>\n`);
    return this;
  }

  /** Blattelement mit Textinhalt. Leere Werte werden ausgelassen. */
  leaf(tag: string, value: string | number | undefined | null, attributes?: XmlAttributes): this {
    if (value === undefined || value === null || value === '') return this;
    const text = escapeXml(sanitizeXmlText(String(value)));
    this.parts.push(`${this.pad}<${tag}${XmlWriter.attrs(attributes)}>${text}</${tag}>\n`);
    return this;
  }

  /** Element ohne Inhalt, aber mit Attributen. */
  empty(tag: string, attributes?: XmlAttributes): this {
    this.parts.push(`${this.pad}<${tag}${XmlWriter.attrs(attributes)}/>\n`);
    return this;
  }

  /** Oeffnet ein Element, fuehrt den Rumpf aus und schliesst es wieder. */
  element(tag: string, attributes: XmlAttributes | undefined, body: (w: XmlWriter) => void): this {
    this.open(tag, attributes);
    body(this);
    return this.close(tag);
  }

  /** Wie element(), wird aber komplett uebersprungen, wenn condition falsch ist. */
  elementIf(
    condition: unknown,
    tag: string,
    attributes: XmlAttributes | undefined,
    body: (w: XmlWriter) => void,
  ): this {
    if (!condition) return this;
    return this.element(tag, attributes, body);
  }

  toString(): string {
    if (this.stack.length > 0) {
      throw new Error(`XmlWriter: nicht geschlossene Elemente: ${this.stack.join(' > ')}`);
    }
    return this.parts.join('');
  }
}
