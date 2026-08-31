import fontkit from '@pdf-lib/fontkit';
import {
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  PDFOperator,
  PDFOperatorNames,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

/**
 * Unterschneidung - das, was pdf-lib beim Zeichnen weglaesst.
 *
 * ## Der Befund
 *
 * pdf-lib setzt eingebetteten Text als ein einziges `Tj` aus Glyphennummern.
 * Wie weit der Betrachter danach ruecken soll, liest er aus der `/Widths`-
 * Tabelle - und dort steht der **unbeeinflusste** Vorschub jeder Glyphe. Die
 * Unterschneidung, die eine Schrift zwischen "Va" oder "To" vorsieht, kommt
 * damit nie zur Anwendung.
 *
 * Auch `widthOfTextAtSize` kennt sie nicht: Die Funktion summiert
 * `glyph.advanceWidth`, und darin steckt keine Unterschneidung. Der Kommentar
 * darueber im Quelltext von pdf-lib behauptet das Gegenteil - die Zeile
 * darunter tut es nicht. Messen und Zeichnen sind also wenigstens einig; nur
 * beide falsch.
 *
 * Nachgemessen an einer gestalteten Fremdrechnung, gesetzt in derselben
 * Schrift: Ihre Zeile "wir bedanken uns fuer Ihren Auftrag und stellen Ihnen
 * folgende Leistungen in Rechnung:" ist 331,7 Punkt breit, unsere 332,9. Ueber
 * eine Zeile sind das gut ein Punkt, und bei mageren Strichen von 0,7 Punkt
 * Breite reicht das, damit sich am Zeilenende kein Buchstabe mehr deckt.
 *
 * ## Der Weg
 *
 * Statt eines `Tj` ein `TJ`: eine Folge aus Textstuecken und Zahlen, wobei
 * jede Zahl den Satz um Tausendstel eines Geviert zurueckzieht. Genau so haelt
 * es das Original - 51 seiner 57 Textbefehle tragen solche Zahlen.
 *
 * Die Werte kommen aus der Schriftdatei selbst, ueber eine eigene
 * fontkit-Instanz. Der Umweg ist noetig, weil pdf-lib seine eigene weder
 * herausgibt noch danach fragt.
 *
 * ## Warum das auch ohne Vorlage gilt
 *
 * Weil Text ohne Unterschneidung schlechter gesetzt ist, nicht anders. Nach
 * einem T, V, W oder A klafft sonst eine Luecke, die dort nicht hingehoert.
 * Bringt eine Schrift keine Unterschneidungspaare mit, ergeben alle Vergleiche
 * null und es wird ein gewoehnliches `Tj` daraus.
 */

interface Kernquelle {
  schrift: ReturnType<typeof fontkit.create>;
  merkmale: string[];
}

/**
 * Welche Schriftdatei zu welcher eingebetteten Schrift gehoert.
 *
 * Als WeakMap ueber das PDFFont-Objekt: Die Zuordnung gilt fuer genau das
 * Dokument, in dem die Schrift eingebettet wurde, und verschwindet mit ihm.
 * Eine Tabelle nach Namen waere zwischen zwei gleichzeitig erzeugten
 * Rechnungen verwechselbar.
 */
const quellen = new WeakMap<PDFFont, Kernquelle>();

/** Meldet die Bytes an, aus denen eine eingebettete Schrift entstanden ist. */
export function merkeSchriftquelle(
  schrift: PDFFont,
  bytes: Uint8Array,
  merkmale: string[],
): void {
  try {
    quellen.set(schrift, { schrift: fontkit.create(bytes), merkmale });
  } catch {
    // Ohne lesbare Quelle bleibt es beim ungekernten Satz - schlechter, aber
    // nicht falsch.
  }
}

/**
 * Die Unterschneidungen einer Zeichenfolge, in Tausendsteln eines Geviert.
 *
 * Ein Wert je Lueckenstelle: `werte[i]` gilt zwischen Glyphe `i` und `i+1`.
 * Positiv bedeutet enger.
 *
 * Verglichen wird der tatsaechliche Vorschub aus dem Satz mit dem
 * unbeeinflussten der Glyphe - die Differenz ist genau das, was pdf-lib
 * verliert.
 */
export function unterschneidungen(schrift: PDFFont, text: string): number[] {
  const quelle = quellen.get(schrift);
  if (!quelle) return [];

  try {
    const lauf = quelle.schrift.layout(text, quelle.merkmale as never);
    const einheit = 1000 / quelle.schrift.unitsPerEm;
    const werte: number[] = [];
    for (const [nummer, glyphe] of lauf.glyphs.entries()) {
      const gesetzt = lauf.positions[nummer]?.xAdvance ?? glyphe.advanceWidth;
      /*
       * Auf Hundertstel eines Geviert gerundet.
       *
       * Zehntel waren zu grob: Jeder Wert stand dann um bis zu ein
       * Zwanzigstel daneben, und ueber eine Zeile summierte sich das zu einem
       * Drittelpunkt Wanderung mitten im Wort. Die Stelle, an der die Zeile
       * beginnt, stimmte weiterhin - die Buchstaben dazwischen nicht.
       *
       * Ein Hundertstel Geviert sind bei zehn Punkt Schrift ein
       * Tausendstel Punkt. Der Seiteninhalt waechst dadurch um wenige Zeichen
       * je Zeile.
       */
      werte.push(Math.round((glyphe.advanceWidth - gesetzt) * einheit * 100) / 100);
    }
    // Der letzte Wert steht hinter dem letzten Zeichen und verschiebt nichts.
    werte.pop();
    return werte;
  } catch {
    return [];
  }
}

/**
 * Die tatsaechliche Breite eines Textes, mit Unterschneidung.
 *
 * Gebraucht ueberall dort, wo rechtsbuendig gesetzt oder umbrochen wird: Wer
 * ungekernt misst und gekernt zeichnet, setzt den Text neben die Kante, die er
 * treffen wollte.
 */
export function gekernteBreite(schrift: PDFFont, text: string, groesse: number): number {
  const roh = schrift.widthOfTextAtSize(text, groesse);
  const abzug = unterschneidungen(schrift, text).reduce((summe, wert) => summe + wert, 0);
  return roh - (abzug / 1000) * groesse;
}

/**
 * Der Schluessel, unter dem eine Schrift im Verzeichnis einer Seite steht.
 *
 * Gebraucht, um selbst ein `Tf` schreiben zu koennen. Der Name der Schrift
 * genuegt dafuer **nicht**: pdf-lib haengt ein Suffix an, damit zwei Schriften
 * gleichen Namens sich nicht verdraengen. Mit dem blossen Namen sah das
 * gerenderte Blatt richtig aus, aber die Textextraktion lieferte
 * Glyphennummern statt Buchstaben - und eine Rechnung, aus der sich der Text
 * nicht mehr lesen laesst, ist als elektronische Rechnung wertlos.
 *
 * Je Seite und Schrift einmal geholt und gemerkt; jeder Aufruf legte sonst
 * einen weiteren Eintrag im Verzeichnis an.
 */
const schluessel = new WeakMap<object, Map<PDFFont, string>>();

function schriftschluessel(seite: PDFPage, schrift: PDFFont): string {
  let jeSeite = schluessel.get(seite);
  if (!jeSeite) {
    jeSeite = new Map();
    schluessel.set(seite, jeSeite);
  }
  let name = jeSeite.get(schrift);
  if (name === undefined) {
    name = seite.node.newFontDictionary(schrift.name, schrift.ref).asString().slice(1);
    jeSeite.set(schrift, name);
  }
  return name;
}

/**
 * Setzt einen Text als **ein** `TJ`-Feld, mit Unterschneidung.
 *
 * Ein Feld je Zeile, so wie es auch das Original haelt - nicht ein Textbefehl
 * je Buchstabe. Der Unterschied ist nicht nur die Dateigroesse: Zerlegter Text
 * laesst sich zwar noch lesen, aber jeder Leser muss die Stuecke erst wieder
 * zusammensetzen, und wer dabei eine Luecke falsch deutet, bekommt ein
 * zusaetzliches Leerzeichen mitten in einer Rechnungsnummer.
 *
 * Gibt `false` zurueck, wenn nicht unterschnitten wird - dann soll der
 * Aufrufer den gewoehnlichen Weg gehen.
 */
export function zeichneGekernt(
  seite: PDFPage,
  text: string,
  x: number,
  y: number,
  schrift: PDFFont,
  groesse: number,
  farbe: RGB,
): boolean {
  const werte = unterschneidungen(schrift, text);
  const zeichen = [...text];
  if (werte.length === 0 || werte.length !== zeichen.length - 1) return false;
  if (werte.every((wert) => wert === 0)) return false;

  const teile: string[] = [];
  let stueck = zeichen[0] ?? '';
  for (let i = 0; i + 1 < zeichen.length; i += 1) {
    const wert = werte[i] ?? 0;
    if (wert === 0) {
      stueck += zeichen[i + 1];
      continue;
    }
    teile.push(schrift.encodeText(stueck).toString(), String(wert));
    stueck = zeichen[i + 1] ?? '';
  }
  teile.push(schrift.encodeText(stueck).toString());

  seite.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFontAndSize(schriftschluessel(seite, schrift), groesse),
    setFillingColor(farbe),
    setTextMatrix(1, 0, 0, 1, x, y),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [`[${teile.join(' ')}]` as never]),
    endText(),
    popGraphicsState(),
  );
  return true;
}

/**
 * Zerlegt einen Text in Stuecke, die je an einer eigenen Stelle stehen.
 *
 * Rueckgabe: das Stueck und sein Versatz vom Anfang des Textes, in Punkt.
 * Aufeinanderfolgende Zeichen ohne Unterschneidung bleiben zusammen - ein
 * Stueck je Buchstabe waere um ein Vielfaches groesser als noetig und machte
 * jede Textextraktion unnoetig schwer.
 *
 * Gibt `undefined` zurueck, wenn nirgends unterschnitten wird oder die Zahl
 * der Glyphen nicht zur Zahl der Zeichen passt - bei Ligaturen ist das der
 * Fall, und dann liesse sich der Text nicht mehr sicher aufteilen.
 */
export function kernstellen(
  schrift: PDFFont,
  text: string,
  groesse: number,
): { text: string; versatz: number }[] | undefined {
  const werte = unterschneidungen(schrift, text);
  const zeichen = [...text];
  if (werte.length === 0 || werte.length !== zeichen.length - 1) return undefined;
  if (werte.every((wert) => wert === 0)) return undefined;

  const stellen: { text: string; versatz: number }[] = [];
  let stueck = zeichen[0] ?? '';
  let anfang = 0;
  /** Was bis hierher an Unterschneidung zusammengekommen ist, in Punkt. */
  let gesammelt = 0;

  const lege = (bis: number) => {
    const vorher = schrift.widthOfTextAtSize(zeichen.slice(0, anfang).join(''), groesse);
    stellen.push({ text: stueck, versatz: vorher - gesammelt });
    anfang = bis;
  };

  for (let i = 0; i + 1 < zeichen.length; i += 1) {
    const wert = werte[i] ?? 0;
    if (wert === 0) {
      stueck += zeichen[i + 1];
      continue;
    }
    lege(i + 1);
    gesammelt += (wert / 1000) * groesse;
    stueck = zeichen[i + 1] ?? '';
  }
  lege(zeichen.length);
  return stellen;
}
