/**
 * Die Probe: laeuft das gebaute Paket in einem nackten Node-Prozess?
 *
 * Bewusst gegen dist/ und nicht gegen die Quellen - ein fremdes Projekt
 * bindet genau diese Dateien ein, ohne Bundler, ohne tsx. Was hier
 * durchlaeuft, laeuft dort auch:
 *
 *   npm run build && npm run probe
 *
 * Geprueft wird der ganze Weg: Rechnung -> CII-XML -> PDF/A-3 -> und aus dem
 * fertigen PDF die eingebettete Rechnung wieder heraus und zurueck ins
 * Modell. Stimmen Nummer und Summen danach noch, hat die Bibliothek nicht nur
 * geladen, sondern auch gearbeitet.
 *
 * Was sie NICHT prueft: ob das PDF der Norm entspricht. Dafuer stehen
 * Schematron und veraPDF in rechnungswerk unter tools/validate - siehe
 * README, Abschnitt "Was hier nicht liegt".
 */
import { writeFile } from 'node:fs/promises';
import { buildInvoiceXml, computeTotals, extractInvoiceXml, parseInvoiceXml, renderZugferdPdf } from '../dist/index.js';
import { sampleInvoice } from '../dist/fixtures/sample.js';
import { loadNodeAssets } from '../dist/assets/node.js';

const rechnung = sampleInvoice();
const summen = computeTotals(rechnung);
const { xml, filename } = buildInvoiceXml(rechnung);
const assets = await loadNodeAssets();

const { pdf } = await renderZugferdPdf(rechnung, {
  assets,
  now: new Date('2026-01-02T10:00:00Z'),
  pdfaConformance: 'B',
});

const kopf = new TextDecoder().decode(pdf.subarray(0, 8));
if (!kopf.startsWith('%PDF-')) throw new Error(`Keine PDF-Datei: ${kopf}`);

const angehaengt = await extractInvoiceXml(pdf);
if (!angehaengt) throw new Error('Im PDF steckt keine XML-Rechnung');
const gelesen = parseInvoiceXml(angehaengt.xml);

if (gelesen.invoice.number !== rechnung.number) {
  throw new Error(`Nummer verloren: ${gelesen.invoice.number} statt ${rechnung.number}`);
}
const zurueck = computeTotals(gelesen.invoice);
if (zurueck.grandTotal !== summen.grandTotal) {
  throw new Error(`Summe weicht ab: ${zurueck.grandTotal} statt ${summen.grandTotal}`);
}

const ziel = new URL('../probe.pdf', import.meta.url);
await writeFile(ziel, pdf);

console.log(`XML       ${filename}, ${xml.length} Zeichen`);
console.log(`PDF       ${(pdf.length / 1024).toFixed(0)} kB, Anhang ${angehaengt.filename}`);
console.log(`Profil    ${gelesen.profileId ?? '(keines)'}`);
console.log(`Summe     ${summen.grandTotal.toFixed(2)} EUR, nach dem Rueckweg ${zurueck.grandTotal.toFixed(2)} EUR`);
if (gelesen.warnings.length) console.log(`Hinweise  ${gelesen.warnings.join('; ')}`);
console.log(`Abgelegt  ${ziel.pathname.slice(1)}`);
