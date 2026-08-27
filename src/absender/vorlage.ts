import type { Beschriftungen } from '../pdf/beschriftungen';
import { istBrauchbareBeschriftung } from '../pdf/beschriftungen';
import type { Kennzahlenstellung } from '../pdf/layout';
import type { Textseite } from '../parse/pdf-text';

/** 1 mm in Punkten. */
const MM = 2.834645669;

/**
 * Wortwahl und Stellung aus einer alten Rechnung ablesen.
 *
 * ## Warum das geht
 *
 * Die Vorlage weiss beides schon. Nachgemessen an einer Fremdrechnung steht
 * auf halber Hoehe quer ueber der Seite:
 *
 *     y=539  [181, 337, 456]
 *     Rechnungs-Nr. 2026/7910   Kunden-Nr. 2008   Rechnungsdatum: 12.8.2026
 *
 * Darin steckt die Wortwahl - "Rechnungs-Nr." statt "Rechnungsnummer" - und
 * die Stellung: drei Angaben nebeneinander in einer Zeile, nicht
 * untereinander am rechten Rand.
 *
 * ## Warum nur ein Vorschlag
 *
 * Erkannt wird an Wendungen, und Wendungen taeuschen. "Rechnungsdatum" kann
 * auch mitten im Fliesstext stehen. Deshalb liefert diese Datei Vorschlaege
 * samt der Zeile, aus der sie stammen - bestaetigen muss ein Mensch.
 *
 * ## Was ausdruecklich nicht uebernommen wird
 *
 * Die **Werte**. Gesucht werden nur die Woerter davor. Eine Rechnungsnummer
 * aus einer alten Rechnung zu uebernehmen waere nicht bloss nutzlos, sondern
 * gefaehrlich - eine doppelt vergebene Nummer verstoesst gegen Paragraf 14
 * Absatz 4 UStG.
 */

export interface Vorlagenvorschlag {
  /** Nur die Woerter, die von der Vorgabe abweichen. */
  beschriftungen: Partial<Beschriftungen>;
  /** Wo die Vorlage ihren Kennzahlenblock hat, falls erkennbar. */
  kennzahlen?: Kennzahlenstellung;
  /** Die Zeilen, aus denen geschlossen wurde - zum Nachsehen. */
  belege: string[];
}

/**
 * Wendungen je Feld.
 *
 * Bewusst eng gefasst und auf den Zeilenanfang oder ein vorangehendes
 * Trennzeichen bezogen: "Nr." allein kaeme in jeder Positionsbezeichnung vor.
 */
const WENDUNGEN: { feld: keyof Beschriftungen; muster: RegExp; ueberall?: boolean }[] = [
  { feld: 'rechnungsnummer', muster: /Rechnungs?\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: 'kundennummer', muster: /Kunden\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: 'rechnungsdatum', muster: /Rechnungs\s*-?\s*datum\s*:?/i },
  { feld: 'leistungsdatum', muster: /(?:Liefer|Leistungs)\s*-?\s*datum\s*:?/i },
  { feld: 'leistungszeitraum', muster: /Leistungs\s*-?\s*zeitraum\s*:?/i },
  { feld: 'faelligAm', muster: /(?:F(?:ä|ae)llig(?:\s+am)?|Zahlbar\s+bis)\s*:?/i },
  { feld: 'bestellnummer', muster: /(?:Bestell|Auftrags)\s*-?\s*(?:Nr\.?|Nummer)\s*:?/i },
  { feld: 'projekt', muster: /Projekt(?:\s*-?\s*(?:Nr\.?|Nummer))?\s*:?/i },
  { feld: 'pos', muster: /^Pos(?:\.|ition)?\s*:?$/i },
  { feld: 'bezeichnung', muster: /^(?:Bezeichnung|Beschreibung|Leistung|Artikel)\s*:?$/i },
  { feld: 'menge', muster: /^(?:Menge|Anzahl)\s*:?$/i },
  { feld: 'einzelpreis', muster: /^(?:Einzelpreis|Einzel|E-Preis)\s*:?$/i },
  { feld: 'betrag', muster: /^(?:Betrag|Gesamtpreis|Gesamt|Summe)\s*:?$/i },

  /*
   * Der Summenblock. "netto" trennt die Zwischensumme von der Endsumme -
   * ohne das Merkmal faengt "Gesamtbetrag netto" beide, und der Block bekaeme
   * zweimal dasselbe Wort.
   */
  {
    feld: 'zwischensummeNetto',
    muster: /^(?:Zwischensumme|Gesamtbetrag|Nettosumme|Nettobetrag|Summe)\s+netto\b/i,
  },
  {
    feld: 'gesamtbetrag',
    muster:
      /^(?:(?:Ü|Ue)berweisungsbetrag|Rechnungsbetrag|Rechnungssumme|Zahlbetrag|Endbetrag|Gesamtbetrag)(?!\s+netto)/i,
  },
  /*
   * Das Steuerkuerzel steht nicht am Anfang, sondern mitten in der Zeile:
   * "zzgl. 19 % MwSt.". Deshalb hier ausdruecklich ueberall erlaubt - die
   * Regel, dass eine Beschriftung vorn steht, gilt fuer Beschriftungen, und
   * das hier ist eine Abkuerzung innerhalb einer.
   */
  { feld: 'steuerkuerzel', muster: /(?:MwSt\.?|USt\.?)(?=\s|$)/i, ueberall: true },
];

/** Wie viele Kennzahlen in einer Zeile stehen muessen, damit sie als Block gilt. */
const QUER_AB = 3;

/**
 * Wie lang ein Textstueck hoechstens sein darf, um als Beschriftung zu gelten.
 *
 * Eine Beschriftung steht mit ihrem Wert allein; sechzig Zeichen sind dafuer
 * reichlich. Laengeres ist Fliesstext - und darin kommen dieselben Woerter vor.
 * Nachgemessen an einer Fremdrechnung: Die Fusszeile endet mit "Rechnungsdatum
 * ist Leistungsdatum." Ohne diese Schranke wurde daraus die Beschriftung des
 * Leistungsdatums.
 */
const MAX_STUECK = 60;

/**
 * Liest Wortwahl und Stellung aus einer Seite.
 *
 * `seitenhoehe` wird gebraucht, um "oberhalb des Anschriftenfeldes" von
 * "darunter" zu unterscheiden - ohne sie waeren die Hoehen nur Zahlen.
 */
export function schlageVorlageVor(seite: Textseite, seitenhoehe: number): Vorlagenvorschlag {
  const beschriftungen: Partial<Beschriftungen> = {};
  const belege = new Set<string>();

  /** Je Zeile: wie viele Kennzahlenwoerter darin stehen. */
  const querzaehler = new Map<number, number>();

  for (const zeile of seite.zeilen) {
    for (const stueck of zeile.stuecke) {
      for (const { feld, muster, ueberall } of WENDUNGEN) {
        if (beschriftungen[feld]) continue;

        const inhalt = stueck.text.trim();
        if (inhalt.length > MAX_STUECK) continue;

        const treffer = muster.exec(inhalt);
        // Nur am Anfang: Eine Beschriftung steht vor ihrem Wert, nicht mitten
        // in einem Satz. Ausnahmen sagen es selbst.
        if (!treffer || (treffer.index !== 0 && !ueberall)) continue;

        const wort = treffer[0].trim();
        if (!istBrauchbareBeschriftung(wort)) continue;

        beschriftungen[feld] = wort;
        belege.add(zeile.text);
      }
    }

    /*
     * Fuer die Stellung zaehlt, wie viele Kennzahlen in einer Zeile stehen -
     * und zwar als Anfang eines Stueckes, aus demselben Grund wie oben.
     */
    const inZeile = WENDUNGEN.filter(
      ({ feld, muster }) =>
        KENNZAHLENFELDER.has(feld) &&
        zeile.stuecke.some((stueck) => {
          const inhalt = stueck.text.trim();
          if (inhalt.length > MAX_STUECK) return false;
          const treffer = muster.exec(inhalt);
          return treffer?.index === 0;
        }),
    ).length;
    if (inZeile > 0) querzaehler.set(zeile.y, inZeile);
  }

  return {
    beschriftungen,
    ...(erkenneStellung(querzaehler, seitenhoehe) ?? {}),
    belege: [...belege],
  };
}

/** Die Felder, deren Anordnung die Stellung des Blocks verraet. */
const KENNZAHLENFELDER = new Set<keyof Beschriftungen>([
  'rechnungsnummer',
  'rechnungsdatum',
  'leistungsdatum',
  'faelligAm',
  'kundennummer',
  'bestellnummer',
]);

/**
 * Schliesst aus der Anordnung auf die Stellung.
 *
 * Stehen drei oder mehr Kennzahlen in **einer** Zeile, hat die Vorlage sie
 * quer gesetzt. Sonst untereinander - und dann entscheidet die Hoehe.
 *
 * Gemessen wird gegen das Anschriftenfeld, nicht gegen einen Anteil der
 * Seite: Es sitzt nach DIN 5008 fest bei 45 mm von oben, und ob der Block
 * daneben oder darueber steht, ist genau diese Frage. Ein Anteil der
 * Seitenhoehe traf bei unserer eigenen Rechnung daneben.
 */
function erkenneStellung(
  querzaehler: Map<number, number>,
  seitenhoehe: number,
): { kennzahlen: Kennzahlenstellung } | undefined {
  if (querzaehler.size === 0) return undefined;

  const quer = [...querzaehler.entries()].find(([, zahl]) => zahl >= QUER_AB);
  if (quer) return { kennzahlen: 'unter-anschrift' };

  const anschriftOben = seitenhoehe - 45 * MM;
  const hoechste = Math.max(...querzaehler.keys());

  // Ein Fingerbreit Spielraum: "neben" heisst in der Praxis "auf gleicher
  // Hoehe bis knapp darueber".
  return {
    kennzahlen: hoechste > anschriftOben + 30 ? 'ueber-anschrift' : 'neben-anschrift',
  };
}
