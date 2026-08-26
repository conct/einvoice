/**
 * Die Beschriftungen auf der Rechnung - einstellbar, aber nicht abschaltbar.
 *
 * ## Warum einstellbar
 *
 * Jedes Haus hat seine Wortwahl. Auf einer vermessenen Fremdrechnung steht
 * "Rechnungs-Nr." und "Kunden-Nr.", nicht "Rechnungsnummer" und
 * "Kundennummer". Wer sein Briefpapier uebernimmt, will nicht daneben eine
 * fremde Sprache stehen haben.
 *
 * Das ist ausserdem der risikoarme Teil der Gestaltung: Eine geaenderte
 * Beschriftung aendert nichts an der Struktur, nichts am XML und nichts an
 * den Pflichtangaben nach Paragraf 14 UStG. Nur das Wort davor.
 *
 * ## Warum nicht abschaltbar
 *
 * Eine leere Beschriftung liesse einen Wert ohne Erklaerung stehen - eine
 * Nummer, von der niemand weiss, ob sie die Rechnungs- oder die Kundennummer
 * ist. Deshalb wird Unbrauchbares nicht uebernommen, sondern durch die
 * Vorgabe ersetzt, so wie eine unbrauchbare Akzentfarbe durch die
 * Standardfarbe. Eine Rechnung, die nicht ganz nach Hausbrauch klingt, ist
 * der bessere Ausgang als eine, die niemand deuten kann.
 *
 * ## Was hier bewusst fehlt
 *
 * Die Umsatzsteuerzeilen ("zzgl. 19 % USt. auf ...") und der Belegname
 * ("Rechnungsbetrag", "Gutschriftsbetrag") entstehen aus den Daten und
 * richten sich nach dem Steuerschluessel des Dokuments. Sie frei zu machen
 * hiesse, dem Nutzer die Moeglichkeit zu geben, eine Steuerbefreiung falsch
 * zu benennen - und das ist keine Frage des Geschmacks.
 */

export interface Beschriftungen {
  // Kennzahlenblock
  rechnungsnummer: string;
  rechnungsdatum: string;
  leistungsdatum: string;
  leistungszeitraum: string;
  faelligAm: string;
  kundennummer: string;
  leitwegId: string;
  bestellnummer: string;
  projekt: string;

  // Positionstabelle
  pos: string;
  bezeichnung: string;
  menge: string;
  einzelpreis: string;
  umsatzsteuer: string;
  betrag: string;

  // Summenblock
  zwischensummeNetto: string;
  gesamtsummeNetto: string;
  zuschlag: string;
  abschlag: string;
  rundung: string;
  bereitsGezahlt: string;
  zahlbetrag: string;

  // Ueberschriften
  zahlung: string;
}

export const STANDARD_BESCHRIFTUNGEN: Beschriftungen = {
  rechnungsnummer: 'Rechnungsnummer',
  rechnungsdatum: 'Rechnungsdatum',
  leistungsdatum: 'Leistungsdatum',
  leistungszeitraum: 'Leistungszeitraum',
  faelligAm: 'Faellig am',
  kundennummer: 'Kundennummer',
  leitwegId: 'Leitweg-ID',
  bestellnummer: 'Bestellnummer',
  projekt: 'Projekt',

  pos: 'Pos.',
  bezeichnung: 'Bezeichnung',
  menge: 'Menge',
  einzelpreis: 'Einzelpreis',
  umsatzsteuer: 'USt.',
  betrag: 'Betrag',

  zwischensummeNetto: 'Zwischensumme netto',
  gesamtsummeNetto: 'Gesamtsumme netto',
  zuschlag: 'Zuschlag',
  abschlag: 'Abschlag',
  rundung: 'Rundung',
  bereitsGezahlt: 'abzgl. bereits gezahlt',
  zahlbetrag: 'Zahlbetrag',

  zahlung: 'Zahlung',
};

/**
 * Wie lang eine Beschriftung hoechstens sein darf.
 *
 * Vierzig Zeichen: Die Spalten der Positionstabelle sind zwischen 26 und 76
 * Punkten breit. Was deutlich laenger ist, wird beim Setzen gekuerzt oder
 * schiebt die Nachbarspalte - beides sieht nach Fehler aus, und der Nutzer
 * saehe nicht, woran es liegt. Lieber hier abweisen.
 */
const MAX_LAENGE = 40;

/** Taugt die Angabe als Beschriftung? */
export function istBrauchbareBeschriftung(wert: unknown): wert is string {
  if (typeof wert !== 'string') return false;
  const sauber = wert.trim();
  return sauber.length > 0 && sauber.length <= MAX_LAENGE && !/[\r\n\t]/.test(sauber);
}

/**
 * Baut den vollstaendigen Satz aus den eigenen Angaben.
 *
 * Was fehlt oder unbrauchbar ist, kommt aus der Vorgabe. Das Ergebnis ist
 * deshalb immer vollstaendig - der Aufrufer muss nirgends nachsehen, ob eine
 * Beschriftung vorhanden ist.
 */
export function beschriftungenMit(eigene?: Partial<Beschriftungen>): Beschriftungen {
  if (!eigene) return STANDARD_BESCHRIFTUNGEN;

  const ergebnis = { ...STANDARD_BESCHRIFTUNGEN };
  for (const schluessel of Object.keys(STANDARD_BESCHRIFTUNGEN) as (keyof Beschriftungen)[]) {
    const wert = eigene[schluessel];
    if (istBrauchbareBeschriftung(wert)) ergebnis[schluessel] = wert.trim();
  }
  return ergebnis;
}

/**
 * Nur das, was vom Standard abweicht - zum Speichern.
 *
 * Den ganzen Satz abzulegen waere der Fehler, den man erst Jahre spaeter
 * bemerkt: Eine spaeter verbesserte Vorgabe erreichte niemanden mehr, weil
 * jedes Profil eine eingefrorene Kopie traegt.
 */
export function nurAbweichungen(eigene: Partial<Beschriftungen>): Partial<Beschriftungen> {
  const abweichend: Partial<Beschriftungen> = {};
  for (const schluessel of Object.keys(STANDARD_BESCHRIFTUNGEN) as (keyof Beschriftungen)[]) {
    const wert = eigene[schluessel];
    if (istBrauchbareBeschriftung(wert) && wert.trim() !== STANDARD_BESCHRIFTUNGEN[schluessel]) {
      abweichend[schluessel] = wert.trim();
    }
  }
  return abweichend;
}
