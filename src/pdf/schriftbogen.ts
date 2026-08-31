import { PDFDict, PDFDocument, PDFName, PDFObjectCopier, PDFRef } from 'pdf-lib';

import type { Briefpapier } from '../parse/pdf-gestaltung';

/**
 * Die Schriften eines Briefkopfs, herausgeloest in eine eigene kleine Datei.
 *
 * ## Warum es das gibt
 *
 * Der Briefkopf einer uebernommenen Vorlage wird am besten **wiedergegeben**:
 * dieselben Glyphennummern, dieselben Vorschuebe, dieselbe Schrift. Dafuer
 * braucht es die Schriftobjekte der Quelldatei - und die lagen bisher nur im
 * Original-PDF. Die App hebt das nicht auf; sie liest es einmal und behaelt
 * die Messwerte.
 *
 * Ohne die Schriften wird der Briefkopf mit der Hausschrift nachgezeichnet
 * und je Textlauf auf seine gemessene Breite eingepasst. Anfang und Ende jeder
 * Zeile stimmen dann, die Wortabstaende dazwischen nicht. Nachgemessen an
 * einer Fremdrechnung, deren Fusszeile im **Blocksatz** steht: Ihre Deckung
 * fiel von 100 auf 44,6 Prozent, waehrend Rumpf und Kennzahlen unveraendert
 * blieben.
 *
 * ## Warum nicht das ganze PDF aufheben
 *
 * Weil darin die alte Rechnung steht - mit dem Namen eines Kunden, seinen
 * Positionen und Betraegen. Diese Daten in jedem Absenderprofil und in jeder
 * weitergegebenen Briefbogendatei mitzufuehren waere eine Datensammlung ohne
 * Zweck. Gebraucht werden die Schriften, nicht der Vorgang.
 *
 * Und es waere gross: Die Vorlage wiegt eine halbe Megabyte, ihre vier
 * Schriften zusammen fuenfzehn Kilobyte. Eingebettet ist naemlich nur eine
 * Teilmenge - die Zeichen, die auf jener einen Seite vorkamen.
 *
 * ## Was herauskommt
 *
 * Eine gueltige PDF-Datei mit **einer leeren Seite**, deren Schriftverzeichnis
 * dieselben Namen traegt wie das Original. Damit ist sie genau das, was
 * `bereiteVorlagenschrift` als Quelle erwartet - der Renderer braucht keine
 * Zeile Aenderung, und wer eine echte Vorlage hat, kann sie weiterhin
 * uebergeben.
 */

/**
 * Loest die Schriften des Briefkopfs aus der Quelldatei.
 *
 * Genommen werden nur die, die seine Textlaeufe wirklich benutzen - eine
 * Rechnung bettet oft Schnitte ein, die nur im Rechnungsteil vorkommen, und
 * die gehoeren nicht zum Bogen.
 *
 * Gibt `undefined` zurueck, wenn nichts zu holen ist: kein Textlauf, keine
 * Schriftressource, oder die Datei laesst sich nicht lesen. Dann bleibt es
 * beim Nachzeichnen.
 */
export async function schriftbogenAus(
  quelle: Uint8Array,
  papier: Briefpapier,
  quellseite = 0,
): Promise<Uint8Array | undefined> {
  const gebraucht = new Set(papier.laeufe.map((lauf) => lauf.schrift));
  if (gebraucht.size === 0) return undefined;

  let quellDoc;
  try {
    quellDoc = await PDFDocument.load(quelle, { throwOnInvalidObject: false });
  } catch {
    return undefined;
  }

  const quellSchriften = quellDoc
    .getPage(quellseite)
    .node.Resources()
    ?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!quellSchriften) return undefined;

  const ziel = await PDFDocument.create();
  const kopierer = PDFObjectCopier.for(quellDoc.context, ziel.context);
  /*
   * Eine Seite muss es sein, und ihr Mass ist gleichgueltig: Gelesen wird nur
   * ihr Schriftverzeichnis. Ein Punkt im Quadrat haelt die Datei klein.
   */
  const seite = ziel.addPage([1, 1]);

  let gefunden = 0;
  for (const name of gebraucht) {
    const verweis = quellSchriften.get(PDFName.of(name));
    if (!verweis) continue;

    const kopie = kopierer.copy(verweis);
    const ref = kopie instanceof PDFRef ? kopie : ziel.context.register(kopie);
    // **Derselbe** Name wie im Original - daran findet die Wiedergabe sie.
    seite.node.setFontDictionary(PDFName.of(name), ref);
    gefunden += 1;
  }
  if (gefunden === 0) return undefined;

  /*
   * Ohne Zeitstempel und ohne Erzeugerangabe: Die Datei wandert in ein Profil
   * und in jede Briefbogendatei; sie soll bei gleicher Vorlage zweimal gleich
   * herauskommen, damit sich zwei Lieferungen vergleichen lassen.
   */
  ziel.setCreationDate(new Date(0));
  ziel.setModificationDate(new Date(0));
  return ziel.save({ useObjectStreams: false });
}
