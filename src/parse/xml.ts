import { XMLParser } from 'fast-xml-parser';
import type { Invoice, InvoiceInput, Line, Party, Vat } from '../model/invoice';
import { parseInvoice } from '../model/invoice';

export type InvoiceSyntax = 'cii' | 'ubl';

export interface DeclaredTotals {
  lineTotal?: number;
  taxBasisTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  paidAmount?: number;
  duePayable?: number;
}

export interface ParsedInvoice {
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

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

/** Erkennt die Syntax am Wurzelelement und liest das Dokument ein. */
export function parseInvoiceXml(xml: string): ParsedInvoice {
  const doc = parser.parse(xml) as Record<string, unknown>;
  if (doc.CrossIndustryInvoice) return parseCii(doc.CrossIndustryInvoice as Node);
  if (doc.Invoice) return parseUbl(doc.Invoice as Node, false);
  if (doc.CreditNote) return parseUbl(doc.CreditNote as Node, true);
  throw new Error(
    'Unbekanntes Wurzelelement - weder CrossIndustryInvoice noch Invoice/CreditNote.',
  );
}

// --- CII --------------------------------------------------------------------

function parseCii(root: Node): ParsedInvoice {
  const warnings: string[] = [];
  const document = obj(root.ExchangedDocument);
  const transaction = obj(root.SupplyChainTradeTransaction);
  const agreement = obj(transaction.ApplicableHeaderTradeAgreement);
  const delivery = obj(transaction.ApplicableHeaderTradeDelivery);
  const settlement = obj(transaction.ApplicableHeaderTradeSettlement);
  const summation = obj(settlement.SpecifiedTradeSettlementHeaderMonetarySummation);
  const paymentMeans = first(settlement.SpecifiedTradeSettlementPaymentMeans);
  const paymentTerms = first(settlement.SpecifiedTradePaymentTerms);

  const profileId = text(
    obj(obj(root.ExchangedDocumentContext).GuidelineSpecifiedDocumentContextParameter).ID,
  );

  const lines: Line[] = list(transaction.IncludedSupplyChainTradeLineItem).map((raw, index) => {
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
      name: text(product.Name) ?? 'Position',
      description: text(obj(first(obj(item.AssociatedDocumentLineDocument).IncludedNote)).Content),
      sellerItemId: text(product.SellerAssignedID),
      globalItemId: text(product.GlobalID),
      quantity: num(lineDelivery.BilledQuantity) ?? 0,
      unitCode: attr(lineDelivery.BilledQuantity, 'unitCode') ?? 'C62',
      unitPrice: num(netPrice.ChargeAmount) ?? 0,
      priceBaseQuantity: num(netPrice.BasisQuantity),
      grossUnitPrice: num(grossPrice.ChargeAmount),
      vat: vatFrom(tax),
      allowancesCharges: list(lineSettlement.SpecifiedTradeAllowanceCharge).map(allowanceFrom),
      periodStart: ciiDate(obj(period.StartDateTime).DateTimeString),
      periodEnd: ciiDate(obj(period.EndDateTime).DateTimeString),
      attributes: list(product.ApplicableProductCharacteristic).map((raw) => ({
        name: text(obj(raw).Description) ?? '',
        value: text(obj(raw).Value) ?? '',
      })),
    } as Line;
  });

  const taxGroups = list(settlement.ApplicableTradeTax).map(obj);
  const exemptionByRate = new Map<string, { reason?: string; code?: string }>();
  for (const tax of taxGroups) {
    exemptionByRate.set(`${text(tax.CategoryCode)}:${num(tax.RateApplicablePercent) ?? 0}`, {
      reason: text(tax.ExemptionReason),
      code: text(tax.ExemptionReasonCode),
    });
  }
  // Befreiungsgruende stehen in CII nur auf Dokumentebene, im internen Modell
  // haengen sie an der Position - hier zurueckverteilen.
  for (const line of lines) {
    const found = exemptionByRate.get(`${line.vat.category}:${line.vat.rate}`);
    if (found?.reason) line.vat.exemptionReason = found.reason;
    if (found?.code) line.vat.exemptionReasonCode = found.code;
  }

  const invoiceReference = obj(settlement.InvoiceReferencedDocument);
  const input: InvoiceInput = {
    profile: profileId?.includes('xrechnung') ? 'xrechnung-cii' : 'zugferd-en16931',
    number: text(document.ID) ?? '',
    typeCode: text(document.TypeCode) ?? '380',
    issueDate: ciiDate(obj(document.IssueDateTime).DateTimeString) ?? '1970-01-01',
    dueDate: ciiDate(obj(paymentTerms?.DueDateDateTime).DateTimeString),
    deliveryDate: ciiDate(
      obj(obj(delivery.ActualDeliverySupplyChainEvent).OccurrenceDateTime).DateTimeString,
    ),
    periodStart: ciiDate(obj(obj(settlement.BillingSpecifiedPeriod).StartDateTime).DateTimeString),
    periodEnd: ciiDate(obj(obj(settlement.BillingSpecifiedPeriod).EndDateTime).DateTimeString),
    currency: text(settlement.InvoiceCurrencyCode) ?? 'EUR',
    buyerReference: text(agreement.BuyerReference),
    orderReference: text(obj(agreement.BuyerOrderReferencedDocument).IssuerAssignedID),
    sellerOrderReference: text(obj(agreement.SellerOrderReferencedDocument).IssuerAssignedID),
    contractReference: text(obj(agreement.ContractReferencedDocument).IssuerAssignedID),
    projectReference: text(obj(agreement.SpecifiedProcuringProject).ID),
    seller: ciiParty(obj(agreement.SellerTradeParty)),
    buyer: ciiParty(obj(agreement.BuyerTradeParty)),
    lines,
    allowancesCharges: list(settlement.SpecifiedTradeAllowanceCharge).map(allowanceFrom),
    notes: list(document.IncludedNote)
      .map((raw) => ({ text: text(obj(raw).Content) ?? '', subjectCode: text(obj(raw).SubjectCode) }))
      .filter((note) => note.text.length > 0),
    paidAmount: num(summation.TotalPrepaidAmount) ?? 0,
    roundingAmount: num(summation.RoundingAmount) ?? 0,
  };

  if (text(invoiceReference.IssuerAssignedID)) {
    input.precedingInvoice = {
      number: text(invoiceReference.IssuerAssignedID) ?? '',
      issueDate: ciiDate(obj(invoiceReference.FormattedIssueDateTime).DateTimeString),
    };
  }

  if (paymentMeans || paymentTerms) {
    const creditorAccount = obj(paymentMeans?.PayeePartyCreditorFinancialAccount);
    const debtorAccount = obj(paymentMeans?.PayerPartyDebtorFinancialAccount);
    input.payment = {
      meansCode: text(paymentMeans?.TypeCode) ?? '1',
      meansText: text(paymentMeans?.Information),
      iban: text(creditorAccount.IBANID) ?? text(debtorAccount.IBANID),
      bic: text(obj(paymentMeans?.PayeeSpecifiedCreditorFinancialInstitution).BICID),
      accountName: text(creditorAccount.AccountName),
      remittanceInformation: text(settlement.PaymentReference),
      mandateReference: text(paymentTerms?.DirectDebitMandateID),
      creditorIdentifier: text(settlement.CreditorReferenceID),
      terms: text(paymentTerms?.Description),
    };
  }

  const declaredTotals: DeclaredTotals = {
    lineTotal: num(summation.LineTotalAmount),
    taxBasisTotal: num(summation.TaxBasisTotalAmount),
    taxTotal: num(summation.TaxTotalAmount),
    grandTotal: num(summation.GrandTotalAmount),
    paidAmount: num(summation.TotalPrepaidAmount),
    duePayable: num(summation.DuePayableAmount),
  };

  return finish(input, 'cii', profileId, declaredTotals, warnings);
}

function ciiParty(node: Node): Party {
  const address = obj(node.PostalTradeAddress);
  const contact = obj(node.DefinedTradeContact);
  const registrations = list(node.SpecifiedTaxRegistration).map(obj);
  const legal = obj(node.SpecifiedLegalOrganization);

  const registrationFor = (scheme: string): string | undefined =>
    registrations
      .map((entry) => (attr(entry.ID, 'schemeID') === scheme ? text(entry.ID) : undefined))
      .find(Boolean);

  return {
    name: text(node.Name) ?? '',
    tradingName: text(legal.TradingBusinessName),
    identifier: text(node.ID),
    legalRegistrationId: text(legal.ID),
    vatId: registrationFor('VA'),
    taxNumber: registrationFor('FC'),
    address: {
      line1: text(address.LineOne) ?? '',
      line2: text(address.LineTwo),
      city: text(address.CityName) ?? '',
      postcode: text(address.PostcodeCode),
      subdivision: text(address.CountrySubDivisionName),
      countryCode: text(address.CountryID) ?? 'DE',
    },
    electronicAddress: text(obj(node.URIUniversalCommunication).URIID)
      ? {
          value: text(obj(node.URIUniversalCommunication).URIID) ?? '',
          scheme: attr(obj(node.URIUniversalCommunication).URIID, 'schemeID') ?? 'EM',
        }
      : undefined,
    contact: contact.PersonName || contact.TelephoneUniversalCommunication
      ? {
          name: text(contact.PersonName),
          phone: text(obj(contact.TelephoneUniversalCommunication).CompleteNumber),
          email: text(obj(contact.EmailURIUniversalCommunication).URIID),
        }
      : undefined,
  } as Party;
}

function allowanceFrom(raw: unknown): Invoice['allowancesCharges'][number] {
  const node = obj(raw);
  const tax = obj(node.CategoryTradeTax);
  return {
    isCharge: text(obj(node.ChargeIndicator).Indicator) === 'true',
    amount: num(node.ActualAmount) ?? 0,
    baseAmount: num(node.BasisAmount),
    percentage: num(node.CalculationPercent),
    reason: text(node.Reason),
    reasonCode: text(node.ReasonCode),
    vat: vatFrom(tax),
  };
}

function vatFrom(tax: Node): Vat {
  return {
    category: (text(tax.CategoryCode) ?? 'S') as Vat['category'],
    rate: num(tax.RateApplicablePercent) ?? 0,
    exemptionReason: text(tax.ExemptionReason),
    exemptionReasonCode: text(tax.ExemptionReasonCode),
  };
}

// --- UBL --------------------------------------------------------------------

function parseUbl(root: Node, isCreditNote: boolean): ParsedInvoice {
  const warnings: string[] = [];
  const profileId = text(root.CustomizationID);
  const monetary = obj(root.LegalMonetaryTotal);
  const taxTotal = obj(first(root.TaxTotal));
  const paymentMeans = obj(first(root.PaymentMeans));
  const lineTag = isCreditNote ? root.CreditNoteLine : root.InvoiceLine;

  const lines: Line[] = list(lineTag).map((raw, index) => {
    const node = obj(raw);
    const item = obj(node.Item);
    const price = obj(node.Price);
    const category = obj(item.ClassifiedTaxCategory);
    const period = obj(node.InvoicePeriod);
    const quantity = isCreditNote ? node.CreditedQuantity : node.InvoicedQuantity;

    return {
      id: text(node.ID) ?? String(index + 1),
      name: text(item.Name) ?? 'Position',
      description: text(item.Description) ?? text(node.Note),
      sellerItemId: text(obj(item.SellersItemIdentification).ID),
      globalItemId: text(obj(item.StandardItemIdentification).ID),
      quantity: num(quantity) ?? 0,
      unitCode: attr(quantity, 'unitCode') ?? 'C62',
      unitPrice: num(price.PriceAmount) ?? 0,
      priceBaseQuantity: num(price.BaseQuantity),
      vat: {
        category: (text(category.ID) ?? 'S') as Vat['category'],
        rate: num(category.Percent) ?? 0,
      },
      allowancesCharges: list(node.AllowanceCharge).map((entry) => {
        const ac = obj(entry);
        return {
          isCharge: text(ac.ChargeIndicator) === 'true',
          amount: num(ac.Amount) ?? 0,
          baseAmount: num(ac.BaseAmount),
          percentage: num(ac.MultiplierFactorNumeric),
          reason: text(ac.AllowanceChargeReason),
          reasonCode: text(ac.AllowanceChargeReasonCode),
          vat: { category: (text(category.ID) ?? 'S') as Vat['category'], rate: num(category.Percent) ?? 0 },
        };
      }),
      periodStart: text(period.StartDate),
      periodEnd: text(period.EndDate),
      attributes: list(item.AdditionalItemProperty).map((entry) => ({
        name: text(obj(entry).Name) ?? '',
        value: text(obj(entry).Value) ?? '',
      })),
    } as Line;
  });

  // Steuerbefreiungsgruende aus den Untersummen an die Positionen zurueckgeben
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

  const input: InvoiceInput = {
    profile: 'xrechnung-ubl',
    number: text(root.ID) ?? '',
    typeCode: text(isCreditNote ? root.CreditNoteTypeCode : root.InvoiceTypeCode) ?? '380',
    issueDate: text(root.IssueDate) ?? '1970-01-01',
    dueDate: text(root.DueDate),
    deliveryDate: text(delivery.ActualDeliveryDate) ?? text(root.TaxPointDate),
    periodStart: text(obj(root.InvoicePeriod).StartDate),
    periodEnd: text(obj(root.InvoicePeriod).EndDate),
    currency: text(root.DocumentCurrencyCode) ?? 'EUR',
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
        isCharge: text(ac.ChargeIndicator) === 'true',
        amount: num(ac.Amount) ?? 0,
        baseAmount: num(ac.BaseAmount),
        percentage: num(ac.MultiplierFactorNumeric),
        reason: text(ac.AllowanceChargeReason),
        reasonCode: text(ac.AllowanceChargeReasonCode),
        vat: {
          category: (text(category.ID) ?? 'S') as Vat['category'],
          rate: num(category.Percent) ?? 0,
        },
      };
    }),
    notes: list(root.Note)
      .map((entry) => ({ text: typeof entry === 'string' ? entry : (text(entry) ?? '') }))
      .filter((note) => note.text.length > 0),
    paidAmount: num(monetary.PrepaidAmount) ?? 0,
    roundingAmount: num(monetary.PayableRoundingAmount) ?? 0,
  };

  if (text(billingReference.ID)) {
    input.precedingInvoice = {
      number: text(billingReference.ID) ?? '',
      issueDate: text(billingReference.IssueDate),
    };
  }

  if (paymentMeans.PaymentMeansCode) {
    const account = obj(paymentMeans.PayeeFinancialAccount);
    const mandate = obj(paymentMeans.PaymentMandate);
    input.payment = {
      meansCode: text(paymentMeans.PaymentMeansCode) ?? '1',
      meansText: attr(paymentMeans.PaymentMeansCode, 'name'),
      iban: text(account.ID) ?? text(obj(mandate.PayerFinancialAccount).ID),
      bic: text(obj(account.FinancialInstitutionBranch).ID),
      accountName: text(account.Name),
      remittanceInformation: text(paymentMeans.PaymentID),
      mandateReference: text(mandate.ID),
      terms: text(obj(first(root.PaymentTerms)).Note),
    };
  }

  const declaredTotals: DeclaredTotals = {
    lineTotal: num(monetary.LineExtensionAmount),
    taxBasisTotal: num(monetary.TaxExclusiveAmount),
    taxTotal: num(taxTotal.TaxAmount),
    grandTotal: num(monetary.TaxInclusiveAmount),
    paidAmount: num(monetary.PrepaidAmount),
    duePayable: num(monetary.PayableAmount),
  };

  return finish(input, 'ubl', profileId, declaredTotals, warnings);
}

function ublParty(node: Node): Party {
  const address = obj(node.PostalAddress);
  const contact = obj(node.Contact);
  const legal = obj(first(node.PartyLegalEntity));
  const schemes = list(node.PartyTaxScheme).map(obj);

  const companyIdFor = (scheme: string): string | undefined =>
    schemes
      .map((entry) => (text(obj(entry.TaxScheme).ID) === scheme ? text(entry.CompanyID) : undefined))
      .find(Boolean);

  return {
    name: text(legal.RegistrationName) ?? text(obj(first(node.PartyName)).Name) ?? '',
    tradingName: text(obj(first(node.PartyName)).Name),
    identifier: text(obj(first(node.PartyIdentification)).ID),
    legalRegistrationId: text(legal.CompanyID),
    vatId: companyIdFor('VAT'),
    taxNumber: companyIdFor('FC'),
    address: {
      line1: text(address.StreetName) ?? '',
      line2: text(address.AdditionalStreetName),
      city: text(address.CityName) ?? '',
      postcode: text(address.PostalZone),
      subdivision: text(address.CountrySubentity),
      countryCode: text(obj(address.Country).IdentificationCode) ?? 'DE',
    },
    electronicAddress: text(node.EndpointID)
      ? { value: text(node.EndpointID) ?? '', scheme: attr(node.EndpointID, 'schemeID') ?? 'EM' }
      : undefined,
    contact:
      contact.Name || contact.Telephone || contact.ElectronicMail
        ? {
            name: text(contact.Name),
            phone: text(contact.Telephone),
            email: text(contact.ElectronicMail),
          }
        : undefined,
  } as Party;
}

// --- gemeinsame Helfer ------------------------------------------------------

type Node = Record<string, unknown>;

function finish(
  input: InvoiceInput,
  syntax: InvoiceSyntax,
  profileId: string | undefined,
  declaredTotals: DeclaredTotals,
  warnings: string[],
): ParsedInvoice {
  // Beim Empfang darf ein unvollstaendiges Dokument nicht zum Absturz fuehren:
  // fehlende Pflichtfelder werden zu Warnungen und mit Platzhaltern gefuellt.
  const result = parseInvoice(input);
  if (!input.number) warnings.push('Die Rechnung enthaelt keine Rechnungsnummer.');
  if (result.lines.length === 0) warnings.push('Die Rechnung enthaelt keine Positionen.');
  return { invoice: result, syntax, profileId, declaredTotals, warnings };
}

function obj(value: unknown): Node {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : {};
}

function list(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function first(value: unknown): Node | undefined {
  const entries = list(value);
  return entries.length > 0 ? obj(entries[0]) : undefined;
}

/** Textinhalt eines Elements, auch wenn es wegen Attributen als Objekt vorliegt. */
function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const inner = (value as Record<string, unknown>)['#text'];
    if (typeof inner === 'string') return inner.length > 0 ? inner : undefined;
    if (typeof inner === 'number') return String(inner);
  }
  return undefined;
}

function num(value: unknown): number | undefined {
  const raw = text(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function attr(value: unknown, name: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = (value as Record<string, unknown>)[`@_${name}`];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/** CII-Datum im Format 102 (YYYYMMDD) in ein ISO-Datum wandeln. */
function ciiDate(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return undefined;
}
