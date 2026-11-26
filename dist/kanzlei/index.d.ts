import { a as Invoice, P as Party } from '../invoice-Diu1WYJB.js';
import { D as DeclaredTotals, d as InvoiceSyntax, h as SourceKind, a as Belegdaten, R as ReceivedInvoice, I as IsoDate, f as Skontostufe } from '../receive-R0DwACTW.js';
import 'zod';

/**
 * Was aus einem Foto gelesen und vom Nutzer bestaetigt wurde.
 *
 * Derselbe Satz Felder, den `liesBeleg` aus der Bibliothek vorschlaegt - hier
 * aber bestaetigt. Der Unterschied steht nicht im Typ, sondern im Weg: Was
 * hier ankommt, hat ein Mensch gegen das Blatt gehalten.
 */
type Erfassung = Belegdaten;
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
type Quelle = {
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
} | {
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
interface Eingangsrechnung {
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
interface Lieferant {
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
interface Absenderzug {
    name: string;
    ustId?: string;
    steuernummer?: string;
    plz?: string;
}
/** Was eine Liste von einer Eingangsrechnung zeigt. */
interface Uebersicht {
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
declare function neueEingangId(jetzt?: Date, zufall?: () => number): string;
/** Kennung fuer einen neuen Lieferanten. */
declare function neueLieferantId(jetzt?: Date, zufall?: () => number): string;
/**
 * Uebertraegt eine eingelesene E-Rechnung in einen behaltbaren Vorgang.
 *
 * Ohne Kennung, ohne Datei und ohne Lieferanten: Das setzt die Ablage
 * darueber. Diese Funktion rechnet nur und urteilt - sie laesst sich deshalb
 * pruefen, ohne dass irgendwo ein Speicher laeuft.
 */
declare function ausEInvoice(gelesen: ReceivedInvoice, dateiname: string, jetzt?: Date): Omit<Eingangsrechnung, 'id' | 'anlage' | 'lieferantId' | 'bezahltAm' | 'notiz'>;
/**
 * Uebertraegt eine abfotografierte Papierrechnung in einen Vorgang.
 *
 * Die Felder kommen aus der Texterkennung und sind vom Nutzer bestaetigt -
 * deshalb nimmt diese Funktion eine fertige `Erfassung` und keinen Rohtext.
 * Das Lesen steht in `papier.ts`, das Bestaetigen in der Oberflaeche, und
 * genau dazwischen liegt die Stelle, an der ein Mensch hingesehen haben muss.
 */
declare function ausFoto(erfasst: Erfassung, bild: {
    dateiname: string;
    zuversicht: number;
    text: string;
}, jetzt?: Date): Omit<Eingangsrechnung, 'id' | 'anlage' | 'lieferantId' | 'bezahltAm' | 'notiz'>;
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
declare function hinweiseAus(gelesen: ReceivedInvoice): string[];
/** Die Werte fuer eine Liste oder einen Kopf - fuer beide Arten gleich. */
declare function uebersicht(eingang: Eingangsrechnung): Uebersicht;
/** Die Angaben, an denen der Absender wiedererkannt wird - aus beiden Arten. */
declare function absenderzug(quelle: Quelle): Absenderzug;
/** Derselbe Zug aus einer vollstaendigen Anschrift. */
declare function absenderzugAusParty(party: Party): Absenderzug;

/**
 * Das Paket fuer die Kanzlei.
 *
 * ## Warum es das gibt
 *
 * Die Fotoerkennung nimmt das Abtippen ab, nicht das Abliefern. Der
 * Steuerberater braucht die Belege selbst, nicht die Zahlen daraus - und wer
 * sie bisher eingescannt und als ZIP geschickt hat, tut das danach immer
 * noch, nur mit einem zusaetzlichen Schritt davor. Erst dieses Paket macht
 * den alten Weg ueberfluessig: dieselbe Lieferung, aber aus dem, was ohnehin
 * schon abgelegt ist, und mit einer Liste, die sagt, was jedes Bild ist.
 *
 * ## Was es nicht ist
 *
 * Kein Buchungsstapel. Hier wird nichts kontiert und kein Konto geraten -
 * die Liste sagt, was auf dem Beleg steht, und die Kanzlei bucht. Der Weg
 * ueber DATEV-Kreditorenbuchungen ist in docs/eingang.md als naechster
 * Schritt vermerkt, mit dem Grund, warum er eigenstaendig geprueft gehoert.
 */
interface Zeitraum {
    /** Fruehester Beleg, ISO-Datum. Ohne Angabe: alles. */
    von?: IsoDate;
    /** Spaetester Beleg, ISO-Datum. */
    bis?: IsoDate;
}
interface Paketstueck {
    /** Name im Archiv, z.B. "2026-11-12_Elektro-Brandt_2026-0417.jpg". */
    name: string;
    eingang: Eingangsrechnung;
}
interface Paketplan {
    stuecke: Paketstueck[];
    /** Vorgaenge im Zeitraum, zu denen kein Original abgelegt ist. */
    ohneOriginal: Eingangsrechnung[];
    /** Die Liste als CSV, Semikolon getrennt. */
    liste: string;
    /** Was in der Beilage steht. */
    liesmich: string;
    /** Vorschlag fuer den Dateinamen des Archivs. */
    archivname: string;
}
/** Nur die Vorgaenge im Zeitraum, nach Belegdatum sortiert. */
declare function imZeitraum(rechnungen: readonly Eingangsrechnung[], zeitraum?: Zeitraum): Eingangsrechnung[];
/**
 * Ein Dateiname, den jedes Dateisystem und jedes Mailprogramm vertraegt.
 *
 * Umlaute werden umgeschrieben statt entfernt - "Mueller" findet man wieder,
 * "Mller" nicht. Alles andere ausser Ziffern, Buchstaben, Strich und Punkt
 * faellt weg: Ein Schraegstrich in einer Rechnungsnummer wuerde im Archiv
 * einen Ordner aufmachen, und ein Doppelpunkt macht Windows unbrauchbar.
 */
declare function dateiname(text: string): string;
/**
 * Die Liste zum Paket.
 *
 * Semikolon und deutsche Zahlen ohne Tausenderpunkt: So liest es jedes
 * Tabellenprogramm in einer deutschen Einstellung ohne Nachfrage, und die
 * Kanzleisoftware ebenso. Die Spalte "Herkunft" ist kein Schmuck - sie sagt,
 * ob die Zahlen aus einem Datensatz stammen oder von einem Foto, und das ist
 * fuer jeden, der danach bucht, der wichtigste Unterschied.
 */
declare function liste(stuecke: readonly Paketstueck[], lieferanten: readonly Lieferant[]): string;
/** Die Beilage, die erklaert, was in dem Paket liegt. */
declare function liesmich(plan: Omit<Paketplan, 'liesmich'>, erzeugtAm: string, zeitraum?: Zeitraum): string;
/**
 * Plant das Paket: welche Datei wie heisst, was in der Liste steht.
 *
 * Rein - gepackt wird woanders, denn dafuer braucht es die Originale aus der
 * Ablage. So laesst sich der ganze Inhalt pruefen, ohne eine Datei anzufassen.
 */
declare function paketplan(rechnungen: readonly Eingangsrechnung[], lieferanten: readonly Lieferant[], zeitraum?: Zeitraum, jetzt?: Date, hatOriginal?: (eingang: Eingangsrechnung) => boolean): Paketplan;
/** Wie viele Belege, wie viel Geld - fuer den Knopf, bevor jemand packt. */
declare function paketumfang(rechnungen: readonly Eingangsrechnung[], zeitraum?: Zeitraum, stichtag?: string): {
    anzahl: number;
    offen: number;
};

/**
 * Der Zahlungsstand einer Eingangsrechnung.
 *
 * Drei Werte, und keiner davon wird geraten: `bezahlt` setzt der Nutzer,
 * `ueberfaellig` ergibt sich aus BT-9, und alles andere ist `offen`.
 *
 * Fehlt BT-9, bleibt es `offen` - auch nach Monaten. Eine Frist zu erfinden,
 * die auf der Rechnung nicht steht, waere eine Behauptung ueber einen
 * Vorgang, den wir nicht beurteilen koennen: Wann eine Forderung faellig
 * wird, haengt an Vertrag und Zugang, nicht am Dokument. Angezeigt wird
 * stattdessen, dass die Rechnung kein Zahlungsziel nennt.
 */
type Zahlungsstand = 'offen' | 'ueberfaellig' | 'bezahlt';
/** Heute als ISO-Datum, ohne Uhrzeit. */
declare function heute(jetzt?: Date): IsoDate;
/**
 * Tage von einem Datum zum anderen. Negativ, wenn das Ziel vorbei ist.
 *
 * Gerechnet wird in UTC-Mitternacht, nicht mit der Ortszeit: Sonst haengt die
 * Zahl davon ab, ob die App gerade in der Sommerzeit laeuft, und eine Frist
 * schnappt eine Stunde zu frueh oder zu spaet um.
 */
declare function tageBis(ziel: string, ab: string): number;
/** Der Stand einer einzelnen Rechnung - fuer E-Rechnung und Foto gleich. */
declare function zahlungsstand(eingang: Eingangsrechnung, stichtag?: string): Zahlungsstand;
/** Wie viele Tage ueberfaellig? 0, wenn nicht ueberfaellig. */
declare function ueberfaelligTage(eingang: Eingangsrechnung, stichtag?: string): number;
interface Skontochance {
    stufe: Skontostufe;
    /** Letzter Tag, an dem der Abzug gilt - aus Rechnungsdatum plus Tagen. */
    bis: IsoDate;
    /** Tage bis dahin. 0 heisst: heute ist der letzte Tag. */
    tage: number;
    /** Was der Abzug ausmacht, in der Waehrung der Rechnung. */
    betrag: number;
    /** Was dann noch zu zahlen ist. */
    zahlbetrag: number;
}
/**
 * Lohnt sich hier noch ein Skontoabzug?
 *
 * Das ist der Grund, warum sich das Behalten einer Eingangsrechnung
 * ueberhaupt lohnt: Skonto hat in EN 16931 kein eigenes Feld, es steht als
 * Text in BT-20 - und die Bibliothek liest die Schreibweise der XRechnung
 * strukturiert aus. Wer die Rechnung nur ansieht und wegklickt, verliert zwei
 * Prozent, weil niemand die Frist im Blick hatte.
 *
 * Von mehreren Stufen gewinnt die, die heute noch erreichbar ist und am
 * meisten bringt - nicht die erste in der Liste. Eine abgelaufene Stufe
 * zaehlt nicht mehr.
 */
declare function skontochance(eingang: Eingangsrechnung, stichtag?: string): Skontochance | undefined;
interface Offenstand {
    waehrung: string;
    /** Summe der noch zu zahlenden Betraege. */
    summe: number;
    anzahl: number;
    /** Davon ueberfaellig. */
    ueberfaellig: number;
}
/**
 * Was insgesamt offen ist, je Waehrung.
 *
 * Je Waehrung und nicht als eine Zahl: Betraege in Franken und Euro zu
 * addieren ergaebe eine Summe, die es nicht gibt. Einen Kurs anzuwenden waere
 * schlimmer - der Stand von heute gehoert nicht in eine Uebersicht ueber
 * Rechnungen von vorletztem Monat.
 */
declare function offeneSummen(rechnungen: readonly Eingangsrechnung[], stichtag?: string): Offenstand[];

export { type Absenderzug, type Eingangsrechnung, type Erfassung, type Lieferant, type Offenstand, type Paketplan, type Paketstueck, type Quelle, type Skontochance, type Uebersicht, type Zahlungsstand, type Zeitraum, absenderzug, absenderzugAusParty, ausEInvoice, ausFoto, dateiname, heute, hinweiseAus, imZeitraum, liesmich, liste, neueEingangId, neueLieferantId, offeneSummen, paketplan, paketumfang, skontochance, tageBis, ueberfaelligTage, uebersicht, zahlungsstand };
