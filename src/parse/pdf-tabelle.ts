import type { Textzeile } from './pdf-text';
import type { WordTabelle } from './word';

/**
 * Aus Textzeilen eines PDF wird eine Tabelle.
 *
 * **Das hier ist die Raterei.** pdf-text.ts liest ab, was im Dokument steht -
 * die Koordinaten sind Tatsachen. Diese Datei schliesst daraus auf eine
 * Struktur, die im PDF nicht vorhanden ist, und das kann danebengehen. Sie
 * steht deshalb getrennt, damit man sie einzeln beurteilen kann.
 *
 * ## Wie geraten wird
 *
 * Die **Kopfzeile gibt die Spalten vor**. Ihre Textstuecke stehen an genau den
 * Stellen, an denen die Spalten beginnen - jedes Stueck einer Datenzeile
 * gehoert zu dem Kopfstueck, dem es am naechsten liegt.
 *
 * Warum nicht die x-Werte aller Zeilen zusammen gruppieren: Der Abstand
 * zwischen zwei Spalten ist nicht groesser als der innerhalb einer. Gemessen
 * an einer erzeugten Rechnung liegen "Pos." und "Bezeichnung" 26 Einheiten
 * auseinander, "Einzelpreis" und sein Wert 17 - eine feste Schwelle traefe
 * beides gleich und wuerde entweder Spalten verschmelzen oder sie zerreissen.
 *
 * Die Naehe zum Kopfstueck traegt auch bei rechtsbuendigen Zahlen: Ein Betrag
 * steht dann links von seiner Ueberschrift, aber immer noch naeher an ihr als
 * an der Nachbarspalte.
 *
 * ## Was sie nicht kann
 *
 * Verbundene Zellen, mehrzeilige Positionen und Tabellen ohne Kopfzeile. Eine
 * Fortsetzungszeile - "Frontend, Anbindung an das Abrechnungssystem" unter der
 * eigentlichen Position - erscheint als eigene Zeile mit nur einer gefuellten
 * Spalte. Sie wird gemeldet, nicht stillschweigend angehaengt.
 */

export interface Tabellenbefund {
  tabelle: WordTabelle;
  /**
   * Zeilen, die nur eine Spalte gefuellt haben - meist Fortsetzungstext einer
   * Position. Sie stehen in der Tabelle, aber der Aufrufer soll wissen, dass
   * sie verdaechtig sind.
   */
  fortsetzungen: number[];
}

/**
 * Wie viele Stuecke eine Zeile mindestens haben muss, um als Tabellenzeile zu
 * gelten. Zwei: eine Bezeichnung und ein Wert.
 */
const MINDESTSTUECKE = 2;

/**
 * Wie viele fuehrende Spalten darueber entscheiden, ob eine Zeile noch zur
 * Tabelle gehoert.
 *
 * Der Grund: Eine Positionstabelle endet nicht mit einer leeren Zeile, sondern
 * geht in den Summenblock ueber - und dessen Zeilen haben genauso viele
 * Textstuecke wie eine Position. Sie unterscheiden sich darin, **wo** die
 * Stuecke stehen: Eine Position fuellt die ersten Spalten (Nummer,
 * Bezeichnung), eine Summenzeile faengt weiter rechts an.
 *
 * Nachgemessen an einer erzeugten Rechnung: Ohne diese Regel zog die Tabelle
 * den Summenblock, den Zahlungshinweis und die Fusszeile mit hinein.
 */
const FUEHRENDE_SPALTEN = 2;

/** Nach so vielen Zeilen ohne fuehrenden Inhalt gilt die Tabelle als beendet. */
const ABBRUCH_NACH = 2;

/**
 * Sucht die Zeile, die am ehesten eine Tabellenkopfzeile ist.
 *
 * Genommen wird die Zeile mit den meisten Textstuecken - eine Kopfzeile hat
 * definitionsgemaess je Spalte eines. Bei Gleichstand die obere, weil
 * Rechnungen ihre Positionstabelle vor den Summen fuehren.
 *
 * Das ist ein **Vorschlag**. Welche Zeile die Kopfzeile ist, entscheidet der
 * Mensch - hier wird nur die Auswahl vorbelegt.
 */
export function schlageKopfzeileVor(zeilen: Textzeile[]): number {
  let beste = -1;
  let meiste = MINDESTSTUECKE - 1;

  for (const [stelle, zeile] of zeilen.entries()) {
    if (zeile.stuecke.length > meiste) {
      meiste = zeile.stuecke.length;
      beste = stelle;
    }
  }

  return beste;
}

/**
 * Baut aus den Zeilen ab `kopfzeile` eine Tabelle.
 *
 * Gelesen wird bis zur ersten Zeile, die nicht mehr passt - also weniger
 * Stuecke hat als das Mindestmass und auch keine Fortsetzung ist. Damit endet
 * die Tabelle dort, wo im Dokument der Fliesstext weitergeht, ohne dass
 * jemand eine Zeilenzahl angeben muesste.
 */
export function tabelleAusZeilen(zeilen: Textzeile[], kopfzeile: number): Tabellenbefund {
  const kopf = zeilen[kopfzeile];
  if (!kopf || kopf.stuecke.length < MINDESTSTUECKE) {
    return { tabelle: { art: 'tabelle', zeilen: [] }, fortsetzungen: [] };
  }

  const anker = kopf.stuecke.map((stueck) => stueck.x);
  const spalten = anker.length;

  const einordnen = (zeile: Textzeile): string[] => {
    const zellen = Array.from({ length: spalten }, () => '');
    for (const stueck of zeile.stuecke) {
      let naechste = 0;
      let abstand = Infinity;
      for (const [stelle, x] of anker.entries()) {
        const gemessen = Math.abs(stueck.x - x);
        if (gemessen < abstand) {
          abstand = gemessen;
          naechste = stelle;
        }
      }
      // Zwei Stuecke in derselben Spalte gehoeren zusammen - etwa "84" und
      // "Std.", die als eigene Laeufe gesetzt sind.
      zellen[naechste] = zellen[naechste] ? `${zellen[naechste]} ${stueck.text}` : stueck.text;
    }
    return zellen;
  };

  const ausgabe: string[][] = [einordnen(kopf)];
  const fortsetzungen: number[] = [];
  let ohneFuehrung = 0;

  for (let stelle = kopfzeile + 1; stelle < zeilen.length; stelle += 1) {
    const zeile = zeilen[stelle]!;
    if (zeile.stuecke.length === 0) break;

    const zellen = einordnen(zeile);
    const fuehrend = zellen.slice(0, FUEHRENDE_SPALTEN).some((zelle) => zelle.trim().length > 0);

    if (!fuehrend) {
      ohneFuehrung += 1;
      // Zwei Zeilen hintereinander, die weiter rechts anfangen: Hier hat der
      // Summenblock begonnen. Die erste davon gehoert schon nicht mehr dazu,
      // deshalb wird sie zurueckgenommen.
      if (ohneFuehrung >= ABBRUCH_NACH) {
        ausgabe.length -= ohneFuehrung - 1;
        break;
      }
      ausgabe.push(zellen);
      continue;
    }

    ohneFuehrung = 0;

    // Eine Zeile mit nur einem Stueck ist Fortsetzungstext der Position
    // darueber. Sie wird uebernommen und gemeldet - wegzulassen waere
    // Datenverlust, stillschweigend anzuhaengen waere geraten.
    if (zeile.stuecke.length < MINDESTSTUECKE) {
      if (ausgabe.length === 1) break;
      fortsetzungen.push(ausgabe.length);
    }
    ausgabe.push(zellen);
  }

  return { tabelle: { art: 'tabelle', zeilen: ausgabe }, fortsetzungen };
}
