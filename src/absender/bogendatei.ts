import type { Briefpapier } from '../parse/pdf-gestaltung';
import type { Beschriftungen } from '../pdf/beschriftungen';
import type { Kennzahlenstellung } from '../pdf/layout';
import {
  kennungVon,
  pruefeZuordnung,
  type Herkunft,
  type Identitaet,
  type Zuordnung,
} from './profil';
import type { Vorlagenschalter } from './vorlage';

/**
 * Der Briefbogen eines Absenders als eine Datei.
 *
 * ## Warum es das gibt
 *
 * Bis hierher entstand alles auf dem Geraet: Der Nutzer waehlt eine alte
 * Rechnung, sie wird vermessen, und das Ergebnis liegt in seinem Profil.
 * Damit ist es an dieses eine Geraet gebunden. Wer sein Telefon wechselt,
 * faengt von vorn an; wer am Rechner und am Telefon abrechnet, hat zwei
 * verschiedene Briefbogen; und wem die Uebernahme nicht gelingt, dem kann
 * niemand helfen, weil es nichts gibt, das man ihm schicken koennte.
 *
 * Diese Datei ist das fehlende Stueck: alles Gemessene an einer Stelle,
 * lesbar, uebertragbar, ersetzbar.
 *
 * ## Warum sie die Identitaet mitfuehrt
 *
 * Weil eine Briefbogendatei sonst das perfekte Werkzeug waere, um unter
 * fremdem Namen Rechnungen zu stellen. Sie traegt deshalb dieselbe Herkunft
 * wie das Profil, und beim Einlesen wird sie gegen den eigenen Absender
 * geprueft - genau so, wie es beim Uebernehmen aus einer fremden Rechnung
 * geschieht. Wer die Datei eines anderen einliest, bekommt eine Warnung und
 * keinen Briefkopf.
 *
 * ## Warum JSON und kein eigenes Format
 *
 * Weil ein Mensch hineinsehen koennen soll. Was hier gemessen wurde, ist
 * nicht offensichtlich - Einzuege, Rasterabstaende, Fluchtlinien -, und die
 * einzige Beschwerde, die dazu je kommen wird, lautet "das steht falsch".
 * Dann muss man nachsehen und aendern koennen, ohne uns zu fragen.
 */

/** Die Kennung im Kopf der Datei. */
export const BOGENDATEI_ART = 'erechnung-briefbogen';

/**
 * Die Fassung des Formats.
 *
 * Steigt, sobald sich die Bedeutung eines Feldes aendert - nicht, wenn eines
 * hinzukommt. Fehlende Felder fallen beim Lesen auf ihre Vorgabe zurueck; ein
 * umgedeutetes Feld waere dagegen still falsch.
 */
export const BOGENDATEI_FASSUNG = 1;

export interface Bogendatei {
  art: typeof BOGENDATEI_ART;
  fassung: number;
  /** Wann sie geschrieben wurde - als Datum, nicht als Zeitpunkt. */
  erzeugtAm: string;
  /** Wie das Profil heisst, aus dem sie stammt. */
  bezeichnung?: string;
  /** Wessen Bogen das ist. Ohne diese Angabe wird nichts uebernommen. */
  herkunft: Herkunft;
  briefpapier: Briefpapier;
  beschriftungen?: Partial<Beschriftungen>;
  kennzahlen?: Kennzahlenstellung;
  vorlage?: Vorlagenschalter;
  /**
   * Die Hausschrift, als base64.
   *
   * Sie macht die Datei gross - zwei Schnitte sind schnell ein halbes
   * Megabyte. Sie wegzulassen waere trotzdem falsch: Ohne sie sieht die
   * Rechnung auf dem neuen Geraet anders aus als auf dem alten, und genau
   * das soll die Datei ja verhindern.
   */
  schrift?: { name?: string; regular: string; fett?: string; kraeftig?: string };
}

/** Was ein Profil an uebertragbarer Gestaltung mitbringt. */
export interface Bogenquelle {
  bezeichnung?: string;
  briefpapierHerkunft?: Herkunft;
  briefpapier?: Briefpapier;
  beschriftungen?: Partial<Beschriftungen>;
  kennzahlen?: Kennzahlenstellung;
  vorlage?: Vorlagenschalter;
  schriftName?: string;
  schriftRegular?: string;
  schriftFett?: string;
  schriftKraeftig?: string;
}

/**
 * Schreibt die Datei aus einem Profil.
 *
 * Gibt `undefined` zurueck, wenn es nichts zu schreiben gibt: ohne Bogen und
 * ohne Herkunft waere die Datei ein leeres Versprechen, und beim Einlesen
 * liesse sich nicht pruefen, wem sie gehoert.
 */
export function alsBogendatei(quelle: Bogenquelle, heute: string): Bogendatei | undefined {
  if (!quelle.briefpapier || !quelle.briefpapierHerkunft) return undefined;

  return {
    art: BOGENDATEI_ART,
    fassung: BOGENDATEI_FASSUNG,
    erzeugtAm: heute,
    ...(quelle.bezeichnung ? { bezeichnung: quelle.bezeichnung } : {}),
    herkunft: quelle.briefpapierHerkunft,
    briefpapier: quelle.briefpapier,
    ...(quelle.beschriftungen && Object.keys(quelle.beschriftungen).length > 0
      ? { beschriftungen: quelle.beschriftungen }
      : {}),
    ...(quelle.kennzahlen ? { kennzahlen: quelle.kennzahlen } : {}),
    ...(quelle.vorlage ? { vorlage: quelle.vorlage } : {}),
    ...(quelle.schriftRegular
      ? {
          schrift: {
            ...(quelle.schriftName ? { name: quelle.schriftName } : {}),
            regular: quelle.schriftRegular,
            ...(quelle.schriftFett ? { fett: quelle.schriftFett } : {}),
            ...(quelle.schriftKraeftig ? { kraeftig: quelle.schriftKraeftig } : {}),
          },
        }
      : {}),
  };
}

/** Warum eine Datei nicht angenommen wurde. */
export type Bogenmangel = 'kein-json' | 'fremde-art' | 'zu-neu' | 'unvollstaendig';

export interface Bogenbefund {
  datei?: Bogendatei;
  mangel?: Bogenmangel;
  /** Ob die Datei zum eigenen Absender passt - nur bei fehlerfreier Datei. */
  zuordnung?: Zuordnung;
}

/**
 * Liest eine Briefbogendatei und ordnet sie dem eigenen Absender zu.
 *
 * Beides in einem Schritt, weil das eine ohne das andere nichts wert ist: Eine
 * gueltige Datei, die einem fremden Absender gehoert, darf nicht uebernommen
 * werden, und die Frage laesst sich nur hier beantworten - danach ist die
 * Herkunft nur noch ein Feld unter vielen.
 */
export function liesBogendatei(text: string, eigene: Identitaet): Bogenbefund {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { mangel: 'kein-json' };
  }

  if (!roh || typeof roh !== 'object') return { mangel: 'kein-json' };
  const kandidat = roh as Partial<Bogendatei>;

  if (kandidat.art !== BOGENDATEI_ART) return { mangel: 'fremde-art' };
  /*
   * Eine hoehere Fassung wird nicht geraten. Ein Feld, dessen Bedeutung sich
   * geaendert hat, saehe unveraendert aus und wuerde still falsch gedeutet -
   * und das faellt erst auf der gedruckten Rechnung auf.
   */
  if (typeof kandidat.fassung !== 'number' || kandidat.fassung > BOGENDATEI_FASSUNG) {
    return { mangel: 'zu-neu' };
  }

  const papier = kandidat.briefpapier;
  if (
    !kandidat.herkunft?.identitaet ||
    !papier ||
    !Array.isArray(papier.pfade) ||
    !Array.isArray(papier.texte) ||
    !papier.seite ||
    !(papier.seite.breite > 0) ||
    !(papier.seite.hoehe > 0)
  ) {
    return { mangel: 'unvollstaendig' };
  }

  return {
    datei: kandidat as Bogendatei,
    zuordnung: pruefeZuordnung(
      { kennung: kennungVon(eigene), identitaet: eigene },
      kandidat.herkunft,
    ),
  };
}

/** Was dem Nutzer zu einem Mangel gesagt wird. */
export function bogenmangelText(mangel: Bogenmangel): string {
  switch (mangel) {
    case 'kein-json':
      return 'Die Datei ließ sich nicht lesen. Erwartet wird eine Briefbogendatei, wie sie diese App schreibt.';
    case 'fremde-art':
      return 'Das ist keine Briefbogendatei dieser App.';
    case 'zu-neu':
      return 'Die Datei stammt aus einer neueren Fassung der App. Bitte aktualisieren Sie, statt sie hier zu deuten.';
    case 'unvollstaendig':
      return 'Der Datei fehlen Angaben — Briefbogen oder Absender. Übernommen wird sie nicht.';
  }
}
