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
  skontosatz
};
