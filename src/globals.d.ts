/**
 * Minimale Deklarationen fuer die WHATWG-Textkodierer.
 *
 * Node, Browser und die React-Native-Engines Hermes und JSC stellen sie alle
 * bereit, sie stehen aber in keiner gemeinsamen TypeScript-Bibliothek. Die
 * Kernbibliothek kann deshalb weder "DOM" noch "node" als lib einbinden, ohne
 * Globals vorzugaukeln, die auf einer der Plattformen fehlen.
 */
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array | ArrayBuffer): string;
}
