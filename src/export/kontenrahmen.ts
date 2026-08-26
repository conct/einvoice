import type { Vat } from '../model/invoice';

/**
 * Kontenrahmen fuer den DATEV-Export.
 *
 * Bewusst Daten und keine fest verdrahteten Nummern: Welche Konten eine
 * Buchung bekommt, gibt die Steuerberatung vor, nicht diese Anwendung. SKR 03
 * und SKR 04 sind die beiden verbreiteten Rahmen, aber auch innerhalb eines
 * Rahmens weichen Kanzleien ab - etwa bei einem eigenen Erloeskonto je
 * Geschaeftsbereich.
 *
 * Die mitgelieferten Vorlagen sind ein Startpunkt, keine Zusicherung. Ein
 * falsch kontierter Buchungssatz faellt nicht beim Import auf, sondern beim
 * Jahresabschluss - deshalb muss jeder Stand vor dem produktiven Einsatz von
 * der Kanzlei geprueft werden.
 */

/** Ein Erloeskonto samt optionalem Steuerschluessel */
export interface Erloeskonto {
  /** Sachkontonummer, z.B. "8400" */
  konto: string;
  /**
   * BU-Schluessel, falls das Konto kein Automatikkonto ist.
   *
   * Bei Automatikkonten - 8400 in SKR 03 traegt die 19 Prozent bereits in
   * sich - muss das Feld leer bleiben. Ein gesetzter Schluessel auf einem
   * Automatikkonto fuehrt beim Import zu einer Fehlermeldung.
   */
  buSchluessel?: string;
  /** Wofuer dieses Konto steht, erscheint in der Oberflaeche */
  bezeichnung: string;
}

/** Steuerfaelle, die eine Rechnung ausloesen kann */
export type Steuerfall =
  | 'standard'
  | 'ermaessigt'
  | 'steuerfrei'
  | 'reverseCharge'
  | 'innergemeinschaftlich'
  | 'ausfuhr'
  | 'nichtSteuerbar';

export interface Kontenrahmen {
  /** Anzeigename, z.B. "SKR 03" */
  name: string;
  /** Laenge der Sachkontonummern - steht so im Kopf der DATEV-Datei */
  sachkontenlaenge: number;
  /** Erloeskonto je Steuerfall */
  erloese: Record<Steuerfall, Erloeskonto>;
  /**
   * Konto, auf das gebucht wird, wenn ein Kunde keine eigene Debitorennummer
   * hat. Ohne Sammelkonto muesste der Export solche Rechnungen auslassen -
   * und ein unvollstaendiger Stapel ist schlimmer als ein grober.
   */
  sammeldebitor: string;
  /** Zulaessiger Bereich fuer Debitorennummern, zur Pruefung der Eingabe */
  debitorenbereich: { von: number; bis: number };
}

/**
 * SKR 03 - der in kleinen Unternehmen verbreitetere Rahmen.
 * Die Erloeskonten sind Automatikkonten, tragen den Steuersatz also selbst.
 */
export const SKR03: Kontenrahmen = {
  name: 'SKR 03',
  sachkontenlaenge: 4,
  erloese: {
    standard: { konto: '8400', bezeichnung: 'Erloese 19 % USt' },
    ermaessigt: { konto: '8300', bezeichnung: 'Erloese 7 % USt' },
    steuerfrei: { konto: '8200', bezeichnung: 'Erloese steuerfrei' },
    reverseCharge: {
      konto: '8337',
      bezeichnung: 'Erloese Reverse Charge (Paragraf 13b UStG)',
    },
    innergemeinschaftlich: {
      konto: '8125',
      bezeichnung: 'Steuerfreie innergemeinschaftliche Lieferung',
    },
    ausfuhr: { konto: '8120', bezeichnung: 'Steuerfreie Ausfuhrlieferung' },
    nichtSteuerbar: { konto: '8338', bezeichnung: 'Nicht steuerbare Umsaetze' },
  },
  sammeldebitor: '10000',
  debitorenbereich: { von: 10000, bis: 69999 },
};

/** SKR 04 - der nach Bilanzgliederung aufgebaute Rahmen. */
export const SKR04: Kontenrahmen = {
  name: 'SKR 04',
  sachkontenlaenge: 4,
  erloese: {
    standard: { konto: '4400', bezeichnung: 'Erloese 19 % USt' },
    ermaessigt: { konto: '4300', bezeichnung: 'Erloese 7 % USt' },
    steuerfrei: { konto: '4200', bezeichnung: 'Erloese steuerfrei' },
    reverseCharge: {
      konto: '4337',
      bezeichnung: 'Erloese Reverse Charge (Paragraf 13b UStG)',
    },
    innergemeinschaftlich: {
      konto: '4125',
      bezeichnung: 'Steuerfreie innergemeinschaftliche Lieferung',
    },
    ausfuhr: { konto: '4120', bezeichnung: 'Steuerfreie Ausfuhrlieferung' },
    nichtSteuerbar: { konto: '4338', bezeichnung: 'Nicht steuerbare Umsaetze' },
  },
  sammeldebitor: '10000',
  debitorenbereich: { von: 10000, bis: 69999 },
};

export const VORLAGEN: Kontenrahmen[] = [SKR03, SKR04];

/**
 * Ordnet einer Steuerkategorie den Steuerfall zu.
 *
 * Der ermaessigte Satz laesst sich nicht an der Kategorie ablesen - "S" steht
 * fuer den Regelfall und deckt 19 wie 7 Prozent ab. Entschieden wird deshalb
 * am Satz, und die Grenze liegt bewusst unter 19: kaeme in Deutschland je ein
 * dritter Satz dazu, faellt er auf statt still falsch gebucht zu werden.
 */
export function steuerfallFuer(vat: Pick<Vat, 'category' | 'rate'>): Steuerfall {
  switch (vat.category) {
    case 'AE':
      return 'reverseCharge';
    case 'K':
      return 'innergemeinschaftlich';
    case 'G':
      return 'ausfuhr';
    case 'O':
      return 'nichtSteuerbar';
    case 'E':
    case 'Z':
      return 'steuerfrei';
    default:
      return vat.rate >= 19 ? 'standard' : 'ermaessigt';
  }
}

/** Prueft eine von Hand vergebene Debitorennummer gegen den Rahmen. */
export function istDebitorennummer(rahmen: Kontenrahmen, nummer: string): boolean {
  if (!/^\d+$/.test(nummer)) return false;
  const wert = Number(nummer);
  return wert >= rahmen.debitorenbereich.von && wert <= rahmen.debitorenbereich.bis;
}

/**
 * Uebernimmt Aenderungen an einer Vorlage, ohne sie zu veraendern.
 * Die Vorlagen sind gemeinsam genutzte Konstanten - wer sie an Ort und Stelle
 * beschriebe, aenderte sie fuer alle Mandanten in derselben Sitzung.
 */
export function abgewandelt(
  rahmen: Kontenrahmen,
  aenderungen: Partial<Omit<Kontenrahmen, 'erloese'>> & {
    erloese?: Partial<Record<Steuerfall, Partial<Erloeskonto>>>;
  },
): Kontenrahmen {
  const erloese = { ...rahmen.erloese };
  for (const [fall, wert] of Object.entries(aenderungen.erloese ?? {})) {
    const schluessel = fall as Steuerfall;
    erloese[schluessel] = { ...erloese[schluessel], ...wert };
  }
  return { ...rahmen, ...aenderungen, erloese };
}
