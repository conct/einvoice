import { describe, expect, it } from 'vitest';

import type { Briefpapier } from '../src/parse/pdf-gestaltung';
import { A4 } from '../src/pdf/layout';
import {
  belegteFlaechen,
  pruefeAlleStellungen,
  pruefeStellung,
} from '../src/pdf/stellungspruefung';

/** Ein leerer Bogen in A4 - ohne Beschnittrand, damit der Versatz null ist. */
const leererBogen = (teile: Partial<Briefpapier> = {}): Briefpapier => ({
  seite: { breite: A4.width, hoehe: A4.height },
  pfade: [],
  laeufe: [],
  striche: [],
  kreise: [],
  flaechen: [],
  texte: [],
  falzmarken: [],
  grenze: 700,
  fussgrenze: 0,
  ungedeutet: 0,
  ausgelassen: 0,
  inhaltFuellungen: 0,
  inhaltSchrift: { median: 9, groesste: 9 },
  ...teile,
});

const pfadAuf = (x1: number, y1: number, x2: number, y2: number) => ({
  d: 'M 0 0',
  fuellung: { r: 0, g: 0, b: 0 },
  staerke: 1,
  rahmen: { x1, y1, x2, y2 },
});

describe('pruefeStellung', () => {
  it('meldet einen leeren Bogen als frei', () => {
    for (const befund of pruefeAlleStellungen(leererBogen(), 6)) {
      expect(befund.frei).toBe(true);
      expect(befund.anteil).toBe(0);
    }
  });

  it('erkennt ein Firmenzeichen genau dort, wo der Block stehen soll', () => {
    /*
     * Das Hindernis wird auf den Rahmen gelegt, den die Pruefung selbst
     * genannt hat - nicht auf einen im Test nachgerechneten. Sonst liegen
     * beide gemeinsam daneben, sobald sich die Geometrie aendert.
     */
    const rahmen = pruefeStellung(leererBogen(), 'neben-anschrift', 6).rahmen;
    const bogen = leererBogen({
      pfade: [pfadAuf(rahmen.x1, rahmen.y1, rahmen.x2, rahmen.y2)],
    });

    const befund = pruefeStellung(bogen, 'neben-anschrift', 6);
    expect(befund.frei).toBe(false);
    expect(befund.anteil).toBeGreaterThan(0.9);
  });

  it('laesst die anderen Stellungen frei, wenn nur eine belegt ist', () => {
    const rahmen = pruefeStellung(leererBogen(), 'neben-anschrift', 6).rahmen;
    const bogen = leererBogen({
      pfade: [pfadAuf(rahmen.x1, rahmen.y1, rahmen.x2, rahmen.y2)],
    });

    const frei = pruefeAlleStellungen(bogen, 6).filter((befund) => befund.frei);
    expect(frei.map((befund) => befund.stellung)).toContain('unter-anschrift');
  });

  it('schlaegt bei einer streifenden Haarlinie nicht an', () => {
    /*
     * Eine Trennlinie beruehrt den Block, ohne dass etwas unleserlich wird.
     * Sie zu melden hiesse, den Nutzer wegen nichts zu beunruhigen - und eine
     * Warnung, die staendig kommt, wird nicht mehr gelesen.
     */
    const rahmen = pruefeStellung(leererBogen(), 'neben-anschrift', 6).rahmen;
    const bogen = leererBogen({
      pfade: [pfadAuf(rahmen.x1, rahmen.y2 - 0.5, rahmen.x2, rahmen.y2)],
    });

    expect(pruefeStellung(bogen, 'neben-anschrift', 6).frei).toBe(true);
  });

  it('rechnet den Beschnittrand mit', () => {
    /*
     * Eine Druckvorlage ist groesser als A4 und wird beim Setzen um die halbe
     * Differenz verschoben. Wer das hier auslaesst, prueft gegen Stellen, an
     * denen nichts gedruckt wird.
     */
    const bogen = leererBogen({
      seite: { breite: A4.width + 12, hoehe: A4.height + 12 },
      pfade: [pfadAuf(100, 100, 110, 110)],
    });

    const [flaeche] = belegteFlaechen(bogen);
    expect(flaeche?.x1).toBeCloseTo(94, 1);
    expect(flaeche?.y1).toBeCloseTo(94, 1);
  });

  it('nimmt auch Textstuecke als belegt an', () => {
    const rahmen = pruefeStellung(leererBogen(), 'unter-anschrift', 6).rahmen;
    const bogen = leererBogen({
      texte: [
        { x: rahmen.x1, y: rahmen.y1 + 5, groesse: 10, breite: rahmen.x2 - rahmen.x1, text: 'x' },
      ],
    });

    expect(pruefeStellung(bogen, 'unter-anschrift', 6).frei).toBe(false);
  });
});
