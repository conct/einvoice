/**
 * CCITT-Gruppe-4-Faxbilder entschluesseln (ITU-T T.6).
 *
 * ## Warum das hier steht
 *
 * Ein am Buerokopierer eingescanntes Blatt enthaelt keinen Text, sondern ein
 * Bild davon - lesbar nur mit Texterkennung. Und die braucht ein Bild.
 *
 * Nachgemessen an einem Scan aus einem Canon iR-ADV: Die Datei ist eine
 * gemischte Rasterdatei. Der ganzseitige JPEG-Hintergrund traegt die
 * Gestaltung - gruene Balken, Logo - aber **kein lesbares Wort**; der Text
 * steckt in einer 1888 x 2632 grossen Bildmaske daneben, faxcodiert. Wer nur
 * das JPEG an die Texterkennung gibt, bekommt nichts zurueck und weiss nicht
 * warum.
 *
 * Die Maske allein ist sogar das bessere Futter als eine zusammengesetzte
 * Seite: reines Schwarz auf Weiss, ohne Hintergrundrauschen.
 *
 * ## Warum selbst geschrieben
 *
 * Weil es sonst nichts kostet. Der Kern kommt ohne Abhaengigkeiten aus, und
 * derselbe Entschluesseler laeuft danach im Browser, in der App und in Node.
 * Eine Bibliothek dafuer waere auf jeder der drei Plattformen eine eigene
 * Frage gewesen.
 *
 * ## Was er kann und was nicht
 *
 * Nur K < 0, also reines zweidimensionales Gruppe-4. Das ist es, was Scanner
 * in PDF legen. Gruppe 3 (K >= 0) mit seinen Zeilensynchronisationen kommt
 * dort praktisch nicht vor und wird abgewiesen statt halb versucht.
 */

export interface CcittAngaben {
  /** Bildbreite in Bildpunkten - im PDF die Angabe `Columns`. */
  breite: number;
  /** Bildhoehe. Fehlt sie, wird gelesen, bis die Daten enden. */
  hoehe?: number;
  /**
   * Ist eine Eins schwarz? Im PDF `BlackIs1`, Vorgabe falsch.
   *
   * Die Vorgabe dreht die Bedeutung um: Ohne die Angabe steht die Null fuer
   * Schwarz. Das Ergebnis dieser Datei ist davon unberuehrt - sie liefert
   * immer 1 fuer Schwarz -, aber wer die Rohbits selbst deutet, faellt darauf
   * herein.
   */
  schwarzIstEins?: boolean;
}

export interface Fehlerbild {
  breite: number;
  hoehe: number;
  /** Ein Byte je Bildpunkt: 0 = weiss, 1 = schwarz. */
  punkte: Uint8Array;
  /** Zeilen, die vorzeitig abbrachen - ein Mass fuer die Verlaesslichkeit. */
  gestoerteZeilen: number;
}

// --- Kodetabellen -----------------------------------------------------------

/*
 * Die Lauflaengenkodes aus T.4, als Bitzeichenketten.
 *
 * Zeichenketten statt Zahlenpaaren, weil ein Kode nur mitsamt seiner Laenge
 * eindeutig ist: "011" und "0011" sind verschiedene Kodes, als Zahl gelesen
 * beide die Drei. Der Verlust an Geschwindigkeit faellt nicht ins Gewicht -
 * ein Blatt wird einmal entschluesselt, nicht in einer Schleife.
 */

const WEISS_ENDE: Record<string, number> = {
  '00110101': 0, '000111': 1, '0111': 2, '1000': 3, '1011': 4, '1100': 5,
  '1110': 6, '1111': 7, '10011': 8, '10100': 9, '00111': 10, '01000': 11,
  '001000': 12, '000011': 13, '110100': 14, '110101': 15, '101010': 16,
  '101011': 17, '0100111': 18, '0001100': 19, '0001000': 20, '0010111': 21,
  '0000011': 22, '0000100': 23, '0101000': 24, '0101011': 25, '0010011': 26,
  '0100100': 27, '0011000': 28, '00000010': 29, '00000011': 30, '00011010': 31,
  '00011011': 32, '00010010': 33, '00010011': 34, '00010100': 35, '00010101': 36,
  '00010110': 37, '00010111': 38, '00101000': 39, '00101001': 40, '00101010': 41,
  '00101011': 42, '00101100': 43, '00101101': 44, '00000100': 45, '00000101': 46,
  '00001010': 47, '00001011': 48, '01010010': 49, '01010011': 50, '01010100': 51,
  '01010101': 52, '00100100': 53, '00100101': 54, '01011000': 55, '01011001': 56,
  '01011010': 57, '01011011': 58, '01001010': 59, '01001011': 60, '00110010': 61,
  '00110011': 62, '00110100': 63,
};

const WEISS_ZUSATZ: Record<string, number> = {
  '11011': 64, '10010': 128, '010111': 192, '0110111': 256, '00110110': 320,
  '00110111': 384, '01100100': 448, '01100101': 512, '01101000': 576,
  '01100111': 640, '011001100': 704, '011001101': 768, '011010010': 832,
  '011010011': 896, '011010100': 960, '011010101': 1024, '011010110': 1088,
  '011010111': 1152, '011011000': 1216, '011011001': 1280, '011011010': 1344,
  '011011011': 1408, '010011000': 1472, '010011001': 1536, '010011010': 1600,
  '011000': 1664, '010011011': 1728,
};

const SCHWARZ_ENDE: Record<string, number> = {
  '0000110111': 0, '010': 1, '11': 2, '10': 3, '011': 4, '0011': 5, '0010': 6,
  '00011': 7, '000101': 8, '000100': 9, '0000100': 10, '0000101': 11,
  '0000111': 12, '00000100': 13, '00000111': 14, '000011000': 15,
  '0000010111': 16, '0000011000': 17, '0000001000': 18, '00001100111': 19,
  '00001101000': 20, '00001101100': 21, '00000110111': 22, '00000101000': 23,
  '00000010111': 24, '00000011000': 25, '000011001010': 26, '000011001011': 27,
  '000011001100': 28, '000011001101': 29, '000001101000': 30, '000001101001': 31,
  '000001101010': 32, '000001101011': 33, '000011010010': 34, '000011010011': 35,
  '000011010100': 36, '000011010101': 37, '000011010110': 38, '000011010111': 39,
  '000001101100': 40, '000001101101': 41, '000011011010': 42, '000011011011': 43,
  '000001010100': 44, '000001010101': 45, '000001010110': 46, '000001010111': 47,
  '000001100100': 48, '000001100101': 49, '000001010010': 50, '000001010011': 51,
  '000000100100': 52, '000000110111': 53, '000000111000': 54, '000000100111': 55,
  '000000101000': 56, '000001011000': 57, '000001011001': 58, '000000101011': 59,
  '000000101100': 60, '000001011010': 61, '000001100110': 62, '000001100111': 63,
};

const SCHWARZ_ZUSATZ: Record<string, number> = {
  '0000001111': 64, '000011001000': 128, '000011001001': 192,
  '000001011011': 256, '000000110011': 320, '000000110100': 384,
  '000000110101': 448, '0000001101100': 512, '0000001101101': 576,
  '0000001001010': 640, '0000001001011': 704, '0000001001100': 768,
  '0000001001101': 832, '0000001110010': 896, '0000001110011': 960,
  '0000001110100': 1024, '0000001110101': 1088, '0000001110110': 1152,
  '0000001110111': 1216, '0000001010010': 1280, '0000001010011': 1344,
  '0000001010100': 1408, '0000001010101': 1472, '0000001011010': 1536,
  '0000001011011': 1600, '0000001100100': 1664, '0000001100101': 1728,
};

/** Ab 1792 gelten dieselben Zusatzkodes fuer beide Farben. */
const GEMEINSAM_ZUSATZ: Record<string, number> = {
  '00000001000': 1792, '00000001100': 1856, '00000001101': 1920,
  '000000010010': 1984, '000000010011': 2048, '000000010100': 2112,
  '000000010101': 2176, '000000010110': 2240, '000000010111': 2304,
  '000000011100': 2368, '000000011101': 2432, '000000011110': 2496,
  '000000011111': 2560,
};

/** Der laengste Kode ueberhaupt - danach ist die Suche vergeblich. */
const MAX_KODELAENGE = 14;

// --- Bitstrom ---------------------------------------------------------------

class Bitstrom {
  private stelle = 0;

  constructor(private readonly daten: Uint8Array) {}

  get amEnde(): boolean {
    return this.stelle >= this.daten.length * 8;
  }

  naechstesBit(): number {
    const byte = this.daten[this.stelle >> 3] ?? 0;
    const bit = (byte >> (7 - (this.stelle & 7))) & 1;
    this.stelle += 1;
    return bit;
  }

  /** Setzt den Lesezeiger zurueck - noetig, wenn ein Kode nicht aufgeht. */
  zurueck(bits: number): void {
    this.stelle -= bits;
  }
}

/**
 * Liest eine Lauflaenge.
 *
 * Zusatzkodes ab 64 stehen vor einem Endkode und werden addiert; eine Laenge
 * von 2560 plus 63 ist also zwei Kodes lang. Ohne diese Kette waeren lange
 * weisse Raender - der Normalfall auf einem Blatt Papier - nicht darstellbar.
 */
function leseLauf(strom: Bitstrom, schwarz: boolean): number | undefined {
  let summe = 0;

  for (let runde = 0; runde < 64; runde += 1) {
    let kode = '';
    let gefunden: number | undefined;

    while (kode.length < MAX_KODELAENGE) {
      if (strom.amEnde) return undefined;
      kode += String(strom.naechstesBit());

      const ende = schwarz ? SCHWARZ_ENDE[kode] : WEISS_ENDE[kode];
      if (ende !== undefined) return summe + ende;

      const zusatz = (schwarz ? SCHWARZ_ZUSATZ[kode] : WEISS_ZUSATZ[kode]) ?? GEMEINSAM_ZUSATZ[kode];
      if (zusatz !== undefined) {
        gefunden = zusatz;
        break;
      }
    }

    if (gefunden === undefined) return undefined;
    summe += gefunden;
  }

  return undefined;
}

// --- Entschluesseln ---------------------------------------------------------

/**
 * Entschluesselt ein Gruppe-4-Bild.
 *
 * Das Verfahren arbeitet zeilenweise gegen die Zeile darueber: Statt jeden
 * Bildpunkt zu nennen, beschreibt es, wo sich die Farbwechsel gegenueber der
 * Vorzeile verschieben. Die gedachte Zeile ueber der ersten ist ganz weiss.
 *
 * Gespeichert wird je Zeile nur die Liste der Wechselstellen. Das ist nicht
 * nur sparsam, sondern die Form, in der das Verfahren selbst denkt - mit
 * einem Punktfeld waere jede Suche nach dem naechsten Wechsel eine Schleife.
 */
export function entschluesseleCcitt(daten: Uint8Array, angaben: CcittAngaben): Fehlerbild {
  const breite = angaben.breite;
  const strom = new Bitstrom(daten);

  const zeilen: number[][] = [];
  let vorzeile: number[] = [];
  let gestoerteZeilen = 0;

  const hoechstens = angaben.hoehe ?? 100_000;

  for (let zeile = 0; zeile < hoechstens; zeile += 1) {
    if (strom.amEnde) break;

    const wechsel: number[] = [];
    let a0 = -1;
    let schwarz = false;
    let gestoert = false;

    while (a0 < breite) {
      /*
       * b1 ist der erste Farbwechsel der Vorzeile rechts von a0, der in
       * dieselbe Richtung geht wie der naechste gesuchte - also von der
       * aktuellen Farbe weg. Die Wechselstellen wechseln sich ab, deshalb
       * entscheidet die Stellenzahl ueber die Richtung: gerade heisst
       * weiss-nach-schwarz.
       */
      let b1 = breite;
      let b2 = breite;
      for (let i = 0; i < vorzeile.length; i += 1) {
        const stelle = vorzeile[i]!;
        if (stelle > a0 && i % 2 === (schwarz ? 1 : 0)) {
          b1 = stelle;
          b2 = vorzeile[i + 1] ?? breite;
          break;
        }
      }

      const modus = leseModus(strom);
      if (!modus) {
        gestoert = true;
        break;
      }

      if (modus.art === 'ende') {
        gestoert = wechsel.length === 0;
        break;
      }

      if (modus.art === 'pass') {
        a0 = b2;
        continue;
      }

      if (modus.art === 'senkrecht') {
        const a1 = Math.max(0, Math.min(breite, b1 + modus.versatz));
        wechsel.push(a1);
        a0 = a1;
        schwarz = !schwarz;
        continue;
      }

      // Waagerecht: zwei Lauflaengen in der aktuellen und der Gegenfarbe.
      const erster = leseLauf(strom, schwarz);
      const zweiter = leseLauf(strom, !schwarz);
      if (erster === undefined || zweiter === undefined) {
        gestoert = true;
        break;
      }

      const anfang = a0 < 0 ? 0 : a0;
      const a1 = Math.min(breite, anfang + erster);
      const a2 = Math.min(breite, a1 + zweiter);
      wechsel.push(a1, a2);
      a0 = a2;
    }

    if (gestoert) {
      gestoerteZeilen += 1;
      if (wechsel.length === 0 && zeilen.length > 0) break;
    }

    zeilen.push(wechsel);
    vorzeile = wechsel;
  }

  return { ...zuPunkten(zeilen, breite, angaben.hoehe), gestoerteZeilen };
}

interface Modus {
  art: 'pass' | 'waagerecht' | 'senkrecht' | 'ende';
  versatz: number;
}

/**
 * Liest den naechsten Kodierungsmodus.
 *
 * Die Kodes sind praefixfrei, also genuegt es, Bit fuer Bit zu lesen, bis
 * einer aufgeht. Sieben Nullen in Folge sind kein Modus mehr, sondern das
 * Ende des Bildes oder eine Stoerung.
 */
function leseModus(strom: Bitstrom): Modus | undefined {
  let kode = '';

  while (kode.length < 14) {
    if (strom.amEnde) return kode.length > 0 ? { art: 'ende', versatz: 0 } : undefined;
    kode += String(strom.naechstesBit());

    switch (kode) {
      case '1':
        return { art: 'senkrecht', versatz: 0 };
      case '011':
        return { art: 'senkrecht', versatz: 1 };
      case '010':
        return { art: 'senkrecht', versatz: -1 };
      case '001':
        return { art: 'waagerecht', versatz: 0 };
      case '0001':
        return { art: 'pass', versatz: 0 };
      case '000011':
        return { art: 'senkrecht', versatz: 2 };
      case '000010':
        return { art: 'senkrecht', versatz: -2 };
      case '0000011':
        return { art: 'senkrecht', versatz: 3 };
      case '0000010':
        return { art: 'senkrecht', versatz: -3 };
      case '000000000001':
        return { art: 'ende', versatz: 0 };
      default:
        break;
    }
  }

  return undefined;
}

/** Aus den Wechselstellen je Zeile ein Punktfeld bauen. */
function zuPunkten(
  zeilen: number[][],
  breite: number,
  sollhoehe?: number,
): { breite: number; hoehe: number; punkte: Uint8Array } {
  const hoehe = sollhoehe ?? zeilen.length;
  const punkte = new Uint8Array(breite * hoehe);

  for (let zeile = 0; zeile < Math.min(hoehe, zeilen.length); zeile += 1) {
    const wechsel = zeilen[zeile]!;
    const versatz = zeile * breite;
    let schwarz = false;
    let stelle = 0;

    for (const wechselstelle of wechsel) {
      const bis = Math.min(breite, wechselstelle);
      if (schwarz) punkte.fill(1, versatz + stelle, versatz + bis);
      stelle = bis;
      schwarz = !schwarz;
    }

    if (schwarz && stelle < breite) punkte.fill(1, versatz + stelle, versatz + breite);
  }

  return { breite, hoehe, punkte };
}
