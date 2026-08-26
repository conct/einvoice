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

import type { Briefpapier, Farbe, Textlauf } from '../parse/pdf-gestaltung';

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
export async function setzeMitVorlagenschrift(
  zielSeite: PDFPage,
  papier: Briefpapier,
  quelle: Uint8Array,
  quellseite = 0,
): Promise<Vorlagenbefund> {
  const zielDoc = zielSeite.doc;
  const quellDoc = await PDFDocument.load(quelle, { throwOnInvalidObject: false });

  const quellRessourcen = quellDoc.getPage(quellseite).node.Resources();
  const quellSchriften = quellRessourcen?.lookupMaybe(PDFName.of('Font'), PDFDict);

  const kopierer = PDFObjectCopier.for(quellDoc.context, zielDoc.context);

  /** Name in der Vorlage -> Name auf unserer Seite. */
  const uebernommen = new Map<string, PDFName>();
  const namen: string[] = [];

  const holeSchrift = (name: string): PDFName | undefined => {
    const schon = uebernommen.get(name);
    if (schon) return schon;
    if (!quellSchriften) return undefined;

    const verweis = quellSchriften.get(PDFName.of(name));
    if (!verweis) return undefined;

    /*
     * Der Kopierer zieht das ganze Geflecht mit: Schriftdeskriptor,
     * eingebettetes Programm, Kodierungstabelle. Eines davon von Hand
     * nachzubauen waere die Stelle, an der still etwas verlorenginge.
     */
    /*
     * Bei einem Verweis liefert der Kopierer bereits einen im Zieldokument
     * zugewiesenen Verweis zurueck. Ihn noch einmal zu registrieren erzeugt ein
     * Objekt, das nur einen Verweis enthaelt - das Schriftprogramm haengt dann
     * an keiner Seite mehr. Nachgemessen: Die Ausgabe schrumpfte auf 14 kB und
     * enthielt kein FontFile3 mehr, waehrend die Textbefehle voellig richtig
     * dastanden. Ein Fehler, den man dem Inhaltsstrom nicht ansieht.
     */
    const kopie = kopierer.copy(verweis);
    const ref: PDFRef = kopie instanceof PDFRef ? kopie : zielDoc.context.register(kopie);

    // "BP" fuer Briefpapier - der Schluessel darf mit nichts kollidieren, was
    // die Rechnung selbst spaeter an Schriften einsetzt.
    const zielname = zielSeite.node.newFontDictionaryKey('BP');
    zielSeite.node.setFontDictionary(zielname, ref);

    uebernommen.set(name, zielname);
    namen.push(name);
    return zielname;
  };

  const befehle: PDFOperator[] = [];
  let gesetzt = 0;
  let uebersprungen = 0;
  let letzteFarbe: Farbe | undefined;

  for (const lauf of papier.laeufe) {
    const schrift = holeSchrift(lauf.schrift);
    if (!schrift) {
      uebersprungen += 1;
      continue;
    }

    befehle.push(PDFOperator.of(PDFOperatorNames.PushGraphicsState));

    // Die Farbe nur wechseln, wenn sie sich aendert - das haelt den
    // Inhaltsstrom lesbar, wenn jemand hineinsieht.
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

    befehle.push(
      PDFOperator.of(PDFOperatorNames.BeginText),
      PDFOperator.of(PDFOperatorNames.SetFontAndSize, [schrift, zahl(lauf.groesse)]),
      /*
       * Zeichen- und Wortabstand muessen mit, sonst geht der Blocksatz
       * verloren: Die Vorlage gleicht ihre Fusszeile ueber `Tw` aus, und ohne
       * ihn endet die Zeile zu frueh - der Trennstrich am rechten Rand steht
       * dann frei. Sie werden je Lauf gesetzt, weil sie sich innerhalb eines
       * Textblocks aendern duerfen.
       */
      PDFOperator.of(PDFOperatorNames.SetCharacterSpacing, [zahl(lauf.zeichenabstand)]),
      PDFOperator.of(PDFOperatorNames.SetWordSpacing, [zahl(lauf.wortabstand)]),
      PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [zahl(lauf.streckung * 100)]),
      PDFOperator.of(PDFOperatorNames.SetTextMatrix, lauf.matrix.map(zahl)),
      PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [
        zielDoc.context.obj(
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

  zielSeite.pushOperators(...befehle);

  return { laeufe: gesetzt, schriften: namen, uebersprungen };
}

/** Nur zur Anzeige: welche Schriften die Vorlage im Briefkopf benutzt. */
export function schriftenImBriefkopf(laeufe: Textlauf[]): string[] {
  return [...new Set(laeufe.map((lauf) => lauf.schrift))].sort();
}
