import {
  decimal,
  round,
  sum
} from "./chunk-OBHDUWZ4.js";

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

export {
  lineNetAmount,
  computeTotals,
  summarizeTotals
};
