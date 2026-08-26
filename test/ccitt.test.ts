import { describe, expect, it } from 'vitest';

import { entschluesseleCcitt } from '../src/parse/ccitt';
import { alsGraustufenPng, maskeAlsGrau } from '../src/util/png';

/**
 * Die Muster sind von Hand kodiert, nicht aus einer Datei entnommen: Nur so
 * ist die Erwartung unabhaengig vom Entschluesseler, den sie pruefen soll.
 */
function ausBits(bits: string): Uint8Array {
  const voll = bits.replace(/\s/g, '');
  const bytes = new Uint8Array(Math.ceil(voll.length / 8));
  for (let i = 0; i < voll.length; i += 1) {
    if (voll[i] === '1') bytes[i >> 3]! |= 0x80 >> (i & 7);
  }
  return bytes;
}

describe('entschluesseleCcitt', () => {
  it('liest eine Zeile aus zwei waagerechten Laeufen', () => {
    // Waagerecht (001), weiss 4 (1011), schwarz 4 (011) - dann ist die Zeile
    // voll. Erwartet: vier weisse, vier schwarze Punkte.
    const bild = entschluesseleCcitt(ausBits('001 1011 011'), { breite: 8, hoehe: 1 });

    expect([...bild.punkte]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(bild.gestoerteZeilen).toBe(0);
  });

  it('uebernimmt eine Zeile unveraendert mit senkrechtem Modus', () => {
    /*
     * Zeile eins waagerecht wie oben, Zeile zwei zweimal V0 (jeweils "1"):
     * Der erste Wechsel bleibt bei 4, der zweite am Zeilenende. Das ist der
     * haeufigste Fall in einem Scan - Text steht selten nur in einer Zeile.
     */
    const bild = entschluesseleCcitt(ausBits('001 1011 011 1 1'), { breite: 8, hoehe: 2 });

    expect([...bild.punkte.slice(0, 8)]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect([...bild.punkte.slice(8)]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('verschiebt den Wechsel mit VR1 und VL1', () => {
    // Zeile zwei: VR1 (011) schiebt den Wechsel um eins nach rechts.
    const rechts = entschluesseleCcitt(ausBits('001 1011 011 011 1'), { breite: 8, hoehe: 2 });
    expect([...rechts.punkte.slice(8)]).toEqual([0, 0, 0, 0, 0, 1, 1, 1]);

    // VL1 (010) schiebt ihn nach links.
    const links = entschluesseleCcitt(ausBits('001 1011 011 010 1'), { breite: 8, hoehe: 2 });
    expect([...links.punkte.slice(8)]).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it('bleibt bei abgeschnittenen Daten stehen, statt zu erfinden', () => {
    // Ein angefangener Kode ohne Fortsetzung. Erwartet wird eine gemeldete
    // Stoerung - nicht eine Zeile aus geratenen Punkten.
    const bild = entschluesseleCcitt(ausBits('001 1011'), { breite: 8, hoehe: 1 });
    expect(bild.gestoerteZeilen).toBeGreaterThan(0);
  });
});

describe('alsGraustufenPng', () => {
  it('schreibt eine Datei mit PNG-Kennung und den erwarteten Massen', () => {
    const png = alsGraustufenPng(2, 2, new Uint8Array([0, 255, 255, 0]));

    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // Breite und Hoehe stehen als 32-Bit-Zahlen im IHDR, ab Byte 16.
    expect([...png.slice(16, 24)]).toEqual([0, 0, 0, 2, 0, 0, 0, 2]);
  });

  it('macht aus einer Maske Schwarz auf Weiss', () => {
    expect([...maskeAlsGrau(new Uint8Array([1, 0, 1]))]).toEqual([0, 255, 0]);
  });

  it('weist zu wenige Bildpunkte ab', () => {
    expect(() => alsGraustufenPng(4, 4, new Uint8Array(3))).toThrow(/Bildpunkte/);
  });
});
