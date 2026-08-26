import type { Briefpapier } from '../parse/pdf-gestaltung';

/**
 * Das Absenderprofil - wer die Rechnung stellt, und wie sein Bogen aussieht.
 *
 * ## Ein Begriff, zwei Orte
 *
 * In der App hat ein Nutzer meist genau eines. Im Buero hat eine Agentur oder
 * ein Steuerbuero viele - eines je Mandant. Das ist aber **derselbe Begriff**,
 * nicht zwei: Ein Mandant ist ein Absenderprofil, von dem das Buero mehrere
 * haelt. Deshalb steht die Beschreibung hier, einmal und zentral, statt an
 * beiden Orten eigen zu wachsen.
 *
 * Der Nutzen ist kein aesthetischer: Ein Briefpapier, das im Buero angelegt
 * wurde, muss sich auf einem Geraet oeffnen lassen und umgekehrt. Zwei
 * Beschreibungen desselben Dings driften auseinander, und zwar genau dann,
 * wenn jemand sie braucht.
 *
 * ## Warum die Kennung aus der Identitaet kommt
 *
 * Sie wird nicht gewuerfelt, sondern aus Name, Ort und Steuernummer gebildet.
 * Damit ergibt dieselbe Firma auf zwei Geraeten dieselbe Kennung - ohne dass
 * die Geraete miteinander sprechen muessen. Eine zufaellige Kennung haette
 * denselben Bogen zweimal unter verschiedenem Namen abgelegt, und beim
 * naechsten Abgleich haette niemand mehr gewusst, welcher gilt.
 *
 * ## Warum das Briefpapier seine Herkunft traegt
 *
 * Ein Briefpapier wird aus einer fremden Rechnung gelesen, und auf einer
 * Rechnung stehen **zwei** Anschriften. Wer das Falsche uebernimmt, verschickt
 * kuenftig Rechnungen unter fremdem Briefkopf - der teuerste denkbare Fehler
 * dieses Programms. Deshalb merkt sich der Bogen, wessen Bogen er ist, und
 * `pruefeZuordnung` verweigert die Verwendung unter anderem Namen.
 */

export interface Identitaet {
  /** Firmenname, wie er auf der Rechnung steht. */
  name: string;
  plz: string;
  ort: string;
  /** Umsatzsteuer-Identifikationsnummer, falls vorhanden. */
  ustId?: string;
  /** Steuernummer, falls keine USt-IdNr vorliegt. */
  steuernummer?: string;
}

export interface Herkunft {
  /** Wie die Vorlage hiess, aus der gelesen wurde. */
  quelle: string;
  /** Tag des Auslesens, als ISO-Datum. */
  gelesenAm: string;
  /** Wen die Vorlage als Absender nannte. */
  identitaet: Identitaet;
}

export interface Absenderprofil {
  /** Aus der Identitaet abgeleitet - siehe `kennungVon`. */
  kennung: string;
  identitaet: Identitaet;
  briefpapier?: Briefpapier;
  /** Nur gesetzt, wenn das Briefpapier aus einer Vorlage stammt. */
  herkunft?: Herkunft;
}

// --- Kennung ----------------------------------------------------------------

/**
 * Vereinheitlicht eine Angabe, damit Schreibweisen nicht zu zwei Profilen
 * fuehren.
 *
 * Umlaute werden umschrieben, Rechtsformen bleiben stehen: "Muster GmbH" und
 * "Muster AG" sind verschiedene Firmen und duerfen nicht zusammenfallen.
 */
function vereinheitliche(wert: string): string {
  return wert
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Die Kennung eines Absenderprofils.
 *
 * Bevorzugt die Steuernummer, weil sie eindeutig ist; ohne sie bleibt Name mit
 * Ort. Das ist schwaecher - zwei gleichnamige Firmen am selben Ort fielen
 * zusammen - aber immer noch besser als eine zufaellige Kennung, die
 * garantiert nicht wiedererkannt wird.
 */
export function kennungVon(identitaet: Identitaet): string {
  const steuer = identitaet.ustId ?? identitaet.steuernummer;
  if (steuer) return `st-${vereinheitliche(steuer)}`;

  const ort = vereinheitliche(`${identitaet.plz} ${identitaet.ort}`);
  return `na-${vereinheitliche(identitaet.name)}-${ort}`;
}

export function profilAus(identitaet: Identitaet): Absenderprofil {
  return { kennung: kennungVon(identitaet), identitaet };
}

// --- Zuordnung --------------------------------------------------------------

export type Zuordnung =
  /** Der Bogen gehoert zu diesem Profil. */
  | { urteil: 'passt' }
  /** Der Bogen hat keine Herkunft - selbst gebaut statt ausgelesen. */
  | { urteil: 'ohne-herkunft' }
  /** Der Bogen gehoert nachweislich zu jemand anderem. */
  | { urteil: 'fremd'; gehoertZu: string };

/**
 * Darf dieses Briefpapier unter diesem Absender verwendet werden?
 *
 * Ein ausgelesener Bogen traegt die Identitaet, die in seiner Vorlage als
 * Absender stand. Stimmt sie nicht mit dem Profil ueberein, wird das gemeldet
 * statt stillschweigend hingenommen. Ein selbst gebauter Bogen ohne Herkunft
 * gilt nicht als fremd - er gehoert dem, der ihn baut.
 */
export function pruefeZuordnung(profil: Absenderprofil, herkunft?: Herkunft): Zuordnung {
  const zu = herkunft ?? profil.herkunft;
  if (!zu) return { urteil: 'ohne-herkunft' };

  const dort = kennungVon(zu.identitaet);
  return dort === profil.kennung ? { urteil: 'passt' } : { urteil: 'fremd', gehoertZu: dort };
}

/**
 * Haengt ein ausgelesenes Briefpapier an ein Profil.
 *
 * Verweigert die Verbindung, wenn die Vorlage jemand anderen als Absender
 * nannte. Das ist die Stelle, an der ein Versehen aufgehalten wird: Wer die
 * Empfaengeranschrift statt der eigenen bestaetigt hat, bekommt hier eine
 * Absage statt spaeter fremde Rechnungen.
 */
export function uebernimmBriefpapier(
  profil: Absenderprofil,
  briefpapier: Briefpapier,
  herkunft: Herkunft,
): { profil: Absenderprofil } | { fehler: Zuordnung } {
  const urteil = pruefeZuordnung(profil, herkunft);
  if (urteil.urteil === 'fremd') return { fehler: urteil };

  return { profil: { ...profil, briefpapier, herkunft } };
}
