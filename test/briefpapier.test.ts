import { describe, expect, it } from 'vitest';

import {
  alsHex,
  findeFussgrenze,
  findeGrenze,
  type Briefpapier,
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
