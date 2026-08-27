import { PDFDocument } from 'pdf-lib';

import { laufbreite, liefereBreiten, type Breiten } from './pdf-breiten';
import { leseInhalt, liesPdfText, seiteninhalt, type Wert } from './pdf-text';

/**
 * Das Briefpapier aus einer fremden Rechnung herausloesen.
 *
 * Der Anlass: Wer von einer gestalteten Rechnung umsteigt, will sein Haus
 * nicht verlieren. Die Farbe, das Zeichen oben rechts, die Linien - das ist
 * kein Zierrat, sondern das, woran der Empfaenger den Absender erkennt.
 *
 * ## Warum das ueberhaupt geht
 *
 * Nachgemessen an einer gestalteten Fremdrechnung: Die gesamte Gestaltung
 * bestand aus **keinem einzigen Bildpunkt**. Der rote Kreis oben rechts ist
 * eine Bezierkurve, die Trennlinien sind Striche, die Hausfarbe ist ein
 * Zahlentripel im Inhaltsstrom. So gesetzte Gestaltung laesst sich ablesen und
 * neu zeichnen - massgenau, in Vektoren, ohne ein Bild einzubetten.
 *
 * Das ist der ganze Unterschied zu einem eingebetteten Briefpapier-PDF: Wir
 * uebernehmen **Zahlen**, keine fremden Seiten. Deshalb bleibt die
 * Konformitaet unberuehrt - die Fremddatei mischt CMYK und ICC-RGB, unser
 * Ergebnis kennt nur den sRGB-Ausgabe-Intent des eigenen Dokuments.
 *
 * ## Was hier bewusst nicht versucht wird
 *
 * **Fotos, Verlaeufe, gesetzte Illustrationen.** Sie erscheinen im Befund als
 * ungedeutet und werden gemeldet, nicht nachgebaut. Ein halb nachgezeichnetes
 * Firmenzeichen waere schlimmer als gar keins.
 *
 * **Die fremde Schrift.** Sie steckt zwar als Teilmenge in der Datei, aber sie
 * gehoert dem Nutzer nicht, nur weil er eine Rechnung damit bekommen hat. Wer
 * nachzeichnet, nimmt seine eigene Schrift.
 */

export interface Farbe {
  /** Jeweils 0 bis 1. */
  r: number;
  g: number;
  b: number;
}

export interface Strich {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  staerke: number;
  farbe: Farbe;
}

export interface Kreis {
  x: number;
  y: number;
  r: number;
  farbe: Farbe;
  gefuellt: boolean;
}

export interface Flaeche {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
  farbe: Farbe;
}

export interface Beschriftung {
  x: number;
  y: number;
  groesse: number;
  text: string;
  /**
   * Wie breit das Stueck in der Vorlage gesetzt war.
   *
   * Damit laesst sich eine Ersatzschrift auf das Sollmass einpassen. Ohne das
   * verliert jede Blocksatzzeile ihren rechten Rand - und wo die Vorlage einen
   * Trennstrich dorthin gesetzt hat, steht er hinterher frei.
   */
  breite: number;
}

/**
 * Ein Pfad, so wie er gezeichnet wurde - als SVG-Pfaddaten.
 *
 * Das ist die eigentliche Uebernahme. Kreise, Striche und Rechtecke daneben
 * beschreiben die Gestaltung, damit ein Mensch sie beurteilen kann; **gezeichnet
 * wird aus `d`**. Der Grund: Was in keine Schublade passt - die Kurven eines
 * Firmenzeichens etwa - ginge sonst verloren. So geht nichts verloren, denn
 * pdf-lib nimmt SVG-Pfaddaten mit `drawSvgPath` unveraendert entgegen, und ein
 * SVG ohnehin.
 *
 * Die Koordinaten stehen in SVG-Zaehlweise: Ursprung oben links, y nach unten.
 * Beide Ausgaenge erwarten genau das.
 */
export interface Pfad {
  d: string;
  fuellung?: Farbe;
  strich?: Farbe;
  staerke: number;
  /** Umschliessendes Rechteck in PDF-Zaehlweise - fuer die Zuordnung. */
  rahmen: { x1: number; y1: number; x2: number; y2: number };
  /**
   * Beschneidungsrechteck, falls eines galt - in PDF-Zaehlweise.
   *
   * Die Vorlage klemmt ihr Firmenzeichen in ein Quadrat von 45 mm ("re W n").
   * Hier passt die Zeichnung zufaellig hinein; eine Vorlage, deren Zeichen
   * ueber den Rand hinausgeht, wuerde ohne Beschneidung mehr zeigen als das
   * Original - und das faellt erst auf dem Papier auf.
   */
  beschnitt?: { x: number; y: number; breite: number; hoehe: number };
}

/**
 * Ein Textlauf, wie er im Dokument steht - in Glyphencodes, nicht in Buchstaben.
 *
 * ## Warum roh und nicht lesbar
 *
 * Wer 99 Prozent Uebereinstimmung will, darf die Schrift nicht wechseln. Also
 * wird nicht der *Text* uebernommen, sondern der *Setzbefehl*: dieselben
 * Glyphencodes, dieselbe Matrix, dasselbe Schriftprogramm. Dann steht danach
 * exakt dasselbe Bild auf dem Blatt - auch dort, wo die ToUnicode-Tabelle
 * einen Glyphen gar nicht zurueckuebersetzen kann.
 *
 * `stuecke` bewahrt dabei die Form des TJ-Feldes: Zahlen darin sind
 * Unterschneidungen zwischen den Bruchstuecken. Wer sie einebnet, verliert
 * genau die Feinabstimmung, die eine gesetzte Wortmarke ausmacht.
 */
export interface Textlauf {
  /** Der Name der Schriftressource im Quelldokument, etwa "T1_0". */
  schrift: string;
  /** Bytefolgen (Glyphencodes) und Unterschneidungen, in Reihenfolge. */
  stuecke: (number[] | number)[];
  /** Textmatrix mal Grundmatrix - fertig zum Setzen. */
  matrix: [number, number, number, number, number, number];
  /** Schriftgroesse aus `Tf`, ohne die Matrixskalierung. */
  groesse: number;
  farbe: Farbe;
  /**
   * Zeichen- und Wortabstand sowie Laufweite, wie sie beim Setzen galten.
   *
   * Ohne sie geht der **Blocksatz** verloren. Nachgemessen an einer
   * Fremdrechnung: Ihre Fusszeile gleicht ueber `Tw` aus, und ohne dessen
   * Wiedergabe kam die Zeile 5,4 pt zu kurz an - der Trennstrich am rechten
   * Rand stand dann frei, mitten in "aner - kannt".
   */
  zeichenabstand: number;
  wortabstand: number;
  /** 1 entspricht 100 Prozent. */
  streckung: number;
}

export interface Briefpapier {
  seite: { breite: number; hoehe: number };
  /**
   * Die auffaelligste Farbe, die kein Grauton ist - als "#RRGGBB". Fehlt sie,
   * ist das Briefpapier schwarzweiss.
   */
  akzent?: string;
  /** Alles Gezeichnete, unveraendert - die Grundlage beider Ausgaenge. */
  pfade: Pfad[];
  /** Textlaeufe in Glyphencodes, fuer die massgetreue Uebernahme. */
  laeufe: Textlauf[];
  striche: Strich[];
  kreise: Kreis[];
  flaechen: Flaeche[];
  texte: Beschriftung[];
  /** Falzmarken am linken Rand, als y-Werte. */
  falzmarken: number[];
  /**
   * Oberhalb dieser Hoehe gilt alles als Briefpapier - siehe `findeGrenze`.
   */
  grenze: number;
  /**
   * Unterhalb dieser Hoehe ebenfalls - die Fusszeile des Bogens. Null, wenn
   * das Dokument keine hat; siehe `findeFussgrenze`.
   */
  fussgrenze: number;
  /** Pfade, die weder Strich noch Kreis noch Rechteck waren. */
  ungedeutet: number;
  /** Pfade, die als Rechnungsinhalt aussortiert wurden. */
  ausgelassen: number;
  /**
   * Wie viele davon gefuellte Flaechen waren.
   *
   * Null heisst: Die Vorlage setzt ihren Rechnungsinhalt ohne farbige Baender -
   * nur Text und Haarlinien. Wer dann ein gefuelltes Tabellenband zeichnet,
   * erfindet eine Gestaltung, die es dort nie gab.
   */
  inhaltFuellungen: number;
  /**
   * Die Schriftgroessen im Rechnungsinhalt der Vorlage.
   *
   * Verraet, ob sie eine Ueberschrift setzt. Auf der vermessenen Vorlage steht
   * im ganzen Inhalt kein Stueck ueber zehn Punkt - Median und Groesstes sind
   * gleich. Sie hat also keine; ihr auffaelligstes Element ist das fette
   * "Rechnungs-Nr.".
   */
  inhaltSchrift: { median: number; groesste: number };
  /**
   * Die Satzbreite des Bogens, an seinen durchgehenden Linien abgelesen.
   *
   * Genauer als der linkeste Text: Falz- und Lochmarken stehen weiter aussen
   * als der Satzspiegel und wuerden ihn zu breit erscheinen lassen.
   */
  satzspiegel?: { links: number; rechts: number };
  /**
   * Wo der Rechnungsinhalt der Vorlage beginnt - oft weiter rechts als der
   * Satzspiegel.
   *
   * Nachgemessen: Die Vorlage setzt nur das Anschriftenfeld an ihre linke
   * Kante (27 mm); Fliesstext und Kennzahlen ruecken auf 64 mm ein, die
   * Positionen auf 76 mm. Der breite linke Rand traegt Falz- und Lochmarke.
   *
   * Das Anschriftenfeld darf **nicht** mitwandern - es muss im Fenster des
   * Umschlags bleiben. Deshalb zwei Kanten und nicht eine.
   */
  inhaltLinks?: number;
  /**
   * Wie die Vorlage ihre Waehrung schreibt - "Euro", "EUR" oder das Zeichen.
   *
   * Nachgemessen: Die Vorlage setzt "65,00 Euro", nicht "65,00 EUR". Das ist
   * kein Fachbegriff, sondern Hausbrauch, und beides ist zulaessig.
   */
  waehrungswort?: string;
}

// --- Farben -----------------------------------------------------------------

const grau = (v: number): Farbe => ({ r: v, g: v, b: v });

const ausCmyk = (c: number, m: number, y: number, k: number): Farbe => ({
  r: 1 - Math.min(1, c + k),
  g: 1 - Math.min(1, m + k),
  b: 1 - Math.min(1, y + k),
});

/**
 * Farbe aus den Operanden, erkannt an ihrer Anzahl.
 *
 * `sc`/`scn` haengen am zuvor gesetzten Farbraum, den wir nicht aufloesen. Die
 * Zahl der Werte verraet ihn aber zuverlaessig genug: eins ist Grau, drei ist
 * RGB, vier ist CMYK. Ein benannter Sonderfarbraum mit nur einem Wert wuerde
 * als Grau gelesen - falsch, aber sichtbar falsch und selten.
 */
function farbeAus(werte: number[]): Farbe | undefined {
  if (werte.length === 1) return grau(werte[0] ?? 0);
  if (werte.length === 3) return { r: werte[0] ?? 0, g: werte[1] ?? 0, b: werte[2] ?? 0 };
  if (werte.length === 4) {
    return ausCmyk(werte[0] ?? 0, werte[1] ?? 0, werte[2] ?? 0, werte[3] ?? 0);
  }
  return undefined;
}

export function alsHex(farbe: Farbe): string {
  const teil = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${teil(farbe.r)}${teil(farbe.g)}${teil(farbe.b)}`;
}

/** Ein Grauton traegt keine Aussage ueber die Hausfarbe. */
function istGrau(farbe: Farbe): boolean {
  const max = Math.max(farbe.r, farbe.g, farbe.b);
  const min = Math.min(farbe.r, farbe.g, farbe.b);
  return max - min < 0.08;
}

// --- Matrizen ---------------------------------------------------------------

type Matrix = [number, number, number, number, number, number];

const EINHEIT: Matrix = [1, 0, 0, 1, 0, 0];

function malmal(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

const wende = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** Wie stark die Matrix Laengen streckt - fuer die Strichstaerke. */
const massstab = (m: Matrix): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

// --- Pfade ------------------------------------------------------------------

interface Zustand {
  matrix: Matrix;
  fuellung: Farbe;
  strichfarbe: Farbe;
  staerke: number;
  beschnitt?: { x: number; y: number; breite: number; hoehe: number };
}

interface Punkt {
  x: number;
  y: number;
}

/**
 * Wie genau zwei Laengen uebereinstimmen muessen, damit ein Pfad als Kreis
 * gilt. Zwei Prozent - gesetzte Kreise sind exakt, alles Ungenauere ist eine
 * andere Form und soll nicht als Kreis durchgehen.
 */
const KREISTOLERANZ = 0.02;

/** Bis hierhin gilt ein kurzer Strich als Rand- statt als Inhaltsmarke. */
const RANDMARKE_BIS = 60;

/** Ab diesem Anteil der breitesten Linie gilt eine Linie als Briefbogenlinie. */
const VOLLE_SATZBREITE = 0.9;

/** Ab diesem Anteil der Seitenbreite taugt eine Linie zur Satzspiegelmessung. */
const SATZBREITE_AB = 0.6;

/**
 * Ein Kreis wird als vier Bezierboegen gesetzt, deren Endpunkte genau auf den
 * vier Himmelsrichtungen liegen. Deshalb genuegt es, die Endpunkte zu
 * verfolgen: Ihr umschliessendes Rechteck ist das des Kreises, und ist es
 * quadratisch, war es ein Kreis. Die Steuerpunkte bleiben aussen vor, sonst
 * faellt das Rechteck zu gross aus.
 */
function alsKreis(
  punkte: Punkt[],
  boegen: number,
): { x: number; y: number; r: number } | undefined {
  if (boegen < 3 || punkte.length < 4) return undefined;

  const xs = punkte.map((p) => p.x);
  const ys = punkte.map((p) => p.y);
  const breite = Math.max(...xs) - Math.min(...xs);
  const hoehe = Math.max(...ys) - Math.min(...ys);
  if (breite < 1 || Math.abs(breite - hoehe) / breite > KREISTOLERANZ) return undefined;

  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    r: breite / 2,
  };
}

// --- Grenze zwischen Briefpapier und Inhalt ---------------------------------

/** Eine Zeile "01796 Pirna". */
const PLZ_ZEILE = /^(\d{5})\s+[A-Za-zÄÖÜäöüß]/;

/** Eine Strassenzeile endet auf eine Hausnummer. */
const STRASSENZEILE = /[A-Za-zÄÖÜäöüß.]\s+\d+\s?[a-zA-Z]?$/;

export interface Grenzzeile {
  y: number;
  text: string;
  hoehe: number;
}

/**
 * Findet die Hoehe, oberhalb derer alles Briefpapier ist.
 *
 * Die Regel kommt aus DIN 5008: Das Anschriftenfeld des Empfaengers sitzt in
 * einem festen Fenster, und **ueber** ihm steht nichts, was zur einzelnen
 * Rechnung gehoert - dort ist Briefkopf. Die Grenze aus dem Anschriftenfeld
 * abzuleiten ist deshalb nicht geraten, sondern die Definition.
 *
 * Warum nicht einfach die oberste Postleitzahl genommen wird: Die eigene
 * Anschrift des Absenders steht meist noch weiter oben im Briefkopf und sieht
 * genauso aus. Nachgemessen an einer Fremdrechnung stand "01796
 * Pirna-Altstadt" - der Absender - bei y=802 und "01796 Pirna" - der
 * Empfaenger - bei y=623. Nur das Fenster unterscheidet die beiden.
 */
export function findeGrenze(zeilen: Grenzzeile[], seitenhoehe: number): number {
  // Das Anschriftenfenster nach DIN 5008, grosszuegig gefasst, damit ein
  // Beschnittrand die Rechnung nicht aus dem Fenster schiebt.
  const unten = seitenhoehe * 0.6;
  const oben = seitenhoehe * 0.88;

  const sortiert = [...zeilen].sort((a, b) => b.y - a.y);

  for (const [stelle, zeile] of sortiert.entries()) {
    if (zeile.y < unten || zeile.y > oben) continue;
    if (!PLZ_ZEILE.test(zeile.text)) continue;

    // Ueber der Postleitzahl die zusammenhaengenden Zeilen des Blocks suchen:
    // Solange der Abstand nicht groesser wird als gut zwei Zeilenhoehen,
    // gehoert die Zeile noch zum Anschriftenfeld.
    let kopf = zeile;
    let hoch = stelle - 1;
    while (hoch >= 0) {
      const darueber = sortiert[hoch];
      if (!darueber || darueber.y - kopf.y > kopf.hoehe * 2.2) break;
      kopf = darueber;
      hoch -= 1;
    }

    // Eine allein stehende Postleitzahl ohne Strasse darueber ist kein
    // Anschriftenfeld, sondern eine Ortsangabe im Fliesstext.
    if (kopf === zeile && !STRASSENZEILE.test(zeile.text)) continue;

    return kopf.y + kopf.hoehe;
  }

  // Ohne erkennbares Anschriftenfeld bleibt das obere Fuenftel.
  return seitenhoehe * 0.8;
}

/**
 * Ab welcher Hoehe ein Block ueberhaupt als Fusszeile in Frage kommt.
 *
 * Knapp ein Fuenftel: Tiefer als das steht auf einer Rechnung nichts mehr, was
 * zur einzelnen Rechnung gehoert - der Summenblock endet darueber.
 */
const FUSSZONE = 0.22;

/** Innerhalb dieses Vielfachen der Zeilenhoehe gehoeren Zeilen zusammen. */
const FUSSBLOCK = 2.5;

/** So viel groesser muss die Luecke darueber sein, damit es eine Fusszeile ist. */
const FUSSABSTAND = 4;

/**
 * Eine Seitenzahl ist Rechnungsinhalt, auch wenn sie in der Fusszeile steht.
 *
 * Sie mitzunehmen waere der peinlichste Fehler dieser Uebernahme: Auf jeder
 * kuenftigen Rechnung stuende dann "Seite 1 von 2" - unabhaengig davon, wie
 * viele Seiten sie hat.
 */
const SEITENZAHL = /^\s*(Seite\s+\d+(\s*(von|\/)\s*\d+)?|\d+\s*\/\s*\d+)\s*$/i;

/**
 * Findet die Hoehe, unterhalb derer alles zur Fusszeile des Bogens gehoert.
 *
 * Das Merkmal ist der **Abstand**, nicht die Hoehe. Eine Fusszeile steht nicht
 * einfach unten, sie steht *abgesetzt*: Zwischen ihr und dem Ende der Rechnung
 * klafft eine Luecke, die ein Vielfaches des Zeilenabstands misst. Nachgemessen
 * an einer Fremdrechnung endet der Summenblock bei y=267 und der Fusstext
 * beginnt bei y=50 - 217 Punkte dazwischen, bei sieben Punkt Schriftgroesse.
 *
 * Waere stattdessen eine feste Hoehe genommen, schnitte sie bei einer langen
 * Rechnung mitten in die letzten Positionen.
 *
 * Null bedeutet: keine Fusszeile gefunden. Das ist der richtige Ausgang, wenn
 * die Rechnung bis unten laeuft - lieber nichts uebernehmen als den letzten
 * Rechnungsposten zum Briefpapier erklaeren.
 */
export function findeFussgrenze(zeilen: Grenzzeile[], seitenhoehe: number): number {
  const sortiert = [...zeilen]
    .filter((zeile) => !SEITENZAHL.test(zeile.text))
    .sort((a, b) => a.y - b.y);
  const unterste = sortiert[0];
  if (!unterste || unterste.y > seitenhoehe * FUSSZONE) return 0;

  // Von unten nach oben, solange die Zeilen dicht beieinanderstehen.
  let kopf = unterste;
  let stelle = 1;
  while (stelle < sortiert.length) {
    const naechste = sortiert[stelle];
    if (!naechste || naechste.y - kopf.y > kopf.hoehe * FUSSBLOCK) break;
    kopf = naechste;
    stelle += 1;
  }

  const darueber = sortiert[stelle];
  if (!darueber) return 0;

  // Ohne deutliche Luecke ist es kein abgesetzter Fuss, sondern Fliesstext.
  const luecke = darueber.y - kopf.y;
  if (luecke < kopf.hoehe * FUSSABSTAND) return 0;

  return kopf.y + kopf.hoehe;
}

// --- Ganzes Dokument --------------------------------------------------------

export async function liesBriefpapier(bytes: Uint8Array, seite = 0): Promise<Briefpapier> {
  const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
  const blatt = doc.getPage(seite);
  const { width: breite, height: hoehe } = blatt.getSize();

  const gelesen = await liesPdfText(bytes);
  const zeilen: Grenzzeile[] = (gelesen.seiten[seite]?.zeilen ?? []).map((z) => ({
    y: z.y,
    text: z.text,
    hoehe: Math.max(...z.stuecke.map((s) => Math.abs(s.groesse)), 8),
  }));
  const grenze = findeGrenze(zeilen, hoehe);
  const fussgrenze = findeFussgrenze(zeilen, hoehe);

  /** Steht das auf dem Bogen oder auf dieser einen Rechnung? */
  const imBriefpapier = (y: number) => y > grenze || (fussgrenze > 0 && y < fussgrenze);

  const pfade: Pfad[] = [];
  const striche: Strich[] = [];
  const kreise: Kreis[] = [];
  const flaechen: Flaeche[] = [];
  let ungedeutet = 0;

  let zustand: Zustand = {
    matrix: EINHEIT,
    fuellung: grau(0),
    strichfarbe: grau(0),
    staerke: 1,
  };
  const stapel: Zustand[] = [];

  let punkte: Punkt[] = [];
  let boegen = 0;
  let rechteck: Flaeche | undefined;
  let d = '';
  let letzt: [number, number] = [0, 0];
  let anstehenderBeschnitt: Zustand['beschnitt'];

  // Textzustand - dieselbe Buchfuehrung wie im Textleser, hier aber mit der
  // Grundmatrix zusammen, weil nur beide gemeinsam die Stelle auf dem Blatt
  // ergeben.
  const laeufe: Textlauf[] = [];
  const breitenTabelle = liefereBreiten(doc, seite);
  let tm: Matrix = EINHEIT;
  let zm: Matrix = EINHEIT;
  let schriftname = '';
  let schriftgroesse = 0;
  let durchschuss = 0;
  let zeichenabstand = 0;
  let wortabstand = 0;
  let streckung = 1;
  let breiten: Breiten | undefined;

  leseInhalt(seiteninhalt(doc, seite), (operator, operanden) => {
    const z = (wieviel: number) => operanden.slice(-wieviel).map(Number);
    const nurZahlen = () => operanden.filter((w) => typeof w === 'number') as number[];

    /** Ein Punkt in SVG-Zaehlweise, fertig fuer die Pfaddaten. */
    const insSvg = (x: number, y: number): string => {
      const [px, py] = wende(zustand.matrix, x, y);
      return `${px.toFixed(2)} ${(hoehe - py).toFixed(2)}`;
    };

    switch (operator) {
      case 'q':
        stapel.push({ ...zustand });
        break;
      case 'Q':
        zustand = stapel.pop() ?? zustand;
        break;
      case 'cm':
        zustand.matrix = malmal(z(6) as Matrix, zustand.matrix);
        break;
      case 'w':
        zustand.staerke = z(1)[0] ?? 1;
        break;

      case 'g':
      case 'rg':
      case 'k':
      case 'sc':
      case 'scn': {
        const farbe = farbeAus(nurZahlen());
        if (farbe) zustand.fuellung = farbe;
        break;
      }
      case 'G':
      case 'RG':
      case 'K':
      case 'SC':
      case 'SCN': {
        const farbe = farbeAus(nurZahlen());
        if (farbe) zustand.strichfarbe = farbe;
        break;
      }

      case 'W':
      case 'W*':
        // Gilt erst nach dem folgenden Malbefehl - bis dahin gemerkt.
        anstehenderBeschnitt = rechteck
          ? { x: rechteck.x, y: rechteck.y, breite: rechteck.breite, hoehe: rechteck.hoehe }
          : undefined;
        break;

      case 'm':
      case 'l': {
        const [x, y] = z(2);
        d += `${operator === 'm' ? ' M ' : ' L '}${insSvg(x ?? 0, y ?? 0)}`;
        letzt = [x ?? 0, y ?? 0];
        const [px, py] = wende(zustand.matrix, x ?? 0, y ?? 0);
        punkte.push({ x: px, y: py });
        break;
      }
      case 'c':
      case 'v':
      case 'y': {
        const w = z(operator === 'c' ? 6 : 4);
        const ziel: [number, number] = [w[w.length - 2] ?? 0, w[w.length - 1] ?? 0];

        /*
         * "v" laesst den ersten Steuerpunkt weg (er ist der aktuelle Punkt),
         * "y" den zweiten (er ist der Zielpunkt). SVG kennt diese Kurzformen
         * nicht in derselben Bedeutung - deshalb werden beide zur vollen
         * Form ergaenzt, statt sie auf "S" abzubilden und dabei die
         * Kruemmung zu verschieben.
         */
        const eins: [number, number] = operator === 'v' ? letzt : [w[0] ?? 0, w[1] ?? 0];
        const zwei: [number, number] =
          operator === 'y' ? ziel : [w[w.length - 4] ?? 0, w[w.length - 3] ?? 0];

        d += ` C ${insSvg(eins[0], eins[1])} ${insSvg(zwei[0], zwei[1])} ${insSvg(ziel[0], ziel[1])}`;
        letzt = ziel;

        // Fuer die Formerkennung zaehlt nur der Endpunkt; die Steuerpunkte
        // wuerden das umschliessende Rechteck aufblaehen.
        const [px, py] = wende(zustand.matrix, ziel[0], ziel[1]);
        punkte.push({ x: px, y: py });
        boegen += 1;
        break;
      }
      case 'h':
        d += ' Z';
        break;
      case 're': {
        const [x, y, b, h] = z(4);
        d +=
          ` M ${insSvg(x ?? 0, y ?? 0)}` +
          ` L ${insSvg((x ?? 0) + (b ?? 0), y ?? 0)}` +
          ` L ${insSvg((x ?? 0) + (b ?? 0), (y ?? 0) + (h ?? 0))}` +
          ` L ${insSvg(x ?? 0, (y ?? 0) + (h ?? 0))} Z`;
        letzt = [x ?? 0, y ?? 0];

        const [x1, y1] = wende(zustand.matrix, x ?? 0, y ?? 0);
        const [x2, y2] = wende(zustand.matrix, (x ?? 0) + (b ?? 0), (y ?? 0) + (h ?? 0));
        rechteck = {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          breite: Math.abs(x2 - x1),
          hoehe: Math.abs(y2 - y1),
          farbe: zustand.fuellung,
        };
        punkte.push({ x: x1, y: y1 }, { x: x2, y: y2 });
        break;
      }

      case 'S':
      case 's':
      case 'f':
      case 'F':
      case 'f*':
      case 'B':
      case 'B*':
      case 'b':
      case 'b*':
      case 'n': {
        const gefuellt = /^[fFBb]/.test(operator);
        const gestrichen = /^[SsBb]/.test(operator);
        const staerke = zustand.staerke * massstab(zustand.matrix);
        const kreis = alsKreis(punkte, boegen);

        // Der Pfad selbst, unabhaengig davon, ob wir seine Form benennen
        // koennen. Das ist es, was spaeter gezeichnet wird.
        if (d.trim() && (gefuellt || gestrichen) && punkte.length > 0) {
          const xs = punkte.map((punkt) => punkt.x);
          const ys = punkte.map((punkt) => punkt.y);
          pfade.push({
            d: d.trim(),
            fuellung: gefuellt ? zustand.fuellung : undefined,
            strich: gestrichen ? zustand.strichfarbe : undefined,
            staerke,
            rahmen: {
              x1: Math.min(...xs),
              y1: Math.min(...ys),
              x2: Math.max(...xs),
              y2: Math.max(...ys),
            },
            ...(zustand.beschnitt ? { beschnitt: zustand.beschnitt } : {}),
          });
        }

        if (kreis && (gefuellt || gestrichen)) {
          kreise.push({
            ...kreis,
            farbe: gefuellt ? zustand.fuellung : zustand.strichfarbe,
            gefuellt,
          });
        } else if (rechteck && gefuellt) {
          flaechen.push({ ...rechteck, farbe: zustand.fuellung });
        } else if (punkte.length === 2 && gestrichen) {
          const anfang = punkte[0]!;
          const ende = punkte[1]!;
          striche.push({
            x1: anfang.x,
            y1: anfang.y,
            x2: ende.x,
            y2: ende.y,
            staerke,
            farbe: zustand.strichfarbe,
          });
        } else if (operator !== 'n' && punkte.length > 0) {
          ungedeutet += 1;
        }

        if (anstehenderBeschnitt) {
          zustand.beschnitt = anstehenderBeschnitt;
          anstehenderBeschnitt = undefined;
        }

        punkte = [];
        boegen = 0;
        rechteck = undefined;
        d = '';
        break;
      }

      // --- Text ---------------------------------------------------------
      //
      // Dieselbe Buchfuehrung wie im Textleser, aber die Bytes bleiben roh.
      // Erst zusammen mit der Grundmatrix ergibt die Textmatrix die Stelle
      // auf dem Blatt, deshalb steht das hier und nicht dort.
      case 'BT':
        tm = zm = EINHEIT;
        zeichenabstand = 0;
        wortabstand = 0;
        streckung = 1;
        break;
      case 'Tf':
        schriftname = String(operanden[operanden.length - 2] ?? '').replace(/^\//, '');
        schriftgroesse = Number(operanden[operanden.length - 1] ?? 0);
        breiten = breitenTabelle.get(schriftname);
        break;
      case 'Tc':
        zeichenabstand = z(1)[0] ?? 0;
        break;
      case 'Tw':
        wortabstand = z(1)[0] ?? 0;
        break;
      case 'Tz':
        streckung = (z(1)[0] ?? 100) / 100;
        break;
      case 'TL':
        durchschuss = z(1)[0] ?? 0;
        break;
      case 'Tm':
        tm = zm = z(6) as Matrix;
        break;
      case 'Td':
      case 'TD': {
        const [dx, dy] = z(2);
        if (operator === 'TD') durchschuss = -(dy ?? 0);
        zm = malmal([1, 0, 0, 1, dx ?? 0, dy ?? 0], zm);
        tm = zm;
        break;
      }
      case 'T*':
        zm = malmal([1, 0, 0, 1, 0, -durchschuss], zm);
        tm = zm;
        break;
      case 'Tj':
      case 'TJ':
      case "'":
      case '\"': {
        if (operator === "'" || operator === '\"') {
          zm = malmal([1, 0, 0, 1, 0, -durchschuss], zm);
          tm = zm;
        }

        const letzte = operanden[operanden.length - 1];
        const stuecke: (number[] | number)[] =
          operator === 'TJ' && Array.isArray(letzte)
            ? ((letzte as Wert[]).filter(
                (teil) => Array.isArray(teil) || typeof teil === 'number',
              ) as (number[] | number)[])
            : Array.isArray(letzte)
              ? [letzte as number[]]
              : [];

        const gesamt = malmal(tm, zustand.matrix);
        // Nur Kopf und Fuss; der Rechnungsinhalt dazwischen bleibt draussen.
        if (stuecke.length > 0 && imBriefpapier(gesamt[5])) {
          laeufe.push({
            schrift: schriftname,
            stuecke,
            matrix: gesamt,
            groesse: schriftgroesse,
            farbe: zustand.fuellung,
            zeichenabstand,
            wortabstand,
            streckung,
          });
        }

        /*
         * Und weiterruecken. Das ist der Schritt, dessen Fehlen alle Stuecke
         * einer Zeile uebereinanderlegte: Ein PDF nennt die Stelle einmal und
         * verlaesst sich darauf, dass der Leser den Vorschub mitfuehrt.
         * Nur die Textmatrix wandert, nicht die Zeilenmatrix - der naechste
         * Zeilenumbruch setzt wieder am linken Rand an.
         */
        const schub = laufbreite(
          stuecke,
          breiten,
          schriftgroesse,
          zeichenabstand,
          wortabstand,
          streckung,
        );
        if (schub !== 0) tm = malmal([1, 0, 0, 1, schub, 0], tm);
        break;
      }

      default:
        break;
    }
  });

  const texte: Beschriftung[] = [];
  for (const zeile of gelesen.seiten[seite]?.zeilen ?? []) {
    if (!imBriefpapier(zeile.y)) continue;
    for (const stueck of zeile.stuecke) {
      texte.push({
        x: stueck.x,
        y: stueck.y,
        groesse: Math.abs(stueck.groesse) || 8,
        breite: stueck.breite,
        text: stueck.text,
      });
    }
  }

  const briefkopfpfade = pfade.filter((pfad) => gehoertZumBriefkopf(pfad, imBriefpapier, pfade));
  const inhaltspfade = pfade.filter((pfad) => !briefkopfpfade.includes(pfad));

  return {
    seite: { breite, hoehe },
    akzent: findeAkzent(striche, kreise, flaechen),
    pfade: briefkopfpfade,
    laeufe,
    striche,
    kreise,
    flaechen,
    texte,
    falzmarken: findeFalzmarken(striche),
    grenze,
    fussgrenze,
    ungedeutet,
    ausgelassen: inhaltspfade.length,
    inhaltFuellungen: inhaltspfade.filter((pfad) => pfad.fuellung).length,
    inhaltSchrift: messeInhaltsschrift(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
    ...(findeSatzspiegel(briefkopfpfade, breite) ?? {}),
    ...findeInhaltskante(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
    ...findeWaehrungswort(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
  };
}

/**
 * Wo der Rechnungsinhalt der Vorlage beginnt.
 *
 * Genommen wird die **linkeste Kante, an der mindestens zwei Zeilen
 * beginnen** - eine einzelne Zeile kann eine Randnotiz sein. Die Kante des
 * Anschriftenfeldes bleibt aussen vor: Sie gehoert zum Umschlagfenster, nicht
 * zum Inhalt, und wuerde sonst immer gewinnen.
 */
function findeInhaltskante(
  zeilen: { y: number; stuecke: { x: number }[] }[],
  grenze: number,
  fussgrenze: number,
): { inhaltLinks: number } | Record<string, never> {
  const zaehler = new Map<number, { anzahl: number; x: number }>();

  for (const zeile of zeilen) {
    if (zeile.y > grenze || (fussgrenze > 0 && zeile.y < fussgrenze)) continue;
    const x = zeile.stuecke[0]?.x;
    if (x === undefined) continue;

    // Auf fuenf Punkte gerundet gruppieren - gesetzte Zeilen einer Spalte
    // stehen selten auf den Hundertstel genau uebereinander.
    const fach = Math.round(x / 5) * 5;
    const bisher = zaehler.get(fach);
    zaehler.set(fach, { anzahl: (bisher?.anzahl ?? 0) + 1, x: Math.min(bisher?.x ?? x, x) });
  }

  const kanten = [...zaehler.values()]
    .filter((eintrag) => eintrag.anzahl >= 2)
    .sort((eins, zwei) => eins.x - zwei.x);

  // Die erste ist das Anschriftenfeld; gesucht ist die naechste dahinter.
  const inhalt = kanten[1];
  return inhalt ? { inhaltLinks: inhalt.x } : {};
}

/**
 * Wie die Vorlage ihre Waehrung schreibt.
 *
 * Gesucht wird direkt hinter einem Betrag - "65,00 Euro". Das Wort allein
 * waere zu wenig: "in Euro" im Fliesstext sagt nichts darueber, wie die
 * Betraege gesetzt sind.
 */
function findeWaehrungswort(
  zeilen: { y: number; text: string }[],
  grenze: number,
  fussgrenze: number,
): { waehrungswort: string } | Record<string, never> {
  for (const zeile of zeilen) {
    if (zeile.y > grenze || (fussgrenze > 0 && zeile.y < fussgrenze)) continue;

    const treffer = /\d[\d.]*,\d{2}\s*(Euro|EUR|€)(?![A-Za-z])/.exec(zeile.text);
    if (treffer?.[1]) return { waehrungswort: treffer[1] };
  }
  return {};
}

/**
 * Wie gross die Vorlage ihren Rechnungsinhalt setzt.
 *
 * Der Median steht fuer den Fliesstext, das Groesste fuer eine etwaige
 * Ueberschrift. Liegen beide nah beieinander, gibt es keine - und dann sollte
 * auch keine erfunden werden.
 */
function messeInhaltsschrift(
  zeilen: { y: number; stuecke: { groesse: number }[] }[],
  grenze: number,
  fussgrenze: number,
): { median: number; groesste: number } {
  const groessen: number[] = [];
  for (const zeile of zeilen) {
    if (zeile.y > grenze || (fussgrenze > 0 && zeile.y < fussgrenze)) continue;
    for (const stueck of zeile.stuecke) groessen.push(Math.abs(stueck.groesse));
  }
  if (groessen.length === 0) return { median: 0, groesste: 0 };

  groessen.sort((eins, zwei) => eins - zwei);
  return {
    median: groessen[Math.floor(groessen.length / 2)] ?? 0,
    groesste: groessen[groessen.length - 1] ?? 0,
  };
}

/**
 * Liest die Satzbreite an den durchgehenden Linien des Bogens ab.
 *
 * Genommen wird die breiteste - sie ist die Trennlinie des Briefbogens und
 * markiert seinen Satzspiegel. Ist keine breit genug, gibt es keine Aussage;
 * dann bleibt es bei unserer Vorgabe, statt aus einem kurzen Strich einen
 * Satzspiegel zu erfinden.
 */
function findeSatzspiegel(
  pfade: Pfad[],
  seitenbreite: number,
): { satzspiegel: { links: number; rechts: number } } | undefined {
  let beste: Pfad | undefined;
  for (const pfad of pfade) {
    const breite = pfad.rahmen.x2 - pfad.rahmen.x1;
    if (breite < seitenbreite * SATZBREITE_AB) continue;
    if (!beste || breite > beste.rahmen.x2 - beste.rahmen.x1) beste = pfad;
  }

  return beste ? { satzspiegel: { links: beste.rahmen.x1, rechts: beste.rahmen.x2 } } : undefined;
}

/**
 * Gehoert ein Pfad zum Briefkopf oder zur Rechnung darunter?
 *
 * Die Hoehe allein genuegt nicht. Nachgemessen an einer Fremdrechnung liegen
 * **beide** Arten unterhalb des Anschriftenfeldes: die Trennlinie unter dem
 * Anschriftenfeld auf 215,7 mm und die Linien des Summenblocks auf 116,6 bis
 * 90,2 mm. Nimmt man alles mit, traegt das Briefpapier die Summenlinien einer
 * fremden Rechnung - und die stehen dann auf jeder kuenftigen.
 *
 * Drei Merkmale trennen sie:
 *
 * 1. **Ueber dem Anschriftenfeld oder unter dem Fussabstand** - dort steht nie
 *    Rechnungsinhalt.
 * 2. **Am linken Rand** - Falz- und Lochmarken, die aufs Blatt gehoeren.
 * 3. **Ueber die volle Satzbreite** - eine Trennlinie des Briefbogens. Die
 *    Summenlinien sind kuerzer: 138 mm gegen 175 mm, also 79 Prozent.
 */
function gehoertZumBriefkopf(
  pfad: Pfad,
  imBriefpapier: (y: number) => boolean,
  alle: Pfad[],
): boolean {
  if (imBriefpapier(pfad.rahmen.y1) && imBriefpapier(pfad.rahmen.y2)) return true;

  const breite = pfad.rahmen.x2 - pfad.rahmen.x1;
  if (pfad.rahmen.x2 < RANDMARKE_BIS && breite < 30) return true;

  const breiteste = Math.max(...alle.map((p) => p.rahmen.x2 - p.rahmen.x1));
  return breiteste > 0 && breite >= breiteste * VOLLE_SATZBREITE;
}

/**
 * Die Hausfarbe ist die groesste farbige Flaeche, nicht die haeufigste.
 *
 * Haeufigkeit fuehrt in die Irre: Schwarz und Grau kommen oefter vor als jede
 * Hausfarbe, weil aller Text und alle Hilfslinien sie tragen. Gesucht ist
 * deshalb die groesste Flaeche, die kein Grauton ist.
 */
function findeAkzent(striche: Strich[], kreise: Kreis[], flaechen: Flaeche[]): string | undefined {
  const bewerbungen = [
    ...kreise.map((k) => ({ flaeche: Math.PI * k.r * k.r, farbe: k.farbe })),
    ...flaechen.map((f) => ({ flaeche: f.breite * f.hoehe, farbe: f.farbe })),
    ...striche.map((s) => ({
      flaeche: Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * s.staerke,
      farbe: s.farbe,
    })),
  ].filter((b) => !istGrau(b.farbe));

  bewerbungen.sort((a, b) => b.flaeche - a.flaeche);
  const beste = bewerbungen[0];
  return beste ? alsHex(beste.farbe) : undefined;
}

/**
 * Falzmarken sind kurze Striche ganz am linken Rand.
 *
 * Sie stehen nach DIN 5008 bei 105 und 210 mm von oben und helfen beim Falten
 * fuer den Fensterumschlag. Sie mitzunehmen ist kein Zierrat: Wer sie
 * verliert, merkt es erst, wenn der Brief im Umschlag falsch sitzt.
 */
function findeFalzmarken(striche: Strich[]): number[] {
  return striche
    .filter(
      (s) =>
        s.x1 < 60 &&
        Math.abs(s.y2 - s.y1) < 1 &&
        Math.abs(s.x2 - s.x1) > 2 &&
        Math.abs(s.x2 - s.x1) < 30,
    )
    .map((s) => s.y1)
    .sort((a, b) => b - a);
}
