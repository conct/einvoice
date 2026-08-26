/**
 * Lizenzschluessel: ausstellen und pruefen.
 *
 * Warum hier und nicht in der App: Ausgestellt wird auf dem Rechner des
 * Anbieters (tools/lizenz), geprueft wird in der App. Beide Seiten muessen
 * sich ueber Format und Signatur bis aufs Byte einig sein - also gehoert es an
 * die eine Stelle, die beide einbinden. Fachlich ist es kein E-Rechnungsthema;
 * es liegt hier, weil dies die gemeinsame Bibliothek des Projekts ist.
 *
 * Warum ueberhaupt: Auf iOS und Android weist der Store-Beleg den Kauf nach.
 * Im Browser gibt es keinen - dort waere die bezahlte Stufe nur ein Eintrag im
 * localStorage, den jeder mit der Entwicklerkonsole setzen kann. Siehe
 * docs/monetarisierung.md, Abschnitt 11.
 *
 * Was das Verfahren leistet und was nicht:
 *
 *  - Es beweist, dass ein Schluessel von uns stammt und unveraendert ist.
 *  - Es beweist NICHT, dass er dem gehoert, der ihn einloest. Ein Schluessel
 *    laesst sich weitergeben. Dagegen hilft nur, die Kaeufer-E-Mail sichtbar
 *    in der App anzuzeigen - soziale Hemmung statt Technik, passend zur
 *    Haltung "kein DRM".
 *  - Es kann einen ausgegebenen Schluessel nicht zurueckziehen. Deshalb hat
 *    alles Wiederkehrende ein Ablaufdatum.
 *
 * ECDSA ueber P-256 und nicht Ed25519: crypto.subtle kann P-256 in jedem
 * Browser, Ed25519 erst in neueren. Der private Schluessel liegt
 * ausschliesslich beim Anbieter und niemals im App-Bundle.
 */

import { fromBase64, toBase64, utf8Decode, utf8Encode } from '../util/base64';

/**
 * Nur der Ausschnitt von WebCrypto, der hier gebraucht wird.
 *
 * Das Paket bindet bewusst keine DOM-Typen ein (siehe Kopf von index.ts).
 * WebCrypto gibt es in Node ab Fassung 18 und in jedem Browser; die Typen
 * dafuer stecken aber in der DOM-Bibliothek. Statt sie hereinzuholen, steht
 * hier, was benutzt wird - das ist zugleich die Liste dessen, was eine
 * Umgebung koennen muss.
 */
export type Schluesselmaterial = Record<string, unknown>;

interface KryptoSchluessel {
  readonly type: string;
}

interface Krypto {
  generateKey(
    algorithmus: object,
    exportierbar: boolean,
    verwendung: string[],
  ): Promise<{ privateKey: KryptoSchluessel; publicKey: KryptoSchluessel }>;
  exportKey(format: 'jwk', schluessel: KryptoSchluessel): Promise<Schluesselmaterial>;
  importKey(
    format: 'jwk',
    material: Schluesselmaterial,
    algorithmus: object,
    exportierbar: boolean,
    verwendung: string[],
  ): Promise<KryptoSchluessel>;
  sign(algorithmus: object, schluessel: KryptoSchluessel, daten: Uint8Array): Promise<ArrayBuffer>;
  verify(
    algorithmus: object,
    schluessel: KryptoSchluessel,
    signatur: Uint8Array,
    daten: Uint8Array,
  ): Promise<boolean>;
}

/** Stufen, die ein Schluessel freischalten kann. Frei braucht keinen. */
export type LizenzStufe = 'pro' | 'buero';

export interface LizenzInhalt {
  /** Fassung des Formats. Aendert sich das Format, faellt Altes sauber durch. */
  v: 1;
  stufe: LizenzStufe;
  /** E-Mail des Kaeufers - wird in der App angezeigt, nicht geprueft. */
  email: string;
  /** Kennung des Kaufs beim Zahlungsdienst, fuer Rueckfragen und Support. */
  kauf: string;
  /** Ausstellungstag, YYYY-MM-DD */
  ab: string;
  /**
   * Letzter Nutzungstag, YYYY-MM-DD. Fehlt bei unbefristeten Kaeufen.
   *
   * Nach diesem Tag faellt die App auf die kostenlose Stufe zurueck. Nur fuer
   * Wiederkehrendes (Buero) gesetzt.
   */
  bis?: string;

  /**
   * Letzter Tag mit Anspruch auf Aktualisierungen, YYYY-MM-DD.
   *
   * Bewusst getrennt von `bis`: Ein gekaufter Pro-Zugang bleibt unbefristet
   * nutzbar, die Pflege ist befristet. Wer eine Rechnung schreiben muss, darf
   * nicht an einem Stichtag stehenbleiben - E-Rechnung ist eine gesetzliche
   * Pflicht, keine Bequemlichkeit. Der Anreiz zum Nachkaufen liegt in neuen
   * Fassungen, nicht in einer Sperre.
   *
   * Heute wird daraus nichts abgeleitet ausser einer Anzeige. Das Feld steht
   * jetzt im Format, damit spaeter nicht jeder ausgegebene Schluessel neu
   * ausgestellt werden muss.
   */
  pflege?: string;
}

export type Lizenzbefund =
  | ({ gueltig: true } & LizenzInhalt)
  | { gueltig: false; grund: string };

const KENNUNG = 'EW1';
const ALGORITHMUS = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGNATUR = { name: 'ECDSA', hash: 'SHA-256' } as const;

function krypto(): Krypto {
  // Ueber unknown, weil globalThis je nach Umgebung schon ein crypto kennt -
  // in der App mit DOM-Typen, in der Kernbibliothek ohne. Ein direkter
  // Uebergang waere nur dort erlaubt, wo die Typen sich ueberschneiden.
  const vorhanden = (globalThis as unknown as { crypto?: { subtle?: Krypto } }).crypto?.subtle;
  if (!vorhanden) {
    // React Native bringt crypto.subtle nicht mit. Dort laeuft der Kauf ueber
    // den Store, der Schluessel ist der Weg fuer den Browser.
    throw new Error(
      'Auf diesem Geraet lassen sich Lizenzschluessel nicht pruefen. ' +
        'Im Browser funktioniert es; auf dem Telefon laeuft der Kauf ueber den Store.',
    );
  }
  return vorhanden;
}

// Base64 in der Fassung fuer Adressen: Ein Schluessel wird kopiert, verschickt
// und eingefuegt - "+" und "/" ueberleben das nicht zuverlaessig.
const zuBase64Url = (bytes: Uint8Array): string =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const ausBase64Url = (text: string): Uint8Array => {
  const aufgefuellt = text.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(aufgefuellt + '='.repeat((4 - (aufgefuellt.length % 4)) % 4));
};

const textZuBytes = utf8Encode;

/** Erzeugt ein neues Schluesselpaar. Laeuft einmal, beim Einrichten. */
export async function erzeugeSchluesselpaar(): Promise<{ privat: Schluesselmaterial; oeffentlich: Schluesselmaterial }> {
  const paar = await krypto().generateKey(ALGORITHMUS, true, ['sign', 'verify']);
  return {
    privat: await krypto().exportKey('jwk', paar.privateKey),
    oeffentlich: await krypto().exportKey('jwk', paar.publicKey),
  };
}

/**
 * Stellt einen Schluessel aus. Nur beim Anbieter, mit dem privaten Schluessel.
 */
export async function stelleSchluesselAus(inhalt: LizenzInhalt, privat: Schluesselmaterial): Promise<string> {
  const schluessel = await krypto().importKey('jwk', privat, ALGORITHMUS, false, ['sign']);
  const rumpf = zuBase64Url(textZuBytes(JSON.stringify(inhalt)));
  const signatur = await krypto().sign(SIGNATUR, schluessel, textZuBytes(rumpf));
  return `${KENNUNG}.${rumpf}.${zuBase64Url(new Uint8Array(signatur))}`;
}

/**
 * Prueft einen Schluessel.
 *
 * Gibt bewusst einen Befund zurueck und wirft nicht: Ein falsch abgetippter
 * Schluessel ist keine Ausnahme, sondern ein Fall, der dem Nutzer erklaert
 * werden muss.
 *
 * `heute` wird hereingereicht statt aus der Uhr gelesen - so laesst sich der
 * Ablauf pruefen, ohne die Systemzeit zu stellen.
 */
export async function pruefeSchluessel(
  eingabe: string,
  oeffentlich: Schluesselmaterial,
  heute: string,
): Promise<Lizenzbefund> {
  // Leerzeichen und Zeilenumbrueche entstehen beim Kopieren aus einer E-Mail.
  const teile = eingabe.replace(/\s+/g, '').split('.');
  if (teile.length !== 3) return { gueltig: false, grund: 'Das ist kein vollstaendiger Schluessel.' };

  const [kennung, rumpf, signatur] = teile as [string, string, string];
  if (kennung !== KENNUNG) {
    return { gueltig: false, grund: 'Unbekannte Schluesselfassung. Bitte neuen Schluessel anfordern.' };
  }

  let echt = false;
  try {
    const pruefschluessel = await krypto().importKey('jwk', oeffentlich, ALGORITHMUS, false, ['verify']);
    echt = await krypto().verify(SIGNATUR, pruefschluessel, ausBase64Url(signatur), textZuBytes(rumpf));
  } catch {
    return { gueltig: false, grund: 'Der Schluessel ist beschaedigt.' };
  }
  if (!echt) return { gueltig: false, grund: 'Die Signatur stimmt nicht. Der Schluessel ist nicht von uns.' };

  let inhalt: LizenzInhalt;
  try {
    inhalt = JSON.parse(utf8Decode(ausBase64Url(rumpf))) as LizenzInhalt;
  } catch {
    return { gueltig: false, grund: 'Der Schluessel ist beschaedigt.' };
  }

  if (inhalt.v !== 1) {
    return { gueltig: false, grund: 'Unbekannte Schluesselfassung. Bitte neuen Schluessel anfordern.' };
  }
  if (inhalt.stufe !== 'pro' && inhalt.stufe !== 'buero') {
    return { gueltig: false, grund: 'Der Schluessel nennt eine unbekannte Stufe.' };
  }
  if (inhalt.bis && inhalt.bis < heute) {
    return { gueltig: false, grund: `Der Schluessel ist am ${inhalt.bis} abgelaufen.` };
  }

  return { gueltig: true, ...inhalt };
}

/**
 * Laufzeit eines Kaufs in Tagen beziehungsweise Monaten.
 *
 * Die Zuordnung steht hier und nicht im Ausstellungswerkzeug, damit App und
 * Werkzeug dieselbe Vorstellung davon haben, was gekauft wurde.
 */
export const PRODUKTE = {
  pro: {
    stufe: 'pro' as const,
    monate: undefined,
    pflegeMonate: 12,
    cent: 3900,
    beschreibung: 'Pro, einmalig - unbefristet nutzbar, zwoelf Monate Aktualisierungen',
  },
  'buero-monat': {
    stufe: 'buero' as const,
    monate: 1,
    pflegeMonate: 1,
    cent: 900,
    beschreibung: 'Buero, ein Monat',
  },
  'buero-jahr': {
    stufe: 'buero' as const,
    monate: 12,
    pflegeMonate: 12,
    cent: 9900,
    beschreibung: 'Buero, zwoelf Monate',
  },
} satisfies Record<
  string,
  {
    stufe: LizenzStufe;
    monate: number | undefined;
    pflegeMonate: number;
    cent: number;
    beschreibung: string;
  }
>;

export type Produkt = keyof typeof PRODUKTE;

export function istProdukt(name: unknown): name is Produkt {
  // Nicht Object.hasOwn: das ist ES2022, und der Kern steht bewusst auf
  // ES2020, weil er auf aelteren React-Native-Engines laufen muss. Die
  // Zielversion hochzudrehen wuerde hier uebersetzen und dort abstuerzen.
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(PRODUKTE, name);
}

/**
 * Preis in Euro, deutsch geschrieben.
 *
 * Gerechnet wird durchgehend in Cent - Zahlungsdienste tun es auch, und ein
 * Gleitkommabetrag fuer Geld ist eine Fehlerquelle, die man nicht braucht.
 */
export function euroText(cent: number): string {
  const [ganz, rest] = [Math.trunc(cent / 100), Math.abs(cent % 100)];
  return rest === 0 ? `${ganz} EUR` : `${ganz},${String(rest).padStart(2, '0')} EUR`;
}

/**
 * Letzter Gueltigkeitstag bei einer Laufzeit in Monaten.
 *
 * Gerechnet wird in Monaten und nicht in 30-Tage-Schritten: Wer am 31. Januar
 * bucht, erwartet den 28. Februar und nicht den 2. Maerz. Faellt der Stichtag
 * auf einen Tag, den es im Zielmonat nicht gibt, wird auf dessen letzten Tag
 * zurueckgesetzt.
 */
export function laufzeitBis(ab: string, monate: number): string {
  const [jahr, monat, tag] = ab.split('-').map(Number) as [number, number, number];
  const zielMonat = monat - 1 + monate;
  const letzterImZielmonat = new Date(Date.UTC(jahr, zielMonat + 1, 0)).getUTCDate();
  const ziel = new Date(Date.UTC(jahr, zielMonat, Math.min(tag, letzterImZielmonat)));
  return ziel.toISOString().slice(0, 10);
}

/**
 * Letzter Gueltigkeitstag, wenn ein Zeitraum nachgekauft wird.
 *
 * Gerechnet wird ab heute - oder, wenn noch Laufzeit uebrig ist, ab deren
 * Ende. Wer im letzten Monat seines Jahresbezugs nachkauft, verschenkt so
 * keinen Tag. Das entspricht Paragraf 4 Absatz 3 der Geschaeftsbedingungen:
 * gezahlt wird fuer einen Zeitraum im Voraus, nicht fuer ein Datum.
 *
 * Steht hier und nicht beim Aufrufer, weil es dieselbe Datumsrechnung ist wie
 * laufzeitBis - und weil es dort, wo es gebraucht wird (der Store-Kauf in der
 * App), neben einem nativen Modul liegt und damit nicht pruefbar waere.
 *
 * `bisher` ist der bisherige letzte Gueltigkeitstag oder undefined, wenn nichts
 * laeuft. Liegt er in der Vergangenheit, zaehlt er nicht mehr.
 */
export function anschlussBis(monate: number, heute: string, bisher?: string): string {
  const beginn = bisher && bisher > heute ? bisher : heute;
  return laufzeitBis(beginn, monate);
}
