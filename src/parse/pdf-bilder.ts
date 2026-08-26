import { unzlibSync } from 'fflate';
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

import { entschluesseleCcitt } from './ccitt';
import { alsGraustufenPng, maskeAlsGrau } from '../util/png';

/**
 * Die Bilder einer Seite herausloesen - fuer die Texterkennung.
 *
 * ## Warum das noetig ist
 *
 * Ein eingescanntes Blatt enthaelt keinen Text, sondern ein Bild davon. Die
 * Texterkennung braucht dieses Bild, und aus einem PDF kommt man nur an zwei
 * Wegen daran: die Seite rastern - was einen vollstaendigen PDF-Zeichner
 * verlangt - oder die eingebetteten Bilder herausnehmen. Bei einem Scan ist
 * das zweite nicht nur billiger, sondern besser.
 *
 * ## Was ein Scanner tatsaechlich ablegt
 *
 * Nachgemessen an einem Canon iR-ADV: eine gemischte Rasterdatei. Ein
 * ganzseitiges JPEG traegt die Gestaltung - gruene Balken, Logo -, aber der
 * Text darin ist ausgewaschen und nicht zu lesen. Der Text steckt daneben in
 * einer faxcodierten Bildmaske, schwarz auf weiss.
 *
 * Deshalb wird die **Maske bevorzugt**: Sie ist das bessere Futter fuer die
 * Erkennung als die zusammengesetzte Seite, weil ihr das Hintergrundrauschen
 * fehlt. Wer stattdessen das JPEG nimmt, bekommt nichts zurueck und weiss
 * nicht, ob das Blatt leer war oder der Leser versagt hat.
 */

export type Bildart = 'jpeg' | 'png';

export interface Seitenbild {
  /** Der Name der Ressource im Dokument, etwa "Obj9". */
  name: string;
  art: Bildart;
  bytes: Uint8Array;
  breite: number;
  hoehe: number;
  /**
   * Eine Bildmaske - reiner Schwarzweissanteil, meist die Textebene eines
   * Scans. Sie hat Vorrang vor dem Hintergrundbild.
   */
  istMaske: boolean;
  /** Anteil der Seitenflaeche, den das Bild bedeckt - grob ueber die Masse. */
  deckung: number;
}

/** Ab dieser Deckung gilt ein Bild als ganzseitig. */
const GANZSEITIG_AB = 0.5;

function zahl(dict: PDFDict, name: string): number | undefined {
  return dict.lookupMaybe(PDFName.of(name), PDFNumber)?.asNumber();
}

/** Die Filterkette als Liste von Namen, egal ob einzeln oder als Feld notiert. */
function filterkette(dict: PDFDict): string[] {
  const roh = dict.lookup(PDFName.of('Filter'));
  if (roh instanceof PDFName) return [roh.asString()];
  if (roh instanceof PDFArray) {
    return roh.asArray().map((eintrag) => String(eintrag));
  }
  return [];
}

function decodeParms(doc: PDFDocument, dict: PDFDict): PDFDict | undefined {
  const roh = dict.lookup(PDFName.of('DecodeParms'));
  if (roh instanceof PDFDict) return roh;
  if (roh instanceof PDFArray) {
    for (const eintrag of roh.asArray()) {
      const aufgeloest = doc.context.lookup(eintrag);
      if (aufgeloest instanceof PDFDict) return aufgeloest;
    }
  }
  return undefined;
}

/**
 * Loest die Filter auf, bis nur noch der Bildkodierer uebrig ist.
 *
 * Scanner schachteln gern: `[/FlateDecode /DCTDecode]` heisst erst auspacken,
 * dann ist es ein JPEG. Wer nur den ersten Filternamen liest, haelt die Datei
 * fuer ein JPEG und schreibt zlib-Bytes in eine .jpg-Datei - ein Fehler, den
 * man erst sieht, wenn ein Betrachter sie nicht oeffnet.
 */
function packeAus(bytes: Uint8Array, kette: string[]): { rest: string[]; bytes: Uint8Array } {
  let daten = bytes;
  let stelle = 0;

  while (stelle < kette.length && kette[stelle] === '/FlateDecode') {
    try {
      daten = unzlibSync(daten);
    } catch {
      return { rest: kette.slice(stelle), bytes: daten };
    }
    stelle += 1;
  }

  return { rest: kette.slice(stelle), bytes: daten };
}

/**
 * Alle Bilder einer Seite, in der Reihenfolge ihrer Eignung fuer die Erkennung.
 *
 * Ganzseitige Masken zuerst, dann ganzseitige Bilder, dann der Rest. Wer die
 * Liste von vorn abarbeitet, gibt der Erkennung zuerst das, worauf am ehesten
 * Text steht.
 */
export async function liesSeitenbilder(bytes: Uint8Array, seite = 0): Promise<Seitenbild[]> {
  const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
  const blatt = doc.getPage(seite);
  const { width: seitenbreite, height: seitenhoehe } = blatt.getSize();
  const xobjekte = blatt.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobjekte) return [];

  const bilder: Seitenbild[] = [];

  for (const [name] of xobjekte.asMap()) {
    const strom = xobjekte.lookup(name);
    if (!(strom instanceof PDFRawStream)) continue;

    const dict = strom.dict;
    if (dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() !== '/Image') continue;

    const breite = zahl(dict, 'Width') ?? 0;
    const hoehe = zahl(dict, 'Height') ?? 0;
    if (breite < 1 || hoehe < 1) continue;

    const istMaske = dict.lookup(PDFName.of('ImageMask')) instanceof PDFBool;
    const { rest, bytes: roh } = packeAus(strom.contents, filterkette(dict));
    const schluessel = name.asString().replace(/^\//, '');

    /*
     * Die Deckung wird aus den Bildpunkten gegen die Seitenflaeche geschaetzt,
     * nicht aus der Platzierung im Inhaltsstrom. Ungenau, aber es genuegt fuer
     * die Frage "ganze Seite oder Briefmarke" - und es spart, den
     * Inhaltsstrom ein zweites Mal zu lesen.
     */
    const deckung = Math.min(
      1,
      (breite * hoehe) / Math.max(1, seitenbreite * seitenhoehe * 9),
    );

    if (rest[0] === '/DCTDecode') {
      bilder.push({ name: schluessel, art: 'jpeg', bytes: roh, breite, hoehe, istMaske, deckung });
      continue;
    }

    if (rest[0] === '/CCITTFaxDecode') {
      const parms = decodeParms(doc, dict);
      const k = parms ? (zahl(parms, 'K') ?? 0) : 0;

      // Nur reines Gruppe-4. Gruppe 3 legen Scanner praktisch nie in ein PDF,
      // und halb versucht waere schlimmer als ehrlich ausgelassen.
      if (k >= 0) continue;

      const bild = entschluesseleCcitt(roh, {
        breite: parms ? (zahl(parms, 'Columns') ?? breite) : breite,
        hoehe,
      });
      bilder.push({
        name: schluessel,
        art: 'png',
        bytes: alsGraustufenPng(bild.breite, bild.hoehe, maskeAlsGrau(bild.punkte)),
        breite: bild.breite,
        hoehe: bild.hoehe,
        istMaske,
        deckung,
      });
      continue;
    }

    // Unkomprimierte Graustufen kommen selten vor, kosten aber nichts.
    if (rest.length === 0 && !istMaske && zahl(dict, 'BitsPerComponent') === 8) {
      const erwartet = breite * hoehe;
      if (roh.length >= erwartet) {
        bilder.push({
          name: schluessel,
          art: 'png',
          bytes: alsGraustufenPng(breite, hoehe, roh.subarray(0, erwartet)),
          breite,
          hoehe,
          istMaske,
          deckung,
        });
      }
    }
  }

  return bilder.sort((eins, zwei) => bewertung(zwei) - bewertung(eins));
}

/**
 * Wie vielversprechend ist ein Bild fuer die Texterkennung?
 *
 * Ganzseitige Masken zuerst - sie tragen bei einem Scan den Text. Dann
 * ganzseitige Bilder, dann alles nach Groesse. Ein Logo oder eine
 * Unterschrift steht damit hinten, wo es hingehoert.
 */
function bewertung(bild: Seitenbild): number {
  const ganzseitig = bild.deckung >= GANZSEITIG_AB;
  return (
    (bild.istMaske && ganzseitig ? 3_000_000 : 0) +
    (ganzseitig ? 1_000_000 : 0) +
    bild.breite * bild.hoehe
  );
}
