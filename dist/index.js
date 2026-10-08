import {
  AddressSchema,
  AllowanceChargeSchema,
  AttachmentSchema,
  ContactSchema,
  ElectronicAddressSchema,
  InvoiceProfileSchema,
  InvoiceSchema,
  LineSchema,
  PartySchema,
  PaymentSchema,
  VatSchema,
  addDays,
  formatDate,
  isIsoDate,
  parseInvoice,
  toCiiDate
} from "./chunk-F5JTQAFO.js";
import {
  PRODUKTE,
  anschlussBis,
  erzeugeSchluesselpaar,
  euroText,
  istProdukt,
  laufzeitBis,
  pruefeDienstadresse,
  pruefeSchluessel,
  stelleSchluesselAus
} from "./chunk-FT6QIVKV.js";
import {
  fromBase64,
  toBase64,
  utf8Decode,
  utf8Encode
} from "./chunk-BJGX7GXP.js";

// src/model/codes.ts
var INVOICE_TYPE_CODES = {
  /** Handelsrechnung */
  COMMERCIAL_INVOICE: "380",
  /** Gutschrift / Stornorechnung */
  CREDIT_NOTE: "381",
  /** Korrigierte Rechnung */
  CORRECTED_INVOICE: "384",
  /** Selbstfakturierung (Gutschriftverfahren nach §14 Abs. 2 UStG) */
  SELF_BILLED_INVOICE: "389",
  /** Vorausrechnung / Abschlagsrechnung */
  PREPAYMENT_INVOICE: "386"
};
var VAT_CATEGORY = {
  /** Regelsteuersatz / ermaessigter Satz */
  STANDARD: "S",
  /** Nullsatz */
  ZERO: "Z",
  /** Steuerbefreit (z.B. §4 UStG, §19 UStG Kleinunternehmer) */
  EXEMPT: "E",
  /** Reverse Charge (§13b UStG) */
  REVERSE_CHARGE: "AE",
  /** Innergemeinschaftliche Lieferung */
  INTRA_COMMUNITY: "K",
  /** Ausfuhrlieferung ausserhalb EU */
  EXPORT: "G",
  /** Nicht im Anwendungsbereich der Steuer */
  OUT_OF_SCOPE: "O"
};
var ZERO_RATE_CATEGORIES = ["Z", "E", "AE", "K", "G", "O"];
var PAYMENT_MEANS = {
  /** Nicht definiert */
  NOT_DEFINED: "1",
  /** Barzahlung */
  CASH: "10",
  /** Scheck */
  CHEQUE: "20",
  /** Ueberweisung */
  CREDIT_TRANSFER: "30",
  /** SEPA-Ueberweisung */
  SEPA_CREDIT_TRANSFER: "58",
  /** SEPA-Lastschrift */
  SEPA_DIRECT_DEBIT: "59",
  /** Kreditkarte */
  CARD: "48",
  /** Verrechnung / bereits bezahlt */
  SET_OFF: "97"
};
var UNIT = {
  /** Stueck */
  PIECE: "C62",
  /** Stunde */
  HOUR: "HUR",
  /** Tag */
  DAY: "DAY",
  /** Monat */
  MONTH: "MON",
  /** Kilogramm */
  KILOGRAM: "KGM",
  /** Meter */
  METRE: "MTR",
  /** Quadratmeter */
  SQUARE_METRE: "MTK",
  /** Liter */
  LITRE: "LTR",
  /** Pauschal / Einheit */
  LUMP_SUM: "LS",
  /** Kilometer */
  KILOMETRE: "KMT"
};
var EAS = {
  /** Deutsche Leitweg-ID */
  LEITWEG_ID: "0204",
  /** GLN */
  GLN: "0088",
  /** E-Mail */
  EMAIL: "EM",
  /** Umsatzsteuer-Identnummer */
  VAT_ID: "9930"
};
var PROFILE_ID = {
  ZUGFERD_EN16931: "urn:cen.eu:en16931:2017",
  ZUGFERD_EXTENDED: "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
  XRECHNUNG_CIUS: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"
};

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

// src/model/totals.ts
function vatKey(vat) {
  return `${vat.category}:${round(vat.rate, 2)}`;
}
function lineNetAmount(line) {
  const base = line.priceBaseQuantity && line.priceBaseQuantity > 0 ? line.priceBaseQuantity : 1;
  const net = line.quantity * line.unitPrice / base;
  const adjustments = line.allowancesCharges.reduce(
    (acc, ac) => acc + (ac.isCharge ? ac.amount : -ac.amount),
    0
  );
  return round(net + adjustments, 2);
}
function signedAmount(ac) {
  return ac.isCharge ? ac.amount : -ac.amount;
}
function computeTotals(invoice) {
  const lineAmounts = invoice.lines.map(lineNetAmount);
  const lineTotal = sum(lineAmounts);
  const docAllowances = invoice.allowancesCharges.filter((ac) => !ac.isCharge);
  const docCharges = invoice.allowancesCharges.filter((ac) => ac.isCharge);
  const allowanceTotal = sum(docAllowances.map((ac) => ac.amount));
  const chargeTotal = sum(docCharges.map((ac) => ac.amount));
  const taxBasisTotal = round(lineTotal - allowanceTotal + chargeTotal, 2);
  const groups = /* @__PURE__ */ new Map();
  const touch = (vat) => {
    const key = vatKey(vat);
    let entry = groups.get(key);
    if (!entry) {
      entry = { category: vat.category, rate: round(vat.rate, 2), taxableAmount: 0, taxAmount: 0 };
      groups.set(key, entry);
    }
    if (!entry.exemptionReason && vat.exemptionReason) entry.exemptionReason = vat.exemptionReason;
    if (!entry.exemptionReasonCode && vat.exemptionReasonCode) {
      entry.exemptionReasonCode = vat.exemptionReasonCode;
    }
    return entry;
  };
  invoice.lines.forEach((line, index) => {
    touch(line.vat).taxableAmount += lineAmounts[index] ?? 0;
  });
  for (const ac of invoice.allowancesCharges) {
    touch(ac.vat).taxableAmount += signedAmount(ac);
  }
  const vatBreakdown = [...groups.values()].map((entry) => {
    const taxableAmount = round(entry.taxableAmount, 2);
    return {
      ...entry,
      taxableAmount,
      taxAmount: round(taxableAmount * entry.rate / 100, 2)
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.rate - b.rate);
  const taxTotal = sum(vatBreakdown.map((e) => e.taxAmount));
  const grandTotal = round(taxBasisTotal + taxTotal + invoice.roundingAmount, 2);
  const duePayable = round(grandTotal - invoice.paidAmount, 2);
  return {
    lineAmounts,
    lineTotal,
    allowanceTotal,
    chargeTotal,
    taxBasisTotal,
    taxTotal,
    grandTotal,
    paidAmount: round(invoice.paidAmount, 2),
    roundingAmount: round(invoice.roundingAmount, 2),
    duePayable,
    vatBreakdown
  };
}
function summarizeTotals(totals) {
  return [
    `netto=${decimal(totals.taxBasisTotal)}`,
    `ust=${decimal(totals.taxTotal)}`,
    `brutto=${decimal(totals.grandTotal)}`,
    `zahlbar=${decimal(totals.duePayable)}`
  ].join(" ");
}

// src/model/kleinunternehmer.ts
function istKleinunternehmerRechnung(invoice) {
  if (invoice.lines.length === 0) return false;
  const positionenOhneSteuer = invoice.lines.every(
    (line) => line.vat.category === "E" && line.vat.rate === 0 && Boolean(line.vat.exemptionReason ?? line.vat.exemptionReasonCode)
  );
  if (!positionenOhneSteuer) return false;
  return invoice.allowancesCharges.every(
    (eintrag) => eintrag.vat.category === "E" && eintrag.vat.rate === 0
  );
}

// src/model/folgedokument.ts
function folgedokument(invoice, art, heute) {
  const bezug = { number: invoice.number, issueDate: invoice.issueDate };
  return {
    ...invoice,
    // Die Nummer vergibt das Festschreiben, wie bei jeder anderen Rechnung
    // auch. Eine Stornorechnung traegt eine eigene, fortlaufende Nummer - nie
    // die der Ursprungsrechnung.
    number: "",
    typeCode: art === "storno" ? INVOICE_TYPE_CODES.CREDIT_NOTE : INVOICE_TYPE_CODES.CORRECTED_INVOICE,
    issueDate: heute,
    precedingInvoice: bezug,
    // Beim Storno ist die Leistung dieselbe wie in der Ursprungsrechnung; ein
    // eigenes Faelligkeitsdatum ergibt keinen Sinn, gezahlt wird nichts.
    ...art === "storno" ? { dueDate: void 0, paidAmount: 0 } : {},
    notes: [
      {
        text: art === "storno" ? `Storno der Rechnung ${invoice.number} vom ${invoice.issueDate}.` : `Korrektur der Rechnung ${invoice.number} vom ${invoice.issueDate}.`
      },
      ...invoice.notes
    ],
    // Anhaenge der Ursprungsrechnung nicht mitschleppen - sie gehoeren zur
    // urspruenglichen Leistung, nicht zur Korrektur.
    attachments: []
  };
}

// src/model/validate.ts
function validateInvoice(invoice) {
  const issues = [];
  const add = (rule, severity, path, message) => issues.push({ rule, severity, path, message });
  const isXRechnung = invoice.profile !== "zugferd-en16931";
  if (!invoice.number) add("BR-02", "error", "number", "Die Rechnungsnummer fehlt.");
  if (!invoice.issueDate) add("BR-03", "error", "issueDate", "Das Rechnungsdatum fehlt.");
  if (!invoice.typeCode) add("BR-04", "error", "typeCode", "Der Rechnungstyp fehlt.");
  if (!invoice.currency) add("BR-05", "error", "currency", "Die W\xE4hrung fehlt.");
  if (invoice.lines.length === 0) {
    add("BR-16", "error", "lines", "Die Rechnung enth\xE4lt keine Position.");
  }
  const ALLOWED_TYPE_CODES = ["326", "380", "381", "384", "386", "389", "875", "876", "877"];
  if (!ALLOWED_TYPE_CODES.includes(invoice.typeCode)) {
    add("BR-DE-17", "error", "typeCode", `Rechnungstyp ${invoice.typeCode} ist nicht zugelassen.`);
  }
  if ((invoice.typeCode === "384" || invoice.typeCode === "381") && !invoice.precedingInvoice) {
    add(
      "BR-55",
      "warning",
      "precedingInvoice",
      "Korrektur und Storno sollten die urspruengliche Rechnung referenzieren."
    );
  }
  if (invoice.dueDate && invoice.dueDate < invoice.issueDate) {
    add("BR-CO-25", "error", "dueDate", "Das F\xE4lligkeitsdatum liegt vor dem Rechnungsdatum.");
  }
  if (!invoice.dueDate && !invoice.payment?.terms && invoice.paidAmount === 0) {
    add(
      "BR-CO-25",
      "error",
      "dueDate",
      "Es fehlt entweder ein F\xE4lligkeitsdatum oder eine Zahlungsbedingung."
    );
  }
  if (invoice.periodStart && !invoice.periodEnd || !invoice.periodStart && invoice.periodEnd) {
    add("BR-CO-19", "error", "periodStart", "Ein Abrechnungszeitraum braucht Beginn und Ende.");
  }
  checkParty(invoice.seller, "seller", "Verkaeufer", add, isXRechnung);
  checkParty(invoice.buyer, "buyer", "Kaeufer", add, isXRechnung);
  if (!invoice.seller.vatId && !invoice.seller.taxNumber) {
    add(
      "BR-DE-16",
      "error",
      "seller.vatId",
      "Der Verkaeufer braucht eine USt-IdNr. oder eine Steuernummer."
    );
  }
  if (!invoice.seller.vatId && !invoice.seller.legalRegistrationId && !invoice.seller.identifier) {
    add(
      "BR-CO-26",
      "error",
      "seller.identifier",
      "Der Verkaeufer braucht eine USt-IdNr., einen Registereintrag oder eine eigene Kennung. Die Steuernummer allein genuegt hier nicht."
    );
  }
  if (isXRechnung && !invoice.seller.contact?.name) {
    add("BR-DE-6", "error", "seller.contact.name", "XRechnung verlangt einen Ansprechpartner.");
  }
  if (isXRechnung && !invoice.seller.contact?.phone) {
    add("BR-DE-7", "error", "seller.contact.phone", "XRechnung verlangt eine Telefonnummer.");
  }
  if (isXRechnung && !invoice.seller.contact?.email) {
    add("BR-DE-8", "error", "seller.contact.email", "XRechnung verlangt eine E-Mail-Adresse.");
  }
  if (isXRechnung && !invoice.buyerReference) {
    add(
      "BR-DE-15",
      "error",
      "buyerReference",
      "XRechnung verlangt die Leitweg-ID als Kaeuferreferenz."
    );
  }
  if (isXRechnung && invoice.buyerReference && !isPlausibleLeitwegId(invoice.buyerReference)) {
    add(
      "BR-DE-15",
      "warning",
      "buyerReference",
      "Die Kaeuferreferenz sieht nicht wie eine Leitweg-ID aus (Grobstruktur 991-12345-67)."
    );
  }
  const means = invoice.payment?.meansCode;
  if (isXRechnung && !means) {
    add("BR-DE-1", "error", "payment.meansCode", "XRechnung verlangt eine Zahlungsart.");
  }
  if ((means === "58" || means === "59") && !invoice.payment?.iban) {
    add("BR-DE-13", "error", "payment.iban", "Bei SEPA-Zahlungen ist die IBAN Pflicht.");
  }
  if (invoice.payment?.iban && !isPlausibleIban(invoice.payment.iban)) {
    add("BR-DE-13", "error", "payment.iban", "Die IBAN ist formal ungueltig (Pruefsumme).");
  }
  if (means === "59" && !invoice.payment?.mandateReference) {
    add(
      "BR-DE-29",
      "warning",
      "payment.mandateReference",
      "Bei SEPA-Lastschrift sollte die Mandatsreferenz angegeben werden."
    );
  }
  if (!invoice.deliveryDate && !invoice.periodStart) {
    add(
      "UStG-14-4-6",
      "warning",
      "deliveryDate",
      "Es fehlt der Zeitpunkt der Lieferung oder Leistung. Paragraf 14 UStG verlangt ihn, auch wenn er dem Rechnungsdatum entspricht."
    );
  }
  const checkAllowance = (ac, path) => {
    if (ac.percentage !== void 0 && ac.baseAmount === void 0) {
      add(
        "PEPPOL-EN16931-R041",
        "error",
        `${path}.baseAmount`,
        "Wird ein Prozentsatz angegeben, muss auch der Basisbetrag genannt werden."
      );
    }
  };
  invoice.allowancesCharges.forEach(
    (ac, index) => checkAllowance(ac, `allowancesCharges[${index}]`)
  );
  invoice.lines.forEach(
    (line, lineIndex) => line.allowancesCharges.forEach(
      (ac, index) => checkAllowance(ac, `lines[${lineIndex}].allowancesCharges[${index}]`)
    )
  );
  const seenLineIds = /* @__PURE__ */ new Set();
  invoice.lines.forEach((line, index) => {
    const at = `lines[${index}]`;
    if (seenLineIds.has(line.id)) {
      add("BR-21", "error", `${at}.id`, `Die Positionsnummer ${line.id} ist doppelt vergeben.`);
    }
    seenLineIds.add(line.id);
    if (!line.name) add("BR-25", "error", `${at}.name`, "Der Artikelname fehlt.");
    if (!line.unitCode) add("BR-23", "error", `${at}.unitCode`, "Die Mengeneinheit fehlt.");
    if (line.unitPrice < 0) {
      add("BR-27", "error", `${at}.unitPrice`, "Der Einzelpreis darf nicht negativ sein.");
    }
    if (line.periodStart && !line.periodEnd || !line.periodStart && line.periodEnd) {
      add("BR-30", "error", `${at}.periodStart`, "Ein Zeitraum braucht Beginn und Ende.");
    }
  });
  const totals = computeTotals(invoice);
  for (const entry of totals.vatBreakdown) {
    const at = `vat[${entry.category}/${entry.rate}]`;
    if (entry.category === "S" && entry.rate <= 0) {
      add("BR-S-05", "error", at, "Bei Regelbesteuerung muss der Steuersatz groesser als 0 sein.");
    }
    if (ZERO_RATE_CATEGORIES.includes(entry.category) && entry.rate !== 0) {
      add("BR-Z-05", "error", at, `Kategorie ${entry.category} verlangt den Steuersatz 0.`);
    }
    if (entry.category !== "S" && entry.category !== "Z" && !entry.exemptionReason && !entry.exemptionReasonCode) {
      add("BR-E-10", "error", at, `Kategorie ${entry.category} verlangt einen Befreiungsgrund.`);
    }
  }
  const categories = new Set(totals.vatBreakdown.map((e) => e.category));
  if (categories.has("AE") && !invoice.buyer.vatId) {
    add(
      "BR-AE-03",
      "error",
      "buyer.vatId",
      "Reverse Charge setzt die USt-IdNr. des Kaeufers voraus."
    );
  }
  if (categories.has("K")) {
    if (!invoice.buyer.vatId) {
      add(
        "BR-IC-03",
        "error",
        "buyer.vatId",
        "Innergemeinschaftliche Lieferung setzt die USt-IdNr. des Kaeufers voraus."
      );
    }
    if (!invoice.deliveryDate && !invoice.periodStart) {
      add(
        "BR-IC-11",
        "error",
        "deliveryDate",
        "Innergemeinschaftliche Lieferung verlangt ein Lieferdatum oder einen Zeitraum."
      );
    }
  }
  if (totals.duePayable < 0) {
    add(
      "BR-CO-16",
      "warning",
      "paidAmount",
      "Der Zahlbetrag ist negativ - der gezahlte Betrag uebersteigt den Rechnungsbetrag."
    );
  }
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}
function checkParty(party, path, label, add, isXRechnung) {
  if (!party) return;
  if (!party.name) add("BR-06", "error", `${path}.name`, `Der Name des ${label}s fehlt.`);
  if (!party.address?.city) {
    add("BR-DE-4", "error", `${path}.address.city`, `Der Ort des ${label}s fehlt.`);
  }
  if (!party.address?.countryCode) {
    add("BR-09", "error", `${path}.address.countryCode`, `Das Land des ${label}s fehlt.`);
  }
  if (isXRechnung && !party.address?.line1) {
    add("BR-DE-3", "error", `${path}.address.line1`, `Die Strasse des ${label}s fehlt.`);
  }
  if (isXRechnung && !party.address?.postcode) {
    add("BR-DE-5", "error", `${path}.address.postcode`, `Die Postleitzahl des ${label}s fehlt.`);
  }
  if (party.vatId && !isPlausibleVatId(party.vatId)) {
    add(
      "BR-CO-09",
      "error",
      `${path}.vatId`,
      `Die USt-IdNr. "${party.vatId}" beginnt nicht mit einem gueltigen Laenderpraefix.`
    );
  }
}
function isPlausibleVatId(value) {
  return /^[A-Z]{2}[0-9A-Z+*.]{2,13}$/.test(value.replace(/\s/g, "").toUpperCase());
}
function isPlausibleIban(value) {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value2 = char >= "A" && char <= "Z" ? (char.charCodeAt(0) - 55).toString() : char;
    for (const digit of value2) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
function isPlausibleLeitwegId(value) {
  return /^\d{2,12}(-[A-Za-z0-9]{1,30})?-\d{2}$/.test(value.trim());
}

// src/model/specifications.ts
var BUNDLED_SPECIFICATIONS = {
  label: "gebuendelt-2026-08-24",
  publishedAt: "2026-08-24",
  staleAfter: "2027-08-24",
  xrechnung: {
    id: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
    version: "3.0"
  },
  zugferdEn16931: {
    id: "urn:cen.eu:en16931:2017",
    version: "EN 16931"
  },
  zugferdExtended: {
    id: "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
    version: "EXTENDED"
  },
  validatedAgainst: {
    kositConfiguration: "v2026-01-31",
    validatorTool: "1.6.0",
    zugferdVersion: "2.3"
  }
};
var active = BUNDLED_SPECIFICATIONS;
function activeSpecifications() {
  return active;
}
function setActiveSpecifications(set) {
  active = set;
}
function resetSpecifications() {
  active = BUNDLED_SPECIFICATIONS;
}
function specificationAge(now, set = active) {
  const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
  const daysUntilStale = days(now, set.staleAfter);
  return {
    stale: daysUntilStale < 0,
    ageInDays: days(set.publishedAt, now),
    daysUntilStale,
    label: set.label
  };
}
function parseSpecificationSet(input) {
  const raw = input;
  if (!raw || typeof raw !== "object") {
    throw new SpecificationError("Kein Objekt.");
  }
  const entry = (value, name) => {
    const candidate = value;
    if (!candidate || typeof candidate.id !== "string" || typeof candidate.version !== "string") {
      throw new SpecificationError(`Eintrag "${name}" fehlt oder ist unvollstaendig.`);
    }
    if (!candidate.id.startsWith("urn:cen.eu:en16931:2017")) {
      throw new SpecificationError(
        `Kennung "${candidate.id}" beginnt nicht mit dem EN-16931-Praefix.`
      );
    }
    if (candidate.id.length > 200) {
      throw new SpecificationError(`Kennung "${name}" ist unplausibel lang.`);
    }
    return { id: candidate.id, version: candidate.version };
  };
  const date = (value, name) => {
    if (typeof value !== "string" || !isIsoDate(value)) {
      throw new SpecificationError(`Feld "${name}" ist kein Datum im Format YYYY-MM-DD.`);
    }
    return value;
  };
  return {
    label: typeof raw.label === "string" && raw.label ? raw.label.slice(0, 64) : "nachgeladen",
    publishedAt: date(raw.publishedAt, "publishedAt"),
    staleAfter: date(raw.staleAfter, "staleAfter"),
    xrechnung: entry(raw.xrechnung, "xrechnung"),
    zugferdEn16931: entry(raw.zugferdEn16931, "zugferdEn16931"),
    zugferdExtended: entry(raw.zugferdExtended, "zugferdExtended"),
    validatedAgainst: raw.validatedAgainst
  };
}
var SpecificationError = class extends Error {
  constructor(message) {
    super(`Spezifikationsstand ungueltig: ${message}`);
    this.name = "SpecificationError";
  }
};

// src/util/xml.ts
var ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;"
};
function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}
function sanitizeXmlText(value) {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const allowed = code === 9 || code === 10 || code === 13 || code >= 32 && code <= 55295 || code >= 57344 && code <= 65533 || code >= 65536;
    if (allowed) out += char;
  }
  return out;
}
var XmlWriter = class _XmlWriter {
  constructor(options = {}) {
    this.parts = [];
    this.stack = [];
    this.indentText = options.indent ?? "  ";
    if (options.declaration !== false) {
      this.parts.push('<?xml version="1.0" encoding="UTF-8"?>\n');
    }
  }
  get pad() {
    return this.indentText.repeat(this.stack.length);
  }
  static attrs(attributes) {
    if (!attributes) return "";
    let out = "";
    for (const [key, value] of Object.entries(attributes)) {
      if (value === void 0 || value === null || value === "") continue;
      out += ` ${key}="${escapeXml(String(value))}"`;
    }
    return out;
  }
  open(tag, attributes) {
    this.parts.push(`${this.pad}<${tag}${_XmlWriter.attrs(attributes)}>
`);
    this.stack.push(tag);
    return this;
  }
  close(tag) {
    const open = this.stack.pop();
    if (!open) throw new Error("XmlWriter: close() ohne offenes Element");
    if (tag && tag !== open) {
      throw new Error(`XmlWriter: erwartet </${open}>, bekommen </${tag}>`);
    }
    this.parts.push(`${this.pad}</${open}>
`);
    return this;
  }
  /** Blattelement mit Textinhalt. Leere Werte werden ausgelassen. */
  leaf(tag, value, attributes) {
    if (value === void 0 || value === null || value === "") return this;
    const text2 = escapeXml(sanitizeXmlText(String(value)));
    this.parts.push(`${this.pad}<${tag}${_XmlWriter.attrs(attributes)}>${text2}</${tag}>
`);
    return this;
  }
  /** Element ohne Inhalt, aber mit Attributen. */
  empty(tag, attributes) {
    this.parts.push(`${this.pad}<${tag}${_XmlWriter.attrs(attributes)}/>
`);
    return this;
  }
  /** Oeffnet ein Element, fuehrt den Rumpf aus und schliesst es wieder. */
  element(tag, attributes, body) {
    this.open(tag, attributes);
    body(this);
    return this.close(tag);
  }
  /** Wie element(), wird aber komplett uebersprungen, wenn condition falsch ist. */
  elementIf(condition, tag, attributes, body) {
    if (!condition) return this;
    return this.element(tag, attributes, body);
  }
  toString() {
    if (this.stack.length > 0) {
      throw new Error(`XmlWriter: nicht geschlossene Elemente: ${this.stack.join(" > ")}`);
    }
    return this.parts.join("");
  }
};

// src/xml/cii.ts
var NS = {
  "xmlns:rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  "xmlns:qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
  "xmlns:ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  "xmlns:udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
  "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
};
var BUSINESS_PROCESS = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";
function guidelineFor(invoice, options) {
  if (options.guidelineId) return options.guidelineId;
  const specs = activeSpecifications();
  return invoice.profile === "zugferd-en16931" ? specs.zugferdEn16931.id : specs.xrechnung.id;
}
function dateElement(w, tag, value, ns = "udt") {
  if (!value) return;
  w.element(tag, void 0, (x) => {
    x.leaf(`${ns}:DateTimeString`, toCiiDate(value), { format: "102" });
  });
}
function buildCii(invoice, options = {}) {
  const totals = options.totals ?? computeTotals(invoice);
  const w = new XmlWriter();
  w.open("rsm:CrossIndustryInvoice", NS);
  w.element("rsm:ExchangedDocumentContext", void 0, (x) => {
    x.element("ram:BusinessProcessSpecifiedDocumentContextParameter", void 0, (b) => {
      b.leaf("ram:ID", options.businessProcessId ?? BUSINESS_PROCESS);
    });
    x.element("ram:GuidelineSpecifiedDocumentContextParameter", void 0, (b) => {
      b.leaf("ram:ID", guidelineFor(invoice, options));
    });
  });
  w.element("rsm:ExchangedDocument", void 0, (x) => {
    x.leaf("ram:ID", invoice.number);
    x.leaf("ram:TypeCode", invoice.typeCode);
    dateElement(x, "ram:IssueDateTime", invoice.issueDate);
    if (invoice.intro) {
      x.element("ram:IncludedNote", void 0, (n) => {
        n.leaf("ram:Content", invoice.intro);
        n.leaf("ram:SubjectCode", "AAI");
      });
    }
    for (const note of invoice.notes) {
      x.element("ram:IncludedNote", void 0, (n) => {
        n.leaf("ram:Content", note.text);
        n.leaf("ram:SubjectCode", note.subjectCode);
      });
    }
  });
  w.open("rsm:SupplyChainTradeTransaction");
  invoice.lines.forEach((line, index) => {
    writeLine(w, line, totals.lineAmounts[index] ?? 0, invoice.currency);
  });
  w.element("ram:ApplicableHeaderTradeAgreement", void 0, (x) => {
    x.leaf("ram:BuyerReference", invoice.buyerReference);
    writeParty(x, "ram:SellerTradeParty", invoice.seller);
    writeParty(x, "ram:BuyerTradeParty", invoice.buyer);
    x.elementIf(
      invoice.sellerOrderReference,
      "ram:SellerOrderReferencedDocument",
      void 0,
      (d) => d.leaf("ram:IssuerAssignedID", invoice.sellerOrderReference)
    );
    x.elementIf(
      invoice.orderReference,
      "ram:BuyerOrderReferencedDocument",
      void 0,
      (d) => d.leaf("ram:IssuerAssignedID", invoice.orderReference)
    );
    x.elementIf(
      invoice.contractReference,
      "ram:ContractReferencedDocument",
      void 0,
      (d) => d.leaf("ram:IssuerAssignedID", invoice.contractReference)
    );
    for (const attachment of invoice.attachments) {
      x.element("ram:AdditionalReferencedDocument", void 0, (d) => {
        d.leaf("ram:IssuerAssignedID", attachment.id);
        d.leaf("ram:URIID", attachment.uri);
        d.leaf("ram:TypeCode", "916");
        d.leaf("ram:Name", attachment.description);
        if (attachment.data) {
          d.leaf("ram:AttachmentBinaryObject", toBase64(attachment.data), {
            mimeCode: attachment.mimeType ?? "application/octet-stream",
            filename: attachment.filename ?? attachment.id
          });
        }
      });
    }
    x.elementIf(invoice.projectReference, "ram:SpecifiedProcuringProject", void 0, (d) => {
      d.leaf("ram:ID", invoice.projectReference);
      d.leaf("ram:Name", invoice.projectReference);
    });
  });
  const hasDelivery = Boolean(
    invoice.deliveryDate || invoice.deliveryAddress || invoice.deliveryName
  );
  if (!hasDelivery) w.empty("ram:ApplicableHeaderTradeDelivery");
  else w.element("ram:ApplicableHeaderTradeDelivery", void 0, (x) => {
    if (invoice.deliveryAddress || invoice.deliveryName) {
      x.element("ram:ShipToTradeParty", void 0, (p) => {
        p.leaf("ram:Name", invoice.deliveryName ?? invoice.buyer.name);
        if (invoice.deliveryAddress) writeAddress(p, invoice.deliveryAddress);
      });
    }
    if (invoice.deliveryDate) {
      x.element("ram:ActualDeliverySupplyChainEvent", void 0, (e) => {
        dateElement(e, "ram:OccurrenceDateTime", invoice.deliveryDate);
      });
    }
  });
  w.element("ram:ApplicableHeaderTradeSettlement", void 0, (x) => {
    x.leaf("ram:CreditorReferenceID", invoice.payment?.creditorIdentifier);
    x.leaf("ram:PaymentReference", invoice.payment?.remittanceInformation);
    x.leaf("ram:InvoiceCurrencyCode", invoice.currency);
    if (invoice.payee) {
      writeParty(x, "ram:PayeeTradeParty", {
        ...invoice.payee,
        address: invoice.payee.address ?? invoice.seller.address
      });
    }
    if (invoice.payment) {
      x.element("ram:SpecifiedTradeSettlementPaymentMeans", void 0, (m) => {
        m.leaf("ram:TypeCode", invoice.payment?.meansCode);
        m.leaf("ram:Information", invoice.payment?.meansText);
        if (invoice.payment?.meansCode === "59") {
          m.elementIf(
            invoice.payment?.iban,
            "ram:PayerPartyDebtorFinancialAccount",
            void 0,
            (a) => a.leaf("ram:IBANID", invoice.payment?.iban)
          );
        } else {
          m.elementIf(
            invoice.payment?.iban,
            "ram:PayeePartyCreditorFinancialAccount",
            void 0,
            (a) => {
              a.leaf("ram:IBANID", invoice.payment?.iban);
              a.leaf("ram:AccountName", invoice.payment?.accountName);
            }
          );
          m.elementIf(
            invoice.payment?.bic,
            "ram:PayeeSpecifiedCreditorFinancialInstitution",
            void 0,
            (a) => a.leaf("ram:BICID", invoice.payment?.bic)
          );
        }
      });
    }
    for (const tax of totals.vatBreakdown) {
      x.element("ram:ApplicableTradeTax", void 0, (t) => {
        t.leaf("ram:CalculatedAmount", decimal(tax.taxAmount));
        t.leaf("ram:TypeCode", "VAT");
        t.leaf("ram:ExemptionReason", tax.exemptionReason);
        t.leaf("ram:BasisAmount", decimal(tax.taxableAmount));
        t.leaf("ram:CategoryCode", tax.category);
        t.leaf("ram:ExemptionReasonCode", tax.exemptionReasonCode);
        t.leaf("ram:RateApplicablePercent", decimal(tax.rate, 2));
      });
    }
    if (invoice.periodStart && invoice.periodEnd) {
      x.element("ram:BillingSpecifiedPeriod", void 0, (p) => {
        dateElement(p, "ram:StartDateTime", invoice.periodStart);
        dateElement(p, "ram:EndDateTime", invoice.periodEnd);
      });
    }
    for (const ac of invoice.allowancesCharges) {
      writeAllowanceCharge(x, ac);
    }
    if (invoice.payment?.terms || invoice.dueDate || invoice.payment?.mandateReference) {
      x.element("ram:SpecifiedTradePaymentTerms", void 0, (t) => {
        t.leaf("ram:Description", invoice.payment?.terms);
        dateElement(t, "ram:DueDateDateTime", invoice.dueDate);
        t.leaf("ram:DirectDebitMandateID", invoice.payment?.mandateReference);
      });
    }
    x.element("ram:SpecifiedTradeSettlementHeaderMonetarySummation", void 0, (s) => {
      s.leaf("ram:LineTotalAmount", decimal(totals.lineTotal));
      if (totals.chargeTotal !== 0) s.leaf("ram:ChargeTotalAmount", decimal(totals.chargeTotal));
      if (totals.allowanceTotal !== 0) {
        s.leaf("ram:AllowanceTotalAmount", decimal(totals.allowanceTotal));
      }
      s.leaf("ram:TaxBasisTotalAmount", decimal(totals.taxBasisTotal));
      s.leaf("ram:TaxTotalAmount", decimal(totals.taxTotal), { currencyID: invoice.currency });
      if (totals.roundingAmount !== 0) {
        s.leaf("ram:RoundingAmount", decimal(totals.roundingAmount));
      }
      s.leaf("ram:GrandTotalAmount", decimal(totals.grandTotal));
      if (totals.paidAmount !== 0) s.leaf("ram:TotalPrepaidAmount", decimal(totals.paidAmount));
      s.leaf("ram:DuePayableAmount", decimal(totals.duePayable));
    });
    if (invoice.precedingInvoice) {
      x.element("ram:InvoiceReferencedDocument", void 0, (d) => {
        d.leaf("ram:IssuerAssignedID", invoice.precedingInvoice?.number);
        dateElement(d, "ram:FormattedIssueDateTime", invoice.precedingInvoice?.issueDate, "qdt");
      });
    }
  });
  w.close("rsm:SupplyChainTradeTransaction");
  w.close("rsm:CrossIndustryInvoice");
  return w.toString();
}
function writeLine(w, line, netAmount, currency) {
  w.element("ram:IncludedSupplyChainTradeLineItem", void 0, (x) => {
    x.element("ram:AssociatedDocumentLineDocument", void 0, (d) => {
      d.leaf("ram:LineID", line.id);
      d.elementIf(
        line.description,
        "ram:IncludedNote",
        void 0,
        (n) => n.leaf("ram:Content", line.description)
      );
    });
    x.element("ram:SpecifiedTradeProduct", void 0, (p) => {
      p.leaf("ram:GlobalID", line.globalItemId, { schemeID: "0160" });
      p.leaf("ram:SellerAssignedID", line.sellerItemId);
      p.leaf("ram:Name", line.name);
      for (const attribute of line.attributes) {
        p.element("ram:ApplicableProductCharacteristic", void 0, (c) => {
          c.leaf("ram:Description", attribute.name);
          c.leaf("ram:Value", attribute.value);
        });
      }
    });
    x.element("ram:SpecifiedLineTradeAgreement", void 0, (a) => {
      a.elementIf(
        line.orderLineReference,
        "ram:BuyerOrderReferencedDocument",
        void 0,
        (d) => d.leaf("ram:LineID", line.orderLineReference)
      );
      if (line.grossUnitPrice !== void 0) {
        a.element("ram:GrossPriceProductTradePrice", void 0, (p) => {
          p.leaf("ram:ChargeAmount", decimal(line.grossUnitPrice ?? 0, 4));
          p.leaf("ram:BasisQuantity", decimal(line.priceBaseQuantity ?? 1, 4), {
            unitCode: line.unitCode
          });
          if (line.unitPriceDiscount) {
            p.element("ram:AppliedTradeAllowanceCharge", void 0, (ac) => {
              ac.element("ram:ChargeIndicator", void 0, (i) => i.leaf("udt:Indicator", "false"));
              ac.leaf("ram:ActualAmount", decimal(line.unitPriceDiscount ?? 0, 4));
            });
          }
        });
      }
      a.element("ram:NetPriceProductTradePrice", void 0, (p) => {
        p.leaf("ram:ChargeAmount", decimal(line.unitPrice, 4));
        p.leaf("ram:BasisQuantity", decimal(line.priceBaseQuantity ?? 1, 4), {
          unitCode: line.unitCode
        });
      });
    });
    x.element("ram:SpecifiedLineTradeDelivery", void 0, (d) => {
      d.leaf("ram:BilledQuantity", decimal(line.quantity, 4), { unitCode: line.unitCode });
    });
    x.element("ram:SpecifiedLineTradeSettlement", void 0, (s) => {
      s.element("ram:ApplicableTradeTax", void 0, (t) => {
        t.leaf("ram:TypeCode", "VAT");
        t.leaf("ram:CategoryCode", line.vat.category);
        t.leaf("ram:RateApplicablePercent", decimal(line.vat.rate, 2));
      });
      if (line.periodStart && line.periodEnd) {
        s.element("ram:BillingSpecifiedPeriod", void 0, (p) => {
          dateElement(p, "ram:StartDateTime", line.periodStart);
          dateElement(p, "ram:EndDateTime", line.periodEnd);
        });
      }
      for (const ac of line.allowancesCharges) writeAllowanceCharge(s, ac, false);
      s.element("ram:SpecifiedTradeSettlementLineMonetarySummation", void 0, (m) => {
        m.leaf("ram:LineTotalAmount", decimal(netAmount));
      });
    });
  });
  void currency;
}
function writeAllowanceCharge(w, ac, withTax = true) {
  w.element("ram:SpecifiedTradeAllowanceCharge", void 0, (x) => {
    x.element(
      "ram:ChargeIndicator",
      void 0,
      (i) => i.leaf("udt:Indicator", ac.isCharge ? "true" : "false")
    );
    if (ac.percentage !== void 0) x.leaf("ram:CalculationPercent", decimal(ac.percentage, 2));
    if (ac.baseAmount !== void 0) x.leaf("ram:BasisAmount", decimal(ac.baseAmount));
    x.leaf("ram:ActualAmount", decimal(ac.amount));
    x.leaf("ram:ReasonCode", ac.reasonCode);
    x.leaf("ram:Reason", ac.reason);
    if (withTax) {
      x.element("ram:CategoryTradeTax", void 0, (t) => {
        t.leaf("ram:TypeCode", "VAT");
        t.leaf("ram:CategoryCode", ac.vat.category);
        t.leaf("ram:RateApplicablePercent", decimal(ac.vat.rate, 2));
      });
    }
  });
}
function writeParty(w, tag, party) {
  w.element(tag, void 0, (x) => {
    x.leaf("ram:ID", party.identifier);
    x.leaf("ram:Name", party.name);
    if (party.legalRegistrationId || party.tradingName) {
      x.element("ram:SpecifiedLegalOrganization", void 0, (o) => {
        o.leaf("ram:ID", party.legalRegistrationId, { schemeID: "0002" });
        o.leaf("ram:TradingBusinessName", party.tradingName);
      });
    }
    if (party.contact) {
      x.element("ram:DefinedTradeContact", void 0, (c) => {
        c.leaf("ram:PersonName", party.contact?.name);
        c.elementIf(
          party.contact?.phone,
          "ram:TelephoneUniversalCommunication",
          void 0,
          (t) => t.leaf("ram:CompleteNumber", party.contact?.phone)
        );
        c.elementIf(
          party.contact?.email,
          "ram:EmailURIUniversalCommunication",
          void 0,
          (t) => t.leaf("ram:URIID", party.contact?.email)
        );
      });
    }
    writeAddress(x, party.address);
    if (party.electronicAddress) {
      x.element("ram:URIUniversalCommunication", void 0, (u) => {
        u.leaf("ram:URIID", party.electronicAddress?.value, {
          schemeID: party.electronicAddress?.scheme
        });
      });
    }
    if (party.vatId) {
      x.element(
        "ram:SpecifiedTaxRegistration",
        void 0,
        (t) => t.leaf("ram:ID", party.vatId, { schemeID: "VA" })
      );
    }
    if (party.taxNumber) {
      x.element(
        "ram:SpecifiedTaxRegistration",
        void 0,
        (t) => t.leaf("ram:ID", party.taxNumber, { schemeID: "FC" })
      );
    }
  });
}
function writeAddress(w, address) {
  w.element("ram:PostalTradeAddress", void 0, (a) => {
    a.leaf("ram:PostcodeCode", address.postcode);
    a.leaf("ram:LineOne", address.line1);
    a.leaf("ram:LineTwo", address.line2);
    a.leaf("ram:CityName", address.city);
    a.leaf("ram:CountryID", address.countryCode);
    a.leaf("ram:CountrySubDivisionName", address.subdivision);
  });
}

// src/xml/ubl.ts
var BUSINESS_PROCESS2 = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";
var CREDIT_NOTE_TYPES = /* @__PURE__ */ new Set(["381", "396"]);
function buildUbl(invoice, options = {}) {
  const totals = options.totals ?? computeTotals(invoice);
  const isCreditNote = CREDIT_NOTE_TYPES.has(invoice.typeCode);
  const root = isCreditNote ? "ubl:CreditNote" : "ubl:Invoice";
  const lineTag = isCreditNote ? "cac:CreditNoteLine" : "cac:InvoiceLine";
  const quantityTag = isCreditNote ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity";
  const currency = invoice.currency;
  const cur = { currencyID: currency };
  const w = new XmlWriter();
  w.open(root, {
    "xmlns:ubl": isCreditNote ? "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" : "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  });
  w.leaf("cbc:CustomizationID", options.customizationId ?? activeSpecifications().xrechnung.id);
  w.leaf("cbc:ProfileID", options.profileId ?? BUSINESS_PROCESS2);
  w.leaf("cbc:ID", invoice.number);
  w.leaf("cbc:IssueDate", invoice.issueDate);
  if (!isCreditNote) w.leaf("cbc:DueDate", invoice.dueDate);
  w.leaf(isCreditNote ? "cbc:CreditNoteTypeCode" : "cbc:InvoiceTypeCode", invoice.typeCode);
  for (const note of invoice.notes) w.leaf("cbc:Note", note.text);
  w.leaf("cbc:TaxPointDate", invoice.deliveryDate);
  w.leaf("cbc:DocumentCurrencyCode", currency);
  w.leaf("cbc:BuyerReference", invoice.buyerReference);
  if (invoice.periodStart && invoice.periodEnd) {
    w.element("cac:InvoicePeriod", void 0, (x) => {
      x.leaf("cbc:StartDate", invoice.periodStart);
      x.leaf("cbc:EndDate", invoice.periodEnd);
    });
  }
  if (invoice.orderReference || invoice.sellerOrderReference) {
    w.element("cac:OrderReference", void 0, (x) => {
      x.leaf("cbc:ID", invoice.orderReference ?? invoice.sellerOrderReference);
      if (invoice.orderReference) x.leaf("cbc:SalesOrderID", invoice.sellerOrderReference);
    });
  }
  if (invoice.precedingInvoice) {
    w.element("cac:BillingReference", void 0, (x) => {
      x.element("cac:InvoiceDocumentReference", void 0, (d) => {
        d.leaf("cbc:ID", invoice.precedingInvoice?.number);
        d.leaf("cbc:IssueDate", invoice.precedingInvoice?.issueDate);
      });
    });
  }
  w.elementIf(
    invoice.contractReference,
    "cac:ContractDocumentReference",
    void 0,
    (x) => x.leaf("cbc:ID", invoice.contractReference)
  );
  w.elementIf(
    invoice.projectReference,
    "cac:ProjectReference",
    void 0,
    (x) => x.leaf("cbc:ID", invoice.projectReference)
  );
  for (const attachment of invoice.attachments) {
    w.element("cac:AdditionalDocumentReference", void 0, (x) => {
      x.leaf("cbc:ID", attachment.id);
      x.leaf("cbc:DocumentDescription", attachment.description);
      if (attachment.data || attachment.uri) {
        x.element("cac:Attachment", void 0, (a) => {
          if (attachment.data) {
            a.leaf("cbc:EmbeddedDocumentBinaryObject", toBase64(attachment.data), {
              mimeCode: attachment.mimeType ?? "application/octet-stream",
              filename: attachment.filename ?? attachment.id
            });
          }
          if (attachment.uri) {
            a.element("cac:ExternalReference", void 0, (e) => e.leaf("cbc:URI", attachment.uri));
          }
        });
      }
    });
  }
  w.element("cac:AccountingSupplierParty", void 0, (x) => writeParty2(x, invoice.seller, true));
  w.element("cac:AccountingCustomerParty", void 0, (x) => writeParty2(x, invoice.buyer, false));
  if (invoice.payee) {
    w.element("cac:PayeeParty", void 0, (x) => {
      x.element("cac:PartyName", void 0, (n) => n.leaf("cbc:Name", invoice.payee?.name));
      x.elementIf(
        invoice.payee?.legalRegistrationId,
        "cac:PartyLegalEntity",
        void 0,
        (l) => l.leaf("cbc:CompanyID", invoice.payee?.legalRegistrationId)
      );
    });
  }
  if (invoice.deliveryDate || invoice.deliveryAddress || invoice.deliveryName) {
    w.element("cac:Delivery", void 0, (x) => {
      x.leaf("cbc:ActualDeliveryDate", invoice.deliveryDate);
      x.elementIf(invoice.deliveryAddress, "cac:DeliveryLocation", void 0, (l) => {
        if (invoice.deliveryAddress) {
          l.element("cac:Address", void 0, (a) => writeAddressBody(a, invoice.deliveryAddress));
        }
      });
      x.elementIf(
        invoice.deliveryName,
        "cac:DeliveryParty",
        void 0,
        (p) => p.element("cac:PartyName", void 0, (n) => n.leaf("cbc:Name", invoice.deliveryName))
      );
    });
  }
  if (invoice.payment) {
    w.element("cac:PaymentMeans", void 0, (x) => {
      x.leaf("cbc:PaymentMeansCode", invoice.payment?.meansCode, {
        name: invoice.payment?.meansText
      });
      x.leaf("cbc:PaymentID", invoice.payment?.remittanceInformation);
      if (invoice.payment?.meansCode === "59") {
        x.elementIf(invoice.payment?.mandateReference, "cac:PaymentMandate", void 0, (m) => {
          m.leaf("cbc:ID", invoice.payment?.mandateReference);
          m.elementIf(
            invoice.payment?.iban,
            "cac:PayerFinancialAccount",
            void 0,
            (a) => a.leaf("cbc:ID", invoice.payment?.iban)
          );
        });
      } else if (invoice.payment?.iban) {
        x.element("cac:PayeeFinancialAccount", void 0, (a) => {
          a.leaf("cbc:ID", invoice.payment?.iban);
          a.leaf("cbc:Name", invoice.payment?.accountName);
          a.elementIf(
            invoice.payment?.bic,
            "cac:FinancialInstitutionBranch",
            void 0,
            (b) => b.leaf("cbc:ID", invoice.payment?.bic)
          );
        });
      }
    });
    w.elementIf(
      invoice.payment.terms,
      "cac:PaymentTerms",
      void 0,
      (x) => x.leaf("cbc:Note", invoice.payment?.terms)
    );
  }
  for (const ac of invoice.allowancesCharges) {
    w.element("cac:AllowanceCharge", void 0, (x) => {
      x.leaf("cbc:ChargeIndicator", ac.isCharge ? "true" : "false");
      x.leaf("cbc:AllowanceChargeReasonCode", ac.reasonCode);
      x.leaf("cbc:AllowanceChargeReason", ac.reason);
      if (ac.percentage !== void 0) x.leaf("cbc:MultiplierFactorNumeric", decimal(ac.percentage, 2));
      x.leaf("cbc:Amount", decimal(ac.amount), cur);
      if (ac.baseAmount !== void 0) x.leaf("cbc:BaseAmount", decimal(ac.baseAmount), cur);
      x.element("cac:TaxCategory", void 0, (t) => {
        t.leaf("cbc:ID", ac.vat.category);
        t.leaf("cbc:Percent", decimal(ac.vat.rate, 2));
        t.element("cac:TaxScheme", void 0, (s) => s.leaf("cbc:ID", "VAT"));
      });
    });
  }
  w.element("cac:TaxTotal", void 0, (x) => {
    x.leaf("cbc:TaxAmount", decimal(totals.taxTotal), cur);
    for (const tax of totals.vatBreakdown) {
      x.element("cac:TaxSubtotal", void 0, (s) => {
        s.leaf("cbc:TaxableAmount", decimal(tax.taxableAmount), cur);
        s.leaf("cbc:TaxAmount", decimal(tax.taxAmount), cur);
        s.element("cac:TaxCategory", void 0, (c) => {
          c.leaf("cbc:ID", tax.category);
          c.leaf("cbc:Percent", decimal(tax.rate, 2));
          c.leaf("cbc:TaxExemptionReasonCode", tax.exemptionReasonCode);
          c.leaf("cbc:TaxExemptionReason", tax.exemptionReason);
          c.element("cac:TaxScheme", void 0, (t) => t.leaf("cbc:ID", "VAT"));
        });
      });
    }
  });
  w.element("cac:LegalMonetaryTotal", void 0, (x) => {
    x.leaf("cbc:LineExtensionAmount", decimal(totals.lineTotal), cur);
    x.leaf("cbc:TaxExclusiveAmount", decimal(totals.taxBasisTotal), cur);
    x.leaf("cbc:TaxInclusiveAmount", decimal(totals.grandTotal), cur);
    if (totals.allowanceTotal !== 0) {
      x.leaf("cbc:AllowanceTotalAmount", decimal(totals.allowanceTotal), cur);
    }
    if (totals.chargeTotal !== 0) {
      x.leaf("cbc:ChargeTotalAmount", decimal(totals.chargeTotal), cur);
    }
    if (totals.paidAmount !== 0) x.leaf("cbc:PrepaidAmount", decimal(totals.paidAmount), cur);
    if (totals.roundingAmount !== 0) {
      x.leaf("cbc:PayableRoundingAmount", decimal(totals.roundingAmount), cur);
    }
    x.leaf("cbc:PayableAmount", decimal(totals.duePayable), cur);
  });
  invoice.lines.forEach((line, index) => {
    writeLine2(w, line, totals.lineAmounts[index] ?? 0, currency, lineTag, quantityTag);
  });
  w.close(root);
  return w.toString();
}
function writeLine2(w, line, netAmount, currency, lineTag, quantityTag) {
  w.element(lineTag, void 0, (x) => {
    x.leaf("cbc:ID", line.id);
    x.leaf("cbc:Note", line.description);
    x.leaf(quantityTag, decimal(line.quantity, 4), { unitCode: line.unitCode });
    x.leaf("cbc:LineExtensionAmount", decimal(netAmount), { currencyID: currency });
    if (line.periodStart && line.periodEnd) {
      x.element("cac:InvoicePeriod", void 0, (p) => {
        p.leaf("cbc:StartDate", line.periodStart);
        p.leaf("cbc:EndDate", line.periodEnd);
      });
    }
    x.elementIf(
      line.orderLineReference,
      "cac:OrderLineReference",
      void 0,
      (r) => r.leaf("cbc:LineID", line.orderLineReference)
    );
    for (const ac of line.allowancesCharges) writeLineAllowanceCharge(x, ac, currency);
    x.element("cac:Item", void 0, (item) => {
      item.leaf("cbc:Description", line.description);
      item.leaf("cbc:Name", line.name);
      item.elementIf(
        line.sellerItemId,
        "cac:SellersItemIdentification",
        void 0,
        (i) => i.leaf("cbc:ID", line.sellerItemId)
      );
      item.elementIf(
        line.globalItemId,
        "cac:StandardItemIdentification",
        void 0,
        (i) => i.leaf("cbc:ID", line.globalItemId, { schemeID: "0160" })
      );
      item.element("cac:ClassifiedTaxCategory", void 0, (t) => {
        t.leaf("cbc:ID", line.vat.category);
        t.leaf("cbc:Percent", decimal(line.vat.rate, 2));
        t.element("cac:TaxScheme", void 0, (s) => s.leaf("cbc:ID", "VAT"));
      });
      for (const attribute of line.attributes) {
        item.element("cac:AdditionalItemProperty", void 0, (p) => {
          p.leaf("cbc:Name", attribute.name);
          p.leaf("cbc:Value", attribute.value);
        });
      }
    });
    x.element("cac:Price", void 0, (p) => {
      p.leaf("cbc:PriceAmount", decimal(line.unitPrice, 4), { currencyID: currency });
      p.leaf("cbc:BaseQuantity", decimal(line.priceBaseQuantity ?? 1, 4), {
        unitCode: line.unitCode
      });
      if (line.unitPriceDiscount) {
        p.element("cac:AllowanceCharge", void 0, (ac) => {
          ac.leaf("cbc:ChargeIndicator", "false");
          ac.leaf("cbc:Amount", decimal(line.unitPriceDiscount ?? 0, 4), { currencyID: currency });
          if (line.grossUnitPrice !== void 0) {
            ac.leaf("cbc:BaseAmount", decimal(line.grossUnitPrice, 4), { currencyID: currency });
          }
        });
      }
    });
  });
}
function writeLineAllowanceCharge(w, ac, currency) {
  w.element("cac:AllowanceCharge", void 0, (x) => {
    x.leaf("cbc:ChargeIndicator", ac.isCharge ? "true" : "false");
    x.leaf("cbc:AllowanceChargeReasonCode", ac.reasonCode);
    x.leaf("cbc:AllowanceChargeReason", ac.reason);
    if (ac.percentage !== void 0) x.leaf("cbc:MultiplierFactorNumeric", decimal(ac.percentage, 2));
    x.leaf("cbc:Amount", decimal(ac.amount), { currencyID: currency });
    if (ac.baseAmount !== void 0) {
      x.leaf("cbc:BaseAmount", decimal(ac.baseAmount), { currencyID: currency });
    }
  });
}
function writeParty2(w, party, isSeller) {
  w.element("cac:Party", void 0, (x) => {
    if (party.electronicAddress) {
      x.leaf("cbc:EndpointID", party.electronicAddress.value, {
        schemeID: party.electronicAddress.scheme
      });
    }
    x.elementIf(
      party.identifier,
      "cac:PartyIdentification",
      void 0,
      (i) => i.leaf("cbc:ID", party.identifier)
    );
    x.elementIf(
      party.tradingName,
      "cac:PartyName",
      void 0,
      (n) => n.leaf("cbc:Name", party.tradingName)
    );
    x.element("cac:PostalAddress", void 0, (a) => writeAddressBody(a, party.address));
    if (party.vatId) {
      x.element("cac:PartyTaxScheme", void 0, (t) => {
        t.leaf("cbc:CompanyID", party.vatId);
        t.element("cac:TaxScheme", void 0, (s) => s.leaf("cbc:ID", "VAT"));
      });
    }
    if (isSeller && party.taxNumber) {
      x.element("cac:PartyTaxScheme", void 0, (t) => {
        t.leaf("cbc:CompanyID", party.taxNumber);
        t.element("cac:TaxScheme", void 0, (s) => s.leaf("cbc:ID", "FC"));
      });
    }
    x.element("cac:PartyLegalEntity", void 0, (l) => {
      l.leaf("cbc:RegistrationName", party.name);
      l.leaf("cbc:CompanyID", party.legalRegistrationId);
    });
    if (party.contact) {
      x.element("cac:Contact", void 0, (c) => {
        c.leaf("cbc:Name", party.contact?.name);
        c.leaf("cbc:Telephone", party.contact?.phone);
        c.leaf("cbc:ElectronicMail", party.contact?.email);
      });
    }
  });
}
function writeAddressBody(w, address) {
  w.leaf("cbc:StreetName", address.line1);
  w.leaf("cbc:AdditionalStreetName", address.line2);
  w.leaf("cbc:CityName", address.city);
  w.leaf("cbc:PostalZone", address.postcode);
  w.leaf("cbc:CountrySubentity", address.subdivision);
  w.element("cac:Country", void 0, (c) => c.leaf("cbc:IdentificationCode", address.countryCode));
}

// src/pdf/pdfa3.ts
import {
  rgb as rgb4,
  AFRelationship,
  PDFDocument as PDFDocument4,
  PDFHexString as PDFHexString2,
  PDFName as PDFName4,
  PDFString
} from "pdf-lib";
import fontkit3 from "@pdf-lib/fontkit";

// src/pdf/kerning.ts
import fontkit from "@pdf-lib/fontkit";
import {
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  PDFOperator,
  PDFOperatorNames
} from "pdf-lib";
var quellen = /* @__PURE__ */ new WeakMap();
function merkeSchriftquelle(schrift, bytes, merkmale) {
  try {
    quellen.set(schrift, { schrift: fontkit.create(bytes), merkmale });
  } catch {
  }
}
function unterschneidungen(schrift, text2) {
  const quelle = quellen.get(schrift);
  if (!quelle) return [];
  try {
    const lauf = quelle.schrift.layout(text2, quelle.merkmale);
    const einheit = 1e3 / quelle.schrift.unitsPerEm;
    const werte = [];
    for (const [nummer, glyphe] of lauf.glyphs.entries()) {
      const gesetzt = lauf.positions[nummer]?.xAdvance ?? glyphe.advanceWidth;
      werte.push(Math.round((glyphe.advanceWidth - gesetzt) * einheit * 100) / 100);
    }
    werte.pop();
    return werte;
  } catch {
    return [];
  }
}
function gekernteBreite(schrift, text2, groesse) {
  const roh = schrift.widthOfTextAtSize(text2, groesse);
  const abzug = unterschneidungen(schrift, text2).reduce((summe, wert) => summe + wert, 0);
  return roh - abzug / 1e3 * groesse;
}
var schluessel = /* @__PURE__ */ new WeakMap();
function schriftschluessel(seite, schrift) {
  let jeSeite = schluessel.get(seite);
  if (!jeSeite) {
    jeSeite = /* @__PURE__ */ new Map();
    schluessel.set(seite, jeSeite);
  }
  let name = jeSeite.get(schrift);
  if (name === void 0) {
    name = seite.node.newFontDictionary(schrift.name, schrift.ref).asString().slice(1);
    jeSeite.set(schrift, name);
  }
  return name;
}
function zeichneGekernt(seite, text2, x, y, schrift, groesse, farbe2) {
  const werte = unterschneidungen(schrift, text2);
  const zeichen = [...text2];
  if (werte.length === 0 || werte.length !== zeichen.length - 1) return false;
  if (werte.every((wert) => wert === 0)) return false;
  const teile = [];
  let stueck = zeichen[0] ?? "";
  for (let i = 0; i + 1 < zeichen.length; i += 1) {
    const wert = werte[i] ?? 0;
    if (wert === 0) {
      stueck += zeichen[i + 1];
      continue;
    }
    teile.push(schrift.encodeText(stueck).toString(), String(wert));
    stueck = zeichen[i + 1] ?? "";
  }
  teile.push(schrift.encodeText(stueck).toString());
  seite.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFontAndSize(schriftschluessel(seite, schrift), groesse),
    setFillingColor(farbe2),
    setTextMatrix(1, 0, 0, 1, x, y),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [`[${teile.join(" ")}]`]),
    endText(),
    popGraphicsState()
  );
  return true;
}

// src/pdf/briefpapier.ts
import { PDFNumber as PDFNumber2, PDFOperator as PDFOperator2, PDFOperatorNames as PDFOperatorNames2, rgb } from "pdf-lib";

// src/parse/pdf-gestaltung.ts
import { PDFDocument as PDFDocument2 } from "pdf-lib";

// src/parse/pdf-breiten.ts
import { PDFArray, PDFDict, PDFName, PDFNumber } from "pdf-lib";
var DW_VORGABE = 1e3;
function leseW(feld) {
  const breiten = /* @__PURE__ */ new Map();
  if (!feld) return breiten;
  const werte = feld.asArray();
  let i = 0;
  while (i < werte.length) {
    const erstes = werte[i];
    if (!(erstes instanceof PDFNumber)) break;
    const von = erstes.asNumber();
    const zweites = werte[i + 1];
    if (zweites instanceof PDFArray) {
      for (const [versatz, wert] of zweites.asArray().entries()) {
        if (wert instanceof PDFNumber) breiten.set(von + versatz, wert.asNumber());
      }
      i += 2;
      continue;
    }
    const drittes = werte[i + 2];
    if (zweites instanceof PDFNumber && drittes instanceof PDFNumber) {
      const bis = zweites.asNumber();
      const wert = drittes.asNumber();
      for (let code = von; code <= bis && code - von < 65536; code += 1) {
        breiten.set(code, wert);
      }
      i += 3;
      continue;
    }
    break;
  }
  return breiten;
}
function zahl(dict, name) {
  const wert = dict?.lookupMaybe(PDFName.of(name), PDFNumber);
  return wert ? wert.asNumber() : void 0;
}
function liefereBreiten(doc, seite) {
  const alle = /* @__PURE__ */ new Map();
  const ressourcen = doc.getPage(seite).node.Resources();
  const fonts = ressourcen?.lookupMaybe(PDFName.of("Font"), PDFDict);
  if (!fonts) return alle;
  for (const [name] of fonts.asMap()) {
    const dict = fonts.lookupMaybe(name, PDFDict);
    if (!dict) continue;
    const art = dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString();
    const schluessel2 = name.asString().replace(/^\//, "");
    if (art === "/Type0") {
      const nachfahren = dict.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
      const kind = nachfahren ? doc.context.lookupMaybe(nachfahren.get(0), PDFDict) : void 0;
      const vorgabe = zahl(kind, "DW") ?? DW_VORGABE;
      const tabelle2 = leseW(kind?.lookupMaybe(PDFName.of("W"), PDFArray));
      alle.set(schluessel2, {
        breit: true,
        breite: (code) => tabelle2.get(code) ?? vorgabe
      });
      continue;
    }
    const ersterCode = zahl(dict, "FirstChar") ?? 0;
    const liste = dict.lookupMaybe(PDFName.of("Widths"), PDFArray);
    const deskriptor = dict.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
    const fehlend = zahl(deskriptor, "MissingWidth") ?? 0;
    const tabelle = /* @__PURE__ */ new Map();
    for (const [versatz, wert] of liste?.asArray().entries() ?? []) {
      if (wert instanceof PDFNumber) tabelle.set(ersterCode + versatz, wert.asNumber());
    }
    alle.set(schluessel2, {
      breit: false,
      breite: (code) => tabelle.get(code) ?? fehlend
    });
  }
  return alle;
}
function laufbreite(stuecke, breiten, groesse, zeichenabstand = 0, wortabstand = 0, streckung = 1) {
  if (!breiten) return 0;
  let summe = 0;
  for (const teil of stuecke) {
    if (typeof teil === "number") {
      summe -= teil / 1e3 * groesse * streckung;
      continue;
    }
    const schritt = breiten.breit ? 2 : 1;
    for (let i = 0; i + schritt <= teil.length; i += schritt) {
      const code = breiten.breit ? (teil[i] ?? 0) << 8 | (teil[i + 1] ?? 0) : teil[i] ?? 0;
      const wort = !breiten.breit && code === 32 ? wortabstand : 0;
      summe += (breiten.breite(code) / 1e3 * groesse + zeichenabstand + wort) * streckung;
    }
  }
  return summe;
}

// src/parse/pdf-text.ts
import { PDFArray as PDFArray2, PDFDict as PDFDict2, PDFDocument, PDFName as PDFName2, PDFRawStream, decodePDFRawStream } from "pdf-lib";
function leseToUnicode(text2) {
  const karte = /* @__PURE__ */ new Map();
  for (const block of text2.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const eintrag of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const ziel = eintrag[2] ?? "";
      let zeichen = "";
      for (let i = 0; i + 4 <= ziel.length; i += 4) {
        zeichen += String.fromCodePoint(parseInt(ziel.slice(i, i + 4), 16));
      }
      karte.set(parseInt(eintrag[1] ?? "0", 16), zeichen);
    }
  }
  for (const block of text2.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const eintrag of (block[1] ?? "").matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g
    )) {
      const von = parseInt(eintrag[1] ?? "0", 16);
      const bis = parseInt(eintrag[2] ?? "0", 16);
      const ziel = parseInt((eintrag[3] ?? "").slice(0, 4), 16);
      for (let i = von; i <= bis && i - von < 8192; i += 1) {
        karte.set(i, String.fromCodePoint(ziel + (i - von)));
      }
    }
  }
  return karte;
}
var FETTE_SCHNITTE = /bold|semibold|black|heavy|extrabold|demibold|medium/i;
function lieferSchriften(doc, seite) {
  const schriften = /* @__PURE__ */ new Map();
  const ressourcen = doc.getPage(seite).node.Resources();
  const fonts = ressourcen?.lookupMaybe(PDFName2.of("Font"), PDFDict2);
  if (!fonts) return schriften;
  for (const [name, verweis] of fonts.asMap()) {
    const dict = doc.context.lookupMaybe(verweis, PDFDict2);
    if (!dict) continue;
    const subtype = dict.lookupMaybe(PDFName2.of("Subtype"), PDFName2)?.asString();
    const roh = dict.lookup(PDFName2.of("ToUnicode"));
    const strom = roh instanceof PDFRawStream ? roh : void 0;
    const grundname = dict.lookupMaybe(PDFName2.of("BaseFont"), PDFName2)?.asString() ?? "";
    schriften.set(name.asString().replace(/^\//, ""), {
      breit: subtype === "/Type0",
      fett: FETTE_SCHNITTE.test(grundname),
      name: grundname.replace(/^\//, "").replace(/^[A-Z]{6}\+/, ""),
      ...strom ? { karte: leseToUnicode(latin1(decodePDFRawStream(strom).decode())) } : {}
    });
  }
  return schriften;
}
var latin1 = (bytes) => {
  let text2 = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    text2 += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return text2;
};
var UNLESBAR = "\uFFFD";
function entschluessle(roh, schrift) {
  if (!schrift) return roh.map((byte) => String.fromCharCode(byte)).join("");
  if (schrift.breit) {
    let text2 = "";
    for (let i = 0; i + 1 < roh.length; i += 2) {
      const code = (roh[i] ?? 0) << 8 | (roh[i + 1] ?? 0);
      text2 += schrift.karte?.get(code) ?? UNLESBAR;
    }
    return text2;
  }
  return roh.map((byte) => schrift.karte?.get(byte) ?? String.fromCharCode(byte)).join("");
}
function leseInhalt(quelle, aufOperator) {
  let i = 0;
  let operanden = [];
  const istLeer = (zeichen) => " 	\r\n\f\0".includes(zeichen);
  const istTrenner = (zeichen) => "()<>[]{}/%".includes(zeichen);
  const leseZeichenkette = () => {
    const bytes = [];
    let tiefe = 1;
    i += 1;
    while (i < quelle.length && tiefe > 0) {
      const zeichen = quelle[i] ?? "";
      if (zeichen === "\\") {
        const naechstes = quelle[i + 1] ?? "";
        const einfach = { n: 10, r: 13, t: 9, b: 8, f: 12 };
        if (naechstes in einfach) {
          bytes.push(einfach[naechstes]);
          i += 2;
        } else if (naechstes >= "0" && naechstes <= "7") {
          let oktal = "";
          i += 1;
          while (oktal.length < 3 && (quelle[i] ?? "") >= "0" && (quelle[i] ?? "") <= "7") {
            oktal += quelle[i];
            i += 1;
          }
          bytes.push(parseInt(oktal, 8) & 255);
        } else {
          bytes.push(naechstes.charCodeAt(0));
          i += 2;
        }
        continue;
      }
      if (zeichen === "(") tiefe += 1;
      if (zeichen === ")") {
        tiefe -= 1;
        if (tiefe === 0) {
          i += 1;
          break;
        }
      }
      bytes.push(zeichen.charCodeAt(0));
      i += 1;
    }
    return bytes;
  };
  const leseHex = () => {
    i += 1;
    let ziffern = "";
    while (i < quelle.length && quelle[i] !== ">") {
      const zeichen = quelle[i] ?? "";
      if (/[0-9A-Fa-f]/.test(zeichen)) ziffern += zeichen;
      i += 1;
    }
    i += 1;
    if (ziffern.length % 2 === 1) ziffern += "0";
    const bytes = [];
    for (let stelle = 0; stelle < ziffern.length; stelle += 2) {
      bytes.push(parseInt(ziffern.slice(stelle, stelle + 2), 16));
    }
    return bytes;
  };
  while (i < quelle.length) {
    const zeichen = quelle[i] ?? "";
    if (istLeer(zeichen)) {
      i += 1;
      continue;
    }
    if (zeichen === "%") {
      while (i < quelle.length && quelle[i] !== "\n") i += 1;
      continue;
    }
    if (zeichen === "(") {
      operanden.push(leseZeichenkette());
      continue;
    }
    if (zeichen === "<") {
      if (quelle[i + 1] === "<") {
        let tiefe = 0;
        while (i < quelle.length) {
          if (quelle[i] === "<" && quelle[i + 1] === "<") {
            tiefe += 1;
            i += 2;
            continue;
          }
          if (quelle[i] === ">" && quelle[i + 1] === ">") {
            tiefe -= 1;
            i += 2;
            if (tiefe === 0) break;
            continue;
          }
          i += 1;
        }
        continue;
      }
      operanden.push(leseHex());
      continue;
    }
    if (zeichen === "[") {
      i += 1;
      operanden.push("[");
      continue;
    }
    if (zeichen === "]") {
      i += 1;
      const inhalt = [];
      while (operanden.length > 0 && operanden[operanden.length - 1] !== "[") {
        inhalt.unshift(operanden.pop());
      }
      operanden.pop();
      operanden.push(inhalt);
      continue;
    }
    if (zeichen === "/") {
      i += 1;
      let name = "";
      while (i < quelle.length && !istLeer(quelle[i] ?? "") && !istTrenner(quelle[i] ?? "")) {
        name += quelle[i];
        i += 1;
      }
      operanden.push(`/${name}`);
      continue;
    }
    let wort = "";
    while (i < quelle.length && !istLeer(quelle[i] ?? "") && !istTrenner(quelle[i] ?? "")) {
      wort += quelle[i];
      i += 1;
    }
    if (!wort) {
      i += 1;
      continue;
    }
    if (/^[-+.\d]/.test(wort) && Number.isFinite(Number(wort))) {
      operanden.push(Number(wort));
      continue;
    }
    aufOperator(wort, operanden);
    operanden = [];
  }
}
function seiteninhalt(doc, seite) {
  const inhalt = doc.getPage(seite).node.Contents();
  if (!inhalt) return "";
  const stroeme = inhalt instanceof PDFArray2 ? inhalt.asArray().map((verweis) => doc.context.lookup(verweis)) : [inhalt];
  let roh = "";
  for (const strom of stroeme) {
    if (strom instanceof PDFRawStream) roh += latin1(decodePDFRawStream(strom).decode());
  }
  return roh;
}
var ZEILENTOLERANZ = 3;
var WORTLUECKE = 0.2;
async function liesPdfText(bytes) {
  const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
  const seiten = [];
  for (let nummer = 0; nummer < doc.getPageCount(); nummer += 1) {
    const schriften = lieferSchriften(doc, nummer);
    const stuecke = [];
    let schrift;
    let ma = 1;
    let mb = 0;
    let mc = 0;
    let md = 1;
    let tx = 0;
    let ty = 0;
    let zx = 0;
    let zy = 0;
    let durchschuss = 0;
    let schriftgroesse = 0;
    let zeichenabstand = 0;
    let wortabstand = 0;
    let streckung = 1;
    const breitenTabelle = liefereBreiten(doc, nummer);
    let breiten;
    const messe = (teile) => laufbreite(teile, breiten, schriftgroesse, zeichenabstand, wortabstand, streckung) * ma;
    const schiebe = (schub) => {
      tx += schub;
      ty += schub / (ma || 1) * mb;
    };
    const ruecke = (dx, dy) => {
      zx += dx * ma + dy * mc;
      zy += dx * mb + dy * md;
      tx = zx;
      ty = zy;
    };
    const zeige = (roh, breite) => {
      const text3 = entschluessle(roh, schrift);
      if (text3.trim()) {
        stuecke.push({
          x: tx,
          y: ty,
          groesse: schriftgroesse * (md || 1),
          breite,
          fett: schrift?.fett === true,
          schnitt: schrift?.name ?? "",
          text: text3
        });
      }
    };
    leseInhalt(seiteninhalt(doc, nummer), (operator, operanden) => {
      switch (operator) {
        case "BT":
          tx = zx = 0;
          ty = zy = 0;
          ma = md = 1;
          mb = mc = 0;
          break;
        case "Tc":
          zeichenabstand = Number(operanden[operanden.length - 1] ?? 0);
          break;
        case "Tw":
          wortabstand = Number(operanden[operanden.length - 1] ?? 0);
          break;
        case "Tz":
          streckung = Number(operanden[operanden.length - 1] ?? 100) / 100;
          break;
        case "Tf": {
          schriftgroesse = Number(operanden[operanden.length - 1] ?? 0);
          const name = String(operanden[operanden.length - 2] ?? "").replace(/^\//, "");
          schrift = schriften.get(name);
          breiten = breitenTabelle.get(name);
          break;
        }
        case "TL":
          durchschuss = Number(operanden[operanden.length - 1] ?? 0);
          break;
        case "Td":
        case "TD": {
          const [dx, dy] = operanden.slice(-2).map(Number);
          if (operator === "TD") durchschuss = -(dy ?? 0);
          ruecke(dx ?? 0, dy ?? 0);
          break;
        }
        case "Tm": {
          const werte = operanden.slice(-6).map(Number);
          ma = werte[0] ?? 1;
          mb = werte[1] ?? 0;
          mc = werte[2] ?? 0;
          md = werte[3] ?? 1;
          zx = tx = werte[4] ?? 0;
          zy = ty = werte[5] ?? 0;
          break;
        }
        case "T*":
          ruecke(0, -durchschuss);
          break;
        case "Tj":
        case "'":
        case '"': {
          if (operator !== "Tj") ruecke(0, -durchschuss);
          const letzte = operanden[operanden.length - 1];
          if (Array.isArray(letzte)) {
            const schub = messe([letzte]);
            zeige(letzte, schub);
            schiebe(schub);
          }
          break;
        }
        case "TJ": {
          const liste = operanden[operanden.length - 1];
          if (!Array.isArray(liste)) break;
          const roh = [];
          for (const teil of liste) {
            if (Array.isArray(teil)) roh.push(...teil);
          }
          const schub = messe(
            liste.filter((teil) => Array.isArray(teil) || typeof teil === "number")
          );
          zeige(roh, schub);
          schiebe(schub);
          break;
        }
        default:
          break;
      }
    });
    seiten.push({ zeilen: zuZeilen(stuecke) });
  }
  const text2 = seiten.flatMap((seite) => seite.zeilen.map((zeile2) => zeile2.text)).join("\n");
  return { seiten, text: text2, leer: text2.trim().length === 0 };
}
function zuZeilen(stuecke) {
  const zeilen = [];
  for (const stueck of [...stuecke].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const passend = zeilen.find((zeile2) => Math.abs(zeile2.y - stueck.y) <= ZEILENTOLERANZ);
    if (passend) passend.stuecke.push(stueck);
    else zeilen.push({ y: stueck.y, stuecke: [stueck], text: "" });
  }
  for (const zeile2 of zeilen) {
    zeile2.stuecke.sort((a, b) => a.x - b.x);
    let text2 = "";
    let ende;
    for (const stueck of zeile2.stuecke) {
      const inhalt = stueck.text;
      if (!inhalt.trim()) continue;
      if (text2 && ende !== void 0) {
        const luecke = stueck.x - ende;
        if (luecke > Math.max(stueck.groesse, 1) * WORTLUECKE) text2 += " ";
      }
      text2 += inhalt;
      ende = stueck.x + stueck.breite;
    }
    zeile2.text = text2.replace(/\s+/g, " ").trim();
  }
  return zeilen.filter((zeile2) => zeile2.text.length > 0);
}

// src/parse/pdf-gestaltung.ts
var grau = (v) => ({ r: v, g: v, b: v });
var ausCmyk = (c, m, y, k) => ({
  r: 1 - Math.min(1, c + k),
  g: 1 - Math.min(1, m + k),
  b: 1 - Math.min(1, y + k)
});
function farbeAus(werte) {
  if (werte.length === 1) return grau(werte[0] ?? 0);
  if (werte.length === 3) return { r: werte[0] ?? 0, g: werte[1] ?? 0, b: werte[2] ?? 0 };
  if (werte.length === 4) {
    return ausCmyk(werte[0] ?? 0, werte[1] ?? 0, werte[2] ?? 0, werte[3] ?? 0);
  }
  return void 0;
}
function alsHex(farbe2) {
  const teil = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0").toUpperCase();
  return `#${teil(farbe2.r)}${teil(farbe2.g)}${teil(farbe2.b)}`;
}
function istGrau(farbe2) {
  const max = Math.max(farbe2.r, farbe2.g, farbe2.b);
  const min = Math.min(farbe2.r, farbe2.g, farbe2.b);
  return max - min < 0.08;
}
var EINHEIT = [1, 0, 0, 1, 0, 0];
function malmal(m, n) {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5]
  ];
}
var wende = (m, x, y) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5]
];
var massstab = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
var KREISTOLERANZ = 0.02;
var RANDMARKE_BIS = 60;
var VOLLE_SATZBREITE = 0.9;
var SATZBREITE_AB = 0.6;
function alsKreis(punkte, boegen) {
  if (boegen < 3 || punkte.length < 4) return void 0;
  const xs = punkte.map((p) => p.x);
  const ys = punkte.map((p) => p.y);
  const breite = Math.max(...xs) - Math.min(...xs);
  const hoehe = Math.max(...ys) - Math.min(...ys);
  if (breite < 1 || Math.abs(breite - hoehe) / breite > KREISTOLERANZ) return void 0;
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    r: breite / 2
  };
}
var PLZ_ZEILE = /^(\d{5})\s+[A-Za-zÄÖÜäöüß]/;
var STRASSENZEILE = /[A-Za-zÄÖÜäöüß.]\s+\d+\s?[a-zA-Z]?$/;
function findeGrenze(zeilen, seitenhoehe) {
  const unten = seitenhoehe * 0.6;
  const oben = seitenhoehe * 0.88;
  const sortiert = [...zeilen].sort((a, b) => b.y - a.y);
  for (const [stelle, zeile2] of sortiert.entries()) {
    if (zeile2.y < unten || zeile2.y > oben) continue;
    if (!PLZ_ZEILE.test(zeile2.text)) continue;
    let kopf = zeile2;
    let hoch = stelle - 1;
    while (hoch >= 0) {
      const darueber = sortiert[hoch];
      if (!darueber || darueber.y - kopf.y > kopf.hoehe * 2.2) break;
      kopf = darueber;
      hoch -= 1;
    }
    if (kopf === zeile2 && !STRASSENZEILE.test(zeile2.text)) continue;
    return kopf.y + kopf.hoehe;
  }
  return seitenhoehe * 0.8;
}
var FUSSZONE = 0.22;
var FUSSBLOCK = 2.5;
var FUSSABSTAND = 4;
var SEITENZAHL = /^\s*(Seite\s+\d+(\s*(von|\/)\s*\d+)?|\d+\s*\/\s*\d+)\s*$/i;
function findeFussgrenze(zeilen, seitenhoehe) {
  const sortiert = [...zeilen].filter((zeile2) => !SEITENZAHL.test(zeile2.text)).sort((a, b) => a.y - b.y);
  const unterste = sortiert[0];
  if (!unterste || unterste.y > seitenhoehe * FUSSZONE) return 0;
  let kopf = unterste;
  let stelle = 1;
  while (stelle < sortiert.length) {
    const naechste = sortiert[stelle];
    if (!naechste || naechste.y - kopf.y > kopf.hoehe * FUSSBLOCK) break;
    kopf = naechste;
    stelle += 1;
  }
  const darueber = sortiert[stelle];
  if (!darueber) return 0;
  const luecke = darueber.y - kopf.y;
  if (luecke < kopf.hoehe * FUSSABSTAND) return 0;
  return kopf.y + kopf.hoehe;
}
async function liesBriefpapier(bytes, seite = 0) {
  const doc = await PDFDocument2.load(bytes, { throwOnInvalidObject: false });
  const blatt = doc.getPage(seite);
  const { width: breite, height: hoehe } = blatt.getSize();
  const gelesen = await liesPdfText(bytes);
  const zeilen = (gelesen.seiten[seite]?.zeilen ?? []).map((z) => ({
    y: z.y,
    text: z.text,
    hoehe: Math.max(...z.stuecke.map((s) => Math.abs(s.groesse)), 8)
  }));
  const grenze = findeGrenze(zeilen, hoehe);
  const fussgrenze = findeFussgrenze(zeilen, hoehe);
  const imBriefpapier = (y) => y > grenze || fussgrenze > 0 && y < fussgrenze;
  const pfade = [];
  const striche = [];
  const kreise = [];
  const flaechen = [];
  let ungedeutet = 0;
  let zustand = {
    matrix: EINHEIT,
    fuellung: grau(0),
    strichfarbe: grau(0),
    staerke: 1
  };
  const stapel = [];
  let punkte = [];
  let boegen = 0;
  let rechteck;
  let d = "";
  let letzt = [0, 0];
  let anstehenderBeschnitt;
  const laeufe = [];
  const breitenTabelle = liefereBreiten(doc, seite);
  let tm = EINHEIT;
  let zm = EINHEIT;
  let schriftname = "";
  let schriftgroesse = 0;
  let durchschuss = 0;
  let zeichenabstand = 0;
  let wortabstand = 0;
  let streckung = 1;
  let breiten;
  leseInhalt(seiteninhalt(doc, seite), (operator, operanden) => {
    const z = (wieviel) => operanden.slice(-wieviel).map(Number);
    const nurZahlen = () => operanden.filter((w) => typeof w === "number");
    const insSvg = (x, y) => {
      const [px, py] = wende(zustand.matrix, x, y);
      return `${px.toFixed(2)} ${(hoehe - py).toFixed(2)}`;
    };
    switch (operator) {
      case "q":
        stapel.push({ ...zustand });
        break;
      case "Q":
        zustand = stapel.pop() ?? zustand;
        break;
      case "cm":
        zustand.matrix = malmal(z(6), zustand.matrix);
        break;
      case "w":
        zustand.staerke = z(1)[0] ?? 1;
        break;
      case "g":
      case "rg":
      case "k":
      case "sc":
      case "scn": {
        const farbe2 = farbeAus(nurZahlen());
        if (farbe2) zustand.fuellung = farbe2;
        break;
      }
      case "G":
      case "RG":
      case "K":
      case "SC":
      case "SCN": {
        const farbe2 = farbeAus(nurZahlen());
        if (farbe2) zustand.strichfarbe = farbe2;
        break;
      }
      case "W":
      case "W*":
        anstehenderBeschnitt = rechteck ? { x: rechteck.x, y: rechteck.y, breite: rechteck.breite, hoehe: rechteck.hoehe } : void 0;
        break;
      case "m":
      case "l": {
        const [x, y] = z(2);
        d += `${operator === "m" ? " M " : " L "}${insSvg(x ?? 0, y ?? 0)}`;
        letzt = [x ?? 0, y ?? 0];
        const [px, py] = wende(zustand.matrix, x ?? 0, y ?? 0);
        punkte.push({ x: px, y: py });
        break;
      }
      case "c":
      case "v":
      case "y": {
        const w = z(operator === "c" ? 6 : 4);
        const ziel = [w[w.length - 2] ?? 0, w[w.length - 1] ?? 0];
        const eins = operator === "v" ? letzt : [w[0] ?? 0, w[1] ?? 0];
        const zwei = operator === "y" ? ziel : [w[w.length - 4] ?? 0, w[w.length - 3] ?? 0];
        d += ` C ${insSvg(eins[0], eins[1])} ${insSvg(zwei[0], zwei[1])} ${insSvg(ziel[0], ziel[1])}`;
        letzt = ziel;
        const [px, py] = wende(zustand.matrix, ziel[0], ziel[1]);
        punkte.push({ x: px, y: py });
        boegen += 1;
        break;
      }
      case "h":
        d += " Z";
        break;
      case "re": {
        const [x, y, b, h] = z(4);
        d += ` M ${insSvg(x ?? 0, y ?? 0)} L ${insSvg((x ?? 0) + (b ?? 0), y ?? 0)} L ${insSvg((x ?? 0) + (b ?? 0), (y ?? 0) + (h ?? 0))} L ${insSvg(x ?? 0, (y ?? 0) + (h ?? 0))} Z`;
        letzt = [x ?? 0, y ?? 0];
        const [x1, y1] = wende(zustand.matrix, x ?? 0, y ?? 0);
        const [x2, y2] = wende(zustand.matrix, (x ?? 0) + (b ?? 0), (y ?? 0) + (h ?? 0));
        rechteck = {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          breite: Math.abs(x2 - x1),
          hoehe: Math.abs(y2 - y1),
          farbe: zustand.fuellung
        };
        punkte.push({ x: x1, y: y1 }, { x: x2, y: y2 });
        break;
      }
      case "S":
      case "s":
      case "f":
      case "F":
      case "f*":
      case "B":
      case "B*":
      case "b":
      case "b*":
      case "n": {
        const gefuellt = /^[fFBb]/.test(operator);
        const gestrichen = /^[SsBb]/.test(operator);
        const staerke = zustand.staerke * massstab(zustand.matrix);
        const kreis = alsKreis(punkte, boegen);
        if (d.trim() && (gefuellt || gestrichen) && punkte.length > 0) {
          const xs = punkte.map((punkt) => punkt.x);
          const ys = punkte.map((punkt) => punkt.y);
          pfade.push({
            d: d.trim(),
            fuellung: gefuellt ? zustand.fuellung : void 0,
            strich: gestrichen ? zustand.strichfarbe : void 0,
            staerke,
            rahmen: {
              x1: Math.min(...xs),
              y1: Math.min(...ys),
              x2: Math.max(...xs),
              y2: Math.max(...ys)
            },
            ...zustand.beschnitt ? { beschnitt: zustand.beschnitt } : {}
          });
        }
        if (kreis && (gefuellt || gestrichen)) {
          kreise.push({
            ...kreis,
            farbe: gefuellt ? zustand.fuellung : zustand.strichfarbe,
            gefuellt
          });
        } else if (rechteck && gefuellt) {
          flaechen.push({ ...rechteck, farbe: zustand.fuellung });
        } else if (punkte.length === 2 && gestrichen) {
          const anfang = punkte[0];
          const ende = punkte[1];
          striche.push({
            x1: anfang.x,
            y1: anfang.y,
            x2: ende.x,
            y2: ende.y,
            staerke,
            farbe: zustand.strichfarbe
          });
        } else if (operator !== "n" && punkte.length > 0) {
          ungedeutet += 1;
        }
        if (anstehenderBeschnitt) {
          zustand.beschnitt = anstehenderBeschnitt;
          anstehenderBeschnitt = void 0;
        }
        punkte = [];
        boegen = 0;
        rechteck = void 0;
        d = "";
        break;
      }
      // --- Text ---------------------------------------------------------
      //
      // Dieselbe Buchfuehrung wie im Textleser, aber die Bytes bleiben roh.
      // Erst zusammen mit der Grundmatrix ergibt die Textmatrix die Stelle
      // auf dem Blatt, deshalb steht das hier und nicht dort.
      case "BT":
        tm = zm = EINHEIT;
        zeichenabstand = 0;
        wortabstand = 0;
        streckung = 1;
        break;
      case "Tf":
        schriftname = String(operanden[operanden.length - 2] ?? "").replace(/^\//, "");
        schriftgroesse = Number(operanden[operanden.length - 1] ?? 0);
        breiten = breitenTabelle.get(schriftname);
        break;
      case "Tc":
        zeichenabstand = z(1)[0] ?? 0;
        break;
      case "Tw":
        wortabstand = z(1)[0] ?? 0;
        break;
      case "Tz":
        streckung = (z(1)[0] ?? 100) / 100;
        break;
      case "TL":
        durchschuss = z(1)[0] ?? 0;
        break;
      case "Tm":
        tm = zm = z(6);
        break;
      case "Td":
      case "TD": {
        const [dx, dy] = z(2);
        if (operator === "TD") durchschuss = -(dy ?? 0);
        zm = malmal([1, 0, 0, 1, dx ?? 0, dy ?? 0], zm);
        tm = zm;
        break;
      }
      case "T*":
        zm = malmal([1, 0, 0, 1, 0, -durchschuss], zm);
        tm = zm;
        break;
      case "Tj":
      case "TJ":
      case "'":
      case '"': {
        if (operator === "'" || operator === '"') {
          zm = malmal([1, 0, 0, 1, 0, -durchschuss], zm);
          tm = zm;
        }
        const letzte = operanden[operanden.length - 1];
        const stuecke = operator === "TJ" && Array.isArray(letzte) ? letzte.filter(
          (teil) => Array.isArray(teil) || typeof teil === "number"
        ) : Array.isArray(letzte) ? [letzte] : [];
        const gesamt = malmal(tm, zustand.matrix);
        if (stuecke.length > 0 && imBriefpapier(gesamt[5])) {
          laeufe.push({
            schrift: schriftname,
            stuecke,
            matrix: gesamt,
            groesse: schriftgroesse,
            farbe: zustand.fuellung,
            zeichenabstand,
            wortabstand,
            streckung
          });
        }
        const schub = laufbreite(
          stuecke,
          breiten,
          schriftgroesse,
          zeichenabstand,
          wortabstand,
          streckung
        );
        if (schub !== 0) tm = malmal([1, 0, 0, 1, schub, 0], tm);
        break;
      }
      default:
        break;
    }
  });
  const texte = [];
  for (const zeile2 of gelesen.seiten[seite]?.zeilen ?? []) {
    if (!imBriefpapier(zeile2.y)) continue;
    for (const stueck of zeile2.stuecke) {
      texte.push({
        x: stueck.x,
        y: stueck.y,
        groesse: Math.abs(stueck.groesse) || 8,
        breite: stueck.breite,
        text: stueck.text
      });
    }
  }
  const briefkopfpfade = pfade.filter((pfad) => gehoertZumBriefkopf(pfad, imBriefpapier, pfade));
  const inhaltspfade = pfade.filter((pfad) => !briefkopfpfade.includes(pfad));
  return {
    seite: { breite, hoehe },
    akzent: findeAkzent(striche, kreise, flaechen),
    pfade: briefkopfpfade,
    laeufe,
    striche,
    kreise,
    flaechen,
    texte,
    falzmarken: findeFalzmarken(striche),
    grenze,
    fussgrenze,
    ungedeutet,
    ausgelassen: inhaltspfade.length,
    inhaltFuellungen: inhaltspfade.filter((pfad) => pfad.fuellung).length,
    inhaltSchrift: messeInhaltsschrift(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
    inhaltRaster: messeRaster(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
    inhaltProben: sammleProben(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
    ...findeSatzspiegel(briefkopfpfade, breite) ?? {},
    ...findeInhaltskante(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
    ...findeWaehrungswort(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
    ...findeStrichstaerken(
      inhaltspfade,
      (gelesen.seiten[seite]?.zeilen ?? []).filter(
        (zeile2) => zeile2.y <= grenze && (fussgrenze <= 0 || zeile2.y >= fussgrenze)
      )
    ),
    ...findeAnschriftzeile(gelesen.seiten[seite]?.zeilen ?? [], grenze, fussgrenze),
    ...findeTextfarbe(laeufe)
  };
}
function findeTextfarbe(laeufe) {
  let dunkelster;
  let dunkelheit = -1;
  for (const lauf of laeufe) {
    const wert = 1 - (0.299 * lauf.farbe.r + 0.587 * lauf.farbe.g + 0.114 * lauf.farbe.b);
    if (wert > dunkelheit) {
      dunkelheit = wert;
      dunkelster = lauf.farbe;
    }
  }
  return dunkelster && dunkelheit >= 0.33 ? { textfarbe: { r: dunkelster.r, g: dunkelster.g, b: dunkelster.b } } : {};
}
function findeAnschriftzeile(zeilen, grenze, fussgrenze) {
  const oberste = zeilen.filter(
    (zeile2) => zeile2.y <= grenze && (fussgrenze <= 0 || zeile2.y >= fussgrenze) && zeile2.text.trim().length > 0
  ).sort((eins, zwei) => zwei.y - eins.y)[0];
  return oberste ? { anschriftZeile: Math.round(oberste.y * 100) / 100 } : {};
}
function findeInhaltskante(zeilen, grenze, fussgrenze) {
  const zaehler = /* @__PURE__ */ new Map();
  for (const zeile2 of zeilen) {
    if (zeile2.y > grenze || fussgrenze > 0 && zeile2.y < fussgrenze) continue;
    const x = zeile2.stuecke[0]?.x;
    if (x === void 0) continue;
    const fach = Math.round(x / 5) * 5;
    const bisher = zaehler.get(fach);
    zaehler.set(fach, { anzahl: (bisher?.anzahl ?? 0) + 1, x: Math.min(bisher?.x ?? x, x) });
  }
  const kanten = [...zaehler.values()].filter((eintrag) => eintrag.anzahl >= 2).sort((eins, zwei) => eins.x - zwei.x);
  const inhalt = kanten[1];
  return inhalt ? { inhaltLinks: inhalt.x } : {};
}
function findeStrichstaerken(pfade, inhaltszeilen = []) {
  const staerken = pfade.filter((pfad) => pfad.strich).map((pfad) => pfad.staerke);
  if (staerken.length < 2) return {};
  const zaehler = /* @__PURE__ */ new Map();
  for (const staerke of staerken) {
    const fach = Math.round(staerke * 100) / 100;
    zaehler.set(fach, (zaehler.get(fach) ?? 0) + 1);
  }
  const haeufigste = [...zaehler.entries()].sort((eins, zwei) => zwei[1] - eins[1])[0]?.[0];
  const groesste = Math.max(...staerken);
  if (haeufigste === void 0 || groesste <= haeufigste) return {};
  const breiteste = pfade.filter((pfad) => pfad.strich).sort((eins, zwei) => zwei.rahmen.x2 - zwei.rahmen.x1 - (eins.rahmen.x2 - eins.rahmen.x1))[0];
  const darunter = breiteste ? inhaltszeilen.filter((zeile2) => zeile2.y < breiteste.rahmen.y1).sort((eins, zwei) => zwei.y - eins.y)[0] : void 0;
  const abstand = breiteste && darunter ? Math.round((breiteste.rahmen.y1 - darunter.y) * 10) / 10 : void 0;
  let ton;
  let dunkelheit = -1;
  for (const pfad of pfade) {
    if (!pfad.strich) continue;
    const wert = 1 - (0.299 * pfad.strich.r + 0.587 * pfad.strich.g + 0.114 * pfad.strich.b);
    if (wert > dunkelheit) {
      dunkelheit = wert;
      ton = pfad.strich;
    }
  }
  return {
    inhaltStriche: {
      fein: haeufigste,
      stark: groesste,
      ...ton && dunkelheit >= 0.33 ? { farbe: { r: ton.r, g: ton.g, b: ton.b } } : {},
      // Nur wenn es plausibel ist: ein halber bis zwei Zeilenabstaende.
      ...abstand !== void 0 && abstand > 4 && abstand < 40 ? { abstand } : {}
    }
  };
}
function findeWaehrungswort(zeilen, grenze, fussgrenze) {
  for (const zeile2 of zeilen) {
    if (zeile2.y > grenze || fussgrenze > 0 && zeile2.y < fussgrenze) continue;
    const treffer = /\d[\d.]*,\d{2}\s*(Euro|EUR|€)(?![A-Za-z])/.exec(zeile2.text);
    if (treffer?.[1]) return { waehrungswort: treffer[1] };
  }
  return {};
}
var MIN_ZEILE = 6;
var MAX_ABSATZ = 60;
function messeInhaltsschrift(zeilen, grenze, fussgrenze) {
  const groessen = [];
  for (const zeile2 of zeilen) {
    if (zeile2.y > grenze || fussgrenze > 0 && zeile2.y < fussgrenze) continue;
    for (const stueck of zeile2.stuecke) groessen.push(Math.abs(stueck.groesse));
  }
  if (groessen.length === 0) return { median: 0, groesste: 0 };
  groessen.sort((eins, zwei) => eins - zwei);
  return {
    median: groessen[Math.floor(groessen.length / 2)] ?? 0,
    groesste: groessen[groessen.length - 1] ?? 0
  };
}
var PROBE_MINDESTLAENGE = 6;
var PROBE_HOECHSTZAHL = 20;
function sammleProben(zeilen, grenze, fussgrenze) {
  const proben = [];
  for (const zeile2 of zeilen) {
    if (zeile2.y > grenze || fussgrenze > 0 && zeile2.y < fussgrenze) continue;
    for (const stueck of zeile2.stuecke) {
      if (proben.length >= PROBE_HOECHSTZAHL) return proben;
      const text2 = stueck.text.trim();
      if (text2.length < PROBE_MINDESTLAENGE || stueck.breite <= 0 || stueck.groesse <= 0) continue;
      proben.push({
        text: text2,
        breite: stueck.breite,
        groesse: Math.abs(stueck.groesse),
        fett: stueck.fett
      });
    }
  }
  return proben;
}
function messeRaster(zeilen, grenze, fussgrenze) {
  const hoehen = zeilen.filter((z) => z.y <= grenze && (fussgrenze <= 0 || z.y >= fussgrenze) && z.stuecke.length > 0).map((z) => z.y).sort((eins, zwei) => zwei - eins);
  const zaehler = /* @__PURE__ */ new Map();
  for (let i = 1; i < hoehen.length; i += 1) {
    const abstand = Math.round((hoehen[i - 1] - hoehen[i]) * 2) / 2;
    if (abstand < MIN_ZEILE || abstand > MAX_ABSATZ) continue;
    zaehler.set(abstand, (zaehler.get(abstand) ?? 0) + 1);
  }
  const mehrfach = [...zaehler.entries()].filter(([, anzahl]) => anzahl >= 2).map(([abstand]) => abstand).sort((eins, zwei) => eins - zwei);
  const zeile2 = mehrfach[0];
  if (zeile2 === void 0) return {};
  const absatz = mehrfach.find(
    (kandidat) => kandidat > zeile2 && Math.abs(kandidat / zeile2 - Math.round(kandidat / zeile2)) < 0.05
  );
  return { zeile: zeile2, ...absatz !== void 0 ? { absatz } : {} };
}
function findeSatzspiegel(pfade, seitenbreite) {
  let beste;
  for (const pfad of pfade) {
    const breite = pfad.rahmen.x2 - pfad.rahmen.x1;
    if (breite < seitenbreite * SATZBREITE_AB) continue;
    if (!beste || breite > beste.rahmen.x2 - beste.rahmen.x1) beste = pfad;
  }
  return beste ? { satzspiegel: { links: beste.rahmen.x1, rechts: beste.rahmen.x2 } } : void 0;
}
function gehoertZumBriefkopf(pfad, imBriefpapier, alle) {
  if (imBriefpapier(pfad.rahmen.y1) && imBriefpapier(pfad.rahmen.y2)) return true;
  const breite = pfad.rahmen.x2 - pfad.rahmen.x1;
  if (pfad.rahmen.x2 < RANDMARKE_BIS && breite < 30) return true;
  const breiteste = Math.max(...alle.map((p) => p.rahmen.x2 - p.rahmen.x1));
  return breiteste > 0 && breite >= breiteste * VOLLE_SATZBREITE;
}
function findeAkzent(striche, kreise, flaechen) {
  const bewerbungen = [
    ...kreise.map((k) => ({ flaeche: Math.PI * k.r * k.r, farbe: k.farbe })),
    ...flaechen.map((f) => ({ flaeche: f.breite * f.hoehe, farbe: f.farbe })),
    ...striche.map((s) => ({
      flaeche: Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * s.staerke,
      farbe: s.farbe
    }))
  ].filter((b) => !istGrau(b.farbe));
  bewerbungen.sort((a, b) => b.flaeche - a.flaeche);
  const beste = bewerbungen[0];
  return beste ? alsHex(beste.farbe) : void 0;
}
function findeFalzmarken(striche) {
  return striche.filter(
    (s) => s.x1 < 60 && Math.abs(s.y2 - s.y1) < 1 && Math.abs(s.x2 - s.x1) > 2 && Math.abs(s.x2 - s.x1) < 30
  ).map((s) => s.y1).sort((a, b) => b - a);
}

// src/pdf/briefpapier.ts
var farbe = (f) => rgb(f.r, f.g, f.b);
var gedreht = (y, hoehe) => hoehe - y;
var geschuetzt = (text2) => text2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function alsSvg(papier, schriftfamilie = "Inter, Helvetica, sans-serif") {
  const { breite, hoehe } = papier.seite;
  const zeilen = [];
  zeilen.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${breite.toFixed(2)}" height="${hoehe.toFixed(2)}" viewBox="0 0 ${breite.toFixed(2)} ${hoehe.toFixed(2)}">`
  );
  zeilen.push(`  <rect width="${breite.toFixed(2)}" height="${hoehe.toFixed(2)}" fill="#FFFFFF"/>`);
  for (const p of papier.pfade) {
    const fuellung = p.fuellung ? `fill="${alsHex(p.fuellung)}"` : 'fill="none"';
    const strich = p.strich ? ` stroke="${alsHex(p.strich)}" stroke-width="${Math.max(0.1, p.staerke).toFixed(2)}"` : "";
    zeilen.push(`  <path d="${p.d}" ${fuellung}${strich}/>`);
  }
  for (const t of papier.texte) {
    const mass = t.breite > 0 ? ` textLength="${t.breite.toFixed(2)}" lengthAdjust="spacing"` : "";
    zeilen.push(
      `  <text x="${t.x.toFixed(2)}" y="${gedreht(t.y, hoehe).toFixed(2)}" font-family="${schriftfamilie}" font-size="${t.groesse.toFixed(2)}"${mass}>${geschuetzt(t.text)}</text>`
    );
  }
  zeilen.push("</svg>");
  return zeilen.join("\n");
}
function zeichneBriefpapier(seite, papier, schrift, versatz = { x: 0, y: 0 }) {
  const ursprung = { x: versatz.x, y: papier.seite.hoehe + versatz.y };
  for (const p of papier.pfade) {
    if (p.beschnitt) {
      seite.pushOperators(
        PDFOperator2.of(PDFOperatorNames2.PushGraphicsState),
        PDFOperator2.of(PDFOperatorNames2.AppendRectangle, [
          PDFNumber2.of(p.beschnitt.x + versatz.x),
          PDFNumber2.of(p.beschnitt.y + versatz.y),
          PDFNumber2.of(p.beschnitt.breite),
          PDFNumber2.of(p.beschnitt.hoehe)
        ]),
        PDFOperator2.of(PDFOperatorNames2.ClipNonZero),
        PDFOperator2.of(PDFOperatorNames2.EndPath)
      );
    }
    seite.drawSvgPath(p.d, {
      ...ursprung,
      color: p.fuellung ? farbe(p.fuellung) : void 0,
      borderColor: p.strich ? farbe(p.strich) : void 0,
      borderWidth: p.strich ? Math.max(0.1, p.staerke) : void 0
    });
    if (p.beschnitt) {
      seite.pushOperators(PDFOperator2.of(PDFOperatorNames2.PopGraphicsState));
    }
  }
  const fehlend = /* @__PURE__ */ new Set();
  const zeichenbar = (text2) => {
    let sauber = "";
    for (const zeichen of text2) {
      try {
        schrift.widthOfTextAtSize(zeichen, 10);
        sauber += zeichen;
      } catch {
        fehlend.add(zeichen);
      }
    }
    return sauber;
  };
  const schluessel2 = seite.node.newFontDictionaryKey(schrift.name);
  seite.node.setFontDictionary(schluessel2, schrift.ref);
  const befehle = [];
  let gezeichnet = 0;
  let gestreckt = 0;
  for (const t of papier.texte) {
    const text2 = zeichenbar(t.text);
    if (!text2.trim()) continue;
    const groesse = Math.max(1, t.groesse);
    const ist = schrift.widthOfTextAtSize(text2, groesse);
    let streckung = 100;
    if (t.breite > 0 && ist > 0) {
      const verhaeltnis = t.breite / ist * 100;
      if (verhaeltnis >= 50 && verhaeltnis <= 200) {
        streckung = verhaeltnis;
        gestreckt += 1;
      }
    }
    befehle.push(
      PDFOperator2.of(PDFOperatorNames2.PushGraphicsState),
      PDFOperator2.of(PDFOperatorNames2.BeginText),
      PDFOperator2.of(PDFOperatorNames2.SetFontAndSize, [schluessel2, PDFNumber2.of(groesse)]),
      PDFOperator2.of(PDFOperatorNames2.SetTextHorizontalScaling, [
        PDFNumber2.of(Number(streckung.toFixed(3)))
      ]),
      PDFOperator2.of(PDFOperatorNames2.SetTextMatrix, [
        PDFNumber2.of(1),
        PDFNumber2.of(0),
        PDFNumber2.of(0),
        PDFNumber2.of(1),
        PDFNumber2.of(Number((t.x + versatz.x).toFixed(3))),
        PDFNumber2.of(Number((t.y + versatz.y).toFixed(3)))
      ]),
      PDFOperator2.of(PDFOperatorNames2.ShowText, [schrift.encodeText(text2)]),
      PDFOperator2.of(PDFOperatorNames2.EndText),
      PDFOperator2.of(PDFOperatorNames2.PopGraphicsState)
    );
    gezeichnet += 1;
  }
  seite.pushOperators(...befehle);
  return {
    pfade: papier.pfade.length,
    texte: gezeichnet,
    eingepasst: gestreckt,
    fehlendeZeichen: [...fehlend]
  };
}

// src/absender/zahlungsklausel.ts
var WENDUNGEN = [
  { muster: /innerhalb\s+von\s+(\d{1,3})\s+(?:Kalender|Werk)?tagen/i, merkmal: "Frist in Tagen" },
  { muster: /binnen\s+(\d{1,3})\s+(?:Kalender|Werk)?tagen/i, merkmal: "Frist in Tagen" },
  { muster: /(\d{1,3})\s+Tage[n]?\s+(?:netto|rein\s+netto|ohne\s+Abzug)/i, merkmal: "Nettofrist" },
  { muster: /Zahlungsziel\s*:?\s*(\d{1,3})?/i, merkmal: "Zahlungsziel benannt" },
  { muster: /zahlbar\s+(?:sofort|netto|ohne\s+Abzug|innerhalb|bis)/i, merkmal: "Zahlbar-Klausel" },
  { muster: /(?:sofort|netto)\s+(?:rein\s+)?netto\s+ohne\s+Abzug/i, merkmal: "Nettoklausel" },
  { muster: /(\d{1,2})\s*%\s*Skonto/i, merkmal: "Skontoklausel" }
];
function findeZahlungsklausel(zeilen) {
  for (const zeile2 of zeilen) {
    for (const { muster, merkmal } of WENDUNGEN) {
      const treffer = muster.exec(zeile2);
      if (!treffer) continue;
      const zahl4 = treffer[1] ? Number(treffer[1]) : void 0;
      return {
        beleg: zeile2.trim(),
        ...zahl4 !== void 0 && Number.isFinite(zahl4) ? { tage: zahl4 } : {},
        merkmal
      };
    }
  }
  return void 0;
}
function zeilenImBogen(papier) {
  const nachHoehe = /* @__PURE__ */ new Map();
  for (const stueck of papier.texte) {
    const schluessel2 = Math.round(stueck.y);
    nachHoehe.set(schluessel2, [...nachHoehe.get(schluessel2) ?? [], stueck]);
  }
  return [...nachHoehe.entries()].sort((eins, zwei) => zwei[0] - eins[0]).map(([, stuecke]) => zeileAus(stuecke)).filter(Boolean);
}
function zeileAus(stuecke) {
  const sortiert = [...stuecke].sort((eins, zwei) => eins.x - zwei.x);
  let text2 = "";
  let ende;
  for (const stueck of sortiert) {
    if (!stueck.text.trim()) continue;
    if (text2 && ende !== void 0 && stueck.x - ende > Math.max(stueck.groesse, 1) * WORTLUECKE2) {
      text2 += " ";
    }
    text2 += stueck.text;
    ende = stueck.x + stueck.breite;
  }
  return text2.replace(/\s+/g, " ").trim();
}
var WORTLUECKE2 = 0.2;
function zahlungsklauselImBogen(papier) {
  return findeZahlungsklausel(zeilenImBogen(papier));
}
function bankverbindungImBogen(papier) {
  const text2 = zeilenImBogen(papier).join(" ");
  return /\bIBAN\b/i.test(text2) && /\b(?:BIC|SWIFT)\b/i.test(text2);
}

// src/pdf/gestaltung.ts
import { rgb as rgb3 } from "pdf-lib";

// src/pdf/layout.ts
import {
  rgb as rgb2
} from "pdf-lib";

// src/pdf/beschriftungen.ts
var STANDARD_BESCHRIFTUNGEN = {
  rechnungsnummer: "Rechnungsnummer",
  rechnungsdatum: "Rechnungsdatum",
  leistungsdatum: "Leistungsdatum",
  leistungszeitraum: "Leistungszeitraum",
  faelligAm: "F\xE4llig am",
  kundennummer: "Kundennummer",
  leitwegId: "Leitweg-ID",
  bestellnummer: "Bestellnummer",
  projekt: "Projekt",
  pos: "Pos.",
  bezeichnung: "Bezeichnung",
  menge: "Menge",
  einzelpreis: "Einzelpreis",
  umsatzsteuer: "USt.",
  betrag: "Betrag",
  zwischensummeNetto: "Zwischensumme netto",
  gesamtsummeNetto: "Gesamtsumme netto",
  zuschlag: "Zuschlag",
  abschlag: "Abschlag",
  rundung: "Rundung",
  bereitsGezahlt: "abzgl. bereits gezahlt",
  zahlbetrag: "Zahlbetrag",
  gesamtbetrag: "Rechnungsbetrag",
  steuerkuerzel: "USt.",
  zahlung: "Zahlung"
};
var MAX_LAENGE = 40;
function istBrauchbareBeschriftung(wert) {
  if (typeof wert !== "string") return false;
  const sauber = wert.trim();
  return sauber.length > 0 && sauber.length <= MAX_LAENGE && !/[\r\n\t]/.test(sauber);
}
function beschriftungenMit(eigene) {
  if (!eigene) return STANDARD_BESCHRIFTUNGEN;
  const ergebnis = { ...STANDARD_BESCHRIFTUNGEN };
  for (const schluessel2 of Object.keys(STANDARD_BESCHRIFTUNGEN)) {
    const wert = eigene[schluessel2];
    if (istBrauchbareBeschriftung(wert)) ergebnis[schluessel2] = wert.trim();
  }
  return ergebnis;
}
function nurAbweichungen(eigene) {
  const abweichend = {};
  for (const schluessel2 of Object.keys(STANDARD_BESCHRIFTUNGEN)) {
    const wert = eigene[schluessel2];
    if (istBrauchbareBeschriftung(wert) && wert.trim() !== STANDARD_BESCHRIFTUNGEN[schluessel2]) {
      abweichend[schluessel2] = wert.trim();
    }
  }
  return abweichend;
}

// src/pdf/layout.ts
var A4 = { width: 595.28, height: 841.89 };
var MM = 2.834645669;
var DEFAULT_THEME = {
  accent: rgb2(0.06, 0.32, 0.55),
  text: rgb2(0.11, 0.12, 0.14),
  muted: rgb2(0.42, 0.45, 0.5),
  hairline: rgb2(0.82, 0.84, 0.87),
  zebra: rgb2(0.965, 0.972, 0.98)
};
var satzLinks = (ctx) => ctx.satzspiegel?.links ?? PAGE.left;
var satzRechts = (ctx) => ctx.satzspiegel?.rechts ?? PAGE.right;
var inhaltLinks = (ctx) => ctx.inhaltLinks ?? satzLinks(ctx);
var grundgroesse = (ctx) => ctx.inhaltGroesse ?? 9;
var grundzeile = (ctx) => ctx.inhaltZeile ?? 11;
var grundabsatz = (ctx) => ctx.inhaltAbsatz ?? grundzeile(ctx);
var METAFELDER = [
  "rechnungsnummer",
  "rechnungsdatum",
  "leistungsdatum",
  "leistungszeitraum",
  "faelligAm",
  "kundennummer",
  "leitwegId",
  "bestellnummer",
  "projekt"
];
var KENNZAHLENZEILE = 12;
var ZEILE_OBEN = 8;
var ZEILE_UNTEN = 7;
var ZELLENLUFT = 6;
var SUMMENBREITE = 80 * MM;
var BETRAGSSPALTE = 38 * MM;
var SUMMENZEILE_SCHLICHT = 18;
var SUMMENZEILE_SCHLICHT_STARK = 22;
var MINDESTBREITE_NAME = 165;
var QUERSPALTEN = 4;
function anschriftenhoehe(wunsch) {
  const oben = A4.height - 45 * MM;
  const unten = A4.height - 90 * MM;
  if (wunsch === void 0) return oben;
  return Math.max(unten, Math.min(oben, wunsch));
}
var PAGE = {
  left: 20 * MM,
  right: A4.width - 20 * MM,
  top: A4.height - 15 * MM,
  bottom: 22 * MM
};
var PASSUNGSSPIEL = 0.05;
var POS_BREITE = 26;
var COLUMNS = [
  { key: "pos", beschriftung: "pos", width: POS_BREITE, align: "left" },
  { key: "name", beschriftung: "bezeichnung", width: 0, align: "left" },
  { key: "qty", beschriftung: "menge", width: 58, align: "right" },
  { key: "price", beschriftung: "einzelpreis", width: 72, align: "right" },
  { key: "vat", beschriftung: "umsatzsteuer", width: 38, align: "right" },
  { key: "total", beschriftung: "betrag", width: 76, align: "right" }
];
function drawInvoice(addPage, invoice, totals, context) {
  const pages = [];
  const cursor = { page: addPage(), y: PAGE.top, pageIndex: 0 };
  pages.push(cursor.page);
  const seitenanfang = context.folgeseiteOben ?? context.anschriftOben ?? PAGE.top;
  const nextPage = () => {
    cursor.page = addPage();
    cursor.pageIndex += 1;
    cursor.y = seitenanfang;
    pages.push(cursor.page);
    drawContinuationHeader(cursor, invoice, context);
  };
  const boden = context.inhaltUnten ?? PAGE.bottom + 40;
  const ensure = (needed) => {
    if (cursor.y - needed < boden) nextPage();
  };
  if (!context.eigenerBriefbogen) drawLetterhead(cursor, invoice, context);
  drawAddressAndMeta(cursor, invoice, context);
  drawTitle(cursor, invoice, context);
  if (context.textOben !== void 0 && context.textOben < cursor.y) {
    cursor.y = context.textOben;
  }
  drawIntro(cursor, invoice, context, ensure);
  drawLineTable(cursor, invoice, totals, context, ensure, nextPage);
  drawTotals(cursor, invoice, totals, context, ensure);
  drawVatBreakdown(cursor, invoice, totals, context, ensure);
  if (context.zahlungsblock !== false) drawPaymentBlock(cursor, invoice, totals, context, ensure);
  if (context.hinweise !== false) drawNotes(cursor, invoice, context, ensure);
  pages.forEach((page, index) => drawFooter(page, index, pages.length, invoice, context));
  return pages;
}
function drawLetterhead(cursor, invoice, ctx) {
  const { page } = cursor;
  const seller = invoice.seller;
  let kopfhoehe = 28;
  if (ctx.logo) {
    const maxWidth = 150;
    const maxHeight = 48;
    const scale = Math.min(maxWidth / ctx.logo.width, maxHeight / ctx.logo.height, 1);
    const width = ctx.logo.width * scale;
    const height = ctx.logo.height * scale;
    page.drawImage(ctx.logo, { x: satzRechts(ctx) - width, y: PAGE.top - height, width, height });
    kopfhoehe = height + 8;
  } else {
    drawRight(page, seller.tradingName ?? seller.name, satzRechts(ctx), PAGE.top - 12, {
      font: ctx.fonts.bold,
      size: 13,
      color: ctx.theme.accent
    });
  }
  const lines = [
    seller.address.line1,
    seller.address.line2,
    [seller.address.postcode, seller.address.city].filter(Boolean).join(" "),
    seller.contact?.phone ? `Tel. ${seller.contact.phone}` : void 0,
    seller.contact?.email
  ].filter((value) => Boolean(value));
  let y = PAGE.top - kopfhoehe;
  for (const line of lines) {
    drawRight(page, line, satzRechts(ctx), y, {
      font: ctx.fonts.regular,
      size: 8,
      color: ctx.theme.muted
    });
    y -= 10;
  }
  cursor.y = Math.min(cursor.y, y) - 6;
}
function drawAddressAndMeta(cursor, invoice, ctx) {
  const { page } = cursor;
  const addressTop = anschriftenhoehe(ctx.anschriftOben);
  if (!ctx.eigenerBriefbogen) {
    drawText(
      page,
      `${invoice.seller.name} - ${invoice.seller.address.line1} - ${invoice.seller.address.postcode ?? ""} ${invoice.seller.address.city}`,
      satzLinks(ctx),
      addressTop + 14,
      { font: ctx.fonts.regular, size: 6.5, color: ctx.theme.muted }
    );
    page.drawLine({
      start: { x: satzLinks(ctx), y: addressTop + 11 },
      end: { x: satzLinks(ctx) + 85 * MM, y: addressTop + 11 },
      thickness: 0.4,
      color: ctx.theme.hairline
    });
  }
  let y = addressTop;
  for (const line of addressLines(invoice.buyer)) {
    drawText(page, line, satzLinks(ctx), y, {
      font: ctx.fonts.regular,
      size: 10,
      color: ctx.theme.text
    });
    y -= ctx.inhaltZeile ?? 12.5;
  }
  const wort = beschriftungenMit(ctx.beschriftungen);
  const datum = (wert) => ctx.datumOhneNullen ? formatDate(wert).replace(/\b0(\d)\./g, "$1.") : formatDate(wert);
  const metaRows = [
    [wort.rechnungsnummer, invoice.number],
    [wort.rechnungsdatum, datum(invoice.issueDate)],
    [wort.leistungsdatum, invoice.deliveryDate ? datum(invoice.deliveryDate) : void 0],
    [
      wort.leistungszeitraum,
      invoice.periodStart && invoice.periodEnd ? `${datum(invoice.periodStart)} - ${datum(invoice.periodEnd)}` : void 0
    ],
    [wort.faelligAm, invoice.dueDate ? datum(invoice.dueDate) : void 0],
    [wort.kundennummer, invoice.buyer.identifier],
    [wort.leitwegId, invoice.buyerReference],
    [wort.bestellnummer, invoice.orderReference],
    [wort.projekt, invoice.projectReference]
  ];
  const erlaubt = ctx.kennzahlenfelder;
  const reihenfolge = erlaubt ?? METAFELDER;
  const gefuellt = reihenfolge.map((feld) => {
    const zeile2 = metaRows[METAFELDER.indexOf(feld)];
    return zeile2?.[1] ? { feld, label: zeile2[0], wert: zeile2[1] } : void 0;
  }).filter((eintrag) => Boolean(eintrag));
  const metaY = zeichneKennzahlen(page, gefuellt, ctx, addressTop, cursor.y);
  cursor.y = Math.min(y, metaY) - 22;
}
function zeichneKennzahlen(page, zeilen, ctx, addressTop, cursorY) {
  const istFett = (feld) => ctx.kennzahlenFett ? ctx.kennzahlenFett.includes(feld) : true;
  if (zeilen.length === 0) return cursorY;
  const stellung = ctx.kennzahlen ?? "neben-anschrift";
  if (stellung === "unter-anschrift") {
    let oben = ctx.kennzahlenOben ?? addressTop - 45 * MM;
    for (let anfang = 0; anfang < zeilen.length; anfang += QUERSPALTEN) {
      const reihe = zeilen.slice(anfang, anfang + QUERSPALTEN);
      const spalten = Math.min(QUERSPALTEN, zeilen.length);
      const gleichmass = (satzRechts(ctx) - inhaltLinks(ctx)) / spalten;
      const kanten = reihe.map(({ feld }) => ctx.kennzahlenSpalten?.[feld]);
      const ausVorlage = kanten.every((kante2) => kante2 !== void 0) ? kanten : void 0;
      const kante = (nummer) => ausVorlage ? ausVorlage[nummer] : inhaltLinks(ctx) + nummer * gleichmass;
      const platzFuer = (nummer) => {
        const x = kante(nummer);
        const bis = ausVorlage ? ausVorlage[nummer + 1] ?? satzRechts(ctx) : x + gleichmass;
        return bis - x - (nummer === reihe.length - 1 ? 0 : 6);
      };
      const reihengroesse = reihe.reduce((klein, { feld, label, wert }, nummer) => {
        const schrift = istFett(feld) ? ctx.fonts.bold : ctx.fonts.regular;
        return Math.min(
          klein,
          passeGroesseEin(`${label} ${wert}`, schrift, klein, platzFuer(nummer))
        );
      }, ctx.inhaltGroesse ?? 8.5);
      for (const [nummer, { feld, label, wert }] of reihe.entries()) {
        const x = kante(nummer);
        const breite = platzFuer(nummer);
        const fett = istFett(feld);
        if (ctx.kennzahlenInline) {
          const font = fett ? ctx.fonts.bold : ctx.fonts.regular;
          const inhalt = `${label} ${wert}`;
          drawText(page, kuerzeAufBreite(inhalt, font, reihengroesse, breite), x, oben, {
            font,
            size: reihengroesse,
            /*
             * Schwarz auch ohne Auszeichnung, wenn die Vorlage schlicht ist -
             * aus demselben Grund wie im Summenblock: Sie setzt "Rechnungs-
             * datum: 12.8.2026" mager, aber in reinem Schwarz. Grau daneben
             * las sich, als sei das Datum eine Nebenangabe.
             */
            color: fett || ctx.schlichteTabelle ? ctx.theme.text : ctx.theme.muted
          });
          continue;
        }
        drawText(page, kuerzeAufBreite(label, ctx.fonts.regular, 8, breite), x, oben, {
          font: ctx.fonts.regular,
          size: 8,
          color: ctx.theme.muted
        });
        drawText(
          page,
          kuerzeAufBreite(wert, fett ? ctx.fonts.bold : ctx.fonts.regular, 8.5, breite),
          x,
          oben - 11,
          {
            font: fett ? ctx.fonts.bold : ctx.fonts.regular,
            size: 8.5,
            color: ctx.theme.text
          }
        );
      }
      oben -= 26;
    }
    return oben + 26 - 11;
  }
  const metaX = inhaltLinks(ctx) + 105 * MM;
  let metaY = stellung === "ueber-anschrift" ? Math.min(addressTop + 20 * MM, cursorY) : Math.min(addressTop + 6, cursorY);
  for (const { feld, label, wert } of zeilen) {
    drawText(page, label, metaX, metaY, {
      font: ctx.fonts.regular,
      size: 8,
      color: ctx.theme.muted
    });
    drawRight(page, wert, satzRechts(ctx), metaY, {
      font: istFett(feld) ? ctx.fonts.bold : ctx.fonts.regular,
      size: 8.5,
      color: ctx.theme.text
    });
    metaY -= KENNZAHLENZEILE;
  }
  return metaY;
}
function drawTitle(cursor, invoice, ctx) {
  const label = documentLabel(invoice.typeCode);
  if (ctx.ohneTitel === true && invoice.typeCode === "380") {
    if (ctx.inhaltZeile === void 0) cursor.y -= 6;
    return;
  }
  drawText(cursor.page, `${label} ${invoice.number}`, inhaltLinks(ctx), cursor.y, {
    font: ctx.fonts.bold,
    size: 16,
    color: ctx.theme.accent
  });
  cursor.y -= 12;
  if (invoice.precedingInvoice) {
    drawText(
      cursor.page,
      `Bezug: Rechnung ${invoice.precedingInvoice.number}` + (invoice.precedingInvoice.issueDate ? ` vom ${formatDate(invoice.precedingInvoice.issueDate)}` : ""),
      inhaltLinks(ctx),
      cursor.y,
      { font: ctx.fonts.regular, size: 8.5, color: ctx.theme.muted }
    );
    cursor.y -= 12;
  }
  cursor.y -= 10;
}
function drawIntro(cursor, invoice, ctx, ensure) {
  if (!invoice.intro) return;
  const breite = satzRechts(ctx) - inhaltLinks(ctx);
  const groesse = grundgroesse(ctx);
  const hoehe = grundzeile(ctx);
  const zeilen = wrapText(invoice.intro, ctx.fonts.regular, groesse, breite);
  ensure(zeilen.length * hoehe + grundabsatz(ctx));
  for (const zeile2 of zeilen) {
    if (zeile2.length > 0) {
      drawText(cursor.page, zeile2, inhaltLinks(ctx), cursor.y, {
        font: ctx.fonts.regular,
        size: groesse,
        color: ctx.theme.text
      });
    }
    cursor.y -= hoehe;
  }
  cursor.y -= grundabsatz(ctx);
}
function columnLayout(wort, ctx) {
  const einzug = ctx.positionsEinzug !== void 0 ? Math.max(0, ctx.positionsEinzug - ZELLENLUFT) : ctx.positionsnummern === false ? 0 : POS_BREITE;
  const stumm = /* @__PURE__ */ new Set();
  if (ctx.mengenspalten === false) stumm.add("qty").add("price");
  if (ctx.steuerspalte === false) stumm.add("vat");
  const spalten = COLUMNS.flatMap((column) => {
    if (stumm.has(column.key)) return [];
    if (column.key !== "pos") return [column];
    return einzug > 0 ? [{ ...column, width: einzug }] : [];
  });
  const fixed = spalten.reduce((acc, column) => acc + column.width, 0);
  const vorhanden = satzRechts(ctx) - inhaltLinks(ctx);
  const fehlt = MINDESTBREITE_NAME - (vorhanden - fixed);
  const faktor = fehlt > 0 ? Math.max(0.75, (fixed - fehlt) / fixed) : 1;
  const flexible = vorhanden - fixed * faktor;
  let x = inhaltLinks(ctx);
  return spalten.map((column) => {
    const width = column.width === 0 ? flexible : column.width * faktor;
    const entry = {
      key: column.key,
      label: wort[column.beschriftung],
      x,
      width,
      align: column.align
    };
    x += width;
    return entry;
  });
}
function drawTableHead(cursor, ctx) {
  if (ctx.tabellenkopf === false) {
    if (ctx.inhaltZeile === void 0) cursor.y -= 6;
    return;
  }
  const columns = columnLayout(beschriftungenMit(ctx.beschriftungen), ctx);
  const { page } = cursor;
  const schlicht = ctx.schlichteTabelle === true;
  if (schlicht) {
    page.drawLine({
      start: { x: inhaltLinks(ctx), y: cursor.y - 4 },
      end: { x: satzRechts(ctx), y: cursor.y - 4 },
      thickness: 0.6,
      color: ctx.theme.text
    });
  } else {
    page.drawRectangle({
      x: inhaltLinks(ctx),
      y: cursor.y - 4,
      width: satzRechts(ctx) - inhaltLinks(ctx),
      height: 18,
      color: ctx.theme.accent
    });
  }
  for (const column of columns) {
    if (column.key === "pos" && ctx.positionsnummern === false) continue;
    const options = {
      font: ctx.fonts.bold,
      size: 8,
      color: schlicht ? ctx.theme.text : rgb2(1, 1, 1)
    };
    if (column.align === "right") {
      drawRight(page, column.label, column.x + column.width - ZELLENLUFT, cursor.y + 1, options);
    } else {
      drawText(page, column.label, column.x + ZELLENLUFT, cursor.y + 1, options);
    }
  }
  cursor.y -= 20;
}
function drawLineTable(cursor, invoice, totals, ctx, ensure, _nextPage) {
  const columns = columnLayout(beschriftungenMit(ctx.beschriftungen), ctx);
  const nameColumn = columns.find((c) => c.key === "name");
  drawTableHead(cursor, ctx);
  const auszeichnung = ctx.positionsauszeichnung !== false;
  const nameSchrift = auszeichnung ? ctx.fonts.bold : ctx.fonts.regular;
  const nameGroesse = grundgroesse(ctx);
  const nameHoehe = grundzeile(ctx);
  const zusatzGroesse = auszeichnung ? nameGroesse - 1 : nameGroesse;
  const zusatzHoehe = auszeichnung ? nameHoehe - 1.5 : nameHoehe;
  const zusatzFarbe = auszeichnung ? ctx.theme.muted : ctx.theme.text;
  invoice.lines.forEach((line, index) => {
    const nameWidth = (nameColumn?.width ?? 200) - 8;
    const nameLines = wrapText(line.name, nameSchrift, nameGroesse, nameWidth);
    const descriptionLines = line.description ? wrapText(line.description, ctx.fonts.regular, zusatzGroesse, nameWidth) : [];
    const periodText = line.periodStart && line.periodEnd ? `Zeitraum ${formatDate(line.periodStart)} - ${formatDate(line.periodEnd)}` : void 0;
    const extraLines = [
      ...descriptionLines,
      ...periodText ? [periodText] : [],
      ...line.attributes.map((a) => `${a.name}: ${a.value}`)
    ];
    const trennluft = auszeichnung || extraLines.length === 0 ? 0 : grundabsatz(ctx);
    const inhaltHoehe = nameLines.length * nameHoehe + trennluft + extraLines.length * zusatzHoehe;
    const rowHeight = ctx.inhaltAbsatz !== void 0 && ctx.schlichteTabelle === true ? inhaltHoehe + grundabsatz(ctx) - grundzeile(ctx) : ZEILE_OBEN + inhaltHoehe + ZEILE_UNTEN;
    ensure(rowHeight + 4);
    if (cursor.y === PAGE.top) drawTableHead(cursor, ctx);
    if (index % 2 === 1 && ctx.schlichteTabelle !== true) {
      cursor.page.drawRectangle({
        x: inhaltLinks(ctx),
        y: cursor.y - rowHeight + 10,
        width: satzRechts(ctx) - inhaltLinks(ctx),
        height: rowHeight,
        color: ctx.theme.zebra
      });
    }
    const baseY = cursor.y;
    const untenSetzen = ctx.betragUnten === true && ctx.mengenspalten === false;
    const zahlenY = untenSetzen ? baseY - (nameLines.length - 1) * nameHoehe - trennluft - extraLines.length * zusatzHoehe : baseY;
    const cell = (key, text2, bold = false, size = nameGroesse) => {
      const column = columns.find((c) => c.key === key);
      if (!column) return;
      const options = {
        font: bold ? ctx.fonts.bold : ctx.fonts.regular,
        size,
        color: ctx.theme.text
      };
      if (column.align === "right") {
        const kante = column.key === "total" && ctx.schlichteTabelle === true ? satzRechts(ctx) : column.x + column.width - ZELLENLUFT;
        drawRight(cursor.page, text2, kante, zahlenY, options);
      } else {
        drawText(cursor.page, text2, column.x + ZELLENLUFT, zahlenY, options);
      }
    };
    if (ctx.positionsnummern !== false) cell("pos", line.id);
    cell("qty", `${formatQuantity(line.quantity)} ${unitLabel(line.unitCode)}`);
    cell("price", formatAmount(line.unitPrice, void 0, line.unitPrice % 1 === 0 ? 2 : 2));
    cell(
      "vat",
      line.vat.category === "S" ? `${formatQuantity(line.vat.rate)} %` : line.vat.category
    );
    cell(
      "total",
      formatAmount(totals.lineAmounts[index] ?? 0, ctx.waehrungswort),
      auszeichnung
    );
    let textY = baseY;
    for (const text2 of nameLines) {
      drawText(cursor.page, text2, (nameColumn?.x ?? inhaltLinks(ctx)) + ZELLENLUFT, textY, {
        font: nameSchrift,
        size: nameGroesse,
        color: ctx.theme.text
      });
      textY -= nameHoehe;
    }
    textY -= trennluft;
    for (const text2 of extraLines) {
      drawText(cursor.page, text2, (nameColumn?.x ?? inhaltLinks(ctx)) + ZELLENLUFT, textY, {
        font: ctx.fonts.regular,
        size: zusatzGroesse,
        color: zusatzFarbe
      });
      textY -= zusatzHoehe;
    }
    cursor.y -= rowHeight;
    if (ctx.schlichteTabelle !== true) {
      cursor.page.drawLine({
        start: { x: inhaltLinks(ctx), y: cursor.y + 7 },
        end: { x: satzRechts(ctx), y: cursor.y + 7 },
        thickness: 0.4,
        color: ctx.theme.hairline
      });
    }
  });
  cursor.y -= ctx.inhaltAbsatz !== void 0 && ctx.schlichteTabelle === true ? grundabsatz(ctx) : 10;
}
function drawTotals(cursor, invoice, totals, ctx, ensure) {
  const wort = beschriftungenMit(ctx.beschriftungen);
  const waehrung = ctx.waehrungswort ?? invoice.currency;
  const rows = [];
  rows.push([wort.zwischensummeNetto, formatAmount(totals.lineTotal, waehrung), false]);
  for (const ac of invoice.allowancesCharges) {
    rows.push([
      `${ac.isCharge ? wort.zuschlag : wort.abschlag}${ac.reason ? ` (${ac.reason})` : ""}`,
      formatAmount(ac.isCharge ? ac.amount : -ac.amount, waehrung),
      false
    ]);
  }
  if (totals.allowanceTotal !== 0 || totals.chargeTotal !== 0) {
    rows.push([wort.gesamtsummeNetto, formatAmount(totals.taxBasisTotal, waehrung), false]);
  }
  for (const tax of totals.vatBreakdown) {
    const label = tax.category === "S" ? `zzgl. ${formatQuantity(tax.rate)} % ${wort.steuerkuerzel}` + (ctx.steuergrundlage === false ? "" : ` auf ${formatAmount(tax.taxableAmount)}`) : `${vatCategoryLabel(tax.category)} auf ${formatAmount(tax.taxableAmount)}`;
    rows.push([label, formatAmount(tax.taxAmount, waehrung), false]);
  }
  if (totals.roundingAmount !== 0) {
    rows.push([wort.rundung, formatAmount(totals.roundingAmount, waehrung), false]);
  }
  const endsumme = invoice.typeCode === "380" && wort.gesamtbetrag !== STANDARD_BESCHRIFTUNGEN.gesamtbetrag ? wort.gesamtbetrag : `${documentLabel(invoice.typeCode)}sbetrag`;
  rows.push([endsumme, formatAmount(totals.grandTotal, waehrung), true]);
  if (totals.paidAmount !== 0) {
    rows.push([wort.bereitsGezahlt, formatAmount(-totals.paidAmount, waehrung), false]);
    rows.push([wort.zahlbetrag, formatAmount(totals.duePayable, waehrung), true]);
  }
  const zeilenhoehe = (emphasised) => ctx.schlichteTabelle ? ctx.inhaltAbsatz ?? (emphasised ? SUMMENZEILE_SCHLICHT_STARK : SUMMENZEILE_SCHLICHT) : emphasised ? 16 : 13;
  const boxLeft = ctx.schlichteTabelle ? inhaltLinks(ctx) : Math.max(inhaltLinks(ctx), satzRechts(ctx) - SUMMENBREITE);
  const schlicht = ctx.schlichteTabelle === true;
  const betragslinks = satzRechts(ctx) - BETRAGSSPALTE;
  const gesetzt = rows.map(([label, value, emphasised]) => {
    const font = emphasised ? ctx.fonts.bold : ctx.fonts.regular;
    const labelfont = emphasised ? ctx.fonts.bold : (ctx.summenlabelKraeftig ? ctx.fonts.kraeftig : void 0) ?? ctx.fonts.regular;
    const size = ctx.inhaltGroesse ?? (emphasised ? 10 : 8.5);
    const rechteKante = schlicht ? ctx.summenlabelRechts ?? betragslinks - 10 : satzRechts(ctx);
    const platz = schlicht ? rechteKante - boxLeft : satzRechts(ctx) - gekernteBreite(font, value, size) - 8 - boxLeft;
    const zeilen = wrapText(label, labelfont, size, Math.max(40, platz));
    return {
      value,
      emphasised,
      font,
      labelfont,
      size,
      rechteKante,
      zeilen,
      hoehe: zeilenhoehe(emphasised) + (zeilen.length - 1) * (size + 2)
    };
  });
  ensure(gesetzt.reduce((summe, zeile2) => summe + zeile2.hoehe, 0) + 24);
  const fein = ctx.striche?.fein ?? 0.4;
  const stark = ctx.striche?.stark ?? 0.8;
  if (schlicht) {
    const strichhoehe = ctx.striche?.abstand ?? 13;
    cursor.page.drawLine({
      start: { x: boxLeft, y: cursor.y + strichhoehe },
      end: { x: satzRechts(ctx), y: cursor.y + strichhoehe },
      thickness: fein,
      color: ctx.theme.hairline
    });
  }
  for (const { value, emphasised, font, labelfont, size, rechteKante, zeilen, hoehe } of gesetzt) {
    if (emphasised && !schlicht) {
      cursor.page.drawLine({
        start: { x: boxLeft, y: cursor.y + 11 },
        end: { x: satzRechts(ctx), y: cursor.y + 11 },
        thickness: 0.8,
        color: ctx.theme.accent
      });
    }
    const farbe2 = emphasised || schlicht ? ctx.theme.text : ctx.theme.muted;
    for (const [nummer, teil] of zeilen.entries()) {
      const y = cursor.y - nummer * (size + 2);
      if (schlicht) {
        drawRight(cursor.page, teil, rechteKante, y, { font: labelfont, size, color: farbe2 });
      } else {
        drawText(cursor.page, teil, boxLeft, y, { font: labelfont, size, color: farbe2 });
      }
    }
    drawRight(cursor.page, value, satzRechts(ctx), cursor.y, { font, size, color: ctx.theme.text });
    if (schlicht) {
      const staerke = emphasised ? stark : fein;
      const strichY = cursor.y - hoehe + 12 + staerke / 2;
      cursor.page.drawLine({
        start: { x: betragslinks, y: strichY },
        end: { x: satzRechts(ctx), y: strichY },
        thickness: staerke,
        color: emphasised ? ctx.theme.text : ctx.theme.hairline
      });
    }
    cursor.y -= hoehe;
  }
  cursor.y -= 8;
}
function drawVatBreakdown(cursor, invoice, totals, ctx, ensure) {
  const reasons = totals.vatBreakdown.filter((tax) => tax.exemptionReason);
  if (reasons.length === 0) return;
  ensure(reasons.length * 12 + 16);
  for (const tax of reasons) {
    drawText(
      cursor.page,
      `${vatCategoryLabel(tax.category)}: ${tax.exemptionReason}`,
      inhaltLinks(ctx),
      cursor.y,
      {
        font: ctx.fonts.regular,
        size: 8,
        color: ctx.theme.muted
      }
    );
    cursor.y -= 11;
  }
  cursor.y -= 8;
  void invoice;
}
function drawPaymentBlock(cursor, invoice, totals, ctx, ensure) {
  const payment = invoice.payment;
  const lines = [];
  if (!ctx.zahlungszielImBriefpapier) {
    if (payment?.terms) lines.push(payment.terms);
    else if (invoice.dueDate) {
      lines.push(
        `Zahlbar ohne Abzug bis zum ${formatDate(invoice.dueDate)} auf das unten genannte Konto.`
      );
    }
  }
  if (payment?.iban) {
    lines.push(
      [
        payment.accountName ? `Kontoinhaber: ${payment.accountName}` : void 0,
        `IBAN: ${formatIban(payment.iban)}`,
        payment.bic ? `BIC: ${payment.bic}` : void 0
      ].filter(Boolean).join("   ")
    );
  }
  if (payment?.remittanceInformation) {
    lines.push(`Verwendungszweck: ${payment.remittanceInformation}`);
  } else if (payment?.iban) {
    lines.push(`Verwendungszweck: ${invoice.number}`);
  }
  if (payment?.meansCode === "59") {
    lines.push(
      `Der Betrag von ${formatAmount(totals.duePayable, ctx.waehrungswort ?? invoice.currency)} wird per SEPA-Lastschrift eingezogen.` + (payment.mandateReference ? ` Mandatsreferenz: ${payment.mandateReference}` : "")
    );
  }
  if (lines.length === 0) return;
  ensure(lines.length * 12 + 30);
  drawText(cursor.page, beschriftungenMit(ctx.beschriftungen).zahlung, inhaltLinks(ctx), cursor.y, {
    font: ctx.fonts.bold,
    size: 9,
    color: ctx.theme.text
  });
  cursor.y -= 13;
  for (const line of lines) {
    for (const wrapped of wrapText(
      line,
      ctx.fonts.regular,
      8.5,
      satzRechts(ctx) - inhaltLinks(ctx)
    )) {
      drawText(cursor.page, wrapped, inhaltLinks(ctx), cursor.y, {
        font: ctx.fonts.regular,
        size: 8.5,
        color: ctx.theme.text
      });
      cursor.y -= 11;
    }
  }
  cursor.y -= 8;
}
function drawNotes(cursor, invoice, ctx, ensure) {
  if (invoice.notes.length === 0) return;
  ensure(invoice.notes.length * 14 + 10);
  for (const note of invoice.notes) {
    for (const wrapped of wrapText(
      note.text,
      ctx.fonts.regular,
      8.5,
      satzRechts(ctx) - inhaltLinks(ctx)
    )) {
      drawText(cursor.page, wrapped, inhaltLinks(ctx), cursor.y, {
        font: ctx.fonts.regular,
        size: 8.5,
        color: ctx.theme.muted
      });
      cursor.y -= 11;
    }
    cursor.y -= 4;
  }
}
function drawContinuationHeader(cursor, invoice, ctx) {
  const oben = cursor.y;
  drawText(
    cursor.page,
    `${documentLabel(invoice.typeCode)} ${invoice.number} - Fortsetzung`,
    inhaltLinks(ctx),
    oben - 6,
    {
      font: ctx.fonts.bold,
      size: grundgroesse(ctx),
      // Schwarz, wo die Vorlage nicht ueber Grauwerte staffelt.
      color: ctx.schlichteTabelle ? ctx.theme.text : ctx.theme.muted
    }
  );
  cursor.y = oben - 6 - (ctx.inhaltAbsatz !== void 0 ? grundabsatz(ctx) : 24);
}
function drawFooter(page, index, total, invoice, ctx) {
  const seller = invoice.seller;
  const y = PAGE.bottom;
  if (ctx.eigeneFusszeile === false) {
    if (total > 1) {
      drawRight(page, `Seite ${index + 1} von ${total}`, satzRechts(ctx), y + 16, {
        font: ctx.fonts.regular,
        size: 7,
        color: ctx.theme.muted
      });
    }
    return;
  }
  page.drawLine({
    start: { x: satzLinks(ctx), y: y + 26 },
    end: { x: satzRechts(ctx), y: y + 26 },
    thickness: 0.4,
    color: ctx.theme.hairline
  });
  const identity = [
    seller.name,
    seller.legalRegistrationId ? `Register: ${seller.legalRegistrationId}` : void 0,
    seller.vatId ? `USt-IdNr.: ${seller.vatId}` : void 0,
    seller.taxNumber ? `Steuernummer: ${seller.taxNumber}` : void 0
  ].filter(Boolean).join("  |  ");
  const options = { font: ctx.fonts.regular, size: 7, color: ctx.theme.muted };
  drawText(page, identity, satzLinks(ctx), y + 16, options);
  if (ctx.footerNote) drawText(page, ctx.footerNote, satzLinks(ctx), y + 7, options);
  drawRight(page, `Seite ${index + 1} von ${total}`, satzRechts(ctx), y + 16, options);
  drawRight(
    page,
    "Diese Rechnung enth\xE4lt strukturierte Daten nach ZUGFeRD 2.3.",
    satzRechts(ctx),
    y + 7,
    {
      ...options,
      size: 6.5
    }
  );
}
function drawText(page, text2, x, y, options) {
  if (zeichneGekernt(page, text2, x, y, options.font, options.size, options.color)) return;
  page.drawText(text2, { x, y, font: options.font, size: options.size, color: options.color });
}
function drawRight(page, text2, right, y, options) {
  const width = gekernteBreite(options.font, text2, options.size);
  drawText(page, text2, right - width, y, options);
}
function kennzahlenrahmen(stellung, zeilen, obergrenze = PAGE.top, anschriftOben, satzspiegel) {
  const ctx = { satzspiegel };
  const addressTop = anschriftenhoehe(anschriftOben);
  if (stellung === "unter-anschrift") {
    const oben = addressTop - 45 * MM;
    const reihen = Math.ceil(Math.max(1, zeilen) / QUERSPALTEN);
    return {
      x1: satzLinks(ctx),
      y1: oben - (reihen - 1) * 26 - KENNZAHLENZEILE,
      x2: satzRechts(ctx),
      y2: oben + 9
    };
  }
  const start = stellung === "ueber-anschrift" ? Math.min(addressTop + 20 * MM, obergrenze) : Math.min(addressTop + 6, obergrenze);
  return {
    x1: satzLinks(ctx) + 105 * MM,
    y1: start - zeilen * KENNZAHLENZEILE,
    x2: satzRechts(ctx),
    y2: start + 9
  };
}
function kuerzeAufBreite(text2, font, size, maxWidth) {
  if (maxWidth <= 0 || gekernteBreite(font, text2, size) <= maxWidth + PASSUNGSSPIEL) return text2;
  let gekuerzt = text2;
  while (gekuerzt.length > 1 && gekernteBreite(font, `${gekuerzt}\u2026`, size) > maxWidth) {
    gekuerzt = gekuerzt.slice(0, -1);
  }
  return `${gekuerzt.trimEnd()}\u2026`;
}
function passeGroesseEin(text2, font, wunsch, maxWidth, mindest = wunsch * 0.85) {
  if (maxWidth <= 0) return wunsch;
  const spiel = PASSUNGSSPIEL;
  let groesse = wunsch;
  while (groesse > mindest && gekernteBreite(font, text2, groesse) > maxWidth + spiel) {
    groesse -= 0.1;
  }
  return Math.round(groesse * 10) / 10;
}
function wrapText(text2, font, size, maxWidth) {
  if (/[\r\n]/.test(text2)) {
    return text2.split(/\r?\n/).flatMap(
      (absatz) => absatz.trim().length === 0 ? [""] : wrapText(absatz, font, size, maxWidth)
    );
  }
  const words = text2.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (gekernteBreite(font, candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (gekernteBreite(font, word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const char of word) {
      if (gekernteBreite(font, chunk + char, size) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else chunk += char;
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}
function addressLines(party) {
  return [
    party.name,
    party.tradingName && party.tradingName !== party.name ? party.tradingName : void 0,
    party.contact?.name,
    party.address.line1,
    party.address.line2,
    [party.address.postcode, party.address.city].filter(Boolean).join(" "),
    party.address.countryCode !== "DE" ? party.address.countryCode : void 0
  ].filter((value) => Boolean(value));
}
function formatIban(iban) {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}
function documentLabel(typeCode) {
  switch (typeCode) {
    case "381":
      return "Gutschrift";
    case "384":
      return "Rechnungskorrektur";
    case "386":
      return "Abschlagsrechnung";
    case "389":
      return "Gutschrift (Selbstfakturierung)";
    default:
      return "Rechnung";
  }
}
function vatCategoryLabel(category) {
  switch (category) {
    case "AE":
      return "Steuerschuldnerschaft des Leistungsempfaengers";
    case "K":
      return "Innergemeinschaftliche Lieferung";
    case "G":
      return "Ausfuhrlieferung";
    case "E":
      return "Steuerbefreit";
    case "O":
      return "Nicht steuerbar";
    case "Z":
      return "Nullsatz";
    default:
      return "Umsatzsteuer";
  }
}
function unitLabel(unitCode) {
  switch (unitCode) {
    case "C62":
      return "Stk.";
    case "HUR":
      return "Std.";
    case "DAY":
      return "Tage";
    case "MON":
      return "Mon.";
    case "KGM":
      return "kg";
    case "MTR":
      return "m";
    case "MTK":
      return "qm";
    case "LTR":
      return "l";
    case "KMT":
      return "km";
    case "LS":
      return "pausch.";
    default:
      return unitCode;
  }
}

// src/pdf/gestaltung.ts
function farbeAusHex(hex) {
  const sauber = hex.trim().replace(/^#/, "");
  const voll = sauber.length === 3 ? sauber.split("").map((z) => z + z).join("") : sauber;
  if (!/^[0-9a-fA-F]{6}$/.test(voll)) return void 0;
  const wert = parseInt(voll, 16);
  return rgb3((wert >> 16 & 255) / 255, (wert >> 8 & 255) / 255, (wert & 255) / 255);
}
function themaMitAkzent(hex) {
  if (!hex) return DEFAULT_THEME;
  const akzent = farbeAusHex(hex);
  return akzent ? { ...DEFAULT_THEME, accent: akzent } : DEFAULT_THEME;
}
function istPng(bytes) {
  const kennung = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < kennung.length) return false;
  return kennung.every((byte, i) => bytes[i] === byte);
}
function pngFarbtyp(bytes) {
  const stelle = 8 + 4 + 4 + 4 + 4 + 1;
  if (bytes.length <= stelle) return void 0;
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return void 0;
  return bytes[stelle];
}

// src/pdf/vorlagenschrift.ts
import {
  PDFDict as PDFDict3,
  PDFDocument as PDFDocument3,
  PDFHexString,
  PDFName as PDFName3,
  PDFNumber as PDFNumber3,
  PDFObjectCopier,
  PDFOperator as PDFOperator4,
  PDFOperatorNames as PDFOperatorNames4,
  PDFRef
} from "pdf-lib";
var zahl2 = (wert) => PDFNumber3.of(Number(wert.toFixed(4)));
var alsHexString = (bytes) => PDFHexString.of(bytes.map((b) => (b & 255).toString(16).padStart(2, "0")).join(""));
async function bereiteVorlagenschrift(zielDoc, papier, quelle, quellseite = 0) {
  const quellDoc = await PDFDocument3.load(quelle, { throwOnInvalidObject: false });
  const quellRessourcen = quellDoc.getPage(quellseite).node.Resources();
  const quellSchriften = quellRessourcen?.lookupMaybe(PDFName3.of("Font"), PDFDict3);
  const kopierer = PDFObjectCopier.for(quellDoc.context, zielDoc.context);
  const verweise = /* @__PURE__ */ new Map();
  const namen = [];
  for (const name of new Set(papier.laeufe.map((lauf) => lauf.schrift))) {
    const verweis = quellSchriften?.get(PDFName3.of(name));
    if (!verweis) continue;
    const kopie = kopierer.copy(verweis);
    verweise.set(name, kopie instanceof PDFRef ? kopie : zielDoc.context.register(kopie));
    namen.push(name);
  }
  return {
    schriften: namen,
    setze: (seite, bogen, versatz = { x: 0, y: 0 }) => setzeAufSeite(seite, bogen, verweise, versatz)
  };
}
function setzeAufSeite(seite, papier, verweise, versatz) {
  const schluessel2 = /* @__PURE__ */ new Map();
  for (const [name, ref] of verweise) {
    const zielname = seite.node.newFontDictionaryKey("BP");
    seite.node.setFontDictionary(zielname, ref);
    schluessel2.set(name, zielname);
  }
  const befehle = [];
  let gesetzt = 0;
  let uebersprungen = 0;
  let letzteFarbe;
  for (const lauf of papier.laeufe) {
    const schrift = schluessel2.get(lauf.schrift);
    if (!schrift) {
      uebersprungen += 1;
      continue;
    }
    befehle.push(PDFOperator4.of(PDFOperatorNames4.PushGraphicsState));
    if (!letzteFarbe || letzteFarbe.r !== lauf.farbe.r || letzteFarbe.g !== lauf.farbe.g || letzteFarbe.b !== lauf.farbe.b) {
      befehle.push(
        PDFOperator4.of(PDFOperatorNames4.NonStrokingColorRgb, [
          zahl2(lauf.farbe.r),
          zahl2(lauf.farbe.g),
          zahl2(lauf.farbe.b)
        ])
      );
      letzteFarbe = lauf.farbe;
    }
    const matrix = [...lauf.matrix];
    matrix[4] = (matrix[4] ?? 0) + versatz.x;
    matrix[5] = (matrix[5] ?? 0) + versatz.y;
    befehle.push(
      PDFOperator4.of(PDFOperatorNames4.BeginText),
      PDFOperator4.of(PDFOperatorNames4.SetFontAndSize, [schrift, zahl2(lauf.groesse)]),
      /*
       * Zeichen- und Wortabstand muessen mit, sonst geht der Blocksatz
       * verloren: Die Vorlage gleicht ihre Fusszeile ueber `Tw` aus, und ohne
       * ihn endet die Zeile zu frueh - der Trennstrich am rechten Rand steht
       * dann frei.
       */
      PDFOperator4.of(PDFOperatorNames4.SetCharacterSpacing, [zahl2(lauf.zeichenabstand)]),
      PDFOperator4.of(PDFOperatorNames4.SetWordSpacing, [zahl2(lauf.wortabstand)]),
      PDFOperator4.of(PDFOperatorNames4.SetTextHorizontalScaling, [zahl2(lauf.streckung * 100)]),
      PDFOperator4.of(PDFOperatorNames4.SetTextMatrix, matrix.map(zahl2)),
      PDFOperator4.of(PDFOperatorNames4.ShowTextAdjusted, [
        seite.doc.context.obj(
          lauf.stuecke.map(
            (teil) => Array.isArray(teil) ? alsHexString(teil) : zahl2(teil)
          )
        )
      ]),
      PDFOperator4.of(PDFOperatorNames4.EndText),
      PDFOperator4.of(PDFOperatorNames4.PopGraphicsState)
    );
    gesetzt += 1;
  }
  seite.pushOperators(...befehle);
  return { laeufe: gesetzt, schriften: [...verweise.keys()], uebersprungen };
}
async function setzeMitVorlagenschrift(zielSeite, papier, quelle, quellseite = 0) {
  const setzer = await bereiteVorlagenschrift(zielSeite.doc, papier, quelle, quellseite);
  return setzer.setze(zielSeite, papier);
}
function schriftenImBriefkopf(laeufe) {
  return [...new Set(laeufe.map((lauf) => lauf.schrift))].sort();
}

// src/pdf/xmp.ts
var BOM = String.fromCharCode(65279);
var FX_PROPERTIES = [
  ["DocumentFileName", "name of the embedded XML invoice file"],
  ["DocumentType", "INVOICE"],
  ["Version", "The actual version of the standard applying to the embedded XML document"],
  ["ConformanceLevel", "The conformance level of the embedded XML document"]
];
function buildXmp(options) {
  const part = options.pdfaPart ?? 3;
  const conformance = options.pdfaConformance ?? "B";
  const version = options.facturxVersion ?? "1.0";
  const e = escapeXml;
  const properties = FX_PROPERTIES.map(
    ([name, description]) => `          <rdf:li rdf:parseType="Resource">
           <pdfaProperty:name>${e(name)}</pdfaProperty:name>
           <pdfaProperty:valueType>Text</pdfaProperty:valueType>
           <pdfaProperty:category>external</pdfaProperty:category>
           <pdfaProperty:description>${e(description)}</pdfaProperty:description>
          </rdf:li>`
  ).join("\n");
  return `<?xpacket begin="${BOM}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="erechnung-core">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${e(options.title)}</rdf:li>
    </rdf:Alt>
   </dc:title>
   <dc:creator>
    <rdf:Seq>
     <rdf:li>${e(options.author)}</rdf:li>
    </rdf:Seq>
   </dc:creator>
   <dc:description>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${e(options.subject)}</rdf:li>
    </rdf:Alt>
   </dc:description>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>${e(options.creatorTool)}</xmp:CreatorTool>
   <xmp:CreateDate>${e(options.createDate)}</xmp:CreateDate>
   <xmp:ModifyDate>${e(options.modifyDate)}</xmp:ModifyDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>${e(options.producer)}</pdf:Producer>
   <pdf:Keywords>${e(options.keywords ?? "")}</pdf:Keywords>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>${part}</pdfaid:part>
   <pdfaid:conformance>${conformance}</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about=""
    xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
    xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
    xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
${properties}
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>${e(options.documentFileName)}</fx:DocumentFileName>
   <fx:Version>${e(version)}</fx:Version>
   <fx:ConformanceLevel>${e(options.conformanceLevel)}</fx:ConformanceLevel>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;
}
function xmpDate(date) {
  const pad = (n, size = 2) => String(Math.floor(Math.abs(n))).padStart(size, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

// src/pdf/zeichenvorrat.ts
import fontkit2 from "@pdf-lib/fontkit";
var ZeichenvorratFehler = class extends Error {
  constructor(nachricht) {
    super(nachricht);
    this.name = "ZeichenvorratFehler";
  }
};
var UNSICHTBAR = /* @__PURE__ */ new Set([
  173,
  // weiches Trennzeichen
  8203,
  // unsichtbares Leerzeichen
  8204,
  // Nichtverbinder
  8205,
  // Verbinder
  8206,
  // Schreibrichtung links-nach-rechts
  8207,
  // Schreibrichtung rechts-nach-links
  8288,
  // Wortverbinder
  65279
  // Bytereihenfolge-Markierung
]);
function ohneUnsichtbare(text2) {
  let sauber = "";
  for (const zeichen of text2) {
    const nummer = zeichen.codePointAt(0);
    if (nummer !== void 0 && UNSICHTBAR.has(nummer)) continue;
    sauber += zeichen;
  }
  return sauber;
}
var Zeichenpruefung = class {
  constructor(schriften) {
    this.fehlend = /* @__PURE__ */ new Map();
    this.vorrat = schriften.map((schrift) => new Set(fontkit2.create(schrift).characterSet)).reduce((a, b) => new Set([...a].filter((zeichen) => b.has(zeichen))));
  }
  /** Merkt sich jedes Zeichen des Textes, das die Schrift nicht kennt. */
  pruefe(text2) {
    for (const zeichen of text2) {
      const nummer = zeichen.codePointAt(0);
      if (nummer === void 0 || this.vorrat.has(nummer)) continue;
      if (nummer === 10 || nummer === 13 || nummer === 9) continue;
      if (UNSICHTBAR.has(nummer)) continue;
      this.fehlend.set(nummer, zeichen);
    }
  }
  /**
   * Bricht ab, wenn Zeichen fehlen - mit allen auf einmal, nicht mit dem
   * ersten. Wer einen Kundenstamm einliest, will nicht zehnmal nacheinander
   * erfahren, dass noch ein Zeichen fehlt.
   */
  wirfBeiLuecken() {
    if (this.fehlend.size === 0) return;
    const liste = [...this.fehlend.entries()].sort(([a], [b]) => a - b).map(
      ([nummer, zeichen]) => `${zeichen} (U+${nummer.toString(16).toUpperCase().padStart(4, "0")})`
    ).join(", ");
    throw new ZeichenvorratFehler(
      `Die eingebettete Schrift kennt folgende Zeichen nicht: ${liste}. Sie wuerden im PDF nicht falsch, sondern gar nicht erscheinen, deshalb wird die Rechnung nicht erzeugt. Abhilfe: die Zeichen im Rechnungstext ersetzen, oder den Zeichenvorrat der Schrift erweitern (siehe tools/schrift-erzeugen.mjs).`
    );
  }
};
function mitZeichenpruefung(seite, pruefung) {
  const zeichnen = seite.drawText.bind(seite);
  seite.drawText = (text2, optionen) => {
    const sauber = ohneUnsichtbare(text2);
    pruefung.pruefe(sauber);
    zeichnen(sauber, optionen);
  };
  return seite;
}

// src/pdf/pdfa3.ts
var ANSCHRIFT_LUFT = 11;
function folgeseitenanfang(bogen, versatz) {
  const mitte = A4.height / 2;
  const imWeg = (x2) => x2 + versatz.x > (bogen.inhaltLinks ?? 0) + versatz.x;
  let tiefstes = Number.POSITIVE_INFINITY;
  for (const pfad of bogen.pfade) {
    const y = pfad.rahmen.y1 + versatz.y;
    if (y > mitte && y < tiefstes && imWeg(pfad.rahmen.x2)) tiefstes = y;
  }
  for (const text2 of bogen.texte) {
    const y = text2.y + versatz.y;
    if (y > mitte && y < tiefstes && imWeg(text2.x + text2.breite)) tiefstes = y;
  }
  return Number.isFinite(tiefstes) ? tiefstes - FOLGESEITE_LUFT : A4.height * 0.85;
}
var FUSSLUFT = 18;
var FOLGESEITE_LUFT = 16;
var DEFAULT_PRODUCER = "erechnung-core (pdf-lib)";
function laufweitenfaktor(schrift, proben) {
  const brauchbar = proben.filter((probe) => {
    if (probe.fett) return false;
    const ziffern = [...probe.text].filter((zeichen) => zeichen >= "0" && zeichen <= "9").length;
    return ziffern / probe.text.length <= 0.3;
  });
  const faktoren = [];
  for (const probe of brauchbar.length >= 3 ? brauchbar : proben) {
    let unser = 0;
    try {
      unser = schrift.widthOfTextAtSize(probe.text, probe.groesse);
    } catch {
      continue;
    }
    if (unser > 0 && probe.breite > 0) faktoren.push(probe.breite / unser);
  }
  if (faktoren.length < 3) return 1;
  faktoren.sort((eins, zwei) => eins - zwei);
  const median = faktoren[Math.floor(faktoren.length / 2)] ?? 1;
  return median >= 0.75 && median <= 1.15 ? median : 1;
}
async function renderZugferdPdf(invoice, options) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const totals = options.totals ?? computeTotals(invoice);
  const xml = options.xml ?? buildCii(invoice, { totals });
  const attachmentName = options.attachmentName ?? "factur-x.xml";
  const producer = options.producer ?? DEFAULT_PRODUCER;
  const creatorTool = options.creatorTool ?? producer;
  const doc = await PDFDocument4.create();
  doc.registerFontkit(fontkit3);
  const subset = options.subsetFonts ?? false;
  const merkmale = ["tnum"];
  const regular = await doc.embedFont(options.assets.fontRegular, {
    subset,
    features: merkmale
  });
  const bold = await doc.embedFont(options.assets.fontBold, {
    subset,
    features: merkmale
  });
  merkeSchriftquelle(regular, options.assets.fontRegular, merkmale);
  merkeSchriftquelle(bold, options.assets.fontBold, merkmale);
  const kraeftig = options.assets.fontKraeftig ? await doc.embedFont(options.assets.fontKraeftig, { subset, features: merkmale }) : void 0;
  if (kraeftig && options.assets.fontKraeftig) {
    merkeSchriftquelle(kraeftig, options.assets.fontKraeftig, merkmale);
  }
  const logo = options.assets.logoPng ? await doc.embedPng(options.assets.logoPng) : void 0;
  const pruefung = new Zeichenpruefung([options.assets.fontRegular, options.assets.fontBold]);
  const bogen = options.briefpapier;
  const versatz = bogen ? {
    x: (A4.width - bogen.seite.breite) / 2,
    y: (A4.height - bogen.seite.hoehe) / 2
  } : { x: 0, y: 0 };
  const schriftquelle = options.briefpapierVorlage ?? (bogen?.schriftbogen ? fromBase64(bogen.schriftbogen) : void 0);
  const setzer = bogen && schriftquelle ? await bereiteVorlagenschrift(doc, bogen, schriftquelle) : void 0;
  const addPage = () => {
    const seite = mitZeichenpruefung(doc.addPage([A4.width, A4.height]), pruefung);
    if (!bogen) return seite;
    zeichneBriefpapier(seite, setzer ? { ...bogen, texte: [] } : bogen, regular, versatz);
    setzer?.setze(seite, bogen, versatz);
    return seite;
  };
  const schlicht = Boolean(bogen) && bogen.inhaltFuellungen === 0;
  const ohneTitel = Boolean(bogen) && bogen.inhaltSchrift.median > 0 && bogen.inhaltSchrift.groesste <= bogen.inhaltSchrift.median * 1.25;
  const stummeMengen = invoice.lines.every(
    (zeile2, nummer) => zeile2.quantity === 1 && zeile2.unitCode === "C62" && Math.abs(zeile2.unitPrice - (totals.lineAmounts[nummer] ?? Number.NaN)) < 5e-3
  );
  const einSteuersatz = new Set(invoice.lines.map((zeile2) => `${zeile2.vat.category}-${zeile2.vat.rate ?? ""}`)).size === 1;
  const grundgroesse2 = (() => {
    if (!bogen) return void 0;
    const median = bogen.inhaltSchrift.median;
    if (!(median >= 7 && median <= 14)) return void 0;
    return Math.round(median * laufweitenfaktor(regular, bogen.inhaltProben) * 10) / 10;
  })();
  const grundthema = options.theme ?? (bogen?.akzent ? themaMitAkzent(bogen.akzent) : DEFAULT_THEME);
  const strichfarbe = bogen?.inhaltStriche?.farbe;
  const mitFarbe = !options.theme && (bogen?.textfarbe || strichfarbe) ? {
    ...grundthema,
    ...bogen?.textfarbe ? { text: rgb4(bogen.textfarbe.r, bogen.textfarbe.g, bogen.textfarbe.b) } : {},
    /*
     * Und die Haarlinie. Unsere ist ein helles Grau; die Vorlage zieht
     * ihre Summenlinien voll deckend, und unsere standen daneben kaum
     * sichtbar.
     */
    ...strichfarbe ? { hairline: rgb4(strichfarbe.r, strichfarbe.g, strichfarbe.b) } : {}
  } : grundthema;
  const thema = schlicht && !options.theme ? { ...mitFarbe, accent: mitFarbe.text } : mitFarbe;
  drawInvoice(addPage, invoice, totals, {
    fonts: { regular, bold, ...kraeftig ? { kraeftig } : {} },
    theme: thema,
    logo,
    footerNote: options.footerNote,
    eigenerBriefbogen: Boolean(bogen),
    // Bringt der Bogen eine Fusszeile mit, entfaellt unsere - sonst stehen
    // zwei uebereinander.
    ...bogen && bogen.fussgrenze > 0 ? {
      eigeneFusszeile: false,
      // Ohne eigene Fusszeile darf der Inhalt bis kurz ueber die des
      // Bogens reichen - der Platz dazwischen gehoert niemandem.
      inhaltUnten: bogen.fussgrenze + versatz.y + FUSSLUFT
    } : {},
    /*
     * Und das Anschriftenfeld beginnt dort, wo der Bogen es vorsieht: `grenze`
     * markiert genau die Kante unter seiner Rueckabsenderzeile. Ohne das lag
     * die Empfaengeranschrift auf ihr.
     */
    /*
     * Das Anschriftenfeld: wo die Vorlage ihre erste Zeile hat, sonst ein
     * fester Abstand unter der Kante. Der feste war elf Punkt, ihrer ist
     * zehn - alle vier Zeilen standen einen Punkt zu tief.
     */
    ...bogen ? {
      anschriftOben: (bogen.anschriftZeile ?? bogen.grenze - ANSCHRIFT_LUFT) + versatz.y
    } : {},
    ...schlicht ? { schlichteTabelle: true } : {},
    ...ohneTitel ? { ohneTitel: true } : {},
    /*
     * Und der Satzspiegel des Bogens. Ohne ihn stand unser Inhalt fuenf
     * Millimeter links neben seiner Rueckabsenderzeile und zehn Millimeter
     * innerhalb seiner Trennlinien - nichts fluchtete.
     */
    ...bogen?.satzspiegel ? {
      satzspiegel: {
        links: bogen.satzspiegel.links + versatz.x,
        rechts: bogen.satzspiegel.rechts + versatz.x
      }
    } : {},
    /*
     * Und die Einrueckung des Inhalts, falls die Vorlage eine hat. Getrennt
     * vom Satzspiegel: Das Anschriftenfeld bleibt an der linken Kante, sonst
     * verlaesst es das Fenster des Umschlags.
     */
    ...bogen?.inhaltLinks !== void 0 ? { inhaltLinks: bogen.inhaltLinks + versatz.x } : {},
    ...bogen ? { folgeseiteOben: folgeseitenanfang(bogen, versatz) } : {},
    /*
     * Das Waehrungswort nur, wenn es zur Waehrung der Rechnung passt. "Euro"
     * unter Betraegen in Franken waere schlimmer als der ISO-Kode.
     */
    ...bogen?.waehrungswort && invoice.currency === "EUR" ? { waehrungswort: bogen.waehrungswort } : {},
    ...options.beschriftungen ? { beschriftungen: options.beschriftungen } : {},
    ...options.kennzahlen ? { kennzahlen: options.kennzahlen } : {},
    ...options.tabellenkopf !== void 0 ? { tabellenkopf: options.tabellenkopf } : {},
    ...options.kennzahlenfelder ? { kennzahlenfelder: options.kennzahlenfelder } : {},
    ...options.kennzahlenInline !== void 0 ? { kennzahlenInline: options.kennzahlenInline } : {},
    ...options.kennzahlenFett ? { kennzahlenFett: options.kennzahlenFett } : {},
    ...options.positionsnummern !== void 0 ? { positionsnummern: options.positionsnummern } : {},
    ...options.positionsEinzug !== void 0 ? { positionsEinzug: options.positionsEinzug } : {},
    ...options.positionsauszeichnung !== void 0 ? { positionsauszeichnung: options.positionsauszeichnung } : {},
    ...options.betragUnten !== void 0 ? { betragUnten: options.betragUnten } : {},
    ...options.summenlabelKraeftig !== void 0 ? { summenlabelKraeftig: options.summenlabelKraeftig } : {},
    mengenspalten: options.mengenspalten ?? !stummeMengen,
    steuerspalte: options.steuerspalte ?? !einSteuersatz,
    /*
     * Die Strichstaerken des Summenblocks kommen aus der Vorlage: Sie zieht
     * 0,25 pt unter den gewoehnlichen Zeilen und 1,00 pt unter der Endsumme.
     */
    ...bogen?.inhaltStriche ? { striche: bogen.inhaltStriche } : {},
    /*
     * Und das senkrechte Raster des Rumpfes. Die Schriftgroesse nur, wenn sie
     * plausibel ist: Ein Median aus zwei Zeilen Kleingedrucktem saehe aus wie
     * eine Grundgroesse und setzte die ganze Rechnung in Sechspunkt.
     */
    ...grundgroesse2 !== void 0 ? { inhaltGroesse: grundgroesse2 } : {},
    ...bogen?.inhaltRaster.zeile !== void 0 ? { inhaltZeile: bogen.inhaltRaster.zeile } : {},
    ...bogen?.inhaltRaster.absatz !== void 0 ? { inhaltAbsatz: bogen.inhaltRaster.absatz } : {},
    ...bogen && options.kennzahlenOben !== void 0 ? { kennzahlenOben: options.kennzahlenOben + versatz.y } : {},
    ...bogen && options.textOben !== void 0 ? { textOben: options.textOben + versatz.y } : {},
    ...bogen && options.summenlabelRechts !== void 0 ? { summenlabelRechts: options.summenlabelRechts + versatz.x } : {},
    ...bogen && options.kennzahlenSpalten ? {
      kennzahlenSpalten: Object.fromEntries(
        Object.entries(options.kennzahlenSpalten).map(([feld, x]) => [feld, x + versatz.x])
      )
    } : {},
    ...options.datumOhneNullen !== void 0 ? { datumOhneNullen: options.datumOhneNullen } : {},
    ...options.steuergrundlage !== void 0 ? { steuergrundlage: options.steuergrundlage } : {},
    ...options.hinweise !== void 0 ? { hinweise: options.hinweise } : {},
    /*
     * Der Zahlungsblock entfaellt, wenn die Bankverbindung schon im Bogen
     * steht - sonst nicht. Er ist der einzige dieser Bloecke, dessen Inhalt
     * nirgends sonst auf dem Blatt stehen koennte, und eine Rechnung ohne
     * Kontoangabe waere fuer den Empfaenger nicht zu bezahlen.
     */
    zahlungsblock: options.zahlungsblock ?? (bogen ? !bankverbindungImBogen(bogen) : true),
    zahlungszielImBriefpapier: options.zahlungszielImBriefpapier
  });
  pruefung.wirfBeiLuecken();
  const title = `Rechnung ${invoice.number}`;
  const subject = `Rechnung ${invoice.number} vom ${formatDate(invoice.issueDate)} ueber ${formatAmount(totals.grandTotal, invoice.currency)}`;
  doc.setTitle(title);
  doc.setAuthor(invoice.seller.name);
  doc.setSubject(subject);
  doc.setKeywords([invoice.number, "ZUGFeRD", "Factur-X", "E-Rechnung"]);
  doc.setProducer(producer);
  doc.setCreator(creatorTool);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  doc.setLanguage("de-DE");
  await doc.attach(utf8Encode(xml), attachmentName, {
    mimeType: "text/xml",
    description: "Rechnungsdaten im ZUGFeRD-Format (UN/CEFACT CII)",
    creationDate: now,
    modificationDate: now,
    afRelationship: AFRelationship.Alternative
  });
  for (const attachment of invoice.attachments) {
    if (!attachment.data) continue;
    await doc.attach(attachment.data, attachment.filename ?? `${attachment.id}.bin`, {
      mimeType: attachment.mimeType ?? "application/octet-stream",
      description: attachment.description ?? attachment.id,
      creationDate: now,
      modificationDate: now,
      afRelationship: AFRelationship.Supplement
    });
  }
  addOutputIntent(doc, options.assets.iccProfile);
  addXmpMetadata(doc, {
    title,
    author: invoice.seller.name,
    subject,
    keywords: `${invoice.number}, ZUGFeRD, Factur-X, E-Rechnung`,
    creatorTool,
    producer,
    createDate: xmpDate(now),
    modifyDate: xmpDate(now),
    pdfaConformance: options.pdfaConformance ?? "B",
    documentFileName: attachmentName,
    conformanceLevel: options.conformanceLevel ?? "EN 16931"
  });
  ensureFileIdentifier(doc, `${invoice.number}|${invoice.issueDate}|${now.getTime()}`);
  const pdf = await doc.save({ useObjectStreams: false });
  return { pdf, xml, totals };
}
function addOutputIntent(doc, iccProfile) {
  const profileStream = doc.context.flateStream(iccProfile, {
    N: 3,
    Alternate: "DeviceRGB"
  });
  const profileRef = doc.context.register(profileStream);
  const outputIntent = doc.context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB"),
    OutputCondition: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    RegistryName: PDFString.of("http://www.color.org"),
    DestOutputProfile: profileRef
  });
  doc.catalog.set(PDFName4.of("OutputIntents"), doc.context.obj([outputIntent]));
}
function addXmpMetadata(doc, options) {
  const xmp = buildXmp(options);
  const stream = doc.context.stream(utf8Encode(xmp), {
    Type: "Metadata",
    Subtype: "XML"
  });
  doc.catalog.set(PDFName4.of("Metadata"), doc.context.register(stream));
}
function ensureFileIdentifier(doc, seed) {
  const id = PDFHexString2.of(hash128(seed));
  doc.context.trailerInfo.ID = doc.context.obj([id, id]);
}
function hash128(seed) {
  let out = "";
  for (let round2 = 0; round2 < 4; round2++) {
    let hash = 2166136261 ^ round2;
    const input = `${seed}#${round2}`;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    out += hash.toString(16).padStart(8, "0");
  }
  return out.toUpperCase();
}

// src/parse/word.ts
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

// src/parse/error.ts
var EInvoiceError = class extends Error {
  constructor(message, code, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
    this.name = "EInvoiceError";
  }
};
function asEInvoiceError(fehler, message, code) {
  if (fehler instanceof EInvoiceError) return fehler;
  return new EInvoiceError(message, code, fehler instanceof Error ? fehler.message : void 0);
}

// src/parse/word.ts
var parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false
});
function kinder(knoten, name) {
  const wert = knoten[name];
  return Array.isArray(wert) ? wert : [];
}
function nameVon(knoten) {
  return Object.keys(knoten).find((schluessel2) => schluessel2 !== ":@");
}
function textAus(knoten) {
  let gesammelt = "";
  for (const eintrag of knoten) {
    const name = nameVon(eintrag);
    if (!name) continue;
    if (name === "w:t") {
      for (const stueck of kinder(eintrag, "w:t")) {
        const inhalt = stueck["#text"];
        if (typeof inhalt === "string") gesammelt += inhalt;
      }
      continue;
    }
    if (name === "w:tab") {
      gesammelt += "	";
      continue;
    }
    if (name === "w:br" || name === "w:cr") {
      gesammelt += "\n";
      continue;
    }
    gesammelt += textAus(kinder(eintrag, name));
  }
  return gesammelt;
}
function tabelleAus(tbl) {
  const zeilen = [];
  for (const eintrag of tbl) {
    if (nameVon(eintrag) !== "w:tr") continue;
    const zellen = [];
    for (const zelle of kinder(eintrag, "w:tr")) {
      if (nameVon(zelle) !== "w:tc") continue;
      const absaetze = kinder(zelle, "w:tc").filter((teil) => nameVon(teil) === "w:p").map((teil) => textAus(kinder(teil, "w:p")).trim());
      zellen.push(absaetze.filter(Boolean).join("\n"));
    }
    if (zellen.length > 0) zeilen.push(zellen);
  }
  return { art: "tabelle", zeilen };
}
function bodyAus(baum) {
  for (const eintrag of baum) {
    const name = nameVon(eintrag);
    if (!name) continue;
    if (name === "w:body") return kinder(eintrag, "w:body");
    const tiefer = bodyAus(kinder(eintrag, name));
    if (tiefer) return tiefer;
  }
  return void 0;
}
function beginntMit(bytes, muster) {
  return muster.every((byte, stelle) => bytes[stelle] === byte);
}
function erklaereFremdformat(bytes) {
  if (beginntMit(bytes, [208, 207, 17, 224, 161, 177, 26, 225])) {
    return 'Das ist eine Datei im alten .doc-Format aus Word 97 bis 2003. Sie laesst sich hier nicht lesen - dort gibt es Tabellen nicht als eigene Struktur, sondern nur als markierte Absaetze. In Word: "Speichern unter" und .docx waehlen, dann geht es.';
  }
  if (beginntMit(bytes, [37, 80, 68, 70])) {
    return "Das ist ein PDF. Hier wird eine Word-Datei erwartet - eine .docx.";
  }
  if (beginntMit(bytes, [123, 92, 114, 116, 102])) {
    return 'Das ist eine RTF-Datei. In Word: "Speichern unter" und .docx waehlen.';
  }
  if (beginntMit(bytes, [80, 75])) return void 0;
  return "Diese Datei ist keine Word-Datei. Erwartet wird eine .docx.";
}
function liesWordDokument(bytes) {
  const fremd = erklaereFremdformat(bytes);
  if (fremd) throw new EInvoiceError(fremd, "unknown-format");
  let dateien;
  try {
    dateien = unzipSync(bytes);
  } catch {
    throw new EInvoiceError(
      "Diese Datei ist beschaedigt und laesst sich nicht entpacken.",
      "unknown-format"
    );
  }
  const dokument = dateien["word/document.xml"];
  if (!dokument) {
    throw new EInvoiceError(
      "Die Datei ist zwar ein Archiv, enthaelt aber kein Word-Dokument.",
      "unknown-format"
    );
  }
  const baum = parser.parse(new TextDecoder().decode(dokument));
  const body = bodyAus(baum);
  if (!body) {
    throw new EInvoiceError("Das Word-Dokument hat keinen lesbaren Inhalt.", "unknown-format");
  }
  const bloecke = [];
  for (const eintrag of body) {
    const name = nameVon(eintrag);
    if (name === "w:p") {
      const text2 = textAus(kinder(eintrag, "w:p")).trim();
      if (text2) bloecke.push({ art: "absatz", text: text2 });
      continue;
    }
    if (name === "w:tbl") {
      const tabelle = tabelleAus(kinder(eintrag, "w:tbl"));
      if (tabelle.zeilen.length > 0) bloecke.push(tabelle);
    }
  }
  return {
    bloecke,
    text: bloecke.filter((block) => block.art === "absatz").map((block) => block.text).join("\n"),
    tabellen: bloecke.filter((block) => block.art === "tabelle")
  };
}

// src/parse/word-uebernahme.ts
var ROLLEN = [
  { rolle: "bezeichnung", label: "Bezeichnung" },
  { rolle: "menge", label: "Menge" },
  { rolle: "einheit", label: "Einheit" },
  { rolle: "einzelpreis", label: "Einzelpreis" },
  { rolle: "ignorieren", label: "ignorieren" }
];
function zahlAus(text2) {
  const roh = text2.replace(/[^\d.,-]/g, "").trim();
  if (!roh || roh === "-") return void 0;
  let bereinigt;
  if (roh.includes(",")) {
    bereinigt = roh.replace(/\./g, "").replace(",", ".");
  } else {
    const punkte = roh.split(".").length - 1;
    const nachkomma = roh.includes(".") ? roh.split(".").pop()?.length ?? 0 : 0;
    bereinigt = punkte === 1 && nachkomma >= 1 && nachkomma <= 2 ? roh : roh.replace(/\./g, "");
  }
  const wert = Number(bereinigt);
  return Number.isFinite(wert) ? wert : void 0;
}
function schlageZuordnungVor(kopfzeile2) {
  const vergeben = /* @__PURE__ */ new Set();
  return kopfzeile2.map((zelle) => {
    const wort = zelle.toLowerCase().replace(/\s+/g, " ").trim();
    const treffer = () => {
      if (/(bezeichnung|leistung|beschreibung|artikel|position|text)/.test(wort)) return "bezeichnung";
      if (/(menge|anzahl|stück|stueck|std|stunden)/.test(wort)) return "menge";
      if (/(einheit|einh\.|me\b)/.test(wort)) return "einheit";
      if (/(einzel|e-preis|preis|netto|betrag)/.test(wort) && !/(gesamt|summe)/.test(wort)) {
        return "einzelpreis";
      }
      return "ignorieren";
    };
    const rolle = treffer();
    if (rolle !== "ignorieren" && vergeben.has(rolle)) return "ignorieren";
    if (rolle !== "ignorieren") vergeben.add(rolle);
    return rolle;
  });
}
function signaturVon(kopfzeile2) {
  return kopfzeile2.map((zelle) => zelle.toLowerCase().replace(/\s+/g, " ").trim()).join("|");
}
function positionenAus(tabelle, rollen, mitKopfzeile, vorlage) {
  const spalte = (rolle) => rollen.indexOf(rolle);
  const zeilen = mitKopfzeile ? tabelle.zeilen.slice(1) : tabelle.zeilen;
  const positionen = [];
  const uebersprungen = [];
  for (const zeile2 of zeilen) {
    const feld = (rolle) => {
      const stelle = spalte(rolle);
      return stelle >= 0 ? zeile2[stelle] ?? "" : "";
    };
    const name = feld("bezeichnung").replace(/\s+/g, " ").trim();
    const menge = zahlAus(feld("menge"));
    const preis = zahlAus(feld("einzelpreis"));
    if (!name) {
      uebersprungen.push({ zeile: zeile2, grund: "Keine Bezeichnung \u2014 vermutlich eine Summenzeile." });
      continue;
    }
    if (preis === void 0) {
      uebersprungen.push({ zeile: zeile2, grund: "Kein Einzelpreis erkannt." });
      continue;
    }
    positionen.push({
      ...vorlage,
      id: String(positionen.length + 1),
      name,
      quantity: menge ?? 1,
      unitCode: feld("einheit").trim() || vorlage.unitCode,
      unitPrice: preis
    });
  }
  return { positionen, uebersprungen };
}

// src/parse/pdf-tabelle.ts
var MINDESTSTUECKE = 2;
var FUEHRENDE_SPALTEN = 2;
var ABBRUCH_NACH = 2;
function schlageKopfzeileVor(zeilen) {
  let beste = -1;
  let meiste = MINDESTSTUECKE - 1;
  for (const [stelle, zeile2] of zeilen.entries()) {
    if (zeile2.stuecke.length > meiste) {
      meiste = zeile2.stuecke.length;
      beste = stelle;
    }
  }
  return beste;
}
function tabelleAusZeilen(zeilen, kopfzeile2) {
  const kopf = zeilen[kopfzeile2];
  if (!kopf || kopf.stuecke.length < MINDESTSTUECKE) {
    return { tabelle: { art: "tabelle", zeilen: [] }, fortsetzungen: [] };
  }
  const anker = kopf.stuecke.map((stueck) => stueck.x);
  const spalten = anker.length;
  const einordnen = (zeile2) => {
    const zellen = Array.from({ length: spalten }, () => "");
    for (const stueck of zeile2.stuecke) {
      let naechste = 0;
      let abstand = Infinity;
      for (const [stelle, x] of anker.entries()) {
        const gemessen = Math.abs(stueck.x - x);
        if (gemessen < abstand) {
          abstand = gemessen;
          naechste = stelle;
        }
      }
      zellen[naechste] = zellen[naechste] ? `${zellen[naechste]} ${stueck.text}` : stueck.text;
    }
    return zellen;
  };
  const ausgabe = [einordnen(kopf)];
  const fortsetzungen = [];
  let ohneFuehrung = 0;
  for (let stelle = kopfzeile2 + 1; stelle < zeilen.length; stelle += 1) {
    const zeile2 = zeilen[stelle];
    if (zeile2.stuecke.length === 0) break;
    const zellen = einordnen(zeile2);
    const fuehrend = zellen.slice(0, FUEHRENDE_SPALTEN).some((zelle) => zelle.trim().length > 0);
    if (!fuehrend) {
      ohneFuehrung += 1;
      if (ohneFuehrung >= ABBRUCH_NACH) {
        ausgabe.length -= ohneFuehrung - 1;
        break;
      }
      ausgabe.push(zellen);
      continue;
    }
    ohneFuehrung = 0;
    if (zeile2.stuecke.length < MINDESTSTUECKE) {
      if (ausgabe.length === 1) break;
      fortsetzungen.push(ausgabe.length);
    }
    ausgabe.push(zellen);
  }
  return { tabelle: { art: "tabelle", zeilen: ausgabe }, fortsetzungen };
}

// src/parse/stammdaten.ts
var PLZ_ORT = /\b(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .\-/]{1,40}?)\s*$/;
var STRASSE = /^(.*[A-Za-zÄÖÜäöüß.])\s+(\d+\s?[a-zA-Z]?(?:\s*[-/]\s*\d+\s?[a-zA-Z]?)?)$/;
var IBAN_KANDIDAT = /\b([A-Z]{2}\d{2}[\dA-Z\s]{10,34})\b/g;
var EU_LAENDER = "AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI";
var UST_KANDIDAT = new RegExp(`(?<![A-Za-z-])(${EU_LAENDER})\\s?(\\d{8,12})(?![\\d-])`, "g");
var STEUERNUMMER = /Steuer(?:\s*-?\s*)?(?:nummer|nr\.?)\s*:?\s*([\d/.\s-]{8,20})/i;
var LEITWEG = /Leitweg\s*-?\s*ID\s*:?\s*([\dA-Za-z-]{6,45})/i;
var ANREDE = /^(?:z\.?\s*(?:Hd\.?|H\.?)|Herrn?|Hr\.?|Frau|Fr\.?|Familie|Fam\.?)\s+\S/i;
function taugtAlsName(zeile2) {
  return zeile2.length > 0 && zeile2.length <= 70 && !PLZ_ORT.test(zeile2) && !STRASSE.test(zeile2);
}
function anschriftAusZeilen(zeilen, stelle) {
  const zeile2 = zeilen[stelle] ?? "";
  const treffer = PLZ_ORT.exec(zeile2);
  if (!treffer) return void 0;
  const felder = [
    { feld: "plz", wert: treffer[1], sicherheit: "muster", beleg: zeile2 },
    {
      feld: "ort",
      wert: treffer[2].trim(),
      sicherheit: "muster",
      beleg: zeile2
    }
  ];
  const beleg = [zeile2];
  const davor = zeilen[stelle - 1]?.trim() ?? "";
  const strasse = STRASSE.exec(davor);
  if (strasse) {
    felder.push({
      feld: "strasse",
      wert: davor,
      sicherheit: "geraten",
      beleg: davor
    });
    beleg.unshift(davor);
    const zweite = zeilen[stelle - 2]?.trim() ?? "";
    if (taugtAlsName(zweite)) {
      if (ANREDE.test(zweite)) {
        felder.push({
          feld: "ansprechpartner",
          wert: zweite,
          sicherheit: "geraten",
          beleg: zweite
        });
        beleg.unshift(zweite);
        const dritte = zeilen[stelle - 3]?.trim() ?? "";
        if (taugtAlsName(dritte) && !ANREDE.test(dritte)) {
          felder.push({
            feld: "name",
            wert: dritte,
            sicherheit: "geraten",
            beleg: dritte
          });
          beleg.unshift(dritte);
        }
      } else {
        felder.push({
          feld: "name",
          wert: zweite,
          sicherheit: "geraten",
          beleg: zweite
        });
        beleg.unshift(zweite);
      }
    }
  }
  return { beleg, felder };
}
var TRENNER = /\s+[-–—·•∙|/]\s+/;
function anschriftAusEinerZeile(zeile2) {
  const teile = zeile2.split(TRENNER).map((teil) => teil.trim()).filter(Boolean);
  if (teile.length < 2) return void 0;
  const gebaut = anschriftAusZeilen(teile, teile.length - 1);
  if (!gebaut) return void 0;
  const bisStrasse = teile.findIndex((teil) => STRASSE.test(teil));
  const name = bisStrasse > 0 ? teile.slice(0, bisStrasse).join(" ") : void 0;
  const felder = name ? [
    ...gebaut.felder.filter((fund) => fund.feld !== "name"),
    { feld: "name", wert: name, sicherheit: "geraten", beleg: zeile2 }
  ] : gebaut.felder;
  return { beleg: [zeile2], felder };
}
function findeStammdaten(zeilen) {
  const sauber = zeilen.map((zeile2) => zeile2.replace(/\s+/g, " ").trim()).filter(Boolean);
  const anschriften = [];
  const gesehen = /* @__PURE__ */ new Set();
  for (const [stelle, zeile2] of sauber.entries()) {
    const gefunden = anschriftAusEinerZeile(zeile2) ?? anschriftAusZeilen(sauber, stelle);
    if (!gefunden) continue;
    const schluessel2 = gefunden.felder.map((fund) => `${fund.feld}:${fund.wert.toLowerCase()}`).sort().join("|");
    if (gesehen.has(schluessel2)) continue;
    gesehen.add(schluessel2);
    anschriften.push(gefunden);
  }
  const angaben = [];
  const schon = /* @__PURE__ */ new Set();
  const merke = (feld, wert, sicherheit, beleg) => {
    const schluessel2 = `${feld}:${wert}`;
    if (schon.has(schluessel2)) return;
    schon.add(schluessel2);
    angaben.push({ feld, wert, sicherheit, beleg });
  };
  for (const zeile2 of sauber) {
    for (const treffer of zeile2.matchAll(IBAN_KANDIDAT)) {
      const kandidat = (treffer[1] ?? "").replace(/\s/g, "").toUpperCase();
      if (isPlausibleIban(kandidat)) merke("iban", kandidat, "geprueft", zeile2);
    }
    for (const treffer of zeile2.matchAll(UST_KANDIDAT)) {
      const kandidat = (treffer[1] ?? "").replace(/\s/g, "").toUpperCase();
      if (isPlausibleVatId(kandidat) && !isPlausibleIban(kandidat) && kandidat.length <= 14) {
        merke("ustId", kandidat, "muster", zeile2);
      }
    }
    const bic = /\b(?:BIC|SWIFT)(?:-?Code)?\s*:?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/.exec(
      zeile2
    );
    if (bic?.[1]) merke("bic", bic[1], "muster", zeile2);
    const steuer = STEUERNUMMER.exec(zeile2);
    if (steuer) merke("steuernummer", (steuer[1] ?? "").trim(), "muster", zeile2);
    const leitweg = LEITWEG.exec(zeile2);
    const leitwegWert = (leitweg?.[1] ?? "").trim();
    if (leitwegWert && isPlausibleLeitwegId(leitwegWert)) {
      merke("leitwegId", leitwegWert, "muster", zeile2);
    }
  }
  return { anschriften, angaben };
}

// src/parse/extract.ts
import { PDFArray as PDFArray3, PDFDict as PDFDict4, PDFDocument as PDFDocument5, PDFName as PDFName5, PDFRawStream as PDFRawStream2, decodePDFRawStream as decodePDFRawStream2 } from "pdf-lib";
var KNOWN_INVOICE_FILENAMES = [
  "factur-x.xml",
  "zugferd-invoice.xml",
  "xrechnung.xml",
  "ZUGFeRD-invoice.xml",
  "order-x.xml"
];
async function extractAttachments(pdf) {
  const doc = await PDFDocument5.load(pdf, {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false
  });
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  const readFileSpec = (spec) => {
    if (seen.has(spec)) return;
    seen.add(spec);
    const ef = spec.lookupMaybe(PDFName5.of("EF"), PDFDict4);
    const stream = ef?.lookup(PDFName5.of("F")) ?? ef?.lookup(PDFName5.of("UF"));
    if (!(stream instanceof PDFRawStream2)) return;
    const nameEntry = spec.lookup(PDFName5.of("UF")) ?? spec.lookup(PDFName5.of("F"));
    const filename = decodePdfText(nameEntry) ?? "anhang.bin";
    const subtype = stream.dict.lookup(PDFName5.of("Subtype"));
    found.push({
      filename,
      mimeType: subtype instanceof PDFName5 ? subtype.decodeText() : void 0,
      relationship: nameOf(spec.lookup(PDFName5.of("AFRelationship"))),
      description: decodePdfText(spec.lookup(PDFName5.of("Desc"))),
      data: decodePDFRawStream2(stream).decode()
    });
  };
  const walkNameTree = (node, depth = 0) => {
    if (!node || depth > 32) return;
    const names2 = node.lookupMaybe(PDFName5.of("Names"), PDFArray3);
    if (names2) {
      for (let i = 1; i < names2.size(); i += 2) {
        const spec = names2.lookupMaybe(i, PDFDict4);
        if (spec) readFileSpec(spec);
      }
    }
    const kids = node.lookupMaybe(PDFName5.of("Kids"), PDFArray3);
    if (kids) {
      for (let i = 0; i < kids.size(); i++) {
        walkNameTree(kids.lookupMaybe(i, PDFDict4), depth + 1);
      }
    }
  };
  const names = doc.catalog.lookupMaybe(PDFName5.of("Names"), PDFDict4);
  walkNameTree(names?.lookupMaybe(PDFName5.of("EmbeddedFiles"), PDFDict4));
  const af = doc.catalog.lookupMaybe(PDFName5.of("AF"), PDFArray3);
  if (af) {
    for (let i = 0; i < af.size(); i++) {
      const spec = af.lookupMaybe(i, PDFDict4);
      if (spec) readFileSpec(spec);
    }
  }
  return found;
}
async function extractInvoiceXml(pdf) {
  const attachments = await extractAttachments(pdf);
  const byName = KNOWN_INVOICE_FILENAMES.map(
    (name) => attachments.find((a) => a.filename.toLowerCase() === name.toLowerCase())
  ).find(Boolean);
  const candidate = byName ?? attachments.find((a) => a.relationship === "Alternative" && isXml(a)) ?? attachments.find(isXml);
  if (!candidate) return void 0;
  return { filename: candidate.filename, xml: utf8Decode(candidate.data) };
}
function isXml(attachment) {
  return attachment.filename.toLowerCase().endsWith(".xml") || (attachment.mimeType ?? "").includes("xml");
}
function nameOf(value) {
  return value instanceof PDFName5 ? value.decodeText() : void 0;
}
function decodePdfText(value) {
  if (value && typeof value.decodeText === "function") {
    return value.decodeText();
  }
  return void 0;
}

// src/parse/xml.ts
import { XMLParser as XMLParser2 } from "fast-xml-parser";
var parser2 = new XMLParser2({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
});
function parseInvoiceXml(xml) {
  const doc = parser2.parse(xml);
  if (doc.CrossIndustryInvoice) return parseCii(doc.CrossIndustryInvoice);
  if (doc.Invoice) return parseUbl(doc.Invoice, false);
  if (doc.CreditNote) return parseUbl(doc.CreditNote, true);
  throw new EInvoiceError(
    "Die Datei ist kein Rechnungsdokument. Erwartet wird eine CrossIndustryInvoice (ZUGFeRD, XRechnung CII) oder eine Invoice bzw. CreditNote (UBL).",
    "unknown-format"
  );
}
function parseCii(root) {
  const warnings = [];
  const document = obj(root.ExchangedDocument);
  const transaction = obj(root.SupplyChainTradeTransaction);
  const agreement = obj(transaction.ApplicableHeaderTradeAgreement);
  const delivery = obj(transaction.ApplicableHeaderTradeDelivery);
  const settlement = obj(transaction.ApplicableHeaderTradeSettlement);
  const summation = obj(settlement.SpecifiedTradeSettlementHeaderMonetarySummation);
  const paymentMeans = first(settlement.SpecifiedTradeSettlementPaymentMeans);
  const paymentTerms = first(settlement.SpecifiedTradePaymentTerms);
  const profileId = text(
    obj(obj(root.ExchangedDocumentContext).GuidelineSpecifiedDocumentContextParameter).ID
  );
  const lines = list(transaction.IncludedSupplyChainTradeLineItem).map((raw, index) => {
    const item = obj(raw);
    const product = obj(item.SpecifiedTradeProduct);
    const lineAgreement = obj(item.SpecifiedLineTradeAgreement);
    const lineDelivery = obj(item.SpecifiedLineTradeDelivery);
    const lineSettlement = obj(item.SpecifiedLineTradeSettlement);
    const netPrice = obj(lineAgreement.NetPriceProductTradePrice);
    const grossPrice = obj(lineAgreement.GrossPriceProductTradePrice);
    const tax = obj(first(lineSettlement.ApplicableTradeTax));
    const period = obj(lineSettlement.BillingSpecifiedPeriod);
    return {
      id: text(obj(item.AssociatedDocumentLineDocument).LineID) ?? String(index + 1),
      name: text(product.Name) ?? "Position",
      description: text(obj(first(obj(item.AssociatedDocumentLineDocument).IncludedNote)).Content),
      sellerItemId: text(product.SellerAssignedID),
      globalItemId: text(product.GlobalID),
      quantity: num(lineDelivery.BilledQuantity) ?? 0,
      unitCode: attr(lineDelivery.BilledQuantity, "unitCode") ?? "C62",
      unitPrice: num(netPrice.ChargeAmount) ?? 0,
      priceBaseQuantity: num(netPrice.BasisQuantity),
      grossUnitPrice: num(grossPrice.ChargeAmount),
      vat: vatFrom(tax),
      allowancesCharges: list(lineSettlement.SpecifiedTradeAllowanceCharge).map(allowanceFrom),
      periodStart: ciiDate(obj(period.StartDateTime).DateTimeString),
      periodEnd: ciiDate(obj(period.EndDateTime).DateTimeString),
      attributes: list(product.ApplicableProductCharacteristic).map((raw2) => ({
        name: text(obj(raw2).Description) ?? "",
        value: text(obj(raw2).Value) ?? ""
      }))
    };
  });
  const taxGroups = list(settlement.ApplicableTradeTax).map(obj);
  const exemptionByRate = /* @__PURE__ */ new Map();
  for (const tax of taxGroups) {
    exemptionByRate.set(`${text(tax.CategoryCode)}:${num(tax.RateApplicablePercent) ?? 0}`, {
      reason: text(tax.ExemptionReason),
      code: text(tax.ExemptionReasonCode)
    });
  }
  for (const line of lines) {
    const found = exemptionByRate.get(`${line.vat.category}:${line.vat.rate}`);
    if (found?.reason) line.vat.exemptionReason = found.reason;
    if (found?.code) line.vat.exemptionReasonCode = found.code;
  }
  const invoiceReference = obj(settlement.InvoiceReferencedDocument);
  const input = {
    profile: profileId?.includes("xrechnung") ? "xrechnung-cii" : "zugferd-en16931",
    number: text(document.ID) ?? "",
    typeCode: text(document.TypeCode) ?? "380",
    issueDate: ciiDate(obj(document.IssueDateTime).DateTimeString) ?? "1970-01-01",
    dueDate: ciiDate(obj(paymentTerms?.DueDateDateTime).DateTimeString),
    deliveryDate: ciiDate(
      obj(obj(delivery.ActualDeliverySupplyChainEvent).OccurrenceDateTime).DateTimeString
    ),
    periodStart: ciiDate(obj(obj(settlement.BillingSpecifiedPeriod).StartDateTime).DateTimeString),
    periodEnd: ciiDate(obj(obj(settlement.BillingSpecifiedPeriod).EndDateTime).DateTimeString),
    currency: text(settlement.InvoiceCurrencyCode) ?? "EUR",
    buyerReference: text(agreement.BuyerReference),
    orderReference: text(obj(agreement.BuyerOrderReferencedDocument).IssuerAssignedID),
    sellerOrderReference: text(obj(agreement.SellerOrderReferencedDocument).IssuerAssignedID),
    contractReference: text(obj(agreement.ContractReferencedDocument).IssuerAssignedID),
    projectReference: text(obj(agreement.SpecifiedProcuringProject).ID),
    seller: ciiParty(obj(agreement.SellerTradeParty)),
    buyer: ciiParty(obj(agreement.BuyerTradeParty)),
    lines,
    allowancesCharges: list(settlement.SpecifiedTradeAllowanceCharge).map(allowanceFrom),
    notes: list(document.IncludedNote).map((raw) => ({ text: text(obj(raw).Content) ?? "", subjectCode: text(obj(raw).SubjectCode) })).filter((note) => note.text.length > 0),
    paidAmount: num(summation.TotalPrepaidAmount) ?? 0,
    roundingAmount: num(summation.RoundingAmount) ?? 0
  };
  if (text(invoiceReference.IssuerAssignedID)) {
    input.precedingInvoice = {
      number: text(invoiceReference.IssuerAssignedID) ?? "",
      issueDate: ciiDate(obj(invoiceReference.FormattedIssueDateTime).DateTimeString)
    };
  }
  if (paymentMeans || paymentTerms) {
    const creditorAccount = obj(paymentMeans?.PayeePartyCreditorFinancialAccount);
    const debtorAccount = obj(paymentMeans?.PayerPartyDebtorFinancialAccount);
    input.payment = {
      meansCode: text(paymentMeans?.TypeCode) ?? "1",
      meansText: text(paymentMeans?.Information),
      iban: text(creditorAccount.IBANID) ?? text(debtorAccount.IBANID),
      bic: text(obj(paymentMeans?.PayeeSpecifiedCreditorFinancialInstitution).BICID),
      accountName: text(creditorAccount.AccountName),
      remittanceInformation: text(settlement.PaymentReference),
      mandateReference: text(paymentTerms?.DirectDebitMandateID),
      creditorIdentifier: text(settlement.CreditorReferenceID),
      terms: text(paymentTerms?.Description)
    };
  }
  const declaredTotals = {
    lineTotal: num(summation.LineTotalAmount),
    taxBasisTotal: num(summation.TaxBasisTotalAmount),
    taxTotal: num(summation.TaxTotalAmount),
    grandTotal: num(summation.GrandTotalAmount),
    paidAmount: num(summation.TotalPrepaidAmount),
    duePayable: num(summation.DuePayableAmount)
  };
  return finish(input, "cii", profileId, declaredTotals, warnings);
}
function ciiParty(node) {
  const address = obj(node.PostalTradeAddress);
  const contact = obj(node.DefinedTradeContact);
  const registrations = list(node.SpecifiedTaxRegistration).map(obj);
  const legal = obj(node.SpecifiedLegalOrganization);
  const registrationFor = (scheme) => registrations.map((entry) => attr(entry.ID, "schemeID") === scheme ? text(entry.ID) : void 0).find(Boolean);
  return {
    name: text(node.Name) ?? "",
    tradingName: text(legal.TradingBusinessName),
    identifier: text(node.ID),
    legalRegistrationId: text(legal.ID),
    vatId: registrationFor("VA"),
    taxNumber: registrationFor("FC"),
    address: {
      line1: text(address.LineOne) ?? "",
      line2: text(address.LineTwo),
      city: text(address.CityName) ?? "",
      postcode: text(address.PostcodeCode),
      subdivision: text(address.CountrySubDivisionName),
      countryCode: text(address.CountryID) ?? "DE"
    },
    electronicAddress: text(obj(node.URIUniversalCommunication).URIID) ? {
      value: text(obj(node.URIUniversalCommunication).URIID) ?? "",
      scheme: attr(obj(node.URIUniversalCommunication).URIID, "schemeID") ?? "EM"
    } : void 0,
    contact: contact.PersonName || contact.TelephoneUniversalCommunication ? {
      name: text(contact.PersonName),
      phone: text(obj(contact.TelephoneUniversalCommunication).CompleteNumber),
      email: text(obj(contact.EmailURIUniversalCommunication).URIID)
    } : void 0
  };
}
function allowanceFrom(raw) {
  const node = obj(raw);
  const tax = obj(node.CategoryTradeTax);
  return {
    isCharge: text(obj(node.ChargeIndicator).Indicator) === "true",
    amount: num(node.ActualAmount) ?? 0,
    baseAmount: num(node.BasisAmount),
    percentage: num(node.CalculationPercent),
    reason: text(node.Reason),
    reasonCode: text(node.ReasonCode),
    vat: vatFrom(tax)
  };
}
function vatFrom(tax) {
  return {
    category: text(tax.CategoryCode) ?? "S",
    rate: num(tax.RateApplicablePercent) ?? 0,
    exemptionReason: text(tax.ExemptionReason),
    exemptionReasonCode: text(tax.ExemptionReasonCode)
  };
}
function parseUbl(root, isCreditNote) {
  const warnings = [];
  const profileId = text(root.CustomizationID);
  const monetary = obj(root.LegalMonetaryTotal);
  const taxTotal = obj(first(root.TaxTotal));
  const paymentMeans = obj(first(root.PaymentMeans));
  const lineTag = isCreditNote ? root.CreditNoteLine : root.InvoiceLine;
  const lines = list(lineTag).map((raw, index) => {
    const node = obj(raw);
    const item = obj(node.Item);
    const price = obj(node.Price);
    const category = obj(item.ClassifiedTaxCategory);
    const period = obj(node.InvoicePeriod);
    const quantity = isCreditNote ? node.CreditedQuantity : node.InvoicedQuantity;
    return {
      id: text(node.ID) ?? String(index + 1),
      name: text(item.Name) ?? "Position",
      description: text(item.Description) ?? text(node.Note),
      sellerItemId: text(obj(item.SellersItemIdentification).ID),
      globalItemId: text(obj(item.StandardItemIdentification).ID),
      quantity: num(quantity) ?? 0,
      unitCode: attr(quantity, "unitCode") ?? "C62",
      unitPrice: num(price.PriceAmount) ?? 0,
      priceBaseQuantity: num(price.BaseQuantity),
      vat: {
        category: text(category.ID) ?? "S",
        rate: num(category.Percent) ?? 0
      },
      allowancesCharges: list(node.AllowanceCharge).map((entry) => {
        const ac = obj(entry);
        return {
          isCharge: text(ac.ChargeIndicator) === "true",
          amount: num(ac.Amount) ?? 0,
          baseAmount: num(ac.BaseAmount),
          percentage: num(ac.MultiplierFactorNumeric),
          reason: text(ac.AllowanceChargeReason),
          reasonCode: text(ac.AllowanceChargeReasonCode),
          vat: { category: text(category.ID) ?? "S", rate: num(category.Percent) ?? 0 }
        };
      }),
      periodStart: text(period.StartDate),
      periodEnd: text(period.EndDate),
      attributes: list(item.AdditionalItemProperty).map((entry) => ({
        name: text(obj(entry).Name) ?? "",
        value: text(obj(entry).Value) ?? ""
      }))
    };
  });
  for (const subtotal of list(taxTotal.TaxSubtotal).map(obj)) {
    const category = obj(subtotal.TaxCategory);
    const key = `${text(category.ID)}:${num(category.Percent) ?? 0}`;
    for (const line of lines) {
      if (`${line.vat.category}:${line.vat.rate}` !== key) continue;
      line.vat.exemptionReason = text(category.TaxExemptionReason);
      line.vat.exemptionReasonCode = text(category.TaxExemptionReasonCode);
    }
  }
  const delivery = obj(first(root.Delivery));
  const billingReference = obj(obj(first(root.BillingReference)).InvoiceDocumentReference);
  const input = {
    profile: "xrechnung-ubl",
    number: text(root.ID) ?? "",
    typeCode: text(isCreditNote ? root.CreditNoteTypeCode : root.InvoiceTypeCode) ?? "380",
    issueDate: text(root.IssueDate) ?? "1970-01-01",
    dueDate: text(root.DueDate),
    deliveryDate: text(delivery.ActualDeliveryDate) ?? text(root.TaxPointDate),
    periodStart: text(obj(root.InvoicePeriod).StartDate),
    periodEnd: text(obj(root.InvoicePeriod).EndDate),
    currency: text(root.DocumentCurrencyCode) ?? "EUR",
    buyerReference: text(root.BuyerReference),
    orderReference: text(obj(root.OrderReference).ID),
    sellerOrderReference: text(obj(root.OrderReference).SalesOrderID),
    contractReference: text(obj(root.ContractDocumentReference).ID),
    projectReference: text(obj(root.ProjectReference).ID),
    seller: ublParty(obj(obj(root.AccountingSupplierParty).Party)),
    buyer: ublParty(obj(obj(root.AccountingCustomerParty).Party)),
    lines,
    allowancesCharges: list(root.AllowanceCharge).map((entry) => {
      const ac = obj(entry);
      const category = obj(ac.TaxCategory);
      return {
        isCharge: text(ac.ChargeIndicator) === "true",
        amount: num(ac.Amount) ?? 0,
        baseAmount: num(ac.BaseAmount),
        percentage: num(ac.MultiplierFactorNumeric),
        reason: text(ac.AllowanceChargeReason),
        reasonCode: text(ac.AllowanceChargeReasonCode),
        vat: {
          category: text(category.ID) ?? "S",
          rate: num(category.Percent) ?? 0
        }
      };
    }),
    notes: list(root.Note).map((entry) => ({ text: typeof entry === "string" ? entry : text(entry) ?? "" })).filter((note) => note.text.length > 0),
    paidAmount: num(monetary.PrepaidAmount) ?? 0,
    roundingAmount: num(monetary.PayableRoundingAmount) ?? 0
  };
  if (text(billingReference.ID)) {
    input.precedingInvoice = {
      number: text(billingReference.ID) ?? "",
      issueDate: text(billingReference.IssueDate)
    };
  }
  if (paymentMeans.PaymentMeansCode) {
    const account = obj(paymentMeans.PayeeFinancialAccount);
    const mandate = obj(paymentMeans.PaymentMandate);
    input.payment = {
      meansCode: text(paymentMeans.PaymentMeansCode) ?? "1",
      meansText: attr(paymentMeans.PaymentMeansCode, "name"),
      iban: text(account.ID) ?? text(obj(mandate.PayerFinancialAccount).ID),
      bic: text(obj(account.FinancialInstitutionBranch).ID),
      accountName: text(account.Name),
      remittanceInformation: text(paymentMeans.PaymentID),
      mandateReference: text(mandate.ID),
      terms: text(obj(first(root.PaymentTerms)).Note)
    };
  }
  const declaredTotals = {
    lineTotal: num(monetary.LineExtensionAmount),
    taxBasisTotal: num(monetary.TaxExclusiveAmount),
    taxTotal: num(taxTotal.TaxAmount),
    grandTotal: num(monetary.TaxInclusiveAmount),
    paidAmount: num(monetary.PrepaidAmount),
    duePayable: num(monetary.PayableAmount)
  };
  return finish(input, "ubl", profileId, declaredTotals, warnings);
}
function ublParty(node) {
  const address = obj(node.PostalAddress);
  const contact = obj(node.Contact);
  const legal = obj(first(node.PartyLegalEntity));
  const schemes = list(node.PartyTaxScheme).map(obj);
  const companyIdFor = (scheme) => schemes.map((entry) => text(obj(entry.TaxScheme).ID) === scheme ? text(entry.CompanyID) : void 0).find(Boolean);
  return {
    name: text(legal.RegistrationName) ?? text(obj(first(node.PartyName)).Name) ?? "",
    tradingName: text(obj(first(node.PartyName)).Name),
    identifier: text(obj(first(node.PartyIdentification)).ID),
    legalRegistrationId: text(legal.CompanyID),
    vatId: companyIdFor("VAT"),
    taxNumber: companyIdFor("FC"),
    address: {
      line1: text(address.StreetName) ?? "",
      line2: text(address.AdditionalStreetName),
      city: text(address.CityName) ?? "",
      postcode: text(address.PostalZone),
      subdivision: text(address.CountrySubentity),
      countryCode: text(obj(address.Country).IdentificationCode) ?? "DE"
    },
    electronicAddress: text(node.EndpointID) ? { value: text(node.EndpointID) ?? "", scheme: attr(node.EndpointID, "schemeID") ?? "EM" } : void 0,
    contact: contact.Name || contact.Telephone || contact.ElectronicMail ? {
      name: text(contact.Name),
      phone: text(contact.Telephone),
      email: text(contact.ElectronicMail)
    } : void 0
  };
}
function finish(input, syntax, profileId, declaredTotals, warnings) {
  const result = parseInvoice(input);
  if (!input.number) warnings.push("Die Rechnung enthaelt keine Rechnungsnummer.");
  if (result.lines.length === 0) warnings.push("Die Rechnung enthaelt keine Positionen.");
  return { invoice: result, syntax, profileId, declaredTotals, warnings };
}
function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  if (value === void 0 || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
function first(value) {
  const entries = list(value);
  return entries.length > 0 ? obj(entries[0]) : void 0;
}
function text(value) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value === "string") return value.length > 0 ? value : void 0;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const inner = value["#text"];
    if (typeof inner === "string") return inner.length > 0 ? inner : void 0;
    if (typeof inner === "number") return String(inner);
  }
  return void 0;
}
function num(value) {
  const raw = text(value);
  if (raw === void 0) return void 0;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : void 0;
}
function attr(value, name) {
  if (!value || typeof value !== "object") return void 0;
  const raw = value[`@_${name}`];
  return typeof raw === "string" && raw.length > 0 ? raw : void 0;
}
function ciiDate(value) {
  const raw = text(value);
  if (!raw) return void 0;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return void 0;
}

// src/parse/receive.ts
async function readEInvoice(bytes, filename) {
  const kind = detectKind(bytes);
  if (kind === "pdf-hybrid" || kind === "pdf-without-xml") {
    try {
      const attachments = await extractAttachments(bytes);
      const found = await extractInvoiceXml(bytes);
      if (!found) {
        throw new EInvoiceError(
          "Das PDF enthaelt keine eingebettete XML-Rechnung. Es ist damit keine E-Rechnung, sondern ein reines Bilddokument.",
          "no-embedded-xml"
        );
      }
      return finish2(parseInvoiceXml(found.xml), "pdf-hybrid", found.filename, attachments);
    } catch (fehler) {
      throw asEInvoiceError(
        fehler,
        "Das PDF liess sich nicht lesen. Moeglicherweise ist die Datei unvollstaendig oder beim Uebertragen beschaedigt worden.",
        "parse-failed"
      );
    }
  }
  if (kind === "xml") {
    try {
      return finish2(parseInvoiceXml(utf8Decode(bytes)), "xml", filename, []);
    } catch (fehler) {
      throw asEInvoiceError(
        fehler,
        "Die XML-Datei liess sich nicht auswerten. Moeglicherweise ist sie unvollstaendig oder kein Rechnungsdokument.",
        "parse-failed"
      );
    }
  }
  throw new EInvoiceError(
    "Unbekanntes Dateiformat - erwartet wird ein PDF oder eine XML-Datei.",
    "unknown-format"
  );
}
function finish2(parsed, kind, sourceFilename, attachments) {
  const computed = computeTotals(parsed.invoice);
  const declared = parsed.declaredTotals;
  const comparisons = [
    ["Positionssumme", declared.lineTotal, computed.lineTotal],
    ["Gesamtsumme netto", declared.taxBasisTotal, computed.taxBasisTotal],
    ["Umsatzsteuer", declared.taxTotal, computed.taxTotal],
    ["Bruttobetrag", declared.grandTotal, computed.grandTotal],
    ["Zahlbetrag", declared.duePayable, computed.duePayable]
  ];
  const totalMismatches = comparisons.filter(([, value]) => value !== void 0).map(([field, value, computedValue]) => ({
    field,
    declared: round(value ?? 0, 2),
    computed: round(computedValue, 2)
  })).filter((entry) => Math.abs(entry.declared - entry.computed) > 5e-3);
  return {
    ...parsed,
    kind,
    sourceFilename,
    attachments: attachments.filter((a) => a.filename !== sourceFilename),
    totalMismatches,
    issues: validateInvoice(parsed.invoice).issues
  };
}
function detectKind(bytes) {
  if (bytes.length >= 5) {
    const head = String.fromCharCode(...bytes.subarray(0, 5));
    if (head === "%PDF-") return "pdf-hybrid";
  }
  const start = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? 3 : 0;
  const probe = utf8Decode(bytes.subarray(start, Math.min(bytes.length, start + 512))).trimStart();
  if (probe.startsWith("<?xml") || probe.startsWith("<")) return "xml";
  return "unknown";
}

// src/util/cp1252.ts
var SONDERFAELLE = /* @__PURE__ */ new Map([
  [8364, 128],
  // Euro
  [8218, 130],
  // tiefes einfaches Anfuehrungszeichen
  [402, 131],
  [8222, 132],
  // tiefes doppeltes Anfuehrungszeichen
  [8230, 133],
  // Auslassungspunkte
  [8224, 134],
  [8225, 135],
  [710, 136],
  [8240, 137],
  // Promille
  [352, 138],
  [8249, 139],
  [338, 140],
  [381, 142],
  [8216, 145],
  // einfache Anfuehrungszeichen
  [8217, 146],
  [8220, 147],
  // doppelte Anfuehrungszeichen
  [8221, 148],
  [8226, 149],
  // Aufzaehlungspunkt
  [8211, 150],
  // Halbgeviertstrich
  [8212, 151],
  // Geviertstrich
  [732, 152],
  [8482, 153],
  // Markenzeichen
  [353, 154],
  [8250, 155],
  [339, 156],
  [382, 158],
  [376, 159]
]);
var ERSATZ = /* @__PURE__ */ new Map([
  [8722, "-"],
  // Minuszeichen
  [160, " "],
  // geschuetztes Leerzeichen
  [8239, " "],
  // schmales geschuetztes Leerzeichen
  [8209, "-"]
  // geschuetzter Bindestrich
]);
function cp1252(text2) {
  const bytes = [];
  const ersetzt = [];
  for (const zeichen of text2) {
    const punkt = zeichen.codePointAt(0) ?? 0;
    const ersatz = ERSATZ.get(punkt);
    if (ersatz !== void 0) {
      for (const b of ersatz) bytes.push(b.charCodeAt(0));
      continue;
    }
    if (punkt < 128 || punkt >= 160 && punkt <= 255) {
      bytes.push(punkt);
      continue;
    }
    const sonder = SONDERFAELLE.get(punkt);
    if (sonder !== void 0) {
      bytes.push(sonder);
      continue;
    }
    bytes.push(63);
    if (!ersetzt.includes(zeichen)) ersetzt.push(zeichen);
  }
  return { bytes: new Uint8Array(bytes), ersetzt };
}

// src/export/kontenrahmen.ts
var SKR03 = {
  name: "SKR 03",
  sachkontenlaenge: 4,
  erloese: {
    standard: { konto: "8400", bezeichnung: "Erloese 19 % USt" },
    ermaessigt: { konto: "8300", bezeichnung: "Erloese 7 % USt" },
    steuerfrei: { konto: "8200", bezeichnung: "Erloese steuerfrei" },
    reverseCharge: {
      konto: "8337",
      bezeichnung: "Erloese Reverse Charge (Paragraf 13b UStG)"
    },
    innergemeinschaftlich: {
      konto: "8125",
      bezeichnung: "Steuerfreie innergemeinschaftliche Lieferung"
    },
    ausfuhr: { konto: "8120", bezeichnung: "Steuerfreie Ausfuhrlieferung" },
    nichtSteuerbar: { konto: "8338", bezeichnung: "Nicht steuerbare Umsaetze" }
  },
  sammeldebitor: "10000",
  debitorenbereich: { von: 1e4, bis: 69999 }
};
var SKR04 = {
  name: "SKR 04",
  sachkontenlaenge: 4,
  erloese: {
    standard: { konto: "4400", bezeichnung: "Erloese 19 % USt" },
    ermaessigt: { konto: "4300", bezeichnung: "Erloese 7 % USt" },
    steuerfrei: { konto: "4200", bezeichnung: "Erloese steuerfrei" },
    reverseCharge: {
      konto: "4337",
      bezeichnung: "Erloese Reverse Charge (Paragraf 13b UStG)"
    },
    innergemeinschaftlich: {
      konto: "4125",
      bezeichnung: "Steuerfreie innergemeinschaftliche Lieferung"
    },
    ausfuhr: { konto: "4120", bezeichnung: "Steuerfreie Ausfuhrlieferung" },
    nichtSteuerbar: { konto: "4338", bezeichnung: "Nicht steuerbare Umsaetze" }
  },
  sammeldebitor: "10000",
  debitorenbereich: { von: 1e4, bis: 69999 }
};
var VORLAGEN = [SKR03, SKR04];
function steuerfallFuer(vat) {
  switch (vat.category) {
    case "AE":
      return "reverseCharge";
    case "K":
      return "innergemeinschaftlich";
    case "G":
      return "ausfuhr";
    case "O":
      return "nichtSteuerbar";
    case "E":
    case "Z":
      return "steuerfrei";
    default:
      return vat.rate >= 19 ? "standard" : "ermaessigt";
  }
}
function istDebitorennummer(rahmen, nummer) {
  if (!/^\d+$/.test(nummer)) return false;
  const wert = Number(nummer);
  return wert >= rahmen.debitorenbereich.von && wert <= rahmen.debitorenbereich.bis;
}
function abgewandelt(rahmen, aenderungen) {
  const erloese = { ...rahmen.erloese };
  for (const [fall, wert] of Object.entries(aenderungen.erloese ?? {})) {
    const schluessel2 = fall;
    erloese[schluessel2] = { ...erloese[schluessel2], ...wert };
  }
  return { ...rahmen, ...aenderungen, erloese };
}

// src/export/datev.ts
var FORMAT_VERSION = 700;
var FORMAT_KATEGORIE = 21;
var FORMAT_NAME = "Buchungsstapel";
var FORMAT_UNTERVERSION = 13;
var SPALTEN = [
  "Umsatz (ohne Soll/Haben-Kz)",
  "Soll/Haben-Kennzeichen",
  "WKZ Umsatz",
  "Kurs",
  "Basis-Umsatz",
  "WKZ Basis-Umsatz",
  "Konto",
  "Gegenkonto (ohne BU-Schluessel)",
  "BU-Schluessel",
  "Belegdatum",
  "Belegfeld 1",
  "Belegfeld 2",
  "Skonto",
  "Buchungstext"
];
function buildDatevBuchungsstapel(rechnungen, optionen) {
  const now = optionen.now ?? /* @__PURE__ */ new Date();
  const uebersprungen = [];
  const buchungen = [];
  for (const rechnung of rechnungen) {
    const totals = computeTotals(rechnung);
    if (rechnung.currency !== "EUR") {
      uebersprungen.push({
        nummer: rechnung.number,
        grund: `Waehrung ${rechnung.currency} wird noch nicht unterstuetzt`
      });
      continue;
    }
    const debitor = optionen.debitor?.(rechnung) ?? optionen.kontenrahmen.sammeldebitor;
    const gutschrift = rechnung.typeCode === "381" || rechnung.typeCode === "396";
    for (const gruppe of totals.vatBreakdown) {
      const brutto = round(gruppe.taxableAmount + gruppe.taxAmount, 2);
      if (brutto === 0) continue;
      const fall = steuerfallFuer(gruppe);
      const erloes = optionen.kontenrahmen.erloese[fall];
      buchungen.push({
        // Der Betrag ist im DATEV-Format immer positiv; die Richtung steckt
        // ausschliesslich im Soll/Haben-Kennzeichen.
        umsatz: Math.abs(brutto),
        sollHaben: gutschrift === brutto >= 0 ? "H" : "S",
        konto: debitor,
        gegenkonto: erloes.konto,
        buSchluessel: erloes.buSchluessel ?? "",
        belegdatum: belegdatum(rechnung.issueDate),
        belegfeld1: rechnung.number.slice(0, 36),
        buchungstext: buchungstext(rechnung, gruppe.category, gruppe.rate),
        faelligkeit: rechnung.dueDate ? datumAcht(rechnung.dueDate) : ""
      });
    }
  }
  const zeitraum = zeitraumVon(rechnungen);
  const kopf = kopfzeile(optionen, now, zeitraum);
  const spalten = SPALTEN.map(inAnfuehrung).join(";");
  const daten = buchungen.map(zeile);
  const text2 = [kopf, spalten, ...daten].join("\r\n") + "\r\n";
  const { bytes, ersetzt } = cp1252(text2);
  return {
    bytes,
    dateiname: `EXTF_Buchungsstapel_${zeitraum.von}-${zeitraum.bis}.csv`,
    saetze: buchungen.length,
    summe: buchungen.reduce((s, b) => s + (b.sollHaben === "H" ? -b.umsatz : b.umsatz), 0),
    uebersprungen,
    ersetzteZeichen: ersetzt
  };
}
function kopfzeile(optionen, now, zeitraum) {
  const felder = [
    inAnfuehrung("EXTF"),
    FORMAT_VERSION,
    FORMAT_KATEGORIE,
    inAnfuehrung(FORMAT_NAME),
    FORMAT_UNTERVERSION,
    zeitstempel(now),
    "",
    // importiert - bleibt leer
    inAnfuehrung("RE"),
    // Herkunft: zwei Zeichen, frei vergeben
    inAnfuehrung(""),
    // exportiert von
    inAnfuehrung(""),
    // importiert von
    optionen.mandant.berater,
    optionen.mandant.mandant,
    datumAcht(optionen.mandant.wirtschaftsjahrBeginn),
    optionen.kontenrahmen.sachkontenlaenge,
    zeitraum.von,
    zeitraum.bis,
    inAnfuehrung(optionen.bezeichnung ?? "Ausgangsrechnungen"),
    inAnfuehrung(""),
    // Diktatkuerzel
    1,
    // Buchungstyp: Finanzbuchfuehrung
    "",
    // Rechnungslegungszweck
    optionen.festschreiben ? 1 : 0,
    inAnfuehrung("EUR")
  ];
  return felder.join(";");
}
function zeile(b) {
  return [
    betrag(b.umsatz),
    inAnfuehrung(b.sollHaben),
    inAnfuehrung("EUR"),
    "",
    // Kurs
    "",
    // Basis-Umsatz
    inAnfuehrung(""),
    // WKZ Basis-Umsatz
    inAnfuehrung(b.konto),
    inAnfuehrung(b.gegenkonto),
    inAnfuehrung(b.buSchluessel),
    b.belegdatum,
    inAnfuehrung(b.belegfeld1),
    inAnfuehrung(""),
    // Belegfeld 2
    "",
    // Skonto
    inAnfuehrung(b.buchungstext.slice(0, 60))
  ].join(";");
}
function buchungstext(rechnung, kategorie, satz) {
  const name = rechnung.buyer.name.trim();
  const mehrere = computeTotals(rechnung).vatBreakdown.length > 1;
  if (!mehrere) return name;
  const zusatz = kategorie === "S" ? `${decimal(satz, 0)} %` : kategorie;
  return `${name} (${zusatz})`;
}
function belegdatum(iso) {
  const [, monat, tag] = iso.split("-");
  return `${tag}${monat}`;
}
function datumAcht(iso) {
  return iso.replace(/-/g, "");
}
function zeitstempel(now) {
  const p = (n, breite = 2) => String(n).padStart(breite, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}${p(now.getMilliseconds(), 3)}`;
}
function betrag(wert) {
  return decimal(Math.abs(wert)).replace(".", ",");
}
function inAnfuehrung(wert) {
  return `"${wert.replace(/"/g, '""')}"`;
}
function zeitraumVon(rechnungen) {
  const daten = rechnungen.map((r) => r.issueDate).sort();
  const heute = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return {
    von: datumAcht(daten[0] ?? heute),
    bis: datumAcht(daten[daten.length - 1] ?? heute)
  };
}

// src/absender/profil.ts
function vereinheitliche(wert) {
  return wert.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function kennungVon(identitaet) {
  const steuer = identitaet.ustId ?? identitaet.steuernummer;
  if (steuer) return `st-${vereinheitliche(steuer)}`;
  const ort = vereinheitliche(`${identitaet.plz} ${identitaet.ort}`);
  return `na-${vereinheitliche(identitaet.name)}-${ort}`;
}
function profilAus(identitaet) {
  return { kennung: kennungVon(identitaet), identitaet };
}
function pruefeZuordnung(profil, herkunft) {
  const zu = herkunft ?? profil.herkunft;
  if (!zu) return { urteil: "ohne-herkunft" };
  return gleicheFirma(profil.identitaet, zu.identitaet) ? { urteil: "passt" } : { urteil: "fremd", gehoertZu: kennungVon(zu.identitaet) };
}
function gleicheFirma(eine, andere) {
  const steuerEine = eine.ustId ?? eine.steuernummer;
  const steuerAndere = andere.ustId ?? andere.steuernummer;
  if (steuerEine && steuerAndere) {
    return vereinheitliche(steuerEine) === vereinheitliche(steuerAndere);
  }
  return vereinheitliche(eine.name) === vereinheitliche(andere.name) && vereinheitliche(`${eine.plz} ${eine.ort}`) === vereinheitliche(`${andere.plz} ${andere.ort}`);
}
function uebernimmBriefpapier(profil, briefpapier, herkunft) {
  const urteil = pruefeZuordnung(profil, herkunft);
  if (urteil.urteil === "fremd") return { fehler: urteil };
  return { profil: { ...profil, briefpapier, herkunft } };
}

// src/parse/ccitt.ts
var WEISS_ENDE = {
  "00110101": 0,
  "000111": 1,
  "0111": 2,
  "1000": 3,
  "1011": 4,
  "1100": 5,
  "1110": 6,
  "1111": 7,
  "10011": 8,
  "10100": 9,
  "00111": 10,
  "01000": 11,
  "001000": 12,
  "000011": 13,
  "110100": 14,
  "110101": 15,
  "101010": 16,
  "101011": 17,
  "0100111": 18,
  "0001100": 19,
  "0001000": 20,
  "0010111": 21,
  "0000011": 22,
  "0000100": 23,
  "0101000": 24,
  "0101011": 25,
  "0010011": 26,
  "0100100": 27,
  "0011000": 28,
  "00000010": 29,
  "00000011": 30,
  "00011010": 31,
  "00011011": 32,
  "00010010": 33,
  "00010011": 34,
  "00010100": 35,
  "00010101": 36,
  "00010110": 37,
  "00010111": 38,
  "00101000": 39,
  "00101001": 40,
  "00101010": 41,
  "00101011": 42,
  "00101100": 43,
  "00101101": 44,
  "00000100": 45,
  "00000101": 46,
  "00001010": 47,
  "00001011": 48,
  "01010010": 49,
  "01010011": 50,
  "01010100": 51,
  "01010101": 52,
  "00100100": 53,
  "00100101": 54,
  "01011000": 55,
  "01011001": 56,
  "01011010": 57,
  "01011011": 58,
  "01001010": 59,
  "01001011": 60,
  "00110010": 61,
  "00110011": 62,
  "00110100": 63
};
var WEISS_ZUSATZ = {
  "11011": 64,
  "10010": 128,
  "010111": 192,
  "0110111": 256,
  "00110110": 320,
  "00110111": 384,
  "01100100": 448,
  "01100101": 512,
  "01101000": 576,
  "01100111": 640,
  "011001100": 704,
  "011001101": 768,
  "011010010": 832,
  "011010011": 896,
  "011010100": 960,
  "011010101": 1024,
  "011010110": 1088,
  "011010111": 1152,
  "011011000": 1216,
  "011011001": 1280,
  "011011010": 1344,
  "011011011": 1408,
  "010011000": 1472,
  "010011001": 1536,
  "010011010": 1600,
  "011000": 1664,
  "010011011": 1728
};
var SCHWARZ_ENDE = {
  "0000110111": 0,
  "010": 1,
  "11": 2,
  "10": 3,
  "011": 4,
  "0011": 5,
  "0010": 6,
  "00011": 7,
  "000101": 8,
  "000100": 9,
  "0000100": 10,
  "0000101": 11,
  "0000111": 12,
  "00000100": 13,
  "00000111": 14,
  "000011000": 15,
  "0000010111": 16,
  "0000011000": 17,
  "0000001000": 18,
  "00001100111": 19,
  "00001101000": 20,
  "00001101100": 21,
  "00000110111": 22,
  "00000101000": 23,
  "00000010111": 24,
  "00000011000": 25,
  "000011001010": 26,
  "000011001011": 27,
  "000011001100": 28,
  "000011001101": 29,
  "000001101000": 30,
  "000001101001": 31,
  "000001101010": 32,
  "000001101011": 33,
  "000011010010": 34,
  "000011010011": 35,
  "000011010100": 36,
  "000011010101": 37,
  "000011010110": 38,
  "000011010111": 39,
  "000001101100": 40,
  "000001101101": 41,
  "000011011010": 42,
  "000011011011": 43,
  "000001010100": 44,
  "000001010101": 45,
  "000001010110": 46,
  "000001010111": 47,
  "000001100100": 48,
  "000001100101": 49,
  "000001010010": 50,
  "000001010011": 51,
  "000000100100": 52,
  "000000110111": 53,
  "000000111000": 54,
  "000000100111": 55,
  "000000101000": 56,
  "000001011000": 57,
  "000001011001": 58,
  "000000101011": 59,
  "000000101100": 60,
  "000001011010": 61,
  "000001100110": 62,
  "000001100111": 63
};
var SCHWARZ_ZUSATZ = {
  "0000001111": 64,
  "000011001000": 128,
  "000011001001": 192,
  "000001011011": 256,
  "000000110011": 320,
  "000000110100": 384,
  "000000110101": 448,
  "0000001101100": 512,
  "0000001101101": 576,
  "0000001001010": 640,
  "0000001001011": 704,
  "0000001001100": 768,
  "0000001001101": 832,
  "0000001110010": 896,
  "0000001110011": 960,
  "0000001110100": 1024,
  "0000001110101": 1088,
  "0000001110110": 1152,
  "0000001110111": 1216,
  "0000001010010": 1280,
  "0000001010011": 1344,
  "0000001010100": 1408,
  "0000001010101": 1472,
  "0000001011010": 1536,
  "0000001011011": 1600,
  "0000001100100": 1664,
  "0000001100101": 1728
};
var GEMEINSAM_ZUSATZ = {
  "00000001000": 1792,
  "00000001100": 1856,
  "00000001101": 1920,
  "000000010010": 1984,
  "000000010011": 2048,
  "000000010100": 2112,
  "000000010101": 2176,
  "000000010110": 2240,
  "000000010111": 2304,
  "000000011100": 2368,
  "000000011101": 2432,
  "000000011110": 2496,
  "000000011111": 2560
};
var MAX_KODELAENGE = 14;
var Bitstrom = class {
  constructor(daten) {
    this.daten = daten;
    this.stelle = 0;
  }
  get amEnde() {
    return this.stelle >= this.daten.length * 8;
  }
  naechstesBit() {
    const byte = this.daten[this.stelle >> 3] ?? 0;
    const bit = byte >> 7 - (this.stelle & 7) & 1;
    this.stelle += 1;
    return bit;
  }
  /** Setzt den Lesezeiger zurueck - noetig, wenn ein Kode nicht aufgeht. */
  zurueck(bits) {
    this.stelle -= bits;
  }
};
function leseLauf(strom, schwarz) {
  let summe = 0;
  for (let runde = 0; runde < 64; runde += 1) {
    let kode = "";
    let gefunden;
    while (kode.length < MAX_KODELAENGE) {
      if (strom.amEnde) return void 0;
      kode += String(strom.naechstesBit());
      const ende = schwarz ? SCHWARZ_ENDE[kode] : WEISS_ENDE[kode];
      if (ende !== void 0) return summe + ende;
      const zusatz = (schwarz ? SCHWARZ_ZUSATZ[kode] : WEISS_ZUSATZ[kode]) ?? GEMEINSAM_ZUSATZ[kode];
      if (zusatz !== void 0) {
        gefunden = zusatz;
        break;
      }
    }
    if (gefunden === void 0) return void 0;
    summe += gefunden;
  }
  return void 0;
}
function entschluesseleCcitt(daten, angaben) {
  const breite = angaben.breite;
  const strom = new Bitstrom(daten);
  const zeilen = [];
  let vorzeile = [];
  let gestoerteZeilen = 0;
  const hoechstens = angaben.hoehe ?? 1e5;
  for (let zeile2 = 0; zeile2 < hoechstens; zeile2 += 1) {
    if (strom.amEnde) break;
    const wechsel = [];
    let a0 = -1;
    let schwarz = false;
    let gestoert = false;
    while (a0 < breite) {
      let b1 = breite;
      let b2 = breite;
      for (let i = 0; i < vorzeile.length; i += 1) {
        const stelle = vorzeile[i];
        if (stelle > a0 && i % 2 === (schwarz ? 1 : 0)) {
          b1 = stelle;
          b2 = vorzeile[i + 1] ?? breite;
          break;
        }
      }
      const modus = leseModus(strom);
      if (!modus) {
        gestoert = true;
        break;
      }
      if (modus.art === "ende") {
        gestoert = wechsel.length === 0;
        break;
      }
      if (modus.art === "pass") {
        a0 = b2;
        continue;
      }
      if (modus.art === "senkrecht") {
        const a12 = Math.max(0, Math.min(breite, b1 + modus.versatz));
        wechsel.push(a12);
        a0 = a12;
        schwarz = !schwarz;
        continue;
      }
      const erster = leseLauf(strom, schwarz);
      const zweiter = leseLauf(strom, !schwarz);
      if (erster === void 0 || zweiter === void 0) {
        gestoert = true;
        break;
      }
      const anfang = a0 < 0 ? 0 : a0;
      const a1 = Math.min(breite, anfang + erster);
      const a2 = Math.min(breite, a1 + zweiter);
      wechsel.push(a1, a2);
      a0 = a2;
    }
    if (gestoert) {
      gestoerteZeilen += 1;
      if (wechsel.length === 0 && zeilen.length > 0) break;
    }
    zeilen.push(wechsel);
    vorzeile = wechsel;
  }
  return { ...zuPunkten(zeilen, breite, angaben.hoehe), gestoerteZeilen };
}
function leseModus(strom) {
  let kode = "";
  while (kode.length < 14) {
    if (strom.amEnde) return kode.length > 0 ? { art: "ende", versatz: 0 } : void 0;
    kode += String(strom.naechstesBit());
    switch (kode) {
      case "1":
        return { art: "senkrecht", versatz: 0 };
      case "011":
        return { art: "senkrecht", versatz: 1 };
      case "010":
        return { art: "senkrecht", versatz: -1 };
      case "001":
        return { art: "waagerecht", versatz: 0 };
      case "0001":
        return { art: "pass", versatz: 0 };
      case "000011":
        return { art: "senkrecht", versatz: 2 };
      case "000010":
        return { art: "senkrecht", versatz: -2 };
      case "0000011":
        return { art: "senkrecht", versatz: 3 };
      case "0000010":
        return { art: "senkrecht", versatz: -3 };
      case "000000000001":
        return { art: "ende", versatz: 0 };
      default:
        break;
    }
  }
  return void 0;
}
function zuPunkten(zeilen, breite, sollhoehe) {
  const hoehe = sollhoehe ?? zeilen.length;
  const punkte = new Uint8Array(breite * hoehe);
  for (let zeile2 = 0; zeile2 < Math.min(hoehe, zeilen.length); zeile2 += 1) {
    const wechsel = zeilen[zeile2];
    const versatz = zeile2 * breite;
    let schwarz = false;
    let stelle = 0;
    for (const wechselstelle of wechsel) {
      const bis = Math.min(breite, wechselstelle);
      if (schwarz) punkte.fill(1, versatz + stelle, versatz + bis);
      stelle = bis;
      schwarz = !schwarz;
    }
    if (schwarz && stelle < breite) punkte.fill(1, versatz + stelle, versatz + breite);
  }
  return { breite, hoehe, punkte };
}

// src/parse/pdf-bilder.ts
import { unzlibSync } from "fflate";
import { PDFArray as PDFArray4, PDFBool, PDFDict as PDFDict5, PDFDocument as PDFDocument6, PDFName as PDFName6, PDFNumber as PDFNumber4, PDFRawStream as PDFRawStream3 } from "pdf-lib";

// src/util/png.ts
import { zlibSync } from "fflate";
var SIGNATUR = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
var CRC_TABELLE = (() => {
  const tabelle = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let wert = i;
    for (let bit = 0; bit < 8; bit += 1) {
      wert = wert & 1 ? 3988292384 ^ wert >>> 1 : wert >>> 1;
    }
    tabelle[i] = wert >>> 0;
  }
  return tabelle;
})();
function crc32(daten) {
  let wert = 4294967295;
  for (const byte of daten) {
    wert = (CRC_TABELLE[(wert ^ byte) & 255] ^ wert >>> 8) >>> 0;
  }
  return (wert ^ 4294967295) >>> 0;
}
function zahl32(wert) {
  return new Uint8Array([wert >>> 24 & 255, wert >>> 16 & 255, wert >>> 8 & 255, wert & 255]);
}
function abschnitt(art, inhalt) {
  const kennung = new Uint8Array([...art].map((zeichen) => zeichen.charCodeAt(0)));
  const koerper = new Uint8Array(kennung.length + inhalt.length);
  koerper.set(kennung);
  koerper.set(inhalt, kennung.length);
  const ganz = new Uint8Array(4 + koerper.length + 4);
  ganz.set(zahl32(inhalt.length));
  ganz.set(koerper, 4);
  ganz.set(zahl32(crc32(koerper)), 4 + koerper.length);
  return ganz;
}
function alsGraustufenPng(breite, hoehe, grau2) {
  if (grau2.length < breite * hoehe) {
    throw new Error(`Zu wenige Bildpunkte: ${grau2.length} statt ${breite * hoehe}`);
  }
  const zeilen = new Uint8Array((breite + 1) * hoehe);
  for (let zeile2 = 0; zeile2 < hoehe; zeile2 += 1) {
    zeilen[zeile2 * (breite + 1)] = 0;
    zeilen.set(grau2.subarray(zeile2 * breite, (zeile2 + 1) * breite), zeile2 * (breite + 1) + 1);
  }
  const kopf = new Uint8Array(13);
  kopf.set(zahl32(breite), 0);
  kopf.set(zahl32(hoehe), 4);
  kopf[8] = 8;
  kopf[9] = 0;
  kopf[10] = 0;
  kopf[11] = 0;
  kopf[12] = 0;
  const teile = [
    SIGNATUR,
    abschnitt("IHDR", kopf),
    abschnitt("IDAT", zlibSync(zeilen, { level: 6 })),
    abschnitt("IEND", new Uint8Array(0))
  ];
  const gesamt = new Uint8Array(teile.reduce((summe, teil) => summe + teil.length, 0));
  let stelle = 0;
  for (const teil of teile) {
    gesamt.set(teil, stelle);
    stelle += teil.length;
  }
  return gesamt;
}
function maskeAlsGrau(punkte) {
  const grau2 = new Uint8Array(punkte.length);
  for (let i = 0; i < punkte.length; i += 1) grau2[i] = punkte[i] ? 0 : 255;
  return grau2;
}

// src/parse/pdf-bilder.ts
var GANZSEITIG_AB = 0.5;
function zahl3(dict, name) {
  return dict.lookupMaybe(PDFName6.of(name), PDFNumber4)?.asNumber();
}
function filterkette(dict) {
  const roh = dict.lookup(PDFName6.of("Filter"));
  if (roh instanceof PDFName6) return [roh.asString()];
  if (roh instanceof PDFArray4) {
    return roh.asArray().map((eintrag) => String(eintrag));
  }
  return [];
}
function decodeParms(doc, dict) {
  const roh = dict.lookup(PDFName6.of("DecodeParms"));
  if (roh instanceof PDFDict5) return roh;
  if (roh instanceof PDFArray4) {
    for (const eintrag of roh.asArray()) {
      const aufgeloest = doc.context.lookup(eintrag);
      if (aufgeloest instanceof PDFDict5) return aufgeloest;
    }
  }
  return void 0;
}
function packeAus(bytes, kette) {
  let daten = bytes;
  let stelle = 0;
  while (stelle < kette.length && kette[stelle] === "/FlateDecode") {
    try {
      daten = unzlibSync(daten);
    } catch {
      return { rest: kette.slice(stelle), bytes: daten };
    }
    stelle += 1;
  }
  return { rest: kette.slice(stelle), bytes: daten };
}
async function liesSeitenbilder(bytes, seite = 0) {
  const doc = await PDFDocument6.load(bytes, { throwOnInvalidObject: false });
  const blatt = doc.getPage(seite);
  const { width: seitenbreite, height: seitenhoehe } = blatt.getSize();
  const xobjekte = blatt.node.Resources()?.lookupMaybe(PDFName6.of("XObject"), PDFDict5);
  if (!xobjekte) return [];
  const bilder = [];
  for (const [name] of xobjekte.asMap()) {
    const strom = xobjekte.lookup(name);
    if (!(strom instanceof PDFRawStream3)) continue;
    const dict = strom.dict;
    if (dict.lookupMaybe(PDFName6.of("Subtype"), PDFName6)?.asString() !== "/Image") continue;
    const breite = zahl3(dict, "Width") ?? 0;
    const hoehe = zahl3(dict, "Height") ?? 0;
    if (breite < 1 || hoehe < 1) continue;
    const istMaske = dict.lookup(PDFName6.of("ImageMask")) instanceof PDFBool;
    const { rest, bytes: roh } = packeAus(strom.contents, filterkette(dict));
    const schluessel2 = name.asString().replace(/^\//, "");
    const deckung = Math.min(
      1,
      breite * hoehe / Math.max(1, seitenbreite * seitenhoehe * 9)
    );
    if (rest[0] === "/DCTDecode") {
      bilder.push({ name: schluessel2, art: "jpeg", bytes: roh, breite, hoehe, istMaske, deckung });
      continue;
    }
    if (rest[0] === "/CCITTFaxDecode") {
      const parms = decodeParms(doc, dict);
      const k = parms ? zahl3(parms, "K") ?? 0 : 0;
      if (k >= 0) continue;
      const bild = entschluesseleCcitt(roh, {
        breite: parms ? zahl3(parms, "Columns") ?? breite : breite,
        hoehe
      });
      bilder.push({
        name: schluessel2,
        art: "png",
        bytes: alsGraustufenPng(bild.breite, bild.hoehe, maskeAlsGrau(bild.punkte)),
        breite: bild.breite,
        hoehe: bild.hoehe,
        istMaske,
        deckung
      });
      continue;
    }
    if (rest.length === 0 && !istMaske && zahl3(dict, "BitsPerComponent") === 8) {
      const erwartet = breite * hoehe;
      if (roh.length >= erwartet) {
        bilder.push({
          name: schluessel2,
          art: "png",
          bytes: alsGraustufenPng(breite, hoehe, roh.subarray(0, erwartet)),
          breite,
          hoehe,
          istMaske,
          deckung
        });
      }
    }
  }
  return bilder.sort((eins, zwei) => bewertung(zwei) - bewertung(eins));
}
function bewertung(bild) {
  const ganzseitig = bild.deckung >= GANZSEITIG_AB;
  return (bild.istMaske && ganzseitig ? 3e6 : 0) + (ganzseitig ? 1e6 : 0) + bild.breite * bild.hoehe;
}

// src/absender/anschrift.ts
function anschriftenAus(papier) {
  return findeStammdaten(zeilenImBogen(papier)).anschriften.map((anschrift) => {
    const wert = (feld) => anschrift.felder.find((f) => f.feld === feld)?.wert;
    const name = wert("name");
    const plz = wert("plz");
    const ort = wert("ort");
    if (!name || !plz || !ort) return void 0;
    return {
      identitaet: {
        name,
        plz,
        ort,
        ...wert("ustId") ? { ustId: wert("ustId") } : {},
        ...wert("steuernummer") ? { steuernummer: wert("steuernummer") } : {}
      },
      beleg: anschrift.beleg.join(" \xB7 ")
    };
  }).filter((eintrag) => Boolean(eintrag));
}

// src/pdf/schriftbogen.ts
import { PDFDict as PDFDict6, PDFDocument as PDFDocument7, PDFName as PDFName7, PDFObjectCopier as PDFObjectCopier2, PDFRef as PDFRef2 } from "pdf-lib";
async function schriftbogenAus(quelle, papier, quellseite = 0) {
  const gebraucht = new Set(papier.laeufe.map((lauf) => lauf.schrift));
  if (gebraucht.size === 0) return void 0;
  let quellDoc;
  try {
    quellDoc = await PDFDocument7.load(quelle, { throwOnInvalidObject: false });
  } catch {
    return void 0;
  }
  const quellSchriften = quellDoc.getPage(quellseite).node.Resources()?.lookupMaybe(PDFName7.of("Font"), PDFDict6);
  if (!quellSchriften) return void 0;
  const ziel = await PDFDocument7.create();
  const kopierer = PDFObjectCopier2.for(quellDoc.context, ziel.context);
  const seite = ziel.addPage([1, 1]);
  let gefunden = 0;
  for (const name of gebraucht) {
    const verweis = quellSchriften.get(PDFName7.of(name));
    if (!verweis) continue;
    const kopie = kopierer.copy(verweis);
    const ref = kopie instanceof PDFRef2 ? kopie : ziel.context.register(kopie);
    seite.node.setFontDictionary(PDFName7.of(name), ref);
    gefunden += 1;
  }
  if (gefunden === 0) return void 0;
  ziel.setCreationDate(/* @__PURE__ */ new Date(0));
  ziel.setModificationDate(/* @__PURE__ */ new Date(0));
  return ziel.save({ useObjectStreams: false });
}

// src/absender/bogendatei.ts
var BOGENDATEI_ART = "erechnung-briefbogen";
var BOGENDATEI_FASSUNG = 1;
function alsBogendatei(quelle, heute) {
  if (!quelle.briefpapier || !quelle.briefpapierHerkunft) return void 0;
  return {
    art: BOGENDATEI_ART,
    fassung: BOGENDATEI_FASSUNG,
    erzeugtAm: heute,
    ...quelle.bezeichnung ? { bezeichnung: quelle.bezeichnung } : {},
    herkunft: quelle.briefpapierHerkunft,
    briefpapier: quelle.briefpapier,
    ...quelle.beschriftungen && Object.keys(quelle.beschriftungen).length > 0 ? { beschriftungen: quelle.beschriftungen } : {},
    ...quelle.kennzahlen ? { kennzahlen: quelle.kennzahlen } : {},
    ...quelle.vorlage ? { vorlage: quelle.vorlage } : {},
    ...quelle.schriftRegular ? {
      schrift: {
        ...quelle.schriftName ? { name: quelle.schriftName } : {},
        regular: quelle.schriftRegular,
        ...quelle.schriftFett ? { fett: quelle.schriftFett } : {},
        ...quelle.schriftKraeftig ? { kraeftig: quelle.schriftKraeftig } : {}
      }
    } : {}
  };
}
function liesBogendatei(text2, eigene) {
  let roh;
  try {
    roh = JSON.parse(text2);
  } catch {
    return { mangel: "kein-json" };
  }
  if (!roh || typeof roh !== "object") return { mangel: "kein-json" };
  const kandidat = roh;
  if (kandidat.art !== BOGENDATEI_ART) return { mangel: "fremde-art" };
  if (typeof kandidat.fassung !== "number" || kandidat.fassung > BOGENDATEI_FASSUNG) {
    return { mangel: "zu-neu" };
  }
  const papier = kandidat.briefpapier;
  if (!kandidat.herkunft?.identitaet || !papier || !Array.isArray(papier.pfade) || !Array.isArray(papier.texte) || !papier.seite || !(papier.seite.breite > 0) || !(papier.seite.hoehe > 0)) {
    return { mangel: "unvollstaendig" };
  }
  return {
    datei: kandidat,
    zuordnung: pruefeZuordnung(
      { kennung: kennungVon(eigene), identitaet: eigene },
      kandidat.herkunft
    )
  };
}
function bogenmangelText(mangel) {
  switch (mangel) {
    case "kein-json":
      return "Die Datei lie\xDF sich nicht lesen. Erwartet wird eine Briefbogendatei, wie sie diese App schreibt.";
    case "fremde-art":
      return "Das ist keine Briefbogendatei dieser App.";
    case "zu-neu":
      return "Die Datei stammt aus einer neueren Fassung der App. Bitte aktualisieren Sie, statt sie hier zu deuten.";
    case "unvollstaendig":
      return "Der Datei fehlen Angaben \u2014 Briefbogen oder Absender. \xDCbernommen wird sie nicht.";
  }
}

// src/pdf/eigenschrift.ts
import fontkit4 from "@pdf-lib/fontkit";
var RECHNUNGSZEICHEN = `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\xE4\xF6\xFC\xC4\xD6\xDC\xDF0123456789 .,;:!?-\u2013/()[]%&+*=@\u20AC\xA7#"'`;
var MAX_SCHRIFT_BYTES = 2 * 1024 * 1024;
function pruefeSchrift(bytes) {
  if (bytes.length > MAX_SCHRIFT_BYTES) {
    return {
      name: "",
      zeichen: 0,
      fehlend: "",
      mangel: "zu-gross"
    };
  }
  let schrift;
  try {
    schrift = fontkit4.create(bytes);
  } catch {
    return { name: "", zeichen: 0, fehlend: "", mangel: "unlesbar" };
  }
  const vorrat = new Set(schrift.characterSet ?? []);
  if (vorrat.size === 0) {
    return { name: "", zeichen: 0, fehlend: "", mangel: "keine-umrisse" };
  }
  const name = schrift.familyName ?? schrift.fullName ?? "";
  const fehlend = [...RECHNUNGSZEICHEN].filter((zeichen) => {
    const nummer = zeichen.codePointAt(0);
    return nummer !== void 0 && !vorrat.has(nummer);
  }).join("");
  return {
    name,
    zeichen: vorrat.size,
    fehlend,
    ...fehlend.length > 0 ? { mangel: "zeichen-fehlen" } : {}
  };
}
var SCHNITTWOERTER = [
  "extralight",
  "ultralight",
  "semilight",
  "demilight",
  "extrabold",
  "ultrabold",
  "semibold",
  "demibold",
  "extrablack",
  "italic",
  "oblique",
  "medium",
  "regular",
  "normal",
  "light",
  "black",
  "heavy",
  "thin",
  "book",
  "bold",
  "roman",
  "text"
];
function familienkern(name) {
  let kern = name.toLowerCase();
  for (const wort of SCHNITTWOERTER) kern = kern.split(wort).join(" ");
  return kern.replace(/[^a-z0-9]+/g, "");
}
function pruefeSchriftpaar(regular, fett) {
  const einer = pruefeSchrift(regular);
  if (!fett) return { regular: einer, ...einer.mangel ? { mangel: einer.mangel } : {} };
  const zwei = pruefeSchrift(fett);
  const kernEins = familienkern(einer.name);
  const kernZwei = familienkern(zwei.name);
  const verschieden = !einer.mangel && !zwei.mangel && kernEins.length > 0 && kernZwei.length > 0 && kernEins !== kernZwei;
  const mangel = einer.mangel ?? zwei.mangel ?? (verschieden ? "schnitte-verschieden" : void 0);
  return { regular: einer, fett: zwei, ...mangel ? { mangel } : {} };
}
function schriftmangelText(befund) {
  const fehlend = [befund.regular.fehlend, befund.fett?.fehlend ?? ""].join("");
  switch (befund.mangel) {
    case void 0:
      return void 0;
    case "unlesbar":
      return "Die Datei lie\xDF sich nicht als Schrift lesen. Gebraucht wird eine TrueType- oder OpenType-Datei (.ttf oder .otf).";
    case "zu-gross":
      return `Die Datei ist gr\xF6\xDFer als ${Math.round(MAX_SCHRIFT_BYTES / 1024 / 1024)} MB. Sie steckt in jeder erzeugten Rechnung \u2014 das w\xE4ren sehr gro\xDFe Dateien.`;
    case "keine-umrisse":
      return "Die Datei enth\xE4lt keine lesbaren Zeichen. Schriftsammlungen (.ttc) und Bitmapschriften lassen sich nicht einbetten.";
    case "schnitte-verschieden":
      return `Magerer und fetter Schnitt stammen aus verschiedenen Familien ("${befund.regular.name}" und "${befund.fett?.name}"). Auf der Rechnung st\xFCnde eine Auszeichnung aus einer fremden Schrift.`;
    case "zeichen-fehlen":
      return `Der Schrift fehlen Zeichen, die auf einer Rechnung vorkommen: ${[...new Set(fehlend)].join(" ")}. Stammt die Datei aus einem PDF? Dort ist meist nur eine Teilmenge eingebettet.`;
  }
}

// src/absender/vorlage.ts
var MM2 = 2.834645669;
var WENDUNGEN2 = [
  { feld: "rechnungsnummer", muster: /Rechnungs?\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: "kundennummer", muster: /Kunden\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: "rechnungsdatum", muster: /Rechnungs\s*-?\s*datum\s*:?/i },
  { feld: "leistungsdatum", muster: /(?:Liefer|Leistungs)\s*-?\s*datum\s*:?/i },
  { feld: "leistungszeitraum", muster: /Leistungs\s*-?\s*zeitraum\s*:?/i },
  { feld: "faelligAm", muster: /(?:F(?:ä|ae)llig(?:\s+am)?|Zahlbar\s+bis)\s*:?/i },
  { feld: "bestellnummer", muster: /(?:Bestell|Auftrags)\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: "projekt", muster: /Projekt(?:\s*-?\s*(?:Nr\.?|Nummer))?\s*:?/i },
  { feld: "pos", muster: /^Pos(?:\.|ition)?\s*:?$/i },
  { feld: "bezeichnung", muster: /^(?:Bezeichnung|Beschreibung|Leistung|Artikel)\s*:?$/i },
  { feld: "menge", muster: /^(?:Menge|Anzahl)\s*:?$/i },
  { feld: "einzelpreis", muster: /^(?:Einzelpreis|Einzel|E-Preis)\s*:?$/i },
  { feld: "betrag", muster: /^(?:Betrag|Gesamtpreis|Gesamt|Summe)\s*:?$/i },
  /*
   * Der Summenblock. "netto" trennt die Zwischensumme von der Endsumme -
   * ohne das Merkmal faengt "Gesamtbetrag netto" beide, und der Block bekaeme
   * zweimal dasselbe Wort.
   */
  {
    feld: "zwischensummeNetto",
    muster: /^(?:Zwischensumme|Gesamtbetrag|Nettosumme|Nettobetrag|Summe)\s+netto\b/i
  },
  {
    feld: "gesamtbetrag",
    muster: /^(?:(?:Ü|Ue)berweisungsbetrag|Rechnungsbetrag|Rechnungssumme|Zahlbetrag|Endbetrag|Gesamtbetrag)(?!\s+netto)/i
  },
  /*
   * Das Steuerkuerzel steht nicht am Anfang, sondern mitten in der Zeile:
   * "zzgl. 19 % MwSt.". Deshalb hier ausdruecklich ueberall erlaubt - die
   * Regel, dass eine Beschriftung vorn steht, gilt fuer Beschriftungen, und
   * das hier ist eine Abkuerzung innerhalb einer.
   */
  { feld: "steuerkuerzel", muster: /(?:MwSt\.?|USt\.?)(?=\s|$)/i, ueberall: true }
];
var QUER_AB = 3;
var MAX_STUECK = 60;
function schlageVorlageVor(seite, seitenhoehe, inhaltLinks2) {
  const beschriftungen = {};
  const belege = /* @__PURE__ */ new Set();
  const querzaehler = /* @__PURE__ */ new Map();
  const stellen = /* @__PURE__ */ new Map();
  const hoehen = /* @__PURE__ */ new Map();
  const kanten = /* @__PURE__ */ new Map();
  const schnitte = /* @__PURE__ */ new Map();
  const fett = /* @__PURE__ */ new Set();
  let nebeneinander = 0;
  for (const zeile2 of seite.zeilen) {
    for (const stueck of zeile2.stuecke) {
      for (const { feld, muster, ueberall } of WENDUNGEN2) {
        if (beschriftungen[feld]) continue;
        const inhalt = stueck.text.trim();
        if (inhalt.length > MAX_STUECK) continue;
        const treffer = muster.exec(inhalt);
        if (!treffer || treffer.index !== 0 && !ueberall) continue;
        const wort = treffer[0].trim();
        if (!istBrauchbareBeschriftung(wort)) continue;
        beschriftungen[feld] = wort;
        stellen.set(feld, stueck.x);
        hoehen.set(feld, zeile2.y);
        kanten.set(feld, stueck.x + stueck.breite);
        schnitte.set(feld, stueck.schnitt);
        if (stueck.fett) fett.add(feld);
        if (KENNZAHLENFELDER.has(feld) && inhalt.slice(wort.length).trim().length > 0) {
          nebeneinander += 1;
        }
        belege.add(zeile2.text);
      }
    }
    const inZeile = WENDUNGEN2.filter(
      ({ feld, muster }) => KENNZAHLENFELDER.has(feld) && zeile2.stuecke.some((stueck) => {
        const inhalt = stueck.text.trim();
        if (inhalt.length > MAX_STUECK) return false;
        const treffer = muster.exec(inhalt);
        return treffer?.index === 0;
      })
    ).length;
    if (inZeile > 0) querzaehler.set(zeile2.y, inZeile);
  }
  const kopffelder = [
    "pos",
    "bezeichnung",
    "menge",
    "einzelpreis",
    "betrag"
  ];
  return {
    beschriftungen,
    tabellenkopf: kopffelder.some((feld) => beschriftungen[feld]),
    kennzahlenfelder: [...KENNZAHLENFELDER].filter((feld) => beschriftungen[feld]).sort((eins, zwei) => (stellen.get(eins) ?? 0) - (stellen.get(zwei) ?? 0)),
    ...nebeneinander > 0 ? { kennzahlenInline: true } : {},
    kennzahlenFett: [...KENNZAHLENFELDER].filter((feld) => fett.has(feld)),
    ...erkennePositionen(seite, inhaltLinks2, summenkante(hoehen)),
    ...erkenneAnker(seite, hoehen, stellen),
    ...erkenneSummenkante(kanten),
    ...erkenneSchnitte(seite, schnitte),
    ...erkenneDatumsform(seite),
    ...erkenneSteuergrundlage(seite),
    ...erkenneStellung(querzaehler, seitenhoehe) ?? {},
    belege: [...belege]
  };
}
function erkenneDatumsform(seite) {
  for (const zeile2 of seite.zeilen) {
    const treffer = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/.exec(zeile2.text);
    if (!treffer) continue;
    const tag = treffer[1] ?? "";
    const monat = treffer[2] ?? "";
    if (Number(tag) < 10 || Number(monat) < 10) {
      return { datumOhneNullen: tag.length === 1 || monat.length === 1 };
    }
  }
  return {};
}
function erkenneSteuergrundlage(seite) {
  for (const zeile2 of seite.zeilen) {
    if (!/\d+([.,]\d+)?\s*%\s*(?:MwSt|USt)/i.test(zeile2.text)) continue;
    return {
      steuergrundlage: /(?:MwSt|USt)\.?\s*(?:auf|von)\s+[\d.]+,\d{2}/i.test(zeile2.text)
    };
  }
  return {};
}
function schalterAusVorschlag(vorschlag) {
  return {
    tabellenkopf: vorschlag.tabellenkopf,
    /*
     * Nummeriert wird nur, wenn die Vorlage eine Positionsbeschriftung fuehrt.
     * Ihre fehlt, weil bei einer Position eine Ziffer davor nichts beitraegt.
     */
    positionsnummern: Boolean(vorschlag.beschriftungen.pos),
    ...vorschlag.kennzahlenfelder.length > 0 ? { kennzahlenfelder: vorschlag.kennzahlenfelder } : {},
    ...vorschlag.kennzahlenInline !== void 0 ? { kennzahlenInline: vorschlag.kennzahlenInline } : {},
    ...vorschlag.kennzahlenFett.length > 0 ? { kennzahlenFett: vorschlag.kennzahlenFett } : {},
    ...vorschlag.positionsEinzug !== void 0 ? { positionsEinzug: vorschlag.positionsEinzug } : {},
    ...vorschlag.positionsauszeichnung !== void 0 ? { positionsauszeichnung: vorschlag.positionsauszeichnung } : {},
    ...vorschlag.betragUnten !== void 0 ? { betragUnten: vorschlag.betragUnten } : {},
    ...vorschlag.datumOhneNullen !== void 0 ? { datumOhneNullen: vorschlag.datumOhneNullen } : {},
    ...vorschlag.steuergrundlage !== void 0 ? { steuergrundlage: vorschlag.steuergrundlage } : {},
    ...vorschlag.kennzahlenOben !== void 0 ? { kennzahlenOben: vorschlag.kennzahlenOben } : {},
    ...vorschlag.textOben !== void 0 ? { textOben: vorschlag.textOben } : {},
    ...vorschlag.kennzahlenSpalten ? { kennzahlenSpalten: vorschlag.kennzahlenSpalten } : {},
    ...vorschlag.summenlabelRechts !== void 0 ? { summenlabelRechts: vorschlag.summenlabelRechts } : {},
    ...vorschlag.summenlabelKraeftig !== void 0 ? { summenlabelKraeftig: vorschlag.summenlabelKraeftig } : {}
  };
}
function erkenneAnker(seite, hoehen, stellen) {
  const kennzahlen = [...KENNZAHLENFELDER].map((feld) => hoehen.get(feld)).filter((hoehe) => hoehe !== void 0);
  if (kennzahlen.length === 0) return {};
  const oben = Math.max(...kennzahlen);
  const unterste = Math.min(...kennzahlen);
  const spalten = {};
  for (const feld of KENNZAHLENFELDER) {
    const x = stellen.get(feld);
    if (x !== void 0) spalten[feld] = rund(x);
  }
  const text2 = seite.zeilen.filter((zeile2) => zeile2.y < unterste - 0.5 && zeile2.text.trim().length > 0).sort((eins, zwei) => zwei.y - eins.y)[0];
  return {
    kennzahlenOben: rund(oben),
    ...Object.keys(spalten).length > 0 ? { kennzahlenSpalten: spalten } : {},
    ...text2 ? { textOben: rund(text2.y) } : {}
  };
}
var rund = (wert) => Math.round(wert * 100) / 100;
var SUMMENWOERTER = [
  "zwischensummeNetto",
  "steuerkuerzel",
  "gesamtbetrag"
];
function summenkante(hoehen) {
  const gefunden = SUMMENWOERTER.map((feld) => hoehen.get(feld)).filter(
    (hoehe) => hoehe !== void 0
  );
  return gefunden.length > 0 ? Math.max(...gefunden) : void 0;
}
var BETRAGSENDE = /\d[\d.]*,\d{2}(?:\s+\p{L}+\.?)?\s*$/u;
function erkennePositionen(seite, inhaltLinks2, kante) {
  if (inhaltLinks2 === void 0 || kante === void 0) return {};
  const linksVon = (zeile2) => zeile2.stuecke.filter((stueck) => stueck.text.trim().length > 0)[0]?.x;
  let spalte = Infinity;
  let betragszeile = Infinity;
  for (const zeile2 of seite.zeilen) {
    if (zeile2.y <= kante || !BETRAGSENDE.test(zeile2.text)) continue;
    const x = linksVon(zeile2);
    if (x !== void 0 && x < spalte) spalte = x;
    if (zeile2.y < betragszeile) betragszeile = zeile2.y;
  }
  if (!Number.isFinite(spalte)) return {};
  const einzug = spalte - inhaltLinks2;
  const brauchbar = einzug > 2 && einzug <= 80;
  let fett = false;
  let unterste = Infinity;
  for (const zeile2 of seite.zeilen) {
    if (zeile2.y <= kante) continue;
    const erstes = zeile2.stuecke.filter((stueck) => stueck.text.trim().length > 0)[0];
    if (!erstes || Math.abs(erstes.x - spalte) >= 1) continue;
    if (erstes.fett) fett = true;
    if (zeile2.y < unterste) unterste = zeile2.y;
  }
  const betragUnten = Number.isFinite(unterste) ? Math.abs(betragszeile - unterste) < 0.5 : void 0;
  return {
    ...brauchbar ? { positionsEinzug: rund(einzug) } : {},
    positionsauszeichnung: fett,
    ...betragUnten !== void 0 ? { betragUnten } : {}
  };
}
function erkenneSummenkante(kanten) {
  const gefunden = SUMMENWOERTER.map((feld) => kanten.get(feld)).filter(
    (kante) => kante !== void 0
  );
  return gefunden.length >= 2 ? { summenlabelRechts: rund(Math.max(...gefunden)) } : {};
}
function erkenneSchnitte(seite, schnitte) {
  const zaehler = /* @__PURE__ */ new Map();
  const alle = /* @__PURE__ */ new Set();
  for (const zeile2 of seite.zeilen) {
    for (const stueck of zeile2.stuecke) {
      if (stueck.schnitt.length === 0 || stueck.text.trim().length === 0) continue;
      alle.add(stueck.schnitt);
      if (stueck.fett) continue;
      zaehler.set(stueck.schnitt, (zaehler.get(stueck.schnitt) ?? 0) + stueck.text.length);
    }
  }
  if (alle.size === 0) return {};
  const grund = [...zaehler.entries()].sort((eins, zwei) => zwei[1] - eins[1])[0]?.[0];
  const beschriftung = SUMMENWOERTER.map((feld) => schnitte.get(feld)).find(
    (name) => name !== void 0 && name.length > 0
  );
  return {
    schnitte: [...alle].sort(),
    ...grund && beschriftung && beschriftung !== grund ? { summenlabelKraeftig: true } : {}
  };
}
var KENNZAHLENFELDER = /* @__PURE__ */ new Set([
  "rechnungsnummer",
  "rechnungsdatum",
  "leistungsdatum",
  "faelligAm",
  "kundennummer",
  "bestellnummer"
]);
function erkenneStellung(querzaehler, seitenhoehe) {
  if (querzaehler.size === 0) return void 0;
  const quer = [...querzaehler.entries()].find(([, zahl4]) => zahl4 >= QUER_AB);
  if (quer) return { kennzahlen: "unter-anschrift" };
  const anschriftOben = seitenhoehe - 45 * MM2;
  const hoechste = Math.max(...querzaehler.keys());
  return {
    kennzahlen: hoechste > anschriftOben + 30 ? "ueber-anschrift" : "neben-anschrift"
  };
}

// src/pdf/stellungspruefung.ts
var MELDESCHWELLE = 0.05;
var ueberlappung = (eins, zwei) => {
  const breite = Math.min(eins.x2, zwei.x2) - Math.max(eins.x1, zwei.x1);
  const hoehe = Math.min(eins.y2, zwei.y2) - Math.max(eins.y1, zwei.y1);
  return breite > 0 && hoehe > 0 ? breite * hoehe : 0;
};
function belegteFlaechen(papier) {
  const versatzX = (A4.width - papier.seite.breite) / 2;
  const versatzY = (A4.height - papier.seite.hoehe) / 2;
  const flaechen = papier.pfade.map((pfad) => ({
    x1: pfad.rahmen.x1 + versatzX,
    y1: pfad.rahmen.y1 + versatzY,
    x2: pfad.rahmen.x2 + versatzX,
    y2: pfad.rahmen.y2 + versatzY
  }));
  for (const text2 of papier.texte) {
    flaechen.push({
      x1: text2.x + versatzX,
      y1: text2.y + versatzY - text2.groesse * 0.25,
      x2: text2.x + Math.max(text2.breite, 1) + versatzX,
      y2: text2.y + versatzY + text2.groesse * 0.85
    });
  }
  return flaechen;
}
function pruefeStellung(papier, stellung, zeilen, flaechen = belegteFlaechen(papier)) {
  const versatzY = (A4.height - papier.seite.hoehe) / 2;
  const block = kennzahlenrahmen(
    stellung,
    Math.max(1, zeilen),
    void 0,
    papier.grenze + versatzY - 11
  );
  const blockflaeche = Math.max(1, (block.x2 - block.x1) * (block.y2 - block.y1));
  let groesste = 0;
  let summe = 0;
  for (const flaeche of flaechen) {
    const wert = ueberlappung(block, flaeche);
    if (wert > groesste) groesste = wert;
    summe += wert;
  }
  const anteil = Math.min(1, summe / blockflaeche);
  return {
    stellung,
    frei: anteil < MELDESCHWELLE,
    ueberschneidung: groesste,
    anteil,
    rahmen: block
  };
}
var ALLE = ["neben-anschrift", "ueber-anschrift", "unter-anschrift"];
function pruefeAlleStellungen(papier, zeilen) {
  const flaechen = belegteFlaechen(papier);
  return ALLE.map((stellung) => pruefeStellung(papier, stellung, zeilen, flaechen)).sort(
    (eins, zwei) => eins.anteil - zwei.anteil
  );
}

// src/index.ts
function buildInvoiceXml(invoice) {
  const totals = computeTotals(invoice);
  switch (invoice.profile) {
    case "xrechnung-ubl":
      return {
        xml: buildUbl(invoice, { totals }),
        filename: `${invoice.number}-xrechnung-ubl.xml`
      };
    case "xrechnung-cii":
      return {
        xml: buildCii(invoice, { totals }),
        filename: `${invoice.number}-xrechnung-cii.xml`
      };
    default:
      return { xml: buildCii(invoice, { totals }), filename: "factur-x.xml" };
  }
}
export {
  A4,
  AddressSchema,
  AllowanceChargeSchema,
  AttachmentSchema,
  BOGENDATEI_ART,
  BOGENDATEI_FASSUNG,
  BUNDLED_SPECIFICATIONS,
  ContactSchema,
  DEFAULT_THEME,
  EAS,
  EInvoiceError,
  ElectronicAddressSchema,
  INVOICE_TYPE_CODES,
  InvoiceProfileSchema,
  InvoiceSchema,
  LineSchema,
  MAX_SCHRIFT_BYTES,
  PAYMENT_MEANS,
  PRODUKTE,
  PROFILE_ID,
  PartySchema,
  PaymentSchema,
  RECHNUNGSZEICHEN,
  ROLLEN,
  SKR03,
  SKR04,
  STANDARD_BESCHRIFTUNGEN,
  SpecificationError,
  UNIT,
  VAT_CATEGORY,
  VORLAGEN,
  VatSchema,
  XmlWriter,
  ZERO_RATE_CATEGORIES,
  ZeichenvorratFehler,
  abgewandelt,
  activeSpecifications,
  addDays,
  alsBogendatei,
  alsGraustufenPng,
  alsHex,
  alsSvg,
  anschlussBis,
  anschriftenAus,
  bankverbindungImBogen,
  belegteFlaechen,
  beschriftungenMit,
  bogenmangelText,
  buildCii,
  buildDatevBuchungsstapel,
  buildInvoiceXml,
  buildUbl,
  buildXmp,
  computeTotals,
  cp1252,
  decimal,
  detectKind,
  entschluesseleCcitt,
  erzeugeSchluesselpaar,
  escapeXml,
  euroText,
  extractAttachments,
  extractInvoiceXml,
  familienkern,
  farbeAusHex,
  findeFussgrenze,
  findeGrenze,
  findeStammdaten,
  findeStrichstaerken,
  findeZahlungsklausel,
  folgedokument,
  formatAmount,
  formatDate,
  formatQuantity,
  fromBase64,
  isIsoDate,
  isPlausibleIban,
  isPlausibleLeitwegId,
  isPlausibleVatId,
  istBrauchbareBeschriftung,
  istDebitorennummer,
  istKleinunternehmerRechnung,
  istPng,
  istProdukt,
  kennungVon,
  kennzahlenrahmen,
  laufbreite,
  laufzeitBis,
  liefereBreiten,
  liesBogendatei,
  liesBriefpapier,
  liesPdfText,
  liesSeitenbilder,
  liesWordDokument,
  lineNetAmount,
  maskeAlsGrau,
  nurAbweichungen,
  ohneUnsichtbare,
  parseInvoice,
  parseInvoiceXml,
  parseSpecificationSet,
  pngFarbtyp,
  positionenAus,
  profilAus,
  pruefeAlleStellungen,
  pruefeDienstadresse,
  pruefeSchluessel,
  pruefeSchrift,
  pruefeSchriftpaar,
  pruefeStellung,
  pruefeZuordnung,
  readEInvoice,
  renderZugferdPdf,
  resetSpecifications,
  round,
  sanitizeXmlText,
  schalterAusVorschlag,
  schlageKopfzeileVor,
  schlageVorlageVor,
  schlageZuordnungVor,
  schriftbogenAus,
  schriftenImBriefkopf,
  schriftmangelText,
  setActiveSpecifications,
  setzeMitVorlagenschrift,
  signaturVon,
  specificationAge,
  stelleSchluesselAus,
  steuerfallFuer,
  sum,
  summarizeTotals,
  tabelleAusZeilen,
  themaMitAkzent,
  toBase64,
  toCiiDate,
  uebernimmBriefpapier,
  utf8Decode,
  utf8Encode,
  validateInvoice,
  wrapText,
  xmpDate,
  zahlAus,
  zahlungsklauselImBogen,
  zeichneBriefpapier,
  zeilenImBogen
};
