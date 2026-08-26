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

/**
 * Minimale Deklaration von URL.
 *
 * Denselben Grund wie oben: Node, Browser und die React-Native-Engines kennen
 * URL alle, die Typen dafuer stehen aber in der DOM-Bibliothek. Deklariert
 * ist nur, was pruefeDienstadresse braucht - das ist zugleich die Liste
 * dessen, was eine Umgebung koennen muss.
 *
 * Der Konstruktor wirft bei einer unbrauchbaren Eingabe; die aufrufende Stelle
 * faengt das ab und macht daraus eine Meldung fuer den Nutzer.
 */
declare class URL {
  constructor(input: string, base?: string);
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly href: string;
}

