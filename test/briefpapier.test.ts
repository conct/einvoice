import { describe, expect, it } from 'vitest';

import {
  alsHex,
  findeFussgrenze,
  findeGrenze,
  findeStrichstaerken,
  findeTextfarbe as textfarbeAus,
  messeRaster,
  type Briefpapier,
  type Pfad,
} from '../src/parse/pdf-gestaltung';
import { alsSvg } from '../src/pdf/briefpapier';

/**
 * Die Zahlen stammen aus einer gestalteten Fremdrechnung - Seite 606,61 x
 * 853,23 pt, also A4 mit 2 mm Beschnitt ringsum.
 */
const HOEHE = 853.23;

const RAHMEN = { x1: 0, y1: 0, x2: 10, y2: 10 };

describe('findeGrenze', () => {
  it('nimmt das Anschriftenfeld, nicht die oberste Postleitzahl', () => {
    /*
     * Der Absender steht im Briefkopf bei y=802 und sieht genauso aus wie der
     * Empfaenger bei y=623. Nur das Fenster nach DIN 5008 unterscheidet sie.
     */
    const grenze = findeGrenze(
      [
        { y: 812, text: 'Schmiedestraße 1', hoehe: 6 },
        { y: 802, text: '01796 Pirna-Altstadt', hoehe: 6 },
        {
          y: 683,
          text: 'SCHÖNE | SCHÖNE • Schmiedestr. 1 • 01796 Pirna',
          hoehe: 6,
        },
        {
          y: 659,
          text: 'VHS Sächsische Schweiz-Osterzgebirge e. V.',
          hoehe: 10,
        },
        { y: 647, text: 'Hr. Christian Ranacher', hoehe: 10 },
        { y: 635, text: 'Geschwister-Scholl-Straße 2', hoehe: 10 },
        { y: 623, text: '01796 Pirna', hoehe: 10 },
      ],
      HOEHE,
    );

    // Knapp ueber dem Kopf des Empfaengerblocks - die Rueckabsenderzeile bei
    // y=683 gehoert damit noch zum Briefkopf.
    expect(grenze).toBeGreaterThan(659);
    expect(grenze).toBeLessThan(683);
  });

  it('faellt ohne Anschriftenfeld auf das obere Fuenftel zurueck', () => {
    expect(findeGrenze([{ y: 400, text: 'Nur Fliesstext', hoehe: 10 }], HOEHE)).toBeCloseTo(
      HOEHE * 0.8,
      1,
    );
  });

  it('haelt eine Ortsangabe im Fliesstext nicht fuer ein Anschriftenfeld', () => {
    const grenze = findeGrenze([{ y: 600, text: '01796 Pirna', hoehe: 10 }], HOEHE);
    expect(grenze).toBeCloseTo(HOEHE * 0.8, 1);
  });
});

describe('findeFussgrenze', () => {
  /*
   * Die Zahlen aus der Fremdrechnung: Der Summenblock endet bei y=267, der
   * Fusstext steht bei 50, 39 und 29 - abgesetzt durch 217 Punkte.
   */
  const MIT_FUSS = [
    { y: 483, text: 'Sehr geehrter Herr Ranacher,', hoehe: 10 },
    { y: 267, text: 'Überweisungsbetrag 77,35 Euro', hoehe: 10 },
    { y: 50, text: 'Bitte überweisen Sie den oben genannten Betrag', hoehe: 8 },
    { y: 39, text: 'und Kundennummern auf unser oben stehendes Bankkonto.', hoehe: 8 },
    { y: 29, text: 'Es gelten unsere Allgemeinen Geschäftsbedingungen.', hoehe: 8 },
  ];

  it('findet den abgesetzten Fussblock', () => {
    const grenze = findeFussgrenze(MIT_FUSS, HOEHE);

    // Ueber der obersten Fusszeile, aber weit unter dem Summenblock.
    expect(grenze).toBeGreaterThan(50);
    expect(grenze).toBeLessThan(267);
  });

  it('meldet nichts, wenn die Rechnung bis unten laeuft', () => {
    /*
     * Ohne Luecke ist der unterste Text der letzte Rechnungsposten. Ihn zum
     * Briefpapier zu erklaeren waere schlimmer, als die Fusszeile zu verpassen.
     */
    const dicht = [
      { y: 70, text: 'Position 14, Nacharbeit', hoehe: 8 },
      { y: 59, text: 'Position 15, Abnahme', hoehe: 8 },
      { y: 48, text: 'Position 16, Uebergabe', hoehe: 8 },
      { y: 37, text: 'Position 17, Einweisung', hoehe: 8 },
    ];

    expect(findeFussgrenze(dicht, HOEHE)).toBe(0);
  });

  it('haelt eine Seitenzahl aus dem Bogen heraus', () => {
    // "Seite 1 von 2" auf jeder kuenftigen Rechnung waere der peinlichste
    // Fehler dieser Uebernahme.
    const mitZahl = [...MIT_FUSS, { y: 18, text: 'Seite 1 von 2', hoehe: 7 }];
    const grenze = findeFussgrenze(mitZahl, HOEHE);

    expect(grenze).toBeGreaterThan(50);
    expect(grenze).toBeLessThan(267);
  });

  it('meldet nichts, wenn unten gar nichts steht', () => {
    expect(findeFussgrenze([{ y: 400, text: 'Mittendrin', hoehe: 10 }], HOEHE)).toBe(0);
  });
});

describe('findeStrichstaerken', () => {
  const strich = (staerke: number): Pfad => ({
    d: 'M 0 0 L 10 0',
    strich: { r: 0, g: 0, b: 0 },
    staerke,
    rahmen: { x1: 0, y1: 0, x2: 10, y2: 0 },
  });

  it('unterscheidet die feine von der betonten Linie', () => {
    /*
     * Die vermessene Vorlage zieht 0,25 pt unter den gewoehnlichen
     * Summenzeilen und 1,00 pt unter dem Ueberweisungsbetrag. Der dicke
     * Strich ist die Auszeichnung der Endsumme - wer alle gleich zieht, nimmt
     * ihr die Betonung.
     */
    /*
     * Die Farbe kommt mit: Unsere Haarlinie ist ein helles Grau, die Vorlage
     * zieht voll deckend. Auf ihrem Bogen stand unsere Linie kaum sichtbar.
     */
    expect(findeStrichstaerken([strich(0.25), strich(0.25), strich(0.25), strich(1)])).toEqual({
      inhaltStriche: { fein: 0.25, stark: 1, farbe: { r: 0, g: 0, b: 0 } },
    });
  });

  it('meldet nichts, wo alle Linien gleich sind', () => {
    // Dann gibt es keine Auszeichnung zu uebernehmen, und es bleibt bei
    // unseren Vorgaben - eine erfundene Betonung waere schlechter als keine.
    expect(findeStrichstaerken([strich(0.4), strich(0.4)])).toEqual({});
  });

  it('urteilt nicht ueber eine einzige Linie', () => {
    expect(findeStrichstaerken([strich(1)])).toEqual({});
  });
});

describe('alsHex', () => {
  it('rechnet die abgelesene Hausfarbe zurueck', () => {
    // "/CS0 cs 1 0.196 0.294 scn" aus dem Inhaltsstrom.
    expect(alsHex({ r: 1, g: 0.196, b: 0.294 })).toBe('#FF324B');
  });
});

const leer = (teile: Partial<Briefpapier> = {}): Briefpapier => ({
  seite: { breite: 100, hoehe: 200 },
  pfade: [],
  laeufe: [],
  striche: [],
  kreise: [],
  flaechen: [],
  texte: [],
  falzmarken: [],
  grenze: 160,
  fussgrenze: 0,
  ungedeutet: 0,
  ausgelassen: 0,
  inhaltFuellungen: 0,
  inhaltSchrift: { median: 9, groesste: 9 },
  ...teile,
});

describe('alsSvg', () => {
  it('gibt die Pfaddaten unveraendert weiter', () => {
    const d = 'M 10.00 20.00 C 30.00 40.00 50.00 60.00 70.00 80.00';
    const svg = alsSvg(
      leer({ pfade: [{ d, fuellung: { r: 1, g: 0, b: 0 }, staerke: 1, rahmen: RAHMEN }] }),
    );

    expect(svg).toContain(`<path d="${d}"`);
    expect(svg).toContain('fill="#FF0000"');
  });

  it('zeichnet eine reine Kontur ohne Fuellung', () => {
    const svg = alsSvg(
      leer({
        pfade: [
          {
            d: 'M 0.00 0.00 L 10.00 0.00',
            strich: { r: 0, g: 0, b: 0 },
            staerke: 0.5,
            rahmen: RAHMEN,
          },
        ],
      }),
    );

    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke-width="0.50"');
  });

  it('schuetzt spitze Klammern im Text', () => {
    // "Plakate > Elternabend" stand so auf einer echten Rechnung.
    const svg = alsSvg(leer({ texte: [{ x: 1, y: 2, groesse: 10, text: 'Plakate > Eltern' }] }));

    expect(svg).toContain('Plakate &gt; Eltern');
    expect(svg).not.toContain('Plakate > Eltern');
  });
});

describe('messeRaster', () => {
  const zeilen = (...hoehen: number[]) => hoehen.map((y) => ({ y, stuecke: [{}] }));

  it('liest Zeilen- und Blockabstand aus den Grundlinien', () => {
    /*
     * Die Hoehen der vermessenen Vorlage. Ihre Abstaende sind 56, 24, 36, 12,
     * 36, 12, 48, 24, 24 - lauter Vielfache von zwoelf. Zwoelf ist die Zeile
     * (kleinster mehrfacher Abstand), vierundzwanzig der Block.
     */
    expect(
      messeRaster(zeilen(539, 483, 459, 423, 411, 375, 363, 315, 291, 267), 700, 100),
    ).toEqual({ zeile: 12, absatz: 24 });
  });

  it('schweigt, wo kein Raster zu erkennen ist', () => {
    // Lauter verschiedene Abstaende: 30, 17, 23. Keiner kommt zweimal vor,
    // also gibt es nichts abzulesen - und dann wird nichts behauptet.
    expect(messeRaster(zeilen(500, 470, 453, 430), 700, 100)).toEqual({});
  });

  it('nimmt nur Zeilen zwischen Anschriftenfeld und Fusszeile', () => {
    /*
     * Der Briefkopf hat sein eigenes Mass - bei der vermessenen Vorlage
     * zehneinhalb Punkt. Zaehlte er mit, waere das der kleinste mehrfache
     * Abstand, und der ganze Rumpf stuende auf dem Raster des Briefkopfes.
     */
    const mitKopf = zeilen(812, 801, 790, 500, 488, 476, 50, 39);
    expect(messeRaster(mitKopf, 600, 100)).toEqual({ zeile: 12 });
  });

  it('nimmt als Blockabstand nur ein Vielfaches der Zeile', () => {
    // 12 und 30: 30 ist kein Vielfaches von 12, also kein Raster, sondern
    // Zufall - darauf soll sich der Satz nicht stuetzen.
    expect(messeRaster(zeilen(500, 488, 476, 446, 416), 700, 100)).toEqual({ zeile: 12 });
  });
});

describe('findeTextfarbe', () => {
  it('nimmt den dunkelsten Ton, nicht den haeufigsten', () => {
    /*
     * Eine Vorlage mit grauem Kleingedrucktem soll ihren Fliesstext nicht
     * danach richten. Und weisser Text aus einem farbigen Firmenzeichen ist
     * gar kein Textton, sondern eine Auszeichnung auf farbigem Grund - er
     * bleibt aussen vor.
     */
    const lauf = (r: number, g: number, b: number) =>
      ({ farbe: { r, g, b } }) as unknown as Parameters<typeof findeStrichstaerken>[0][number];
    const laeufe = [lauf(1, 1, 1), lauf(0.6, 0.6, 0.6), lauf(0, 0, 0), lauf(0.6, 0.6, 0.6)];
    expect(textfarbeAus(laeufe as never)).toEqual({ textfarbe: { r: 0, g: 0, b: 0 } });
  });

  it('schweigt, wo nur helle Toene vorkommen', () => {
    const lauf = (r: number, g: number, b: number) => ({ farbe: { r, g, b } });
    expect(textfarbeAus([lauf(1, 1, 1), lauf(0.9, 0.9, 0.9)] as never)).toEqual({});
  });
});
