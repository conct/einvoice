import { z } from 'zod';
import { a as Invoice } from './invoice-Diu1WYJB.js';

/**
 * Datumsangaben werden durchgaengig als ISO-Kalendertag "YYYY-MM-DD" gehalten.
 * Kein Date-Objekt, keine Zeitzone - eine Rechnung vom 31.12. darf nicht durch
 * UTC-Verschiebung zum 30.12. werden.
 */
type IsoDate = string;
declare function isIsoDate(value: unknown): value is IsoDate;
/** CII nutzt das Format 102: YYYYMMDD. */
declare function toCiiDate(value: IsoDate): string;
/** Anzeigeformat fuer das PDF: 31.12.2026 */
declare function formatDate(value: IsoDate): string;
/** Kalendertage auf ein ISO-Datum addieren (fuer Zahlungsziele). */
declare function addDays(value: IsoDate, days: number): IsoDate;

/**
 * Skonto - der Abzug fuer schnelle Zahlung.
 *
 * ## Warum das ein eigenes Modul braucht
 *
 * EN 16931 kennt kein Feld fuer Skonto. Es gibt nur BT-20, die
 * Zahlungsbedingungen als **Fliesstext** - und Fliesstext liest keine
 * Buchhaltungssoftware aus. Deshalb hat die KoSIT fuer die XRechnung eine
 * Schreibweise festgelegt, die in diesem Text steht und sich trotzdem
 * maschinell lesen laesst:
 *
 * ```
 * #SKONTO#TAGE=14#PROZENT=2.00#
 * #SKONTO#TAGE=30#PROZENT=1.00#BASISBETRAG=1000.00#
 * Zahlbar ohne Abzug bis zum 31.12.2026.
 * ```
 *
 * Jede Stufe steht in einer eigenen Zeile, beginnt mit `#SKONTO#` und endet
 * auf `#`. Prozent traegt zwei Nachkommastellen mit **Punkt**, nicht mit
 * Komma - das ist eine Maschinenangabe, keine Anzeige. Freier Text darf
 * folgen; was keine Skontozeile ist, bleibt Text.
 *
 * ## Was hier bewusst nicht passiert
 *
 * **Der Abzug wird nicht verrechnet.** Die Rechnung weist den vollen Betrag
 * aus, und der Skonto ist ein Angebot: Zahlt der Empfaenger spaeter, gilt der
 * volle Betrag. Wer den Abzug in die Summen einrechnete, haette eine Rechnung
 * ueber einen Betrag, der nur unter einer Bedingung stimmt - und die Summen
 * muessen ohne Bedingung stimmen, sonst scheitert jede Pruefung.
 *
 * **Die Umsatzsteuer bleibt unberuehrt.** Wird der Abzug tatsaechlich genutzt,
 * mindert das die Bemessungsgrundlage nachtraeglich (§ 17 UStG). Das ist ein
 * Vorgang in der Buchhaltung, kein Feld in diesem Dokument.
 */
/** Eine Skontostufe: so viele Tage, so viel Prozent. */
declare const SkontostufeSchema: z.ZodObject<{
    /** Tage ab Rechnungsdatum. Ganzzahlig und groesser als null. */
    tage: z.ZodNumber;
    /**
     * Abzug in Prozent, groesser als null und hoechstens hundert.
     *
     * Hundert ist als Grenze absurd hoch und steht trotzdem hier: Alles
     * darueber ist mit Sicherheit ein Tippfehler - 200 statt 2,00 -, und ein
     * Tippfehler in dieser Zahl kostet Geld.
     */
    prozent: z.ZodNumber;
    /**
     * Betrag, auf den sich der Abzug bezieht. Ohne Angabe der Zahlbetrag.
     *
     * Noetig, wenn nur ein Teil skontierfaehig ist - Fracht und Montage sind es
     * nach vielen Einkaufsbedingungen nicht.
     */
    basisbetrag: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    tage: number;
    prozent: number;
    basisbetrag?: number | undefined;
}, {
    tage: number;
    prozent: number;
    basisbetrag?: number | undefined;
}>;
type Skontostufe = z.infer<typeof SkontostufeSchema>;
/**
 * Eine Stufe in der Schreibweise der XRechnung.
 *
 * Zwei Nachkommastellen, Punkt als Trenner, und am Ende ein `#`. Das ist
 * nicht schoen, aber es ist die Form, die ein Empfaenger erwartet.
 */
declare function skontozeile(stufe: Skontostufe): string;
/**
 * Der vollstaendige Inhalt von BT-20: erst die Stufen, dann der freie Text.
 *
 * Die Reihenfolge ist Absicht. Ein Empfaenger, der die Zeilen maschinell
 * liest, findet sie am Anfang; ein Mensch liest den Satz darunter.
 */
declare function zahlungsbedingungen(angabe: {
    terms?: string | undefined;
    skonto?: readonly Skontostufe[] | undefined;
}): string | undefined;
/**
 * Macht aus BT-20 wieder Stufen und Text.
 *
 * Gelesen wird nachsichtig - fremde Dateien halten sich nicht immer an die
 * Schreibweise: Gross- und Kleinschreibung ist gleich, Leerzeichen um die
 * Zeichen werden uebergangen, und eine Zeile, die wie Skonto aussieht aber
 * unbrauchbare Zahlen traegt, bleibt Text. Lieber ein Satz zu viel im
 * Fliesstext als eine erfundene Zahl im Modell.
 */
declare function liesZahlungsbedingungen(bt20: string | undefined): {
    skonto?: Skontostufe[];
    terms?: string;
};
/** Was die Stufe in Geld bedeutet, bezogen auf den Zahlbetrag. */
declare function skontobetrag(stufe: Skontostufe, zahlbetrag: number): number;
/** Der Tag, bis zu dem die Stufe gilt. */
declare function skontofrist(stufe: Skontostufe, rechnungsdatum: IsoDate): IsoDate;
/**
 * Derselbe Inhalt als Satz, den ein Mensch lesen kann.
 *
 * "Bei Zahlung bis 07.12.2026 abzueglich 2 % Skonto (2,38 EUR) = 116,62 EUR,
 * sonst bis 21.12.2026 ohne Abzug."
 *
 * Beide Betraege stehen dabei, und das ist der Punkt: Niemand rechnet zwei
 * Prozent im Kopf, und wer sie falsch rechnet, zahlt falsch. Der Abzug sagt,
 * was der Nachlass wert ist; die Summe dahinter sagt, was zu ueberweisen ist.
 */
declare function skontosatz(stufen: readonly Skontostufe[], angabe: {
    rechnungsdatum: IsoDate;
    zahlbetrag: number;
    waehrung?: string | undefined;
    faelligAm?: IsoDate | undefined;
}): string | undefined;

type Severity = 'error' | 'warning';
interface ValidationIssue {
    /** Regelkennung der EN 16931 bzw. der XRechnung-CIUS, z.B. "BR-DE-15" */
    rule: string;
    severity: Severity;
    /** Betroffenes Feld im Datenmodell, Punktnotation */
    path: string;
    message: string;
}
interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}
/**
 * Fachliche Pruefung nach EN 16931 und XRechnung-CIUS.
 *
 * Bewusst nur die Regeln, die im Erfassungsdialog sofort ruecklaufen sollen -
 * die vollstaendige Schematron-Pruefung des KoSIT-Validators bleibt die
 * verbindliche Instanz und laeuft serverseitig bzw. in der CI.
 */
declare function validateInvoice(invoice: Invoice): ValidationResult;
/** BR-CO-09: Laenderpraefix plus alphanumerische Kennung */
declare function isPlausibleVatId(value: string): boolean;
/** IBAN-Pruefsumme nach ISO 7064 Mod 97-10 */
declare function isPlausibleIban(value: string): boolean;
/**
 * Grobstruktur der Leitweg-ID: Grobadressierung, optional Feinadressierung,
 * Pruefziffer. Die echte Pruefziffernlogik der KoSIT bleibt dem Validator
 * vorbehalten, hier geht es nur um einen frueh sichtbaren Tippfehlerhinweis.
 */
declare function isPlausibleLeitwegId(value: string): boolean;

interface ExtractedAttachment {
    filename: string;
    mimeType?: string;
    /** AFRelationship: Alternative kennzeichnet die gleichwertige XML-Darstellung */
    relationship?: string;
    description?: string;
    data: Uint8Array;
}
/**
 * Liest alle eingebetteten Dateien aus einem PDF.
 *
 * Der Namensbaum EmbeddedFiles darf beliebig tief verschachtelt sein; grosse
 * Erzeuger nutzen das kaum, aber ein Empfangsmodul muss damit rechnen.
 */
declare function extractAttachments(pdf: Uint8Array): Promise<ExtractedAttachment[]>;
/**
 * Holt die XML-Rechnung aus einem hybriden PDF. Bevorzugt die bekannten
 * Dateinamen, faellt dann auf den Anhang mit AFRelationship "Alternative"
 * zurueck und zuletzt auf die erste XML-Datei ueberhaupt.
 */
declare function extractInvoiceXml(pdf: Uint8Array): Promise<{
    filename: string;
    xml: string;
} | undefined>;

type InvoiceSyntax = 'cii' | 'ubl';
interface DeclaredTotals {
    lineTotal?: number;
    taxBasisTotal?: number;
    taxTotal?: number;
    grandTotal?: number;
    paidAmount?: number;
    duePayable?: number;
}
interface ParsedInvoice {
    /** Das gelesene Dokument im internen Modell */
    invoice: Invoice;
    syntax: InvoiceSyntax;
    /** BT-24 Spezifikationskennung, verrät Profil und Version */
    profileId?: string;
    /**
     * Die im Dokument stehenden Summen. Sie werden nicht nachgerechnet: weicht
     * computeTotals() davon ab, stimmt etwas nicht - genau das soll ein
     * Empfangsmodul sichtbar machen, statt es stillschweigend zu korrigieren.
     */
    declaredTotals: DeclaredTotals;
    warnings: string[];
}
/** Erkennt die Syntax am Wurzelelement und liest das Dokument ein. */
declare function parseInvoiceXml(xml: string): ParsedInvoice;

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
type Sicherheit = 
/** Ein Verfahren bestaetigt es - etwa die IBAN-Pruefsumme. */
'geprueft'
/** Die Form stimmt, geprueft ist sie nicht. */
 | 'muster'
/** Aus der Umgebung geschlossen. */
 | 'geraten';
type Belegfeld = 'nummer' | 'datum' | 'faellig' | 'absender' | 'waehrung' | 'brutto' | 'netto' | 'steuer' | 'iban' | 'ustId' | 'steuernummer';
interface Belegfund {
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
interface Belegdaten {
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
interface Belegbefund {
    funde: Belegfund[];
    /** Was auffiel, ohne dass es ein Fehler waere. */
    hinweise: string[];
    /**
     * Der Vorschlag fuer die Oberflaeche. Unvollstaendig, wo nichts gefunden
     * wurde - die fehlenden Felder traegt der Nutzer nach.
     */
    vorschlag: Partial<Belegdaten>;
}
/**
 * Eine Zahl aus einem Textstueck.
 *
 * Deutsche und englische Schreibweise: "1.234,56" und "1,234.56" und
 * "1234.56". Entschieden wird am letzten Trennzeichen - was danach kommt und
 * hoechstens zwei Stellen hat, sind Cent.
 */
declare function betragAus(text: string): number | undefined;
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
declare function betragAmZeilenende(zeile: string): number | undefined;
/**
 * Ein Datum aus einem Textstueck, als ISO-Datum.
 *
 * Deutsche Schreibweise zuerst, weil die Belege deutsch sind: 7.9.2026,
 * 07.09.26. Zweistellige Jahre werden ins laufende Jahrhundert gelegt - eine
 * Rechnung von 1926 wird niemand einlesen.
 */
declare function datumAus(text: string): IsoDate | undefined;
/** Liest einen Beleg aus dem erkannten Text. */
declare function liesBeleg(text: string, heute?: IsoDate): Belegbefund;
/**
 * Reicht das zum Behalten?
 *
 * Nummer, Datum, Absender und Betrag. Weniger ergibt keinen Vorgang, den man
 * spaeter wiederfindet - und einen Beleg ohne Betrag in eine Liste offener
 * Rechnungen zu stellen, waere schlimmer als gar keine Liste.
 */
declare function vollstaendig(erfassung: Partial<Belegdaten>): erfassung is Belegdaten;

type SourceKind = 'pdf-hybrid' | 'xml' | 'pdf-without-xml' | 'unknown';
interface ReceivedInvoice extends ParsedInvoice {
    kind: SourceKind;
    /** Dateiname der XML-Quelle, bei hybriden PDF der Name des Anhangs */
    sourceFilename?: string;
    /** Weitere Anhaenge des PDF, z.B. Stundennachweise */
    attachments: ExtractedAttachment[];
    /** Abweichungen zwischen den Summen im Dokument und der Nachrechnung */
    totalMismatches: Array<{
        field: string;
        declared: number;
        computed: number;
    }>;
    issues: ValidationIssue[];
}
/**
 * Liest eine empfangene E-Rechnung ein - hybrides PDF oder reines XML.
 *
 * Seit dem 1. Januar 2025 muss jedes Unternehmen in Deutschland E-Rechnungen
 * entgegennehmen koennen. Fuer den Empfang zaehlt nicht das Bild, sondern das
 * XML: die Funktion liefert deshalb immer das strukturierte Dokument und
 * meldet, wenn die im Dokument genannten Summen nicht aufgehen.
 */
declare function readEInvoice(bytes: Uint8Array, filename?: string): Promise<ReceivedInvoice>;
/** Formaterkennung anhand der ersten Bytes, nicht anhand der Dateiendung. */
declare function detectKind(bytes: Uint8Array): SourceKind;

export { skontofrist as A, type Belegbefund as B, skontosatz as C, type DeclaredTotals as D, type ExtractedAttachment as E, skontozeile as F, toCiiDate as G, validateInvoice as H, type IsoDate as I, vollstaendig as J, zahlungsbedingungen as K, type ParsedInvoice as P, type ReceivedInvoice as R, type Severity as S, type ValidationIssue as V, type Belegdaten as a, type Belegfeld as b, type Belegfund as c, type InvoiceSyntax as d, type Sicherheit as e, type Skontostufe as f, SkontostufeSchema as g, type SourceKind as h, type ValidationResult as i, addDays as j, betragAmZeilenende as k, betragAus as l, datumAus as m, detectKind as n, extractAttachments as o, extractInvoiceXml as p, formatDate as q, isIsoDate as r, isPlausibleIban as s, isPlausibleLeitwegId as t, isPlausibleVatId as u, liesBeleg as v, liesZahlungsbedingungen as w, parseInvoiceXml as x, readEInvoice as y, skontobetrag as z };
