import type { Briefpapier } from '../parse/pdf-gestaltung';
import { A4, kennzahlenrahmen, type Kennzahlenstellung } from './layout';

/**
 * Passt der Kennzahlenblock neben den uebernommenen Briefbogen?
 *
 * ## Warum das geprueft werden muss
 *
 * Der Bogen kommt aus einer fremden Rechnung und weiss nichts von unserem
 * Aufbau. Wo bei uns Rechnungsnummer und Datum stehen, hat er womoeglich sein
 * Firmenzeichen. Gedruckt sieht man das sofort - aber dann ist die Rechnung
 * schon beim Empfaenger.
 *
 * Die Angaben dafuer liegen bereits vor: Jeder Pfad des Bogens traegt sein
 * umschliessendes Rechteck, jedes Textstueck seine gemessene Breite. Es fehlt
 * nur der Vergleich.
 *
 * ## Warum nicht einfach verschoben wird
 *
 * Weil eine automatische Ausweichstellung den Nutzer ueberraschen wuerde: Er
 * hat den Block bewusst dorthin gesetzt, wo seine alte Rechnung ihn hatte.
 * Diese Datei meldet den Zusammenstoss und nennt die freien Stellungen -
 * waehlen soll ein Mensch.
 *
 * ## Der Massstab
 *
 * Der Bogen wird auf A4 gesetzt und dabei um die halbe Groessendifferenz
 * verschoben, weil Druckvorlagen einen Beschnittrand tragen. Dieselbe
 * Verschiebung gilt hier - sonst prueft man gegen Stellen, an denen nichts
 * gedruckt wird.
 */

export interface Rahmen {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Stellungsbefund {
  stellung: Kennzahlenstellung;
  frei: boolean;
  /** Die groesste Ueberschneidung in Quadratpunkten - null, wenn frei. */
  ueberschneidung: number;
  /**
   * Wie viel vom Kennzahlenblock verdeckt waere, als Anteil.
   *
   * Aussagekraeftiger als die blosse Flaeche: Ein Zusammenstoss mit einer
   * Haarlinie ist etwas anderes als einer mit einem Firmenzeichen.
   */
  anteil: number;
}

/**
 * Ab welchem Anteil ein Zusammenstoss gemeldet wird.
 *
 * Fuenf Prozent: Eine Trennlinie streift den Block leicht, ohne dass etwas
 * unleserlich wird - sie zu melden hiesse, den Nutzer wegen nichts zu
 * beunruhigen. Ein Zeichen oder ein Textblock deckt deutlich mehr.
 */
const MELDESCHWELLE = 0.05;

const ueberlappung = (eins: Rahmen, zwei: Rahmen): number => {
  const breite = Math.min(eins.x2, zwei.x2) - Math.max(eins.x1, zwei.x1);
  const hoehe = Math.min(eins.y2, zwei.y2) - Math.max(eins.y1, zwei.y1);
  return breite > 0 && hoehe > 0 ? breite * hoehe : 0;
};

/**
 * Die belegten Flaechen eines Bogens, bereits auf A4 verschoben.
 *
 * Textstuecke bekommen ihre gemessene Breite und eine Hoehe aus der
 * Schriftgroesse. Das ist etwas grosszuegig - Unterlaengen zaehlen mit -, und
 * grosszuegig ist hier die richtige Richtung: Lieber einmal zu viel warnen
 * als eine ueberdruckte Rechnung.
 */
export function belegteFlaechen(papier: Briefpapier): Rahmen[] {
  const versatzX = (A4.width - papier.seite.breite) / 2;
  const versatzY = (A4.height - papier.seite.hoehe) / 2;

  const flaechen: Rahmen[] = papier.pfade.map((pfad) => ({
    x1: pfad.rahmen.x1 + versatzX,
    y1: pfad.rahmen.y1 + versatzY,
    x2: pfad.rahmen.x2 + versatzX,
    y2: pfad.rahmen.y2 + versatzY,
  }));

  for (const text of papier.texte) {
    flaechen.push({
      x1: text.x + versatzX,
      y1: text.y + versatzY - text.groesse * 0.25,
      x2: text.x + Math.max(text.breite, 1) + versatzX,
      y2: text.y + versatzY + text.groesse * 0.85,
    });
  }

  return flaechen;
}

/**
 * Prueft eine einzelne Stellung gegen den Bogen.
 *
 * `zeilen` ist die Zahl der gefuellten Kennzahlen - sie bestimmt, wie tief der
 * Block reicht. Wer hier grosszuegig schaetzt, prueft gegen einen groesseren
 * Block als gedruckt wird, und das ist die richtige Richtung.
 */
export function pruefeStellung(
  papier: Briefpapier,
  stellung: Kennzahlenstellung,
  zeilen: number,
  flaechen: Rahmen[] = belegteFlaechen(papier),
): Stellungsbefund {
  const block = kennzahlenrahmen(stellung, Math.max(1, zeilen));
  const blockflaeche = Math.max(1, (block.x2 - block.x1) * (block.y2 - block.y1));

  let groesste = 0;
  let summe = 0;
  for (const flaeche of flaechen) {
    const wert = ueberlappung(block, flaeche);
    if (wert > groesste) groesste = wert;
    summe += wert;
  }

  const anteil = Math.min(1, summe / blockflaeche);
  return { stellung, frei: anteil < MELDESCHWELLE, ueberschneidung: groesste, anteil };
}

const ALLE: Kennzahlenstellung[] = ['neben-anschrift', 'ueber-anschrift', 'unter-anschrift'];

/**
 * Prueft alle Stellungen und ordnet sie nach Eignung.
 *
 * Die freieste zuerst. Der Aufrufer kann damit sowohl warnen ("die gewaehlte
 * ist belegt") als auch vorschlagen ("diese waere frei"), ohne selbst zu
 * rechnen.
 */
export function pruefeAlleStellungen(papier: Briefpapier, zeilen: number): Stellungsbefund[] {
  const flaechen = belegteFlaechen(papier);
  return ALLE.map((stellung) => pruefeStellung(papier, stellung, zeilen, flaechen)).sort(
    (eins, zwei) => eins.anteil - zwei.anteil,
  );
}
