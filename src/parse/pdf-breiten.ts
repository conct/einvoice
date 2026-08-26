import { PDFArray, PDFDict, type PDFDocument, PDFName, PDFNumber } from 'pdf-lib';

/**
 * Wie breit ein Glyph ist - damit der naechste daneben steht und nicht darauf.
 *
 * ## Warum das noetig ist
 *
 * Ein PDF sagt nicht bei jedem Textstueck, wo es steht. Es sagt es einmal und
 * verlaesst sich darauf, dass der Leser mitrechnet: Jeder gesetzte Glyph
 * schiebt die Schreibmarke um seine Breite weiter. Wer das nicht tut, legt alle
 * Stuecke einer Zeile uebereinander.
 *
 * Nachgemessen an einer gestalteten Fremdrechnung: Zwanzig Stuecke einer Zeile
 * meldeten dieselben drei x-Werte, weil der Setzer nur dreimal neu
 * positionierte. Beim Nachzeichnen stand die Zeile als Klumpen auf dem Blatt.
 *
 * ## Warum es ohne Schriftparser geht
 *
 * Die Breiten stehen im Dokument, nicht in der Schrift: einfache Schriften
 * fuehren `/Widths` ab `/FirstChar`, zusammengesetzte ein `/W`-Feld mit `/DW`
 * als Vorgabe. Das ist Absicht des Formats - ein Betrachter soll Text
 * ausmessen koennen, ohne das Schriftprogramm zu oeffnen. Genau das nutzen wir.
 *
 * Alle Breiten stehen in Tausendstel der Schriftgroesse.
 */

/** Vorgabebreite fuer zusammengesetzte Schriften, wenn `/DW` fehlt. */
const DW_VORGABE = 1000;

export interface Breiten {
  /** Zwei Bytes je Code - bei Type0 der Normalfall. */
  breit: boolean;
  /** Breite eines Glyphen in Tausendstel Schriftgroesse. */
  breite(code: number): number;
}

/**
 * Liest `/W` einer zusammengesetzten Schrift.
 *
 * Das Feld hat zwei Formen, die sich abwechseln duerfen:
 * `c [w1 w2 ...]` gibt Breiten ab Code c einzeln, `cVon cBis w` gibt einer
 * ganzen Spanne dieselbe. Wer nur die erste Form liest, verliert bei
 * Teilmengenschriften ganze Bloecke - dort ist die zweite die haeufigere.
 */
function leseW(feld: PDFArray | undefined): Map<number, number> {
  const breiten = new Map<number, number>();
  if (!feld) return breiten;

  const werte = feld.asArray();
  let i = 0;
  while (i < werte.length) {
    const erstes = werte[i];
    if (!(erstes instanceof PDFNumber)) break;
    const von = erstes.asNumber();

    const zweites = werte[i + 1];
    if (zweites instanceof PDFArray) {
      for (const [versatz, wert] of zweites.asArray().entries()) {
        if (wert instanceof PDFNumber) breiten.set(von + versatz, wert.asNumber());
      }
      i += 2;
      continue;
    }

    const drittes = werte[i + 2];
    if (zweites instanceof PDFNumber && drittes instanceof PDFNumber) {
      const bis = zweites.asNumber();
      const wert = drittes.asNumber();
      // Die Obergrenze faengt beschaedigte Spannen ab, die sonst Speicher
      // fressen, bevor jemand den Fehler bemerkt.
      for (let code = von; code <= bis && code - von < 0x10000; code += 1) {
        breiten.set(code, wert);
      }
      i += 3;
      continue;
    }

    break;
  }

  return breiten;
}

function zahl(dict: PDFDict | undefined, name: string): number | undefined {
  const wert = dict?.lookupMaybe(PDFName.of(name), PDFNumber);
  return wert ? wert.asNumber() : undefined;
}

/**
 * Sammelt die Glyphenbreiten aller Schriften einer Seite.
 *
 * Fehlt eine Angabe, kommt `MissingWidth` aus dem Schriftdeskriptor zum
 * Zug und sonst null. Null ist die ehrlichere Vorgabe als ein geratener
 * Mittelwert: Ein Stueck bleibt dann stehen, wo es stand, statt sich um einen
 * erfundenen Betrag zu verschieben.
 */
export function liefereBreiten(doc: PDFDocument, seite: number): Map<string, Breiten> {
  const alle = new Map<string, Breiten>();
  const ressourcen = doc.getPage(seite).node.Resources();
  const fonts = ressourcen?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) return alle;

  for (const [name] of fonts.asMap()) {
    const dict = fonts.lookupMaybe(name, PDFDict);
    if (!dict) continue;

    const art = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
    const schluessel = name.asString().replace(/^\//, '');

    if (art === '/Type0') {
      const nachfahren = dict.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
      const kind = nachfahren ? doc.context.lookupMaybe(nachfahren.get(0), PDFDict) : undefined;

      const vorgabe = zahl(kind, 'DW') ?? DW_VORGABE;
      const tabelle = leseW(kind?.lookupMaybe(PDFName.of('W'), PDFArray));

      alle.set(schluessel, {
        breit: true,
        breite: (code) => tabelle.get(code) ?? vorgabe,
      });
      continue;
    }

    const ersterCode = zahl(dict, 'FirstChar') ?? 0;
    const liste = dict.lookupMaybe(PDFName.of('Widths'), PDFArray);
    const deskriptor = dict.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
    const fehlend = zahl(deskriptor, 'MissingWidth') ?? 0;

    const tabelle = new Map<number, number>();
    for (const [versatz, wert] of liste?.asArray().entries() ?? []) {
      if (wert instanceof PDFNumber) tabelle.set(ersterCode + versatz, wert.asNumber());
    }

    alle.set(schluessel, {
      breit: false,
      breite: (code) => tabelle.get(code) ?? fehlend,
    });
  }

  return alle;
}

/**
 * Wie weit ein gesetzter Lauf die Schreibmarke weiterschiebt.
 *
 * Die Rechnung steht so in der PDF-Spezifikation: Fuer jeden Glyphen
 * `(w0/1000 * Tfs + Tc + Tw) * Th`, und eine Zahl im TJ-Feld zieht
 * `Tj/1000 * Tfs * Th` wieder ab.
 *
 * `Tw` gilt nur fuer das Byte 32 und nur bei einfachen Schriften - bei
 * zusammengesetzten waere 32 die Haelfte eines Codes und kein Leerzeichen.
 * Diese Ausnahme steht ausdruecklich in der Spezifikation und ist genau die
 * Sorte Regel, die man beim Nachbauen vergisst.
 */
export function laufbreite(
  stuecke: (number[] | number)[],
  breiten: Breiten | undefined,
  groesse: number,
  zeichenabstand = 0,
  wortabstand = 0,
  streckung = 1,
): number {
  if (!breiten) return 0;

  let summe = 0;
  for (const teil of stuecke) {
    if (typeof teil === 'number') {
      summe -= (teil / 1000) * groesse * streckung;
      continue;
    }

    const schritt = breiten.breit ? 2 : 1;
    for (let i = 0; i + schritt <= teil.length; i += schritt) {
      const code = breiten.breit ? ((teil[i] ?? 0) << 8) | (teil[i + 1] ?? 0) : (teil[i] ?? 0);
      const wort = !breiten.breit && code === 32 ? wortabstand : 0;
      summe += ((breiten.breite(code) / 1000) * groesse + zeichenabstand + wort) * streckung;
    }
  }

  return summe;
}
