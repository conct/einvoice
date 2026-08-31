import type { AllowanceCharge, Invoice, Line, Party } from '../model/invoice';
import { computeTotals, type InvoiceTotals } from '../model/totals';
import { activeSpecifications } from '../model/specifications';
import { toCiiDate } from '../util/date';
import { decimal } from '../util/money';
import { XmlWriter } from '../util/xml';
import { toBase64 } from '../util/base64';

const NS = {
  'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  'xmlns:qdt': 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
  'xmlns:ram':
    'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
} as const;

/** Peppol-BIS-Prozesskennung, von XRechnung als BT-23 erwartet */
const BUSINESS_PROCESS = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

export interface CiiOptions {
  /** Ueberschreibt die aus dem Profil abgeleitete Kennung (BT-24) */
  guidelineId?: string;
  /** Prozesskennung (BT-23) */
  businessProcessId?: string;
  /** Bereits berechnete Summen wiederverwenden, statt neu zu rechnen */
  totals?: InvoiceTotals;
}

function guidelineFor(invoice: Invoice, options: CiiOptions): string {
  if (options.guidelineId) return options.guidelineId;
  const specs = activeSpecifications();
  return invoice.profile === 'zugferd-en16931' ? specs.zugferdEn16931.id : specs.xrechnung.id;
}

/** DateTimeString im CII-Format 102 (YYYYMMDD) */
function dateElement(w: XmlWriter, tag: string, value: string | undefined, ns = 'udt'): void {
  if (!value) return;
  w.element(tag, undefined, (x) => {
    x.leaf(`${ns}:DateTimeString`, toCiiDate(value), { format: '102' });
  });
}

/**
 * Erzeugt eine UN/CEFACT Cross Industry Invoice (D16B) im Profil EN 16931.
 * Dieselbe Syntax traegt ZUGFeRD 2.3 / Factur-X und XRechnung in CII - der
 * Unterschied liegt in der Guideline-Kennung und den strengeren
 * Pflichtfeldern der XRechnung, die validateInvoice() abdeckt.
 */
export function buildCii(invoice: Invoice, options: CiiOptions = {}): string {
  const totals = options.totals ?? computeTotals(invoice);
  const w = new XmlWriter();

  w.open('rsm:CrossIndustryInvoice', NS);

  // --- Kontext --------------------------------------------------------------
  w.element('rsm:ExchangedDocumentContext', undefined, (x) => {
    x.element('ram:BusinessProcessSpecifiedDocumentContextParameter', undefined, (b) => {
      b.leaf('ram:ID', options.businessProcessId ?? BUSINESS_PROCESS);
    });
    x.element('ram:GuidelineSpecifiedDocumentContextParameter', undefined, (b) => {
      b.leaf('ram:ID', guidelineFor(invoice, options));
    });
  });

  // --- Dokumentkopf ---------------------------------------------------------
  w.element('rsm:ExchangedDocument', undefined, (x) => {
    x.leaf('ram:ID', invoice.number);
    x.leaf('ram:TypeCode', invoice.typeCode);
    dateElement(x, 'ram:IssueDateTime', invoice.issueDate);
    /*
     * Das Anschreiben zuerst - es steht auf dem Blatt ueber allem anderen,
     * und die Reihenfolge der Bemerkungen ist die einzige Stelle, an der das
     * im XML ueberhaupt ausdrueckbar ist. "AAI" ist der UNTDID-4451-Kode fuer
     * allgemeine Angaben.
     */
    if (invoice.intro) {
      x.element('ram:IncludedNote', undefined, (n) => {
        n.leaf('ram:Content', invoice.intro);
        n.leaf('ram:SubjectCode', 'AAI');
      });
    }
    for (const note of invoice.notes) {
      x.element('ram:IncludedNote', undefined, (n) => {
        n.leaf('ram:Content', note.text);
        n.leaf('ram:SubjectCode', note.subjectCode);
      });
    }
  });

  w.open('rsm:SupplyChainTradeTransaction');

  // --- Positionen -----------------------------------------------------------
  invoice.lines.forEach((line, index) => {
    writeLine(w, line, totals.lineAmounts[index] ?? 0, invoice.currency);
  });

  // --- Vereinbarung ---------------------------------------------------------
  w.element('ram:ApplicableHeaderTradeAgreement', undefined, (x) => {
    x.leaf('ram:BuyerReference', invoice.buyerReference);
    writeParty(x, 'ram:SellerTradeParty', invoice.seller);
    writeParty(x, 'ram:BuyerTradeParty', invoice.buyer);
    x.elementIf(invoice.sellerOrderReference, 'ram:SellerOrderReferencedDocument', undefined, (d) =>
      d.leaf('ram:IssuerAssignedID', invoice.sellerOrderReference),
    );
    x.elementIf(invoice.orderReference, 'ram:BuyerOrderReferencedDocument', undefined, (d) =>
      d.leaf('ram:IssuerAssignedID', invoice.orderReference),
    );
    x.elementIf(invoice.contractReference, 'ram:ContractReferencedDocument', undefined, (d) =>
      d.leaf('ram:IssuerAssignedID', invoice.contractReference),
    );
    for (const attachment of invoice.attachments) {
      x.element('ram:AdditionalReferencedDocument', undefined, (d) => {
        d.leaf('ram:IssuerAssignedID', attachment.id);
        d.leaf('ram:URIID', attachment.uri);
        d.leaf('ram:TypeCode', '916');
        d.leaf('ram:Name', attachment.description);
        if (attachment.data) {
          d.leaf('ram:AttachmentBinaryObject', toBase64(attachment.data), {
            mimeCode: attachment.mimeType ?? 'application/octet-stream',
            filename: attachment.filename ?? attachment.id,
          });
        }
      });
    }
    x.elementIf(invoice.projectReference, 'ram:SpecifiedProcuringProject', undefined, (d) => {
      d.leaf('ram:ID', invoice.projectReference);
      d.leaf('ram:Name', invoice.projectReference);
    });
  });

  // --- Lieferung ------------------------------------------------------------
  // Das Element ist im Schema Pflicht. Gibt es nichts einzutragen, wird es
  // verkuerzt geschrieben - PEPPOL-EN16931-R008 beanstandet leere Elemente.
  const hasDelivery = Boolean(
    invoice.deliveryDate || invoice.deliveryAddress || invoice.deliveryName,
  );
  if (!hasDelivery) w.empty('ram:ApplicableHeaderTradeDelivery');
  else w.element('ram:ApplicableHeaderTradeDelivery', undefined, (x) => {
    if (invoice.deliveryAddress || invoice.deliveryName) {
      x.element('ram:ShipToTradeParty', undefined, (p) => {
        p.leaf('ram:Name', invoice.deliveryName ?? invoice.buyer.name);
        if (invoice.deliveryAddress) writeAddress(p, invoice.deliveryAddress);
      });
    }
    if (invoice.deliveryDate) {
      x.element('ram:ActualDeliverySupplyChainEvent', undefined, (e) => {
        dateElement(e, 'ram:OccurrenceDateTime', invoice.deliveryDate);
      });
    }
  });

  // --- Abrechnung -----------------------------------------------------------
  w.element('ram:ApplicableHeaderTradeSettlement', undefined, (x) => {
    x.leaf('ram:CreditorReferenceID', invoice.payment?.creditorIdentifier);
    x.leaf('ram:PaymentReference', invoice.payment?.remittanceInformation);
    x.leaf('ram:InvoiceCurrencyCode', invoice.currency);
    if (invoice.payee) {
      writeParty(x, 'ram:PayeeTradeParty', {
        ...invoice.payee,
        address: invoice.payee.address ?? invoice.seller.address,
      } as Party);
    }

    if (invoice.payment) {
      x.element('ram:SpecifiedTradeSettlementPaymentMeans', undefined, (m) => {
        m.leaf('ram:TypeCode', invoice.payment?.meansCode);
        m.leaf('ram:Information', invoice.payment?.meansText);
        // Bei Lastschrift wird das Konto des Zahlers referenziert, sonst das
        // des Zahlungsempfaengers.
        if (invoice.payment?.meansCode === '59') {
          m.elementIf(invoice.payment?.iban, 'ram:PayerPartyDebtorFinancialAccount', undefined, (a) =>
            a.leaf('ram:IBANID', invoice.payment?.iban),
          );
        } else {
          m.elementIf(
            invoice.payment?.iban,
            'ram:PayeePartyCreditorFinancialAccount',
            undefined,
            (a) => {
              a.leaf('ram:IBANID', invoice.payment?.iban);
              a.leaf('ram:AccountName', invoice.payment?.accountName);
            },
          );
          m.elementIf(
            invoice.payment?.bic,
            'ram:PayeeSpecifiedCreditorFinancialInstitution',
            undefined,
            (a) => a.leaf('ram:BICID', invoice.payment?.bic),
          );
        }
      });
    }

    for (const tax of totals.vatBreakdown) {
      x.element('ram:ApplicableTradeTax', undefined, (t) => {
        t.leaf('ram:CalculatedAmount', decimal(tax.taxAmount));
        t.leaf('ram:TypeCode', 'VAT');
        t.leaf('ram:ExemptionReason', tax.exemptionReason);
        t.leaf('ram:BasisAmount', decimal(tax.taxableAmount));
        t.leaf('ram:CategoryCode', tax.category);
        t.leaf('ram:ExemptionReasonCode', tax.exemptionReasonCode);
        t.leaf('ram:RateApplicablePercent', decimal(tax.rate, 2));
      });
    }

    if (invoice.periodStart && invoice.periodEnd) {
      x.element('ram:BillingSpecifiedPeriod', undefined, (p) => {
        dateElement(p, 'ram:StartDateTime', invoice.periodStart);
        dateElement(p, 'ram:EndDateTime', invoice.periodEnd);
      });
    }

    for (const ac of invoice.allowancesCharges) {
      writeAllowanceCharge(x, ac);
    }

    if (invoice.payment?.terms || invoice.dueDate || invoice.payment?.mandateReference) {
      x.element('ram:SpecifiedTradePaymentTerms', undefined, (t) => {
        t.leaf('ram:Description', invoice.payment?.terms);
        dateElement(t, 'ram:DueDateDateTime', invoice.dueDate);
        t.leaf('ram:DirectDebitMandateID', invoice.payment?.mandateReference);
      });
    }

    x.element('ram:SpecifiedTradeSettlementHeaderMonetarySummation', undefined, (s) => {
      s.leaf('ram:LineTotalAmount', decimal(totals.lineTotal));
      if (totals.chargeTotal !== 0) s.leaf('ram:ChargeTotalAmount', decimal(totals.chargeTotal));
      if (totals.allowanceTotal !== 0) {
        s.leaf('ram:AllowanceTotalAmount', decimal(totals.allowanceTotal));
      }
      s.leaf('ram:TaxBasisTotalAmount', decimal(totals.taxBasisTotal));
      s.leaf('ram:TaxTotalAmount', decimal(totals.taxTotal), { currencyID: invoice.currency });
      if (totals.roundingAmount !== 0) {
        s.leaf('ram:RoundingAmount', decimal(totals.roundingAmount));
      }
      s.leaf('ram:GrandTotalAmount', decimal(totals.grandTotal));
      if (totals.paidAmount !== 0) s.leaf('ram:TotalPrepaidAmount', decimal(totals.paidAmount));
      s.leaf('ram:DuePayableAmount', decimal(totals.duePayable));
    });

    if (invoice.precedingInvoice) {
      x.element('ram:InvoiceReferencedDocument', undefined, (d) => {
        d.leaf('ram:IssuerAssignedID', invoice.precedingInvoice?.number);
        dateElement(d, 'ram:FormattedIssueDateTime', invoice.precedingInvoice?.issueDate, 'qdt');
      });
    }
  });

  w.close('rsm:SupplyChainTradeTransaction');
  w.close('rsm:CrossIndustryInvoice');
  return w.toString();
}

function writeLine(w: XmlWriter, line: Line, netAmount: number, currency: string): void {
  w.element('ram:IncludedSupplyChainTradeLineItem', undefined, (x) => {
    x.element('ram:AssociatedDocumentLineDocument', undefined, (d) => {
      d.leaf('ram:LineID', line.id);
      d.elementIf(line.description, 'ram:IncludedNote', undefined, (n) =>
        n.leaf('ram:Content', line.description),
      );
    });

    x.element('ram:SpecifiedTradeProduct', undefined, (p) => {
      p.leaf('ram:GlobalID', line.globalItemId, { schemeID: '0160' });
      p.leaf('ram:SellerAssignedID', line.sellerItemId);
      p.leaf('ram:Name', line.name);
      for (const attribute of line.attributes) {
        p.element('ram:ApplicableProductCharacteristic', undefined, (c) => {
          c.leaf('ram:Description', attribute.name);
          c.leaf('ram:Value', attribute.value);
        });
      }
    });

    x.element('ram:SpecifiedLineTradeAgreement', undefined, (a) => {
      a.elementIf(line.orderLineReference, 'ram:BuyerOrderReferencedDocument', undefined, (d) =>
        d.leaf('ram:LineID', line.orderLineReference),
      );
      if (line.grossUnitPrice !== undefined) {
        a.element('ram:GrossPriceProductTradePrice', undefined, (p) => {
          p.leaf('ram:ChargeAmount', decimal(line.grossUnitPrice ?? 0, 4));
          p.leaf('ram:BasisQuantity', decimal(line.priceBaseQuantity ?? 1, 4), {
            unitCode: line.unitCode,
          });
          if (line.unitPriceDiscount) {
            p.element('ram:AppliedTradeAllowanceCharge', undefined, (ac) => {
              ac.element('ram:ChargeIndicator', undefined, (i) => i.leaf('udt:Indicator', 'false'));
              ac.leaf('ram:ActualAmount', decimal(line.unitPriceDiscount ?? 0, 4));
            });
          }
        });
      }
      a.element('ram:NetPriceProductTradePrice', undefined, (p) => {
        p.leaf('ram:ChargeAmount', decimal(line.unitPrice, 4));
        p.leaf('ram:BasisQuantity', decimal(line.priceBaseQuantity ?? 1, 4), {
          unitCode: line.unitCode,
        });
      });
    });

    x.element('ram:SpecifiedLineTradeDelivery', undefined, (d) => {
      d.leaf('ram:BilledQuantity', decimal(line.quantity, 4), { unitCode: line.unitCode });
    });

    x.element('ram:SpecifiedLineTradeSettlement', undefined, (s) => {
      s.element('ram:ApplicableTradeTax', undefined, (t) => {
        t.leaf('ram:TypeCode', 'VAT');
        t.leaf('ram:CategoryCode', line.vat.category);
        t.leaf('ram:RateApplicablePercent', decimal(line.vat.rate, 2));
      });
      if (line.periodStart && line.periodEnd) {
        s.element('ram:BillingSpecifiedPeriod', undefined, (p) => {
          dateElement(p, 'ram:StartDateTime', line.periodStart);
          dateElement(p, 'ram:EndDateTime', line.periodEnd);
        });
      }
      for (const ac of line.allowancesCharges) writeAllowanceCharge(s, ac, false);
      s.element('ram:SpecifiedTradeSettlementLineMonetarySummation', undefined, (m) => {
        m.leaf('ram:LineTotalAmount', decimal(netAmount));
      });
    });
  });
  void currency;
}

function writeAllowanceCharge(w: XmlWriter, ac: AllowanceCharge, withTax = true): void {
  w.element('ram:SpecifiedTradeAllowanceCharge', undefined, (x) => {
    x.element('ram:ChargeIndicator', undefined, (i) =>
      i.leaf('udt:Indicator', ac.isCharge ? 'true' : 'false'),
    );
    if (ac.percentage !== undefined) x.leaf('ram:CalculationPercent', decimal(ac.percentage, 2));
    if (ac.baseAmount !== undefined) x.leaf('ram:BasisAmount', decimal(ac.baseAmount));
    x.leaf('ram:ActualAmount', decimal(ac.amount));
    x.leaf('ram:ReasonCode', ac.reasonCode);
    x.leaf('ram:Reason', ac.reason);
    if (withTax) {
      x.element('ram:CategoryTradeTax', undefined, (t) => {
        t.leaf('ram:TypeCode', 'VAT');
        t.leaf('ram:CategoryCode', ac.vat.category);
        t.leaf('ram:RateApplicablePercent', decimal(ac.vat.rate, 2));
      });
    }
  });
}

function writeParty(w: XmlWriter, tag: string, party: Party): void {
  w.element(tag, undefined, (x) => {
    x.leaf('ram:ID', party.identifier);
    x.leaf('ram:Name', party.name);
    if (party.legalRegistrationId || party.tradingName) {
      x.element('ram:SpecifiedLegalOrganization', undefined, (o) => {
        o.leaf('ram:ID', party.legalRegistrationId, { schemeID: '0002' });
        o.leaf('ram:TradingBusinessName', party.tradingName);
      });
    }
    if (party.contact) {
      x.element('ram:DefinedTradeContact', undefined, (c) => {
        c.leaf('ram:PersonName', party.contact?.name);
        c.elementIf(party.contact?.phone, 'ram:TelephoneUniversalCommunication', undefined, (t) =>
          t.leaf('ram:CompleteNumber', party.contact?.phone),
        );
        c.elementIf(party.contact?.email, 'ram:EmailURIUniversalCommunication', undefined, (t) =>
          t.leaf('ram:URIID', party.contact?.email),
        );
      });
    }
    writeAddress(x, party.address);
    if (party.electronicAddress) {
      x.element('ram:URIUniversalCommunication', undefined, (u) => {
        u.leaf('ram:URIID', party.electronicAddress?.value, {
          schemeID: party.electronicAddress?.scheme,
        });
      });
    }
    if (party.vatId) {
      x.element('ram:SpecifiedTaxRegistration', undefined, (t) =>
        t.leaf('ram:ID', party.vatId, { schemeID: 'VA' }),
      );
    }
    if (party.taxNumber) {
      x.element('ram:SpecifiedTaxRegistration', undefined, (t) =>
        t.leaf('ram:ID', party.taxNumber, { schemeID: 'FC' }),
      );
    }
  });
}

function writeAddress(w: XmlWriter, address: Party['address']): void {
  w.element('ram:PostalTradeAddress', undefined, (a) => {
    a.leaf('ram:PostcodeCode', address.postcode);
    a.leaf('ram:LineOne', address.line1);
    a.leaf('ram:LineTwo', address.line2);
    a.leaf('ram:CityName', address.city);
    a.leaf('ram:CountryID', address.countryCode);
    a.leaf('ram:CountrySubDivisionName', address.subdivision);
  });
}
