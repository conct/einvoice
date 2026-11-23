import { z } from 'zod';

import { addDays, formatDate, type IsoDate } from '../util/date';
import { formatAmount, round } from '../util/money';

/**
 * Skonto - der Abzug fuer schnelle Zahlung.
 *
 * ## Warum das ein eigenes Modul braucht
 *
 * EN 16931 kennt kein Feld fuer Skonto. Es gibt nur BT-20, die
 * Zahlungsbedingungen als **Fliesstext** - und Fliesstext liest keine
 * Buchhaltungssoftware aus. Deshalb hat die KoSIT fuer die XRechnung eine
 * Schreibweise festgelegt, die in diesem Text steht und sich trotzdem
 * maschinell lesen laesst:
 *
 * ```
 * #SKONTO#TAGE=14#PROZENT=2.00#
 * #SKONTO#TAGE=30#PROZENT=1.00#BASISBETRAG=1000.00#
 * Zahlbar ohne Abzug bis zum 31.12.2026.
 * ```
 *
 * Jede Stufe steht in einer eigenen Zeile, beginnt mit `#SKONTO#` und endet
 * auf `#`. Prozent traegt zwei Nachkommastellen mit **Punkt**, nicht mit
 * Komma - das ist eine Maschinenangabe, keine Anzeige. Freier Text darf
 * folgen; was keine Skontozeile ist, bleibt Text.
 *
 * ## Was hier bewusst nicht passiert
 *
 * **Der Abzug wird nicht verrechnet.** Die Rechnung weist den vollen Betrag
 * aus, und der Skonto ist ein Angebot: Zahlt der Empfaenger spaeter, gilt der
 * volle Betrag. Wer den Abzug in die Summen einrechnete, haette eine Rechnung
 * ueber einen Betrag, der nur unter einer Bedingung stimmt - und die Summen
 * muessen ohne Bedingung stimmen, sonst scheitert jede Pruefung.
 *
 * **Die Umsatzsteuer bleibt unberuehrt.** Wird der Abzug tatsaechlich genutzt,
 * mindert das die Bemessungsgrundlage nachtraeglich (§ 17 UStG). Das ist ein
 * Vorgang in der Buchhaltung, kein Feld in diesem Dokument.
 */

/** Eine Skontostufe: so viele Tage, so viel Prozent. */
export const SkontostufeSchema = z.object({
  /** Tage ab Rechnungsdatum. Ganzzahlig und groesser als null. */
  tage: z.number().int().positive(),
  /**
   * Abzug in Prozent, groesser als null und hoechstens hundert.
   *
   * Hundert ist als Grenze absurd hoch und steht trotzdem hier: Alles
   * darueber ist mit Sicherheit ein Tippfehler - 200 statt 2,00 -, und ein
   * Tippfehler in dieser Zahl kostet Geld.
   */
  prozent: z.number().positive().max(100),
  /**
   * Betrag, auf den sich der Abzug bezieht. Ohne Angabe der Zahlbetrag.
   *
   * Noetig, wenn nur ein Teil skontierfaehig ist - Fracht und Montage sind es
   * nach vielen Einkaufsbedingungen nicht.
   */
  basisbetrag: z.number().nonnegative().optional(),
});
export type Skontostufe = z.infer<typeof SkontostufeSchema>;

const MARKE = '#SKONTO#';

/**
 * Eine Stufe in der Schreibweise der XRechnung.
 *
 * Zwei Nachkommastellen, Punkt als Trenner, und am Ende ein `#`. Das ist
 * nicht schoen, aber es ist die Form, die ein Empfaenger erwartet.
 */
export function skontozeile(stufe: Skontostufe): string {
  const teile = [`TAGE=${Math.trunc(stufe.tage)}`, `PROZENT=${stufe.prozent.toFixed(2)}`];
  if (stufe.basisbetrag !== undefined) {
    teile.push(`BASISBETRAG=${stufe.basisbetrag.toFixed(2)}`);
  }
  return `${MARKE}${teile.join('#')}#`;
}

/**
 * Der vollstaendige Inhalt von BT-20: erst die Stufen, dann der freie Text.
 *
 * Die Reihenfolge ist Absicht. Ein Empfaenger, der die Zeilen maschinell
 * liest, findet sie am Anfang; ein Mensch liest den Satz darunter.
 */
export function zahlungsbedingungen(angabe: {
  terms?: string | undefined;
  skonto?: readonly Skontostufe[] | undefined;
}): string | undefined {
  const zeilen = (angabe.skonto ?? []).map(skontozeile);
  const text = angabe.terms?.trim();
  if (zeilen.length === 0) return text || undefined;
  /*
   * Der Zeilenumbruch hinter der LETZTEN Stufe ist Pflicht, auch wenn kein
   * Text folgt.
   *
   * BR-DE-18 prueft zwei Dinge: dass jede Zeile, die mit '#' beginnt, der
   * Schreibweise entspricht - und dass hinter dem letzten Block ein Umbruch
   * steht. Im Original: matches(tokenize(., '#.+#')[last()], '^\s*\n').
   * Ohne ihn weist der Pruefer der KoSIT die Rechnung ab; nachgesehen am
   * 23.11.2026 mit dem Validator zu XRechnung 3.0.2, der eine Fassung ohne
   * Umbruch zurueckwies und eine mit Umbruch annahm.
   */
  return zeilen.map((zeile) => `${zeile}\n`).join('') + (text ?? '');
}

/**
 * Macht aus BT-20 wieder Stufen und Text.
 *
 * Gelesen wird nachsichtig - fremde Dateien halten sich nicht immer an die
 * Schreibweise: Gross- und Kleinschreibung ist gleich, Leerzeichen um die
 * Zeichen werden uebergangen, und eine Zeile, die wie Skonto aussieht aber
 * unbrauchbare Zahlen traegt, bleibt Text. Lieber ein Satz zu viel im
 * Fliesstext als eine erfundene Zahl im Modell.
 */
export function liesZahlungsbedingungen(bt20: string | undefined): {
  skonto?: Skontostufe[];
  terms?: string;
} {
  if (!bt20) return {};
  const stufen: Skontostufe[] = [];
  const rest: string[] = [];

  for (const zeile of bt20.split(/\r?\n/)) {
    const roh = zeile.trim();
    if (!roh) continue;
    if (!roh.toUpperCase().startsWith(MARKE)) {
      rest.push(roh);
      continue;
    }
    const felder = new Map<string, string>();
    for (const paar of roh.slice(MARKE.length).split('#')) {
      const [name, wert] = paar.split('=');
      if (name && wert !== undefined) felder.set(name.trim().toUpperCase(), wert.trim());
    }
    const tage = Number(felder.get('TAGE'));
    const prozent = Number(felder.get('PROZENT')?.replace(',', '.'));
    const basis = felder.has('BASISBETRAG')
      ? Number(felder.get('BASISBETRAG')?.replace(',', '.'))
      : undefined;
    const brauchbar =
      Number.isInteger(tage) &&
      tage > 0 &&
      Number.isFinite(prozent) &&
      prozent > 0 &&
      prozent <= 100 &&
      (basis === undefined || (Number.isFinite(basis) && basis >= 0));
    if (!brauchbar) {
      rest.push(roh);
      continue;
    }
    stufen.push({ tage, prozent, ...(basis === undefined ? {} : { basisbetrag: basis }) });
  }

  return {
    ...(stufen.length > 0 ? { skonto: stufen } : {}),
    ...(rest.length > 0 ? { terms: rest.join('\n') } : {}),
  };
}

/** Was die Stufe in Geld bedeutet, bezogen auf den Zahlbetrag. */
export function skontobetrag(stufe: Skontostufe, zahlbetrag: number): number {
  return round(((stufe.basisbetrag ?? zahlbetrag) * stufe.prozent) / 100);
}

/** Der Tag, bis zu dem die Stufe gilt. */
export function skontofrist(stufe: Skontostufe, rechnungsdatum: IsoDate): IsoDate {
  return addDays(rechnungsdatum, Math.trunc(stufe.tage));
}

const prozentText = (wert: number): string =>
  `${wert.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

/**
 * Derselbe Inhalt als Satz, den ein Mensch lesen kann.
 *
 * "Bei Zahlung bis 07.12.2026 abzueglich 2 % Skonto (2,38 EUR) = 116,62 EUR,
 * sonst bis 21.12.2026 ohne Abzug."
 *
 * Beide Betraege stehen dabei, und das ist der Punkt: Niemand rechnet zwei
 * Prozent im Kopf, und wer sie falsch rechnet, zahlt falsch. Der Abzug sagt,
 * was der Nachlass wert ist; die Summe dahinter sagt, was zu ueberweisen ist.
 */
export function skontosatz(
  stufen: readonly Skontostufe[],
  angabe: {
    rechnungsdatum: IsoDate;
    zahlbetrag: number;
    waehrung?: string | undefined;
    faelligAm?: IsoDate | undefined;
  },
): string | undefined {
  const sortiert = [...stufen].sort((a, b) => a.tage - b.tage);
  if (sortiert.length === 0) return undefined;

  const teile = sortiert.map((stufe, i) => {
    const frist = formatDate(skontofrist(stufe, angabe.rechnungsdatum));
    const abzug = skontobetrag(stufe, angabe.zahlbetrag);
    const rest = formatAmount(round(angabe.zahlbetrag - abzug), angabe.waehrung);
    const kopf = i === 0 ? `Bei Zahlung bis ${frist} abzüglich ` : `bis ${frist} abzüglich `;
    const wort = i === 0 ? ' Skonto' : '';
    return `${kopf}${prozentText(stufe.prozent)}${wort} (${formatAmount(abzug, angabe.waehrung)}) = ${rest}`;
  });

  const schluss = angabe.faelligAm
    ? `sonst bis ${formatDate(angabe.faelligAm)} ohne Abzug`
    : 'sonst ohne Abzug';
  return `${teile.join(', ')}, ${schluss}.`;
}
