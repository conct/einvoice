/**
 * Erzeugt src/assets/icc.ts aus der Profildatei unter files/.
 *
 *   npm run icc
 *
 * Warum das Profil doppelt liegt: PDF/A verlangt einen OutputIntent mit
 * Farbprofil, und die Bibliothek darf nicht aufs Dateisystem greifen. In Node
 * liest assets/node.ts die Datei, in der App und im Browser kommt sie als
 * Base64 aus dem Bundle - 4 kB Text, die jeder Bundler mitnimmt, statt eines
 * Ladepfads fuer Binaerdaten auf drei Plattformen.
 *
 * Erzeugt wird die Datei, damit die Herkunft nachweisbar bleibt: Wer das
 * Profil austauscht, laesst diesen Befehl laufen, und Pruefsumme und
 * Byteanzahl im Kopf der Datei sagen danach, was drinsteht.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const QUELLE = 'files/sRGB2014.icc';
const ZIEL = 'src/assets/icc.ts';

const wurzel = new URL('..', import.meta.url);
const bytes = new Uint8Array(await readFile(new URL(QUELLE, wurzel)));

// Kopfangaben zur Kontrolle - eine ICC-Datei nennt ihre Laenge selbst, und
// 'acsp' an Byte 36 ist die Signatur. Stimmt beides nicht, ist es kein Profil.
const angegeben = new DataView(bytes.buffer).getUint32(0);
const signatur = new TextDecoder().decode(bytes.subarray(36, 40));
if (signatur !== 'acsp') throw new Error(`${QUELLE} ist kein ICC-Profil (Signatur "${signatur}")`);
if (angegeben !== bytes.length) {
  throw new Error(`${QUELLE} ist beschaedigt: Kopf nennt ${angegeben}, Datei hat ${bytes.length} Bytes`);
}

const base64 = Buffer.from(bytes).toString('base64');
const pruefsumme = createHash('sha256').update(bytes).digest('hex');
const zeilen = (base64.match(/.{1,100}/g) ?? []).map((z) => `  '${z}'`).join(' +\n');

const inhalt = `/**
 * sRGB IEC 61966-2-1 als ICC-Profil, eingebettet als Base64.
 *
 * PDF/A verlangt einen OutputIntent mit Farbprofil. Das Profil ist mit 3 kB
 * klein genug, um es direkt im Bundle mitzufuehren - so braucht weder die
 * native App noch der Browser einen Ladepfad fuer Binaerdateien.
 *
 * Quelle: ${QUELLE}, das v2-Profil des International Color Consortium
 * (sRGB2014, Februar 2015). Seine Lizenz erlaubt das Weitergeben und
 * Einbetten ohne Einschraenkung - siehe LIZENZEN.md.
 *
 * SHA-256: ${pruefsumme}
 * Laenge:  ${bytes.length} Bytes
 *
 * ERZEUGT von tools/icc-erzeugen.mjs - nicht von Hand aendern.
 */
export const SRGB_ICC_BASE64 =
${zeilen};

/** Laenge des dekodierten Profils in Bytes, zur Kontrolle beim Laden */
export const SRGB_ICC_BYTE_LENGTH = ${bytes.length};
`;

await writeFile(new URL(ZIEL, wurzel), inhalt);
console.log(`${ZIEL} erzeugt - ${bytes.length} Bytes, SHA-256 ${pruefsumme.slice(0, 16)}...`);
