import { skontobetrag, skontofrist, type Skontostufe } from '../model/skonto';
import type { IsoDate } from '../util/date';
import { round } from '../util/money';

import type { Eingangsrechnung } from './modell';
import { uebersicht } from './modell';

/**
 * Der Zahlungsstand einer Eingangsrechnung.
 *
 * Drei Werte, und keiner davon wird geraten: `bezahlt` setzt der Nutzer,
 * `ueberfaellig` ergibt sich aus BT-9, und alles andere ist `offen`.
 *
 * Fehlt BT-9, bleibt es `offen` - auch nach Monaten. Eine Frist zu erfinden,
 * die auf der Rechnung nicht steht, waere eine Behauptung ueber einen
 * Vorgang, den wir nicht beurteilen koennen: Wann eine Forderung faellig
 * wird, haengt an Vertrag und Zugang, nicht am Dokument. Angezeigt wird
 * stattdessen, dass die Rechnung kein Zahlungsziel nennt.
 */
export type Zahlungsstand = 'offen' | 'ueberfaellig' | 'bezahlt';

/** Heute als ISO-Datum, ohne Uhrzeit. */
export function heute(jetzt = new Date()): IsoDate {
  return jetzt.toISOString().slice(0, 10) as IsoDate;
}

/**
 * Tage von einem Datum zum anderen. Negativ, wenn das Ziel vorbei ist.
 *
 * Gerechnet wird in UTC-Mitternacht, nicht mit der Ortszeit: Sonst haengt die
 * Zahl davon ab, ob die App gerade in der Sommerzeit laeuft, und eine Frist
 * schnappt eine Stunde zu frueh oder zu spaet um.
 */
export function tageBis(ziel: string, ab: string): number {
  const a = Date.parse(`${ab}T00:00:00Z`);
  const b = Date.parse(`${ziel}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Der Stand einer einzelnen Rechnung - fuer E-Rechnung und Foto gleich. */
export function zahlungsstand(eingang: Eingangsrechnung, stichtag = heute()): Zahlungsstand {
  if (eingang.bezahltAm) return 'bezahlt';
  const faellig = uebersicht(eingang).faellig;
  if (!faellig) return 'offen';
  // Lexikalischer Vergleich: ISO-Datumsangaben sind dafuer gebaut.
  return faellig < stichtag ? 'ueberfaellig' : 'offen';
}

/** Wie viele Tage ueberfaellig? 0, wenn nicht ueberfaellig. */
export function ueberfaelligTage(eingang: Eingangsrechnung, stichtag = heute()): number {
  if (zahlungsstand(eingang, stichtag) !== 'ueberfaellig') return 0;
  const faellig = uebersicht(eingang).faellig;
  return faellig ? Math.max(0, -tageBis(faellig, stichtag)) : 0;
}

export interface Skontochance {
  stufe: Skontostufe;
  /** Letzter Tag, an dem der Abzug gilt - aus Rechnungsdatum plus Tagen. */
  bis: IsoDate;
  /** Tage bis dahin. 0 heisst: heute ist der letzte Tag. */
  tage: number;
  /** Was der Abzug ausmacht, in der Waehrung der Rechnung. */
  betrag: number;
  /** Was dann noch zu zahlen ist. */
  zahlbetrag: number;
}

/**
 * Lohnt sich hier noch ein Skontoabzug?
 *
 * Das ist der Grund, warum sich das Behalten einer Eingangsrechnung
 * ueberhaupt lohnt: Skonto hat in EN 16931 kein eigenes Feld, es steht als
 * Text in BT-20 - und die Bibliothek liest die Schreibweise der XRechnung
 * strukturiert aus. Wer die Rechnung nur ansieht und wegklickt, verliert zwei
 * Prozent, weil niemand die Frist im Blick hatte.
 *
 * Von mehreren Stufen gewinnt die, die heute noch erreichbar ist und am
 * meisten bringt - nicht die erste in der Liste. Eine abgelaufene Stufe
 * zaehlt nicht mehr.
 */
export function skontochance(
  eingang: Eingangsrechnung,
  stichtag = heute(),
): Skontochance | undefined {
  if (eingang.bezahltAm) return undefined;
  /*
   * Nur bei einer E-Rechnung. Auf einem Foto steht Skonto irgendwo im
   * Fliesstext, in jeder Rechnung anders formuliert - daraus eine Frist und
   * einen Betrag zu errechnen hiesse raten, und zwar bei Geld.
   */
  if (eingang.quelle.art !== 'erechnung') return undefined;
  const rechnung = eingang.quelle.invoice;
  const stufen = rechnung.payment?.skonto ?? [];
  if (stufen.length === 0) return undefined;

  const zuZahlen = uebersicht(eingang).zuZahlen;
  const erreichbar = stufen
    .map((stufe) => {
      const bis = skontofrist(stufe, rechnung.issueDate);
      const betrag = round(skontobetrag(stufe, zuZahlen));
      return { stufe, bis, tage: tageBis(bis, stichtag), betrag, zahlbetrag: round(zuZahlen - betrag) };
    })
    .filter((chance) => chance.tage >= 0 && chance.betrag > 0)
    .sort((a, b) => b.betrag - a.betrag);

  return erreichbar[0];
}

export interface Offenstand {
  waehrung: string;
  /** Summe der noch zu zahlenden Betraege. */
  summe: number;
  anzahl: number
  /** Davon ueberfaellig. */
  ueberfaellig: number;
}

/**
 * Was insgesamt offen ist, je Waehrung.
 *
 * Je Waehrung und nicht als eine Zahl: Betraege in Franken und Euro zu
 * addieren ergaebe eine Summe, die es nicht gibt. Einen Kurs anzuwenden waere
 * schlimmer - der Stand von heute gehoert nicht in eine Uebersicht ueber
 * Rechnungen von vorletztem Monat.
 */
export function offeneSummen(
  rechnungen: readonly Eingangsrechnung[],
  stichtag = heute(),
): Offenstand[] {
  const nach = new Map<string, Offenstand>();
  for (const eingang of rechnungen) {
    const stand = zahlungsstand(eingang, stichtag);
    if (stand === 'bezahlt') continue;
    const { waehrung, zuZahlen } = uebersicht(eingang);
    const bisher = nach.get(waehrung) ?? { waehrung, summe: 0, anzahl: 0, ueberfaellig: 0 };
    nach.set(waehrung, {
      waehrung,
      summe: round(bisher.summe + zuZahlen),
      anzahl: bisher.anzahl + 1,
      ueberfaellig: stand === 'ueberfaellig' ? bisher.ueberfaellig + 1 : bisher.ueberfaellig,
    });
  }
  return [...nach.values()].sort((a, b) => b.summe - a.summe);
}
