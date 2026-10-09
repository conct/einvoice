import { V as Vat, I as Invoice, L as Line, b as InvoiceInput } from './invoice-BoN0H4V6.js';
export { A as Address, c as AddressSchema, d as AllowanceCharge, e as AllowanceChargeSchema, f as Attachment, g as AttachmentSchema, C as ContactSchema, E as ElectronicAddressSchema, a as InvoiceProfile, h as InvoiceProfileSchema, i as InvoiceSchema, j as LineSchema, P as Party, k as PartySchema, l as Payment, m as PaymentSchema, n as VatSchema, p as parseInvoice } from './invoice-BoN0H4V6.js';
import { RGB, PDFFont, rgb, PDFDocument, PDFPage } from 'pdf-lib';
import 'zod';

/**
 * Codelisten nach EN 16931 / UN/CEFACT. Nur die fuer deutsche Rechnungen
 * praktisch relevanten Eintraege - die vollen Listen sind riesig und werden
 * bei Bedarf ergaenzt.
 */
/** BT-3 Rechnungsart (UNTDID 1001) */
declare const INVOICE_TYPE_CODES: {
    /** Handelsrechnung */
    readonly COMMERCIAL_INVOICE: "380";
    /** Gutschrift / Stornorechnung */
    readonly CREDIT_NOTE: "381";
    /** Korrigierte Rechnung */
    readonly CORRECTED_INVOICE: "384";
    /** Selbstfakturierung (Gutschriftverfahren nach §14 Abs. 2 UStG) */
    readonly SELF_BILLED_INVOICE: "389";
    /** Vorausrechnung / Abschlagsrechnung */
    readonly PREPAYMENT_INVOICE: "386";
};
type InvoiceTypeCode = (typeof INVOICE_TYPE_CODES)[keyof typeof INVOICE_TYPE_CODES];
/** BT-95/BT-102/BT-118 Umsatzsteuerkategorie (UNTDID 5305) */
declare const VAT_CATEGORY: {
    /** Regelsteuersatz / ermaessigter Satz */
    readonly STANDARD: "S";
    /** Nullsatz */
    readonly ZERO: "Z";
    /** Steuerbefreit (z.B. §4 UStG, §19 UStG Kleinunternehmer) */
    readonly EXEMPT: "E";
    /** Reverse Charge (§13b UStG) */
    readonly REVERSE_CHARGE: "AE";
    /** Innergemeinschaftliche Lieferung */
    readonly INTRA_COMMUNITY: "K";
    /** Ausfuhrlieferung ausserhalb EU */
    readonly EXPORT: "G";
    /** Nicht im Anwendungsbereich der Steuer */
    readonly OUT_OF_SCOPE: "O";
};
type VatCategoryCode = (typeof VAT_CATEGORY)[keyof typeof VAT_CATEGORY];
/** Kategorien, bei denen der Satz zwingend 0 ist und ein Befreiungsgrund gehoert */
declare const ZERO_RATE_CATEGORIES: VatCategoryCode[];
/** BT-81 Zahlungsart (UNTDID 4461) */
declare const PAYMENT_MEANS: {
    /** Nicht definiert */
    readonly NOT_DEFINED: "1";
    /** Barzahlung */
    readonly CASH: "10";
    /** Scheck */
    readonly CHEQUE: "20";
    /** Ueberweisung */
    readonly CREDIT_TRANSFER: "30";
    /** SEPA-Ueberweisung */
    readonly SEPA_CREDIT_TRANSFER: "58";
    /** SEPA-Lastschrift */
    readonly SEPA_DIRECT_DEBIT: "59";
    /** Kreditkarte */
    readonly CARD: "48";
    /** Verrechnung / bereits bezahlt */
    readonly SET_OFF: "97";
};
type PaymentMeansCode = (typeof PAYMENT_MEANS)[keyof typeof PAYMENT_MEANS];
/** BT-130 Mengeneinheit (UN/ECE Rec. 20) - haeufigste */
declare const UNIT: {
    /** Stueck */
    readonly PIECE: "C62";
    /** Stunde */
    readonly HOUR: "HUR";
    /** Tag */
    readonly DAY: "DAY";
    /** Monat */
    readonly MONTH: "MON";
    /** Kilogramm */
    readonly KILOGRAM: "KGM";
    /** Meter */
    readonly METRE: "MTR";
    /** Quadratmeter */
    readonly SQUARE_METRE: "MTK";
    /** Liter */
    readonly LITRE: "LTR";
    /** Pauschal / Einheit */
    readonly LUMP_SUM: "LS";
    /** Kilometer */
    readonly KILOMETRE: "KMT";
};
type UnitCode = (typeof UNIT)[keyof typeof UNIT];
/** BT-34/BT-49 Schema der elektronischen Adresse (EAS) */
declare const EAS: {
    /** Deutsche Leitweg-ID */
    readonly LEITWEG_ID: "0204";
    /** GLN */
    readonly GLN: "0088";
    /** E-Mail */
    readonly EMAIL: "EM";
    /** Umsatzsteuer-Identnummer */
    readonly VAT_ID: "9930";
};
/**
 * Kennung des Rechnungsprofils (BT-24). Nur ab EN 16931 aufwaerts handelt es
 * sich um eine echte E-Rechnung im Sinne des Wachstumschancengesetzes -
 * MINIMUM und BASIC WL sind lediglich Buchungshilfen.
 *
 * ACHTUNG: Diese Konstanten sind der gebuendelte Rueckfall. Die Erzeuger lesen
 * die Kennung aus activeSpecifications() in model/specifications.ts, damit ein
 * Versionssprung der KoSIT nicht erst mit dem naechsten App-Update ankommt.
 * Nicht direkt in neuem Code verwenden.
 */
declare const PROFILE_ID: {
    readonly ZUGFERD_EN16931: "urn:cen.eu:en16931:2017";
    readonly ZUGFERD_EXTENDED: "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended";
    readonly XRECHNUNG_CIUS: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
};

/** Ein Eintrag der Umsatzsteueraufschluesselung, BG-23 */
interface VatBreakdownEntry {
    /** BT-118 Kategorie */
    category: Vat['category'];
    /** BT-119 Satz in Prozent */
    rate: number;
    /** BT-116 Bemessungsgrundlage */
    taxableAmount: number;
    /** BT-117 Steuerbetrag */
    taxAmount: number;
    /** BT-120 Grund der Befreiung */
    exemptionReason?: string;
    /** BT-121 codierter Grund der Befreiung */
    exemptionReasonCode?: string;
}
/** Ergebnis der Rechnungsrechnung, BG-22 */
interface InvoiceTotals {
    /** BT-131 je Position, in Reihenfolge der Positionen */
    lineAmounts: number[];
    /** BT-106 Summe der Positionsnettobetraege */
    lineTotal: number;
    /** BT-107 Summe der Abschlaege auf Dokumentebene */
    allowanceTotal: number;
    /** BT-108 Summe der Zuschlaege auf Dokumentebene */
    chargeTotal: number;
    /** BT-109 Gesamtsumme netto */
    taxBasisTotal: number;
    /** BT-110 Gesamtbetrag der Umsatzsteuer */
    taxTotal: number;
    /** BT-112 Bruttobetrag */
    grandTotal: number;
    /** BT-113 bereits gezahlt */
    paidAmount: number;
    /** BT-114 Rundungsbetrag */
    roundingAmount: number;
    /** BT-115 Zahlbetrag */
    duePayable: number;
    vatBreakdown: VatBreakdownEntry[];
}
/**
 * BT-131: Menge mal Einzelpreis, bezogen auf die Preisbasismenge, danach die
 * Zu- und Abschlaege der Position. Es wird erst am Ende gerundet, damit
 * Stueckpreise mit vier Nachkommastellen nicht vorzeitig Cents verlieren.
 */
declare function lineNetAmount(line: Line): number;
/**
 * Rechnet die komplette Rechnung nach den BR-CO-Regeln der EN 16931 durch.
 * Die Steuer wird je Kategorie/Satz-Gruppe berechnet, nicht je Position -
 * das ist der haeufigste Grund fuer Cent-Abweichungen in fremden Erzeugern.
 */
declare function computeTotals(invoice: Invoice): InvoiceTotals;
/** Kurzform fuer Debug-Ausgaben und Testvergleiche */
declare function summarizeTotals(totals: InvoiceTotals): string;

/**
 * Erkennt eine Rechnung ohne Umsatzsteuerausweis nach Paragraf 19 UStG.
 *
 * Warum das hier steht und nicht als Schalter im Profil: Der Haken
 * "Kleinunternehmer" in den Einstellungen ist eine Voreinstellung fuer neue
 * Entwuerfe, keine Schranke. Jeder kann ihn setzen, niemand prueft ihn. Ein
 * kostenloser Zugang, der daran haengt, waere kostenlos fuer jeden, der ein
 * Kaestchen ankreuzt.
 *
 * Diese Pruefung fragt stattdessen das Dokument: Weist es Umsatzsteuer aus
 * oder nicht? Das ist nachrechenbar und laesst sich nicht behaupten.
 *
 * Und sie traegt sich selbst: Wer regelbesteuert ist, kann diesen Weg nicht
 * benutzen, ohne Rechnungen ohne Umsatzsteuer auszustellen - das kostet den
 * eigenen Steuerausweis und dem Kunden den Vorsteuerabzug. Die Schranke steht
 * nicht in der App, sondern im Steuerrecht. Deshalb haelt sie ohne Kontrolle.
 *
 * Bewusst eng gefasst: Verlangt werden Kategorie E, Satz null und ein
 * Befreiungsgrund an *jeder* Position. Eine Rechnung, die auch nur eine
 * Position mit Umsatzsteuer enthaelt, faellt heraus - ebenso eine mit
 * innergemeinschaftlicher Lieferung (AE) oder Reverse Charge, denn das sind
 * andere Befreiungen und andere Zielgruppen.
 */
declare function istKleinunternehmerRechnung(invoice: Invoice): boolean;

/**
 * Leitet aus einer herausgegebenen Rechnung das Folgedokument ab.
 *
 * Warum es das braucht: Mit dem Festschreiben ist eine Rechnung gesperrt - das
 * verlangt die Unveraenderbarkeit nach GoBD. Wer sich vertan hat, storniert
 * oder korrigiert. Die App sagt das dem Nutzer bereits; ohne diese Funktion
 * war der erste Tippfehler nach dem Festschreiben eine Sackgasse.
 *
 * Beide Wege erben Absender, Empfaenger und Positionen und verweisen auf die
 * Ursprungsrechnung (BT-25/BT-26). Die Regel dazu steht in validate.ts: Ohne
 * diesen Verweis kann der Empfaenger die Korrektur nicht zuordnen.
 *
 * **Die Betraege bleiben positiv.** Das Vorzeichen traegt die Dokumentart, wie
 * die EN 16931 es vorsieht: 381 sagt dem Empfaenger, dass er den Betrag
 * gutschreibt. Betraege zusaetzlich zu negieren waere eine doppelte Verneinung
 * - der Empfaenger bekaeme eine Gutschrift ueber minus 640 Euro und wuesste
 * nicht, in welche Richtung sie wirkt. Nachgemessen am 25.08.2026 gegen
 * Mustang und den KoSIT-Validator.
 */
type Folgeart = 'storno' | 'korrektur';
declare function folgedokument(invoice: Invoice, art: Folgeart, heute: string): InvoiceInput;

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
 * Spezifikationskennungen mit Verfallsdatum.
 *
 * Das Problem, das dieses Modul loest: Die Kennung nach BT-24 wird in jedes
 * erzeugte Dokument geschrieben, und sie ist versionsgebunden. Steht sie fest
 * im App-Bundle, schreibt eine App, die ein Jahr nicht aktualisiert wurde, nach
 * einem Versionssprung eine veraltete Kennung in jede Rechnung - und der
 * Empfaenger lehnt sie ab. Der Nutzer merkt davon nichts, bis das Geld ausbleibt.
 *
 * Deshalb ist die Kennung hier Daten und keine Konstante: die gebuendelte
 * Fassung ist nur der Rueckfall, und sie weiss, wann sie zu alt ist.
 *
 * Wichtig fuer die Pflege: Die Kennung traegt Haupt- und Nebenversion, nicht
 * die Fehlerkorrekturstufe. XRechnung 3.0.1 und 3.0.2 schreiben beide
 * "xrechnung_3.0" - die halbjaehrlichen Bugfix-Bundles der KoSIT aendern also
 * die Regeln, aber nicht diese Zeichenkette.
 */
interface SpecificationEntry {
    /** Vollstaendige Kennung fuer BT-24 */
    id: string;
    /** Menschenlesbare Fassung, z.B. "3.0" */
    version: string;
}
interface SpecificationSet {
    /** Kennzeichnung dieses Standes, fuer Protokolle und Fehlermeldungen */
    label: string;
    /** Tag, an dem dieser Stand zusammengestellt wurde */
    publishedAt: IsoDate;
    /**
     * Tag, ab dem dieser Stand als veraltet gilt. Die KoSIT veroeffentlicht etwa
     * halbjaehrlich; ein Jahr ohne Aktualisierung ist die Grenze, ab der die App
     * warnen muss.
     */
    staleAfter: IsoDate;
    xrechnung: SpecificationEntry;
    zugferdEn16931: SpecificationEntry;
    zugferdExtended: SpecificationEntry;
    /** Womit dieser Stand geprueft wurde - gehoert in jedes Pruefprotokoll */
    validatedAgainst?: {
        kositConfiguration?: string;
        validatorTool?: string;
        zugferdVersion?: string;
    };
}
/**
 * Gebuendelter Stand vom 24.08.2026.
 *
 * Geprueft gegen die KoSIT-Konfiguration v2026-01-31 (Prueftool 1.6.0). Zu
 * diesem Zeitpunkt ist XRechnung 3.0.2 verbindlich, die Kennung lautet
 * unveraendert xrechnung_3.0.
 */
declare const BUNDLED_SPECIFICATIONS: SpecificationSet;
/** Der aktuell verwendete Stand. Ohne Nachladen der gebuendelte. */
declare function activeSpecifications(): SpecificationSet;
/**
 * Setzt einen nachgeladenen Stand.
 *
 * Der Aufrufer muss ihn vorher durch parseSpecificationSet() geschickt haben -
 * eine Kennung aus einer Fernquelle landet ungeprueft in jedem erzeugten
 * Dokument, deshalb wird ihre Form hier eng gefasst und nicht blind vertraut.
 */
declare function setActiveSpecifications(set: SpecificationSet): void;
/** Zurueck auf den gebuendelten Stand, etwa nach einem fehlerhaften Nachladen. */
declare function resetSpecifications(): void;
interface SpecificationAge {
    /** Stand ist ueber sein Verfallsdatum hinaus */
    stale: boolean;
    /** Tage seit der Zusammenstellung */
    ageInDays: number;
    /** Tage bis zum Verfall, negativ wenn bereits ueberschritten */
    daysUntilStale: number;
    label: string;
}
declare function specificationAge(now: IsoDate, set?: SpecificationSet): SpecificationAge;
/**
 * Prueft und uebernimmt einen nachgeladenen Stand.
 *
 * Eine Fernquelle darf hier nicht beliebige Zeichenketten einschleusen: jede
 * Kennung muss mit dem EN-16931-Praefix beginnen, sonst waere das erzeugte
 * Dokument fuer den Empfaenger unbrauchbar - und der Fehler faellt erst beim
 * Kunden auf. Bei jedem Zweifel bleibt der gebuendelte Stand aktiv.
 */
declare function parseSpecificationSet(input: unknown): SpecificationSet;
declare class SpecificationError extends Error {
    constructor(message: string);
}

interface CiiOptions {
    /** Ueberschreibt die aus dem Profil abgeleitete Kennung (BT-24) */
    guidelineId?: string;
    /** Prozesskennung (BT-23) */
    businessProcessId?: string;
    /** Bereits berechnete Summen wiederverwenden, statt neu zu rechnen */
    totals?: InvoiceTotals;
}
/**
 * Erzeugt eine UN/CEFACT Cross Industry Invoice (D16B) im Profil EN 16931.
 * Dieselbe Syntax traegt ZUGFeRD 2.3 / Factur-X und XRechnung in CII - der
 * Unterschied liegt in der Guideline-Kennung und den strengeren
 * Pflichtfeldern der XRechnung, die validateInvoice() abdeckt.
 */
declare function buildCii(invoice: Invoice, options?: CiiOptions): string;

interface UblOptions {
    customizationId?: string;
    profileId?: string;
    totals?: InvoiceTotals;
}
/**
 * Erzeugt eine UBL-2.1-Rechnung im Profil XRechnung 3.0.
 *
 * UBL kennt zwei Wurzelelemente: Gutschriften (381/396) laufen als CreditNote,
 * alles andere als Invoice. Die Unterschiede beschraenken sich auf den
 * Wurzelnamen, den Positionsnamen und das Mengenelement.
 */
declare function buildUbl(invoice: Invoice, options?: UblOptions): string;

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
interface Farbe {
    /** Jeweils 0 bis 1. */
    r: number;
    g: number;
    b: number;
}
interface Strich {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    staerke: number;
    farbe: Farbe;
}
interface Kreis {
    x: number;
    y: number;
    r: number;
    farbe: Farbe;
    gefuellt: boolean;
}
interface Flaeche {
    x: number;
    y: number;
    breite: number;
    hoehe: number;
    farbe: Farbe;
}
interface Beschriftung {
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
interface Pfad {
    d: string;
    fuellung?: Farbe;
    strich?: Farbe;
    staerke: number;
    /** Umschliessendes Rechteck in PDF-Zaehlweise - fuer die Zuordnung. */
    rahmen: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    };
    /**
     * Beschneidungsrechteck, falls eines galt - in PDF-Zaehlweise.
     *
     * Die Vorlage klemmt ihr Firmenzeichen in ein Quadrat von 45 mm ("re W n").
     * Hier passt die Zeichnung zufaellig hinein; eine Vorlage, deren Zeichen
     * ueber den Rand hinausgeht, wuerde ohne Beschneidung mehr zeigen als das
     * Original - und das faellt erst auf dem Papier auf.
     */
    beschnitt?: {
        x: number;
        y: number;
        breite: number;
        hoehe: number;
    };
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
interface Textlauf {
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
interface Briefpapier {
    seite: {
        breite: number;
        hoehe: number;
    };
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
    inhaltSchrift: {
        median: number;
        groesste: number;
    };
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
    inhaltRaster: {
        zeile?: number;
        absatz?: number;
    };
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
    inhaltProben: {
        text: string;
        breite: number;
        groesse: number;
        fett: boolean;
    }[];
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
    textfarbe?: {
        r: number;
        g: number;
        b: number;
    };
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
    satzspiegel?: {
        links: number;
        rechts: number;
    };
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
        farbe?: {
            r: number;
            g: number;
            b: number;
        };
    };
}

/**
 * Die Beschriftungen auf der Rechnung - einstellbar, aber nicht abschaltbar.
 *
 * ## Warum einstellbar
 *
 * Jedes Haus hat seine Wortwahl. Auf einer vermessenen Fremdrechnung steht
 * "Rechnungs-Nr." und "Kunden-Nr.", nicht "Rechnungsnummer" und
 * "Kundennummer". Wer sein Briefpapier uebernimmt, will nicht daneben eine
 * fremde Sprache stehen haben.
 *
 * Das ist ausserdem der risikoarme Teil der Gestaltung: Eine geaenderte
 * Beschriftung aendert nichts an der Struktur, nichts am XML und nichts an
 * den Pflichtangaben nach Paragraf 14 UStG. Nur das Wort davor.
 *
 * ## Warum nicht abschaltbar
 *
 * Eine leere Beschriftung liesse einen Wert ohne Erklaerung stehen - eine
 * Nummer, von der niemand weiss, ob sie die Rechnungs- oder die Kundennummer
 * ist. Deshalb wird Unbrauchbares nicht uebernommen, sondern durch die
 * Vorgabe ersetzt, so wie eine unbrauchbare Akzentfarbe durch die
 * Standardfarbe. Eine Rechnung, die nicht ganz nach Hausbrauch klingt, ist
 * der bessere Ausgang als eine, die niemand deuten kann.
 *
 * ## Was hier bewusst fehlt
 *
 * Die **Befreiungsgruende** ("steuerfrei nach Paragraf 4 Nr. ...") entstehen
 * aus dem Steuerschluessel des Dokuments und bleiben fest. Sie freizugeben
 * hiesse, eine Steuerbefreiung falsch benennen zu koennen, und das ist keine
 * Frage des Geschmacks.
 *
 * Die Abkuerzung in der Steuerzeile dagegen schon: "USt." und "MwSt." meinen
 * dasselbe, und welche ein Haus benutzt, ist Hausbrauch. Ebenso der Name der
 * Endsumme - die vermessene Vorlage schreibt "Ueberweisungsbetrag", nicht
 * "Rechnungsbetrag".
 */
interface Beschriftungen {
    rechnungsnummer: string;
    rechnungsdatum: string;
    leistungsdatum: string;
    leistungszeitraum: string;
    faelligAm: string;
    kundennummer: string;
    leitwegId: string;
    bestellnummer: string;
    projekt: string;
    pos: string;
    bezeichnung: string;
    menge: string;
    einzelpreis: string;
    umsatzsteuer: string;
    betrag: string;
    zwischensummeNetto: string;
    gesamtsummeNetto: string;
    zuschlag: string;
    abschlag: string;
    rundung: string;
    bereitsGezahlt: string;
    zahlbetrag: string;
    /**
     * Die Endsumme. "Ueberweisungsbetrag" auf der vermessenen Vorlage.
     *
     * Wirkt nur bei der gewoehnlichen Rechnung; bei Gutschrift und Berichtigung
     * bleibt der aus der Belegart abgeleitete Name stehen, damit die Art des
     * Belegs auf dem Blatt erkennbar bleibt.
     */
    gesamtbetrag: string;
    /** Die Abkuerzung in der Steuerzeile - "USt." oder "MwSt.". */
    steuerkuerzel: string;
    zahlung: string;
}
declare const STANDARD_BESCHRIFTUNGEN: Beschriftungen;
/** Taugt die Angabe als Beschriftung? */
declare function istBrauchbareBeschriftung(wert: unknown): wert is string;
/**
 * Baut den vollstaendigen Satz aus den eigenen Angaben.
 *
 * Was fehlt oder unbrauchbar ist, kommt aus der Vorgabe. Das Ergebnis ist
 * deshalb immer vollstaendig - der Aufrufer muss nirgends nachsehen, ob eine
 * Beschriftung vorhanden ist.
 */
declare function beschriftungenMit(eigene?: Partial<Beschriftungen>): Beschriftungen;
/**
 * Nur das, was vom Standard abweicht - zum Speichern.
 *
 * Den ganzen Satz abzulegen waere der Fehler, den man erst Jahre spaeter
 * bemerkt: Eine spaeter verbesserte Vorgabe erreichte niemanden mehr, weil
 * jedes Profil eine eingefrorene Kopie traegt.
 */
declare function nurAbweichungen(eigene: Partial<Beschriftungen>): Partial<Beschriftungen>;

/** A4 in PostScript-Punkten */
declare const A4: {
    readonly width: 595.28;
    readonly height: 841.89;
};
interface Theme {
    accent: RGB;
    text: RGB;
    muted: RGB;
    hairline: RGB;
    zebra: RGB;
}
declare const DEFAULT_THEME: Theme;
type Kennzahlenstellung = 
/** Rechts neben dem Anschriftenfeld, untereinander. Die Vorgabe. */
'neben-anschrift'
/** Rechts oben, oberhalb des Anschriftenfeldes. */
 | 'ueber-anschrift'
/** Unter dem Anschriftenfeld, quer in einer Zeile. */
 | 'unter-anschrift';
/**
 * Kuerzt auf die verfuegbare Breite und haengt ein Auslassungszeichen an.
 *
 * Gebraucht wird das dort, wo eine Beschriftung und ein Betrag in derselben
 * Zeile stehen und der Betrag nicht weichen darf. Lieber ein sichtbar
 * gekuerzter Text als zwei uebereinandergedruckte.
 */
/**
 * Wo der Kennzahlenblock zu liegen kommt - als Rechteck.
 *
 * Dieselben Zahlen wie beim Zeichnen, und zwar aus denselben Ausdruecken.
 * Eine zweite Rechnung fuer dasselbe waere die Stelle, an der Pruefung und
 * Wirklichkeit auseinanderlaufen - und dann meldet die Pruefung "frei", wo
 * die Rechnung ueberdruckt.
 *
 * `obergrenze` ist, wie tief der Briefkopf reicht; ohne eigenen Briefkopf ist
 * das der obere Seitenrand.
 */
declare function kennzahlenrahmen(stellung: Kennzahlenstellung, zeilen: number, obergrenze?: number, anschriftOben?: number, satzspiegel?: {
    links: number;
    rechts: number;
}): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};
/** Weicher Umbruch an Wortgrenzen, harte Trennung nur bei ueberlangen Woertern. */
declare function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[];

/** Konformitaetsstufe im Sinne von ZUGFeRD/Factur-X, landet so im XMP */
type FacturXConformanceLevel = 'MINIMUM' | 'BASIC WL' | 'BASIC' | 'EN 16931' | 'EXTENDED' | 'XRECHNUNG';
interface XmpOptions {
    title: string;
    author: string;
    subject: string;
    keywords?: string;
    creatorTool: string;
    producer: string;
    /** ISO-8601 mit Zeitzone, muss mit CreationDate im Info-Dictionary uebereinstimmen */
    createDate: string;
    modifyDate: string;
    /** PDF/A-Teil, fuer ZUGFeRD immer 3 */
    pdfaPart?: 1 | 2 | 3 | 4;
    /** A = barrierefrei getaggt, B = visuell, U = B plus Unicode-Zuordnung */
    pdfaConformance?: 'A' | 'B' | 'U';
    /** Dateiname der eingebetteten XML-Rechnung */
    documentFileName: string;
    /** Profil der eingebetteten Rechnung */
    conformanceLevel: FacturXConformanceLevel;
    /** Version des Factur-X-Namensraums, fuer ZUGFeRD 2.x immer 1.0 */
    facturxVersion?: string;
}
/**
 * Baut das XMP-Paket fuer ein ZUGFeRD-/Factur-X-PDF.
 *
 * Drei Dinge muessen hier stimmen, sonst faellt die Datei bei veraPDF oder
 * beim Empfaenger durch:
 *  1. pdfaid:part und pdfaid:conformance kennzeichnen das PDF als PDF/A-3.
 *  2. Der Namensraum urn:factur-x:... darf nicht einfach benutzt werden - jedes
 *     PDF/A-fremde Schema muss im pdfaExtension-Block selbst beschrieben sein.
 *  3. dc:title, dc:creator, dc:description, xmp:CreateDate und pdf:Producer
 *     muessen zum Info-Dictionary des PDF passen.
 */
declare function buildXmp(options: XmpOptions): string;
/**
 * Formatiert ein Datum als XMP-Zeitstempel mit Zeitzonenversatz.
 * Das Info-Dictionary bekommt denselben Moment im PDF-Format D:YYYYMMDDHHmmSS+HH'mm'.
 */
declare function xmpDate(date: Date): string;

/**
 * Binaerdaten, die der Renderer nicht selbst beschaffen kann. Die
 * Kernbibliothek kennt weder Dateisystem noch Bundler - Schriften und
 * Farbprofil liefert die aufrufende Plattform.
 */
interface RenderAssets {
    /** TrueType- oder OpenType-Datei fuer den Fliesstext */
    fontRegular: Uint8Array;
    /** Fette Schnitt derselben Familie */
    fontBold: Uint8Array;
    /**
     * Ein dritter, kraeftiger Schnitt zwischen mager und fett.
     *
     * Gestaltete Rechnungen benutzen ihn fuer Zwischenueberschriften und
     * Summenbeschriftungen: Die vermessene Vorlage setzt "Gesamtbetrag netto" in
     * National Book, ihren Fliesstext in National Light und ihre Auszeichnung in
     * National Semibold. Fehlt er, wird der magere benutzt - drei Prozent zu
     * schmal, aber nicht falsch.
     */
    fontKraeftig?: Uint8Array;
    /**
     * ICC-Profil fuer den OutputIntent. PDF/A verlangt einen definierten
     * Farbraum; ohne dieses Profil ist die Datei kein gueltiges PDF/A.
     */
    iccProfile: Uint8Array;
    /** Optionales Logo als PNG */
    logoPng?: Uint8Array;
}
interface RenderOptions {
    assets: RenderAssets;
    /** Erzeugungszeitpunkt, explizit fuer reproduzierbare Ausgaben */
    now?: Date;
    producer?: string;
    creatorTool?: string;
    /** Profil, das im XMP als ConformanceLevel steht */
    conformanceLevel?: FacturXConformanceLevel;
    /** PDF/A-Konformitaetsstufe. U setzt vollstaendige Unicode-Zuordnung voraus. */
    pdfaConformance?: 'B' | 'U';
    /** Dateiname der eingebetteten Rechnung, ZUGFeRD 2.x erwartet factur-x.xml */
    attachmentName?: string;
    theme?: Theme;
    footerNote?: string;
    /**
     * Nur die tatsaechlich benutzten Zeichen einbetten. Bleibt aus.
     *
     * Die Teilmengenbildung von pdf-lib nummeriert die Glyphen neu, laesst die
     * Textbefehle aber auf den alten Nummern stehen - das Dokument besteht jede
     * Strukturpruefung und zeigt beim Oeffnen Buchstabensalat. Klein wird die
     * Datei stattdessen ueber eine vorbereitete Schrift, siehe
     * tools/schrift-erzeugen.mjs.
     *
     * Bleibt als Schalter erhalten, weil der Vergleich beider Wege der einzige
     * Weg ist, den Fehler vorzufuehren: npm run schriftprobe
     * in den Pruefwerkzeugen von rechnungswerk
     */
    subsetFonts?: boolean;
    /**
     * Ein uebernommener Briefbogen, der unter jeder Seite liegt.
     *
     * Ist einer gesetzt, entfaellt der eigene Briefkopf - der Bogen bringt Logo,
     * Absenderzeilen und Rueckabsender bereits mit.
     */
    briefpapier?: Briefpapier;
    /**
     * Die Bytes der Vorlage, aus der der Bogen gelesen wurde.
     *
     * Nur noetig, wenn der Briefkopftext in der **Originalschrift** stehen soll.
     * Ohne sie wird er mit der Hausschrift nachgezeichnet und auf das gemessene
     * Sollmass eingepasst. Das ist der Normalfall: Eine fremde Schriftlizenz
     * deckt die Uebernahme nicht, das muss ein Mensch entscheiden.
     */
    briefpapierVorlage?: Uint8Array;
    /**
     * Das Zahlungsziel steht schon im Briefbogen - im Rumpf weglassen.
     *
     * Nur die Anzeige; im XML bleibt die Angabe stehen, BR-CO-25 verlangt sie.
     */
    zahlungszielImBriefpapier?: boolean;
    /**
     * Eigene Beschriftungen, soweit sie vom Standard abweichen.
     *
     * "Rechnungs-Nr." statt "Rechnungsnummer" etwa. Unbrauchbares wird durch die
     * Vorgabe ersetzt, nicht uebernommen - eine leere Beschriftung liesse einen
     * Wert ohne Erklaerung stehen.
     */
    beschriftungen?: Partial<Beschriftungen>;
    /** Wo der Kennzahlenblock steht - siehe `Kennzahlenstellung`. */
    kennzahlen?: Kennzahlenstellung;
    /**
     * Bloecke und Angaben, die eine Vorlage nicht braucht.
     *
     * Was hier ausgeschaltet wird, steht weiterhin im XML - maschinell gelesen
     * fehlt nichts. Der Zahlungsblock macht davon eine Ausnahme: Er wird nur
     * dann von selbst weggelassen, wenn die Bankverbindung im Briefbogen steht.
     */
    tabellenkopf?: boolean;
    kennzahlenfelder?: (keyof Beschriftungen)[];
    /** Beschriftung und Wert nebeneinander, wie es die Vorlage haelt. */
    kennzahlenInline?: boolean;
    /** Welche Kennzahlen fett gesetzt werden - die Vorlage betont nicht alle. */
    kennzahlenFett?: (keyof Beschriftungen)[];
    /** Positionsnummern zeigen. Aus, wenn die Vorlage nicht nummeriert. */
    positionsnummern?: boolean;
    /**
     * Die senkrechten Anker der Vorlage, in Hoehen **ihrer** Seite.
     *
     * Hier wird die Verschiebung auf unsere Seite aufgeschlagen - dieselbe, mit
     * der auch der Bogen gesetzt wird. Ohne Bogen bleiben sie wirkungslos: Zu
     * einer Seite, die wir selbst aufbauen, gehoeren keine fremden Hoehen.
     */
    kennzahlenOben?: number;
    textOben?: number;
    /** Die linken Kanten der Kennzahlenspalten, in Masen ihrer Seite. */
    kennzahlenSpalten?: Partial<Record<keyof Beschriftungen, number>>;
    /** Die Fluchtlinie der Summenbeschriftungen, in Masen ihrer Seite. */
    summenlabelRechts?: number;
    /** Einzug der Positionen vom Satzrand, wenn die Vorlage einen hat. */
    positionsEinzug?: number;
    /**
     * Menge und Einzelpreis zeigen. Ohne Angabe entscheidet der Inhalt: Sie
     * entfallen, wenn jede Position genau ein Stueck ist und der Einzelpreis
     * deshalb die Zeilensumme wiederholt.
     */
    mengenspalten?: boolean;
    /**
     * Die Steuerspalte zeigen. Ohne Angabe entscheidet der Inhalt: Sie
     * entfaellt, wenn alle Positionen unter demselben Satz laufen - der steht
     * dann im Summenblock.
     */
    steuerspalte?: boolean;
    /** Positionsnamen fett, Beschreibung grau. Aus, wenn die Vorlage gleich setzt. */
    positionsauszeichnung?: boolean;
    /** Summenbeschriftungen im kraeftigen Schnitt, wie es die Vorlage haelt. */
    summenlabelKraeftig?: boolean;
    /** Betrag auf die letzte Zeile der Position, wie es die Vorlage haelt. */
    betragUnten?: boolean;
    /** Datum ohne fuehrende Nullen. */
    datumOhneNullen?: boolean;
    steuergrundlage?: boolean;
    /**
     * Den Zahlungsblock zeigen. Ohne Angabe: ja.
     *
     * Bis v3.0.0 entschied das die Bibliothek selbst - sie sah im uebernommenen
     * Briefbogen nach, ob dort schon eine Bankverbindung steht, und liess den
     * Block dann weg. Das Nachsehen ist mit dem Vorlagenleser zum Produkt
     * gezogen; wer einen Bogen hereingibt, entscheidet deshalb selbst. Sonst
     * stehen die Kontodaten zweimal auf der Seite.
     */
    zahlungsblock?: boolean;
    hinweise?: boolean;
    /** Fertiges CII-XML verwenden, statt es neu zu erzeugen */
    xml?: string;
    totals?: InvoiceTotals;
}
interface RenderResult {
    pdf: Uint8Array;
    xml: string;
    totals: InvoiceTotals;
}
declare function renderZugferdPdf(invoice: Invoice, options: RenderOptions): Promise<RenderResult>;

/**
 * Prueft, ob eine Schrift jedes Zeichen zeichnen kann, das im Dokument steht.
 *
 * Der Anlass ist derselbe wie bei der Glyphenpruefung in den Pruefwerkzeugen von rechnungswerk: Eine
 * Schrift, die ein Zeichen nicht kennt, beschwert sich nicht - pdf-lib setzt
 * die Glyphe 0 und die Stelle bleibt im fertigen PDF einfach leer. Kein
 * Validator sieht das, denn strukturell ist das Dokument in Ordnung.
 *
 * Seit die eingebettete Schrift nur noch das lateinische Schriftsystem
 * abdeckt (siehe tools/schrift-erzeugen.mjs), ist das
 * kein hypothetischer Fall mehr: Ein Kunde mit griechischem oder kyrillischem
 * Namen trifft ihn sofort. Lieber ein Abbruch mit klarer Meldung als eine
 * Rechnung mit einer Luecke an der Stelle des Empfaengers.
 */
/**
 * Fehler wegen nicht darstellbarer Zeichen.
 *
 * Ein eigener Typ, damit der Renderdienst ihn als Eingabefehler behandeln kann
 * (422) statt als Serverfehler (500). Der Unterschied ist nicht kosmetisch:
 * Ein 500er sagt dem Aufrufer, es liege an uns, und die App zeigt eine
 * Meldung, mit der niemand etwas anfangen kann.
 */
declare class ZeichenvorratFehler extends Error {
    constructor(nachricht: string);
}
/** Entfernt genau diese Zeichen aus einem Text. */
declare function ohneUnsichtbare(text: string): string;

/**
 * Gestaltung der Rechnung, soweit sie sich gefahrlos einstellen laesst.
 *
 * Bewusst nur die Akzentfarbe und nicht das ganze Farbschema: Text, Grauton,
 * Linien und Zebrastreifen sind aufeinander abgestimmte Neutraltoene, die mit
 * jedem Akzent funktionieren. Wer sie einzeln einstellen darf, baut sich
 * frueher oder later eine Rechnung, die niemand lesen kann - und der
 * Empfaenger muss sie lesen koennen, das ist der Zweck des Dokuments.
 *
 * Die Anordnung bleibt ebenfalls fest. Das Anschriftenfeld sitzt 45 mm von
 * oben, damit es im Fensterumschlag steht (DIN 5008); wer daran rueckt,
 * verliert die Kuvert-Tauglichkeit, ohne es zu merken.
 */
/** Wandelt "#0f4c81" oder "0f4c81" in eine Farbe. Ungueltiges ergibt undefined. */
declare function farbeAusHex(hex: string): ReturnType<typeof rgb> | undefined;
/**
 * Baut das Farbschema aus einer Akzentfarbe.
 *
 * Ist die Angabe unbrauchbar, kommt das Standardschema zurueck - eine
 * unleserliche Rechnung waere der schlechtere Ausgang als eine, die nicht ganz
 * nach Hausfarbe aussieht.
 */
declare function themaMitAkzent(hex: string | undefined): Theme;
/**
 * Prueft, ob die Bytes ein PNG sind.
 *
 * pdf-lib bettet nur PNG und JPEG ein, und PDF/A verlangt einen definierten
 * Farbraum - der OutputIntent des Dokuments ist sRGB. Ein Logo aus einer
 * Druckvorlage liegt haeufig in CMYK vor; das waere kein gueltiges PDF/A mehr.
 * Deshalb wird hier abgewiesen, was nicht sicher passt, statt es einzubetten
 * und die Konformitaet stillschweigend zu verlieren.
 */
declare function istPng(bytes: Uint8Array): boolean;
/**
 * Farbtyp eines PNG aus dem IHDR-Block.
 *
 * 0 = Graustufen, 2 = RGB, 3 = Palette, 4 = Graustufen mit Alpha, 6 = RGBA.
 * Alle davon sind RGB-basiert und damit fuer den sRGB-OutputIntent
 * unbedenklich; CMYK kennt PNG gar nicht. Die Pruefung dient dazu, eine
 * beschaedigte Datei frueh zu erkennen.
 */
declare function pngFarbtyp(bytes: Uint8Array): number | undefined;
/**
 * Eine gelesene Farbe als Hexzeichenfolge, etwa "#0F4C81".
 *
 * Stand bis v3.0.0 beim Vorlagenleser. Geblieben ist sie, weil das Zeichnen
 * eines uebernommenen Bogens sie braucht: Das SVG-Vorschaubild schreibt die
 * Farben als Text.
 */
declare function alsHex(farbe: Farbe): string;

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
interface Textstueck {
    x: number;
    y: number;
    /** Schriftgroesse in Punkt, Matrixskalierung eingerechnet. */
    groesse: number;
    /** Wie breit das Stueck gesetzt ist - fuer die Frage, ob dahinter eine Luecke klafft. */
    breite: number;
    /** Fett gesetzt? Abgelesen am Namen des Schriftschnitts. */
    fett: boolean;
    /** Der Schnittname ohne Teilmengenkennung - "National-Semibold". */
    schnitt: string;
    text: string;
}
interface Textzeile {
    y: number;
    /** Von links nach rechts. */
    stuecke: Textstueck[];
    text: string;
}
interface Textseite {
    zeilen: Textzeile[];
}
interface PdfText {
    seiten: Textseite[];
    /** Alles hintereinander, fuer eine schnelle Suche. */
    text: string;
    /** Kein einziges lesbares Zeichen - vermutlich ein Scan. */
    leer: boolean;
}
type Wert = number | string | number[] | Wert[];
/**
 * Ein kleiner Leser fuer den Seiteninhalt.
 *
 * Bewusst kein regulaerer Ausdruck: Zeichenketten duerfen Klammern,
 * Fluchtzeichen und beliebige Bytes enthalten, und ein Ausdruck, der das
 * ueberliest, verschluckt Text oder verschiebt Positionen. Das faellt bei
 * einem Betrag erst auf, wenn er falsch in einer Rechnung steht.
 */
declare function leseInhalt(quelle: string, aufOperator: (operator: string, operanden: Wert[]) => void): void;
/** Der Seiteninhalt als latin1-Text - dort stehen Positionen und Glyphen. */
declare function seiteninhalt(doc: PDFDocument, seite: number): string;
declare function liesPdfText(bytes: Uint8Array): Promise<PdfText>;

interface Breiten {
    /** Zwei Bytes je Code - bei Type0 der Normalfall. */
    breit: boolean;
    /** Breite eines Glyphen in Tausendstel Schriftgroesse. */
    breite(code: number): number;
}
/**
 * Sammelt die Glyphenbreiten aller Schriften einer Seite.
 *
 * Fehlt eine Angabe, kommt `MissingWidth` aus dem Schriftdeskriptor zum
 * Zug und sonst null. Null ist die ehrlichere Vorgabe als ein geratener
 * Mittelwert: Ein Stueck bleibt dann stehen, wo es stand, statt sich um einen
 * erfundenen Betrag zu verschieben.
 */
declare function liefereBreiten(doc: PDFDocument, seite: number): Map<string, Breiten>;
/**
 * Wie weit ein gesetzter Lauf die Schreibmarke weiterschiebt.
 *
 * Die Rechnung steht so in der PDF-Spezifikation: Fuer jeden Glyphen
 * `(w0/1000 * Tfs + Tc + Tw) * Th`, und eine Zahl im TJ-Feld zieht
 * `Tj/1000 * Tfs * Th` wieder ab.
 *
 * `Tw` gilt nur fuer das Byte 32 und nur bei einfachen Schriften - bei
 * zusammengesetzten waere 32 die Haelfte eines Codes und kein Leerzeichen.
 * Diese Ausnahme steht ausdruecklich in der Spezifikation und ist genau die
 * Sorte Regel, die man beim Nachbauen vergisst.
 */
declare function laufbreite(stuecke: (number[] | number)[], breiten: Breiten | undefined, groesse: number, zeichenabstand?: number, wortabstand?: number, streckung?: number): number;

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
 * Fehler beim Einlesen einer empfangenen Rechnung.
 *
 * Eigene Datei, damit sowohl das Einlesemodul als auch die Syntaxauswertung
 * denselben Fehlertyp werfen koennen, ohne sich gegenseitig zu importieren.
 *
 * Der Grund fuer diesen Typ ueberhaupt: Beim Lesen fremder Dateien kommen
 * Ausnahmen aus Bibliotheken hoch, deren Wortlaut englisch und technisch ist -
 * "Failed to parse PDF document (line:147 col:11 offset=1732)". Das ist fuer
 * die Fehlersuche wertvoll und fuer den Empfaenger einer kaputten Rechnung
 * wertlos. Deshalb traegt jeder Fehler beides: eine Meldung, die man anzeigen
 * kann, und den technischen Wortlaut daneben.
 */
type EInvoiceErrorCode = 
/** PDF ohne eingebettete XML-Rechnung - ein reines Bilddokument */
'no-embedded-xml'
/** Weder PDF noch XML, oder XML ohne bekanntes Wurzelelement */
 | 'unknown-format'
/** Datei ist im Ansatz richtig, liess sich aber nicht auswerten */
 | 'parse-failed';
declare class EInvoiceError extends Error {
    readonly code: EInvoiceErrorCode;
    /** Urspruenglicher Wortlaut, fuer Protokoll und Rueckfragen */
    readonly detail?: string | undefined;
    constructor(message: string, code: EInvoiceErrorCode, 
    /** Urspruenglicher Wortlaut, fuer Protokoll und Rueckfragen */
    detail?: string | undefined);
}

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

/**
 * Betragsarithmetik. Rechnungsbetraege duerfen nicht ueber Float-Addition
 * driften: EN 16931 verlangt, dass Summen exakt aufgehen (BR-CO-10 ff.),
 * sonst schlaegt jede Schematron-Pruefung fehl. Deshalb wird intern in
 * ganzzahligen Kleinsteinheiten gerechnet.
 */
/** Kaufmaennische Rundung (halb von Null weg) auf n Nachkommastellen. */
declare function round(value: number, decimals?: number): number;
/** Summe mit Rundung nach jedem Schritt, damit keine Restcents entstehen. */
declare function sum(values: readonly number[], decimals?: number): number;
/**
 * Formatierung fuer XML: Punkt als Dezimaltrenner, feste Nachkommastellen,
 * kein Tausendertrenner, "-0.00" wird zu "0.00".
 */
declare function decimal(value: number, decimals?: number): string;
/** Anzeigeformat fuer das PDF, z.B. "1.234,56". */
declare function formatAmount(value: number, currency?: string, decimals?: number): string;
/** Anzeigeformat fuer Mengen: bis zu 4 Nachkommastellen, ohne Nullen am Ende. */
declare function formatQuantity(value: number): string;

/**
 * Base64 ohne Plattformabhaengigkeit. Node kennt Buffer, der Browser atob,
 * React Native je nach Engine beides oder keins - die Kernbibliothek darf sich
 * auf keines davon verlassen.
 */
declare function toBase64(bytes: Uint8Array): string;
declare function fromBase64(text: string): Uint8Array;
/** UTF-8 Kodierung ohne TextEncoder-Abhaengigkeit */
declare function utf8Encode(text: string): Uint8Array;
/** UTF-8 Dekodierung ohne TextDecoder-Abhaengigkeit */
declare function utf8Decode(bytes: Uint8Array): string;

/**
 * Minimaler XML-Schreiber. Bewusst ohne DOM und ohne Abhaengigkeit, damit der
 * Erzeuger in Node, im Browser und in React Native identisch laeuft.
 *
 * CII und UBL sind sequenzgebundene Schemata: die Reihenfolge der Elemente ist
 * Teil der Gueltigkeit. Ein Baum aus Objekten wuerde das verschleiern, deshalb
 * schreibt der Generator linear und die Quellcode-Reihenfolge entspricht der
 * Schema-Reihenfolge.
 */
type XmlAttributes = Record<string, string | number | undefined>;
declare function escapeXml(value: string): string;
/**
 * Entfernt Zeichen, die XML 1.0 nicht erlaubt. Aus Eingabefeldern und
 * Zwischenablagen landen sonst Steuerzeichen im Dokument, die jeden Parser
 * beim Empfaenger scheitern lassen.
 */
declare function sanitizeXmlText(value: string): string;
declare class XmlWriter {
    private readonly parts;
    private readonly stack;
    private readonly indentText;
    constructor(options?: {
        indent?: string;
        declaration?: boolean;
    });
    private get pad();
    private static attrs;
    open(tag: string, attributes?: XmlAttributes): this;
    close(tag?: string): this;
    /** Blattelement mit Textinhalt. Leere Werte werden ausgelassen. */
    leaf(tag: string, value: string | number | undefined | null, attributes?: XmlAttributes): this;
    /** Element ohne Inhalt, aber mit Attributen. */
    empty(tag: string, attributes?: XmlAttributes): this;
    /** Oeffnet ein Element, fuehrt den Rumpf aus und schliesst es wieder. */
    element(tag: string, attributes: XmlAttributes | undefined, body: (w: XmlWriter) => void): this;
    /** Wie element(), wird aber komplett uebersprungen, wenn condition falsch ist. */
    elementIf(condition: unknown, tag: string, attributes: XmlAttributes | undefined, body: (w: XmlWriter) => void): this;
    toString(): string;
}

/**
 * Das Briefpapier als SVG.
 *
 * Die Schriftangabe bleibt eine Familienliste statt einer eingebetteten
 * Schrift: Das SVG soll sich oeffnen und bearbeiten lassen, nicht
 * originalgetreu drucken - dafuer ist das PDF da.
 */
declare function alsSvg(papier: Briefpapier, schriftfamilie?: string): string;
interface Zeichenbefund {
    pfade: number;
    texte: number;
    /** Stuecke, die auf das Sollmass der Vorlage eingepasst wurden. */
    eingepasst: number;
    /** Zeichen, die die eingebettete Schrift nicht kennt. */
    fehlendeZeichen: string[];
}
/**
 * Zeichnet das Briefpapier auf eine Seite.
 *
 * Flaechen zuerst, dann Kreise, dann Striche, dann Text - in dieser
 * Reihenfolge deckt nichts das ab, was darueber gehoert.
 */
declare function zeichneBriefpapier(seite: PDFPage, papier: Briefpapier, schrift: PDFFont, versatz?: {
    x: number;
    y: number;
}): Zeichenbefund;

interface Vorlagenbefund {
    /** Gesetzte Textlaeufe. */
    laeufe: number;
    /** Uebernommene Schriften, mit ihrem Namen aus der Vorlage. */
    schriften: string[];
    /** Laeufe, deren Schrift sich nicht uebernehmen liess. */
    uebersprungen: number;
}
/**
 * Bequemlichkeit fuer einmalige Ausgaben - bereitet vor und setzt in einem.
 */
declare function setzeMitVorlagenschrift(zielSeite: PDFPage, papier: Briefpapier, quelle: Uint8Array, quellseite?: number): Promise<Vorlagenbefund>;
/** Nur zur Anzeige: welche Schriften die Vorlage im Briefkopf benutzt. */
declare function schriftenImBriefkopf(laeufe: Textlauf[]): string[];

/**
 * Die eigene Hausschrift eines Absenders - pruefen, bevor sie gesetzt wird.
 *
 * ## Warum es das gibt
 *
 * Aus einer uebernommenen Fremdrechnung laesst sich die Schrift **nicht**
 * gewinnen. Nachgemessen an einer echten Vorlage: Eingebettet ist nur eine
 * Teilmenge, naemlich die Zeichen, die auf jener einen Seite vorkamen - 67
 * Stueck. Es fehlen j, p, q, x, y, die Ziffer 3, das Eurozeichen und jedes
 * Anfuehrungszeichen. Damit laesst sich kein Kundenname setzen und kein
 * Betrag. Das ist keine Frage des Aufwands; die Buchstaben sind nicht da.
 *
 * Wer seine Rechnung in seiner Schrift will, hinterlegt sie deshalb selbst -
 * die Datei, fuer die er die Lizenz hat. Fehlt sie, bleibt es bei der
 * Hausschrift.
 *
 * ## Warum geprueft und nicht einfach eingebettet
 *
 * Weil eine Schrift, die ein Zeichen nicht kennt, sich nicht beschwert:
 * pdf-lib setzt die Glyphe 0, und die Stelle bleibt im fertigen PDF leer. Kein
 * Validator sieht das - strukturell ist das Dokument in Ordnung. Es faellt
 * erst auf, wenn ein Empfaenger anruft und fragt, warum sein Name fehlt.
 *
 * Deshalb wird beim Hinterlegen geprueft, nicht beim Drucken: Dort steht ein
 * Mensch davor, der die Datei wechseln kann.
 */
/** Fehlerarten, damit die Oberflaeche jeden Fall eigen benennen kann. */
type Schriftmangel = 'unlesbar' | 'zu-gross' | 'zeichen-fehlen' | 'keine-umrisse' | 'schnitte-verschieden';
interface Schriftbefund {
    /** Der Familienname aus der Datei - fuer die Anzeige im Profil. */
    name: string;
    /** Wie viele Zeichen die Datei kennt. */
    zeichen: number;
    /** Was fehlt, als lesbare Zeichenfolge. Leer, wenn nichts fehlt. */
    fehlend: string;
    mangel?: Schriftmangel;
}
/**
 * Was eine Rechnung an Zeichen braucht.
 *
 * Nicht der ganze lateinische Vorrat - danach gefragt scheiterte fast jede
 * Schrift, und die meisten Zeichen kommen auf einer Rechnung nie vor. Gefordert
 * wird, was auf **jeder** deutschen Rechnung stehen kann: Buchstaben mit
 * Umlauten, Ziffern, die Satzzeichen der Betragsschreibung, das Eurozeichen
 * und der Paragraf - der steht in jedem Befreiungsgrund.
 *
 * Was darueber hinaus in einem Kundennamen auftaucht, faengt die
 * Zeichenpruefung beim Drucken ab. Hier geht es darum, offensichtlich
 * untaugliche Dateien abzuweisen: eine Symbolschrift, ein Schnitt nur in
 * Grossbuchstaben, eine Teilmenge aus einem fremden PDF.
 */
declare const RECHNUNGSZEICHEN: string;
/**
 * Wie gross eine hinterlegte Schriftdatei hoechstens sein darf.
 *
 * Zwei Megabyte je Schnitt. Die Datei wandert in jede erzeugte Rechnung -
 * PDF/A verlangt Einbettung, und die Teilmengenbildung von pdf-lib bleibt aus,
 * weil sie die Glyphen neu nummeriert und Buchstabensalat erzeugt. Eine
 * gewoehnliche Textschrift liegt bei 100 bis 400 Kilobyte; was deutlich
 * darueber liegt, ist eine Schrift mit Tausenden Zeichen, und die traegt jede
 * Rechnung dann mit sich herum.
 */
declare const MAX_SCHRIFT_BYTES: number;
/**
 * Prueft eine hinterlegte Schriftdatei.
 *
 * Wirft nicht, sondern berichtet: Beim Hinterlegen soll die Oberflaeche sagen
 * koennen, **was** nicht stimmt, statt nur abzulehnen.
 */
declare function pruefeSchrift(bytes: Uint8Array): Schriftbefund;
/**
 * Der Kern eines Familiennamens - ohne Schnittbezeichnung, ohne Trennzeichen.
 *
 * "National Light" und "National-SemiBold" ergeben beide "national".
 */
declare function familienkern(name: string): string;
/**
 * Prueft beide Schnitte zusammen.
 *
 * Der fette Schnitt muss dieselbe Familie sein - sonst steht auf der Rechnung
 * eine Auszeichnung, die aus einer anderen Schrift stammt, und das sieht
 * schlimmer aus als gar keine. Verglichen wird der Familienname; er ist das
 * Einzige, was die Datei selbst darueber sagt.
 *
 * Fehlt der fette Schnitt ganz, ist das **kein** Mangel: Dann wird der magere
 * fuer beides benutzt, und die Auszeichnung geschieht ueber Farbe und Stellung.
 * Eine kuenstlich fett gerechnete Schrift waere schlechter - sie sieht auf
 * jedem Drucker anders aus.
 */
declare function pruefeSchriftpaar(regular: Uint8Array, fett?: Uint8Array): {
    regular: Schriftbefund;
    fett?: Schriftbefund;
    mangel?: Schriftmangel;
};
/** Was dem Nutzer zu einem Mangel gesagt wird. */
declare function schriftmangelText(befund: {
    regular: Schriftbefund;
    fett?: Schriftbefund;
    mangel?: Schriftmangel;
}): string | undefined;

/**
 * @erechnung/core - isomorphe Kernbibliothek fuer deutsche E-Rechnungen.
 *
 * Alles hier laeuft unveraendert in Node (Cloud-Rendering), im Browser
 * (Expo Web) und in React Native (native App). Es gibt bewusst keinen Zugriff
 * auf Dateisystem, DOM oder plattformspezifische Krypto - Binaerdaten wie
 * Schriften und Farbprofil reicht die aufrufende Schicht herein.
 */

/**
 * Erzeugt die XML-Datei zum gewaehlten Profil. Fuer 'zugferd-en16931' ist das
 * die Datei, die anschliessend ins PDF/A-3 eingebettet wird; fuer die beiden
 * XRechnung-Profile ist sie bereits das fertige Dokument.
 */
declare function buildInvoiceXml(invoice: Invoice): {
    xml: string;
    filename: string;
};

export { A4, BUNDLED_SPECIFICATIONS, type Beschriftung, type Beschriftungen, type Breiten, type Briefpapier, type CiiOptions, DEFAULT_THEME, type DeclaredTotals, EAS, EInvoiceError, type EInvoiceErrorCode, type ExtractedAttachment, type FacturXConformanceLevel, type Farbe, type Flaeche, type Folgeart, INVOICE_TYPE_CODES, Invoice, InvoiceInput, type InvoiceSyntax, type InvoiceTotals, type InvoiceTypeCode, type IsoDate, type Kennzahlenstellung, type Kreis, Line, MAX_SCHRIFT_BYTES, PAYMENT_MEANS, PROFILE_ID, type ParsedInvoice, type PaymentMeansCode, type PdfText, type Pfad, RECHNUNGSZEICHEN, type ReceivedInvoice, type RenderAssets, type RenderOptions, type RenderResult, STANDARD_BESCHRIFTUNGEN, type Schriftbefund, type Schriftmangel, type Severity, type SourceKind, type SpecificationAge, type SpecificationEntry, SpecificationError, type SpecificationSet, type Strich, type Textlauf, type Textseite, type Textstueck, type Textzeile, type Theme, UNIT, type UblOptions, type UnitCode, VAT_CATEGORY, type ValidationIssue, type ValidationResult, Vat, type VatBreakdownEntry, type VatCategoryCode, type Vorlagenbefund, type Wert, XmlWriter, type XmpOptions, ZERO_RATE_CATEGORIES, type Zeichenbefund, ZeichenvorratFehler, activeSpecifications, addDays, alsHex, alsSvg, beschriftungenMit, buildCii, buildInvoiceXml, buildUbl, buildXmp, computeTotals, decimal, detectKind, escapeXml, extractAttachments, extractInvoiceXml, familienkern, farbeAusHex, folgedokument, formatAmount, formatDate, formatQuantity, fromBase64, isIsoDate, isPlausibleIban, isPlausibleLeitwegId, isPlausibleVatId, istBrauchbareBeschriftung, istKleinunternehmerRechnung, istPng, kennzahlenrahmen, laufbreite, leseInhalt, liefereBreiten, liesPdfText, lineNetAmount, nurAbweichungen, ohneUnsichtbare, parseInvoiceXml, parseSpecificationSet, pngFarbtyp, pruefeSchrift, pruefeSchriftpaar, readEInvoice, renderZugferdPdf, resetSpecifications, round, sanitizeXmlText, schriftenImBriefkopf, schriftmangelText, seiteninhalt, setActiveSpecifications, setzeMitVorlagenschrift, specificationAge, sum, summarizeTotals, themaMitAkzent, toBase64, toCiiDate, utf8Decode, utf8Encode, validateInvoice, wrapText, xmpDate, zeichneBriefpapier };
