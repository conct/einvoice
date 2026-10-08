import { V as Vat, I as Invoice, L as Line, b as InvoiceInput } from './invoice-BoN0H4V6.js';
export { A as Address, c as AddressSchema, d as AllowanceCharge, e as AllowanceChargeSchema, f as Attachment, g as AttachmentSchema, C as ContactSchema, E as ElectronicAddressSchema, a as InvoiceProfile, h as InvoiceProfileSchema, i as InvoiceSchema, j as LineSchema, P as Party, k as PartySchema, l as Payment, m as PaymentSchema, n as VatSchema, p as parseInvoice } from './invoice-BoN0H4V6.js';
import { RGB, PDFFont, rgb, PDFPage, PDFDocument } from 'pdf-lib';
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
declare function alsHex(farbe: Farbe): string;
interface Grenzzeile {
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
declare function findeGrenze(zeilen: Grenzzeile[], seitenhoehe: number): number;
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
declare function findeFussgrenze(zeilen: Grenzzeile[], seitenhoehe: number): number;
declare function liesBriefpapier(bytes: Uint8Array, seite?: number): Promise<Briefpapier>;
/**
 * Welche Strichstaerken die Vorlage in ihrem Inhalt benutzt.
 *
 * Die haeufigste gilt als die gewoehnliche, die groesste als die betonte.
 * Sind beide gleich, zieht die Vorlage alle Linien gleich - dann gibt es
 * nichts zu uebernehmen, und es bleibt bei unseren Vorgaben.
 */
declare function findeStrichstaerken(pfade: Pfad[], inhaltszeilen?: {
    y: number;
}[]): {
    inhaltStriche?: {
        fein: number;
        stark: number;
        abstand?: number;
        farbe?: {
            r: number;
            g: number;
            b: number;
        };
    };
};

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
 * Ein Word-Dokument aufschluesseln.
 *
 * Wozu: Die Zielgruppe schreibt ihre Rechnungen heute in Word - das ist die
 * Ausgangslage, von der docs/monetarisierung.md ausgeht. Wer umsteigen soll,
 * darf nicht alles abtippen muessen. Der Empfang kennt bereits den Fall
 * "PDF ohne eingebettetes XML" und weist ihn ab; hier entsteht die Grundlage,
 * daraus statt einer Absage ein Angebot zu machen.
 *
 * **Was diese Datei tut und was nicht.** Sie holt heraus, was im Dokument
 * steht: Absaetze und Tabellen, in der Reihenfolge des Dokuments. Sie deutet
 * **nichts**. Welche Zahl die Rechnungsnummer ist und welche Spalte die Menge
 * enthaelt, entscheidet nicht dieser Code - eine falsch geratene Zahl ergaebe
 * eine falsche Rechnung, und das ist der eine Fehler, den dieses Produkt nicht
 * haben darf.
 *
 * Warum ausgerechnet Word und nicht das gewohnte PDF: Eine .docx ist ein ZIP
 * mit XML darin, und beides ist ohnehin an Bord. Ein PDF hat keinen Text,
 * sondern Zeichenanweisungen - Textextraktion hiesse Inhaltsstroeme parsen und
 * Zeichenkodierungen aufloesen. Dieses Projekt weiss, wie unangenehm das ist;
 * es erzeugt selbst Schriftteilmengen.
 */
interface WordAbsatz {
    art: 'absatz';
    text: string;
}
interface WordTabelle {
    art: 'tabelle';
    /** Zeilen mit Zellen, jede Zelle als reiner Text. */
    zeilen: string[][];
}
type WordBlock = WordAbsatz | WordTabelle;
interface WordDokument {
    /** Absaetze und Tabellen in der Reihenfolge des Dokuments. */
    bloecke: WordBlock[];
    /** Alle Absaetze aneinandergehaengt - fuer eine schnelle Suche. */
    text: string;
    /** Nur die Tabellen, weil dort die Positionen stehen. */
    tabellen: WordTabelle[];
}
declare function liesWordDokument(bytes: Uint8Array): WordDokument;

/**
 * Aus einer Word-Tabelle werden Rechnungspositionen.
 *
 * Der Leser nebenan (word.ts) holt heraus, was im Dokument steht; er deutet
 * nichts. Hier passiert die Deutung - aber **nicht allein**: Die Zuordnung der
 * Spalten kommt vom Nutzer, diese Datei rechnet nur um.
 *
 * Warum im Kern und nicht in der App: Der Zahlenleser unten ist die
 * riskanteste Stelle des ganzen Umzugswegs. Eine Zelle "1.234,56", die als
 * 1,23456 gelesen wird, ergibt eine falsche Rechnung - und dagegen
 * widerspricht kein Empfaenger, anders als bei einem falschen XML. Hier ist er
 * pruefbar.
 */
type Spaltenrolle = 'bezeichnung' | 'menge' | 'einheit' | 'einzelpreis' | 'ignorieren';
declare const ROLLEN: Array<{
    rolle: Spaltenrolle;
    label: string;
}>;
/**
 * Eine Zahl aus einer Tabellenzelle.
 *
 * Deutsche Schreibweise, und das ist eine bewusste Festlegung: Komma trennt
 * die Nachkommastellen, Punkt die Tausender. "1.234,56" ergibt 1234,56.
 *
 * Der eine Zugestaendnisfall ist ein Punkt mit ein bis zwei Stellen dahinter
 * und keinem Komma - "95.00". Das schreibt niemand als Tausendertrennung, also
 * ist es gemeint als Dezimalpunkt.
 *
 * Bewusst `undefined` statt 0 bei leerer Zelle: Eine leere Menge ist keine
 * Menge null, sondern eine fehlende Angabe. Der Unterschied entscheidet
 * darueber, ob die Oberflaeche nachfragt oder stillschweigend eine Position
 * ueber 0,00 Euro anlegt.
 */
declare function zahlAus(text: string): number | undefined;
/**
 * Rät die Rollen aus der Kopfzeile.
 *
 * Nur ein Vorschlag. Trifft er daneben, ist das kein Fehler - der Nutzer sieht
 * die Zuordnung und aendert sie. Deshalb hier auch keine Klugheit, sondern
 * die Woerter, die auf deutschen Rechnungen tatsaechlich stehen.
 */
declare function schlageZuordnungVor(kopfzeile: string[]): Spaltenrolle[];
/**
 * Erkennungsmerkmal einer Vorlage.
 *
 * Die Kopfzeile ist das Stabilste an einer Rechnungsvorlage - der Inhalt
 * darunter aendert sich mit jeder Rechnung, die Ueberschriften nicht. Wer
 * dieselbe Vorlage ein zweites Mal einliest, soll die Spalten nicht erneut
 * zuordnen muessen.
 */
declare function signaturVon(kopfzeile: string[]): string;
type Position = NonNullable<InvoiceInput['lines']>[number];
interface Uebernahme {
    positionen: Position[];
    /** Zeilen, aus denen nichts wurde - mit dem Grund, fuer die Anzeige. */
    uebersprungen: Array<{
        zeile: string[];
        grund: string;
    }>;
}
/**
 * Macht aus den Datenzeilen Positionen.
 *
 * `vorlage` liefert die Umsatzsteuerangabe - sie kommt aus dem Entwurf und
 * damit aus den Stammdaten, nicht aus dem Word-Dokument. Ein Steuersatz, den
 * man aus einer Tabelle liest, ist genau die Art Zahl, die man nicht raten
 * sollte.
 */
declare function positionenAus(tabelle: WordTabelle, rollen: Spaltenrolle[], mitKopfzeile: boolean, vorlage: Position): Uebernahme;

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
declare function liesPdfText(bytes: Uint8Array): Promise<PdfText>;

/**
 * Aus Textzeilen eines PDF wird eine Tabelle.
 *
 * **Das hier ist die Raterei.** pdf-text.ts liest ab, was im Dokument steht -
 * die Koordinaten sind Tatsachen. Diese Datei schliesst daraus auf eine
 * Struktur, die im PDF nicht vorhanden ist, und das kann danebengehen. Sie
 * steht deshalb getrennt, damit man sie einzeln beurteilen kann.
 *
 * ## Wie geraten wird
 *
 * Die **Kopfzeile gibt die Spalten vor**. Ihre Textstuecke stehen an genau den
 * Stellen, an denen die Spalten beginnen - jedes Stueck einer Datenzeile
 * gehoert zu dem Kopfstueck, dem es am naechsten liegt.
 *
 * Warum nicht die x-Werte aller Zeilen zusammen gruppieren: Der Abstand
 * zwischen zwei Spalten ist nicht groesser als der innerhalb einer. Gemessen
 * an einer erzeugten Rechnung liegen "Pos." und "Bezeichnung" 26 Einheiten
 * auseinander, "Einzelpreis" und sein Wert 17 - eine feste Schwelle traefe
 * beides gleich und wuerde entweder Spalten verschmelzen oder sie zerreissen.
 *
 * Die Naehe zum Kopfstueck traegt auch bei rechtsbuendigen Zahlen: Ein Betrag
 * steht dann links von seiner Ueberschrift, aber immer noch naeher an ihr als
 * an der Nachbarspalte.
 *
 * ## Was sie nicht kann
 *
 * Verbundene Zellen, mehrzeilige Positionen und Tabellen ohne Kopfzeile. Eine
 * Fortsetzungszeile - "Frontend, Anbindung an das Abrechnungssystem" unter der
 * eigentlichen Position - erscheint als eigene Zeile mit nur einer gefuellten
 * Spalte. Sie wird gemeldet, nicht stillschweigend angehaengt.
 */
interface Tabellenbefund {
    tabelle: WordTabelle;
    /**
     * Zeilen, die nur eine Spalte gefuellt haben - meist Fortsetzungstext einer
     * Position. Sie stehen in der Tabelle, aber der Aufrufer soll wissen, dass
     * sie verdaechtig sind.
     */
    fortsetzungen: number[];
}
/**
 * Sucht die Zeile, die am ehesten eine Tabellenkopfzeile ist.
 *
 * Genommen wird die Zeile mit den meisten Textstuecken - eine Kopfzeile hat
 * definitionsgemaess je Spalte eines. Bei Gleichstand die obere, weil
 * Rechnungen ihre Positionstabelle vor den Summen fuehren.
 *
 * Das ist ein **Vorschlag**. Welche Zeile die Kopfzeile ist, entscheidet der
 * Mensch - hier wird nur die Auswahl vorbelegt.
 */
declare function schlageKopfzeileVor(zeilen: Textzeile[]): number;
/**
 * Baut aus den Zeilen ab `kopfzeile` eine Tabelle.
 *
 * Gelesen wird bis zur ersten Zeile, die nicht mehr passt - also weniger
 * Stuecke hat als das Mindestmass und auch keine Fortsetzung ist. Damit endet
 * die Tabelle dort, wo im Dokument der Fliesstext weitergeht, ohne dass
 * jemand eine Zeilenzahl angeben muesste.
 */
declare function tabelleAusZeilen(zeilen: Textzeile[], kopfzeile: number): Tabellenbefund;

/**
 * Stammdaten aus einer fremden Rechnung herausholen.
 *
 * Der Anlass: Die erste Huerde der App ist nicht die Rechnung, sondern der
 * Absender. Ohne Firmenname, Anschrift und Steuernummer laesst sich keine
 * gueltige Rechnung erzeugen - und wer umsteigt, hat all das schon auf seiner
 * alten Rechnung stehen. Es abzutippen ist die unnoetigste Arbeit des ganzen
 * Umzugs.
 *
 * ## Nach Sicherheit getrennt, nicht nach Feld
 *
 * Eine IBAN traegt eine Pruefsumme: Was den Mod-97-Test besteht, ist keine
 * Vermutung, sondern ein Befund. Ein Firmenname dagegen ist die Zeile ueber der
 * Strasse - mehr nicht. Beides gleich zu behandeln waere der Fehler, der sich
 * hinterher in jeder erzeugten Rechnung wiederholt.
 *
 * Deshalb traegt jeder Fund seine Sicherheit und seinen Beleg mit sich, und die
 * Oberflaeche kann Gepruefte anders anbieten als Geratene.
 *
 * ## Was ausdruecklich nicht gesucht wird
 *
 * **Rechnungsnummer und Rechnungsdatum.** Beide vergibt die App selbst - die
 * Nummer beim Festschreiben aus dem eigenen Nummernkreis, das Datum ist heute.
 * Sie aus einer alten Rechnung zu uebernehmen waere nicht nur nutzlos, sondern
 * gefaehrlich: Eine doppelt vergebene Rechnungsnummer verstoesst gegen
 * Paragraf 14 Absatz 4 UStG.
 *
 * **Wer Absender und wer Empfaenger ist.** Auf einer Rechnung stehen beide
 * Anschriften, und welche welche ist, haengt am Aufbau der Vorlage. Diese Datei
 * gibt beide in der Reihenfolge des Dokuments zurueck; die Zuordnung trifft ein
 * Mensch. Eine Verwechslung waere der teuerste Fehler ueberhaupt - man
 * verschickte Rechnungen unter fremdem Namen.
 */
type Sicherheit = 
/** Ein Verfahren bestaetigt es - etwa die IBAN-Pruefsumme. */
'geprueft'
/** Die Form stimmt, geprueft ist sie nicht. */
 | 'muster'
/** Aus der Umgebung geschlossen. */
 | 'geraten';
type Feld = 'name'
/** Die Person, an die adressiert ist - "Hr. Christian Ranacher". */
 | 'ansprechpartner' | 'strasse' | 'plz' | 'ort' | 'iban' | 'bic' | 'ustId' | 'steuernummer' | 'leitwegId';
interface Fund {
    feld: Feld;
    wert: string;
    sicherheit: Sicherheit;
    /** Die Zeile, in der es stand - damit der Nutzer nachsehen kann. */
    beleg: string;
}
interface Anschrift {
    /** Die Zeilen, aus denen sie gebildet wurde. */
    beleg: string[];
    felder: Fund[];
}
interface Stammdatenfund {
    /**
     * Gefundene Anschriften in der Reihenfolge des Dokuments. Welche der
     * eigenen ist, entscheidet der Nutzer.
     */
    anschriften: Anschrift[];
    /** Kennungen, die zu keiner Anschrift gehoeren muessen - IBAN, Steuernummer. */
    angaben: Fund[];
}
declare function findeStammdaten(zeilen: string[]): Stammdatenfund;

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
 * Das Absenderprofil - wer die Rechnung stellt, und wie sein Bogen aussieht.
 *
 * ## Ein Begriff, zwei Orte
 *
 * In der App hat ein Nutzer meist genau eines. Im Buero hat eine Agentur oder
 * ein Steuerbuero viele - eines je Mandant. Das ist aber **derselbe Begriff**,
 * nicht zwei: Ein Mandant ist ein Absenderprofil, von dem das Buero mehrere
 * haelt. Deshalb steht die Beschreibung hier, einmal und zentral, statt an
 * beiden Orten eigen zu wachsen.
 *
 * Der Nutzen ist kein aesthetischer: Ein Briefpapier, das im Buero angelegt
 * wurde, muss sich auf einem Geraet oeffnen lassen und umgekehrt. Zwei
 * Beschreibungen desselben Dings driften auseinander, und zwar genau dann,
 * wenn jemand sie braucht.
 *
 * ## Warum die Kennung aus der Identitaet kommt
 *
 * Sie wird nicht gewuerfelt, sondern aus Name, Ort und Steuernummer gebildet.
 * Damit ergibt dieselbe Firma auf zwei Geraeten dieselbe Kennung - ohne dass
 * die Geraete miteinander sprechen muessen. Eine zufaellige Kennung haette
 * denselben Bogen zweimal unter verschiedenem Namen abgelegt, und beim
 * naechsten Abgleich haette niemand mehr gewusst, welcher gilt.
 *
 * ## Warum das Briefpapier seine Herkunft traegt
 *
 * Ein Briefpapier wird aus einer fremden Rechnung gelesen, und auf einer
 * Rechnung stehen **zwei** Anschriften. Wer das Falsche uebernimmt, verschickt
 * kuenftig Rechnungen unter fremdem Briefkopf - der teuerste denkbare Fehler
 * dieses Programms. Deshalb merkt sich der Bogen, wessen Bogen er ist, und
 * `pruefeZuordnung` verweigert die Verwendung unter anderem Namen.
 */
interface Identitaet {
    /** Firmenname, wie er auf der Rechnung steht. */
    name: string;
    plz: string;
    ort: string;
    /** Umsatzsteuer-Identifikationsnummer, falls vorhanden. */
    ustId?: string;
    /** Steuernummer, falls keine USt-IdNr vorliegt. */
    steuernummer?: string;
}
interface Herkunft {
    /** Wie die Vorlage hiess, aus der gelesen wurde. */
    quelle: string;
    /** Tag des Auslesens, als ISO-Datum. */
    gelesenAm: string;
    /** Wen die Vorlage als Absender nannte. */
    identitaet: Identitaet;
}
interface Absenderprofil {
    /** Aus der Identitaet abgeleitet - siehe `kennungVon`. */
    kennung: string;
    identitaet: Identitaet;
    briefpapier?: Briefpapier;
    /** Nur gesetzt, wenn das Briefpapier aus einer Vorlage stammt. */
    herkunft?: Herkunft;
}
/**
 * Die Kennung eines Absenderprofils.
 *
 * Bevorzugt die Steuernummer, weil sie eindeutig ist; ohne sie bleibt Name mit
 * Ort. Das ist schwaecher - zwei gleichnamige Firmen am selben Ort fielen
 * zusammen - aber immer noch besser als eine zufaellige Kennung, die
 * garantiert nicht wiedererkannt wird.
 */
declare function kennungVon(identitaet: Identitaet): string;
declare function profilAus(identitaet: Identitaet): Absenderprofil;
type Zuordnung = 
/** Der Bogen gehoert zu diesem Profil. */
{
    urteil: 'passt';
}
/** Der Bogen hat keine Herkunft - selbst gebaut statt ausgelesen. */
 | {
    urteil: 'ohne-herkunft';
}
/** Der Bogen gehoert nachweislich zu jemand anderem. */
 | {
    urteil: 'fremd';
    gehoertZu: string;
};
/**
 * Darf dieses Briefpapier unter diesem Absender verwendet werden?
 *
 * Ein ausgelesener Bogen traegt die Identitaet, die in seiner Vorlage als
 * Absender stand. Stimmt sie nicht mit dem Profil ueberein, wird das gemeldet
 * statt stillschweigend hingenommen. Ein selbst gebauter Bogen ohne Herkunft
 * gilt nicht als fremd - er gehoert dem, der ihn baut.
 */
declare function pruefeZuordnung(profil: Absenderprofil, herkunft?: Herkunft): Zuordnung;
/**
 * Haengt ein ausgelesenes Briefpapier an ein Profil.
 *
 * Verweigert die Verbindung, wenn die Vorlage jemand anderen als Absender
 * nannte. Das ist die Stelle, an der ein Versehen aufgehalten wird: Wer die
 * Empfaengeranschrift statt der eigenen bestaetigt hat, bekommt hier eine
 * Absage statt spaeter fremde Rechnungen.
 */
declare function uebernimmBriefpapier(profil: Absenderprofil, briefpapier: Briefpapier, herkunft: Herkunft): {
    profil: Absenderprofil;
} | {
    fehler: Zuordnung;
};

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

/**
 * Steht das Zahlungsziel schon fest im Briefpapier?
 *
 * ## Warum das eine Frage ist
 *
 * Ein uebernommener Briefbogen bringt oft seine eigene Zahlungsklausel mit.
 * Nachgemessen an einer Fremdrechnung steht im Fuss: "Bitte ueberweisen Sie den
 * oben genannten Betrag innerhalb von 8 Tagen ohne Abzug ... Nach Ablauf dieser
 * Frist gilt die Rechnung als anerkannt."
 *
 * Setzt unser Zahlungsblock dann noch einmal "Zahlbar ohne Abzug bis zum ...",
 * steht die Frist zweimal auf dem Blatt - und wenn beide auseinanderlaufen,
 * widersprechen sie sich. Welche gilt, muesste im Streitfall ein Gericht
 * klaeren; das ist kein Zustand, den ein Rechnungsprogramm herstellen sollte.
 *
 * ## Was das Weglassen nicht betrifft
 *
 * Nur die Anzeige im Rumpf. Das XML behaelt seine Angabe: EN 16931 verlangt
 * mit BR-CO-25 entweder ein Faelligkeitsdatum oder eine Zahlungsbedingung, und
 * maschinell gelesen wird ohnehin das XML. Auf dem Papier steht die Frist
 * weiterhin - einmal statt zweimal.
 *
 * ## Warum nur gemeldet und nicht selbst entschieden
 *
 * Ob eine gefundene Klausel wirklich fuer jede kuenftige Rechnung gelten soll,
 * weiss nur der Absender. Wer immer acht Tage einraeumt, will sie im Bogen;
 * wer je nach Kunde anders vereinbart, braucht sie im Rumpf. Diese Datei
 * findet die Stelle und zitiert sie - entscheiden muss ein Mensch.
 */
interface Zahlungsklausel {
    /** Die Zeile, in der sie steht - zum Vorzeigen, damit ein Mensch urteilen kann. */
    beleg: string;
    /** Die gefundene Frist in Tagen, falls eine genannt ist. */
    tage?: number;
    /** Woran sie erkannt wurde. */
    merkmal: string;
}
/**
 * Sucht eine Zahlungsklausel im Text des Briefbogens.
 *
 * Gesucht wird ueber die zusammengesetzten Zeilen, nicht ueber die einzelnen
 * Stuecke: Eine Wendung wie "innerhalb von 8 Tagen" verteilt sich in einer
 * gesetzten Zeile leicht auf mehrere Stuecke und waere einzeln nicht zu finden.
 */
declare function findeZahlungsklausel(zeilen: string[]): Zahlungsklausel | undefined;
/**
 * Die Textstuecke eines Bogens zu Zeilen zusammenlegen.
 *
 * Noetig, weil eine gesetzte Zeile sich leicht auf mehrere Stuecke verteilt -
 * "innerhalb von 8 Tagen" kann in fuenf Teilen dastehen und waere einzeln in
 * keinem davon zu finden. Dasselbe gilt fuer eine Anschrift.
 */
declare function zeilenImBogen(papier: Briefpapier): string[];
/** Dasselbe fuer ein ausgelesenes Briefpapier. */
declare function zahlungsklauselImBogen(papier: Briefpapier): Zahlungsklausel | undefined;
/**
 * Steht die Bankverbindung schon im Briefbogen?
 *
 * Dann braucht die Rechnung keinen eigenen Zahlungsblock - die vermessene
 * Vorlage hat keinen: Ihre IBAN steht im Briefkopf, und der Fuss verweist mit
 * "auf unser oben stehendes Bankkonto" darauf.
 *
 * ## Warum nicht die Pruefsumme entscheidet
 *
 * Zuerst wurde eine IBAN verlangt, die Mod 97 besteht. Das schlug fehl, und
 * zwar aus dem richtigen Grund: Die Teilmengenschrift der Vorlage uebersetzt
 * einen Glyphen nicht zurueck, der IBAN fehlt beim Auslesen eine Ziffer, und
 * eine geprueft ungueltige IBAN anzubieten waere falsch.
 *
 * Nur ist das hier die falsche Frage. Es geht nicht darum, die Nummer zu
 * **benutzen**, sondern darum, ob sie auf dem Blatt schon **steht** - und sie
 * steht dort, vollstaendig und richtig, weil der Bogen mit den Glyphen der
 * Vorlage gesetzt wird. Was wir nicht entziffern koennen, kann der Empfaenger
 * trotzdem lesen.
 *
 * Deshalb genuegt die Beschriftung. Verlangt werden beide - IBAN und BIC -,
 * damit eine blosse Erwaehnung im Fliesstext nicht ausreicht.
 */
declare function bankverbindungImBogen(papier: Briefpapier): boolean;

/**
 * CCITT-Gruppe-4-Faxbilder entschluesseln (ITU-T T.6).
 *
 * ## Warum das hier steht
 *
 * Ein am Buerokopierer eingescanntes Blatt enthaelt keinen Text, sondern ein
 * Bild davon - lesbar nur mit Texterkennung. Und die braucht ein Bild.
 *
 * Nachgemessen an einem Scan aus einem Canon iR-ADV: Die Datei ist eine
 * gemischte Rasterdatei. Der ganzseitige JPEG-Hintergrund traegt die
 * Gestaltung - gruene Balken, Logo - aber **kein lesbares Wort**; der Text
 * steckt in einer 1888 x 2632 grossen Bildmaske daneben, faxcodiert. Wer nur
 * das JPEG an die Texterkennung gibt, bekommt nichts zurueck und weiss nicht
 * warum.
 *
 * Die Maske allein ist sogar das bessere Futter als eine zusammengesetzte
 * Seite: reines Schwarz auf Weiss, ohne Hintergrundrauschen.
 *
 * ## Warum selbst geschrieben
 *
 * Weil es sonst nichts kostet. Der Kern kommt ohne Abhaengigkeiten aus, und
 * derselbe Entschluesseler laeuft danach im Browser, in der App und in Node.
 * Eine Bibliothek dafuer waere auf jeder der drei Plattformen eine eigene
 * Frage gewesen.
 *
 * ## Was er kann und was nicht
 *
 * Nur K < 0, also reines zweidimensionales Gruppe-4. Das ist es, was Scanner
 * in PDF legen. Gruppe 3 (K >= 0) mit seinen Zeilensynchronisationen kommt
 * dort praktisch nicht vor und wird abgewiesen statt halb versucht.
 */
interface CcittAngaben {
    /** Bildbreite in Bildpunkten - im PDF die Angabe `Columns`. */
    breite: number;
    /** Bildhoehe. Fehlt sie, wird gelesen, bis die Daten enden. */
    hoehe?: number;
    /**
     * Ist eine Eins schwarz? Im PDF `BlackIs1`, Vorgabe falsch.
     *
     * Die Vorgabe dreht die Bedeutung um: Ohne die Angabe steht die Null fuer
     * Schwarz. Das Ergebnis dieser Datei ist davon unberuehrt - sie liefert
     * immer 1 fuer Schwarz -, aber wer die Rohbits selbst deutet, faellt darauf
     * herein.
     */
    schwarzIstEins?: boolean;
}
interface Fehlerbild {
    breite: number;
    hoehe: number;
    /** Ein Byte je Bildpunkt: 0 = weiss, 1 = schwarz. */
    punkte: Uint8Array;
    /** Zeilen, die vorzeitig abbrachen - ein Mass fuer die Verlaesslichkeit. */
    gestoerteZeilen: number;
}
/**
 * Entschluesselt ein Gruppe-4-Bild.
 *
 * Das Verfahren arbeitet zeilenweise gegen die Zeile darueber: Statt jeden
 * Bildpunkt zu nennen, beschreibt es, wo sich die Farbwechsel gegenueber der
 * Vorzeile verschieben. Die gedachte Zeile ueber der ersten ist ganz weiss.
 *
 * Gespeichert wird je Zeile nur die Liste der Wechselstellen. Das ist nicht
 * nur sparsam, sondern die Form, in der das Verfahren selbst denkt - mit
 * einem Punktfeld waere jede Suche nach dem naechsten Wechsel eine Schleife.
 */
declare function entschluesseleCcitt(daten: Uint8Array, angaben: CcittAngaben): Fehlerbild;

/**
 * Die Bilder einer Seite herausloesen - fuer die Texterkennung.
 *
 * ## Warum das noetig ist
 *
 * Ein eingescanntes Blatt enthaelt keinen Text, sondern ein Bild davon. Die
 * Texterkennung braucht dieses Bild, und aus einem PDF kommt man nur an zwei
 * Wegen daran: die Seite rastern - was einen vollstaendigen PDF-Zeichner
 * verlangt - oder die eingebetteten Bilder herausnehmen. Bei einem Scan ist
 * das zweite nicht nur billiger, sondern besser.
 *
 * ## Was ein Scanner tatsaechlich ablegt
 *
 * Nachgemessen an einem Canon iR-ADV: eine gemischte Rasterdatei. Ein
 * ganzseitiges JPEG traegt die Gestaltung - gruene Balken, Logo -, aber der
 * Text darin ist ausgewaschen und nicht zu lesen. Der Text steckt daneben in
 * einer faxcodierten Bildmaske, schwarz auf weiss.
 *
 * Deshalb wird die **Maske bevorzugt**: Sie ist das bessere Futter fuer die
 * Erkennung als die zusammengesetzte Seite, weil ihr das Hintergrundrauschen
 * fehlt. Wer stattdessen das JPEG nimmt, bekommt nichts zurueck und weiss
 * nicht, ob das Blatt leer war oder der Leser versagt hat.
 */
type Bildart = 'jpeg' | 'png';
interface Seitenbild {
    /** Der Name der Ressource im Dokument, etwa "Obj9". */
    name: string;
    art: Bildart;
    bytes: Uint8Array;
    breite: number;
    hoehe: number;
    /**
     * Eine Bildmaske - reiner Schwarzweissanteil, meist die Textebene eines
     * Scans. Sie hat Vorrang vor dem Hintergrundbild.
     */
    istMaske: boolean;
    /** Anteil der Seitenflaeche, den das Bild bedeckt - grob ueber die Masse. */
    deckung: number;
}
/**
 * Alle Bilder einer Seite, in der Reihenfolge ihrer Eignung fuer die Erkennung.
 *
 * Ganzseitige Masken zuerst, dann ganzseitige Bilder, dann der Rest. Wer die
 * Liste von vorn abarbeitet, gibt der Erkennung zuerst das, worauf am ehesten
 * Text steht.
 */
declare function liesSeitenbilder(bytes: Uint8Array, seite?: number): Promise<Seitenbild[]>;

/**
 * Baut ein PNG aus einem Byte je Bildpunkt, 0 bis 255 in Grau.
 *
 * Jede Zeile bekommt ein fuehrendes Nullbyte - die Filterart "keine". PNG
 * erlaubt je Zeile eine andere Vorhersage, was Platz spart; darauf zu
 * verzichten kostet hier nichts, weil danach ohnehin komprimiert wird.
 */
declare function alsGraustufenPng(breite: number, hoehe: number, grau: Uint8Array): Uint8Array;
/** Eine Faxmaske in Graustufen: 1 bedeutet schwarz. */
declare function maskeAlsGrau(punkte: Uint8Array): Uint8Array;

/**
 * Wer im Briefkopf als Absender steht.
 *
 * ## Warum eine Liste und keine Antwort
 *
 * Weil auf einer Rechnung immer zwei Anschriften stehen: die des Ausstellers
 * und die des Empfaengers. Welche welche ist, laesst sich aus der Lage allein
 * nicht sicher sagen - manche Boegen setzen den Absender unten, manche
 * zweizeilig neben das Zeichen. Waehlen soll deshalb ein Mensch; wer hier
 * raet, laesst jemanden unter dem Briefkopf seines Kunden verschicken.
 *
 * ## Warum nur vollstaendige Anschriften
 *
 * Genommen wird nur, was Name, Postleitzahl und Ort traegt. Eine Anschrift
 * ohne Namen taugt nicht zur Zuordnung, und eine Auswahl anzubieten, die
 * hinterher abgewiesen wird, waere nur aergerlich.
 */
declare function anschriftenAus(papier: Briefpapier): {
    identitaet: Identitaet;
    beleg: string;
}[];

/**
 * Die Schriften eines Briefkopfs, herausgeloest in eine eigene kleine Datei.
 *
 * ## Warum es das gibt
 *
 * Der Briefkopf einer uebernommenen Vorlage wird am besten **wiedergegeben**:
 * dieselben Glyphennummern, dieselben Vorschuebe, dieselbe Schrift. Dafuer
 * braucht es die Schriftobjekte der Quelldatei - und die lagen bisher nur im
 * Original-PDF. Die App hebt das nicht auf; sie liest es einmal und behaelt
 * die Messwerte.
 *
 * Ohne die Schriften wird der Briefkopf mit der Hausschrift nachgezeichnet
 * und je Textlauf auf seine gemessene Breite eingepasst. Anfang und Ende jeder
 * Zeile stimmen dann, die Wortabstaende dazwischen nicht. Nachgemessen an
 * einer Fremdrechnung, deren Fusszeile im **Blocksatz** steht: Ihre Deckung
 * fiel von 100 auf 44,6 Prozent, waehrend Rumpf und Kennzahlen unveraendert
 * blieben.
 *
 * ## Warum nicht das ganze PDF aufheben
 *
 * Weil darin die alte Rechnung steht - mit dem Namen eines Kunden, seinen
 * Positionen und Betraegen. Diese Daten in jedem Absenderprofil und in jeder
 * weitergegebenen Briefbogendatei mitzufuehren waere eine Datensammlung ohne
 * Zweck. Gebraucht werden die Schriften, nicht der Vorgang.
 *
 * Und es waere gross: Die Vorlage wiegt eine halbe Megabyte, ihre vier
 * Schriften zusammen fuenfzehn Kilobyte. Eingebettet ist naemlich nur eine
 * Teilmenge - die Zeichen, die auf jener einen Seite vorkamen.
 *
 * ## Was herauskommt
 *
 * Eine gueltige PDF-Datei mit **einer leeren Seite**, deren Schriftverzeichnis
 * dieselben Namen traegt wie das Original. Damit ist sie genau das, was
 * `bereiteVorlagenschrift` als Quelle erwartet - der Renderer braucht keine
 * Zeile Aenderung, und wer eine echte Vorlage hat, kann sie weiterhin
 * uebergeben.
 */
/**
 * Loest die Schriften des Briefkopfs aus der Quelldatei.
 *
 * Genommen werden nur die, die seine Textlaeufe wirklich benutzen - eine
 * Rechnung bettet oft Schnitte ein, die nur im Rechnungsteil vorkommen, und
 * die gehoeren nicht zum Bogen.
 *
 * Gibt `undefined` zurueck, wenn nichts zu holen ist: kein Textlauf, keine
 * Schriftressource, oder die Datei laesst sich nicht lesen. Dann bleibt es
 * beim Nachzeichnen.
 */
declare function schriftbogenAus(quelle: Uint8Array, papier: Briefpapier, quellseite?: number): Promise<Uint8Array | undefined>;

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
interface Vorlagenvorschlag {
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
 * Liest Wortwahl und Stellung aus einer Seite.
 *
 * `seitenhoehe` wird gebraucht, um "oberhalb des Anschriftenfeldes" von
 * "darunter" zu unterscheiden - ohne sie waeren die Hoehen nur Zahlen.
 */
declare function schlageVorlageVor(seite: Textseite, seitenhoehe: number, inhaltLinks?: number): Vorlagenvorschlag;
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
interface Vorlagenschalter {
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
declare function schalterAusVorschlag(vorschlag: Vorlagenvorschlag): Vorlagenschalter;

/**
 * Der Briefbogen eines Absenders als eine Datei.
 *
 * ## Warum es das gibt
 *
 * Bis hierher entstand alles auf dem Geraet: Der Nutzer waehlt eine alte
 * Rechnung, sie wird vermessen, und das Ergebnis liegt in seinem Profil.
 * Damit ist es an dieses eine Geraet gebunden. Wer sein Telefon wechselt,
 * faengt von vorn an; wer am Rechner und am Telefon abrechnet, hat zwei
 * verschiedene Briefbogen; und wem die Uebernahme nicht gelingt, dem kann
 * niemand helfen, weil es nichts gibt, das man ihm schicken koennte.
 *
 * Diese Datei ist das fehlende Stueck: alles Gemessene an einer Stelle,
 * lesbar, uebertragbar, ersetzbar.
 *
 * ## Warum sie die Identitaet mitfuehrt
 *
 * Weil eine Briefbogendatei sonst das perfekte Werkzeug waere, um unter
 * fremdem Namen Rechnungen zu stellen. Sie traegt deshalb dieselbe Herkunft
 * wie das Profil, und beim Einlesen wird sie gegen den eigenen Absender
 * geprueft - genau so, wie es beim Uebernehmen aus einer fremden Rechnung
 * geschieht. Wer die Datei eines anderen einliest, bekommt eine Warnung und
 * keinen Briefkopf.
 *
 * ## Warum JSON und kein eigenes Format
 *
 * Weil ein Mensch hineinsehen koennen soll. Was hier gemessen wurde, ist
 * nicht offensichtlich - Einzuege, Rasterabstaende, Fluchtlinien -, und die
 * einzige Beschwerde, die dazu je kommen wird, lautet "das steht falsch".
 * Dann muss man nachsehen und aendern koennen, ohne uns zu fragen.
 */
/** Die Kennung im Kopf der Datei. */
declare const BOGENDATEI_ART = "erechnung-briefbogen";
/**
 * Die Fassung des Formats.
 *
 * Steigt, sobald sich die Bedeutung eines Feldes aendert - nicht, wenn eines
 * hinzukommt. Fehlende Felder fallen beim Lesen auf ihre Vorgabe zurueck; ein
 * umgedeutetes Feld waere dagegen still falsch.
 */
declare const BOGENDATEI_FASSUNG = 1;
interface Bogendatei {
    art: typeof BOGENDATEI_ART;
    fassung: number;
    /** Wann sie geschrieben wurde - als Datum, nicht als Zeitpunkt. */
    erzeugtAm: string;
    /** Wie das Profil heisst, aus dem sie stammt. */
    bezeichnung?: string;
    /** Wessen Bogen das ist. Ohne diese Angabe wird nichts uebernommen. */
    herkunft: Herkunft;
    briefpapier: Briefpapier;
    beschriftungen?: Partial<Beschriftungen>;
    kennzahlen?: Kennzahlenstellung;
    vorlage?: Vorlagenschalter;
    /**
     * Die Hausschrift, als base64.
     *
     * Sie macht die Datei gross - zwei Schnitte sind schnell ein halbes
     * Megabyte. Sie wegzulassen waere trotzdem falsch: Ohne sie sieht die
     * Rechnung auf dem neuen Geraet anders aus als auf dem alten, und genau
     * das soll die Datei ja verhindern.
     */
    schrift?: {
        name?: string;
        regular: string;
        fett?: string;
        kraeftig?: string;
    };
}
/** Was ein Profil an uebertragbarer Gestaltung mitbringt. */
interface Bogenquelle {
    bezeichnung?: string;
    briefpapierHerkunft?: Herkunft;
    briefpapier?: Briefpapier;
    beschriftungen?: Partial<Beschriftungen>;
    kennzahlen?: Kennzahlenstellung;
    vorlage?: Vorlagenschalter;
    schriftName?: string;
    schriftRegular?: string;
    schriftFett?: string;
    schriftKraeftig?: string;
}
/**
 * Schreibt die Datei aus einem Profil.
 *
 * Gibt `undefined` zurueck, wenn es nichts zu schreiben gibt: ohne Bogen und
 * ohne Herkunft waere die Datei ein leeres Versprechen, und beim Einlesen
 * liesse sich nicht pruefen, wem sie gehoert.
 */
declare function alsBogendatei(quelle: Bogenquelle, heute: string): Bogendatei | undefined;
/** Warum eine Datei nicht angenommen wurde. */
type Bogenmangel = 'kein-json' | 'fremde-art' | 'zu-neu' | 'unvollstaendig';
interface Bogenbefund {
    datei?: Bogendatei;
    mangel?: Bogenmangel;
    /** Ob die Datei zum eigenen Absender passt - nur bei fehlerfreier Datei. */
    zuordnung?: Zuordnung;
}
/**
 * Liest eine Briefbogendatei und ordnet sie dem eigenen Absender zu.
 *
 * Beides in einem Schritt, weil das eine ohne das andere nichts wert ist: Eine
 * gueltige Datei, die einem fremden Absender gehoert, darf nicht uebernommen
 * werden, und die Frage laesst sich nur hier beantworten - danach ist die
 * Herkunft nur noch ein Feld unter vielen.
 */
declare function liesBogendatei(text: string, eigene: Identitaet): Bogenbefund;
/** Was dem Nutzer zu einem Mangel gesagt wird. */
declare function bogenmangelText(mangel: Bogenmangel): string;

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
 * Passt der Kennzahlenblock neben den uebernommenen Briefbogen?
 *
 * ## Warum das geprueft werden muss
 *
 * Der Bogen kommt aus einer fremden Rechnung und weiss nichts von unserem
 * Aufbau. Wo bei uns Rechnungsnummer und Datum stehen, hat er womoeglich sein
 * Firmenzeichen. Gedruckt sieht man das sofort - aber dann ist die Rechnung
 * schon beim Empfaenger.
 *
 * Die Angaben dafuer liegen bereits vor: Jeder Pfad des Bogens traegt sein
 * umschliessendes Rechteck, jedes Textstueck seine gemessene Breite. Es fehlt
 * nur der Vergleich.
 *
 * ## Warum nicht einfach verschoben wird
 *
 * Weil eine automatische Ausweichstellung den Nutzer ueberraschen wuerde: Er
 * hat den Block bewusst dorthin gesetzt, wo seine alte Rechnung ihn hatte.
 * Diese Datei meldet den Zusammenstoss und nennt die freien Stellungen -
 * waehlen soll ein Mensch.
 *
 * ## Der Massstab
 *
 * Der Bogen wird auf A4 gesetzt und dabei um die halbe Groessendifferenz
 * verschoben, weil Druckvorlagen einen Beschnittrand tragen. Dieselbe
 * Verschiebung gilt hier - sonst prueft man gegen Stellen, an denen nichts
 * gedruckt wird.
 */
interface Rahmen {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
interface Stellungsbefund {
    stellung: Kennzahlenstellung;
    frei: boolean;
    /** Die groesste Ueberschneidung in Quadratpunkten - null, wenn frei. */
    ueberschneidung: number;
    /**
     * Wie viel vom Kennzahlenblock verdeckt waere, als Anteil.
     *
     * Aussagekraeftiger als die blosse Flaeche: Ein Zusammenstoss mit einer
     * Haarlinie ist etwas anderes als einer mit einem Firmenzeichen.
     */
    anteil: number;
    /**
     * Der gepruefte Rahmen.
     *
     * Mitgegeben, damit niemand die Rechnung nachbauen muss, um zu wissen, wo
     * geprueft wurde - weder eine Oberflaeche, die es anzeigen will, noch ein
     * Test, der ein Hindernis genau dorthin legt. Eine nachgebaute Rechnung
     * waere die Stelle, an der Pruefung und Test gemeinsam danebenliegen, ohne
     * dass es auffiele.
     */
    rahmen: Rahmen;
}
/**
 * Die belegten Flaechen eines Bogens, bereits auf A4 verschoben.
 *
 * Textstuecke bekommen ihre gemessene Breite und eine Hoehe aus der
 * Schriftgroesse. Das ist etwas grosszuegig - Unterlaengen zaehlen mit -, und
 * grosszuegig ist hier die richtige Richtung: Lieber einmal zu viel warnen
 * als eine ueberdruckte Rechnung.
 */
declare function belegteFlaechen(papier: Briefpapier): Rahmen[];
/**
 * Prueft eine einzelne Stellung gegen den Bogen.
 *
 * `zeilen` ist die Zahl der gefuellten Kennzahlen - sie bestimmt, wie tief der
 * Block reicht. Wer hier grosszuegig schaetzt, prueft gegen einen groesseren
 * Block als gedruckt wird, und das ist die richtige Richtung.
 */
declare function pruefeStellung(papier: Briefpapier, stellung: Kennzahlenstellung, zeilen: number, flaechen?: Rahmen[]): Stellungsbefund;
/**
 * Prueft alle Stellungen und ordnet sie nach Eignung.
 *
 * Die freieste zuerst. Der Aufrufer kann damit sowohl warnen ("die gewaehlte
 * ist belegt") als auch vorschlagen ("diese waere frei"), ohne selbst zu
 * rechnen.
 */
declare function pruefeAlleStellungen(papier: Briefpapier, zeilen: number): Stellungsbefund[];

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

export { A4, type Absenderprofil, type Anschrift, BOGENDATEI_ART, BOGENDATEI_FASSUNG, BUNDLED_SPECIFICATIONS, type Beschriftung, type Beschriftungen, type Bildart, type Bogenbefund, type Bogendatei, type Bogenmangel, type Bogenquelle, type Breiten, type Briefpapier, type CcittAngaben, type CiiOptions, DEFAULT_THEME, type DeclaredTotals, EAS, EInvoiceError, type EInvoiceErrorCode, type ExtractedAttachment, type FacturXConformanceLevel, type Farbe, type Fehlerbild, type Feld, type Flaeche, type Folgeart, type Fund, type Herkunft, INVOICE_TYPE_CODES, type Identitaet, Invoice, InvoiceInput, type InvoiceSyntax, type InvoiceTotals, type InvoiceTypeCode, type IsoDate, type Kennzahlenstellung, type Kreis, Line, MAX_SCHRIFT_BYTES, PAYMENT_MEANS, PROFILE_ID, type ParsedInvoice, type PaymentMeansCode, type PdfText, type Pfad, RECHNUNGSZEICHEN, ROLLEN, type Rahmen, type ReceivedInvoice, type RenderAssets, type RenderOptions, type RenderResult, STANDARD_BESCHRIFTUNGEN, type Schriftbefund, type Schriftmangel, type Seitenbild, type Severity, type Sicherheit, type SourceKind, type Spaltenrolle, type SpecificationAge, type SpecificationEntry, SpecificationError, type SpecificationSet, type Stammdatenfund, type Stellungsbefund, type Strich, type Tabellenbefund, type Textlauf, type Textseite, type Textstueck, type Textzeile, type Theme, UNIT, type UblOptions, type Uebernahme, type UnitCode, VAT_CATEGORY, type ValidationIssue, type ValidationResult, Vat, type VatBreakdownEntry, type VatCategoryCode, type Vorlagenbefund, type Vorlagenschalter, type Vorlagenvorschlag, type WordAbsatz, type WordBlock, type WordDokument, type WordTabelle, XmlWriter, type XmpOptions, ZERO_RATE_CATEGORIES, type Zahlungsklausel, type Zeichenbefund, ZeichenvorratFehler, type Zuordnung, activeSpecifications, addDays, alsBogendatei, alsGraustufenPng, alsHex, alsSvg, anschriftenAus, bankverbindungImBogen, belegteFlaechen, beschriftungenMit, bogenmangelText, buildCii, buildInvoiceXml, buildUbl, buildXmp, computeTotals, decimal, detectKind, entschluesseleCcitt, escapeXml, extractAttachments, extractInvoiceXml, familienkern, farbeAusHex, findeFussgrenze, findeGrenze, findeStammdaten, findeStrichstaerken, findeZahlungsklausel, folgedokument, formatAmount, formatDate, formatQuantity, fromBase64, isIsoDate, isPlausibleIban, isPlausibleLeitwegId, isPlausibleVatId, istBrauchbareBeschriftung, istKleinunternehmerRechnung, istPng, kennungVon, kennzahlenrahmen, laufbreite, liefereBreiten, liesBogendatei, liesBriefpapier, liesPdfText, liesSeitenbilder, liesWordDokument, lineNetAmount, maskeAlsGrau, nurAbweichungen, ohneUnsichtbare, parseInvoiceXml, parseSpecificationSet, pngFarbtyp, positionenAus, profilAus, pruefeAlleStellungen, pruefeSchrift, pruefeSchriftpaar, pruefeStellung, pruefeZuordnung, readEInvoice, renderZugferdPdf, resetSpecifications, round, sanitizeXmlText, schalterAusVorschlag, schlageKopfzeileVor, schlageVorlageVor, schlageZuordnungVor, schriftbogenAus, schriftenImBriefkopf, schriftmangelText, setActiveSpecifications, setzeMitVorlagenschrift, signaturVon, specificationAge, sum, summarizeTotals, tabelleAusZeilen, themaMitAkzent, toBase64, toCiiDate, uebernimmBriefpapier, utf8Decode, utf8Encode, validateInvoice, wrapText, xmpDate, zahlAus, zahlungsklauselImBogen, zeichneBriefpapier, zeilenImBogen };
