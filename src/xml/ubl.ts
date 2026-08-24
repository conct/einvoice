import type { AllowanceCharge, Address, Invoice, Line, Party } from '../model/invoice';
import { computeTotals, type InvoiceTotals } from '../model/totals';
import { activeSpecifications } from '../model/specifications';
import { decimal } from '../util/money';
import { toBase64 } from '../util/base64';
import { XmlWriter } from '../util/xml';

const BUSINESS_PROCESS = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

/** Rechnungsarten, die in UBL als CreditNote statt als Invoice uebertragen werden */
const CREDIT_NOTE_TYPES = new Set(['381', '396']);

export interface UblOptions {
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
export function buildUbl(invoice: Invoice, options: UblOptions = {}): string {
  const totals = options.totals ?? computeTotals(invoice);
  const isCreditNote = CREDIT_NOTE_TYPES.has(invoice.typeCode);
  const root = isCreditNote ? 'ubl:CreditNote' : 'ubl:Invoice';
  const lineTag = isCreditNote ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
  const quantityTag = isCreditNote ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
  const currency = invoice.currency;
  const cur = { currencyID: currency };

  const w = new XmlWriter();
  w.open(root, {
    'xmlns:ubl': isCreditNote
      ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
      : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  });

  w.leaf('cbc:CustomizationID', options.customizationId ?? activeSpecifications().xrechnung.id);
  w.leaf('cbc:ProfileID', options.profileId ?? BUSINESS_PROCESS);
  w.leaf('cbc:ID', invoice.number);
  w.leaf('cbc:IssueDate', invoice.issueDate);
  if (!isCreditNote) w.leaf('cbc:DueDate', invoice.dueDate);
  w.leaf(isCreditNote ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', invoice.typeCode);
  for (const note of invoice.notes) w.leaf('cbc:Note', note.text);
  w.leaf('cbc:TaxPointDate', invoice.deliveryDate);
  w.leaf('cbc:DocumentCurrencyCode', currency);
  w.leaf('cbc:BuyerReference', invoice.buyerReference);

  if (invoice.periodStart && invoice.periodEnd) {
    w.element('cac:InvoicePeriod', undefined, (x) => {
      x.leaf('cbc:StartDate', invoice.periodStart);
      x.leaf('cbc:EndDate', invoice.periodEnd);
    });
  }
  if (invoice.orderReference || invoice.sellerOrderReference) {
    w.element('cac:OrderReference', undefined, (x) => {
      x.leaf('cbc:ID', invoice.orderReference ?? invoice.sellerOrderReference);
      if (invoice.orderReference) x.leaf('cbc:SalesOrderID', invoice.sellerOrderReference);
    });
  }
  if (invoice.precedingInvoice) {
    w.element('cac:BillingReference', undefined, (x) => {
      x.element('cac:InvoiceDocumentReference', undefined, (d) => {
        d.leaf('cbc:ID', invoice.precedingInvoice?.number);
        d.leaf('cbc:IssueDate', invoice.precedingInvoice?.issueDate);
      });
    });
  }
  w.elementIf(invoice.contractReference, 'cac:ContractDocumentReference', undefined, (x) =>
    x.leaf('cbc:ID', invoice.contractReference),
  );
  w.elementIf(invoice.projectReference, 'cac:ProjectReference', undefined, (x) =>
    x.leaf('cbc:ID', invoice.projectReference),
  );
  for (const attachment of invoice.attachments) {
    w.element('cac:AdditionalDocumentReference', undefined, (x) => {
      x.leaf('cbc:ID', attachment.id);
      x.leaf('cbc:DocumentDescription', attachment.description);
      if (attachment.data || attachment.uri) {
        x.element('cac:Attachment', undefined, (a) => {
          if (attachment.data) {
            a.leaf('cbc:EmbeddedDocumentBinaryObject', toBase64(attachment.data), {
              mimeCode: attachment.mimeType ?? 'application/octet-stream',
              filename: attachment.filename ?? attachment.id,
            });
          }
          if (attachment.uri) {
            a.element('cac:ExternalReference', undefined, (e) => e.leaf('cbc:URI', attachment.uri));
          }
        });
      }
    });
  }

  w.element('cac:AccountingSupplierParty', undefined, (x) => writeParty(x, invoice.seller, true));
  w.element('cac:AccountingCustomerParty', undefined, (x) => writeParty(x, invoice.buyer, false));
  if (invoice.payee) {
    w.element('cac:PayeeParty', undefined, (x) => {
      x.element('cac:PartyName', undefined, (n) => n.leaf('cbc:Name', invoice.payee?.name));
      x.elementIf(invoice.payee?.legalRegistrationId, 'cac:PartyLegalEntity', undefined, (l) =>
        l.leaf('cbc:CompanyID', invoice.payee?.legalRegistrationId),
      );
    });
  }

  if (invoice.deliveryDate || invoice.deliveryAddress || invoice.deliveryName) {
    w.element('cac:Delivery', undefined, (x) => {
      x.leaf('cbc:ActualDeliveryDate', invoice.deliveryDate);
      x.elementIf(invoice.deliveryAddress, 'cac:DeliveryLocation', undefined, (l) => {
        if (invoice.deliveryAddress) {
          l.element('cac:Address', undefined, (a) => writeAddressBody(a, invoice.deliveryAddress!));
        }
      });
      x.elementIf(invoice.deliveryName, 'cac:DeliveryParty', undefined, (p) =>
        p.element('cac:PartyName', undefined, (n) => n.leaf('cbc:Name', invoice.deliveryName)),
      );
    });
  }

  if (invoice.payment) {
    w.element('cac:PaymentMeans', undefined, (x) => {
      x.leaf('cbc:PaymentMeansCode', invoice.payment?.meansCode, {
        name: invoice.payment?.meansText,
      });
      x.leaf('cbc:PaymentID', invoice.payment?.remittanceInformation);
      if (invoice.payment?.meansCode === '59') {
        x.elementIf(invoice.payment?.mandateReference, 'cac:PaymentMandate', undefined, (m) => {
          m.leaf('cbc:ID', invoice.payment?.mandateReference);
          m.elementIf(invoice.payment?.iban, 'cac:PayerFinancialAccount', undefined, (a) =>
            a.leaf('cbc:ID', invoice.payment?.iban),
          );
        });
      } else if (invoice.payment?.iban) {
        x.element('cac:PayeeFinancialAccount', undefined, (a) => {
          a.leaf('cbc:ID', invoice.payment?.iban);
          a.leaf('cbc:Name', invoice.payment?.accountName);
          a.elementIf(invoice.payment?.bic, 'cac:FinancialInstitutionBranch', undefined, (b) =>
            b.leaf('cbc:ID', invoice.payment?.bic),
          );
        });
      }
    });
    w.elementIf(invoice.payment.terms, 'cac:PaymentTerms', undefined, (x) =>
      x.leaf('cbc:Note', invoice.payment?.terms),
    );
  }

  for (const ac of invoice.allowancesCharges) {
    w.element('cac:AllowanceCharge', undefined, (x) => {
      x.leaf('cbc:ChargeIndicator', ac.isCharge ? 'true' : 'false');
      x.leaf('cbc:AllowanceChargeReasonCode', ac.reasonCode);
      x.leaf('cbc:AllowanceChargeReason', ac.reason);
      if (ac.percentage !== undefined) x.leaf('cbc:MultiplierFactorNumeric', decimal(ac.percentage, 2));
      x.leaf('cbc:Amount', decimal(ac.amount), cur);
      if (ac.baseAmount !== undefined) x.leaf('cbc:BaseAmount', decimal(ac.baseAmount), cur);
      x.element('cac:TaxCategory', undefined, (t) => {
        t.leaf('cbc:ID', ac.vat.category);
        t.leaf('cbc:Percent', decimal(ac.vat.rate, 2));
        t.element('cac:TaxScheme', undefined, (s) => s.leaf('cbc:ID', 'VAT'));
      });
    });
  }

  w.element('cac:TaxTotal', undefined, (x) => {
    x.leaf('cbc:TaxAmount', decimal(totals.taxTotal), cur);
    for (const tax of totals.vatBreakdown) {
      x.element('cac:TaxSubtotal', undefined, (s) => {
        s.leaf('cbc:TaxableAmount', decimal(tax.taxableAmount), cur);
        s.leaf('cbc:TaxAmount', decimal(tax.taxAmount), cur);
        s.element('cac:TaxCategory', undefined, (c) => {
          c.leaf('cbc:ID', tax.category);
          c.leaf('cbc:Percent', decimal(tax.rate, 2));
          c.leaf('cbc:TaxExemptionReasonCode', tax.exemptionReasonCode);
          c.leaf('cbc:TaxExemptionReason', tax.exemptionReason);
          c.element('cac:TaxScheme', undefined, (t) => t.leaf('cbc:ID', 'VAT'));
        });
      });
    }
  });

  w.element('cac:LegalMonetaryTotal', undefined, (x) => {
    x.leaf('cbc:LineExtensionAmount', decimal(totals.lineTotal), cur);
    x.leaf('cbc:TaxExclusiveAmount', decimal(totals.taxBasisTotal), cur);
    x.leaf('cbc:TaxInclusiveAmount', decimal(totals.grandTotal), cur);
    if (totals.allowanceTotal !== 0) {
      x.leaf('cbc:AllowanceTotalAmount', decimal(totals.allowanceTotal), cur);
    }
    if (totals.chargeTotal !== 0) {
      x.leaf('cbc:ChargeTotalAmount', decimal(totals.chargeTotal), cur);
    }
    if (totals.paidAmount !== 0) x.leaf('cbc:PrepaidAmount', decimal(totals.paidAmount), cur);
    if (totals.roundingAmount !== 0) {
      x.leaf('cbc:PayableRoundingAmount', decimal(totals.roundingAmount), cur);
    }
    x.leaf('cbc:PayableAmount', decimal(totals.duePayable), cur);
  });

  invoice.lines.forEach((line, index) => {
    writeLine(w, line, totals.lineAmounts[index] ?? 0, currency, lineTag, quantityTag);
  });

  w.close(root);
  return w.toString();
}

function writeLine(
  w: XmlWriter,
  line: Line,
  netAmount: number,
  currency: string,
  lineTag: string,
  quantityTag: string,
): void {
  w.element(lineTag, undefined, (x) => {
    x.leaf('cbc:ID', line.id);
    x.leaf('cbc:Note', line.description);
    x.leaf(quantityTag, decimal(line.quantity, 4), { unitCode: line.unitCode });
    x.leaf('cbc:LineExtensionAmount', decimal(netAmount), { currencyID: currency });
    if (line.periodStart && line.periodEnd) {
      x.element('cac:InvoicePeriod', undefined, (p) => {
        p.leaf('cbc:StartDate', line.periodStart);
        p.leaf('cbc:EndDate', line.periodEnd);
      });
    }
    x.elementIf(line.orderLineReference, 'cac:OrderLineReference', undefined, (r) =>
      r.leaf('cbc:LineID', line.orderLineReference),
    );
    for (const ac of line.allowancesCharges) writeLineAllowanceCharge(x, ac, currency);

    x.element('cac:Item', undefined, (item) => {
      item.leaf('cbc:Description', line.description);
      item.leaf('cbc:Name', line.name);
      item.elementIf(line.sellerItemId, 'cac:SellersItemIdentification', undefined, (i) =>
        i.leaf('cbc:ID', line.sellerItemId),
      );
      item.elementIf(line.globalItemId, 'cac:StandardItemIdentification', undefined, (i) =>
        i.leaf('cbc:ID', line.globalItemId, { schemeID: '0160' }),
      );
      item.element('cac:ClassifiedTaxCategory', undefined, (t) => {
        t.leaf('cbc:ID', line.vat.category);
        t.leaf('cbc:Percent', decimal(line.vat.rate, 2));
        t.element('cac:TaxScheme', undefined, (s) => s.leaf('cbc:ID', 'VAT'));
      });
      for (const attribute of line.attributes) {
        item.element('cac:AdditionalItemProperty', undefined, (p) => {
          p.leaf('cbc:Name', attribute.name);
          p.leaf('cbc:Value', attribute.value);
        });
      }
    });

    x.element('cac:Price', undefined, (p) => {
      p.leaf('cbc:PriceAmount', decimal(line.unitPrice, 4), { currencyID: currency });
      p.leaf('cbc:BaseQuantity', decimal(line.priceBaseQuantity ?? 1, 4), {
        unitCode: line.unitCode,
      });
      if (line.unitPriceDiscount) {
        p.element('cac:AllowanceCharge', undefined, (ac) => {
          ac.leaf('cbc:ChargeIndicator', 'false');
          ac.leaf('cbc:Amount', decimal(line.unitPriceDiscount ?? 0, 4), { currencyID: currency });
          if (line.grossUnitPrice !== undefined) {
            ac.leaf('cbc:BaseAmount', decimal(line.grossUnitPrice, 4), { currencyID: currency });
          }
        });
      }
    });
  });
}

function writeLineAllowanceCharge(w: XmlWriter, ac: AllowanceCharge, currency: string): void {
  w.element('cac:AllowanceCharge', undefined, (x) => {
    x.leaf('cbc:ChargeIndicator', ac.isCharge ? 'true' : 'false');
    x.leaf('cbc:AllowanceChargeReasonCode', ac.reasonCode);
    x.leaf('cbc:AllowanceChargeReason', ac.reason);
    if (ac.percentage !== undefined) x.leaf('cbc:MultiplierFactorNumeric', decimal(ac.percentage, 2));
    x.leaf('cbc:Amount', decimal(ac.amount), { currencyID: currency });
    if (ac.baseAmount !== undefined) {
      x.leaf('cbc:BaseAmount', decimal(ac.baseAmount), { currencyID: currency });
    }
  });
}

function writeParty(w: XmlWriter, party: Party, isSeller: boolean): void {
  w.element('cac:Party', undefined, (x) => {
    if (party.electronicAddress) {
      x.leaf('cbc:EndpointID', party.electronicAddress.value, {
        schemeID: party.electronicAddress.scheme,
      });
    }
    x.elementIf(party.identifier, 'cac:PartyIdentification', undefined, (i) =>
      i.leaf('cbc:ID', party.identifier),
    );
    x.elementIf(party.tradingName, 'cac:PartyName', undefined, (n) =>
      n.leaf('cbc:Name', party.tradingName),
    );
    x.element('cac:PostalAddress', undefined, (a) => writeAddressBody(a, party.address));
    if (party.vatId) {
      x.element('cac:PartyTaxScheme', undefined, (t) => {
        t.leaf('cbc:CompanyID', party.vatId);
        t.element('cac:TaxScheme', undefined, (s) => s.leaf('cbc:ID', 'VAT'));
      });
    }
    if (isSeller && party.taxNumber) {
      // Die Steuernummer wird ueber das Schema FC gefuehrt, nicht ueber VAT.
      x.element('cac:PartyTaxScheme', undefined, (t) => {
        t.leaf('cbc:CompanyID', party.taxNumber);
        t.element('cac:TaxScheme', undefined, (s) => s.leaf('cbc:ID', 'FC'));
      });
    }
    x.element('cac:PartyLegalEntity', undefined, (l) => {
      l.leaf('cbc:RegistrationName', party.name);
      l.leaf('cbc:CompanyID', party.legalRegistrationId);
    });
    if (party.contact) {
      x.element('cac:Contact', undefined, (c) => {
        c.leaf('cbc:Name', party.contact?.name);
        c.leaf('cbc:Telephone', party.contact?.phone);
        c.leaf('cbc:ElectronicMail', party.contact?.email);
      });
    }
  });
}

function writeAddressBody(w: XmlWriter, address: Address): void {
  w.leaf('cbc:StreetName', address.line1);
  w.leaf('cbc:AdditionalStreetName', address.line2);
  w.leaf('cbc:CityName', address.city);
  w.leaf('cbc:PostalZone', address.postcode);
  w.leaf('cbc:CountrySubentity', address.subdivision);
  w.element('cac:Country', undefined, (c) => c.leaf('cbc:IdentificationCode', address.countryCode));
}
