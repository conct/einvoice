import type { Invoice, Party } from '../model/invoice';
import { computeTotals } from '../model/totals';
import type { Belegdaten } from '../parse/beleg';
import type { ReceivedInvoice, SourceKind } from '../parse/receive';
import type { DeclaredTotals, InvoiceSyntax } from '../parse/xml';
import { formatAmount, round } from '../util/money';

/**
 * Was aus einem Foto gelesen und vom Nutzer bestaetigt wurde.
 *
 * Derselbe Satz Felder, den `liesBeleg` aus der Bibliothek vorschlaegt - hier
 * aber bestaetigt. Der Unterschied steht nicht im Typ, sondern im Weg: Was
 * hier ankommt, hat ein Mensch gegen das Blatt gehalten.
 */
export type Erfassung = Belegdaten;

/**
 * Woher ein Vorgang stammt.
 *
 * Zwei Arten, und sie unterscheiden sich nicht in Nuancen: Eine E-Rechnung
 * **ist** ein strukturiertes Dokument - Positionen, Steuersaetze, BT-Nummern,
 * nachrechenbar. Ein Foto ist ein Bild, aus dem jemand ein paar Zahlen gelesen
 * hat, und zwar eine Maschine mit Zuversicht unter hundert Prozent.
 *
 * Beides in dieselbe Form zu pressen hiesse, dem Foto eine Genauigkeit zu
 * geben, die es nicht hat. Deshalb die Unterscheidung im Typ: Wer mit einem
 * Vorgang rechnet, muss sich entscheiden, womit er es zu tun hat.
 */
export type Quelle =
  | {
      art: 'erechnung';
      /** Das Dokument, wie es gelesen wurde. */
      invoice: Invoice;
      /**
       * Die im Dokument **ausgewiesenen** Summen.
       *
       * Sie gelten, nicht die Nachrechnung: Bezahlt wird, was der Lieferant
       * verlangt. Weicht die Nachrechnung ab, steht das in `hinweise` -
       * sichtbar machen, nicht stillschweigend verbessern.
       */
      ausgewiesen: DeclaredTotals;
      syntax: InvoiceSyntax;
      /** BT-24, verraet Profil und Fassung */
      profileId?: string;
      kind: SourceKind;
    }
  | {
      art: 'foto';
      erfasst: Erfassung;
      /** Zuversicht der Texterkennung, 0 bis 100. */
      zuversicht: number;
      /** Der erkannte Text, ungekuerzt - damit sich jede Zahl nachsehen laesst. */
      text: string;
      /**
       * Wie sicher die Lesung war, in Worten - statt einer Prozentzahl.
       *
       * Eine Anwendung, die keine Zuversicht in Prozent kennt, hat trotzdem
       * ein Urteil: 'geprueft' (IBAN-Pruefsumme stimmt, Netto plus Steuer
       * ergibt Brutto), 'Muster', 'geraten'. Steht hier etwas, nimmt die
       * Liste fuer die Kanzlei diesen Wortlaut; sonst die Prozentzahl.
       *
       * Fuer CHOOZY dazugekommen, Fassung 5.2.0. Wer es nicht setzt, bekommt
       * genau die Spalte wie vorher.
       */
      sicherheit?: string;
    };

/**
 * Eine behaltene Eingangsrechnung.
 *
 * Bei einer E-Rechnung wird das **gelesene Dokument selbst** gespeichert,
 * nicht eine flache Kopie seiner Werte. Dafuer gibt es zwei Gruende:
 *
 * 1. Massgeblich ist das XML. Wer daneben eigene Felder fuehrt, hat zwei
 *    Wahrheiten, und die erste Abweichung faellt niemandem auf.
 * 2. Was spaeter dazukommt - Skonto im Blick behalten, ein
 *    Kreditoren-Buchungsstapel, die Abstimmung mit einer Bestellung -, steht
 *    schon im Dokument. Eine Auswahl von Feldern waere genau der Teil, der
 *    dann fehlt.
 *
 * Die Anzeigewerte entstehen daraus mit `uebersicht()`, und die kennt beide
 * Arten.
 */
export interface Eingangsrechnung {
  id: string;
  quelle: Quelle;
  /** Was beim Einlesen auffiel: Summen gehen nicht auf, Pflichtangaben fehlen. */
  hinweise: string[];
  dateiname: string;
  /** Schluessel des Originals in der Anlagenablage, falls es behalten wurde. */
  anlage?: string;
  /** Zugeordneter Lieferant. Fehlt, solange niemand zugeordnet hat. */
  lieferantId?: string;
  /** Wann bezahlt wurde, ISO-Datum. Setzt der Nutzer. */
  bezahltAm?: string;
  notiz?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ein Lieferant. Die Gegenseite zu `Customer` aus den Stammdaten.
 *
 * Name, Kennzeichen und Postleitzahl stehen flach am Lieferanten, obwohl sie
 * bei einer E-Rechnung auch in `party` stehen. Das ist kein Versehen: Ein
 * Lieferant kann aus einem Foto entstehen, und dann gibt es keine `party` -
 * eine vollstaendige Anschrift nach EN 16931 liest keine Texterkennung
 * zuverlaessig aus einem Bild. Die flachen Felder sind das, womit verglichen
 * wird; `party` ist der vollstaendige Satz, wo es ihn gibt.
 */
export interface Lieferant {
  id: string;
  name: string;
  /** Die vollstaendigen Angaben, wenn der Lieferant aus einer E-Rechnung kam. */
  party?: Party;
  /** BT-31 */
  ustId?: string;
  /** BT-32 */
  steuernummer?: string;
  plz?: string;
  /**
   * Kreditorennummer fuer den Buchungsstapel.
   *
   * Vergibt die Kanzlei, nicht die App - genau wie die Debitorennummer auf
   * der Verkaufsseite. Sie wird hier verwahrt, auch wenn noch kein
   * Kreditoren-Export existiert: Wer sie beim Anlegen des Lieferanten
   * eintraegt, muss sie spaeter nicht in hundert Belegen nachtragen.
   */
  kreditor?: string;
  notiz?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Die Angaben, an denen ein Absender wiedererkannt wird.
 *
 * Eine Zwischenform, damit die Erkennung nur einmal existiert: Sie bekommt
 * dasselbe, ob die Rechnung aus einem XML kam oder von einem Blatt Papier.
 */
export interface Absenderzug {
  name: string;
  ustId?: string;
  steuernummer?: string;
  plz?: string;
}

/** Was eine Liste von einer Eingangsrechnung zeigt. */
export interface Uebersicht {
  nummer: string;
  absender: string;
  datum: string;
  faellig?: string;
  waehrung: string;
  brutto: number;
  /** Noch zu zahlen (BT-115), also Brutto abzueglich Anzahlungen. */
  zuZahlen: number;
  /** Fertig gesetzter Betrag, z.B. "1.190,00 EUR". */
  betrag: string;
  /** Dokumentart nach BT-3. Beim Foto immer "380". */
  typ: string;
}

/** Kennung fuer eine neue Eingangsrechnung. */
export function neueEingangId(jetzt = new Date(), zufall = Math.random): string {
  return `er_${jetzt.getTime().toString(36)}_${zufall().toString(36).slice(2, 7)}`;
}

/** Kennung fuer einen neuen Lieferanten. */
export function neueLieferantId(jetzt = new Date(), zufall = Math.random): string {
  return `lf_${jetzt.getTime().toString(36)}_${zufall().toString(36).slice(2, 7)}`;
}

/**
 * Uebertraegt eine eingelesene E-Rechnung in einen behaltbaren Vorgang.
 *
 * Ohne Kennung, ohne Datei und ohne Lieferanten: Das setzt die Ablage
 * darueber. Diese Funktion rechnet nur und urteilt - sie laesst sich deshalb
 * pruefen, ohne dass irgendwo ein Speicher laeuft.
 */
export function ausEInvoice(
  gelesen: ReceivedInvoice,
  dateiname: string,
  jetzt = new Date(),
): Omit<Eingangsrechnung, 'id' | 'anlage' | 'lieferantId' | 'bezahltAm' | 'notiz'> {
  const zeit = jetzt.toISOString();
  return {
    quelle: {
      art: 'erechnung',
      invoice: gelesen.invoice,
      ausgewiesen: gelesen.declaredTotals,
      syntax: gelesen.syntax,
      ...(gelesen.profileId ? { profileId: gelesen.profileId } : {}),
      kind: gelesen.kind,
    },
    hinweise: hinweiseAus(gelesen),
    dateiname,
    createdAt: zeit,
    updatedAt: zeit,
  };
}

/**
 * Uebertraegt eine abfotografierte Papierrechnung in einen Vorgang.
 *
 * Die Felder kommen aus der Texterkennung und sind vom Nutzer bestaetigt -
 * deshalb nimmt diese Funktion eine fertige `Erfassung` und keinen Rohtext.
 * Das Lesen steht in `papier.ts`, das Bestaetigen in der Oberflaeche, und
 * genau dazwischen liegt die Stelle, an der ein Mensch hingesehen haben muss.
 */
export function ausFoto(
  erfasst: Erfassung,
  bild: { dateiname: string; zuversicht: number; text: string },
  jetzt = new Date(),
): Omit<Eingangsrechnung, 'id' | 'anlage' | 'lieferantId' | 'bezahltAm' | 'notiz'> {
  const zeit = jetzt.toISOString();
  const hinweise: string[] = [];

  /*
   * Die einzige Rechenprobe, die ein Foto zulaesst: Netto plus Steuer muss
   * Brutto ergeben. Geht sie nicht auf, hat die Erkennung eine Zahl erwischt,
   * die woanders hingehoerte - das kommt bei Rabattzeilen und Zwischensummen
   * staendig vor und faellt sonst erst beim Bezahlen auf.
   */
  if (erfasst.netto !== undefined && erfasst.steuer !== undefined) {
    const summe = round(erfasst.netto + erfasst.steuer);
    if (Math.abs(summe - erfasst.brutto) > 0.02) {
      hinweise.push(
        `Netto und Steuer ergeben ${summe.toFixed(2)}, als Rechnungsbetrag steht ${erfasst.brutto.toFixed(2)} da.`,
      );
    }
  }

  return {
    quelle: { art: 'foto', erfasst, zuversicht: bild.zuversicht, text: bild.text },
    hinweise,
    dateiname: bild.dateiname,
    createdAt: zeit,
    updatedAt: zeit,
  };
}

/**
 * Was der Nutzer wissen muss, in Worten.
 *
 * Drei Quellen, bewusst zusammengefasst: Abweichungen zwischen ausgewiesener
 * und nachgerechneter Summe, Fehler aus der Pruefung und die Warnungen des
 * Lesers. Wer eine Rechnung bezahlen soll, will eine Liste sehen und nicht
 * drei Felder durchsuchen.
 *
 * Hinweise, nicht Ablehnungen: Eine Eingangsrechnung mit Maengeln ist
 * trotzdem eine Rechnung, die der Lieferant gestellt hat. Sie wegzuwerfen
 * waere das Letzte, was hilft.
 */
export function hinweiseAus(gelesen: ReceivedInvoice): string[] {
  const summen = gelesen.totalMismatches.map(
    (ab) =>
      `${ab.field}: im Dokument ${ab.declared.toFixed(2)}, nachgerechnet ${ab.computed.toFixed(2)}`,
  );
  const fehler = gelesen.issues
    .filter((frage) => frage.severity === 'error')
    .map((frage) => `${frage.rule}: ${frage.message}`);
  return [...summen, ...fehler, ...gelesen.warnings];
}

/** Die Werte fuer eine Liste oder einen Kopf - fuer beide Arten gleich. */
export function uebersicht(eingang: Eingangsrechnung): Uebersicht {
  const quelle = eingang.quelle;

  if (quelle.art === 'foto') {
    const erfasst = quelle.erfasst;
    return {
      nummer: erfasst.nummer,
      absender: erfasst.absender,
      datum: erfasst.datum,
      ...(erfasst.faellig ? { faellig: erfasst.faellig } : {}),
      waehrung: erfasst.waehrung,
      brutto: round(erfasst.brutto),
      zuZahlen: round(erfasst.brutto),
      betrag: formatAmount(round(erfasst.brutto), erfasst.waehrung),
      typ: '380',
    };
  }

  const rechnung = quelle.invoice;
  const nach = computeTotals(rechnung);
  const brutto = quelle.ausgewiesen.grandTotal ?? nach.grandTotal;
  const gezahlt = quelle.ausgewiesen.paidAmount ?? rechnung.paidAmount ?? 0;
  const zuZahlen = quelle.ausgewiesen.duePayable ?? round(brutto - gezahlt);
  return {
    nummer: rechnung.number,
    absender: rechnung.seller.tradingName || rechnung.seller.name,
    datum: rechnung.issueDate,
    ...(rechnung.dueDate ? { faellig: rechnung.dueDate } : {}),
    waehrung: rechnung.currency,
    brutto: round(brutto),
    zuZahlen: round(zuZahlen),
    betrag: formatAmount(round(zuZahlen), rechnung.currency),
    typ: String(rechnung.typeCode ?? '380'),
  };
}

/** Die Angaben, an denen der Absender wiedererkannt wird - aus beiden Arten. */
export function absenderzug(quelle: Quelle): Absenderzug {
  if (quelle.art === 'foto') {
    const erfasst = quelle.erfasst;
    return {
      name: erfasst.absender,
      ...(erfasst.ustId ? { ustId: erfasst.ustId } : {}),
      ...(erfasst.steuernummer ? { steuernummer: erfasst.steuernummer } : {}),
    };
  }
  return absenderzugAusParty(quelle.invoice.seller);
}

/** Derselbe Zug aus einer vollstaendigen Anschrift. */
export function absenderzugAusParty(party: Party): Absenderzug {
  return {
    name: party.name,
    ...(party.vatId ? { ustId: party.vatId } : {}),
    ...(party.taxNumber ? { steuernummer: party.taxNumber } : {}),
    ...(party.address?.postcode ? { plz: party.address.postcode } : {}),
  };
}
