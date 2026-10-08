import {
  fromBase64,
  toBase64,
  utf8Decode,
  utf8Encode
} from "./chunk-BJGX7GXP.js";

// src/lizenz/dienstadresse.ts
function imEigenenNetz(rechner) {
  const name = rechner.toLowerCase();
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (name === "::1" || name === "[::1]") return true;
  if (/^127\./.test(name)) return true;
  if (name.endsWith(".local")) return true;
  const vier = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name);
  if (vier) {
    const [a, b] = [Number(vier[1]), Number(vier[2])];
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  const sechs = name.replace(/^\[|\]$/g, "");
  if (/^f[cd][0-9a-f]{2}:/.test(sechs)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(sechs)) return true;
  return false;
}
function pruefeDienstadresse(eingabe) {
  const text = eingabe.trim().replace(/\/+$/, "");
  if (!text) return { gut: false, grund: "Bitte eine Adresse eingeben." };
  let zerlegt;
  try {
    zerlegt = new URL(text);
  } catch {
    return {
      gut: false,
      grund: "Das ist keine gueltige Adresse. Beispiel: https://rechnungen.firma.de/api"
    };
  }
  if (zerlegt.protocol === "https:") {
    return { gut: true, adresse: text, oertlich: imEigenenNetz(zerlegt.hostname) };
  }
  if (zerlegt.protocol !== "http:") {
    return { gut: false, grund: "Die Adresse muss mit https:// oder http:// beginnen." };
  }
  if (imEigenenNetz(zerlegt.hostname)) {
    return { gut: true, adresse: text, oertlich: true };
  }
  return {
    gut: false,
    grund: "Ohne Verschluesselung geht das nur im eigenen Netz. Ueber diese Verbindung gehen Kundennamen, Preise und Margen - im offenen Netz liest sie jeder mit, der dazwischen sitzt. Verwenden Sie https, oder eine Adresse im eigenen Netz."
  };
}

// src/lizenz/schluessel.ts
var KENNUNG = "EW1";
var ALGORITHMUS = { name: "ECDSA", namedCurve: "P-256" };
var SIGNATUR = { name: "ECDSA", hash: "SHA-256" };
function krypto() {
  const vorhanden = globalThis.crypto?.subtle;
  if (!vorhanden) {
    throw new Error(
      "Auf diesem Geraet lassen sich Lizenzschluessel nicht pruefen. Im Browser funktioniert es; auf dem Telefon laeuft der Kauf ueber den Store."
    );
  }
  return vorhanden;
}
var zuBase64Url = (bytes) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
var ausBase64Url = (text) => {
  const aufgefuellt = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(aufgefuellt + "=".repeat((4 - aufgefuellt.length % 4) % 4));
};
var textZuBytes = utf8Encode;
async function erzeugeSchluesselpaar() {
  const paar = await krypto().generateKey(ALGORITHMUS, true, ["sign", "verify"]);
  return {
    privat: await krypto().exportKey("jwk", paar.privateKey),
    oeffentlich: await krypto().exportKey("jwk", paar.publicKey)
  };
}
async function stelleSchluesselAus(inhalt, privat) {
  const schluessel = await krypto().importKey("jwk", privat, ALGORITHMUS, false, ["sign"]);
  const rumpf = zuBase64Url(textZuBytes(JSON.stringify(inhalt)));
  const signatur = await krypto().sign(SIGNATUR, schluessel, textZuBytes(rumpf));
  return `${KENNUNG}.${rumpf}.${zuBase64Url(new Uint8Array(signatur))}`;
}
async function pruefeSchluessel(eingabe, oeffentlich, heute) {
  const teile = eingabe.replace(/\s+/g, "").split(".");
  if (teile.length !== 3) return { gueltig: false, grund: "Das ist kein vollstaendiger Schluessel." };
  const [kennung, rumpf, signatur] = teile;
  if (kennung !== KENNUNG) {
    return { gueltig: false, grund: "Unbekannte Schluesselfassung. Bitte neuen Schluessel anfordern." };
  }
  let echt = false;
  try {
    const pruefschluessel = await krypto().importKey("jwk", oeffentlich, ALGORITHMUS, false, ["verify"]);
    echt = await krypto().verify(SIGNATUR, pruefschluessel, ausBase64Url(signatur), textZuBytes(rumpf));
  } catch {
    return { gueltig: false, grund: "Der Schluessel ist beschaedigt." };
  }
  if (!echt) return { gueltig: false, grund: "Die Signatur stimmt nicht. Der Schluessel ist nicht von uns." };
  let inhalt;
  try {
    inhalt = JSON.parse(utf8Decode(ausBase64Url(rumpf)));
  } catch {
    return { gueltig: false, grund: "Der Schluessel ist beschaedigt." };
  }
  if (inhalt.v !== 1) {
    return { gueltig: false, grund: "Unbekannte Schluesselfassung. Bitte neuen Schluessel anfordern." };
  }
  if (inhalt.stufe !== "pro" && inhalt.stufe !== "buero") {
    return { gueltig: false, grund: "Der Schluessel nennt eine unbekannte Stufe." };
  }
  if (inhalt.bis && inhalt.bis < heute) {
    return { gueltig: false, grund: `Der Schluessel ist am ${inhalt.bis} abgelaufen.` };
  }
  if (inhalt.dienst !== void 0) {
    if (typeof inhalt.dienst !== "string" || !pruefeDienstadresse(inhalt.dienst).gut) {
      return { gueltig: false, grund: "Der Schluessel nennt keine zulaessige Dienstadresse." };
    }
    if (inhalt.stufe !== "buero") {
      return {
        gueltig: false,
        grund: "Nur ein Buero-Schluessel darf eine Dienstadresse nennen."
      };
    }
  }
  return { gueltig: true, ...inhalt };
}
var PRODUKTE = {
  pro: {
    stufe: "pro",
    monate: void 0,
    pflegeMonate: 12,
    cent: 3900,
    beschreibung: "Pro, einmalig - unbefristet nutzbar, zwoelf Monate Aktualisierungen"
  },
  "buero-monat": {
    stufe: "buero",
    monate: 1,
    pflegeMonate: 1,
    cent: 900,
    beschreibung: "Buero, ein Monat"
  },
  "buero-jahr": {
    stufe: "buero",
    monate: 12,
    pflegeMonate: 12,
    cent: 9900,
    beschreibung: "Buero, zwoelf Monate"
  }
};
function istProdukt(name) {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(PRODUKTE, name);
}
function euroText(cent) {
  const [ganz, rest] = [Math.trunc(cent / 100), Math.abs(cent % 100)];
  return rest === 0 ? `${ganz} EUR` : `${ganz},${String(rest).padStart(2, "0")} EUR`;
}
function laufzeitBis(ab, monate) {
  const [jahr, monat, tag] = ab.split("-").map(Number);
  const zielMonat = monat - 1 + monate;
  const letzterImZielmonat = new Date(Date.UTC(jahr, zielMonat + 1, 0)).getUTCDate();
  const ziel = new Date(Date.UTC(jahr, zielMonat, Math.min(tag, letzterImZielmonat)));
  return ziel.toISOString().slice(0, 10);
}
function anschlussBis(monate, heute, bisher) {
  const beginn = bisher && bisher > heute ? bisher : heute;
  return laufzeitBis(beginn, monate);
}

export {
  pruefeDienstadresse,
  erzeugeSchluesselpaar,
  stelleSchluesselAus,
  pruefeSchluessel,
  PRODUKTE,
  istProdukt,
  euroText,
  laufzeitBis,
  anschlussBis
};
