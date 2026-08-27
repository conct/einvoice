import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Wacht ueber den Quelltext selbst.
 *
 * ## Warum
 *
 * Zweimal in derselben Sitzung ist ein **echtes Steuerzeichen** in eine
 * Datei geraten - ein Rueckschritt (0x08) dort, wo die Zeichenfolge "\b"
 * stehen sollte. Beide Male in einem regulaeren Ausdruck, beide Male beim
 * Schreiben der Datei durch ein Werkzeug, das Escapes eine Ebene zu tief
 * aufgeloest hat.
 *
 * Der Schaden ist heimtueckisch: Der Ausdruck ist syntaktisch gueltig, die
 * Typpruefung schweigt, die Datei sieht im Editor richtig aus - und das
 * Muster trifft nie. Beim ersten Mal fiel es erst auf, als eine erkannte
 * Beschriftung fehlte; beim zweiten Mal haette es niemand bemerkt, denn die
 * Bankverbindung im Briefkopf waere einfach nie gefunden worden und der
 * Zahlungsblock immer gedruckt.
 *
 * Deshalb dieser Test statt einer weiteren Vorsichtsregel im Kopf.
 */

const WURZEL = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');

/** Erlaubt sind Zeilenumbruch, Wagenruecklauf und Tabulator. */
const ERLAUBT = new Set([0x09, 0x0a, 0x0d]);

function alleDateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((eintrag) => {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) return alleDateien(pfad);
    return pfad.endsWith('.ts') ? [pfad] : [];
  });
}

describe('Quelltext', () => {
  it('enthaelt keine Steuerzeichen', () => {
    const fundstellen: string[] = [];

    for (const pfad of alleDateien(WURZEL)) {
      const inhalt = readFileSync(pfad, 'utf8');
      for (const [nummer, zeile] of inhalt.split('\n').entries()) {
        const schlimm = [...zeile].filter(
          (zeichen) => zeichen.charCodeAt(0) < 32 && !ERLAUBT.has(zeichen.charCodeAt(0)),
        );
        if (schlimm.length > 0) {
          const kodes = schlimm.map((z) => `0x${z.charCodeAt(0).toString(16)}`).join(' ');
          fundstellen.push(`${pfad.replace(WURZEL, 'src')}:${nummer + 1} (${kodes})`);
        }
      }
    }

    expect(fundstellen).toEqual([]);
  });
});
