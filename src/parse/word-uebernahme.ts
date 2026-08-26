import type { InvoiceInput } from '../model/invoice';
import type { WordTabelle } from './word';

/**
 * Aus einer Word-Tabelle werden Rechnungspositionen.
 *
 * Der Leser nebenan (word.ts) holt heraus, was im Dokument steht; er deutet
 * nichts. Hier passiert die Deutung - aber **nicht allein**: Die Zuordnung der
 * Spalten kommt vom Nutzer, diese Datei rechnet nur um.
 *
 * Warum im Kern und nicht in der App: Der Zahlenleser unten ist die
 * riskanteste Stelle des ganzen Umzugswegs. Eine Zelle "1.234,56", die als
 * 1,23456 gelesen wird, ergibt eine falsche Rechnung - und dagegen
 * widerspricht kein Empfaenger, anders als bei einem falschen XML. Hier ist er
 * pruefbar.
 */

export type Spaltenrolle = 'bezeichnung' | 'menge' | 'einheit' | 'einzelpreis' | 'ignorieren';

export const ROLLEN: Array<{ rolle: Spaltenrolle; label: string }> = [
  { rolle: 'bezeichnung', label: 'Bezeichnung' },
  { rolle: 'menge', label: 'Menge' },
  { rolle: 'einheit', label: 'Einheit' },
  { rolle: 'einzelpreis', label: 'Einzelpreis' },
  { rolle: 'ignorieren', label: 'ignorieren' },
];

/**
 * Eine Zahl aus einer Tabellenzelle.
 *
 * Deutsche Schreibweise, und das ist eine bewusste Festlegung: Komma trennt
 * die Nachkommastellen, Punkt die Tausender. "1.234,56" ergibt 1234,56.
 *
 * Der eine Zugestaendnisfall ist ein Punkt mit ein bis zwei Stellen dahinter
 * und keinem Komma - "95.00". Das schreibt niemand als Tausendertrennung, also
 * ist es gemeint als Dezimalpunkt.
 *
 * Bewusst `undefined` statt 0 bei leerer Zelle: Eine leere Menge ist keine
 * Menge null, sondern eine fehlende Angabe. Der Unterschied entscheidet
 * darueber, ob die Oberflaeche nachfragt oder stillschweigend eine Position
 * ueber 0,00 Euro anlegt.
 */
export function zahlAus(text: string): number | undefined {
  const roh = text.replace(/[^\d.,-]/g, '').trim();
  if (!roh || roh === '-') return undefined;

  let bereinigt: string;
  if (roh.includes(',')) {
    bereinigt = roh.replace(/\./g, '').replace(',', '.');
  } else {
    const punkte = roh.split('.').length - 1;
    const nachkomma = roh.includes('.') ? (roh.split('.').pop()?.length ?? 0) : 0;
    bereinigt = punkte === 1 && nachkomma >= 1 && nachkomma <= 2 ? roh : roh.replace(/\./g, '');
  }

  const wert = Number(bereinigt);
  return Number.isFinite(wert) ? wert : undefined;
}

/**
 * Rät die Rollen aus der Kopfzeile.
 *
 * Nur ein Vorschlag. Trifft er daneben, ist das kein Fehler - der Nutzer sieht
 * die Zuordnung und aendert sie. Deshalb hier auch keine Klugheit, sondern
 * die Woerter, die auf deutschen Rechnungen tatsaechlich stehen.
 */
export function schlageZuordnungVor(kopfzeile: string[]): Spaltenrolle[] {
  const vergeben = new Set<Spaltenrolle>();

  return kopfzeile.map((zelle) => {
    const wort = zelle.toLowerCase().replace(/\s+/g, ' ').trim();

    const treffer = (): Spaltenrolle => {
      if (/(bezeichnung|leistung|beschreibung|artikel|position|text)/.test(wort)) return 'bezeichnung';
      if (/(menge|anzahl|stück|stueck|std|stunden)/.test(wort)) return 'menge';
      if (/(einheit|einh\.|me\b)/.test(wort)) return 'einheit';
      // "Gesamt" und "Summe" bewusst NICHT als Einzelpreis: Das ist der
      // Zeilenbetrag, und wer ihn als Stueckpreis uebernimmt, multipliziert
      // ihn ein zweites Mal mit der Menge.
      if (/(einzel|e-preis|preis|netto|betrag)/.test(wort) && !/(gesamt|summe)/.test(wort)) {
        return 'einzelpreis';
      }
      return 'ignorieren';
    };

    const rolle = treffer();
    // Jede Rolle nur einmal - zwei Mengenspalten waeren sinnlos, und die
    // zweite gewaenne stillschweigend.
    if (rolle !== 'ignorieren' && vergeben.has(rolle)) return 'ignorieren';
    if (rolle !== 'ignorieren') vergeben.add(rolle);
    return rolle;
  });
}

/**
 * Erkennungsmerkmal einer Vorlage.
 *
 * Die Kopfzeile ist das Stabilste an einer Rechnungsvorlage - der Inhalt
 * darunter aendert sich mit jeder Rechnung, die Ueberschriften nicht. Wer
 * dieselbe Vorlage ein zweites Mal einliest, soll die Spalten nicht erneut
 * zuordnen muessen.
 */
export function signaturVon(kopfzeile: string[]): string {
  return kopfzeile.map((zelle) => zelle.toLowerCase().replace(/\s+/g, ' ').trim()).join('|');
}

type Position = NonNullable<InvoiceInput['lines']>[number];

export interface Uebernahme {
  positionen: Position[];
  /** Zeilen, aus denen nichts wurde - mit dem Grund, fuer die Anzeige. */
  uebersprungen: Array<{ zeile: string[]; grund: string }>;
}

/**
 * Macht aus den Datenzeilen Positionen.
 *
 * `vorlage` liefert die Umsatzsteuerangabe - sie kommt aus dem Entwurf und
 * damit aus den Stammdaten, nicht aus dem Word-Dokument. Ein Steuersatz, den
 * man aus einer Tabelle liest, ist genau die Art Zahl, die man nicht raten
 * sollte.
 */
export function positionenAus(
  tabelle: WordTabelle,
  rollen: Spaltenrolle[],
  mitKopfzeile: boolean,
  vorlage: Position,
): Uebernahme {
  const spalte = (rolle: Spaltenrolle): number => rollen.indexOf(rolle);
  const zeilen = mitKopfzeile ? tabelle.zeilen.slice(1) : tabelle.zeilen;

  const positionen: Position[] = [];
  const uebersprungen: Uebernahme['uebersprungen'] = [];

  for (const zeile of zeilen) {
    const feld = (rolle: Spaltenrolle): string => {
      const stelle = spalte(rolle);
      return stelle >= 0 ? (zeile[stelle] ?? '') : '';
    };

    const name = feld('bezeichnung').replace(/\s+/g, ' ').trim();
    const menge = zahlAus(feld('menge'));
    const preis = zahlAus(feld('einzelpreis'));

    // Eine Zeile ohne Bezeichnung ist meist die Summenzeile, die in derselben
    // Tabelle steht. Sie zu uebernehmen ergaebe eine Position "" ueber den
    // Gesamtbetrag - und die Rechnung waere doppelt so hoch.
    if (!name) {
      uebersprungen.push({ zeile, grund: 'Keine Bezeichnung — vermutlich eine Summenzeile.' });
      continue;
    }
    if (preis === undefined) {
      uebersprungen.push({ zeile, grund: 'Kein Einzelpreis erkannt.' });
      continue;
    }

    positionen.push({
      ...vorlage,
      id: String(positionen.length + 1),
      name,
      quantity: menge ?? 1,
      unitCode: feld('einheit').trim() || vorlage.unitCode,
      unitPrice: preis,
    });
  }

  return { positionen, uebersprungen };
}
