import { z } from 'zod';
import { isIsoDate } from '../util/date';

const isoDate = z.string().refine(isIsoDate, { message: 'Datum muss YYYY-MM-DD sein' });
const nonEmpty = z.string().trim().min(1);
const amount = z.number().finite();

/** BG-5 / BG-8 Postanschrift */
export const AddressSchema = z.object({
  /** BT-35 / BT-50 Strasse und Hausnummer */
  line1: z.string().trim().default(''),
  /** BT-36 / BT-51 Adresszusatz */
  line2: z.string().trim().optional(),
  /** BT-37 / BT-52 Ort */
  city: nonEmpty,
  /** BT-38 / BT-53 Postleitzahl */
  postcode: z.string().trim().optional(),
  /** BT-39 / BT-54 Bundesland */
  subdivision: z.string().trim().optional(),
  /** BT-40 / BT-55 Laendercode ISO 3166-1 alpha-2 */
  countryCode: z.string().trim().length(2).toUpperCase().default('DE'),
});
export type Address = z.infer<typeof AddressSchema>;

/** BG-6 / BG-9 Kontaktangaben */
export const ContactSchema = z.object({
  name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
});

/** BT-34 / BT-49 elektronische Adresse mit Schemakennung */
export const ElectronicAddressSchema = z.object({
  value: nonEmpty,
  /** EAS-Code, z.B. "EM" fuer E-Mail oder "0204" fuer die Leitweg-ID */
  scheme: nonEmpty,
});

/** BG-4 Verkaeufer / BG-7 Kaeufer */
export const PartySchema = z.object({
  /** BT-27 / BT-44 eingetragener Name */
  name: nonEmpty,
  /** BT-28 / BT-45 abweichender Handelsname */
  tradingName: z.string().trim().optional(),
  address: AddressSchema,
  /** BT-31 / BT-48 Umsatzsteuer-Identifikationsnummer */
  vatId: z.string().trim().optional(),
  /** BT-32 Steuernummer des Verkaeufers (Alternative zur USt-IdNr.) */
  taxNumber: z.string().trim().optional(),
  /** BT-29 / BT-46 Kennung des Geschaeftspartners, z.B. Kundennummer */
  identifier: z.string().trim().optional(),
  /** BT-30 / BT-47 Registereintrag, z.B. Handelsregisternummer */
  legalRegistrationId: z.string().trim().optional(),
  electronicAddress: ElectronicAddressSchema.optional(),
  contact: ContactSchema.optional(),
});
export type Party = z.infer<typeof PartySchema>;

/** Steuerliche Einordnung einer Position oder eines Zu-/Abschlags */
export const VatSchema = z.object({
  /** BT-151 Kategorie nach UNTDID 5305 */
  category: z.enum(['S', 'Z', 'E', 'AE', 'K', 'G', 'O']),
  /** BT-152 Satz in Prozent, z.B. 19 */
  rate: z.number().min(0).max(100),
  /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
  exemptionReason: z.string().trim().optional(),
  /** BT-121 codierter Befreiungsgrund nach VATEX */
  exemptionReasonCode: z.string().trim().optional(),
});
export type Vat = z.infer<typeof VatSchema>;

/** BG-20 / BG-21 Zu- und Abschlag */
export const AllowanceChargeSchema = z.object({
  /** true = Zuschlag (BG-21), false = Abschlag (BG-20) */
  isCharge: z.boolean().default(false),
  /** BT-92 / BT-99 Betrag, immer positiv angegeben */
  amount: amount.nonnegative(),
  /** BT-93 / BT-100 Basisbetrag fuer prozentuale Angaben */
  baseAmount: amount.nonnegative().optional(),
  /** BT-94 / BT-101 Prozentsatz */
  percentage: z.number().min(0).max(100).optional(),
  /** BT-97 / BT-104 Grund im Klartext */
  reason: z.string().trim().optional(),
  /** BT-98 / BT-105 codierter Grund */
  reasonCode: z.string().trim().optional(),
  vat: VatSchema,
});
export type AllowanceCharge = z.infer<typeof AllowanceChargeSchema>;

/** BG-25 Rechnungsposition */
export const LineSchema = z.object({
  /** BT-126 Positionsnummer, eindeutig im Dokument */
  id: nonEmpty,
  /** BT-153 Artikelname */
  name: nonEmpty,
  /** BT-154 Beschreibung */
  description: z.string().trim().optional(),
  /** BT-155 Artikelnummer des Verkaeufers */
  sellerItemId: z.string().trim().optional(),
  /** BT-157 GTIN oder EAN */
  globalItemId: z.string().trim().optional(),
  /** BT-129 Menge */
  quantity: amount,
  /** BT-130 Mengeneinheit nach UN/ECE Rec. 20 */
  unitCode: z.string().trim().default('C62'),
  /** BT-146 Nettoeinzelpreis */
  unitPrice: amount,
  /** BT-149 Preisbasismenge, falls der Einzelpreis fuer mehrere Einheiten gilt */
  priceBaseQuantity: amount.positive().optional(),
  /** BT-147 Rabatt auf den Bruttoeinzelpreis */
  unitPriceDiscount: amount.nonnegative().optional(),
  /** BT-148 Bruttoeinzelpreis vor Rabatt */
  grossUnitPrice: amount.optional(),
  vat: VatSchema,
  /** BG-27 / BG-28 Zu- und Abschlaege auf Positionsebene */
  allowancesCharges: z.array(AllowanceChargeSchema).default([]),
  /** BT-134 Beginn des Abrechnungszeitraums der Position */
  periodStart: isoDate.optional(),
  /** BT-135 Ende des Abrechnungszeitraums der Position */
  periodEnd: isoDate.optional(),
  /** BT-132 Referenz auf die Bestellposition */
  orderLineReference: z.string().trim().optional(),
  /** BG-32 Artikelattribute, z.B. Farbe oder Groesse */
  attributes: z.array(z.object({ name: nonEmpty, value: nonEmpty })).default([]),
});
export type Line = z.infer<typeof LineSchema>;

/** BG-16 Zahlungsangaben */
export const PaymentSchema = z.object({
  /** BT-81 Zahlungsart nach UNTDID 4461 */
  meansCode: z.string().trim().default('58'),
  /** BT-82 Zahlungsart im Klartext */
  meansText: z.string().trim().optional(),
  /** BT-84 IBAN des Zahlungsempfaengers */
  iban: z.string().trim().optional(),
  /** BT-86 BIC */
  bic: z.string().trim().optional(),
  /** BT-85 Kontoinhaber */
  accountName: z.string().trim().optional(),
  /** BT-83 Verwendungszweck */
  remittanceInformation: z.string().trim().optional(),
  /** BT-89 Mandatsreferenz bei SEPA-Lastschrift */
  mandateReference: z.string().trim().optional(),
  /** BT-90 Glaeubiger-Identifikationsnummer */
  creditorIdentifier: z.string().trim().optional(),
  /** BT-20 Zahlungsbedingungen im Klartext */
  terms: z.string().trim().optional(),
});
export type Payment = z.infer<typeof PaymentSchema>;

/** BG-24 rechnungsbegruendende Unterlage */
export const AttachmentSchema = z.object({
  /** BT-122 Kennung der Unterlage */
  id: nonEmpty,
  /** BT-123 Beschreibung */
  description: z.string().trim().optional(),
  /** BT-125-1 Dateiname */
  filename: z.string().trim().optional(),
  /** BT-125-2 MIME-Typ, zulaessig sind u.a. application/pdf, image/png, text/csv */
  mimeType: z.string().trim().optional(),
  /** Binaerinhalt der Unterlage */
  data: z.instanceof(Uint8Array).optional(),
  /** BT-124 externe Fundstelle statt eingebetteter Datei */
  uri: z.string().trim().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/** Zielformat - bestimmt Profilkennung, Syntax und Validierungsregeln */
export const InvoiceProfileSchema = z.enum([
  /** ZUGFeRD 2.3 / Factur-X, Profil EN 16931, eingebettet in PDF/A-3 */
  'zugferd-en16931',
  /** XRechnung 3.0 in CII-Syntax, reines XML */
  'xrechnung-cii',
  /** XRechnung 3.0 in UBL-Syntax, reines XML */
  'xrechnung-ubl',
]);
export type InvoiceProfile = z.infer<typeof InvoiceProfileSchema>;

export const InvoiceSchema = z.object({
  profile: InvoiceProfileSchema.default('zugferd-en16931'),
  /** BT-1 Rechnungsnummer */
  number: nonEmpty,
  /** BT-3 Rechnungsart nach UNTDID 1001 */
  typeCode: z.string().trim().default('380'),
  /** BT-2 Rechnungsdatum */
  issueDate: isoDate,
  /** BT-9 Faelligkeitsdatum */
  dueDate: isoDate.optional(),
  /** BT-72 Liefer- oder Leistungsdatum */
  deliveryDate: isoDate.optional(),
  /** BG-14 Beginn des Abrechnungszeitraums */
  periodStart: isoDate.optional(),
  /** BG-14 Ende des Abrechnungszeitraums */
  periodEnd: isoDate.optional(),
  /** BT-5 Waehrung nach ISO 4217 */
  currency: z.string().trim().length(3).toUpperCase().default('EUR'),
  /** BT-10 Kaeuferreferenz - bei XRechnung die Leitweg-ID und Pflichtfeld */
  buyerReference: z.string().trim().optional(),
  /** BT-13 Bestellnummer des Kaeufers */
  orderReference: z.string().trim().optional(),
  /** BT-12 Vertragsnummer */
  contractReference: z.string().trim().optional(),
  /** BT-11 Projektnummer */
  projectReference: z.string().trim().optional(),
  /** BT-14 Auftragsnummer des Verkaeufers */
  sellerOrderReference: z.string().trim().optional(),
  /** BT-25 / BT-26 vorausgegangene Rechnung, Pflicht bei Storno und Korrektur */
  precedingInvoice: z.object({ number: nonEmpty, issueDate: isoDate.optional() }).optional(),

  seller: PartySchema,
  buyer: PartySchema,
  /** BG-10 abweichender Zahlungsempfaenger */
  payee: PartySchema.partial({ address: true }).optional(),
  /** BG-13 abweichende Lieferanschrift */
  deliveryAddress: AddressSchema.optional(),
  /** BT-70 Name des Lieferorts */
  deliveryName: z.string().trim().optional(),

  lines: z.array(LineSchema).min(1),
  /** Zu- und Abschlaege auf Dokumentebene */
  allowancesCharges: z.array(AllowanceChargeSchema).default([]),
  payment: PaymentSchema.optional(),
  /** BG-1 Bemerkungen zur Rechnung */
  notes: z
    .array(z.object({ text: nonEmpty, subjectCode: z.string().trim().optional() }))
    .default([]),
  /** BT-113 bereits gezahlter Betrag */
  paidAmount: amount.nonnegative().default(0),
  /** BT-114 Rundungsbetrag */
  roundingAmount: amount.default(0),
  attachments: z.array(AttachmentSchema).default([]),
});

export type Invoice = z.infer<typeof InvoiceSchema>;
/** Eingabeform vor Anwendung der Defaults */
export type InvoiceInput = z.input<typeof InvoiceSchema>;

/** Validiert die Struktur und ergaenzt Defaults. Wirft bei Strukturfehlern. */
export function parseInvoice(input: InvoiceInput): Invoice {
  return InvoiceSchema.parse(input);
}
