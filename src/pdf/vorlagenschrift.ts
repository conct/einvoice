import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObjectCopier,
  PDFOperator,
  PDFOperatorNames,
  type PDFPage,
  PDFRef,
} from 'pdf-lib';

import type { Briefpapier, Farbe, Textlauf } from './briefpapier-typen';

/**
 * Den Briefkopftext mit der Schrift der Vorlage setzen.
 *
 * ## Warum ueberhaupt
 *
 * Mit der eigenen Hausschrift nachgezeichnet sitzt jede Zeile an der richtigen
 * Stelle, laeuft aber anders breit - eine Wortmarke sieht dann erkennbar falsch
 * aus. Wer nahe an das Original will, muss die Schrift der Vorlage nehmen.
 *
 * ## Wie
 *
 * Nicht uebersetzt, sondern **uebernommen**: dieselben Glyphencodes, dieselbe
 * Textmatrix, dasselbe Schriftprogramm. Das Schriftobjekt wandert mitsamt
 * seinem eingebetteten Programm ins Zieldokument; die Zeichenbefehle werden
 * roh geschrieben. Damit ist der Umweg ueber Unicode ganz vermieden - auch
 * Glyphen, die keine ToUnicode-Tabelle zurueckuebersetzt, stehen richtig.
 *
 * Die Unterschneidungen aus dem TJ-Feld bleiben erhalten. Sie einzuebnen waere
 * der sichtbarste Fehler: Gesperrte Ziffern und ausgeglichene Wortmarken
 * verlieren dann genau die Feinabstimmung, wegen der sie gesetzt wurden.
 *
 * ## Was uebernommen wird und was nicht
 *
 * Die **Farbe** kommt aus unserem Befund, nicht aus der Vorlage - dort steht
 * sie oft in CMYK, und DeviceCMYK ist unter einem sRGB-Ausgabe-Intent nicht
 * zulaessig. Umgerechnet nach RGB bleibt das Dokument konform.
 *
 * ## Der Haken, den ein Mensch entscheiden muss
 *
 * Ein eingebettetes Schriftprogramm ist lizenziert. Es aus einer erhaltenen
 * Rechnung in die eigenen kuenftigen Rechnungen zu uebernehmen deckt keine
 * uebliche Schriftlizenz ab - das darf nur, wer die Schrift selbst lizenziert
 * hat. Deshalb ist dieser Weg nichts, was im Hintergrund geschieht: Er wird
 * ausdruecklich gewaehlt, und die Hausschrift bleibt der Normalfall.
 */

export interface Vorlagensetzer {
  /** Namen der Schriften aus der Vorlage, die uebernommen werden konnten. */
  schriften: string[];
  /** Setzt den Briefkopftext auf eine Seite. Beliebig oft aufrufbar. */
  setze(seite: PDFPage, papier: Briefpapier, versatz?: Versatz): Vorlagenbefund;
}

/** Verschiebung beim Setzen - fuer Vorlagen, deren Seite groesser ist als A4. */
export interface Versatz {
  x: number;
  y: number;
}

export interface Vorlagenbefund {
  /** Gesetzte Textlaeufe. */
  laeufe: number;
  /** Uebernommene Schriften, mit ihrem Namen aus der Vorlage. */
  schriften: string[];
  /** Laeufe, deren Schrift sich nicht uebernehmen liess. */
  uebersprungen: number;
}

const zahl = (wert: number) => PDFNumber.of(Number(wert.toFixed(4)));

const alsHexString = (bytes: number[]): PDFHexString =>
  PDFHexString.of(bytes.map((b) => (b & 0xff).toString(16).padStart(2, '0')).join(''));

/**
 * Setzt den Briefkopftext aus `papier.laeufe` auf die Zielseite.
 *
 * `quelle` sind die Bytes der Vorlage - dieselbe Datei, aus der `papier`
 * gelesen wurde. Sie wird erneut geoeffnet, weil das Schriftobjekt daraus
 * kopiert werden muss und der Befund selbst keine PDF-Objekte traegt.
 */
export async function bereiteVorlagenschrift(
  zielDoc: PDFDocument,
  papier: Briefpapier,
  quelle: Uint8Array,
  quellseite = 0,
): Promise<Vorlagensetzer> {
  const quellDoc = await PDFDocument.load(quelle, { throwOnInvalidObject: false });
  const quellRessourcen = quellDoc.getPage(quellseite).node.Resources();
  const quellSchriften = quellRessourcen?.lookupMaybe(PDFName.of('Font'), PDFDict);
  const kopierer = PDFObjectCopier.for(quellDoc.context, zielDoc.context);

  /*
   * Die Schriften werden einmal ins Zieldokument kopiert, das Eintragen in die
   * Seitenressourcen geschieht je Seite. Deshalb die Teilung: Das Kopieren
   * braucht die Quelldatei und ist asynchron, das Setzen muss synchron sein,
   * weil es beim Anlegen jeder Seite passiert - und eine Rechnung kann
   * mehrere haben.
   */
  const verweise = new Map<string, PDFRef>();
  const namen: string[] = [];

  for (const name of new Set(papier.laeufe.map((lauf) => lauf.schrift))) {
    const verweis = quellSchriften?.get(PDFName.of(name));
    if (!verweis) continue;

    const kopie = kopierer.copy(verweis);
    verweise.set(name, kopie instanceof PDFRef ? kopie : zielDoc.context.register(kopie));
    namen.push(name);
  }

  return {
    schriften: namen,
    setze: (seite, bogen, versatz = { x: 0, y: 0 }) =>
      setzeAufSeite(seite, bogen, verweise, versatz),
  };
}

function setzeAufSeite(
  seite: PDFPage,
  papier: Briefpapier,
  verweise: Map<string, PDFRef>,
  versatz: Versatz,
): Vorlagenbefund {
  // Je Seite ein eigener Schluessel; das Schriftobjekt dahinter ist dasselbe.
  const schluessel = new Map<string, PDFName>();
  for (const [name, ref] of verweise) {
    const zielname = seite.node.newFontDictionaryKey('BP');
    seite.node.setFontDictionary(zielname, ref);
    schluessel.set(name, zielname);
  }

  const befehle: PDFOperator[] = [];
  let gesetzt = 0;
  let uebersprungen = 0;
  let letzteFarbe: Farbe | undefined;

  for (const lauf of papier.laeufe) {
    const schrift = schluessel.get(lauf.schrift);
    if (!schrift) {
      uebersprungen += 1;
      continue;
    }

    befehle.push(PDFOperator.of(PDFOperatorNames.PushGraphicsState));

    if (
      !letzteFarbe ||
      letzteFarbe.r !== lauf.farbe.r ||
      letzteFarbe.g !== lauf.farbe.g ||
      letzteFarbe.b !== lauf.farbe.b
    ) {
      befehle.push(
        PDFOperator.of(PDFOperatorNames.NonStrokingColorRgb, [
          zahl(lauf.farbe.r),
          zahl(lauf.farbe.g),
          zahl(lauf.farbe.b),
        ]),
      );
      letzteFarbe = lauf.farbe;
    }

    const matrix: number[] = [...lauf.matrix];
    matrix[4] = (matrix[4] ?? 0) + versatz.x;
    matrix[5] = (matrix[5] ?? 0) + versatz.y;

    befehle.push(
      PDFOperator.of(PDFOperatorNames.BeginText),
      PDFOperator.of(PDFOperatorNames.SetFontAndSize, [schrift, zahl(lauf.groesse)]),
      /*
       * Zeichen- und Wortabstand muessen mit, sonst geht der Blocksatz
       * verloren: Die Vorlage gleicht ihre Fusszeile ueber `Tw` aus, und ohne
       * ihn endet die Zeile zu frueh - der Trennstrich am rechten Rand steht
       * dann frei.
       */
      PDFOperator.of(PDFOperatorNames.SetCharacterSpacing, [zahl(lauf.zeichenabstand)]),
      PDFOperator.of(PDFOperatorNames.SetWordSpacing, [zahl(lauf.wortabstand)]),
      PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [zahl(lauf.streckung * 100)]),
      PDFOperator.of(PDFOperatorNames.SetTextMatrix, matrix.map(zahl)),
      PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [
        seite.doc.context.obj(
          lauf.stuecke.map((teil) =>
            Array.isArray(teil) ? alsHexString(teil) : zahl(teil as number),
          ),
        ),
      ]),
      PDFOperator.of(PDFOperatorNames.EndText),
      PDFOperator.of(PDFOperatorNames.PopGraphicsState),
    );

    gesetzt += 1;
  }

  seite.pushOperators(...befehle);
  return { laeufe: gesetzt, schriften: [...verweise.keys()], uebersprungen };
}

/**
 * Bequemlichkeit fuer einmalige Ausgaben - bereitet vor und setzt in einem.
 */
export async function setzeMitVorlagenschrift(
  zielSeite: PDFPage,
  papier: Briefpapier,
  quelle: Uint8Array,
  quellseite = 0,
): Promise<Vorlagenbefund> {
  const setzer = await bereiteVorlagenschrift(zielSeite.doc, papier, quelle, quellseite);
  return setzer.setze(zielSeite, papier);
}

/** Nur zur Anzeige: welche Schriften die Vorlage im Briefkopf benutzt. */
export function schriftenImBriefkopf(laeufe: Textlauf[]): string[] {
  return [...new Set(laeufe.map((lauf) => lauf.schrift))].sort();
}
