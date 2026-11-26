import { round } from '../util/money';
import type { IsoDate } from '../util/date';

/**
 * DEN QR-CODE EINES KASSENBONS LESEN.
 *
 * ## Warum das hier steht
 *
 * Nebenan liest `liesBeleg` den Text, den eine Texterkennung aus dem Foto
 * eines Bons gemacht hat. Das geht, aber es bleibt Lesen aus Pixeln: Derselbe
 * Bon, dreimal fotografiert, kam dreimal anders zerlegt heraus - einmal
 * zeilenweise, einmal spaltenweise, einmal rueckwaerts.
 *
 * Auf den meisten deutschen Bons steht derselbe Betrag aber noch ein zweites
 * Mal, maschinenlesbar: im QR-Code der technischen Sicherheitseinrichtung.
 * Seit 2020 muss jede Kasse ihre Vorgaenge signieren (§ 146a AO, KassenSichV),
 * und viele drucken die signierten Daten als QR-Code auf den Bon. Dort stehen
 * die Umsaetze je Steuersatz, die Zahlungen, ein Zeitstempel und eine
 * Vorgangsnummer - nicht gelesen, sondern von der Kasse selbst geschrieben.
 *
 * ## Was dieser Leser tut und was nicht
 *
 * Er zerlegt die Zeichenkette und rechnet die Betraege zusammen. Er PRUEFT
 * KEINE SIGNATUR: Dazu braeuchte es das Zertifikat der Kasse, und das steht
 * nicht auf dem Bon. Der Code beweist hier also nicht, dass niemand ihn
 * gefaelscht hat - er beweist nur, dass die Zahlen nicht aus einer
 * Texterkennung stammen. Fuer eine Eingangsrechnung, die ohnehin ein Mensch
 * bestaetigt, ist das der ganze Gewinn.
 *
 * ## Das Format
 *
 * Aus BSI TR-03151 und der DSFinV-K, dieselbe Gestalt, die unsere eigene
 * Kasse erzeugt - Semikolon als Trenner:
 *
 *     V0;<Kassenseriennummer>;<Vorgangsart>;<Vorgangsdaten>;<Vorgangsnummer>;
 *     <Signaturzaehler>;<Startzeit>;<Logzeit>;<Signaturalgorithmus>;
 *     <Zeitformat>;<Signatur>;<Schluessel>
 *
 * Die Vorgangsdaten eines Kassenbelegs tragen die Umsaetze je Steuersatz, in
 * FESTER Reihenfolge, und danach die Zahlungen:
 *
 *     Beleg^61.51_4.30_0.00_0.00_0.00^65.81:Unbar
 *            19%   7%   10,7% 5,5%  0%
 *
 * Die 10,7 % und 5,5 % sind die Durchschnittssaetze der Land- und
 * Forstwirtschaft (§ 24 UStG). Sie stehen fast immer auf Null, gehoeren aber
 * zur Reihenfolge - wer sie ueberspringt, ordnet alles danach falsch zu.
 */

/** Die Steuersaetze des Kassenbelegs, in der Reihenfolge des Formats. */
const SAETZE = [19, 7, 10.7, 5.5, 0] as const;

export interface Kassenbonsatz {
  satz: number;
  brutto: number;
  netto: number;
  steuer: number;
}

export interface Kassenbonzahlung {
  betrag: number;
  /** "Bar", "Unbar" - wie die Kasse es geschrieben hat. */
  art: string;
}

export interface Kassenbondaten {
  /** Seriennummer der Kasse, die den Bon erzeugt hat. */
  kasse: string;
  /** Die Vorgangsnummer der Sicherheitseinrichtung - eindeutig je Kasse. */
  vorgang: string;
  /** Der Zeitpunkt, den die Kasse protokolliert hat. */
  zeitpunkt: string;
  /** Derselbe Zeitpunkt als Kalendertag am Ort - das Belegdatum. */
  datum?: IsoDate;
  brutto: number;
  netto: number;
  steuer: number;
  /** Nur die Saetze, auf die wirklich etwas entfaellt. */
  saetze: Kassenbonsatz[];
  zahlungen: Kassenbonzahlung[];
  /** Was auffiel, ohne dass es ein Fehler waere. */
  hinweise: string[];
}

/** Eine Zahl aus dem Code - dort steht immer ein Punkt, nie ein Komma. */
function zahl(text: string): number | undefined {
  if (!/^-?\d+(?:\.\d+)?$/.test(text.trim())) return undefined;
  const wert = Number(text.trim());

  return Number.isFinite(wert) ? round(wert) : undefined;
}

/**
 * Der Kalendertag am Ort.
 *
 * Die Kasse schreibt den Zeitstempel in UTC. Ein Bon von 00:30 waere damit auf
 * den Vortag datiert - derselbe Fehler, der in 'heute' schon einmal steckte.
 */
function tagAus(zeitpunkt: string): IsoDate | undefined {
  const wann = new Date(zeitpunkt);
  if (Number.isNaN(wann.getTime())) return undefined;

  return [
    wann.getFullYear(),
    String(wann.getMonth() + 1).padStart(2, '0'),
    String(wann.getDate()).padStart(2, '0'),
  ].join('-') as IsoDate;
}

/**
 * Sieht die Zeichenkette nach einem Kassenbeleg-Code aus?
 *
 * Gefragt wird vor dem Zerlegen, damit ein Strichcode auf der Packung oder
 * ein Link, der zufaellig mitgelesen wurde, gar nicht erst hier landet.
 */
export function istKassenbonCode(text: string): boolean {
  return /^V\d+;[^;]*;Kassenbeleg-V\d/i.test(text.trim());
}

/**
 * Den Code eines Kassenbons lesen.
 *
 * Gibt `undefined` zurueck, wenn es keiner ist - und das ist der Normalfall,
 * sobald jemand die Kamera auf den Strichcode daneben haelt.
 */
export function liesKassenbonCode(text: string): Kassenbondaten | undefined {
  const roh = (text ?? '').trim();
  if (!istKassenbonCode(roh)) return undefined;

  const felder = roh.split(';');
  const [, kasse = '', , vorgangsdaten = '', vorgang = '', , startzeit = '', logzeit = ''] = felder;

  const teile = vorgangsdaten.split('^');
  if (teile.length < 2 || !/^beleg$/i.test((teile[0] ?? '').trim())) return undefined;

  const hinweise: string[] = [];

  const betraege = (teile[1] ?? '').split('_').map((stueck) => zahl(stueck));
  const saetze: Kassenbonsatz[] = [];

  betraege.forEach((brutto, stelle) => {
    const satz = SAETZE[stelle];
    if (brutto === undefined || satz === undefined || brutto === 0) return;

    const netto = round(brutto / (1 + satz / 100));
    saetze.push({ satz, brutto, netto, steuer: round(brutto - netto) });
  });

  if (betraege.length > SAETZE.length) {
    hinweise.push('Der Code nennt mehr Steuersaetze, als das Format kennt - die zusaetzlichen bleiben liegen.');
  }

  const zahlungen: Kassenbonzahlung[] = [];
  for (const stueck of (teile[2] ?? '').split('_')) {
    if (!stueck.trim()) continue;
    const [betrag = '', art = ''] = stueck.split(':');
    const wert = zahl(betrag);
    if (wert !== undefined) zahlungen.push({ betrag: wert, art: art.trim() || 'unbekannt' });
  }

  const brutto = round(saetze.reduce((summe, satz) => summe + satz.brutto, 0));
  const netto = round(saetze.reduce((summe, satz) => summe + satz.netto, 0));
  const steuer = round(saetze.reduce((summe, satz) => summe + satz.steuer, 0));

  /*
   * Die eine Probe, die der Code selbst zulaesst: Was bezahlt wurde, muss dem
   * entsprechen, was sich auf die Steuersaetze verteilt. Geht sie nicht auf,
   * ist es kein Grund, nichts zu liefern - aber einer, es zu sagen.
   */
  const gezahlt = round(zahlungen.reduce((summe, zahlung) => summe + zahlung.betrag, 0));
  if (zahlungen.length && Math.abs(gezahlt - brutto) > 0.02) {
    hinweise.push(
      `Die Zahlungen ergeben ${gezahlt.toFixed(2)}, die Steuersaetze ${brutto.toFixed(2)}.`,
    );
  }

  const zeitpunkt = logzeit.trim() || startzeit.trim();
  const datum = tagAus(zeitpunkt);
  if (zeitpunkt && !datum) hinweise.push('Der Zeitstempel des Codes liess sich nicht lesen.');

  return {
    kasse: kasse.trim(),
    vorgang: vorgang.trim(),
    zeitpunkt,
    ...(datum ? { datum } : {}),
    brutto,
    netto,
    steuer,
    saetze,
    zahlungen,
    hinweise,
  };
}
