/**
 * Codelisten nach EN 16931 / UN/CEFACT. Nur die fuer deutsche Rechnungen
 * praktisch relevanten Eintraege - die vollen Listen sind riesig und werden
 * bei Bedarf ergaenzt.
 */

/** BT-3 Rechnungsart (UNTDID 1001) */
export const INVOICE_TYPE_CODES = {
  /** Handelsrechnung */
  COMMERCIAL_INVOICE: '380',
  /** Gutschrift / Stornorechnung */
  CREDIT_NOTE: '381',
  /** Korrigierte Rechnung */
  CORRECTED_INVOICE: '384',
  /** Selbstfakturierung (Gutschriftverfahren nach §14 Abs. 2 UStG) */
  SELF_BILLED_INVOICE: '389',
  /** Vorausrechnung / Abschlagsrechnung */
  PREPAYMENT_INVOICE: '386',
} as const;
export type InvoiceTypeCode = (typeof INVOICE_TYPE_CODES)[keyof typeof INVOICE_TYPE_CODES];

/** BT-95/BT-102/BT-118 Umsatzsteuerkategorie (UNTDID 5305) */
export const VAT_CATEGORY = {
  /** Regelsteuersatz / ermaessigter Satz */
  STANDARD: 'S',
  /** Nullsatz */
  ZERO: 'Z',
  /** Steuerbefreit (z.B. §4 UStG, §19 UStG Kleinunternehmer) */
  EXEMPT: 'E',
  /** Reverse Charge (§13b UStG) */
  REVERSE_CHARGE: 'AE',
  /** Innergemeinschaftliche Lieferung */
  INTRA_COMMUNITY: 'K',
  /** Ausfuhrlieferung ausserhalb EU */
  EXPORT: 'G',
  /** Nicht im Anwendungsbereich der Steuer */
  OUT_OF_SCOPE: 'O',
} as const;
export type VatCategoryCode = (typeof VAT_CATEGORY)[keyof typeof VAT_CATEGORY];

/** Kategorien, bei denen der Satz zwingend 0 ist und ein Befreiungsgrund gehoert */
export const ZERO_RATE_CATEGORIES: VatCategoryCode[] = ['Z', 'E', 'AE', 'K', 'G', 'O'];

/** BT-81 Zahlungsart (UNTDID 4461) */
export const PAYMENT_MEANS = {
  /** Nicht definiert */
  NOT_DEFINED: '1',
  /** Barzahlung */
  CASH: '10',
  /** Scheck */
  CHEQUE: '20',
  /** Ueberweisung */
  CREDIT_TRANSFER: '30',
  /** SEPA-Ueberweisung */
  SEPA_CREDIT_TRANSFER: '58',
  /** SEPA-Lastschrift */
  SEPA_DIRECT_DEBIT: '59',
  /** Kreditkarte */
  CARD: '48',
  /** Verrechnung / bereits bezahlt */
  SET_OFF: '97',
} as const;
export type PaymentMeansCode = (typeof PAYMENT_MEANS)[keyof typeof PAYMENT_MEANS];

/** BT-130 Mengeneinheit (UN/ECE Rec. 20) - haeufigste */
export const UNIT = {
  /** Stueck */
  PIECE: 'C62',
  /** Stunde */
  HOUR: 'HUR',
  /** Tag */
  DAY: 'DAY',
  /** Monat */
  MONTH: 'MON',
  /** Kilogramm */
  KILOGRAM: 'KGM',
  /** Meter */
  METRE: 'MTR',
  /** Quadratmeter */
  SQUARE_METRE: 'MTK',
  /** Liter */
  LITRE: 'LTR',
  /** Pauschal / Einheit */
  LUMP_SUM: 'LS',
  /** Kilometer */
  KILOMETRE: 'KMT',
} as const;
export type UnitCode = (typeof UNIT)[keyof typeof UNIT];

/** BT-34/BT-49 Schema der elektronischen Adresse (EAS) */
export const EAS = {
  /** Deutsche Leitweg-ID */
  LEITWEG_ID: '0204',
  /** GLN */
  GLN: '0088',
  /** E-Mail */
  EMAIL: 'EM',
  /** Umsatzsteuer-Identnummer */
  VAT_ID: '9930',
} as const;

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
export const PROFILE_ID = {
  ZUGFERD_EN16931: 'urn:cen.eu:en16931:2017',
  ZUGFERD_EXTENDED: 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended',
  XRECHNUNG_CIUS: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
} as const;
