import { defineConfig } from 'tsup';

/*
 * Gebaut wird mit tsup, nicht mit tsc allein.
 *
 * Der Grund steht in einer Zeile: Die Quelldateien importieren einander ohne
 * Dateiendung ('./model/codes'). Ein Bundler versteht das, Node im ESM-Betrieb
 * nicht - 'node dist/index.js' wuerde mit ERR_MODULE_NOT_FOUND abbrechen.
 * tsup loest die Pfade beim Bauen auf; die Quellen bleiben unberuehrt und
 * laufen weiter unter Metro, Vite und vitest.
 *
 * Die fuenf Eintraege entsprechen den Unterpfaden in package.json. Ihre
 * Verzeichnistiefe muss erhalten bleiben: assets/node.js sucht die Schriften
 * ueber '../../files', also zwei Ebenen ueber sich.
 *
 * Ohne Quellkarten: dist/ liegt im Repository (warum, steht im README), und
 * die Karte zu index.js allein waere 650 kB erzeugte Datei bei jeder Fassung.
 * Wer sie zum Suchen braucht, baut mit `npm run build -- --sourcemap`.
 */
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/fixtures/sample.ts',
    'src/lizenz/schluessel.ts',
    'src/assets/index.ts',
    'src/assets/node.ts',
  ],
  format: ['esm'],
  target: 'es2020',
  outDir: 'dist',
  dts: true,
  splitting: true,
  sourcemap: false,
  clean: true,
  treeshake: false,
});
