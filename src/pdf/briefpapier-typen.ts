/**
 * Die Beschreibung eines uebernommenen Briefbogens.
 *
 * Nur die Beschreibung - gelesen wird sie nicht hier. Bis v3.0.0 stand beides
 * in einer Datei; mit v4.0.0 ist das Lesen und Vermessen einer fremden Vorlage
 * zum Produkt gezogen, und geblieben ist, was der Renderer braucht: die Form,
 * in der ein Bogen hereingereicht wird, und das Zeichnen daraus.
 *
 * Wer einen eigenen Leser schreibt, erfuellt diese Typen und kann den Bogen
 * dann an `renderZugferdPdf` uebergeben - Farben, Striche, Kreise, Pfade und
 * Textlaeufe in Punkten, wie sie PDF selbst misst.
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
   * Das senkrechte Raster des Rechnungsinhalts.
   *
   * `zeile` ist der Zeilenabstand, `absatz` der Abstand zwischen Bloecken.
   * Auf der vermessenen Vorlage 12 und 24 Punkt - ihr ganzer Rumpf steht auf
   * einem Zwoelferraster: Anschrift, Positionsname, Beschreibung, jede
   * Summenzeile.
   *
   * ## Warum das gebraucht wird
   *
   * Weil unser Rumpf sonst auf festen Konstanten steht - 11 Punkt Zeile, 18
   * Punkt Summenzeile - und mit jeder Zeile weiter aus der Flucht der Vorlage
   * laeuft. Nachgemessen: Die Kennzahlenzeile lag 9 Punkt daneben, der
   * Summenblock 55. Waagerecht stimmte alles, senkrecht nichts.
   *
   * Beide undefiniert, wenn die Vorlage zu wenig Inhalt hat, um ein Raster
   * zu zeigen. Dann bleibt es bei unseren Vorgaben - ein aus zwei Zeilen
   * geratenes Raster waere schlechter als gar keines.
   */
  inhaltRaster: { zeile?: number; absatz?: number };
  /**
   * Textproben aus dem Rechnungsteil, mit ihrer gemessenen Breite.
   *
   * ## Wofuer
   *
   * Um die **Laufweite** der Vorlage zu treffen statt nur ihrer Punktgroesse.
   * Nachgemessen: Ihre National-Light braucht fuer "Gesamtbetrag netto" 79,9
   * Punkt, unsere Hausschrift bei derselben Groesse 94,0 - neunzehn Prozent
   * mehr. Wer die Punktgroesse eins zu eins uebernimmt, setzt jede Zeile ein
   * Fuenftel laenger: Das Anschreiben bricht um, wo es im Original einzeilig
   * steht, und schiebt alles darunter um eine Zeile.
   *
   * Der Vergleich muss dort stattfinden, wo unsere Schrift bekannt ist - also
   * beim Setzen, nicht beim Lesen. Hier stehen nur die Proben.
   *
   * ## Warum aus dem Inhalt und nicht aus dem Briefkopf
   *
   * Weil beide verschiedene Schriften tragen duerfen. Ein Briefkopf in einer
   * Auszeichnungsschrift saegte den Faktor fuer einen Rumpf zurecht, der in
   * einer ganz anderen Schrift steht.
   */
  inhaltProben: { text: string; breite: number; groesse: number; fett: boolean }[];
  /**
   * Die Grundlinie der obersten Anschriftenzeile.
   *
   * `grenze` markiert die Oberkante des Anschriftenfeldes; wie weit darunter
   * die erste Zeile sitzt, ist Sache des Gestalters. Unser Satz nahm dafuer
   * feste elf Punkt, die Vorlage haelt zehn - und ihre vier Anschriftenzeilen
   * standen deshalb allesamt einen Punkt zu tief.
   */
  anschriftZeile?: number;
  /**
   * Die Textfarbe der Vorlage - der dunkelste Ton ihrer Schriftzuege.
   *
   * Unsere Hausfarbe fuer Text ist ein sehr dunkles Grau, kein Schwarz: Das
   * ist eine Gestaltungsentscheidung und auf unserem eigenen Entwurf richtig.
   * Auf einem uebernommenen Bogen ist sie falsch, wenn dieser durchgehend in
   * hundert Prozent Schwarz gesetzt ist - dann steht der Rumpf sichtbar
   * blasser da als der Briefkopf darueber.
   *
   * Genommen wird der dunkelste vorkommende Ton, nicht der haeufigste: Eine
   * Vorlage mit grauem Kleingedrucktem soll ihren Fliesstext nicht danach
   * richten.
   */
  textfarbe?: { r: number; g: number; b: number };
  /**
   * Die Schriften des Briefkopfs als eigene kleine PDF-Datei, base64-kodiert.
   *
   * Damit der Briefkopf **wiedergegeben** statt nachgezeichnet werden kann,
   * ohne dass die alte Rechnung mitwandert. Siehe pdf/schriftbogen.ts.
   *
   * Wird beim Lesen nicht gefuellt - das taete `liesBriefpapier` zu einem
   * Erzeuger von PDF-Dateien, und der Leser soll lesen. Wer die Quellbytes
   * hat, ruft `schriftbogenAus` und traegt das Ergebnis ein.
   */
  schriftbogen?: string;
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
  /**
   * Die Strichstaerken im Rechnungsinhalt der Vorlage.
   *
   * Sie zieht nicht alle Linien gleich: 0,25 pt unter den gewoehnlichen
   * Summenzeilen, **1,00 pt** unter dem Ueberweisungsbetrag. Der dicke Strich
   * ist die Auszeichnung der Endsumme - wer alle gleich zieht, nimmt ihr die
   * Betonung.
   */
  inhaltStriche?: {
    fein: number;
    stark: number;
    abstand?: number;
    /**
     * Die Farbe der feinen Striche.
     *
     * Unsere Haarlinie ist ein helles Grau - auf unserem Entwurf richtig, auf
     * einem uebernommenen Bogen falsch, wenn dieser seine Linien in Schwarz
     * zieht. Gemessen an der Vorlage: Sie setzt auch die duennsten Striche
     * voll deckend; unsere waren daneben kaum zu sehen.
     */
    farbe?: { r: number; g: number; b: number };
  };
}
