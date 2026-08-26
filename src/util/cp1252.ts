/**
 * Kodierung nach Windows-1252.
 *
 * Das DATEV-Format erwartet ANSI, nicht UTF-8. Schickt man ihm UTF-8, kommen
 * Umlaute als zwei Zeichen an - aus "Straße" wird "StraÃŸe" - und der
 * Buchungstext im Rechnungswesen der Kanzlei ist unbrauchbar. Das ist einer
 * der haeufigsten Gruende, warum ein Stapel beim ersten Versuch abgelehnt
 * wird.
 *
 * Windows-1252 stimmt fuer die meisten Zeichen mit Latin-1 ueberein; nur der
 * Bereich 0x80 bis 0x9F ist belegt, wo Latin-1 Steuerzeichen hat. Genau dort
 * sitzen das Euro-Zeichen und die typografischen Anfuehrungszeichen, die aus
 * jedem Textverarbeitungsprogramm mitkommen.
 */

/** Sonderfaelle 0x80 bis 0x9F: Unicode-Punkt -> Byte */
const SONDERFAELLE = new Map<number, number>([
  [0x20ac, 0x80], // Euro
  [0x201a, 0x82], // tiefes einfaches Anfuehrungszeichen
  [0x0192, 0x83],
  [0x201e, 0x84], // tiefes doppeltes Anfuehrungszeichen
  [0x2026, 0x85], // Auslassungspunkte
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89], // Promille
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91], // einfache Anfuehrungszeichen
  [0x2019, 0x92],
  [0x201c, 0x93], // doppelte Anfuehrungszeichen
  [0x201d, 0x94],
  [0x2022, 0x95], // Aufzaehlungspunkt
  [0x2013, 0x96], // Halbgeviertstrich
  [0x2014, 0x97], // Geviertstrich
  [0x02dc, 0x98],
  [0x2122, 0x99], // Markenzeichen
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

/**
 * Ersatzschreibweisen fuer Zeichen, die es in Windows-1252 nicht gibt.
 *
 * Lieber "EUR" als ein Fragezeichen: Ein Fragezeichen mitten im Buchungstext
 * sieht aus wie ein Datenfehler, eine Ersatzschreibweise ist erkennbar
 * gewollt.
 */
const ERSATZ = new Map<number, string>([
  [0x2212, '-'], // Minuszeichen
  [0x00a0, ' '], // geschuetztes Leerzeichen
  [0x202f, ' '], // schmales geschuetztes Leerzeichen
  [0x2011, '-'], // geschuetzter Bindestrich
]);

export interface Cp1252Ergebnis {
  bytes: Uint8Array;
  /** Zeichen, die ersetzt werden mussten - fuer eine Warnung an den Nutzer */
  ersetzt: string[];
}

/**
 * Wandelt Text nach Windows-1252 und meldet, was dabei nicht darstellbar war.
 *
 * Nicht darstellbare Zeichen werden zu einem Fragezeichen, aber eben nicht
 * stillschweigend: Der Aufrufer bekommt die Liste und kann entscheiden, ob er
 * warnt oder abbricht.
 */
export function cp1252(text: string): Cp1252Ergebnis {
  const bytes: number[] = [];
  const ersetzt: string[] = [];

  for (const zeichen of text) {
    const punkt = zeichen.codePointAt(0) ?? 0;

    const ersatz = ERSATZ.get(punkt);
    if (ersatz !== undefined) {
      for (const b of ersatz) bytes.push(b.charCodeAt(0));
      continue;
    }

    if (punkt < 0x80 || (punkt >= 0xa0 && punkt <= 0xff)) {
      bytes.push(punkt);
      continue;
    }

    const sonder = SONDERFAELLE.get(punkt);
    if (sonder !== undefined) {
      bytes.push(sonder);
      continue;
    }

    bytes.push(0x3f); // Fragezeichen
    if (!ersetzt.includes(zeichen)) ersetzt.push(zeichen);
  }

  return { bytes: new Uint8Array(bytes), ersetzt };
}
