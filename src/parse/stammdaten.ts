import { isPlausibleIban, isPlausibleLeitwegId, isPlausibleVatId } from '../model/validate';

/**
 * Stammdaten aus einer fremden Rechnung herausholen.
 *
 * Der Anlass: Die erste Huerde der App ist nicht die Rechnung, sondern der
 * Absender. Ohne Firmenname, Anschrift und Steuernummer laesst sich keine
 * gueltige Rechnung erzeugen - und wer umsteigt, hat all das schon auf seiner
 * alten Rechnung stehen. Es abzutippen ist die unnoetigste Arbeit des ganzen
 * Umzugs.
 *
 * ## Nach Sicherheit getrennt, nicht nach Feld
 *
 * Eine IBAN traegt eine Pruefsumme: Was den Mod-97-Test besteht, ist keine
 * Vermutung, sondern ein Befund. Ein Firmenname dagegen ist die Zeile ueber der
 * Strasse - mehr nicht. Beides gleich zu behandeln waere der Fehler, der sich
 * hinterher in jeder erzeugten Rechnung wiederholt.
 *
 * Deshalb traegt jeder Fund seine Sicherheit und seinen Beleg mit sich, und die
 * Oberflaeche kann Gepruefte anders anbieten als Geratene.
 *
 * ## Was ausdruecklich nicht gesucht wird
 *
 * **Rechnungsnummer und Rechnungsdatum.** Beide vergibt die App selbst - die
 * Nummer beim Festschreiben aus dem eigenen Nummernkreis, das Datum ist heute.
 * Sie aus einer alten Rechnung zu uebernehmen waere nicht nur nutzlos, sondern
 * gefaehrlich: Eine doppelt vergebene Rechnungsnummer verstoesst gegen
 * Paragraf 14 Absatz 4 UStG.
 *
 * **Wer Absender und wer Empfaenger ist.** Auf einer Rechnung stehen beide
 * Anschriften, und welche welche ist, haengt am Aufbau der Vorlage. Diese Datei
 * gibt beide in der Reihenfolge des Dokuments zurueck; die Zuordnung trifft ein
 * Mensch. Eine Verwechslung waere der teuerste Fehler ueberhaupt - man
 * verschickte Rechnungen unter fremdem Namen.
 */

export type Sicherheit =
  /** Ein Verfahren bestaetigt es - etwa die IBAN-Pruefsumme. */
  | 'geprueft'
  /** Die Form stimmt, geprueft ist sie nicht. */
  | 'muster'
  /** Aus der Umgebung geschlossen. */
  | 'geraten';

export type Feld =
  | 'name'
  /** Die Person, an die adressiert ist - "Hr. Christian Ranacher". */
  | 'ansprechpartner'
  | 'strasse'
  | 'plz'
  | 'ort'
  | 'iban'
  | 'bic'
  | 'ustId'
  | 'steuernummer'
  | 'leitwegId';

export interface Fund {
  feld: Feld;
  wert: string;
  sicherheit: Sicherheit;
  /** Die Zeile, in der es stand - damit der Nutzer nachsehen kann. */
  beleg: string;
}

export interface Anschrift {
  /** Die Zeilen, aus denen sie gebildet wurde. */
  beleg: string[];
  felder: Fund[];
}

export interface Stammdatenfund {
  /**
   * Gefundene Anschriften in der Reihenfolge des Dokuments. Welche der
   * eigenen ist, entscheidet der Nutzer.
   */
  anschriften: Anschrift[];
  /** Kennungen, die zu keiner Anschrift gehoeren muessen - IBAN, Steuernummer. */
  angaben: Fund[];
}

// --- Einzelne Muster --------------------------------------------------------

/** Eine deutsche Postleitzahl mit Ort: "20457 Hamburg". */
const PLZ_ORT = /\b(\d{5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .\-/]{1,40}?)\s*$/;

/** Eine Strasse endet auf eine Hausnummer: "Speicherstrasse 14", "Am Markt 3a". */
const STRASSE = /^(.*[A-Za-zÄÖÜäöüß.])\s+(\d+\s?[a-zA-Z]?(?:\s*[-/]\s*\d+\s?[a-zA-Z]?)?)$/;

const IBAN_KANDIDAT = /\b([A-Z]{2}\d{2}[\dA-Z\s]{10,34})\b/g;
/**
 * Umsatzsteuer-Identifikationsnummern beginnen mit einem Laendercode.
 *
 * Beschraenkt auf die tatsaechlich vergebenen Praefixe, und der Buchstabe
 * davor darf keiner sein: "Leitweg-ID 04011000-12345-67" lieferte sonst
 * "ID04011000" als angebliche Steuernummer - nachgemessen an einer erzeugten
 * Rechnung. Ein Bruchstueck einer anderen Kennung als Steuernummer
 * anzubieten waere genau die Art Fehler, der sich hinterher in jeder
 * erzeugten Rechnung wiederholt.
 */
const EU_LAENDER =
  'AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI';
const UST_KANDIDAT = new RegExp(`(?<![A-Za-z-])(${EU_LAENDER})\\s?(\\d{8,12})(?![\\d-])`, 'g');

/**
 * Die Steuernummer hat kein einheitliches Muster - die Bundeslaender vergeben
 * sie verschieden. Deshalb wird nur genommen, was ausdruecklich so
 * beschriftet ist, und auch das nur als Vermutung.
 */
const STEUERNUMMER = /Steuer(?:\s*-?\s*)?(?:nummer|nr\.?)\s*:?\s*([\d/.\s-]{8,20})/i;

const LEITWEG = /Leitweg\s*-?\s*ID\s*:?\s*([\dA-Za-z-]{6,45})/i;

/**
 * Eine Zeile, die eine Person anspricht statt eine Firma zu nennen.
 *
 * Die deutsche Geschaeftsanschrift ist vierzeilig - Firma, Ansprechpartner,
 * Strasse, Ort. Wer nur eine Zeile ueber der Strasse liest, erwischt den
 * Ansprechpartner und haelt ihn fuer den Firmennamen. Nachgemessen an einer
 * Fremdrechnung: "Hr. Christian Ranacher" wurde als Name uebernommen,
 * waehrend "VHS Saechsische Schweiz-Osterzgebirge e. V." darueber
 * verlorenging - also genau der Eintrag, den die Kundenkartei braucht.
 */
const ANREDE = /^(?:z\.?\s*(?:Hd\.?|H\.?)|Herrn?|Hr\.?|Frau|Fr\.?|Familie|Fam\.?)\s+\S/i;

/** Taugt die Zeile ueberhaupt als Name? Ueberschriften und Anschriftenteile nicht. */
function taugtAlsName(zeile: string): boolean {
  return zeile.length > 0 && zeile.length <= 70 && !PLZ_ORT.test(zeile) && !STRASSE.test(zeile);
}

// --- Anschriften ------------------------------------------------------------

function anschriftAusZeilen(zeilen: string[], stelle: number): Anschrift | undefined {
  const zeile = zeilen[stelle] ?? '';
  const treffer = PLZ_ORT.exec(zeile);
  if (!treffer) return undefined;

  const felder: Fund[] = [
    { feld: 'plz', wert: treffer[1]!, sicherheit: 'muster', beleg: zeile },
    {
      feld: 'ort',
      wert: treffer[2]!.trim(),
      sicherheit: 'muster',
      beleg: zeile,
    },
  ];
  const beleg = [zeile];

  /*
   * Rueckwaerts weitergehen: ueber der Postleitzahl steht die Strasse, darueber
   * der Name. Das ist die uebliche Reihenfolge auf einem deutschen Brief - und
   * sie ist der Grund, warum diese beiden Felder nur "geraten" sind. Eine
   * Vorlage mit Postfach oder mit einer Abteilungszeile dazwischen bringt sie
   * durcheinander.
   */
  const davor = zeilen[stelle - 1]?.trim() ?? '';
  const strasse = STRASSE.exec(davor);
  if (strasse) {
    felder.push({
      feld: 'strasse',
      wert: davor,
      sicherheit: 'geraten',
      beleg: davor,
    });
    beleg.unshift(davor);

    const zweite = zeilen[stelle - 2]?.trim() ?? '';
    if (taugtAlsName(zweite)) {
      /*
       * Steht dort eine Anrede, ist es der Ansprechpartner - dann liegt der
       * Firmenname eine Zeile hoeher. Ohne Anrede bleibt es beim einzeiligen
       * Fall, in dem die Zeile selbst der Name ist.
       */
      if (ANREDE.test(zweite)) {
        felder.push({
          feld: 'ansprechpartner',
          wert: zweite,
          sicherheit: 'geraten',
          beleg: zweite,
        });
        beleg.unshift(zweite);

        const dritte = zeilen[stelle - 3]?.trim() ?? '';
        if (taugtAlsName(dritte) && !ANREDE.test(dritte)) {
          felder.push({
            feld: 'name',
            wert: dritte,
            sicherheit: 'geraten',
            beleg: dritte,
          });
          beleg.unshift(dritte);
        }
      } else {
        felder.push({
          feld: 'name',
          wert: zweite,
          sicherheit: 'geraten',
          beleg: zweite,
        });
        beleg.unshift(zweite);
      }
    }
  }

  return { beleg, felder };
}

/**
 * Eine Anschrift, die in einer Zeile steht.
 *
 * Der Rueckabsender ueber dem Anschriftenfeld sieht so aus:
 * "Nordlicht Digitalwerk GmbH - Speicherstrasse 14 - 20457 Hamburg". Er wird
 * an den Trennern zerlegt und dann wie ein mehrzeiliger Block behandelt.
 */
function anschriftAusEinerZeile(zeile: string): Anschrift | undefined {
  const teile = zeile
    .split(/\s+[-–·|]\s+/)
    .map((teil) => teil.trim())
    .filter(Boolean);
  if (teile.length < 2) return undefined;

  const gebaut = anschriftAusZeilen(teile, teile.length - 1);
  return gebaut ? { beleg: [zeile], felder: gebaut.felder } : undefined;
}

// --- Ganzes Dokument --------------------------------------------------------

export function findeStammdaten(zeilen: string[]): Stammdatenfund {
  const sauber = zeilen.map((zeile) => zeile.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const anschriften: Anschrift[] = [];
  const gesehen = new Set<string>();

  for (const [stelle, zeile] of sauber.entries()) {
    const gefunden = anschriftAusEinerZeile(zeile) ?? anschriftAusZeilen(sauber, stelle);
    if (!gefunden) continue;

    // Derselbe Ort kommt auf einer Rechnung mehrfach vor - im Rueckabsender
    // und im Anschriftenfeld. Zweimal anzubieten waere nur verwirrend.
    const schluessel = gefunden.felder
      .map((fund) => `${fund.feld}:${fund.wert.toLowerCase()}`)
      .sort()
      .join('|');
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);

    anschriften.push(gefunden);
  }

  const angaben: Fund[] = [];
  const schon = new Set<string>();

  const merke = (feld: Feld, wert: string, sicherheit: Sicherheit, beleg: string) => {
    const schluessel = `${feld}:${wert}`;
    if (schon.has(schluessel)) return;
    schon.add(schluessel);
    angaben.push({ feld, wert, sicherheit, beleg });
  };

  for (const zeile of sauber) {
    for (const treffer of zeile.matchAll(IBAN_KANDIDAT)) {
      const kandidat = (treffer[1] ?? '').replace(/\s/g, '').toUpperCase();
      // Nur was die Pruefsumme besteht. Ein Kandidat, der durchfaellt, ist
      // meist gar keine IBAN, sondern eine lange Nummer daneben.
      if (isPlausibleIban(kandidat)) merke('iban', kandidat, 'geprueft', zeile);
    }

    for (const treffer of zeile.matchAll(UST_KANDIDAT)) {
      const kandidat = (treffer[1] ?? '').replace(/\s/g, '').toUpperCase();
      // Eine IBAN faengt ebenfalls mit zwei Buchstaben an - wer sie hier
      // durchliesse, boete sie als Umsatzsteuernummer an.
      if (isPlausibleVatId(kandidat) && !isPlausibleIban(kandidat) && kandidat.length <= 14) {
        merke('ustId', kandidat, 'muster', zeile);
      }
    }

    /*
     * Der BIC direkt an seiner Beschriftung.
     *
     * Nicht als freistehendes Wort gesucht: In einem PDF ohne Wortabstaende
     * klebt die Beschriftung am Wert - eine gestaltete Rechnung lieferte
     * "BICCOBADEFFXXX" am Stueck, und ein Muster mit Wortgrenze fand darin
     * nichts. Ohne Beschriftung waere umgekehrt jedes Wort aus acht
     * Grossbuchstaben ein Kandidat.
     */
    const bic = /\b(?:BIC|SWIFT)(?:-?Code)?\s*:?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/.exec(
      zeile,
    );
    if (bic?.[1]) merke('bic', bic[1], 'muster', zeile);

    const steuer = STEUERNUMMER.exec(zeile);
    if (steuer) merke('steuernummer', (steuer[1] ?? '').trim(), 'muster', zeile);

    const leitweg = LEITWEG.exec(zeile);
    const leitwegWert = (leitweg?.[1] ?? '').trim();
    if (leitwegWert && isPlausibleLeitwegId(leitwegWert)) {
      merke('leitwegId', leitwegWert, 'muster', zeile);
    }
  }

  return { anschriften, angaben };
}
