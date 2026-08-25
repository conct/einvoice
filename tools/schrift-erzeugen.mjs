/**
 * Erzeugt die eingebetteten Schriften aus der vollstaendigen Inter-Familie.
 *
 * Warum ueberhaupt: Ein vollstaendiger Inter-Schnitt wiegt 342 kB und bringt
 * Griechisch, Kyrillisch, Vietnamesisch und grosse OpenType-Tabellen mit, von
 * denen auf einer deutschen Rechnung nichts gebraucht wird. Zwei davon
 * eingebettet ergaben 436 kB je Rechnung.
 *
 * Warum nicht die Teilmengenbildung von pdf-lib: Die nummeriert die Glyphen
 * neu, laesst die Textbefehle aber auf den alten Nummern stehen - das Ergebnis
 * besteht jede amtliche Pruefung und zeigt beim Oeffnen Buchstabensalat. Siehe
 * docs/validierung.md, Abschnitt "Struktur ist nicht Lesbarkeit". Eine hier
 * vorbereitete Schrift hat dieses Problem nicht: sie wird vollstaendig
 * eingebettet (subsetFonts: false), die Nummerierung fasst niemand mehr an.
 *
 * Laeuft nicht bei jedem Bau, sondern von Hand, wenn sich der Zeichenvorrat
 * oder die Ausgangsschrift aendert. Die erzeugten Dateien liegen im Verzeichnis
 * files/ und sind eingecheckt - so braucht weder die CI noch ein Mitarbeiter
 * eine Python-Umgebung.
 *
 *   npm run schrift --workspace @erechnung/assets
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ziel = fileURLToPath(new URL('../files/', import.meta.url));

/**
 * Zeichenvorrat der eingebetteten Schrift.
 *
 * Massstab ist, was auf einer Rechnung eines Unternehmens aus der EU stehen
 * kann: alle Sprachen mit lateinischer Schrift, Typografie-Interpunktion und
 * saemtliche Waehrungszeichen. Griechisch und Kyrillisch sind bewusst nicht
 * dabei - das kostete 24 kB je Schnitt und betrifft in Deutschland
 * ausgestellte Rechnungen kaum.
 *
 * Wer hier etwas streicht, muss damit rechnen, dass die Erzeugung fuer einen
 * echten Kundennamen abbricht: Zeichen ausserhalb dieser Liste werden nicht
 * etwa ersetzt, sondern gar nicht gezeichnet. Dagegen steht die Pruefung in
 * packages/einvoice-core/src/pdf/zeichenvorrat.ts.
 */
const VORRAT = [
  'U+0020-007E', // Basis-Latein
  'U+00A0-00FF', // Latin-1: Umlaute, ß, °, §, µ, ×, ÷, ², ³
  'U+0100-017F', // Latin Extended-A: polnisch, tschechisch, ungarisch, türkisch, baltisch
  'U+0218-021B', // Ș ș Ț ț - rumänisch, in Extended-A nur in der veralteten Form
  'U+02C6-02DC', // freistehende Akzente
  'U+1E9E', // ẞ - großes Eszett, kommt in Firmennamen in Versalien vor
  'U+2010-2027', // Gedankenstriche, Anführungszeichen, Aufzählungspunkt, Auslassung
  'U+2030-205E', // Promille, Striche, einfache Guillemets, Bruchstrich
  'U+20A0-20BF', // alle Währungszeichen einschließlich €
  'U+2122', // ™
  'U+2212', // − echtes Minus
].join(',');

/**
 * Ohne Hinting und ohne GSUB/GPOS/GDEF.
 *
 * Das Hinting greift erst bei sehr kleinen Bildschirmgroessen und wiegt
 * mehrere Kilobyte. Die OpenType-Tabellen kosten allein 20 kB je Schnitt und
 * bringen hier nichts: pdf-lib kann keine OpenType-Merkmale anfordern, es
 * bleibt also ohnehin bei den Standardglyphen. Verloren geht nur die
 * Unterschneidung - bei Fliesstext auf einer Rechnung nicht der Rede wert.
 */
const SCHNITTE = [
  { quelle: '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', datei: 'Inter-Rechnung-Regular.ttf' },
  { quelle: '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf', datei: 'Inter-Rechnung-Bold.ttf' },
];

function pythonMitFontTools() {
  for (const befehl of ['python', 'python3', 'py']) {
    const probe = spawnSync(befehl, ['-c', 'import fontTools'], { stdio: 'ignore' });
    if (probe.status === 0) return befehl;
  }
  return undefined;
}

const python = pythonMitFontTools();
if (!python) {
  console.error(
    'fontTools nicht gefunden. Die Schriften sind eingecheckt und muessen nur\n' +
      'neu erzeugt werden, wenn sich der Zeichenvorrat aendert. Dafuer:\n\n' +
      '    pip install fonttools\n',
  );
  process.exit(2);
}

for (const schnitt of SCHNITTE) {
  const quelle = require.resolve(schnitt.quelle);
  const ergebnis = spawnSync(
    python,
    [
      '-c',
      'from fontTools.subset import main; main()',
      quelle,
      `--unicodes=${VORRAT}`,
      `--output-file=${ziel}${schnitt.datei}`,
      '--no-hinting',
      '--drop-tables+=GSUB,GPOS,GDEF',
    ],
    { stdio: 'inherit' },
  );
  if (ergebnis.status !== 0) process.exit(ergebnis.status ?? 1);

  const vorher = statSync(quelle).size;
  const nachher = statSync(`${ziel}${schnitt.datei}`).size;
  console.log(
    `${schnitt.datei.padEnd(28)} ${(nachher / 1024).toFixed(1)} kB ` +
      `statt ${(vorher / 1024).toFixed(1)} kB`,
  );
}
