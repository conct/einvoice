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
   */
  if (brutto && netto && steuer) {
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
