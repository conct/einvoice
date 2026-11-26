import {
  computeTotals
} from "../chunk-74245LUD.js";
import {
  formatAmount,
  round,
  skontobetrag,
  skontofrist
} from "../chunk-OBHDUWZ4.js";

// src/kanzlei/modell.ts
function neueEingangId(jetzt = /* @__PURE__ */ new Date(), zufall = Math.random) {
  return `er_${jetzt.getTime().toString(36)}_${zufall().toString(36).slice(2, 7)}`;
}
function neueLieferantId(jetzt = /* @__PURE__ */ new Date(), zufall = Math.random) {
  return `lf_${jetzt.getTime().toString(36)}_${zufall().toString(36).slice(2, 7)}`;
}
function ausEInvoice(gelesen, dateiname2, jetzt = /* @__PURE__ */ new Date()) {
  const zeit = jetzt.toISOString();
  return {
    quelle: {
      art: "erechnung",
      invoice: gelesen.invoice,
      ausgewiesen: gelesen.declaredTotals,
      syntax: gelesen.syntax,
      ...gelesen.profileId ? { profileId: gelesen.profileId } : {},
      kind: gelesen.kind
    },
    hinweise: hinweiseAus(gelesen),
    dateiname: dateiname2,
    createdAt: zeit,
    updatedAt: zeit
  };
}
function ausFoto(erfasst, bild, jetzt = /* @__PURE__ */ new Date()) {
  const zeit = jetzt.toISOString();
  const hinweise = [];
  if (erfasst.netto !== void 0 && erfasst.steuer !== void 0) {
    const summe = round(erfasst.netto + erfasst.steuer);
    if (Math.abs(summe - erfasst.brutto) > 0.02) {
      hinweise.push(
        `Netto und Steuer ergeben ${summe.toFixed(2)}, als Rechnungsbetrag steht ${erfasst.brutto.toFixed(2)} da.`
      );
    }
  }
  return {
    quelle: {
      art: "foto",
      erfasst,
      zuversicht: bild.zuversicht,
      text: bild.text,
      ...bild.sicherheit ? { sicherheit: bild.sicherheit } : {},
      ...bild.vorlage && bild.vorlage !== "foto" ? { vorlage: bild.vorlage } : {}
    },
    hinweise,
    dateiname: bild.dateiname,
    createdAt: zeit,
    updatedAt: zeit
  };
}
function hinweiseAus(gelesen) {
  const summen = gelesen.totalMismatches.map(
    (ab) => `${ab.field}: im Dokument ${ab.declared.toFixed(2)}, nachgerechnet ${ab.computed.toFixed(2)}`
  );
  const fehler = gelesen.issues.filter((frage) => frage.severity === "error").map((frage) => `${frage.rule}: ${frage.message}`);
  return [...summen, ...fehler, ...gelesen.warnings];
}
function uebersicht(eingang) {
  const quelle = eingang.quelle;
  if (quelle.art === "foto") {
    const erfasst = quelle.erfasst;
    return {
      nummer: erfasst.nummer,
      absender: erfasst.absender,
      datum: erfasst.datum,
      ...erfasst.faellig ? { faellig: erfasst.faellig } : {},
      waehrung: erfasst.waehrung,
      brutto: round(erfasst.brutto),
      zuZahlen: round(erfasst.brutto),
      betrag: formatAmount(round(erfasst.brutto), erfasst.waehrung),
      typ: "380"
    };
  }
  const rechnung = quelle.invoice;
  const nach = computeTotals(rechnung);
  const brutto = quelle.ausgewiesen.grandTotal ?? nach.grandTotal;
  const gezahlt = quelle.ausgewiesen.paidAmount ?? rechnung.paidAmount ?? 0;
  const zuZahlen = quelle.ausgewiesen.duePayable ?? round(brutto - gezahlt);
  return {
    nummer: rechnung.number,
    absender: rechnung.seller.tradingName || rechnung.seller.name,
    datum: rechnung.issueDate,
    ...rechnung.dueDate ? { faellig: rechnung.dueDate } : {},
    waehrung: rechnung.currency,
    brutto: round(brutto),
    zuZahlen: round(zuZahlen),
    betrag: formatAmount(round(zuZahlen), rechnung.currency),
    typ: String(rechnung.typeCode ?? "380")
  };
}
function absenderzug(quelle) {
  if (quelle.art === "foto") {
    const erfasst = quelle.erfasst;
    return {
      name: erfasst.absender,
      ...erfasst.ustId ? { ustId: erfasst.ustId } : {},
      ...erfasst.steuernummer ? { steuernummer: erfasst.steuernummer } : {}
    };
  }
  return absenderzugAusParty(quelle.invoice.seller);
}
function absenderzugAusParty(party) {
  return {
    name: party.name,
    ...party.vatId ? { ustId: party.vatId } : {},
    ...party.taxNumber ? { steuernummer: party.taxNumber } : {},
    ...party.address?.postcode ? { plz: party.address.postcode } : {}
  };
}

// src/kanzlei/status.ts
function heute(jetzt = /* @__PURE__ */ new Date()) {
  return [
    jetzt.getFullYear(),
    String(jetzt.getMonth() + 1).padStart(2, "0"),
    String(jetzt.getDate()).padStart(2, "0")
  ].join("-");
}
function tageBis(ziel, ab) {
  const a = Date.parse(`${ab}T00:00:00Z`);
  const b = Date.parse(`${ziel}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 864e5);
}
function zahlungsstand(eingang, stichtag = heute()) {
  if (eingang.bezahltAm) return "bezahlt";
  const faellig = uebersicht(eingang).faellig;
  if (!faellig) return "offen";
  return faellig < stichtag ? "ueberfaellig" : "offen";
}
function ueberfaelligTage(eingang, stichtag = heute()) {
  if (zahlungsstand(eingang, stichtag) !== "ueberfaellig") return 0;
  const faellig = uebersicht(eingang).faellig;
  return faellig ? Math.max(0, -tageBis(faellig, stichtag)) : 0;
}
function skontochance(eingang, stichtag = heute()) {
  if (eingang.bezahltAm) return void 0;
  if (eingang.quelle.art !== "erechnung") return void 0;
  const rechnung = eingang.quelle.invoice;
  const stufen = rechnung.payment?.skonto ?? [];
  if (stufen.length === 0) return void 0;
  const zuZahlen = uebersicht(eingang).zuZahlen;
  const erreichbar = stufen.map((stufe) => {
    const bis = skontofrist(stufe, rechnung.issueDate);
    const betrag2 = round(skontobetrag(stufe, zuZahlen));
    return { stufe, bis, tage: tageBis(bis, stichtag), betrag: betrag2, zahlbetrag: round(zuZahlen - betrag2) };
  }).filter((chance) => chance.tage >= 0 && chance.betrag > 0).sort((a, b) => b.betrag - a.betrag);
  return erreichbar[0];
}
function offeneSummen(rechnungen, stichtag = heute()) {
  const nach = /* @__PURE__ */ new Map();
  for (const eingang of rechnungen) {
    const stand = zahlungsstand(eingang, stichtag);
    if (stand === "bezahlt") continue;
    const { waehrung, zuZahlen } = uebersicht(eingang);
    const bisher = nach.get(waehrung) ?? { waehrung, summe: 0, anzahl: 0, ueberfaellig: 0 };
    nach.set(waehrung, {
      waehrung,
      summe: round(bisher.summe + zuZahlen),
      anzahl: bisher.anzahl + 1,
      ueberfaellig: stand === "ueberfaellig" ? bisher.ueberfaellig + 1 : bisher.ueberfaellig
    });
  }
  return [...nach.values()].sort((a, b) => b.summe - a.summe);
}

// src/kanzlei/kanzlei.ts
function imZeitraum(rechnungen, zeitraum = {}) {
  return rechnungen.filter((eingang) => {
    const datum = uebersicht(eingang).datum;
    if (zeitraum.von && datum < zeitraum.von) return false;
    if (zeitraum.bis && datum > zeitraum.bis) return false;
    return true;
  }).sort((a, b) => uebersicht(a).datum.localeCompare(uebersicht(b).datum));
}
function dateiname(text) {
  return text.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
var feld = (wert) => {
  const text = (wert ?? "").replace(/"/g, '""');
  return /[;"\n\r]/.test(text) ? `"${text}"` : text;
};
var betrag = (wert) => wert === void 0 ? "" : formatAmount(wert).replace(/\./g, "");
var VORLAGE = { foto: "Foto", pdf: "PDF", datensatz: "E-Rechnung (Felder)" };
var SPALTEN = [
  "Belegdatum",
  "Rechnungsnummer",
  "Lieferant",
  "USt-IdNr.",
  "Steuernummer",
  "Netto",
  "Steuer",
  "Brutto",
  "Waehrung",
  "Faellig",
  "Bezahlt am",
  "Herkunft",
  "Datei",
  "Hinweise"
];
function liste(stuecke, lieferanten) {
  const zeilen = [SPALTEN.join(";")];
  for (const stueck of stuecke) {
    const eingang = stueck.eingang;
    const zeile = uebersicht(eingang);
    const lieferant = lieferanten.find((lf) => lf.id === eingang.lieferantId);
    const quelle = eingang.quelle;
    const netto = quelle.art === "foto" ? quelle.erfasst.netto : quelle.ausgewiesen.taxBasisTotal;
    const steuer = quelle.art === "foto" ? quelle.erfasst.steuer : quelle.ausgewiesen.taxTotal;
    zeilen.push(
      [
        feld(zeile.datum),
        feld(zeile.nummer),
        feld(lieferant?.name ?? zeile.absender),
        feld(lieferant?.ustId ?? (quelle.art === "foto" ? quelle.erfasst.ustId : quelle.invoice.seller.vatId)),
        feld(
          lieferant?.steuernummer ?? (quelle.art === "foto" ? quelle.erfasst.steuernummer : quelle.invoice.seller.taxNumber)
        ),
        feld(betrag(netto)),
        feld(betrag(steuer)),
        feld(betrag(zeile.brutto)),
        feld(zeile.waehrung),
        feld(zeile.faellig),
        feld(eingang.bezahltAm),
        feld(
          quelle.art === "foto" ? `${VORLAGE[quelle.vorlage ?? "foto"]}, ${quelle.sicherheit ?? `${Math.round(quelle.zuversicht)} % erkannt`}` : "E-Rechnung"
        ),
        feld(stueck.name),
        feld(eingang.hinweise.join(" | "))
      ].join(";")
    );
  }
  return zeilen.join("\r\n") + "\r\n";
}
var deutsch = (datum) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.${datum.slice(0, 4)}`;
function liesmich(plan, erzeugtAm, zeitraum = {}, werkzeug = "Rechnungswerk") {
  const spanne = zeitraum.von || zeitraum.bis ? `Zeitraum ${zeitraum.von ? deutsch(zeitraum.von) : "Anfang"} bis ${zeitraum.bis ? deutsch(zeitraum.bis) : "heute"}.` : "Alle abgelegten Belege, ohne Einschraenkung des Zeitraums.";
  const zeilen = [
    "Eingangsrechnungen",
    "",
    `Erzeugt am ${erzeugtAm} mit ${werkzeug}.`,
    spanne,
    `${plan.stuecke.length} Beleg(e), dazu die Liste rechnungen.csv.`,
    "",
    "Die Liste nennt zu jedem Beleg die Datei, in der er liegt. Die Spalte",
    '"Herkunft" sagt, woher die Zahlen stammen:',
    "",
    "  E-Rechnung  Aus dem strukturierten Datensatz gelesen (XRechnung,",
    "              ZUGFeRD/Factur-X). Massgeblich ist diese Datei selbst.",
    "  E-Rechnung (Felder)",
    "              Aus einer E-Rechnung uebernommen, das Dokument selbst liegt",
    "              nicht bei. Die Zahlen stammen aus dem Datensatz.",
    "  PDF         Aus dem Text einer PDF ohne E-Rechnung abgelesen und von",
    "              Hand bestaetigt.",
    "  Foto        Von einem Bild abgelesen und von Hand bestaetigt.",
    "              Daneben steht, wie sicher die Lesung war - als Zuversicht",
    "              der Texterkennung in Prozent, oder in Worten.",
    "",
    "Betraege stehen so, wie sie auf dem Beleg ausgewiesen sind - nicht",
    "nachgerechnet und nicht berichtigt. Wo beim Einlesen etwas auffiel,",
    'steht es in der Spalte "Hinweise".',
    "",
    "Kontiert ist nichts."
  ];
  if (plan.ohneOriginal.length > 0) {
    zeilen.push(
      "",
      `Zu ${plan.ohneOriginal.length} Vorgang/Vorgaengen liegt kein Original bei:`,
      ...plan.ohneOriginal.map((eingang) => {
        const zeile = uebersicht(eingang);
        return `  ${zeile.datum} ${zeile.nummer} ${zeile.absender}`;
      })
    );
  }
  return zeilen.join("\n") + "\n";
}
function paketplan(rechnungen, lieferanten, zeitraum = {}, jetzt = /* @__PURE__ */ new Date(), hatOriginal = (eingang) => Boolean(eingang.anlage), werkzeug) {
  const gewaehlt = imZeitraum(rechnungen, zeitraum);
  const stuecke = [];
  const ohneOriginal = [];
  const vergeben = /* @__PURE__ */ new Set();
  for (const eingang of gewaehlt) {
    if (!hatOriginal(eingang)) {
      ohneOriginal.push(eingang);
      continue;
    }
    const zeile = uebersicht(eingang);
    const lieferant = lieferanten.find((lf) => lf.id === eingang.lieferantId);
    const endung = eingang.dateiname.split(".").pop()?.toLowerCase();
    const stamm = dateiname(
      `${zeile.datum}_${lieferant?.name ?? zeile.absender}_${zeile.nummer}`
    );
    let name = `${stamm}.${endung && /^[a-z0-9]{2,4}$/.test(endung) ? endung : "bin"}`;
    let zaehler = 2;
    while (vergeben.has(name.toLowerCase())) {
      name = `${stamm}-${zaehler}.${endung ?? "bin"}`;
      zaehler += 1;
    }
    vergeben.add(name.toLowerCase());
    stuecke.push({ name, eingang });
  }
  const bis = zeitraum.bis ?? heute(jetzt);
  const ohneText = {
    stuecke,
    ohneOriginal,
    liste: liste(stuecke, lieferanten),
    archivname: `${dateiname(`eingangsrechnungen_${zeitraum.von ?? "anfang"}_bis_${bis}`)}.zip`
  };
  return { ...ohneText, liesmich: liesmich(ohneText, deutsch(heute(jetzt)), zeitraum, werkzeug) };
}
function paketumfang(rechnungen, zeitraum = {}, stichtag) {
  const gewaehlt = imZeitraum(rechnungen, zeitraum);
  return {
    anzahl: gewaehlt.length,
    offen: gewaehlt.filter((eingang) => zahlungsstand(eingang, stichtag) !== "bezahlt").length
  };
}
export {
  absenderzug,
  absenderzugAusParty,
  ausEInvoice,
  ausFoto,
  dateiname,
  heute,
  hinweiseAus,
  imZeitraum,
  liesmich,
  liste,
  neueEingangId,
  neueLieferantId,
  offeneSummen,
  paketplan,
  paketumfang,
  skontochance,
  tageBis,
  ueberfaelligTage,
  uebersicht,
  zahlungsstand
};
