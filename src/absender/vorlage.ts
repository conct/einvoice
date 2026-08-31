import type { Beschriftungen } from '../pdf/beschriftungen';
import { istBrauchbareBeschriftung } from '../pdf/beschriftungen';
import type { Kennzahlenstellung } from '../pdf/layout';
import type { Textseite, Textzeile } from '../parse/pdf-text';

/** 1 mm in Punkten. */
const MM = 2.834645669;

/**
 * Wortwahl und Stellung aus einer alten Rechnung ablesen.
 *
 * ## Warum das geht
 *
 * Die Vorlage weiss beides schon. Nachgemessen an einer Fremdrechnung steht
 * auf halber Hoehe quer ueber der Seite:
 *
 *     y=539  [181, 337, 456]
 *     Rechnungs-Nr. 2026/7910   Kunden-Nr. 2008   Rechnungsdatum: 12.8.2026
 *
 * Darin steckt die Wortwahl - "Rechnungs-Nr." statt "Rechnungsnummer" - und
 * die Stellung: drei Angaben nebeneinander in einer Zeile, nicht
 * untereinander am rechten Rand.
 *
 * ## Warum nur ein Vorschlag
 *
 * Erkannt wird an Wendungen, und Wendungen taeuschen. "Rechnungsdatum" kann
 * auch mitten im Fliesstext stehen. Deshalb liefert diese Datei Vorschlaege
 * samt der Zeile, aus der sie stammen - bestaetigen muss ein Mensch.
 *
 * ## Was ausdruecklich nicht uebernommen wird
 *
 * Die **Werte**. Gesucht werden nur die Woerter davor. Eine Rechnungsnummer
 * aus einer alten Rechnung zu uebernehmen waere nicht bloss nutzlos, sondern
 * gefaehrlich - eine doppelt vergebene Nummer verstoesst gegen Paragraf 14
 * Absatz 4 UStG.
 */

export interface Vorlagenvorschlag {
  /** Nur die Woerter, die von der Vorgabe abweichen. */
  beschriftungen: Partial<Beschriftungen>;
  /** Wo die Vorlage ihren Kennzahlenblock hat, falls erkennbar. */
  kennzahlen?: Kennzahlenstellung;
  /**
   * Setzt die Vorlage Spaltenkoepfe ueber ihre Positionen?
   *
   * Erkannt daran, ob eines der Kopfwoerter ueberhaupt vorkommt. Die
   * vermessene Vorlage hat keine - sie nennt eine Position und ihren Preis,
   * mehr braucht es dort nicht.
   */
  tabellenkopf: boolean;
  /**
   * Welche Kennzahlen die Vorlage nennt - meist weniger als wir kennen, und
   * in **ihrer** Reihenfolge: Die vermessene Vorlage setzt Nummer, Kundennummer,
   * Datum; wir setzen Nummer, Datum, Kundennummer.
   */
  kennzahlenfelder: (keyof Beschriftungen)[];
  /**
   * Stehen Beschriftung und Wert nebeneinander?
   *
   * Die Vorlage setzt "Rechnungs-Nr. 2026/7910" als **ein** Stueck; wir setzen
   * die Beschriftung ueber den Wert. Erkannt daran, ob hinter der gefundenen
   * Beschriftung im selben Stueck noch etwas steht.
   */
  kennzahlenInline?: boolean;
  /**
   * Welche Kennzahlen die Vorlage fett setzt.
   *
   * Sie zeichnet nicht alle gleich aus: "Rechnungs-Nr. 2026/7910" und
   * "Kunden-Nr. 2008" stehen halbfett, "Rechnungsdatum: 12.8.2026" mager -
   * alle drei in derselben Zeile. Wer das einebnet, setzt drei gleichrangige
   * Angaben, wo die Vorlage zwei betont.
   */
  kennzahlenFett: (keyof Beschriftungen)[];
  /**
   * Wie die Vorlage Datumsangaben schreibt.
   *
   * "12.8.2026" ohne fuehrende Nullen gegen "12.08.2026". Eine Anzeigefrage;
   * im XML steht ohnehin das ISO-Datum.
   */
  datumOhneNullen?: boolean;
  /**
   * Nennt die Steuerzeile ihre Bemessungsgrundlage?
   *
   * "zzgl. 19 % MwSt. auf 10.381,50" gegen "zzgl. 19 % MwSt.". Undefiniert,
   * wenn die Vorlage gar keine Steuerzeile hat - dann bleibt es bei unserer
   * Vorgabe, statt aus dem Nichts zu schliessen.
   */
  steuergrundlage?: boolean;
  /**
   * Wie weit die Vorlage ihre Positionen vom linken Satzrand einrueckt.
   *
   * Die vermessene Vorlage setzt ihren Fliesstext bei 181,4 und die
   * Positionen bei 215,4 - dazwischen liegt eine leere Spalte von 34 Punkten,
   * in der auf **dieser** Rechnung nichts steht. Sie zu streichen, weil sie
   * leer aussieht, ruecken die Positionen an den Satzrand und nichts fluchtet
   * mehr mit dem Rest des Blattes. Die Spalte gehoert zum Raster, nicht zu
   * ihrem Inhalt.
   */
  positionsEinzug?: number;
  /**
   * Zeichnet die Vorlage den Namen einer Position aus?
   *
   * Unser eigener Entwurf setzt ihn fett und seine Beschreibung kleiner und
   * grau. Die vermessene Vorlage setzt beides gleich - gleiche Schrift,
   * gleiche Groesse, gleiche Farbe - und trennt allein durch eine Leerzeile.
   *
   * Abgelesen an der Strichstaerke, nicht an der Farbe: Aus dem Text laesst
   * sich der Schnitt ablesen, ein Grauwert nicht. Wo kein Schnitt betont
   * wird, wird auch nicht eingefaerbt - die beiden Mittel gehoeren zusammen,
   * und eine graue Beschreibung unter einem mageren Namen saehe nach Fehler
   * aus.
   */
  positionsauszeichnung?: boolean;
  /**
   * Steht der Betrag einer Position auf ihrer letzten Zeile?
   *
   * Die vermessene Vorlage setzt ihn dorthin: Name, Beschreibung, und auf
   * Hoehe der letzten Beschreibungszeile der Betrag. Wir setzen ihn neben die
   * erste. Bei einzeiligen Positionen faellt das nicht auf, bei vierzeiligen
   * steht der Betrag drei Zeilen zu hoch.
   */
  betragUnten?: boolean;
  /**
   * Auf welcher Hoehe die Vorlage ihre Kennzahlenzeile setzt.
   *
   * Als **absolute** Hoehe auf ihrer Seite, nicht als Abstand zu irgendetwas.
   * Unser Satz stellte den Block auf 45 Millimeter unter die Oberkante des
   * Anschriftenfeldes - ein rundes Mass, das sich niemand ausgedacht hat, um
   * zu dieser Vorlage zu passen. Ihres sind 42,3, und die Differenz schob den
   * ganzen Rumpf um neun Punkt.
   */
  kennzahlenOben?: number;
  /**
   * Und an welcher Kante jede Kennzahl beginnt.
   *
   * Unser Satz teilte die Satzbreite in gleiche Spalten. Die Vorlage tut das
   * nicht: Ihre erste Spalte ist 156 Punkt breit, die zweite 118. Bei
   * gleichen Dritteln blieben je 130, und "Rechnungs-Nr. 2026/7910" passte
   * nicht mehr hinein - gerendert stand da "Rechnungs-Nr. 2026/7...". Eine
   * Rechnungsnummer, die nicht vollstaendig auf der Rechnung steht, ist kein
   * Schoenheitsfehler.
   */
  kennzahlenSpalten?: Partial<Record<keyof Beschriftungen, number>>;
  /**
   * An welcher Kante die Beschriftungen des Summenblocks enden.
   *
   * Sie stehen rechtsbuendig, alle drei auf 423,8. Unser Satz leitete diese
   * Kante aus der Breite der Betragsspalte ab und landete 31 Punkt weiter
   * rechts - die Beschriftungen rutschten unter die Betraege der Positionen
   * statt darunter zu stehen.
   */
  summenlabelRechts?: number;
  /**
   * Setzt die Vorlage ihre Summenbeschriftungen in einem eigenen Schnitt?
   *
   * Die vermessene benutzt drei: National Light fuer den Fliesstext, National
   * Book fuer "Gesamtbetrag netto" und "zzgl. 19 % MwSt.", National Semibold
   * fuer die Auszeichnung. Wir kannten zwei und setzten die beiden Zeilen
   * mager - drei Prozent zu schmal, sichtbar in jeder Ueberlagerung.
   *
   * Erkannt am Schnittnamen: Traegt die Beschriftung einen anderen als der
   * Fliesstext und ist sie nicht schon als fett erkannt, ist es ein dritter.
   */
  summenlabelKraeftig?: boolean;
  /**
   * Welche Schnitte die Vorlage in ihrem Rechnungsteil ueberhaupt benutzt.
   *
   * Damit einem Nutzer gesagt werden kann, **welche** Dateien er hinterlegen
   * muss. "Vielleicht mehrere" ist keine Auskunft; "National Light, National
   * Book und National Semibold" ist eine.
   */
  schnitte?: string[];
  /**
   * Und wo ihr Fliesstext beginnt - die erste Zeile unter dem
   * Kennzahlenblock.
   *
   * Der zweite Anker. Zwischen Kennzahlen und Anschreiben liegen bei ihr 56
   * Punkt; das ist kein Vielfaches ihres Rasters, sondern schlicht die Stelle,
   * an der der Gestalter den Brief beginnen liess. So etwas laesst sich nicht
   * herleiten, nur ablesen.
   *
   * Alles darunter ergibt sich dann aus dem Raster - Zeile fuer Zeile, ohne
   * weiteren Anker.
   */
  textOben?: number;
  /** Die Zeilen, aus denen geschlossen wurde - zum Nachsehen. */
  belege: string[];
}

/**
 * Wendungen je Feld.
 *
 * Bewusst eng gefasst und auf den Zeilenanfang oder ein vorangehendes
 * Trennzeichen bezogen: "Nr." allein kaeme in jeder Positionsbezeichnung vor.
 */
const WENDUNGEN: { feld: keyof Beschriftungen; muster: RegExp; ueberall?: boolean }[] = [
  { feld: 'rechnungsnummer', muster: /Rechnungs?\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: 'kundennummer', muster: /Kunden\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: 'rechnungsdatum', muster: /Rechnungs\s*-?\s*datum\s*:?/i },
  { feld: 'leistungsdatum', muster: /(?:Liefer|Leistungs)\s*-?\s*datum\s*:?/i },
  { feld: 'leistungszeitraum', muster: /Leistungs\s*-?\s*zeitraum\s*:?/i },
  { feld: 'faelligAm', muster: /(?:F(?:ä|ae)llig(?:\s+am)?|Zahlbar\s+bis)\s*:?/i },
  { feld: 'bestellnummer', muster: /(?:Bestell|Auftrags)\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: 'projekt', muster: /Projekt(?:\s*-?\s*(?:Nr\.?|Nummer))?\s*:?/i },
  { feld: 'pos', muster: /^Pos(?:\.|ition)?\s*:?$/i },
  { feld: 'bezeichnung', muster: /^(?:Bezeichnung|Beschreibung|Leistung|Artikel)\s*:?$/i },
  { feld: 'menge', muster: /^(?:Menge|Anzahl)\s*:?$/i },
  { feld: 'einzelpreis', muster: /^(?:Einzelpreis|Einzel|E-Preis)\s*:?$/i },
  { feld: 'betrag', muster: /^(?:Betrag|Gesamtpreis|Gesamt|Summe)\s*:?$/i },

  /*
   * Der Summenblock. "netto" trennt die Zwischensumme von der Endsumme -
   * ohne das Merkmal faengt "Gesamtbetrag netto" beide, und der Block bekaeme
   * zweimal dasselbe Wort.
   */
  {
    feld: 'zwischensummeNetto',
    muster: /^(?:Zwischensumme|Gesamtbetrag|Nettosumme|Nettobetrag|Summe)\s+netto\b/i,
  },
  {
    feld: 'gesamtbetrag',
    muster:
      /^(?:(?:Ü|Ue)berweisungsbetrag|Rechnungsbetrag|Rechnungssumme|Zahlbetrag|Endbetrag|Gesamtbetrag)(?!\s+netto)/i,
  },
  /*
   * Das Steuerkuerzel steht nicht am Anfang, sondern mitten in der Zeile:
   * "zzgl. 19 % MwSt.". Deshalb hier ausdruecklich ueberall erlaubt - die
   * Regel, dass eine Beschriftung vorn steht, gilt fuer Beschriftungen, und
   * das hier ist eine Abkuerzung innerhalb einer.
   */
  { feld: 'steuerkuerzel', muster: /(?:MwSt\.?|USt\.?)(?=\s|$)/i, ueberall: true },
];

/** Wie viele Kennzahlen in einer Zeile stehen muessen, damit sie als Block gilt. */
const QUER_AB = 3;

/**
 * Wie lang ein Textstueck hoechstens sein darf, um als Beschriftung zu gelten.
 *
 * Eine Beschriftung steht mit ihrem Wert allein; sechzig Zeichen sind dafuer
 * reichlich. Laengeres ist Fliesstext - und darin kommen dieselben Woerter vor.
 * Nachgemessen an einer Fremdrechnung: Die Fusszeile endet mit "Rechnungsdatum
 * ist Leistungsdatum." Ohne diese Schranke wurde daraus die Beschriftung des
 * Leistungsdatums.
 */
const MAX_STUECK = 60;

/**
 * Liest Wortwahl und Stellung aus einer Seite.
 *
 * `seitenhoehe` wird gebraucht, um "oberhalb des Anschriftenfeldes" von
 * "darunter" zu unterscheiden - ohne sie waeren die Hoehen nur Zahlen.
 */
export function schlageVorlageVor(
  seite: Textseite,
  seitenhoehe: number,
  inhaltLinks?: number,
): Vorlagenvorschlag {
  const beschriftungen: Partial<Beschriftungen> = {};
  const belege = new Set<string>();

  /** Je Zeile: wie viele Kennzahlenwoerter darin stehen. */
  const querzaehler = new Map<number, number>();
  /** Wo die Beschriftung stand - fuer die Reihenfolge der Vorlage. */
  const stellen = new Map<keyof Beschriftungen, number>();
  /** Und auf welcher Hoehe - fuer die Frage, wo der Summenblock beginnt. */
  const hoehen = new Map<keyof Beschriftungen, number>();
  /** Und wo das Wort endet - fuer die rechte Kante des Summenblocks. */
  const kanten = new Map<keyof Beschriftungen, number>();
  /** Und in welchem Schnitt es steht - fuer die Frage nach einem dritten. */
  const schnitte = new Map<keyof Beschriftungen, string>();
  const fett = new Set<keyof Beschriftungen>();
  let nebeneinander = 0;

  for (const zeile of seite.zeilen) {
    for (const stueck of zeile.stuecke) {
      for (const { feld, muster, ueberall } of WENDUNGEN) {
        if (beschriftungen[feld]) continue;

        const inhalt = stueck.text.trim();
        if (inhalt.length > MAX_STUECK) continue;

        const treffer = muster.exec(inhalt);
        // Nur am Anfang: Eine Beschriftung steht vor ihrem Wert, nicht mitten
        // in einem Satz. Ausnahmen sagen es selbst.
        if (!treffer || (treffer.index !== 0 && !ueberall)) continue;

        const wort = treffer[0].trim();
        if (!istBrauchbareBeschriftung(wort)) continue;

        beschriftungen[feld] = wort;
        stellen.set(feld, stueck.x);
        hoehen.set(feld, zeile.y);
        kanten.set(feld, stueck.x + stueck.breite);
        schnitte.set(feld, stueck.schnitt);
        if (stueck.fett) fett.add(feld);
        // Steht hinter der Beschriftung im selben Stueck noch etwas, setzt die
        // Vorlage Wert und Beschriftung nebeneinander.
        if (KENNZAHLENFELDER.has(feld) && inhalt.slice(wort.length).trim().length > 0) {
          nebeneinander += 1;
        }
        belege.add(zeile.text);
      }
    }

    /*
     * Fuer die Stellung zaehlt, wie viele Kennzahlen in einer Zeile stehen -
     * und zwar als Anfang eines Stueckes, aus demselben Grund wie oben.
     */
    const inZeile = WENDUNGEN.filter(
      ({ feld, muster }) =>
        KENNZAHLENFELDER.has(feld) &&
        zeile.stuecke.some((stueck) => {
          const inhalt = stueck.text.trim();
          if (inhalt.length > MAX_STUECK) return false;
          const treffer = muster.exec(inhalt);
          return treffer?.index === 0;
        }),
    ).length;
    if (inZeile > 0) querzaehler.set(zeile.y, inZeile);
  }

  const kopffelder: (keyof Beschriftungen)[] = [
    'pos',
    'bezeichnung',
    'menge',
    'einzelpreis',
    'betrag',
  ];

  return {
    beschriftungen,
    tabellenkopf: kopffelder.some((feld) => beschriftungen[feld]),
    kennzahlenfelder: [...KENNZAHLENFELDER]
      .filter((feld) => beschriftungen[feld])
      .sort((eins, zwei) => (stellen.get(eins) ?? 0) - (stellen.get(zwei) ?? 0)),
    ...(nebeneinander > 0 ? { kennzahlenInline: true } : {}),
    kennzahlenFett: [...KENNZAHLENFELDER].filter((feld) => fett.has(feld)),
    ...erkennePositionen(seite, inhaltLinks, summenkante(hoehen)),
    ...erkenneAnker(seite, hoehen, stellen),
    ...erkenneSummenkante(kanten),
    ...erkenneSchnitte(seite, schnitte),
    ...erkenneDatumsform(seite),
    ...erkenneSteuergrundlage(seite),
    ...(erkenneStellung(querzaehler, seitenhoehe) ?? {}),
    belege: [...belege],
  };
}

/**
 * Schreibt die Vorlage Datumsangaben ohne fuehrende Nullen?
 *
 * "12.8.2026" gegen "12.08.2026". Gesucht wird ein Datum mit vierstelligem
 * Jahr; ist Tag oder Monat einstellig geschrieben, laesst die Vorlage die
 * Nullen weg. Ein Datum wie "05.10.2026" beantwortet die Frage nicht - beide
 * Schreibweisen sehen dort gleich aus -, deshalb wird weitergesucht.
 */
function erkenneDatumsform(seite: Textseite): { datumOhneNullen?: boolean } {
  for (const zeile of seite.zeilen) {
    const treffer = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/.exec(zeile.text);
    if (!treffer) continue;

    const tag = treffer[1] ?? '';
    const monat = treffer[2] ?? '';
    if (Number(tag) < 10 || Number(monat) < 10) {
      return { datumOhneNullen: tag.length === 1 || monat.length === 1 };
    }
  }
  return {};
}

/**
 * Nennt die Steuerzeile der Vorlage ihre Bemessungsgrundlage?
 *
 * Gesucht wird eine Zeile mit Steuersatz. Steht dahinter ein Betrag mit
 * "auf" oder "von", nennt sie die Grundlage; sonst nicht. Gibt es gar keine
 * solche Zeile, bleibt die Frage offen - eine Vorlage ohne Steuerausweis
 * sagt nichts darueber, wie wir einen setzen sollen.
 */
function erkenneSteuergrundlage(seite: Textseite): { steuergrundlage?: boolean } {
  for (const zeile of seite.zeilen) {
    if (!/\d+([.,]\d+)?\s*%\s*(?:MwSt|USt)/i.test(zeile.text)) continue;
    return {
      steuergrundlage: /(?:MwSt|USt)\.?\s*(?:auf|von)\s+[\d.]+,\d{2}/i.test(zeile.text),
    };
  }
  return {};
}

/**
 * Die Schalter, die eine Vorlage mitbringt - in der Form, die der Renderer
 * erwartet.
 *
 * ## Warum als ein Stueck
 *
 * Weil sie sonst einzeln durch drei Schichten wandern muessten: Profil,
 * App-Bruecke, Renderdienst. Als ich sie einzeln durchreichte, kamen sechs
 * von neun in der App gar nicht an - sie wirkten nur in den Pruefskripten,
 * und die Rechnung aus der App sah anders aus als die aus dem Test. Ein
 * Buendel kann man vergessen; neun einzelne vergisst man garantiert.
 *
 * ## Was hier bewusst fehlt
 *
 * Wortwahl und Stellung des Kennzahlenblocks. Beide sind im Profil
 * einstellbar - ein Mensch darf sie nach dem Uebernehmen aendern. Sie hier
 * mitzufuehren hiesse, zwei Quellen fuer dieselbe Angabe zu haben, und beim
 * naechsten Import gewaenne die gemessene gegen die von Hand gesetzte.
 */
export interface Vorlagenschalter {
  tabellenkopf?: boolean;
  kennzahlenfelder?: (keyof Beschriftungen)[];
  kennzahlenInline?: boolean;
  kennzahlenFett?: (keyof Beschriftungen)[];
  positionsnummern?: boolean;
  positionsEinzug?: number;
  positionsauszeichnung?: boolean;
  betragUnten?: boolean;
  datumOhneNullen?: boolean;
  steuergrundlage?: boolean;
  /**
   * Die senkrechten Anker, in Hoehen **ihrer** Seite.
   *
   * Umgerechnet wird erst beim Setzen, weil erst dort feststeht, um wie viel
   * der Bogen auf unser A4 verschoben wird.
   */
  kennzahlenOben?: number;
  textOben?: number;
  kennzahlenSpalten?: Partial<Record<keyof Beschriftungen, number>>;
  summenlabelRechts?: number;
  summenlabelKraeftig?: boolean;
}

/**
 * Macht aus einem Vorschlag die Schalter, die gespeichert und gesendet werden.
 *
 * Was die Vorlage nicht hergab, bleibt weg statt auf einem geratenen Wert zu
 * stehen: Ein fehlender Schalter faellt auf unsere Vorgabe zurueck, ein
 * falsch gesetzter nicht.
 */
export function schalterAusVorschlag(vorschlag: Vorlagenvorschlag): Vorlagenschalter {
  return {
    tabellenkopf: vorschlag.tabellenkopf,
    /*
     * Nummeriert wird nur, wenn die Vorlage eine Positionsbeschriftung fuehrt.
     * Ihre fehlt, weil bei einer Position eine Ziffer davor nichts beitraegt.
     */
    positionsnummern: Boolean(vorschlag.beschriftungen.pos),
    ...(vorschlag.kennzahlenfelder.length > 0
      ? { kennzahlenfelder: vorschlag.kennzahlenfelder }
      : {}),
    ...(vorschlag.kennzahlenInline !== undefined
      ? { kennzahlenInline: vorschlag.kennzahlenInline }
      : {}),
    ...(vorschlag.kennzahlenFett.length > 0 ? { kennzahlenFett: vorschlag.kennzahlenFett } : {}),
    ...(vorschlag.positionsEinzug !== undefined
      ? { positionsEinzug: vorschlag.positionsEinzug }
      : {}),
    ...(vorschlag.positionsauszeichnung !== undefined
      ? { positionsauszeichnung: vorschlag.positionsauszeichnung }
      : {}),
    ...(vorschlag.betragUnten !== undefined ? { betragUnten: vorschlag.betragUnten } : {}),
    ...(vorschlag.datumOhneNullen !== undefined
      ? { datumOhneNullen: vorschlag.datumOhneNullen }
      : {}),
    ...(vorschlag.steuergrundlage !== undefined
      ? { steuergrundlage: vorschlag.steuergrundlage }
      : {}),
    ...(vorschlag.kennzahlenOben !== undefined
      ? { kennzahlenOben: vorschlag.kennzahlenOben }
      : {}),
    ...(vorschlag.textOben !== undefined ? { textOben: vorschlag.textOben } : {}),
    ...(vorschlag.kennzahlenSpalten ? { kennzahlenSpalten: vorschlag.kennzahlenSpalten } : {}),
    ...(vorschlag.summenlabelRechts !== undefined
      ? { summenlabelRechts: vorschlag.summenlabelRechts }
      : {}),
    ...(vorschlag.summenlabelKraeftig !== undefined
      ? { summenlabelKraeftig: vorschlag.summenlabelKraeftig }
      : {}),
  };
}

/**
 * Die beiden senkrechten Anker der Vorlage.
 *
 * `kennzahlenOben` ist die Zeile, in der die meisten Kennzahlen stehen -
 * dieselbe, aus der auch die Stellung geschlossen wird. `textOben` ist die
 * erste Zeile darunter, die keine Kennzahl mehr traegt: der Beginn des
 * Anschreibens.
 *
 * Beide nur, wenn ueberhaupt eine Kennzahl gefunden wurde. Ohne sie waere
 * jede Hoehe geraten, und ein falscher Anker verschoebe nicht eine Zeile,
 * sondern das ganze Blatt.
 */
function erkenneAnker(
  seite: Textseite,
  hoehen: Map<keyof Beschriftungen, number>,
  stellen: Map<keyof Beschriftungen, number>,
): {
  kennzahlenOben?: number;
  textOben?: number;
  kennzahlenSpalten?: Partial<Record<keyof Beschriftungen, number>>;
} {
  const kennzahlen = [...KENNZAHLENFELDER]
    .map((feld) => hoehen.get(feld))
    .filter((hoehe): hoehe is number => hoehe !== undefined);
  if (kennzahlen.length === 0) return {};

  const oben = Math.max(...kennzahlen);
  const unterste = Math.min(...kennzahlen);

  const spalten: Partial<Record<keyof Beschriftungen, number>> = {};
  for (const feld of KENNZAHLENFELDER) {
    const x = stellen.get(feld);
    if (x !== undefined) spalten[feld] = rund(x);
  }

  /*
   * Die erste Zeile mit Text unterhalb der letzten Kennzahl. Ein halber Punkt
   * Spiel, damit eine Kennzahl nicht sich selbst findet, wenn zwei Stuecke
   * derselben Zeile minimal verschiedene Grundlinien haben.
   */
  const text = seite.zeilen
    .filter((zeile) => zeile.y < unterste - 0.5 && zeile.text.trim().length > 0)
    .sort((eins, zwei) => zwei.y - eins.y)[0];

  return {
    kennzahlenOben: rund(oben),
    ...(Object.keys(spalten).length > 0 ? { kennzahlenSpalten: spalten } : {}),
    ...(text ? { textOben: rund(text.y) } : {}),
  };
}

/**
 * Gemessene Masse auf zwei Nachkommastellen.
 *
 * Nicht aus Genauigkeitsgruenden - ein Hundertstelpunkt ist ein
 * Dreitausendstel Millimeter und auf keinem Drucker zu sehen -, sondern damit
 * die Briefbogendatei lesbar bleibt. Dort stand "34.02000000000001", und wer
 * so etwas in einer Datei sieht, die er von Hand nachbessern soll, traut ihr
 * nicht mehr.
 */
const rund = (wert: number): number => Math.round(wert * 100) / 100;

/** Die Beschriftungen, die den Summenblock ankuendigen. */
const SUMMENWOERTER: (keyof Beschriftungen)[] = [
  'zwischensummeNetto',
  'steuerkuerzel',
  'gesamtbetrag',
];

/**
 * Auf welcher Hoehe der Summenblock beginnt.
 *
 * Gebraucht wird die **oberste** seiner Zeilen: Alles darueber gehoert zu den
 * Positionen. Gefunden wird sie ueber die Beschriftungen, die ohnehin gesucht
 * werden - eine eigene Suche nach Betraegen faende auch die der Positionen.
 *
 * Ohne eine einzige davon bleibt die Frage offen. Dann wird nichts geraten:
 * Eine falsch gezogene Grenze machte jede Positionszeile zur Summenzeile oder
 * umgekehrt, und beides fiele erst auf dem gedruckten Blatt auf.
 */
function summenkante(hoehen: Map<keyof Beschriftungen, number>): number | undefined {
  const gefunden = SUMMENWOERTER.map((feld) => hoehen.get(feld)).filter(
    (hoehe): hoehe is number => hoehe !== undefined,
  );
  return gefunden.length > 0 ? Math.max(...gefunden) : undefined;
}

/** Eine Zeile, die auf einen Betrag endet - "65,00 Euro" ebenso wie "65,00". */
const BETRAGSENDE = /\d[\d.]*,\d{2}(?:\s+\p{L}+\.?)?\s*$/u;

/**
 * Wie die Vorlage ihre Positionen setzt: eingerueckt, ausgezeichnet.
 *
 * ## Woran eine Positionszeile erkannt wird
 *
 * Daran, dass sie auf einen Betrag endet und ueber dem Summenblock liegt.
 * Beides zusammen: Der Summenblock endet auch auf Betraege, und ueber dem
 * Summenblock steht auch der Anschreibtext. Erst die Kombination trifft nur
 * die Positionen.
 *
 * ## Warum der Einzug am Betrag haengt
 *
 * Weil der Name einer Position keinen Betrag traegt, ihre letzte
 * Beschreibungszeile aber schon - und beide stehen in derselben Spalte. Der
 * Einzug wird also an der Betragszeile gemessen und auf alle Zeilen
 * derselben Spalte uebertragen. Am Anschreibtext gemessen ginge es nicht: Der
 * steht am Satzrand, und dann waere der Einzug immer null.
 */
function erkennePositionen(
  seite: Textseite,
  inhaltLinks: number | undefined,
  kante: number | undefined,
): { positionsEinzug?: number; positionsauszeichnung?: boolean } {
  if (inhaltLinks === undefined || kante === undefined) return {};

  const linksVon = (zeile: Textzeile): number | undefined =>
    zeile.stuecke.filter((stueck) => stueck.text.trim().length > 0)[0]?.x;

  let spalte = Infinity;
  let betragszeile = Infinity;
  for (const zeile of seite.zeilen) {
    if (zeile.y <= kante || !BETRAGSENDE.test(zeile.text)) continue;
    const x = linksVon(zeile);
    if (x !== undefined && x < spalte) spalte = x;
    if (zeile.y < betragszeile) betragszeile = zeile.y;
  }
  if (!Number.isFinite(spalte)) return {};

  /*
   * Zwei Punkte Spiel: Gemessene Stellen treffen selten aufs Hundertstel, und
   * ein Einzug unter zwei Punkten ist keiner. Oben achtzig - mehr waere keine
   * Einrueckung mehr, sondern eine eigene Spalte mit Inhalt, und den koennten
   * wir nicht fuellen.
   */
  const einzug = spalte - inhaltLinks;
  const brauchbar = einzug > 2 && einzug <= 80;

  /*
   * Ausgezeichnet ist die Position, wenn **irgendeine** ihrer Zeilen fett
   * steht. Nicht nur die erste: Ob der Name in der ersten oder zweiten Zeile
   * steht, haengt am Umbruch, und daran soll die Frage nicht haengen.
   */
  let fett = false;
  let unterste = Infinity;
  for (const zeile of seite.zeilen) {
    if (zeile.y <= kante) continue;
    const erstes = zeile.stuecke.filter((stueck) => stueck.text.trim().length > 0)[0];
    if (!erstes || Math.abs(erstes.x - spalte) >= 1) continue;
    if (erstes.fett) fett = true;
    if (zeile.y < unterste) unterste = zeile.y;
  }

  /*
   * Steht der Betrag auf der untersten Zeile des Positionsblocks, setzt die
   * Vorlage ihn unten. Ein halber Punkt Spiel, weil Betrag und Text derselben
   * Zeile minimal verschiedene Grundlinien haben koennen.
   */
  const betragUnten = Number.isFinite(unterste)
    ? Math.abs(betragszeile - unterste) < 0.5
    : undefined;

  return {
    ...(brauchbar ? { positionsEinzug: rund(einzug) } : {}),
    positionsauszeichnung: fett,
    ...(betragUnten !== undefined ? { betragUnten } : {}),
  };
}

/**
 * Die rechte Kante der Summenbeschriftungen.
 *
 * Genommen wird die groesste - sie ist die gemeinsame Fluchtlinie, an der die
 * Vorlage alle drei ausrichtet. Erst ab zwei Beschriftungen: Aus einer allein
 * laesst sich keine Buendigkeit ablesen, sie koennte auch mittig stehen.
 */
function erkenneSummenkante(
  kanten: Map<keyof Beschriftungen, number>,
): { summenlabelRechts?: number } {
  const gefunden = SUMMENWOERTER.map((feld) => kanten.get(feld)).filter(
    (kante): kante is number => kante !== undefined,
  );
  return gefunden.length >= 2 ? { summenlabelRechts: rund(Math.max(...gefunden)) } : {};
}

/**
 * Welche Schnitte die Vorlage benutzt - und ob die Summenbeschriftungen einen
 * eigenen haben.
 *
 * Der Fliesstextschnitt ist der haeufigste unter den nicht fett gesetzten
 * Stuecken. Traegt eine Summenbeschriftung einen anderen, ist es ein dritter
 * Schnitt zwischen mager und halbfett - genau das, was unser Satz bisher
 * nicht kannte.
 */
function erkenneSchnitte(
  seite: Textseite,
  schnitte: Map<keyof Beschriftungen, string>,
): { summenlabelKraeftig?: boolean; schnitte?: string[] } {
  const zaehler = new Map<string, number>();
  const alle = new Set<string>();
  for (const zeile of seite.zeilen) {
    for (const stueck of zeile.stuecke) {
      if (stueck.schnitt.length === 0 || stueck.text.trim().length === 0) continue;
      alle.add(stueck.schnitt);
      if (stueck.fett) continue;
      zaehler.set(stueck.schnitt, (zaehler.get(stueck.schnitt) ?? 0) + stueck.text.length);
    }
  }
  if (alle.size === 0) return {};

  const grund = [...zaehler.entries()].sort((eins, zwei) => zwei[1] - eins[1])[0]?.[0];
  const beschriftung = SUMMENWOERTER.map((feld) => schnitte.get(feld)).find(
    (name): name is string => name !== undefined && name.length > 0,
  );

  return {
    schnitte: [...alle].sort(),
    ...(grund && beschriftung && beschriftung !== grund
      ? { summenlabelKraeftig: true }
      : {}),
  };
}

/** Die Felder, deren Anordnung die Stellung des Blocks verraet. */
const KENNZAHLENFELDER = new Set<keyof Beschriftungen>([
  'rechnungsnummer',
  'rechnungsdatum',
  'leistungsdatum',
  'faelligAm',
  'kundennummer',
  'bestellnummer',
]);

/**
 * Schliesst aus der Anordnung auf die Stellung.
 *
 * Stehen drei oder mehr Kennzahlen in **einer** Zeile, hat die Vorlage sie
 * quer gesetzt. Sonst untereinander - und dann entscheidet die Hoehe.
 *
 * Gemessen wird gegen das Anschriftenfeld, nicht gegen einen Anteil der
 * Seite: Es sitzt nach DIN 5008 fest bei 45 mm von oben, und ob der Block
 * daneben oder darueber steht, ist genau diese Frage. Ein Anteil der
 * Seitenhoehe traf bei unserer eigenen Rechnung daneben.
 */
function erkenneStellung(
  querzaehler: Map<number, number>,
  seitenhoehe: number,
): { kennzahlen: Kennzahlenstellung } | undefined {
  if (querzaehler.size === 0) return undefined;

  const quer = [...querzaehler.entries()].find(([, zahl]) => zahl >= QUER_AB);
  if (quer) return { kennzahlen: 'unter-anschrift' };

  const anschriftOben = seitenhoehe - 45 * MM;
  const hoechste = Math.max(...querzaehler.keys());

  // Ein Fingerbreit Spielraum: "neben" heisst in der Praxis "auf gleicher
  // Hoehe bis knapp darueber".
  return {
    kennzahlen: hoechste > anschriftOben + 30 ? 'ueber-anschrift' : 'neben-anschrift',
  };
}
