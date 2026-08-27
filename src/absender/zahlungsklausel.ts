import type { Beschriftung, Briefpapier } from '../parse/pdf-gestaltung';

/**
 * Steht das Zahlungsziel schon fest im Briefpapier?
 *
 * ## Warum das eine Frage ist
 *
 * Ein uebernommener Briefbogen bringt oft seine eigene Zahlungsklausel mit.
 * Nachgemessen an einer Fremdrechnung steht im Fuss: "Bitte ueberweisen Sie den
 * oben genannten Betrag innerhalb von 8 Tagen ohne Abzug ... Nach Ablauf dieser
 * Frist gilt die Rechnung als anerkannt."
 *
 * Setzt unser Zahlungsblock dann noch einmal "Zahlbar ohne Abzug bis zum ...",
 * steht die Frist zweimal auf dem Blatt - und wenn beide auseinanderlaufen,
 * widersprechen sie sich. Welche gilt, muesste im Streitfall ein Gericht
 * klaeren; das ist kein Zustand, den ein Rechnungsprogramm herstellen sollte.
 *
 * ## Was das Weglassen nicht betrifft
 *
 * Nur die Anzeige im Rumpf. Das XML behaelt seine Angabe: EN 16931 verlangt
 * mit BR-CO-25 entweder ein Faelligkeitsdatum oder eine Zahlungsbedingung, und
 * maschinell gelesen wird ohnehin das XML. Auf dem Papier steht die Frist
 * weiterhin - einmal statt zweimal.
 *
 * ## Warum nur gemeldet und nicht selbst entschieden
 *
 * Ob eine gefundene Klausel wirklich fuer jede kuenftige Rechnung gelten soll,
 * weiss nur der Absender. Wer immer acht Tage einraeumt, will sie im Bogen;
 * wer je nach Kunde anders vereinbart, braucht sie im Rumpf. Diese Datei
 * findet die Stelle und zitiert sie - entscheiden muss ein Mensch.
 */

export interface Zahlungsklausel {
  /** Die Zeile, in der sie steht - zum Vorzeigen, damit ein Mensch urteilen kann. */
  beleg: string;
  /** Die gefundene Frist in Tagen, falls eine genannt ist. */
  tage?: number;
  /** Woran sie erkannt wurde. */
  merkmal: string;
}

/**
 * Wendungen, an denen eine Zahlungsklausel zu erkennen ist.
 *
 * "ohne Abzug" steht bewusst nicht allein darin: Der Ausdruck kommt auch in
 * Saetzen vor, die keine Frist setzen. Gesucht wird die Frist, nicht der Ton.
 */
const WENDUNGEN: { muster: RegExp; merkmal: string }[] = [
  { muster: /innerhalb\s+von\s+(\d{1,3})\s+(?:Kalender|Werk)?tagen/i, merkmal: 'Frist in Tagen' },
  { muster: /binnen\s+(\d{1,3})\s+(?:Kalender|Werk)?tagen/i, merkmal: 'Frist in Tagen' },
  { muster: /(\d{1,3})\s+Tage[n]?\s+(?:netto|rein\s+netto|ohne\s+Abzug)/i, merkmal: 'Nettofrist' },
  { muster: /Zahlungsziel\s*:?\s*(\d{1,3})?/i, merkmal: 'Zahlungsziel benannt' },
  { muster: /zahlbar\s+(?:sofort|netto|ohne\s+Abzug|innerhalb|bis)/i, merkmal: 'Zahlbar-Klausel' },
  { muster: /(?:sofort|netto)\s+(?:rein\s+)?netto\s+ohne\s+Abzug/i, merkmal: 'Nettoklausel' },
  { muster: /(\d{1,2})\s*%\s*Skonto/i, merkmal: 'Skontoklausel' },
];

/**
 * Sucht eine Zahlungsklausel im Text des Briefbogens.
 *
 * Gesucht wird ueber die zusammengesetzten Zeilen, nicht ueber die einzelnen
 * Stuecke: Eine Wendung wie "innerhalb von 8 Tagen" verteilt sich in einer
 * gesetzten Zeile leicht auf mehrere Stuecke und waere einzeln nicht zu finden.
 */
export function findeZahlungsklausel(zeilen: string[]): Zahlungsklausel | undefined {
  for (const zeile of zeilen) {
    for (const { muster, merkmal } of WENDUNGEN) {
      const treffer = muster.exec(zeile);
      if (!treffer) continue;

      const zahl = treffer[1] ? Number(treffer[1]) : undefined;
      return {
        beleg: zeile.trim(),
        ...(zahl !== undefined && Number.isFinite(zahl) ? { tage: zahl } : {}),
        merkmal,
      };
    }
  }

  return undefined;
}

/**
 * Die Textstuecke eines Bogens zu Zeilen zusammenlegen.
 *
 * Noetig, weil eine gesetzte Zeile sich leicht auf mehrere Stuecke verteilt -
 * "innerhalb von 8 Tagen" kann in fuenf Teilen dastehen und waere einzeln in
 * keinem davon zu finden. Dasselbe gilt fuer eine Anschrift.
 */
export function zeilenImBogen(papier: Briefpapier): string[] {
  const nachHoehe = new Map<number, Beschriftung[]>();
  for (const stueck of papier.texte) {
    const schluessel = Math.round(stueck.y);
    nachHoehe.set(schluessel, [...(nachHoehe.get(schluessel) ?? []), stueck]);
  }

  return [...nachHoehe.entries()]
    .sort((eins, zwei) => zwei[0] - eins[0])
    .map(([, stuecke]) => zeileAus(stuecke))
    .filter(Boolean);
}

/**
 * Setzt die Stuecke einer Zeile zusammen - mit Abstand, wo einer ist.
 *
 * Ohne diese Unterscheidung entstand "Schmiedestraße 1Inhaber Robert Michael
 * Schöne" und "Tel.0501 528051BICCOBADEFFXXX": Der Briefkopf steht in zwei
 * Spalten, und stumpf aneinandergehaengt verschmelzen sie zu Unwoertern. Ein
 * Firmenname liess sich darin nicht mehr finden, und die Uebernahme scheiterte
 * mit "keine Anschrift gefunden".
 *
 * Moeglich wird es, weil jedes Stueck seine gesetzte Breite kennt: Der Abstand
 * ist der Anfang des naechsten minus das Ende des vorigen.
 */
function zeileAus(stuecke: Beschriftung[]): string {
  const sortiert = [...stuecke].sort((eins, zwei) => eins.x - zwei.x);

  let text = '';
  let ende: number | undefined;
  for (const stueck of sortiert) {
    if (!stueck.text.trim()) continue;
    if (text && ende !== undefined && stueck.x - ende > Math.max(stueck.groesse, 1) * WORTLUECKE) {
      text += ' ';
    }
    text += stueck.text;
    ende = stueck.x + stueck.breite;
  }

  return text.replace(/\s+/g, ' ').trim();
}

/** Ab welchem Anteil der Schriftgroesse eine Luecke als Wortabstand gilt. */
const WORTLUECKE = 0.2;

/** Dasselbe fuer ein ausgelesenes Briefpapier. */
export function zahlungsklauselImBogen(papier: Briefpapier): Zahlungsklausel | undefined {
  return findeZahlungsklausel(zeilenImBogen(papier));
}

/**
 * Steht die Bankverbindung schon im Briefbogen?
 *
 * Dann braucht die Rechnung keinen eigenen Zahlungsblock - die vermessene
 * Vorlage hat keinen: Ihre IBAN steht im Briefkopf, und der Fuss verweist mit
 * "auf unser oben stehendes Bankkonto" darauf.
 *
 * ## Warum nicht die Pruefsumme entscheidet
 *
 * Zuerst wurde eine IBAN verlangt, die Mod 97 besteht. Das schlug fehl, und
 * zwar aus dem richtigen Grund: Die Teilmengenschrift der Vorlage uebersetzt
 * einen Glyphen nicht zurueck, der IBAN fehlt beim Auslesen eine Ziffer, und
 * eine geprueft ungueltige IBAN anzubieten waere falsch.
 *
 * Nur ist das hier die falsche Frage. Es geht nicht darum, die Nummer zu
 * **benutzen**, sondern darum, ob sie auf dem Blatt schon **steht** - und sie
 * steht dort, vollstaendig und richtig, weil der Bogen mit den Glyphen der
 * Vorlage gesetzt wird. Was wir nicht entziffern koennen, kann der Empfaenger
 * trotzdem lesen.
 *
 * Deshalb genuegt die Beschriftung. Verlangt werden beide - IBAN und BIC -,
 * damit eine blosse Erwaehnung im Fliesstext nicht ausreicht.
 */
export function bankverbindungImBogen(papier: Briefpapier): boolean {
  const text = zeilenImBogen(papier).join(' ');
  return /\bIBAN\b/i.test(text) && /\b(?:BIC|SWIFT)\b/i.test(text);
}
