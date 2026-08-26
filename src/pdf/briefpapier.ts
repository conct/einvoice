import type { PDFFont, PDFPage } from 'pdf-lib';
import { PDFNumber, PDFOperator, PDFOperatorNames, rgb } from 'pdf-lib';

import { alsHex, type Briefpapier, type Farbe } from '../parse/pdf-gestaltung';

/**
 * Ein abgelesenes Briefpapier wieder ausgeben - als SVG und als PDF.
 *
 * ## Warum beides
 *
 * Ein PDF kann kein SVG aufnehmen; es gibt keinen Einbettungsweg. Wer SVG
 * ausgeben will, muss es fuer die Rechnung ohnehin in Zeichenbefehle
 * uebersetzen. SVG ersetzt das Zeichnen also nicht - aber es ist das bessere
 * Format **davor**:
 *
 * - Der Nutzer kann es oeffnen und richtigstellen, was wir falsch gelesen
 *   haben. Ein PDF-Befund, den niemand nachbessern kann, waere eine
 *   Sackgasse.
 * - Ein Gestalter kann Briefpapier direkt als SVG liefern, ohne sich um
 *   PDF/A-Konformitaet zu kuemmern.
 * - Die App kann es als Vorschau anzeigen, ohne ein PDF zu rendern.
 *
 * Deshalb steht `Briefpapier` in der Mitte, und beide Ausgaenge haengen daran.
 *
 * ## Die Schrift ist unsere
 *
 * Nachgezeichnet wird mit der eingebetteten Hausschrift, nicht mit der der
 * Vorlage. Die steckt zwar als Teilmenge in der Fremddatei, gehoert dem
 * Nutzer aber nicht, nur weil er eine Rechnung damit bekommen hat. Zeilen
 * sitzen dadurch auf den abgelesenen Positionen, laufen aber anders breit.
 */

const farbe = (f: Farbe) => rgb(f.r, f.g, f.b);

/** PDF zaehlt von unten, SVG von oben. */
const gedreht = (y: number, hoehe: number) => hoehe - y;

const geschuetzt = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Das Briefpapier als SVG.
 *
 * Die Schriftangabe bleibt eine Familienliste statt einer eingebetteten
 * Schrift: Das SVG soll sich oeffnen und bearbeiten lassen, nicht
 * originalgetreu drucken - dafuer ist das PDF da.
 */
export function alsSvg(
  papier: Briefpapier,
  schriftfamilie = 'Inter, Helvetica, sans-serif',
): string {
  const { breite, hoehe } = papier.seite;
  const zeilen: string[] = [];

  zeilen.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${breite.toFixed(2)}" ` +
      `height="${hoehe.toFixed(2)}" viewBox="0 0 ${breite.toFixed(2)} ${hoehe.toFixed(2)}">`,
  );
  zeilen.push(`  <rect width="${breite.toFixed(2)}" height="${hoehe.toFixed(2)}" fill="#FFFFFF"/>`);

  /*
   * Aus den Pfaden, nicht aus den erkannten Formen: Was in keine Schublade
   * passte, ist hier trotzdem vollstaendig vorhanden. Die Pfaddaten stehen
   * bereits in SVG-Zaehlweise und koennen unveraendert uebernommen werden.
   */
  for (const p of papier.pfade) {
    const fuellung = p.fuellung ? `fill="${alsHex(p.fuellung)}"` : 'fill="none"';
    const strich = p.strich
      ? ` stroke="${alsHex(p.strich)}" stroke-width="${Math.max(0.1, p.staerke).toFixed(2)}"`
      : '';
    zeilen.push(`  <path d="${p.d}" ${fuellung}${strich}/>`);
  }

  for (const t of papier.texte) {
    /*
     * `textLength` zwingt die Ersatzschrift auf das Mass der Vorlage,
     * `lengthAdjust="spacing"` verteilt die Differenz auf die Abstaende statt
     * die Buchstaben zu verzerren. Damit endet eine Blocksatzzeile wieder
     * dort, wo sie enden soll - auch wenn hier Inter statt der Originalschrift
     * steht.
     */
    const mass = t.breite > 0 ? ` textLength="${t.breite.toFixed(2)}" lengthAdjust="spacing"` : '';
    zeilen.push(
      `  <text x="${t.x.toFixed(2)}" y="${gedreht(t.y, hoehe).toFixed(2)}" ` +
        `font-family="${schriftfamilie}" font-size="${t.groesse.toFixed(2)}"${mass}>` +
        `${geschuetzt(t.text)}</text>`,
    );
  }

  zeilen.push('</svg>');
  return zeilen.join('\n');
}

export interface Zeichenbefund {
  pfade: number;
  texte: number;
  /** Stuecke, die auf das Sollmass der Vorlage eingepasst wurden. */
  eingepasst: number;
  /** Zeichen, die die eingebettete Schrift nicht kennt. */
  fehlendeZeichen: string[];
}

/**
 * Zeichnet das Briefpapier auf eine Seite.
 *
 * Flaechen zuerst, dann Kreise, dann Striche, dann Text - in dieser
 * Reihenfolge deckt nichts das ab, was darueber gehoert.
 */
export function zeichneBriefpapier(
  seite: PDFPage,
  papier: Briefpapier,
  schrift: PDFFont,
): Zeichenbefund {
  /*
   * Dieselben Pfaddaten wie im SVG. `drawSvgPath` legt den Ursprung des Pfades
   * auf den uebergebenen Punkt und zaehlt y nach unten - deshalb die linke
   * obere Ecke, dann stimmen SVG und PDF ohne weitere Umrechnung ueberein.
   */
  const ursprung = { x: 0, y: papier.seite.hoehe };
  for (const p of papier.pfade) {
    /*
     * Galt fuer den Pfad eine Beschneidung, muss sie mit. `drawSvgPath` kennt
     * dafuer keine Angabe, also wird sie als rohe Befehle davorgesetzt: das
     * Rechteck, "W n" fuer beschneiden-ohne-malen, und am Ende zurueck. Die
     * Koordinaten stehen bereits in PDF-Zaehlweise.
     */
    if (p.beschnitt) {
      seite.pushOperators(
        PDFOperator.of(PDFOperatorNames.PushGraphicsState),
        PDFOperator.of(PDFOperatorNames.AppendRectangle, [
          PDFNumber.of(p.beschnitt.x),
          PDFNumber.of(p.beschnitt.y),
          PDFNumber.of(p.beschnitt.breite),
          PDFNumber.of(p.beschnitt.hoehe),
        ]),
        PDFOperator.of(PDFOperatorNames.ClipNonZero),
        PDFOperator.of(PDFOperatorNames.EndPath),
      );
    }

    seite.drawSvgPath(p.d, {
      ...ursprung,
      color: p.fuellung ? farbe(p.fuellung) : undefined,
      borderColor: p.strich ? farbe(p.strich) : undefined,
      borderWidth: p.strich ? Math.max(0.1, p.staerke) : undefined,
    });

    if (p.beschnitt) {
      seite.pushOperators(PDFOperator.of(PDFOperatorNames.PopGraphicsState));
    }
  }

  /*
   * Zeichen, die die Teilmengenschrift nicht kennt, wuerden pdf-lib zum
   * Abbruch bringen - und zwar erst beim Speichern, weit weg von der
   * Ursache. Deshalb hier aussortieren und melden.
   */
  const fehlend = new Set<string>();
  const zeichenbar = (text: string) => {
    let sauber = '';
    for (const zeichen of text) {
      try {
        schrift.widthOfTextAtSize(zeichen, 10);
        sauber += zeichen;
      } catch {
        fehlend.add(zeichen);
      }
    }
    return sauber;
  };

  /*
   * Text als eigene Befehle statt ueber `drawText`.
   *
   * Der Grund ist die Laufweite: Eine Zeile, die fuer die Originalschrift
   * ausgerichtet wurde, erreicht mit einer Ersatzschrift nicht dieselbe
   * Breite. `Tz` streckt oder staucht sie auf das gemessene Sollmass, und die
   * Zeile endet wieder dort, wo die Vorlage sie enden liess. `drawText` bietet
   * dafuer keine Angabe.
   */
  const schluessel = seite.node.newFontDictionaryKey(schrift.name);
  seite.node.setFontDictionary(schluessel, schrift.ref);

  const befehle: PDFOperator[] = [];
  let gezeichnet = 0;
  let gestreckt = 0;

  for (const t of papier.texte) {
    const text = zeichenbar(t.text);
    if (!text.trim()) continue;

    const groesse = Math.max(1, t.groesse);
    const ist = schrift.widthOfTextAtSize(text, groesse);

    /*
     * Nur massvoll einpassen. Weicht die Ersatzschrift um mehr als ein Siebtel
     * ab, stimmt etwas anderes nicht - dann lieber unverzerrt zeichnen und die
     * Abweichung sehen, als sie durch Quetschen zu verstecken.
     */
    let streckung = 100;
    if (t.breite > 0 && ist > 0) {
      const verhaeltnis = (t.breite / ist) * 100;
      if (verhaeltnis > 85 && verhaeltnis < 115) {
        streckung = verhaeltnis;
        gestreckt += 1;
      }
    }

    befehle.push(
      PDFOperator.of(PDFOperatorNames.PushGraphicsState),
      PDFOperator.of(PDFOperatorNames.BeginText),
      PDFOperator.of(PDFOperatorNames.SetFontAndSize, [schluessel, PDFNumber.of(groesse)]),
      PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [
        PDFNumber.of(Number(streckung.toFixed(3))),
      ]),
      PDFOperator.of(PDFOperatorNames.SetTextMatrix, [
        PDFNumber.of(1),
        PDFNumber.of(0),
        PDFNumber.of(0),
        PDFNumber.of(1),
        PDFNumber.of(Number(t.x.toFixed(3))),
        PDFNumber.of(Number(t.y.toFixed(3))),
      ]),
      PDFOperator.of(PDFOperatorNames.ShowText, [schrift.encodeText(text)]),
      PDFOperator.of(PDFOperatorNames.EndText),
      PDFOperator.of(PDFOperatorNames.PopGraphicsState),
    );
    gezeichnet += 1;
  }

  seite.pushOperators(...befehle);

  return {
    pfade: papier.pfade.length,
    texte: gezeichnet,
    eingepasst: gestreckt,
    fehlendeZeichen: [...fehlend],
  };
}
