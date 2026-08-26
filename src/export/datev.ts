import type { Invoice } from '../model/invoice';
import { computeTotals } from '../model/totals';
import { cp1252 } from '../util/cp1252';
import { decimal, round } from '../util/money';
import { steuerfallFuer, type Kontenrahmen } from './kontenrahmen';

/**
 * Buchungsstapel im DATEV-Format.
 *
 * Erzeugt die Datei, die eine Steuerberatung in ihr Rechnungswesen einliest.
 * Kein Netz, keine Schnittstelle, kein Vertrag mit DATEV - eine Datei, die der
 * Mandant weitergibt.
 *
 * Zwei Dinge, die diesen Export von den XML-Ausgaben unterscheiden:
 *
 *  1. **Er ist nicht selbstpruefend.** Ein falsches XML lehnt der Empfaenger
 *     ab, das merkt man am selben Tag. Ein falsch kontierter Buchungssatz
 *     laeuft anstandslos durch und faellt beim Jahresabschluss auf. Deshalb
 *     traegt jeder Stapel im Kopf, womit er erzeugt wurde, und die
 *     Kontenzuordnung gehoert vor dem Einsatz von der Kanzlei geprueft.
 *  2. **Er ist ANSI, nicht UTF-8.** Siehe util/cp1252.
 *
 * Grundlage ist das DATEV-Format 700 (Buchungsstapel). Die Feldreihenfolge des
 * Kopfes und der ersten Spalten ist verbindlich; alles dahinter darf leer
 * bleiben.
 */

export interface DatevMandant {
  /** Beraternummer der Kanzlei */
  berater: number;
  /** Mandantennummer bei dieser Kanzlei */
  mandant: number;
  /** Beginn des Wirtschaftsjahres, ISO-Datum - meist der 1. Januar */
  wirtschaftsjahrBeginn: string;
}

export interface DatevOptionen {
  mandant: DatevMandant;
  kontenrahmen: Kontenrahmen;
  /** Erzeugungszeitpunkt, explizit fuer nachvollziehbare Ausgaben */
  now?: Date;
  /** Bezeichnung des Stapels, erscheint in der Kanzleisoftware */
  bezeichnung?: string;
  /**
   * Festschreiben. Ein festgeschriebener Stapel laesst sich nicht mehr
   * aendern - das entspricht der Unveraenderbarkeit nach GoBD, macht aber
   * auch eine Korrektur unmoeglich. Beim ersten Austausch mit einer Kanzlei
   * ist "aus" die freundlichere Vorgabe.
   */
  festschreiben?: boolean;
  /** Debitorennummer je Rechnung; ohne Eintrag greift das Sammelkonto */
  debitor?: (invoice: Invoice) => string | undefined;
}

export interface DatevErgebnis {
  /** Fertige Datei in Windows-1252 */
  bytes: Uint8Array;
  dateiname: string;
  /** Anzahl geschriebener Buchungssaetze */
  saetze: number;
  /** Summe der gebuchten Bruttobetraege, zur Kontrolle gegen die Rechnungen */
  summe: number;
  /** Rechnungen, die uebersprungen wurden, mit Begruendung */
  uebersprungen: Array<{ nummer: string; grund: string }>;
  /** Zeichen, die Windows-1252 nicht darstellen konnte */
  ersetzteZeichen: string[];
}

/** Ein Buchungssatz, bevor er zu einer Zeile wird. */
interface Buchung {
  umsatz: number;
  sollHaben: 'S' | 'H';
  konto: string;
  gegenkonto: string;
  buSchluessel: string;
  belegdatum: string;
  belegfeld1: string;
  buchungstext: string;
  faelligkeit: string;
}

const FORMAT_VERSION = 700;
const FORMAT_KATEGORIE = 21;
const FORMAT_NAME = 'Buchungsstapel';
const FORMAT_UNTERVERSION = 13;

/** Spaltenkoepfe der Datenzeilen, in der vom Format vorgegebenen Reihenfolge. */
const SPALTEN = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basis-Umsatz',
  'WKZ Basis-Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schluessel)',
  'BU-Schluessel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
];

/**
 * Baut den Stapel aus mehreren Rechnungen.
 *
 * Je Rechnung entsteht ein Buchungssatz pro Steuergruppe - eine Rechnung mit
 * 19 und 7 Prozent ergibt also zwei Saetze. Gebucht wird brutto gegen das
 * Erloeskonto; die Steuer zieht das Automatikkonto selbst heraus.
 */
export function buildDatevBuchungsstapel(
  rechnungen: Invoice[],
  optionen: DatevOptionen,
): DatevErgebnis {
  const now = optionen.now ?? new Date();
  const uebersprungen: DatevErgebnis['uebersprungen'] = [];
  const buchungen: Buchung[] = [];

  for (const rechnung of rechnungen) {
    const totals = computeTotals(rechnung);

    if (rechnung.currency !== 'EUR') {
      // Fremdwaehrung braucht Kurs und Basis-Umsatz. Das halb zu tun waere
      // schlimmer als es zu lassen: der Stapel liefe durch und waere falsch.
      uebersprungen.push({
        nummer: rechnung.number,
        grund: `Waehrung ${rechnung.currency} wird noch nicht unterstuetzt`,
      });
      continue;
    }

    const debitor = optionen.debitor?.(rechnung) ?? optionen.kontenrahmen.sammeldebitor;

    // Eine Gutschrift dreht die Richtung: aus der Forderung wird eine
    // Verbindlichkeit gegenueber dem Kunden.
    const gutschrift = rechnung.typeCode === '381' || rechnung.typeCode === '396';

    for (const gruppe of totals.vatBreakdown) {
      const brutto = round(gruppe.taxableAmount + gruppe.taxAmount, 2);
      if (brutto === 0) continue;

      const fall = steuerfallFuer(gruppe);
      const erloes = optionen.kontenrahmen.erloese[fall];

      buchungen.push({
        // Der Betrag ist im DATEV-Format immer positiv; die Richtung steckt
        // ausschliesslich im Soll/Haben-Kennzeichen.
        umsatz: Math.abs(brutto),
        sollHaben: gutschrift === brutto >= 0 ? 'H' : 'S',
        konto: debitor,
        gegenkonto: erloes.konto,
        buSchluessel: erloes.buSchluessel ?? '',
        belegdatum: belegdatum(rechnung.issueDate),
        belegfeld1: rechnung.number.slice(0, 36),
        buchungstext: buchungstext(rechnung, gruppe.category, gruppe.rate),
        faelligkeit: rechnung.dueDate ? datumAcht(rechnung.dueDate) : '',
      });
    }
  }

  const zeitraum = zeitraumVon(rechnungen);
  const kopf = kopfzeile(optionen, now, zeitraum);
  const spalten = SPALTEN.map(inAnfuehrung).join(';');
  const daten = buchungen.map(zeile);

  const text = [kopf, spalten, ...daten].join('\r\n') + '\r\n';
  const { bytes, ersetzt } = cp1252(text);

  return {
    bytes,
    dateiname: `EXTF_Buchungsstapel_${zeitraum.von}-${zeitraum.bis}.csv`,
    saetze: buchungen.length,
    summe: buchungen.reduce((s, b) => s + (b.sollHaben === 'H' ? -b.umsatz : b.umsatz), 0),
    uebersprungen,
    ersetzteZeichen: ersetzt,
  };
}

function kopfzeile(
  optionen: DatevOptionen,
  now: Date,
  zeitraum: { von: string; bis: string },
): string {
  const felder = [
    inAnfuehrung('EXTF'),
    FORMAT_VERSION,
    FORMAT_KATEGORIE,
    inAnfuehrung(FORMAT_NAME),
    FORMAT_UNTERVERSION,
    zeitstempel(now),
    '', // importiert - bleibt leer
    inAnfuehrung('RE'), // Herkunft: zwei Zeichen, frei vergeben
    inAnfuehrung(''), // exportiert von
    inAnfuehrung(''), // importiert von
    optionen.mandant.berater,
    optionen.mandant.mandant,
    datumAcht(optionen.mandant.wirtschaftsjahrBeginn),
    optionen.kontenrahmen.sachkontenlaenge,
    zeitraum.von,
    zeitraum.bis,
    inAnfuehrung(optionen.bezeichnung ?? 'Ausgangsrechnungen'),
    inAnfuehrung(''), // Diktatkuerzel
    1, // Buchungstyp: Finanzbuchfuehrung
    '', // Rechnungslegungszweck
    optionen.festschreiben ? 1 : 0,
    inAnfuehrung('EUR'),
  ];
  return felder.join(';');
}

function zeile(b: Buchung): string {
  return [
    betrag(b.umsatz),
    inAnfuehrung(b.sollHaben),
    inAnfuehrung('EUR'),
    '', // Kurs
    '', // Basis-Umsatz
    inAnfuehrung(''), // WKZ Basis-Umsatz
    inAnfuehrung(b.konto),
    inAnfuehrung(b.gegenkonto),
    inAnfuehrung(b.buSchluessel),
    b.belegdatum,
    inAnfuehrung(b.belegfeld1),
    inAnfuehrung(''), // Belegfeld 2
    '', // Skonto
    inAnfuehrung(b.buchungstext.slice(0, 60)),
  ].join(';');
}

/**
 * Buchungstext.
 *
 * Er ist auf 60 Zeichen begrenzt und das Einzige, was in der Kanzlei von der
 * Rechnung zu sehen ist. Deshalb zuerst der Kundenname, dann - nur wenn noetig -
 * der Steuerfall: bei einer Rechnung mit zwei Saetzen waeren sonst zwei
 * identische Zeilen zu unterscheiden.
 */
function buchungstext(rechnung: Invoice, kategorie: string, satz: number): string {
  const name = rechnung.buyer.name.trim();
  const mehrere = computeTotals(rechnung).vatBreakdown.length > 1;
  if (!mehrere) return name;
  const zusatz = kategorie === 'S' ? `${decimal(satz, 0)} %` : kategorie;
  return `${name} (${zusatz})`;
}

/** DATEV erwartet das Belegdatum vierstellig als TTMM. */
function belegdatum(iso: string): string {
  const [, monat, tag] = iso.split('-');
  return `${tag}${monat}`;
}

function datumAcht(iso: string): string {
  return iso.replace(/-/g, '');
}

function zeitstempel(now: Date): string {
  const p = (n: number, breite = 2) => String(n).padStart(breite, '0');
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}${p(now.getMilliseconds(), 3)}`
  );
}

/** Betraege mit Komma als Dezimaltrenner, ohne Tausenderpunkt. */
function betrag(wert: number): string {
  return decimal(Math.abs(wert)).replace('.', ',');
}

/**
 * Anfuehrungszeichen im Inhalt werden verdoppelt.
 * Ohne das reisst ein Kundenname wie 'Meier "Zum Anker" GmbH' die Zeile
 * auseinander und der Import bricht ab.
 */
function inAnfuehrung(wert: string): string {
  return `"${wert.replace(/"/g, '""')}"`;
}

function zeitraumVon(rechnungen: Invoice[]): { von: string; bis: string } {
  const daten = rechnungen.map((r) => r.issueDate).sort();
  const heute = new Date().toISOString().slice(0, 10);
  return {
    von: datumAcht(daten[0] ?? heute),
    bis: datumAcht(daten[daten.length - 1] ?? heute),
  };
}
