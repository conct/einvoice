import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

import { laufbreite, liefereBreiten, type Breiten } from './pdf-breiten';

/**
 * Text aus einem PDF holen.
 *
 * Wofuer: Der Empfang kennt bereits den Fall `pdf-without-xml` und weist ihn
 * ab - ein Bilddokument ohne eingebettete Rechnungsdaten. Wer von Word-PDF auf
 * ZUGFeRD umsteigt (docs/monetarisierung.md, Abschnitt 1), hat aber genau
 * solche Dateien. Statt einer Absage kann daraus ein Angebot werden.
 *
 * ## Warum das schwerer ist als bei Word
 *
 * Eine .docx traegt ihre Struktur mit: `w:tbl` ist eine Tabelle, `w:tc` eine
 * Zelle. Ein PDF traegt **keine** Struktur, sondern Zeichenanweisungen - "setze
 * die Glyphe 42 an Position x,y". Aus dem Bild auf die Struktur
 * zurueckzuschliessen ist Raterei, und sie ist hier bewusst auf zwei Schritte
 * verteilt:
 *
 *  1. **Diese Datei** holt heraus, welcher Text wo steht. Das ist keine
 *     Raterei, sondern Ablesen - die Koordinaten stehen im Dokument.
 *  2. Die Spaltenbildung (pdf-tabelle.ts) ist die Raterei. Sie steht getrennt,
 *     damit man sie einzeln beurteilen kann.
 *
 * ## Was nicht geht
 *
 * Ein gescanntes PDF enthaelt keinen Text, sondern ein Bild. Dafuer braeuchte
 * es Texterkennung - auf dem Geraet nicht realistisch, in der Cloud
 * ausgeschlossen, weil Rechnungsdaten das Geraet nicht verlassen sollen.
 * Erkennbar ist es daran, dass nichts herauskommt.
 */

export interface Textstueck {
  x: number;
  y: number;
  /** Schriftgroesse in Punkt, Matrixskalierung eingerechnet. */
  groesse: number;
  /** Wie breit das Stueck gesetzt ist - fuer die Frage, ob dahinter eine Luecke klafft. */
  breite: number;
  text: string;
}

export interface Textzeile {
  y: number;
  /** Von links nach rechts. */
  stuecke: Textstueck[];
  text: string;
}

export interface Textseite {
  zeilen: Textzeile[];
}

export interface PdfText {
  seiten: Textseite[];
  /** Alles hintereinander, fuer eine schnelle Suche. */
  text: string;
  /** Kein einziges lesbares Zeichen - vermutlich ein Scan. */
  leer: boolean;
}

// --- Zeichenentschluesselung ------------------------------------------------

/**
 * Die Bytes in einer PDF-Zeichenkette sind Glyphennummern, keine Buchstaben.
 * Den Rueckweg liefert die ToUnicode-Tabelle der Schrift - eine CMap, die
 * `bfchar` und `bfrange` enthaelt.
 *
 * Fehlt sie, bleibt nur die Annahme, dass die Bytes WinAnsi sind. Das trifft
 * bei einfachen Schriften oft zu und bei Teilmengenschriften fast nie - dann
 * kommt Unsinn heraus, und das ist besser als nichts vorzutaeuschen: Der
 * Nutzer sieht sofort, dass die Datei nicht lesbar ist.
 */
function leseToUnicode(text: string): Map<number, string> {
  const karte = new Map<number, string>();

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const eintrag of (block[1] ?? '').matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const ziel = eintrag[2] ?? '';
      // Mehrere Codepunkte je Glyph (Ligaturen) kommen vor - alle uebernehmen.
      let zeichen = '';
      for (let i = 0; i + 4 <= ziel.length; i += 4) {
        zeichen += String.fromCodePoint(parseInt(ziel.slice(i, i + 4), 16));
      }
      karte.set(parseInt(eintrag[1] ?? '0', 16), zeichen);
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const eintrag of (block[1] ?? '').matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const von = parseInt(eintrag[1] ?? '0', 16);
      const bis = parseInt(eintrag[2] ?? '0', 16);
      const ziel = parseInt((eintrag[3] ?? '').slice(0, 4), 16);
      // Die Obergrenze faengt beschaedigte Bereiche ab, die sonst Speicher
      // fressen, bevor irgendjemand den Fehler bemerkt.
      for (let i = von; i <= bis && i - von < 0x2000; i += 1) {
        karte.set(i, String.fromCodePoint(ziel + (i - von)));
      }
    }
  }

  return karte;
}

interface Schrift {
  /** Zwei Bytes je Zeichen - bei Type0-Schriften der Normalfall. */
  breit: boolean;
  karte?: Map<number, string>;
}

function lieferSchriften(doc: PDFDocument, seite: number): Map<string, Schrift> {
  const schriften = new Map<string, Schrift>();
  const ressourcen = doc.getPage(seite).node.Resources();
  const fonts = ressourcen?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) return schriften;

  for (const [name, verweis] of fonts.asMap()) {
    const dict = doc.context.lookupMaybe(verweis, PDFDict);
    if (!dict) continue;

    const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
    // lookupMaybe kennt PDFRawStream nicht als Zieltyp - deshalb nachsehen
    // und selbst pruefen.
    const roh = dict.lookup(PDFName.of('ToUnicode'));
    const strom = roh instanceof PDFRawStream ? roh : undefined;

    schriften.set(name.asString().replace(/^\//, ''), {
      breit: subtype === '/Type0',
      ...(strom ? { karte: leseToUnicode(latin1(decodePDFRawStream(strom).decode())) } : {}),
    });
  }

  return schriften;
}

const latin1 = (bytes: Uint8Array): string => {
  let text = '';
  // In Bloecken, weil String.fromCharCode(...) bei grossen Stroemen den
  // Aufrufstapel sprengt.
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return text;
};

/**
 * Ein Zeichen, das die Schrift nicht zurueckuebersetzt.
 *
 * Warum nicht einfach weglassen: Eine gestaltete Fremdrechnung setzte ihre
 * IBAN in einer Teilmengen-Schrift, deren ToUnicode-Tabelle einen einzigen
 * Glyphen nicht auffuehrte. Weggelassen ergab das "DE6185040000058242600" -
 * neunzehn Ziffern statt zwanzig, aber aeusserlich tadellos. Genau so eine
 * IBAN landet ungeprueft auf der naechsten Rechnung und das Geld nirgends.
 *
 * Mit dem Ersatzzeichen scheitert die Mod-97-Pruefung, der Fund faellt durch,
 * und der Nutzer sieht die Luecke an der Stelle, an der sie ist. Eine Luecke,
 * die man sieht, ist kein Schaden - eine, die man nicht sieht, schon.
 */
const UNLESBAR = '�';

/** Aus rohen Zeichenkettenbytes wird Text - so gut es die Schrift zulaesst. */
function entschluessle(roh: number[], schrift: Schrift | undefined): string {
  if (!schrift) return roh.map((byte) => String.fromCharCode(byte)).join('');

  if (schrift.breit) {
    let text = '';
    for (let i = 0; i + 1 < roh.length; i += 2) {
      const code = ((roh[i] ?? 0) << 8) | (roh[i + 1] ?? 0);
      text += schrift.karte?.get(code) ?? UNLESBAR;
    }
    return text;
  }

  return roh.map((byte) => schrift.karte?.get(byte) ?? String.fromCharCode(byte)).join('');
}

// --- Inhaltsstrom lesen -----------------------------------------------------

export type Wert = number | string | number[] | Wert[];

/**
 * Ein kleiner Leser fuer den Seiteninhalt.
 *
 * Bewusst kein regulaerer Ausdruck: Zeichenketten duerfen Klammern,
 * Fluchtzeichen und beliebige Bytes enthalten, und ein Ausdruck, der das
 * ueberliest, verschluckt Text oder verschiebt Positionen. Das faellt bei
 * einem Betrag erst auf, wenn er falsch in einer Rechnung steht.
 */
export function leseInhalt(
  quelle: string,
  aufOperator: (operator: string, operanden: Wert[]) => void,
): void {
  let i = 0;
  let operanden: Wert[] = [];

  const istLeer = (zeichen: string): boolean => ' \t\r\n\f\0'.includes(zeichen);
  const istTrenner = (zeichen: string): boolean => '()<>[]{}/%'.includes(zeichen);

  const leseZeichenkette = (): number[] => {
    const bytes: number[] = [];
    let tiefe = 1;
    i += 1;
    while (i < quelle.length && tiefe > 0) {
      const zeichen = quelle[i] ?? '';
      if (zeichen === '\\') {
        const naechstes = quelle[i + 1] ?? '';
        const einfach: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
        if (naechstes in einfach) {
          bytes.push(einfach[naechstes]!);
          i += 2;
        } else if (naechstes >= '0' && naechstes <= '7') {
          let oktal = '';
          i += 1;
          while (oktal.length < 3 && (quelle[i] ?? '') >= '0' && (quelle[i] ?? '') <= '7') {
            oktal += quelle[i];
            i += 1;
          }
          bytes.push(parseInt(oktal, 8) & 0xff);
        } else {
          bytes.push(naechstes.charCodeAt(0));
          i += 2;
        }
        continue;
      }
      if (zeichen === '(') tiefe += 1;
      if (zeichen === ')') {
        tiefe -= 1;
        if (tiefe === 0) {
          i += 1;
          break;
        }
      }
      bytes.push(zeichen.charCodeAt(0));
      i += 1;
    }
    return bytes;
  };

  const leseHex = (): number[] => {
    i += 1;
    let ziffern = '';
    while (i < quelle.length && quelle[i] !== '>') {
      const zeichen = quelle[i] ?? '';
      if (/[0-9A-Fa-f]/.test(zeichen)) ziffern += zeichen;
      i += 1;
    }
    i += 1;
    if (ziffern.length % 2 === 1) ziffern += '0';
    const bytes: number[] = [];
    for (let stelle = 0; stelle < ziffern.length; stelle += 2) {
      bytes.push(parseInt(ziffern.slice(stelle, stelle + 2), 16));
    }
    return bytes;
  };

  while (i < quelle.length) {
    const zeichen = quelle[i] ?? '';

    if (istLeer(zeichen)) {
      i += 1;
      continue;
    }
    if (zeichen === '%') {
      while (i < quelle.length && quelle[i] !== '\n') i += 1;
      continue;
    }
    if (zeichen === '(') {
      operanden.push(leseZeichenkette());
      continue;
    }
    if (zeichen === '<') {
      // "<<" ist ein Woerterbuch - fuer die Textausgabe ohne Belang, also
      // ueberspringen bis zum passenden ">>".
      if (quelle[i + 1] === '<') {
        let tiefe = 0;
        while (i < quelle.length) {
          if (quelle[i] === '<' && quelle[i + 1] === '<') {
            tiefe += 1;
            i += 2;
            continue;
          }
          if (quelle[i] === '>' && quelle[i + 1] === '>') {
            tiefe -= 1;
            i += 2;
            if (tiefe === 0) break;
            continue;
          }
          i += 1;
        }
        continue;
      }
      operanden.push(leseHex());
      continue;
    }
    if (zeichen === '[') {
      i += 1;
      operanden.push('[');
      continue;
    }
    if (zeichen === ']') {
      i += 1;
      const inhalt: Wert[] = [];
      while (operanden.length > 0 && operanden[operanden.length - 1] !== '[') {
        inhalt.unshift(operanden.pop()!);
      }
      operanden.pop();
      operanden.push(inhalt);
      continue;
    }
    if (zeichen === '/') {
      i += 1;
      let name = '';
      while (i < quelle.length && !istLeer(quelle[i] ?? '') && !istTrenner(quelle[i] ?? '')) {
        name += quelle[i];
        i += 1;
      }
      operanden.push(`/${name}`);
      continue;
    }

    let wort = '';
    while (i < quelle.length && !istLeer(quelle[i] ?? '') && !istTrenner(quelle[i] ?? '')) {
      wort += quelle[i];
      i += 1;
    }
    if (!wort) {
      i += 1;
      continue;
    }

    if (/^[-+.\d]/.test(wort) && Number.isFinite(Number(wort))) {
      operanden.push(Number(wort));
      continue;
    }

    aufOperator(wort, operanden);
    operanden = [];
  }
}

/** Der Seiteninhalt als latin1-Text - dort stehen Positionen und Glyphen. */
export function seiteninhalt(doc: PDFDocument, seite: number): string {
  const inhalt = doc.getPage(seite).node.Contents();
  if (!inhalt) return '';

  const stroeme =
    inhalt instanceof PDFArray
      ? inhalt.asArray().map((verweis) => doc.context.lookup(verweis))
      : [inhalt];

  let roh = '';
  for (const strom of stroeme) {
    if (strom instanceof PDFRawStream) roh += latin1(decodePDFRawStream(strom).decode());
  }
  return roh;
}

// --- Zusammensetzen ---------------------------------------------------------

/**
 * Wie weit zwei Textstuecke senkrecht auseinanderliegen duerfen und trotzdem
 * als dieselbe Zeile gelten.
 *
 * Drei Punkte, weil Grundlinien innerhalb einer Zeile leicht schwanken - etwa
 * wenn ein Betrag in kleinerer Schrift steht als seine Bezeichnung. Zu gross
 * gewaehlt, verschmelzen zwei Tabellenzeilen; zu klein, zerfaellt eine Zeile
 * in mehrere.
 */
const ZEILENTOLERANZ = 3;

/**
 * Ab welchem Anteil der Schriftgroesse eine Luecke als Wortabstand gilt.
 *
 * Ein Fuenftel: Ein gesetztes Leerzeichen misst je nach Schrift ein Viertel
 * bis ein Drittel der Groesse, waehrend Unterschneidung zwischen Buchstaben
 * deutlich darunter bleibt. Dazwischen ist reichlich Luft.
 */
const WORTLUECKE = 0.2;

export async function liesPdfText(bytes: Uint8Array): Promise<PdfText> {
  const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
  const seiten: Textseite[] = [];

  for (let nummer = 0; nummer < doc.getPageCount(); nummer += 1) {
    const schriften = lieferSchriften(doc, nummer);
    const stuecke: Textstueck[] = [];

    let schrift: Schrift | undefined;

    /*
     * Textmatrix und Zeilenmatrix - vollstaendig, nicht nur die Verschiebung.
     *
     * Hier stand einmal, Skalierung komme auf Rechnungen praktisch nicht vor.
     * Eine gestaltete Fremdrechnung hat das widerlegt: Sie setzt
     * "/T1_0 1 Tf" - Schriftgroesse eins - und legt die wahre Groesse in die
     * Matrix, "10 0 0 10 76.5354 659.2455 Tm". Das ist kein Sonderfall,
     * sondern das uebliche Vorgehen von Illustrator und InDesign.
     *
     * Ohne die Skalierung kamen zwoelf Punkt Zeilenabstand als 1,2 an - unter
     * der Zeilentoleranz. Vier Anschriftenzeilen verschmolzen zu einer, und
     * damit war der Empfaenger nicht mehr in Name, Strasse und Ort zerlegbar.
     * Die Verschiebung allein zu fuehren ist also kein Genauigkeitsverzicht,
     * sondern liest solche Dokumente schlicht falsch.
     *
     * a, b, c, d sind die vier Matrixglieder; tx/ty ist die Textmatrix,
     * zx/zy die Zeilenmatrix, beide bereits in Benutzerkoordinaten.
     */
    let ma = 1;
    let mb = 0;
    let mc = 0;
    let md = 1;
    let tx = 0;
    let ty = 0;
    let zx = 0;
    let zy = 0;
    let durchschuss = 0;
    let schriftgroesse = 0;
    let zeichenabstand = 0;
    let wortabstand = 0;
    let streckung = 1;
    const breitenTabelle = liefereBreiten(doc, nummer);
    let breiten: Breiten | undefined;

    /*
     * Weiterruecken um die Breite des Gesetzten - nur die Textmatrix, nicht
     * die Zeilenmatrix. Ohne diesen Schritt meldet ein Dokument, das mehrere
     * Laeufe hintereinander setzt, fuer alle dieselbe Stelle; die Stuecke
     * liegen dann uebereinander statt nebeneinander.
     */
    const messe = (teile: (number[] | number)[]) =>
      laufbreite(teile, breiten, schriftgroesse, zeichenabstand, wortabstand, streckung) * ma;

    const schiebe = (schub: number) => {
      tx += schub;
      ty += (schub / (ma || 1)) * mb;
    };

    /** Verschiebt die Zeilenmatrix um dx/dy im Textraum. */
    const ruecke = (dx: number, dy: number) => {
      zx += dx * ma + dy * mc;
      zy += dx * mb + dy * md;
      tx = zx;
      ty = zy;
    };

    const zeige = (roh: number[], breite: number) => {
      const text = entschluessle(roh, schrift);
      if (text.trim()) {
        stuecke.push({ x: tx, y: ty, groesse: schriftgroesse * (md || 1), breite, text });
      }
    };

    leseInhalt(seiteninhalt(doc, nummer), (operator, operanden) => {
      switch (operator) {
        case 'BT':
          tx = zx = 0;
          ty = zy = 0;
          ma = md = 1;
          mb = mc = 0;
          break;
        case 'Tc':
          zeichenabstand = Number(operanden[operanden.length - 1] ?? 0);
          break;
        case 'Tw':
          wortabstand = Number(operanden[operanden.length - 1] ?? 0);
          break;
        case 'Tz':
          streckung = Number(operanden[operanden.length - 1] ?? 100) / 100;
          break;
        case 'Tf': {
          schriftgroesse = Number(operanden[operanden.length - 1] ?? 0);
          const name = String(operanden[operanden.length - 2] ?? '').replace(/^\//, '');
          schrift = schriften.get(name);
          breiten = breitenTabelle.get(name);
          break;
        }
        case 'TL':
          durchschuss = Number(operanden[operanden.length - 1] ?? 0);
          break;
        case 'Td':
        case 'TD': {
          const [dx, dy] = operanden.slice(-2).map(Number);
          if (operator === 'TD') durchschuss = -(dy ?? 0);
          ruecke(dx ?? 0, dy ?? 0);
          break;
        }
        case 'Tm': {
          const werte = operanden.slice(-6).map(Number);
          ma = werte[0] ?? 1;
          mb = werte[1] ?? 0;
          mc = werte[2] ?? 0;
          md = werte[3] ?? 1;
          zx = tx = werte[4] ?? 0;
          zy = ty = werte[5] ?? 0;
          break;
        }
        case 'T*':
          ruecke(0, -durchschuss);
          break;
        case 'Tj':
        case "'":
        case '"': {
          if (operator !== 'Tj') ruecke(0, -durchschuss);
          const letzte = operanden[operanden.length - 1];
          if (Array.isArray(letzte)) {
            const schub = messe([letzte as number[]]);
            zeige(letzte as number[], schub);
            schiebe(schub);
          }
          break;
        }
        case 'TJ': {
          const liste = operanden[operanden.length - 1];
          if (!Array.isArray(liste)) break;
          // Die Zahlen darin sind Feinabstaende innerhalb eines Laufs; der
          // Lauf gehoert zusammen und wird als ein Stueck ausgegeben.
          const roh: number[] = [];
          for (const teil of liste as Wert[]) {
            if (Array.isArray(teil)) roh.push(...(teil as number[]));
          }
          // Die Unterschneidungszahlen zaehlen beim Vorschub mit, deshalb das
          // ganze Feld und nicht die eingesammelten Bytes.
          const schub = messe(
            (liste as Wert[]).filter((teil) => Array.isArray(teil) || typeof teil === 'number') as (
              number[] | number
            )[],
          );
          zeige(roh, schub);
          schiebe(schub);
          break;
        }
        default:
          break;
      }
    });

    seiten.push({ zeilen: zuZeilen(stuecke) });
  }

  const text = seiten.flatMap((seite) => seite.zeilen.map((zeile) => zeile.text)).join('\n');

  return { seiten, text, leer: text.trim().length === 0 };
}

/** Stuecke nach Grundlinie gruppieren, in jeder Zeile von links nach rechts. */
function zuZeilen(stuecke: Textstueck[]): Textzeile[] {
  const zeilen: Textzeile[] = [];

  // Von oben nach unten: In PDF-Koordinaten waechst y nach oben.
  for (const stueck of [...stuecke].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const passend = zeilen.find((zeile) => Math.abs(zeile.y - stueck.y) <= ZEILENTOLERANZ);
    if (passend) passend.stuecke.push(stueck);
    else zeilen.push({ y: stueck.y, stuecke: [stueck], text: '' });
  }

  for (const zeile of zeilen) {
    zeile.stuecke.sort((a, b) => a.x - b.x);

    /*
     * Zwischen zwei Stuecken nur dann ein Leerzeichen, wenn dazwischen
     * wirklich eine Luecke klafft.
     *
     * Moeglich wird das erst, seit jedes Stueck seine gesetzte Breite kennt:
     * Der Abstand ist der Anfang des naechsten minus das Ende des vorigen.
     * Ist er kleiner als ein Fuenftel der Schriftgroesse, standen die beiden
     * ohne Wortabstand nebeneinander und gehoeren zusammen.
     *
     * Vorher wurde nach gleicher x-Stelle geraten, weil der Vorschub fehlte.
     * Das ergab "Schmiedestraße 1 017 96" aus "Schmiedestraße 1 · 01796" -
     * und beim Nachzeichnen lagen die Stuecke sogar uebereinander.
     */
    let text = '';
    let ende: number | undefined;
    for (const stueck of zeile.stuecke) {
      const inhalt = stueck.text;
      if (!inhalt.trim()) continue;

      if (text && ende !== undefined) {
        const luecke = stueck.x - ende;
        if (luecke > Math.max(stueck.groesse, 1) * WORTLUECKE) text += ' ';
      }

      text += inhalt;
      ende = stueck.x + stueck.breite;
    }
    zeile.text = text.replace(/\s+/g, ' ').trim();
  }

  return zeilen.filter((zeile) => zeile.text.length > 0);
}
