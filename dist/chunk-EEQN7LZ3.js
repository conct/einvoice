// src/util/date.ts
var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function toCiiDate(value) {
  return value.replace(/-/g, "");
}
function formatDate(value) {
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}
function addDays(value, days) {
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// src/util/money.ts
function round(value, decimals = 2) {
  if (!Number.isFinite(value)) throw new RangeError(`Kein endlicher Betrag: ${value}`);
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const eps = Math.sign(scaled) * 1e-9;
  return Math.round(scaled + eps) / factor;
}
function sum(values, decimals = 2) {
  let total = 0;
  for (const v of values) total = round(total + round(v, decimals), decimals);
  return total;
}
function decimal(value, decimals = 2) {
  const r = round(value, decimals);
  const out = (Object.is(r, -0) ? 0 : r).toFixed(decimals);
  return out === `-${0 .toFixed(decimals)}` ? 0 .toFixed(decimals) : out;
}
function formatAmount(value, currency, decimals = 2) {
  const r = round(value, decimals);
  const neg = r < 0;
  const [int = "0", frac = ""] = Math.abs(r).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = decimals > 0 ? `${grouped},${frac}` : grouped;
  return `${neg ? "-" : ""}${body}${currency ? ` ${currency}` : ""}`;
}
function formatQuantity(value) {
  const s = round(value, 4).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
}

// src/model/skonto.ts
import { z } from "zod";
var SkontostufeSchema = z.object({
  /** Tage ab Rechnungsdatum. Ganzzahlig und groesser als null. */
  tage: z.number().int().positive(),
  /**
   * Abzug in Prozent, groesser als null und hoechstens hundert.
   *
   * Hundert ist als Grenze absurd hoch und steht trotzdem hier: Alles
   * darueber ist mit Sicherheit ein Tippfehler - 200 statt 2,00 -, und ein
   * Tippfehler in dieser Zahl kostet Geld.
   */
  prozent: z.number().positive().max(100),
  /**
   * Betrag, auf den sich der Abzug bezieht. Ohne Angabe der Zahlbetrag.
   *
   * Noetig, wenn nur ein Teil skontierfaehig ist - Fracht und Montage sind es
   * nach vielen Einkaufsbedingungen nicht.
   */
  basisbetrag: z.number().nonnegative().optional()
});
var MARKE = "#SKONTO#";
function skontozeile(stufe) {
  const teile = [`TAGE=${Math.trunc(stufe.tage)}`, `PROZENT=${stufe.prozent.toFixed(2)}`];
  if (stufe.basisbetrag !== void 0) {
    teile.push(`BASISBETRAG=${stufe.basisbetrag.toFixed(2)}`);
  }
  return `${MARKE}${teile.join("#")}#`;
}
function zahlungsbedingungen(angabe) {
  const zeilen = (angabe.skonto ?? []).map(skontozeile);
  const text = angabe.terms?.trim();
  if (zeilen.length === 0) return text || void 0;
  return zeilen.map((zeile) => `${zeile}
`).join("") + (text ?? "");
}
function liesZahlungsbedingungen(bt20) {
  if (!bt20) return {};
  const stufen = [];
  const rest = [];
  for (const zeile of bt20.split(/\r?\n/)) {
    const roh = zeile.trim();
    if (!roh) continue;
    if (!roh.toUpperCase().startsWith(MARKE)) {
      rest.push(roh);
      continue;
    }
    const felder = /* @__PURE__ */ new Map();
    for (const paar of roh.slice(MARKE.length).split("#")) {
      const [name, wert] = paar.split("=");
      if (name && wert !== void 0) felder.set(name.trim().toUpperCase(), wert.trim());
    }
    const tage = Number(felder.get("TAGE"));
    const prozent = Number(felder.get("PROZENT")?.replace(",", "."));
    const basis = felder.has("BASISBETRAG") ? Number(felder.get("BASISBETRAG")?.replace(",", ".")) : void 0;
    const brauchbar = Number.isInteger(tage) && tage > 0 && Number.isFinite(prozent) && prozent > 0 && prozent <= 100 && (basis === void 0 || Number.isFinite(basis) && basis >= 0);
    if (!brauchbar) {
      rest.push(roh);
      continue;
    }
    stufen.push({ tage, prozent, ...basis === void 0 ? {} : { basisbetrag: basis } });
  }
  return {
    ...stufen.length > 0 ? { skonto: stufen } : {},
    ...rest.length > 0 ? { terms: rest.join("\n") } : {}
  };
}
function skontobetrag(stufe, zahlbetrag) {
  return round((stufe.basisbetrag ?? zahlbetrag) * stufe.prozent / 100);
}
function skontofrist(stufe, rechnungsdatum) {
  return addDays(rechnungsdatum, Math.trunc(stufe.tage));
}
var prozentText = (wert) => `${wert.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
function skontosatz(stufen, angabe) {
  const sortiert = [...stufen].sort((a, b) => a.tage - b.tage);
  if (sortiert.length === 0) return void 0;
  const teile = sortiert.map((stufe, i) => {
    const frist = formatDate(skontofrist(stufe, angabe.rechnungsdatum));
    const abzug = skontobetrag(stufe, angabe.zahlbetrag);
    const rest = formatAmount(round(angabe.zahlbetrag - abzug), angabe.waehrung);
    const kopf = i === 0 ? `Bei Zahlung bis ${frist} abz\xFCglich ` : `bis ${frist} abz\xFCglich `;
    const wort = i === 0 ? " Skonto" : "";
    return `${kopf}${prozentText(stufe.prozent)}${wort} (${formatAmount(abzug, angabe.waehrung)}) = ${rest}`;
  });
  const schluss = angabe.faelligAm ? `sonst bis ${formatDate(angabe.faelligAm)} ohne Abzug` : "sonst ohne Abzug";
  return `${teile.join(", ")}, ${schluss}.`;
}

// src/model/invoice.ts
import { z as z2 } from "zod";
var isoDate = z2.string().refine(isIsoDate, { message: "Datum muss YYYY-MM-DD sein" });
var nonEmpty = z2.string().trim().min(1);
var amount = z2.number().finite();
var AddressSchema = z2.object({
  /** BT-35 / BT-50 Strasse und Hausnummer */
  line1: z2.string().trim().default(""),
  /** BT-36 / BT-51 Adresszusatz */
  line2: z2.string().trim().optional(),
  /** BT-37 / BT-52 Ort */
  city: nonEmpty,
  /** BT-38 / BT-53 Postleitzahl */
  postcode: z2.string().trim().optional(),
  /** BT-39 / BT-54 Bundesland */
  subdivision: z2.string().trim().optional(),
  /** BT-40 / BT-55 Laendercode ISO 3166-1 alpha-2 */
  countryCode: z2.string().trim().length(2).toUpperCase().default("DE")
});
var ContactSchema = z2.object({
  name: z2.string().trim().optional(),
  phone: z2.string().trim().optional(),
  email: z2.string().trim().email().optional()
});
var ElectronicAddressSchema = z2.object({
  value: nonEmpty,
  /** EAS-Code, z.B. "EM" fuer E-Mail oder "0204" fuer die Leitweg-ID */
  scheme: nonEmpty
});
var PartySchema = z2.object({
  /** BT-27 / BT-44 eingetragener Name */
  name: nonEmpty,
  /** BT-28 / BT-45 abweichender Handelsname */
  tradingName: z2.string().trim().optional(),
  address: AddressSchema,
  /** BT-31 / BT-48 Umsatzsteuer-Identifikationsnummer */
  vatId: z2.string().trim().optional(),
  /** BT-32 Steuernummer des Verkaeufers (Alternative zur USt-IdNr.) */
  taxNumber: z2.string().trim().optional(),
  /** BT-29 / BT-46 Kennung des Geschaeftspartners, z.B. Kundennummer */
  identifier: z2.string().trim().optional(),
  /** BT-30 / BT-47 Registereintrag, z.B. Handelsregisternummer */
  legalRegistrationId: z2.string().trim().optional(),
  electronicAddress: ElectronicAddressSchema.optional(),
  contact: ContactSchema.optional()
});
var VatSchema = z2.object({
  /** BT-151 Kategorie nach UNTDID 5305 */
  category: z2.enum(["S", "Z", "E", "AE", "K", "G", "O"]),
  /** BT-152 Satz in Prozent, z.B. 19 */
  rate: z2.number().min(0).max(100),
  /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
  exemptionReason: z2.string().trim().optional(),
  /** BT-121 codierter Befreiungsgrund nach VATEX */
  exemptionReasonCode: z2.string().trim().optional()
});
var AllowanceChargeSchema = z2.object({
  /** true = Zuschlag (BG-21), false = Abschlag (BG-20) */
  isCharge: z2.boolean().default(false),
  /** BT-92 / BT-99 Betrag, immer positiv angegeben */
  amount: amount.nonnegative(),
  /** BT-93 / BT-100 Basisbetrag fuer prozentuale Angaben */
  baseAmount: amount.nonnegative().optional(),
  /** BT-94 / BT-101 Prozentsatz */
  percentage: z2.number().min(0).max(100).optional(),
  /** BT-97 / BT-104 Grund im Klartext */
  reason: z2.string().trim().optional(),
  /** BT-98 / BT-105 codierter Grund */
  reasonCode: z2.string().trim().optional(),
  vat: VatSchema
});
var LineSchema = z2.object({
  /** BT-126 Positionsnummer, eindeutig im Dokument */
  id: nonEmpty,
  /** BT-153 Artikelname */
  name: nonEmpty,
  /** BT-154 Beschreibung */
  description: z2.string().trim().optional(),
  /** BT-155 Artikelnummer des Verkaeufers */
  sellerItemId: z2.string().trim().optional(),
  /** BT-157 GTIN oder EAN */
  globalItemId: z2.string().trim().optional(),
  /** BT-129 Menge */
  quantity: amount,
  /** BT-130 Mengeneinheit nach UN/ECE Rec. 20 */
  unitCode: z2.string().trim().default("C62"),
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
  allowancesCharges: z2.array(AllowanceChargeSchema).default([]),
  /** BT-134 Beginn des Abrechnungszeitraums der Position */
  periodStart: isoDate.optional(),
  /** BT-135 Ende des Abrechnungszeitraums der Position */
  periodEnd: isoDate.optional(),
  /** BT-132 Referenz auf die Bestellposition */
  orderLineReference: z2.string().trim().optional(),
  /** BG-32 Artikelattribute, z.B. Farbe oder Groesse */
  attributes: z2.array(z2.object({ name: nonEmpty, value: nonEmpty })).default([])
});
var PaymentSchema = z2.object({
  /** BT-81 Zahlungsart nach UNTDID 4461 */
  meansCode: z2.string().trim().default("58"),
  /** BT-82 Zahlungsart im Klartext */
  meansText: z2.string().trim().optional(),
  /** BT-84 IBAN des Zahlungsempfaengers */
  iban: z2.string().trim().optional(),
  /** BT-86 BIC */
  bic: z2.string().trim().optional(),
  /** BT-85 Kontoinhaber */
  accountName: z2.string().trim().optional(),
  /** BT-83 Verwendungszweck */
  remittanceInformation: z2.string().trim().optional(),
  /** BT-89 Mandatsreferenz bei SEPA-Lastschrift */
  mandateReference: z2.string().trim().optional(),
  /** BT-90 Glaeubiger-Identifikationsnummer */
  creditorIdentifier: z2.string().trim().optional(),
  /** BT-20 Zahlungsbedingungen im Klartext */
  terms: z2.string().trim().optional(),
  /**
   * Skonto, strukturiert. Mehrere Stufen sind moeglich.
   *
   * Steht im Dokument nicht in einem eigenen Feld - EN 16931 hat keines -,
   * sondern in der Schreibweise der XRechnung innerhalb von BT-20. Erzeugt und
   * gelesen wird sie in model/skonto.ts; `terms` behaelt den freien Text.
   */
  skonto: z2.array(SkontostufeSchema).optional()
});
var AttachmentSchema = z2.object({
  /** BT-122 Kennung der Unterlage */
  id: nonEmpty,
  /** BT-123 Beschreibung */
  description: z2.string().trim().optional(),
  /** BT-125-1 Dateiname */
  filename: z2.string().trim().optional(),
  /** BT-125-2 MIME-Typ, zulaessig sind u.a. application/pdf, image/png, text/csv */
  mimeType: z2.string().trim().optional(),
  /** Binaerinhalt der Unterlage */
  data: z2.instanceof(Uint8Array).optional(),
  /** BT-124 externe Fundstelle statt eingebetteter Datei */
  uri: z2.string().trim().optional()
});
var InvoiceProfileSchema = z2.enum([
  /** ZUGFeRD 2.3 / Factur-X, Profil EN 16931, eingebettet in PDF/A-3 */
  "zugferd-en16931",
  /** XRechnung 3.0 in CII-Syntax, reines XML */
  "xrechnung-cii",
  /** XRechnung 3.0 in UBL-Syntax, reines XML */
  "xrechnung-ubl"
]);
var InvoiceSchema = z2.object({
  profile: InvoiceProfileSchema.default("zugferd-en16931"),
  /** BT-1 Rechnungsnummer */
  number: nonEmpty,
  /** BT-3 Rechnungsart nach UNTDID 1001 */
  typeCode: z2.string().trim().default("380"),
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
  currency: z2.string().trim().length(3).toUpperCase().default("EUR"),
  /**
   * BT-6 Waehrung, in der die Umsatzsteuer gemeldet wird.
   *
   * Nur noetig, wenn sie von BT-5 abweicht - eine Rechnung in Franken, deren
   * Steuer in Euro angemeldet wird, traegt hier EUR. Wer das setzt, muss auch
   * `vatTotalInAccountingCurrency` setzen; das verlangt BR-53 der EN 16931,
   * und der Pruefer der KoSIT setzt es durch.
   *
   * Umgerechnet wird hier nichts: Der Kurs ist eine Entscheidung, keine
   * Rechnung. Welcher Kurs gilt - Tageskurs, Monatsdurchschnitt nach
   * Paragraf 16 Abs. 6 UStG -, gehoert zum Steuerberater, nicht in eine
   * Bibliothek.
   */
  vatAccountingCurrency: z2.string().trim().length(3).toUpperCase().optional(),
  /** BT-111 Gesamtbetrag der Umsatzsteuer in der Waehrung aus BT-6 */
  vatTotalInAccountingCurrency: amount.optional(),
  /** BT-10 Kaeuferreferenz - bei XRechnung die Leitweg-ID und Pflichtfeld */
  buyerReference: z2.string().trim().optional(),
  /** BT-13 Bestellnummer des Kaeufers */
  orderReference: z2.string().trim().optional(),
  /** BT-12 Vertragsnummer */
  contractReference: z2.string().trim().optional(),
  /** BT-11 Projektnummer */
  projectReference: z2.string().trim().optional(),
  /** BT-14 Auftragsnummer des Verkaeufers */
  sellerOrderReference: z2.string().trim().optional(),
  /** BT-25 / BT-26 vorausgegangene Rechnung, Pflicht bei Storno und Korrektur */
  precedingInvoice: z2.object({ number: nonEmpty, issueDate: isoDate.optional() }).optional(),
  seller: PartySchema,
  buyer: PartySchema,
  /** BG-10 abweichender Zahlungsempfaenger */
  payee: PartySchema.partial({ address: true }).optional(),
  /** BG-13 abweichende Lieferanschrift */
  deliveryAddress: AddressSchema.optional(),
  /** BT-70 Name des Lieferorts */
  deliveryName: z2.string().trim().optional(),
  lines: z2.array(LineSchema).min(1),
  /** Zu- und Abschlaege auf Dokumentebene */
  allowancesCharges: z2.array(AllowanceChargeSchema).default([]),
  payment: PaymentSchema.optional(),
  /**
   * Anrede und Anschreiben ueber den Positionen.
   *
   * "Sehr geehrter Herr Ranacher," und darunter "wir bedanken uns fuer Ihren
   * Auftrag und stellen Ihnen folgende Leistungen in Rechnung:" - so haelt es
   * die vermessene Vorlage, und so halten es die meisten Rechnungen, die ein
   * Mensch geschrieben hat.
   *
   * ## Warum von Hand und nicht erzeugt
   *
   * Eine Anrede aus dem Namen abzuleiten hiesse, aus "Christian Ranacher" auf
   * eine Anredeform zu schliessen. Das geht bei genug Namen schief, und der
   * Fehler steht dann gedruckt beim Empfaenger. Wer eine Anrede will,
   * schreibt sie; wer keine will, laesst das Feld leer und bekommt keine.
   *
   * ## Warum sie auch im XML steht
   *
   * Als BT-22 (`ram:IncludedNote`). Das gedruckte Blatt und der Datensatz
   * sind nach ZUGFeRD gleichrangig; Text, der nur auf einem von beiden steht,
   * ist eine Abweichung, auch wenn er nur hoeflich ist.
   *
   * Ein Leerzeilenumbruch (zwei Zeilenumbrueche) trennt Absaetze.
   */
  intro: z2.string().trim().optional(),
  /** BG-1 Bemerkungen zur Rechnung */
  notes: z2.array(z2.object({ text: nonEmpty, subjectCode: z2.string().trim().optional() })).default([]),
  /** BT-113 bereits gezahlter Betrag */
  paidAmount: amount.nonnegative().default(0),
  /** BT-114 Rundungsbetrag */
  roundingAmount: amount.default(0),
  attachments: z2.array(AttachmentSchema).default([])
});
function parseInvoice(input) {
  return InvoiceSchema.parse(input);
}

export {
  isIsoDate,
  toCiiDate,
  formatDate,
  addDays,
  round,
  sum,
  decimal,
  formatAmount,
  formatQuantity,
  SkontostufeSchema,
  skontozeile,
  zahlungsbedingungen,
  liesZahlungsbedingungen,
  skontobetrag,
  skontofrist,
  skontosatz,
  AddressSchema,
  ContactSchema,
  ElectronicAddressSchema,
  PartySchema,
  VatSchema,
  AllowanceChargeSchema,
  LineSchema,
  PaymentSchema,
  AttachmentSchema,
  InvoiceProfileSchema,
  InvoiceSchema,
  parseInvoice
};
