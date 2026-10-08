/**
 * Welche Dienstadressen zulaessig sind.
 *
 * Eine Regel, drei Anwender: die Einstellung in der App, die Pruefung eines
 * Lizenzschluessels mit `dienst`, und das Ausstellungswerkzeug. Lagen sie
 * auseinander, koennte ein Werkzeug etwas ausstellen, das die App danach
 * ablehnt - der Kunde haette bezahlt und stuende vor einer Fehlermeldung.
 *
 * ## Warum nicht einfach "nur https"
 *
 * Das war die erste Fassung, und sie war falsch. Fuer einen Dienst im eigenen
 * Netz - ein Raspberry Pi unter dem Schreibtisch, ein NAS im Serverschrank -
 * gibt es kein oeffentliches Zertifikat: Keine Zertifizierungsstelle stellt
 * eines fuer 192.168.1.50 aus, und das ist auch richtig so, denn diese Adresse
 * gehoert in jedem Netz jemand anderem.
 *
 * "Nur https" haette damit ausgerechnet den Fall ausgeschlossen, der bei
 * Rechnungsdaten am ueberzeugendsten ist: Die Daten verlassen das Gebaeude
 * nicht.
 *
 * ## Die Regel
 *
 *  - **https ueberall.** Der Normalfall, keine Einschraenkung.
 *  - **http nur im eigenen Netz** - Rueckschleife, die privaten Bereiche nach
 *    RFC 1918, die Verbindungslokalen nach RFC 3927, und Namen auf `.local`.
 *  - **http sonst nirgends.** Ueber diese Verbindung gehen Kundennamen, Preise
 *    und Margen; im offenen Netz liest sie jeder mit, der dazwischen sitzt.
 *
 * ## Was diese Regel nicht leistet
 *
 * Sie schuetzt nicht vor jemandem, der **im selben Netz sitzt** - im
 * Hotel-WLAN oder im Gaestenetz eines Kunden. Wer dort eine private Adresse
 * eintraegt, vertraut dem Netz. Das ist eine bewusste Abwaegung: Ein
 * Firmennetz, dem man nicht traut, hat groessere Probleme als diese App.
 */

export type Adressbefund =
  | { gut: true; adresse: string; oertlich: boolean }
  | { gut: false; grund: string };

/** Adressen, die ausschliesslich im eigenen Netz erreichbar sind. */
function imEigenenNetz(rechner: string): boolean {
  const name = rechner.toLowerCase();

  // Rueckschleife: derselbe Rechner.
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (name === '::1' || name === '[::1]') return true;
  if (/^127\./.test(name)) return true;

  // Namen, die per mDNS im eigenen Netz aufgeloest werden - "himbeere.local".
  if (name.endsWith('.local')) return true;

  // IPv4 aus den privaten Bereichen (RFC 1918) und dem verbindungslokalen
  // Bereich (RFC 3927, 169.254.0.0/16).
  const vier = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name);
  if (vier) {
    const [a, b] = [Number(vier[1]), Number(vier[2])];
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  // IPv6: eindeutig lokale Adressen (fc00::/7) und verbindungslokale
  // (fe80::/10). URL.hostname liefert sie in eckigen Klammern.
  const sechs = name.replace(/^\[|\]$/g, '');
  if (/^f[cd][0-9a-f]{2}:/.test(sechs)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(sechs)) return true;

  return false;
}

/**
 * Prueft eine eingegebene oder ausgestellte Dienstadresse.
 *
 * Gibt die bereinigte Adresse zurueck - ohne abschliessenden Schraegstrich,
 * damit die Aufrufer sie ohne weiteres Zutun zusammensetzen koennen.
 */
/**
 * Minimale Deklaration von URL - absichtlich hier und nicht global.
 *
 * Node, Browser und die React-Native-Engines Hermes und JSC kennen URL alle,
 * die Typen dafuer stehen aber in der DOM- bzw. der Node-Bibliothek. Die
 * Kernbibliothek bindet keine von beiden ein, denn sonst wuerde sie Globals
 * vorgaukeln, die auf einer der Plattformen fehlen.
 *
 * Global deklariert verdeckte diese Fassung aber auch das echte URL von Node -
 * und damit brach `readFile(new URL(...))` in assets/node.ts. Deshalb steht
 * sie nur in dieser Datei. Deklariert ist, was pruefeDienstadresse braucht;
 * das ist zugleich die Liste dessen, was eine Umgebung koennen muss.
 *
 * Der Konstruktor wirft bei einer unbrauchbaren Eingabe; die aufrufende Stelle
 * faengt das ab und macht daraus eine Meldung fuer den Nutzer.
 */
interface MinimaleUrl {
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly href: string;
}
declare const URL: { new (input: string, base?: string): MinimaleUrl };

export function pruefeDienstadresse(eingabe: string): Adressbefund {
  const text = eingabe.trim().replace(/\/+$/, '');
  if (!text) return { gut: false, grund: 'Bitte eine Adresse eingeben.' };

  let zerlegt: MinimaleUrl;
  try {
    zerlegt = new URL(text);
  } catch {
    return {
      gut: false,
      grund: 'Das ist keine gueltige Adresse. Beispiel: https://rechnungen.firma.de/api',
    };
  }

  if (zerlegt.protocol === 'https:') {
    return { gut: true, adresse: text, oertlich: imEigenenNetz(zerlegt.hostname) };
  }

  if (zerlegt.protocol !== 'http:') {
    return { gut: false, grund: 'Die Adresse muss mit https:// oder http:// beginnen.' };
  }

  if (imEigenenNetz(zerlegt.hostname)) {
    return { gut: true, adresse: text, oertlich: true };
  }

  return {
    gut: false,
    grund:
      'Ohne Verschluesselung geht das nur im eigenen Netz. Ueber diese Verbindung gehen ' +
      'Kundennamen, Preise und Margen - im offenen Netz liest sie jeder mit, der dazwischen ' +
      'sitzt. Verwenden Sie https, oder eine Adresse im eigenen Netz.',
  };
}
