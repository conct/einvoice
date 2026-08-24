import type { AllowanceCharge, Invoice, Line, Vat } from './invoice';
import { decimal, round, sum } from '../util/money';

/** Ein Eintrag der Umsatzsteueraufschluesselung, BG-23 */
export interface VatBreakdownEntry {
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
export interface InvoiceTotals {
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

/** Schluessel fuer die Gruppierung der Steueraufschluesselung */
function vatKey(vat: Pick<Vat, 'category' | 'rate'>): string {
  return `${vat.category}:${round(vat.rate, 2)}`;
}

/**
 * BT-131: Menge mal Einzelpreis, bezogen auf die Preisbasismenge, danach die
 * Zu- und Abschlaege der Position. Es wird erst am Ende gerundet, damit
 * Stueckpreise mit vier Nachkommastellen nicht vorzeitig Cents verlieren.
 */
export function lineNetAmount(line: Line): number {
  const base = line.priceBaseQuantity && line.priceBaseQuantity > 0 ? line.priceBaseQuantity : 1;
  const net = (line.quantity * line.unitPrice) / base;
  const adjustments = line.allowancesCharges.reduce(
    (acc, ac) => acc + (ac.isCharge ? ac.amount : -ac.amount),
    0,
  );
  return round(net + adjustments, 2);
}

/** Netto-Basis eines Zu-/Abschlags mit Vorzeichen aus Sicht der Bemessungsgrundlage */
function signedAmount(ac: AllowanceCharge): number {
  return ac.isCharge ? ac.amount : -ac.amount;
}

/**
 * Rechnet die komplette Rechnung nach den BR-CO-Regeln der EN 16931 durch.
 * Die Steuer wird je Kategorie/Satz-Gruppe berechnet, nicht je Position -
 * das ist der haeufigste Grund fuer Cent-Abweichungen in fremden Erzeugern.
 */
export function computeTotals(invoice: Invoice): InvoiceTotals {
  const lineAmounts = invoice.lines.map(lineNetAmount);
  const lineTotal = sum(lineAmounts);

  const docAllowances = invoice.allowancesCharges.filter((ac) => !ac.isCharge);
  const docCharges = invoice.allowancesCharges.filter((ac) => ac.isCharge);
  const allowanceTotal = sum(docAllowances.map((ac) => ac.amount));
  const chargeTotal = sum(docCharges.map((ac) => ac.amount));
  const taxBasisTotal = round(lineTotal - allowanceTotal + chargeTotal, 2);

  // Bemessungsgrundlagen je Steuergruppe sammeln
  const groups = new Map<string, VatBreakdownEntry>();
  const touch = (vat: Vat): VatBreakdownEntry => {
    const key = vatKey(vat);
    let entry = groups.get(key);
    if (!entry) {
      entry = { category: vat.category, rate: round(vat.rate, 2), taxableAmount: 0, taxAmount: 0 };
      groups.set(key, entry);
    }
    // Der Befreiungsgrund darf pro Gruppe nur einmal vorkommen; der erste gewinnt.
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

  const vatBreakdown = [...groups.values()]
    .map((entry) => {
      const taxableAmount = round(entry.taxableAmount, 2);
      return {
        ...entry,
        taxableAmount,
        taxAmount: round((taxableAmount * entry.rate) / 100, 2),
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.rate - b.rate);

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
    vatBreakdown,
  };
}

/** Kurzform fuer Debug-Ausgaben und Testvergleiche */
export function summarizeTotals(totals: InvoiceTotals): string {
  return [
    `netto=${decimal(totals.taxBasisTotal)}`,
    `ust=${decimal(totals.taxTotal)}`,
    `brutto=${decimal(totals.grandTotal)}`,
    `zahlbar=${decimal(totals.duePayable)}`,
  ].join(' ');
}
