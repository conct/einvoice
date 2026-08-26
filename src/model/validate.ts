import type { Invoice, Party } from './invoice';
import { computeTotals } from './totals';
import { ZERO_RATE_CATEGORIES } from './codes';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  /** Regelkennung der EN 16931 bzw. der XRechnung-CIUS, z.B. "BR-DE-15" */
  rule: string;
  severity: Severity;
  /** Betroffenes Feld im Datenmodell, Punktnotation */
  path: string;
  message: string;
}

export interface ValidationResult {
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
export function validateInvoice(invoice: Invoice): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (rule: string, severity: Severity, path: string, message: string) =>
    issues.push({ rule, severity, path, message });

  const isXRechnung = invoice.profile !== 'zugferd-en16931';

  // --- Dokumentkopf ---------------------------------------------------------
  if (!invoice.number) add('BR-02', 'error', 'number', 'Die Rechnungsnummer fehlt.');
  if (!invoice.issueDate) add('BR-03', 'error', 'issueDate', 'Das Rechnungsdatum fehlt.');
  if (!invoice.typeCode) add('BR-04', 'error', 'typeCode', 'Der Rechnungstyp fehlt.');
  if (!invoice.currency) add('BR-05', 'error', 'currency', 'Die Währung fehlt.');
  if (invoice.lines.length === 0) {
    add('BR-16', 'error', 'lines', 'Die Rechnung enthält keine Position.');
  }

  const ALLOWED_TYPE_CODES = ['326', '380', '381', '384', '386', '389', '875', '876', '877'];
  if (!ALLOWED_TYPE_CODES.includes(invoice.typeCode)) {
    add('BR-DE-17', 'error', 'typeCode', `Rechnungstyp ${invoice.typeCode} ist nicht zugelassen.`);
  }
  if ((invoice.typeCode === '384' || invoice.typeCode === '381') && !invoice.precedingInvoice) {
    add(
      'BR-55',
      'warning',
      'precedingInvoice',
      'Korrektur und Storno sollten die urspruengliche Rechnung referenzieren.',
    );
  }
  if (invoice.dueDate && invoice.dueDate < invoice.issueDate) {
    add('BR-CO-25', 'error', 'dueDate', 'Das Fälligkeitsdatum liegt vor dem Rechnungsdatum.');
  }
  if (!invoice.dueDate && !invoice.payment?.terms && invoice.paidAmount === 0) {
    add(
      'BR-CO-25',
      'error',
      'dueDate',
      'Es fehlt entweder ein Fälligkeitsdatum oder eine Zahlungsbedingung.',
    );
  }
  if ((invoice.periodStart && !invoice.periodEnd) || (!invoice.periodStart && invoice.periodEnd)) {
    add('BR-CO-19', 'error', 'periodStart', 'Ein Abrechnungszeitraum braucht Beginn und Ende.');
  }

  // --- Beteiligte -----------------------------------------------------------
  checkParty(invoice.seller, 'seller', 'Verkaeufer', add, isXRechnung);
  checkParty(invoice.buyer, 'buyer', 'Kaeufer', add, isXRechnung);

  if (!invoice.seller.vatId && !invoice.seller.taxNumber) {
    add(
      'BR-DE-16',
      'error',
      'seller.vatId',
      'Der Verkaeufer braucht eine USt-IdNr. oder eine Steuernummer.',
    );
  }

  /*
   * BR-CO-26 ist die Regel, ueber die Kleinunternehmer stolpern: der Kaeufer
   * muss den Lieferanten maschinell zuordnen koennen, und dafuer zaehlt die
   * Steuernummer (BT-32) ausdruecklich NICHT. Verlangt wird eines aus
   * BT-29 (Kennung), BT-30 (Registereintrag) oder BT-31 (USt-IdNr.).
   * Wer nach Paragraf 19 UStG keine USt-IdNr. hat und nicht im Handelsregister
   * steht, traegt seine Kundennummer oder eine eigene Kennung in BT-29 ein.
   */
  if (!invoice.seller.vatId && !invoice.seller.legalRegistrationId && !invoice.seller.identifier) {
    add(
      'BR-CO-26',
      'error',
      'seller.identifier',
      'Der Verkaeufer braucht eine USt-IdNr., einen Registereintrag oder eine eigene Kennung. ' +
        'Die Steuernummer allein genuegt hier nicht.',
    );
  }
  if (isXRechnung && !invoice.seller.contact?.name) {
    add('BR-DE-6', 'error', 'seller.contact.name', 'XRechnung verlangt einen Ansprechpartner.');
  }
  if (isXRechnung && !invoice.seller.contact?.phone) {
    add('BR-DE-7', 'error', 'seller.contact.phone', 'XRechnung verlangt eine Telefonnummer.');
  }
  if (isXRechnung && !invoice.seller.contact?.email) {
    add('BR-DE-8', 'error', 'seller.contact.email', 'XRechnung verlangt eine E-Mail-Adresse.');
  }
  if (isXRechnung && !invoice.buyerReference) {
    add(
      'BR-DE-15',
      'error',
      'buyerReference',
      'XRechnung verlangt die Leitweg-ID als Kaeuferreferenz.',
    );
  }
  if (isXRechnung && invoice.buyerReference && !isPlausibleLeitwegId(invoice.buyerReference)) {
    add(
      'BR-DE-15',
      'warning',
      'buyerReference',
      'Die Kaeuferreferenz sieht nicht wie eine Leitweg-ID aus (Grobstruktur 991-12345-67).',
    );
  }

  // --- Zahlung --------------------------------------------------------------
  const means = invoice.payment?.meansCode;
  if (isXRechnung && !means) {
    add('BR-DE-1', 'error', 'payment.meansCode', 'XRechnung verlangt eine Zahlungsart.');
  }
  if ((means === '58' || means === '59') && !invoice.payment?.iban) {
    add('BR-DE-13', 'error', 'payment.iban', 'Bei SEPA-Zahlungen ist die IBAN Pflicht.');
  }
  if (invoice.payment?.iban && !isPlausibleIban(invoice.payment.iban)) {
    add('BR-DE-13', 'error', 'payment.iban', 'Die IBAN ist formal ungueltig (Pruefsumme).');
  }
  if (means === '59' && !invoice.payment?.mandateReference) {
    add(
      'BR-DE-29',
      'warning',
      'payment.mandateReference',
      'Bei SEPA-Lastschrift sollte die Mandatsreferenz angegeben werden.',
    );
  }

  /*
   * Paragraf 14 Abs. 4 Nr. 6 UStG verlangt den Zeitpunkt der Lieferung oder
   * Leistung. Die EN 16931 macht BT-72 nicht zur Pflicht, eine deutsche
   * Rechnung ohne diese Angabe ist aber unvollstaendig - und ein leeres
   * Lieferelement beanstandet PEPPOL-EN16931-R008 zusaetzlich.
   */
  if (!invoice.deliveryDate && !invoice.periodStart) {
    add(
      'UStG-14-4-6',
      'warning',
      'deliveryDate',
      'Es fehlt der Zeitpunkt der Lieferung oder Leistung. Paragraf 14 UStG verlangt ihn, ' +
        'auch wenn er dem Rechnungsdatum entspricht.',
    );
  }

  // --- Zu- und Abschlaege ---------------------------------------------------
  const checkAllowance = (ac: (typeof invoice.allowancesCharges)[number], path: string) => {
    // PEPPOL-EN16931-R041: ein Prozentsatz ohne Basisbetrag ist nicht
    // nachvollziehbar - der Empfaenger kann die Rechnung nicht nachrechnen.
    if (ac.percentage !== undefined && ac.baseAmount === undefined) {
      add(
        'PEPPOL-EN16931-R041',
        'error',
        `${path}.baseAmount`,
        'Wird ein Prozentsatz angegeben, muss auch der Basisbetrag genannt werden.',
      );
    }
  };
  invoice.allowancesCharges.forEach((ac, index) =>
    checkAllowance(ac, `allowancesCharges[${index}]`),
  );
  invoice.lines.forEach((line, lineIndex) =>
    line.allowancesCharges.forEach((ac, index) =>
      checkAllowance(ac, `lines[${lineIndex}].allowancesCharges[${index}]`),
    ),
  );

  // --- Positionen -----------------------------------------------------------
  const seenLineIds = new Set<string>();
  invoice.lines.forEach((line, index) => {
    const at = `lines[${index}]`;
    if (seenLineIds.has(line.id)) {
      add('BR-21', 'error', `${at}.id`, `Die Positionsnummer ${line.id} ist doppelt vergeben.`);
    }
    seenLineIds.add(line.id);
    if (!line.name) add('BR-25', 'error', `${at}.name`, 'Der Artikelname fehlt.');
    if (!line.unitCode) add('BR-23', 'error', `${at}.unitCode`, 'Die Mengeneinheit fehlt.');
    if (line.unitPrice < 0) {
      add('BR-27', 'error', `${at}.unitPrice`, 'Der Einzelpreis darf nicht negativ sein.');
    }
    if ((line.periodStart && !line.periodEnd) || (!line.periodStart && line.periodEnd)) {
      add('BR-30', 'error', `${at}.periodStart`, 'Ein Zeitraum braucht Beginn und Ende.');
    }
  });

  // --- Umsatzsteuer ---------------------------------------------------------
  const totals = computeTotals(invoice);
  for (const entry of totals.vatBreakdown) {
    const at = `vat[${entry.category}/${entry.rate}]`;
    if (entry.category === 'S' && entry.rate <= 0) {
      add('BR-S-05', 'error', at, 'Bei Regelbesteuerung muss der Steuersatz groesser als 0 sein.');
    }
    if (ZERO_RATE_CATEGORIES.includes(entry.category) && entry.rate !== 0) {
      add('BR-Z-05', 'error', at, `Kategorie ${entry.category} verlangt den Steuersatz 0.`);
    }
    if (
      entry.category !== 'S' &&
      entry.category !== 'Z' &&
      !entry.exemptionReason &&
      !entry.exemptionReasonCode
    ) {
      add('BR-E-10', 'error', at, `Kategorie ${entry.category} verlangt einen Befreiungsgrund.`);
    }
  }
  const categories = new Set(totals.vatBreakdown.map((e) => e.category));
  if (categories.has('AE') && !invoice.buyer.vatId) {
    add(
      'BR-AE-03',
      'error',
      'buyer.vatId',
      'Reverse Charge setzt die USt-IdNr. des Kaeufers voraus.',
    );
  }
  if (categories.has('K')) {
    if (!invoice.buyer.vatId) {
      add(
        'BR-IC-03',
        'error',
        'buyer.vatId',
        'Innergemeinschaftliche Lieferung setzt die USt-IdNr. des Kaeufers voraus.',
      );
    }
    if (!invoice.deliveryDate && !invoice.periodStart) {
      add(
        'BR-IC-11',
        'error',
        'deliveryDate',
        'Innergemeinschaftliche Lieferung verlangt ein Lieferdatum oder einen Zeitraum.',
      );
    }
  }

  if (totals.duePayable < 0) {
    add(
      'BR-CO-16',
      'warning',
      'paidAmount',
      'Der Zahlbetrag ist negativ - der gezahlte Betrag uebersteigt den Rechnungsbetrag.',
    );
  }

  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}

function checkParty(
  party: Party | undefined,
  path: string,
  label: string,
  add: (rule: string, severity: Severity, path: string, message: string) => void,
  isXRechnung: boolean,
): void {
  if (!party) return;
  if (!party.name) add('BR-06', 'error', `${path}.name`, `Der Name des ${label}s fehlt.`);
  if (!party.address?.city) {
    add('BR-DE-4', 'error', `${path}.address.city`, `Der Ort des ${label}s fehlt.`);
  }
  if (!party.address?.countryCode) {
    add('BR-09', 'error', `${path}.address.countryCode`, `Das Land des ${label}s fehlt.`);
  }
  if (isXRechnung && !party.address?.line1) {
    add('BR-DE-3', 'error', `${path}.address.line1`, `Die Strasse des ${label}s fehlt.`);
  }
  if (isXRechnung && !party.address?.postcode) {
    add('BR-DE-5', 'error', `${path}.address.postcode`, `Die Postleitzahl des ${label}s fehlt.`);
  }
  if (party.vatId && !isPlausibleVatId(party.vatId)) {
    add(
      'BR-CO-09',
      'error',
      `${path}.vatId`,
      `Die USt-IdNr. "${party.vatId}" beginnt nicht mit einem gueltigen Laenderpraefix.`,
    );
  }
}

/** BR-CO-09: Laenderpraefix plus alphanumerische Kennung */
export function isPlausibleVatId(value: string): boolean {
  return /^[A-Z]{2}[0-9A-Z+*.]{2,13}$/.test(value.replace(/\s/g, '').toUpperCase());
}

/** IBAN-Pruefsumme nach ISO 7064 Mod 97-10 */
export function isPlausibleIban(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = char >= 'A' && char <= 'Z' ? (char.charCodeAt(0) - 55).toString() : char;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/**
 * Grobstruktur der Leitweg-ID: Grobadressierung, optional Feinadressierung,
 * Pruefziffer. Die echte Pruefziffernlogik der KoSIT bleibt dem Validator
 * vorbehalten, hier geht es nur um einen frueh sichtbaren Tippfehlerhinweis.
 */
export function isPlausibleLeitwegId(value: string): boolean {
  return /^\d{2,12}(-[A-Za-z0-9]{1,30})?-\d{2}$/.test(value.trim());
}
