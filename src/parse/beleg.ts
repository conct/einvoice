import { isPlausibleIban, isPlausibleVatId } from '../model/validate';
import { round } from '../util/money';
import type { IsoDate } from '../util/date';

/**
 * Eine abfotografierte Papierrechnung lesen.
 *
 * ## Warum das in dieser Bibliothek steht
 *
 * Nebenan liegt `readEInvoice`: aus einem empfangenen Dokument wird ein
 * Datensatz. Hier ist es dieselbe Aufgabe fuer den Beleg, der keiner ist -
 * Papier, abfotografiert, durch eine Texterkennung gegangen. Die Erkennung
 * selbst gehoert nicht hierher; sie braucht Browser oder Betriebssystem. Was
 * hierher gehoert, ist der Schritt danach, und der ist reine Rechnerei.
 *
 * ## Was das hier ist - und was nicht
 *
 * Die Texterkennung liefert einen Haufen Zeilen. Diese Datei sucht darin die
 * paar Angaben, die eine Eingangsrechnung ausmachen: Nummer, Datum, Frist,
 * Betrag, Absender. Mehr nicht. Positionen, Steuersaetze je Zeile,
 * Zahlungsbedingungen - all das steht auf dem Blatt in tausend Gestalten, und
 * was eine Maschine daraus macht, waere geraten.
 *
 * **Nichts hiervon ist ein Befund.** Eine E-Rechnung sagt, was sie enthaelt;
 * ein Foto zeigt nur Pixel. Deshalb traegt jeder Fund seine Sicherheit und
 * die Zeile, in der er stand, und deshalb geht kein Vorgang in die Ablage,
 * den nicht ein Mensch bestaetigt hat.
 *
 * Dieselbe Trennung wie in `findeStammdaten` der Uebernahme: Was eine
 * Pruefsumme besteht - die IBAN - ist geprueft. Was einer Form folgt, ist ein
 * Muster. Der Firmenname ist die oberste Zeile, die nach einem Namen aussieht,
 * und damit geraten.
 *
 * ## Warum trotzdem gelesen wird
 *
 * Weil die Alternative Abtippen heisst. Ein falsch erkanntes Datum korrigiert
 * man in zwei Sekunden; eine ganze Rechnung einzugeben dauert zwei Minuten,
 * und deshalb unterbleibt es - und dann liegt der Beleg nirgends.
 */

export type Sicherheit =
  /** Ein Verfahren bestaetigt es - etwa die IBAN-Pruefsumme. */
  | 'geprueft'
  /** Die Form stimmt, geprueft ist sie nicht. */
  | 'muster'
  /** Aus der Umgebung geschlossen. */
  | 'geraten';

export type Belegfeld =
  | 'nummer'
  | 'datum'
  | 'faellig'
  | 'absender'
  | 'waehrung'
  | 'brutto'
  | 'netto'
  | 'steuer'
  | 'iban'
  | 'ustId'
  | 'steuernummer';

export interface Belegfund {
  feld: Belegfeld;
  wert: string;
  sicherheit: Sicherheit;
  /** Die Zeile, in der es stand - damit der Nutzer nachsehen kann. */
  beleg: string;
}

/**
 * Was von einem Papierbeleg uebrig bleibt.
 *
 * Wenige Felder, und alle flach: Eine abfotografierte Rechnung hat keine
 * Positionen, keine Steueraufschluesselung und keine Zahlungsbedingungen, die
 * sich verlaesslich lesen liessen. Mehr zu behaupten, als auf dem Bild
 * erkennbar war, waere der Fehler, der sich hinterher durch jede Auswertung
 * zieht.
 */
export interface Belegdaten {
  nummer: string;
  datum: IsoDate;
  faellig?: IsoDate;
  /** Name des Absenders, wie er auf dem Blatt stand. */
  absender: string;
  waehrung: string;
  /** Der Betrag, der zu zahlen ist. Das Einzige, was wirklich gebraucht wird. */
  brutto: number;
  netto?: number;
  steuer?: number;
  iban?: string;
  ustId?: string;
  steuernummer?: string;
}

export interface Belegbefund {
  funde: Belegfund[];
  /** Was auffiel, ohne dass es ein Fehler waere. */
  hinweise: string[];
  /**
   * Der Vorschlag fuer die Oberflaeche. Unvollstaendig, wo nichts gefunden
   * wurde - die fehlenden Felder traegt der Nutzer nach.
   */
  vorschlag: Partial<Belegdaten>;
}

/** Waehrungszeichen, die auf deutschen Belegen vorkommen. */
const WAEHRUNGEN: Array<[RegExp, string]> = [
  [/€|\bEUR\b|\bEuro\b/i, 'EUR'],
  [/\bCHF\b|\bSFr\.?/i, 'CHF'],
  [/\bGBP\b|£/, 'GBP'],
  [/\bUSD\b/, 'USD'],
];

/**
 * Eine Zahl aus einem Textstueck.
 *
 * Deutsche und englische Schreibweise: "1.234,56" und "1,234.56" und
 * "1234.56". Entschieden wird am letzten Trennzeichen - was danach kommt und
 * hoechstens zwei Stellen hat, sind Cent.
 */
export function betragAus(text: string): number | undefined {
  /*
   * Keine Leerzeichen innerhalb einer Zahl. Mit ihnen verschmolz
   * "58,00 377,00" zu einer einzigen Zahl - und aus einem Positionspreis von
   * 377 Euro wurden 5.800.377.
   */
  const treffer = text.match(/-?\d[\d.,]*\d|-?\d/g);
  if (!treffer) return undefined;
  const roh = treffer[treffer.length - 1];
  if (!roh) return undefined;
  const ohneLeer = roh.replace(/\s/g, '');
  const letztesKomma = ohneLeer.lastIndexOf(',');
  const letzterPunkt = ohneLeer.lastIndexOf('.');
  const trenner = Math.max(letztesKomma, letzterPunkt);

  let zahl: string;
  if (trenner === -1) {
    zahl = ohneLeer;
  } else if (ohneLeer.length - trenner - 1 <= 2 && ohneLeer.length - trenner - 1 > 0) {
    // Nachkommastellen: alles davor sind Tausendertrenner.
    zahl = `${ohneLeer.slice(0, trenner).replace(/[.,]/g, '')}.${ohneLeer.slice(trenner + 1)}`;
  } else {
    zahl = ohneLeer.replace(/[.,]/g, '');
  }

  const wert = Number(zahl);
  return Number.isFinite(wert) ? round(wert) : undefined;
}

/**
 * Der Betrag am Ende einer Zeile.
 *
 * Auf einem Beleg steht der Betrag in der rechten Spalte, also am
 * Zeilenende - hoechstens gefolgt von der Waehrung. Diese Einschraenkung ist
 * nicht Kosmetik, sondern der Unterschied zwischen lesen und raten: "Kein
 * Ausweis der Umsatzsteuer gemaess Paragraf 19 UStG." enthaelt eine Zahl und
 * das Wort Umsatzsteuer, und ohne sie stuende bei jedem Kleinunternehmer
 * 19,00 Euro Steuer im Vorgang.
 */
export function betragAmZeilenende(zeile: string): number | undefined {
  const treffer = zeile.match(/(-?\d[\d.,]*\d|-?\d)\s*(?:€|EUR|CHF|GBP|USD)?\s*[.*]?$/i);
  return treffer?.[1] ? betragAus(treffer[1]) : undefined;
}

/**
 * Ein Datum aus einem Textstueck, als ISO-Datum.
 *
 * Deutsche Schreibweise zuerst, weil die Belege deutsch sind: 7.9.2026,
 * 07.09.26. Zweistellige Jahre werden ins laufende Jahrhundert gelegt - eine
 * Rechnung von 1926 wird niemand einlesen.
 */
export function datumAus(text: string): IsoDate | undefined {
  const deutsch = text.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/);
  if (deutsch) {
    const [, tag = '', monat = '', jahr = ''] = deutsch;
    const volljahr = jahr.length === 2 ? `20${jahr}` : jahr;
    return pruefeDatum(Number(volljahr), Number(monat), Number(tag));
  }
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, jahr = '', monat = '', tag = ''] = iso;
    return pruefeDatum(Number(jahr), Number(monat), Number(tag));
  }
  return undefined;
}

function pruefeDatum(jahr: number, monat: number, tag: number): IsoDate | undefined {
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return undefined;
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  // Der 31. Februar faellt hier durch: Date rechnet ihn auf den 3. Maerz um.
  if (datum.getUTCMonth() !== monat - 1 || datum.getUTCDate() !== tag) return undefined;
  return datum.toISOString().slice(0, 10) as IsoDate;
}

/** Tage auf ein ISO-Datum addieren. */
function plusTage(datum: IsoDate, tage: number): IsoDate {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10) as IsoDate;
}

const RECHNUNGSNUMMER =
  /(?:rechnung(?:s)?[\s-]*(?:nummer|nr\.?|no\.?)|beleg[\s-]*(?:nummer|nr\.?)|invoice\s*(?:number|no\.?))\s*[:.#]?\s*([A-Za-z0-9][A-Za-z0-9/\-.]{2,})/i;

const DATUMSZEILE = /(?:rechnungsdatum|belegdatum|datum|ausstellungsdatum|vom)\b/i;
const FAELLIGZEILE = /(?:f(?:ä|ae)llig|zahlbar\s+bis|zahlungsziel|due\s+date)/i;
const ZIELZEILE = /zahlbar\s+(?:innerhalb\s+von\s+)?(\d{1,3})\s*tagen?/i;

const BRUTTOZEILE =
  /(?:gesamtbetrag|rechnungsbetrag|gesamtsumme|endbetrag|zahlbetrag|brutto(?:betrag|summe)?|zu\s+zahlen|total)/i;
const NETTOZEILE = /(?:netto(?:betrag|summe)?|summe\s+netto|zwischensumme|gesamt\s+netto)/i;
const STEUERZEILE = /(?:umsatzsteuer|mehrwertsteuer|\bmwst\.?|\bust\.?|\bvat\b)/i;

/**
 * Zeilen, die zwar nach Betrag klingen, aber keiner sind.
 *
 * "Gesamtbetrag der Vorauszahlung", "Betrag in Worten" - und vor allem jede
 * Zeile ohne Ziffer. Ohne diesen Filter gewinnt die erste Ueberschrift.
 */
const KEINE_ZAHL = /^\D*$/;

/* -------------------------------------------------------------------------
 * DER KASSENBON - ein Beleg, der keine Rechnung ist
 *
 * Gemessen am 26.11.2026 an einem Bon von Kaufland Pirna (65,81 EUR, Android,
 * ML Kit): Als Absender stand "Hasseroeder Pils" da, Betrag und Nummer blieben
 * leer. Nicht wegen schlechter Erkennung - der Text war fast fehlerfrei -,
 * sondern weil ein Bon anders gebaut ist als eine Rechnung:
 *
 *   - Oben steht nicht der Haendler. Die Texterkennung liest spaltenweise,
 *     und die Artikelspalte faengt vor dem Briefkopf an.
 *   - Es gibt kein "Gesamtbetrag". Der Betrag steht in der Steuertabelle,
 *     aufgeteilt nach Saetzen: "A 19,00% 61,51", "B 7,00% 4,30".
 *   - Es gibt keine Rechnungsnummer, sondern eine Bonnummer, und die steht
 *     zwischen Uhrzeit und Kasse: "18:00:35 Bon:91385".
 *
 * Deshalb liest dieser Durchgang VOR dem allgemeinen - und nur dann, wenn der
 * Text wirklich nach einem Bon aussieht. Auf einer Rechnung wuerde er mehr
 * kaputtmachen, als er braucht.
 * ---------------------------------------------------------------------- */

/**
 * Strassenwoerter. Auch wortintern gesucht, denn "Musterstrasse" ist ein Wort
 * und "Lohmerner Strasse" sind zwei.
 */
const STRASSE =
  /(?:stra(?:ß|ss)e|str\.|\bweg\b|\bplatz\b|\ballee\b|\bring\b|\bgasse\b|\bchaussee\b|\bdamm\b)/i;

/**
 * Merkmale, die es nur auf einem Bon gibt. Eines davon muss da sein.
 *
 * Alle verlangen mehr als ein Wort: "Bon" allein steht auch mal in einer
 * Artikelbezeichnung, "Bon:91385" nicht.
 */
const BON_STARK: RegExp[] = [
  /\bbon\s*(?:nr\.?)?\s*[:.#]?\s*\d{2,}/i,
  /\bkasse\s*[:.#]?\s*\d/i,
  /\bfiliale\b/i,
  /r(?:ü|ue)ckgeld/i,
  /\bec[-\s]?cash\b|\bgirocard\b|\bkartenzahlung\b/i,
];

/** Merkmale, die auch auf einer Rechnung vorkommen. Sie zaehlen nur mit. */
const BON_SCHWACH: RegExp[] = [
  /steuer\s*%/i,
  /\bkassenbon\b|\bkassenbeleg\b/i,
  /\bgegeben\b|\bbar\s+gegeben\b/i,
  /\btse\b|signaturz(?:ä|ae)hler/i,
];

/**
 * Sieht der Text nach einem Kassenbon aus?
 *
 * Ein starkes Merkmal reicht nicht - "Filiale" steht auch auf mancher
 * Rechnung. Verlangt werden eines davon UND zwei insgesamt.
 */
export function istKassenbon(zeilen: readonly string[]): boolean {
  const stark = BON_STARK.filter((muster) => zeilen.some((zeile) => muster.test(zeile))).length;
  const schwach = BON_SCHWACH.filter((muster) => zeilen.some((zeile) => muster.test(zeile))).length;

  return stark >= 1 && stark + schwach >= 2;
}

/**
 * Die Pruefziffer einer deutschen USt-IdNr. (ISO 7064, MOD 11,10).
 *
 * Gebraucht wird sie, weil auf einem Bon die Nummer NACKT in einer eigenen
 * Zeile steht, ohne Beschriftung davor. Ohne Rechnung waere jede Zeile mit
 * zwei Buchstaben und neun Ziffern eine Umsatzsteuernummer - und
 * 'isPlausibleVatId' hilft hier nicht, die prueft nur die Form.
 */
function deutscheUstIdStimmt(id: string): boolean {
  const ziffern = id.slice(2);
  if (!/^\d{9}$/.test(ziffern)) return false;

  let p = 10;
  for (const stelle of ziffern.slice(0, 8)) {
    const m = (Number(stelle) + p) % 10 || 10;
    p = (2 * m) % 11;
  }

  return (11 - p) % 10 === Number(ziffern[8]);
}

/**
 * Eine Zeile der Steuertabelle: "A 19,00% 61,51", "B7,00% 4,30",
 * "(1) 19,00 % 15,13".
 *
 * DER KLAMMERVORSATZ HAT EINEN BON GEKOSTET: Bei MAEC GEIZ heissen die Zeilen
 * "(1) 19,00 %" und "(2) 7,00 %". Das verankerte Muster kam ueber die Klammer
 * nicht hinweg, fand nur die 7-%-Zeile - und machte aus einem Beleg ueber
 * 19,81 EUR einen ueber 1,79 EUR, mit dem Vermerk 'geprueft'. Gemessen am
 * 26.11.2026.
 */
const BON_STEUERSATZ = /^\s*(?:\(\s*\d{1,2}\s*\)\s*)?([A-Z])?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%(.*)$/;

/**
 * Steuersaetze, die es in Deutschland gibt oder gab.
 *
 * Gebraucht, um zu zaehlen, welche Saetze ein Bon ueberhaupt NENNT - und
 * damit zu merken, dass eine Zeile fehlt.
 */
const DEUTSCHE_SAETZE = [0, 5, 5.5, 7, 9, 9.5, 10.7, 16, 19];

/**
 * Den Bon lesen. Gibt zurueck, ob Netto und Steuer ZURUECKGERECHNET wurden.
 *
 * Das ist keine Nebensache: 'liesBeleg' hebt den Betrag auf 'geprueft', wenn
 * Netto + Steuer = Brutto aufgeht. Stammen Netto und Steuer aus dem Brutto,
 * geht die Probe immer auf - eine Bestaetigung, die sich selbst bestaetigt.
 * Deshalb sagt dieser Durchgang Bescheid, und die Probe unterbleibt.
 */
function liesKassenbon(
  zeilen: readonly string[],
  nimm: (feld: Belegfeld, wert: string, sicherheit: Sicherheit, beleg: string) => void,
  hinweise: string[],
): boolean {
  /* 1. Die Bonnummer. */
  for (const zeile of zeilen) {
    const treffer = zeile.match(/\bbon\s*(?:nr\.?)?\s*[:.#]?\s*(\d{2,})/i);
    if (treffer?.[1]) {
      nimm('nummer', treffer[1], 'muster', zeile);
      break;
    }
  }

  /* 2. Die Steuertabelle - dort steht der Betrag. */

  /*
   * Welche Spalte die Tabelle zeigt, sagt ihre Ueberschrift: "Steuer % Brutto"
   * oder "Steuer % Netto". Ohne Ueberschrift gilt Brutto - so drucken es die
   * meisten Kassen.
   */
  const spalteNetto = zeilen.some((zeile) => /steuer\s*%\s*netto/i.test(zeile) && !/brutto/i.test(zeile));

  /** Eine Zeile, in der NUR ein Betrag steht. */
  const nurBetrag = (zeile: string): number | undefined => {
    if (!/^\d[\d.,]*\s*(?:€|EUR)?$/i.test(zeile)) return undefined;
    const zahl = betragAus(zeile);

    return zahl !== undefined && zahl > 0 ? zahl : undefined;
  };

  const roh: Array<{ satz: number; betraege: number[]; zeile: string; stelle: number }> = [];

  zeilen.forEach((zeile, stelle) => {
    const treffer = zeile.match(BON_STEUERSATZ);
    if (!treffer) return;

    const satz = betragAus(treffer[2] ?? '');
    const rest = treffer[3] ?? '';
    if (satz === undefined || satz > 30) return;

    /*
     * Im Rest duerfen nur Zahlen stehen. Ohne diese Schranke faengt die Zeile
     * "19 % MwSt. 95,30" einer gewoehnlichen Rechnung mit, und der Bondurchgang
     * haelt ihre Steuer fuer eine Bruttospalte.
     */
    const worte = rest
      .replace(/-?\d[\d.,]*/g, ' ')
      .replace(/\b(?:EUR|CHF|USD|GBP)\b/gi, ' ')
      .replace(/[€%*.,;:|_-]/g, ' ')
      .replace(/\b[A-Za-z]\b/g, ' ')
      .trim();
    if (worte) return;

    const betraege = (rest.match(/-?\d[\d.,]*\d|-?\d/g) ?? [])
      .map((stueck) => betragAus(stueck))
      .filter((zahl): zahl is number => zahl !== undefined);

    roh.push({ satz, betraege, zeile, stelle });
  });

  /*
   * DERSELBE SATZ KANN MEHRFACH DASTEHEN. Auf dem Bon von MAEC GEIZ steht
   * "(1) 19,00 %" einmal in der Artikelliste - als Steuerklasse des Postens -
   * und einmal in der Tabelle unten. Ohne Zusammenfassen suchte die Rechnung
   * unten nach DREI Betraegen fuer zwei Saetze und fand nichts.
   *
   * Zusammengefasst wird nur, solange KEINE Zeile ihren Betrag mitbringt:
   * Steht er dabei, ist die Zeile die Tabelle und kein Hinweis am Artikel.
   */
  if (roh.length > 1 && roh.every((satz) => !satz.betraege.length)) {
    const je = new Map<number, (typeof roh)[number]>();

    for (const eintrag of roh) je.set(eintrag.satz, eintrag);

    roh.length = 0;
    roh.push(...je.values());
  }

  /*
   * ZWEITE LAGE, UND DIE WICHTIGSTE: DIE RECHNUNG STATT DER REIHENFOLGE.
   *
   * Derselbe Bon, dreimal fotografiert, dreimal anders zerlegt - beim dritten
   * Mal lag er quer, und die Erkennung gab den Text RUECKWAERTS aus, Satz und
   * Zeichen sogar getrennt:
   *
   *     B7,00%
   *     A
   *     19,00%
   *     Steuer % Brutto
   *     4,30
   *     4,02
   *     ...
   *     61,51
   *     51,69
   *
   * Gegen so etwas hilft keine Regel ueber Zeilen und Nachbarn mehr. Was
   * bleibt, ist die Arithmetik: Gesucht wird die EINE Zuordnung von Betraegen
   * zu Saetzen, die der Bon selbst bestaetigt - jeder Bruttobetrag muss sein
   * Netto im Text stehen haben (61,51/1,19 = 51,69 und 4,30/1,07 = 4,02), und
   * ihre Summe muss ebenfalls dort stehen (65,81). Gibt es mehr als eine
   * solche Zuordnung, wird nichts genommen: Zwei Moeglichkeiten sind geraten.
   *
   * Das ist nicht nur robuster, es ist auch ehrlicher. Die Zahlen stammen dann
   * nicht aus einer Vermutung ueber Spalten, sondern aus drei Angaben, die auf
   * dem Papier zusammenpassen.
   */
  let mehrdeutig = false;
  const ohneZahl = roh.filter((satz) => !satz.betraege.length);
  if (
    ohneZahl.length &&
    ohneZahl.length === roh.length &&
    roh.length <= 3 &&
    roh.every((satz) => satz.satz > 0)
  ) {
    /* Jede Zahl des Belegs, mit ihrer Haeufigkeit - zwei Saetze duerfen nur
     * dann denselben Betrag haben, wenn er auch zweimal dasteht. */
    const vorrat = new Map<number, number>();
    for (const zeile of zeilen) {
      for (const stueck of zeile.match(/-?\d[\d.,]*\d|-?\d/g) ?? []) {
        const zahl = betragAus(stueck);
        if (zahl === undefined || zahl <= 0 || zahl >= 100000) continue;
        vorrat.set(zahl, (vorrat.get(zahl) ?? 0) + 1);
      }
    }

    const werte = [...vorrat.keys()];
    const loesungen: number[][] = [];
    const benutzt = new Map<number, number>();

    const suche = (stelle: number, gewaehlt: number[]): void => {
      // Mehr als eine Loesung heisst mehrdeutig - dann lohnt kein Weitersuchen.
      if (loesungen.length > 1) return;

      if (stelle === roh.length) {
        /*
         * EIN CENT TOLERANZ, und zwar noetig: Die Kasse rundet je Zeile, die
         * gedruckte Summe ist deshalb nicht immer die Summe der gerundeten
         * Zeilen. Bei MAEC GEIZ ergeben die Saetze 19,80 und auf dem Bon steht
         * 19,81. Ohne Toleranz faende diese Suche gar nichts.
         */
        const summe = round(gewaehlt.reduce((zwischen, betrag) => zwischen + betrag, 0));
        if (werte.some((wert) => Math.abs(wert - summe) <= 0.02)) loesungen.push([...gewaehlt]);
        return;
      }

      const satz = roh[stelle]?.satz ?? 0;
      for (const brutto of werte) {
        if ((benutzt.get(brutto) ?? 0) >= (vorrat.get(brutto) ?? 0)) continue;
        const netto = round(brutto / (1 + satz / 100));
        if (netto === brutto || !vorrat.has(netto)) continue;

        benutzt.set(brutto, (benutzt.get(brutto) ?? 0) + 1);
        suche(stelle + 1, [...gewaehlt, brutto]);
        benutzt.set(brutto, (benutzt.get(brutto) ?? 0) - 1);
      }
    };

    suche(0, []);

    if (loesungen.length === 1) {
      ohneZahl.forEach((satz, stelle) => satz.betraege.push(loesungen[0]?.[stelle] ?? 0));
    }
    mehrdeutig = loesungen.length > 1;
  }

  /*
   * DRITTE LAGE - gemessen am 26.11.2026 an EINEM Bon, zweimal fotografiert.
   * Die Texterkennung zerlegt dieselbe Tabelle einmal zeilenweise und einmal
   * spaltenweise, und daran scheiterte der zweite Versuch:
   *
   *     A 19,00% 61,51          A 19,00%
   *     B 7,00% 4,30     statt  B7,00%
   *                             61,51
   *                             4,30
   *
   * Stehen die Saetze allein da, folgen die Betraege direkt dahinter, in
   * derselben Reihenfolge. Zugelassen ist das nur, wenn KEIN Satz seinen
   * Betrag mitbringt: Ein halb zerlegtes Gebilde waere geraten, nicht gelesen.
   */
  const ohneBetrag = roh.filter((satz) => !satz.betraege.length);
  if (ohneBetrag.length && ohneBetrag.length === roh.length && !mehrdeutig) {
    /*
     * Nur noch, wenn die Rechnung oben GAR NICHTS fand. Fand sie mehrere
     * moegliche Zuordnungen, ist der Text mehrdeutig - dann darf die
     * Reihenfolge nicht entscheiden, was die Arithmetik offengelassen hat.
     */
    const nachschub: number[] = [];
    const letzte = ohneBetrag[ohneBetrag.length - 1]?.stelle ?? -1;

    for (let i = letzte + 1; i < zeilen.length && nachschub.length < ohneBetrag.length; i += 1) {
      const zahl = nurBetrag(zeilen[i] ?? '');
      if (zahl === undefined) break;
      nachschub.push(zahl);
    }

    if (nachschub.length === ohneBetrag.length) {
      ohneBetrag.forEach((satz, stelle) => satz.betraege.push(nachschub[stelle] ?? 0));
    }
  }

  const saetze: Array<{ satz: number; brutto: number; netto: number; steuer: number }> = [];
  const belegzeilen: string[] = [];

  for (const eintrag of roh) {
    const zahlen = eintrag.betraege;
    if (!zahlen.length) continue;

    const faktor = 1 + eintrag.satz / 100;
    let brutto = Math.max(...zahlen);
    let netto: number | undefined;

    if (zahlen.length === 1 && spalteNetto) {
      netto = zahlen[0];
      brutto = round((zahlen[0] ?? 0) * faktor);
    } else if (zahlen.length === 2) {
      const [a = 0, b = 0] = zahlen;
      if (Math.abs(a - b * faktor) <= 0.02) {
        brutto = a;
        netto = b;
      } else if (Math.abs(b - a * faktor) <= 0.02) {
        brutto = b;
        netto = a;
      }
    } else if (zahlen.length >= 3) {
      // Die Zahl, die sich aus zwei anderen zusammensetzt, ist das Brutto.
      for (let i = 0; i < zahlen.length; i += 1) {
        for (let j = i + 1; j < zahlen.length; j += 1) {
          const paar = round((zahlen[i] ?? 0) + (zahlen[j] ?? 0));
          const dritte = zahlen.find((_, k) => k !== i && k !== j && Math.abs((zahlen[k] ?? 0) - paar) <= 0.02);
          if (dritte !== undefined) {
            brutto = dritte;
            netto = Math.max(zahlen[i] ?? 0, zahlen[j] ?? 0);
          }
        }
      }
    }

    if (brutto <= 0) continue;
    const errechnet = netto ?? round(brutto / faktor);
    saetze.push({ satz: eintrag.satz, brutto, netto: errechnet, steuer: round(brutto - errechnet) });
    belegzeilen.push(eintrag.zeile);
  }

  /*
   * WELCHE SAETZE NENNT DER BON ueberhaupt? Diese Zaehlung ist die Lehre aus
   * dem 26.11.2026: Zweimal fand der Leser nur EINE Zeile der Steuertabelle
   * und bildete daraus eine Summe - aus 65,81 wurden 4,30, aus 19,81 wurden
   * 1,79. Beide Male stand der fehlende Satz im Text, nur in einer Form, die
   * die Zeilenerkennung nicht griff.
   *
   * Eine Teilsumme ist schlimmer als gar keine: Sie sieht aus wie ein Betrag,
   * sie besteht die Rechenprobe, und sie landet in der Buchhaltung. Wird ein
   * Satz genannt, zu dem keine Zeile gefunden wurde, bleibt das Feld deshalb
   * LEER, und der Hinweis sagt, warum.
   */
  const genannt = new Set<number>();
  for (const zeile of zeilen) {
    for (const treffer of zeile.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g)) {
      const satz = betragAus(treffer[1] ?? '');
      if (satz !== undefined && satz > 0 && DEUTSCHE_SAETZE.includes(satz)) genannt.add(satz);
    }
  }

  const gelesen = new Set(saetze.map((satz) => satz.satz));
  const fehlendeSaetze = [...genannt].filter((satz) => !gelesen.has(satz));

  let abgeleitet = false;

  if (saetze.length && fehlendeSaetze.length) {
    hinweise.push(
      `Der Bon nennt ${fehlendeSaetze.map((satz) => satz.toFixed(2).replace('.', ',')).join(' % und ')} %,`
      + ' dazu wurde keine Zeile der Steuertabelle gefunden. Der Betrag bleibt leer, damit keine Teilsumme'
      + ' in die Buchhaltung geraet.',
    );
  } else if (saetze.length) {
    const brutto = round(saetze.reduce((summe, zeile) => summe + zeile.brutto, 0));
    const netto = round(saetze.reduce((summe, zeile) => summe + zeile.netto, 0));
    const steuer = round(saetze.reduce((summe, zeile) => summe + zeile.steuer, 0));
    const beleg = belegzeilen.join(' | ');

    /*
     * Ein Zeuge von aussen: Steht die Summe anderswo noch einmal da - frei in
     * der Betragsspalte oder hinter "Summe" -, ist sie bestaetigt. Sonst
     * bleibt sie ein Muster, denn addiert hat sie bis dahin nur diese Datei.
     */
    const nahe = (wert: number | undefined) => wert !== undefined && Math.abs(wert - brutto) <= 0.02;
    const zeuge =
      zeilen
        .filter((zeile) => /^[\d.,]+\s*(?:€|EUR)?$/i.test(zeile))
        .map((zeile) => betragAus(zeile))
        .find(nahe)
      ?? zeilen
        .filter((zeile) => /sum(?:m)?e|gesamt|total/i.test(zeile))
        .map((zeile) => betragAmZeilenende(zeile))
        .find(nahe);

    /*
     * STEHT DIE SUMME GEDRUCKT DA, GILT SIE. Die Kasse rundet je Zeile; die
     * eigene Addition kann deshalb einen Cent danebenliegen, und auf dem
     * Beleg, den die Kanzlei sieht, steht die gedruckte Zahl.
     */
    const betrag = zeuge ?? brutto;

    nimm('brutto', betrag.toFixed(2), zeuge !== undefined ? 'geprueft' : 'muster', beleg);
    nimm('netto', netto.toFixed(2), 'muster', beleg);
    nimm('steuer', round(betrag - netto).toFixed(2), 'muster', beleg);
    abgeleitet = true;

    hinweise.push(
      `Als Kassenbon gelesen, Betrag aus der Steuertabelle: ${saetze
        .map((zeile) => `${zeile.satz.toFixed(2).replace('.', ',')} % auf ${zeile.brutto.toFixed(2).replace('.', ',')}`)
        .join(', ')}.`,
    );
  } else {
    /*
     * Ohne Steuertabelle bleibt die Summenzeile. Auch sie kann zerlegt sein -
     * "Summe" in der einen Zeile, der Betrag in der naechsten.
     */
    const stelle = zeilen.findIndex((zeile) => /^(?:sum(?:m)?e|gesamt|total)\b/i.test(zeile));
    if (stelle !== -1) {
      const summe = betragAmZeilenende(zeilen[stelle] ?? '') ?? nurBetrag(zeilen[stelle + 1] ?? '');
      if (summe !== undefined && summe > 0) {
        nimm('brutto', summe.toFixed(2), 'muster', zeilen[stelle] ?? '');
      }
    }
  }

  /*
   * 3. Der Haendler steht bei seiner Adresse, nicht oben.
   *
   * Zuerst im Kopf gesucht, dann im ganzen Text: Liegt der Bon quer, gibt die
   * Erkennung ihn rueckwaerts aus, und dann steht der Briefkopf ganz unten.
   */
  const adresse =
    zeilen.slice(0, 12).find((zeile) => STRASSE.test(zeile)) ?? zeilen.find((zeile) => STRASSE.test(zeile));

  if (adresse) {
    const teile = adresse.split(/\s[-–|,]\s/);
    const kopf = (teile[0] ?? '').trim();

    if (teile.length > 1 && kopf.length >= 3 && !STRASSE.test(kopf) && /[A-Za-zÄÖÜäöüß]{3}/.test(kopf)) {
      /* "Kaufland - Lohmener Strasse 13" - davor steht der Name. */
      nimm('absender', kopf, 'muster', adresse);
    } else if (/^\s*\S*(?:stra(?:ß|ss)e|str\.)/i.test(adresse) || /^\s*(?:weg|platz|allee|ring|gasse|damm)\b/i.test(adresse)) {
      /*
       * Eine reine Strassenzeile - der Name steht darueber. Am Strassenwort
       * zu trennen waere falsch: Aus "Musterstrasse 1" wuerde "Muster".
       */
      const davor = zeilen[zeilen.indexOf(adresse) - 1];
      if (davor && davor.length >= 3 && davor.length <= 60 && /[A-Za-zÄÖÜäöüß]{3}/.test(davor) && !/^\d/.test(davor)) {
        nimm('absender', davor, 'muster', davor);
      }
    } else if (adresse.length <= 90) {
      /*
       * Name und Strasse in einer Zeile, ohne Trennzeichen: "Kauf land
       * Lohmener Strasse 13". Dann die ganze Zeile - haesslich, aber richtig.
       * Die Zeile darueber zu nehmen waere schlimmer: Bei einem quer
       * liegenden Bon stand dort "Preis EUR".
       */
      nimm('absender', adresse, 'muster', adresse);
    }
  }

  /* 4. Die USt-IdNr. steht nackt in einer eigenen Zeile. */
  for (const zeile of zeilen) {
    const treffer = zeile.match(/^([A-Z]{2}\s?\d[\d\s]{6,})$/);
    const blank = treffer?.[1]?.replace(/\s/g, '');
    if (blank && isPlausibleVatId(blank) && blank.startsWith('DE') && deutscheUstIdStimmt(blank)) {
      nimm('ustId', blank, 'geprueft', zeile);
      break;
    }
  }

  return abgeleitet;
}

/** Liest einen Beleg aus dem erkannten Text. */
export function liesBeleg(text: string, heute?: IsoDate): Belegbefund {
  const zeilen = text
    .split(/\r?\n/)
    .map((zeile) => zeile.replace(/\s+/g, ' ').trim())
    .filter((zeile) => zeile.length > 0);

  const funde: Belegfund[] = [];
  const hinweise: string[] = [];
  const nimm = (feld: Belegfeld, wert: string, sicherheit: Sicherheit, beleg: string) => {
    if (funde.some((fund) => fund.feld === feld)) return;
    funde.push({ feld, wert, sicherheit, beleg });
  };

  /*
   * Der Bon zuerst: 'nimm' behaelt den ersten Fund, und was der Bondurchgang
   * liest, schlaegt auf einem Bon alles, was die Rechnungsheuristik darunter
   * findet. Auf einer Rechnung laeuft er gar nicht erst an.
   */
  const istBon = istKassenbon(zeilen);
  const bonAbgeleitet = istBon ? liesKassenbon(zeilen, nimm, hinweise) : false;

  for (const zeile of zeilen) {
    const nummer = zeile.match(RECHNUNGSNUMMER);
    if (nummer?.[1]) nimm('nummer', nummer[1].replace(/[.,;]$/, ''), 'muster', zeile);

    if (FAELLIGZEILE.test(zeile)) {
      const datum = datumAus(zeile);
      if (datum) nimm('faellig', datum, 'muster', zeile);
    }

    if (DATUMSZEILE.test(zeile) && !FAELLIGZEILE.test(zeile)) {
      const datum = datumAus(zeile);
      if (datum) nimm('datum', datum, 'muster', zeile);
    }

    if (BRUTTOZEILE.test(zeile) && !KEINE_ZAHL.test(zeile)) {
      const betrag = betragAmZeilenende(zeile);
      if (betrag !== undefined) nimm('brutto', betrag.toFixed(2), 'muster', zeile);
    }

    if (NETTOZEILE.test(zeile) && !KEINE_ZAHL.test(zeile)) {
      const betrag = betragAmZeilenende(zeile);
      if (betrag !== undefined) nimm('netto', betrag.toFixed(2), 'muster', zeile);
    }

    if (STEUERZEILE.test(zeile) && !KEINE_ZAHL.test(zeile) && !/ust[\s-]*id/i.test(zeile)) {
      const betrag = betragAmZeilenende(zeile);
      if (betrag !== undefined) nimm('steuer', betrag.toFixed(2), 'muster', zeile);
    }

    /*
     * Die IBAN steht auf Rechnungen fast immer in Vierergruppen - "DE02 1005
     * 0000 0054 5404 02". Wortweise zu suchen fand sie deshalb nie; gesucht
     * wird in der ganzen Zeile, Leerzeichen eingeschlossen.
     */
    const iban = zeile.match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{2,4}){2,8}\b/i);
    if (iban?.[0]) {
      const blank = iban[0].replace(/\s/g, '').toUpperCase();
      if (isPlausibleIban(blank)) nimm('iban', blank, 'geprueft', zeile);
    }

    const ustId = zeile.match(/\b([A-Z]{2}\s?\d[\d\s]{6,})\b/);
    if (ustId?.[1] && /ust|vat|umsatzsteuer/i.test(zeile)) {
      const blank = ustId[1].replace(/\s/g, '');
      if (isPlausibleVatId(blank)) nimm('ustId', blank, 'muster', zeile);
    }

    const steuernummer = zeile.match(/steuer(?:nummer|\s?-?nr\.?)\s*[:.]?\s*([\d/\s]{8,})/i);
    if (steuernummer?.[1]) nimm('steuernummer', steuernummer[1].trim(), 'muster', zeile);
  }

  // Die Waehrung steht selten bei sich selbst - gesucht wird im ganzen Text.
  for (const [muster, code] of WAEHRUNGEN) {
    if (muster.test(text)) {
      nimm('waehrung', code, 'muster', zeilen.find((zeile) => muster.test(zeile)) ?? '');
      break;
    }
  }

  /*
   * Der Absender: die oberste Zeile, die nach einem Namen aussieht. Das ist
   * schwach, und es steht auch so da - "geraten". Auf fast jeder Rechnung
   * steht der Briefkopf oben, aber eben nicht auf jeder.
   */
  const name = zeilen
    .slice(0, 8)
    .find(
      (zeile) =>
        zeile.length >= 3 &&
        zeile.length <= 60 &&
        /[A-Za-zÄÖÜäöüß]{3}/.test(zeile) &&
        !/rechnung|invoice|datum|seite|kunde|beleg/i.test(zeile) &&
        !/^\d/.test(zeile),
    );
  if (name) nimm('absender', name, 'geraten', name);

  const wert = (feld: Belegfeld) => funde.find((fund) => fund.feld === feld)?.wert;

  /*
   * DAS DATUM EINES BONS steht oft ohne das Wort "Datum" daneben.
   *
   * Gemessen am 26.11.2026 an einem Bon von MAEC GEIZ: Das Belegdatum war
   * leer, obwohl es zweimal im Text stand - einmal als Zeitstempel der
   * technischen Sicherheitseinrichtung ("Start: 2026-11-25T12:30:55.000Z")
   * und einmal nackt als "25.11.2026 13:30:55". Beide Male ohne
   * Beschriftung, und darauf wartet die Zeilensuche oben vergeblich.
   *
   * Der Zeitstempel der Sicherheitseinrichtung kommt zuerst: Den hat die
   * Kasse geschrieben, nicht der Setzer des Bons. Er steht in UTC, gefragt
   * ist aber der Kalendertag AM ORT - sonst waere ein Einkauf von 00:30 auf
   * den Vortag datiert.
   */
  if (istBon && !wert('datum')) {
    const stempel = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;
    const vonDerKasse = zeilen.find((zeile) => /^start/i.test(zeile) && stempel.test(zeile))
      ?? zeilen.find((zeile) => stempel.test(zeile));
    const treffer = vonDerKasse?.match(stempel)?.[0];
    const wann = treffer ? new Date(treffer) : null;

    if (vonDerKasse && wann && !Number.isNaN(wann.getTime())) {
      const tag = [
        wann.getFullYear(),
        String(wann.getMonth() + 1).padStart(2, '0'),
        String(wann.getDate()).padStart(2, '0'),
      ].join('-') as IsoDate;

      nimm('datum', tag, 'muster', vonDerKasse);
    } else {
      /*
       * Sonst eine Zeile, die MIT einem Datum beginnt und eine Uhrzeit
       * dabeihat - "25.11.2026 13:30:55". Die Uhrzeit ist die Bedingung:
       * Ohne sie wuerde auch "Gueltig bis 31.12.2027" durchgehen.
       */
      const mitUhr = zeilen.find((zeile) => /^\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}\s+\d{1,2}:\d{2}/.test(zeile));
      const tag = mitUhr ? datumAus(mitUhr) : undefined;

      if (mitUhr && tag) nimm('datum', tag, 'muster', mitUhr);
    }
  }

  // Ein Zahlungsziel in Tagen statt eines Datums - "zahlbar innerhalb von 14 Tagen".
  const datum = wert('datum');
  if (!wert('faellig') && datum) {
    const zeile = zeilen.find((z) => ZIELZEILE.test(z));
    const tage = zeile?.match(ZIELZEILE)?.[1];
    if (zeile && tage) {
      nimm('faellig', plusTage(datum as IsoDate, Number(tage)), 'geraten', zeile);
    }
  }

  const brutto = wert('brutto');
  const netto = wert('netto');
  const steuer = wert('steuer');

  /*
   * Die einzige Rechenprobe, die ein Foto zulaesst. Geht sie auf, ist der
   * Betrag kein Muster mehr, sondern bestaetigt - und das ist die Angabe, auf
   * die es ankommt.
   *
   * NICHT beim Bon: Dort sind Netto und Steuer aus dem Brutto zurueckgerechnet,
   * die Probe ginge also immer auf und bestaetigte nur sich selbst.
   */
  if (brutto && netto && steuer && !bonAbgeleitet) {
    const summe = round(Number(netto) + Number(steuer));
    const fund = funde.find((f) => f.feld === 'brutto');
    if (fund && Math.abs(summe - Number(brutto)) <= 0.02) {
      fund.sicherheit = 'geprueft';
    } else if (fund) {
      hinweise.push(
        `Netto und Steuer ergeben ${summe.toFixed(2)}, als Rechnungsbetrag wurde ${Number(brutto).toFixed(2)} gelesen.`,
      );
    }
  }

  if (!brutto) hinweise.push('Kein Rechnungsbetrag gefunden.');
  if (!wert('nummer')) hinweise.push('Keine Rechnungsnummer gefunden.');
  if (!datum) hinweise.push('Kein Rechnungsdatum gefunden.');

  const faellig = wert('faellig');
  if (faellig && datum && faellig < datum) {
    hinweise.push('Das gelesene Zahlungsziel liegt vor dem Rechnungsdatum.');
  }
  if (heute && datum && datum > heute) {
    hinweise.push('Das gelesene Rechnungsdatum liegt in der Zukunft.');
  }

  const vorschlag: Partial<Belegdaten> = {
    ...(wert('nummer') ? { nummer: wert('nummer') } : {}),
    ...(datum ? { datum: datum as IsoDate } : {}),
    ...(faellig ? { faellig: faellig as IsoDate } : {}),
    ...(wert('absender') ? { absender: wert('absender') } : {}),
    waehrung: wert('waehrung') ?? 'EUR',
    ...(brutto ? { brutto: Number(brutto) } : {}),
    ...(netto ? { netto: Number(netto) } : {}),
    ...(steuer ? { steuer: Number(steuer) } : {}),
    ...(wert('iban') ? { iban: wert('iban') } : {}),
    ...(wert('ustId') ? { ustId: wert('ustId') } : {}),
    ...(wert('steuernummer') ? { steuernummer: wert('steuernummer') } : {}),
  };

  return { funde, hinweise, vorschlag };
}

/**
 * Reicht das zum Behalten?
 *
 * Nummer, Datum, Absender und Betrag. Weniger ergibt keinen Vorgang, den man
 * spaeter wiederfindet - und einen Beleg ohne Betrag in eine Liste offener
 * Rechnungen zu stellen, waere schlimmer als gar keine Liste.
 */
export function vollstaendig(erfassung: Partial<Belegdaten>): erfassung is Belegdaten {
  return Boolean(
    erfassung.nummer?.trim() &&
      erfassung.datum &&
      erfassung.absender?.trim() &&
      erfassung.waehrung &&
      typeof erfassung.brutto === 'number' &&
      erfassung.brutto > 0,
  );
}
