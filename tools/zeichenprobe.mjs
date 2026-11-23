/*
 * Welche Waehrungszeichen kennt die mitgelieferte Schrift?
 *
 * Die Teilmengen von Inter sind fuer deutsche Rechnungen gebaut, nicht fuer
 * alle Waehrungen der Welt. Diese Liste sagt, welches Zeichen wirklich
 * erscheint - und welches auf den ISO-Kode ausweicht.
 *
 *   node tools/zeichenprobe.mjs
 */
import { readFile } from 'node:fs/promises';

import { Zeichenpruefung } from '../dist/index.js';
import { waehrungszeichen } from '../dist/index.js';

const datei = (name) => new URL(`../files/${name}`, import.meta.url);
const [regular, bold] = await Promise.all([
  readFile(datei('Inter-Rechnung-Regular.ttf')),
  readFile(datei('Inter-Rechnung-Bold.ttf')),
]);

const pruefung = new Zeichenpruefung([new Uint8Array(regular), new Uint8Array(bold)]);
const codes = [
  'EUR', 'GBP', 'USD', 'JPY', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY',
  'UAH', 'RUB', 'INR', 'KRW', 'ILS', 'THB', 'VND', 'PHP', 'NGN', 'BRL',
];

const fehlend = [];
for (const code of codes) {
  const zeichen = waehrungszeichen(code);
  const kennt = pruefung.kennt(zeichen);
  if (!kennt) fehlend.push(`${code} (${zeichen})`);
  console.log(`${code.padEnd(5)} ${zeichen.padEnd(4)} ${kennt ? 'vorhanden' : 'FEHLT'}`);
}

console.log(
  fehlend.length === 0
    ? '\nAlle Zeichen sind in der Schrift.'
    : `\nAuf den Kode ausgewichen wird bei: ${fehlend.join(', ')}`,
);
