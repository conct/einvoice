# @erechnung/core

Deutsche E-Rechnungen erzeugen, lesen und prüfen — ein Paket, das überall
dasselbe tut: in Node, im Browser und in React Native.

- **Datenmodell** nach EN 16931 mit den Codelisten, die dazugehören
- **XML** als CII (ZUGFeRD 2.3 / Factur-X, XRechnung CII) und UBL (XRechnung UBL)
- **PDF/A-3** mit eingebetteter Rechnung, Briefkopf, Tabelle und Summenblock
- **Empfang**: Anhänge aus einem hybriden PDF holen, XML einlesen, Summen
  nachrechnen, statt sie zu glauben
- **DATEV-Buchungsstapel** mit SKR03 und SKR04
- **Übernahme** aus Word und aus fremden PDF-Rechnungen, samt Briefbogen

Kein Zugriff auf Dateisystem, DOM oder plattformeigene Krypto. Binärdaten —
Schriften, Farbprofil, Logo — reicht die aufrufende Schicht herein. Genau
deshalb läuft derselbe Code in der App und auf dem Server.

## Einbinden

```bash
npm install github:conct/einvoice#v1.0.0
```

Das Repository ist privat; der Rechner braucht also einen Zugang zu GitHub.
Beim Installieren läuft `prepare` und baut `dist/` — wie bei
[conct/legal](https://github.com/conct/legal). Eine Registry ist nicht im
Spiel.

```ts
import { renderZugferdPdf, buildInvoiceXml, readEInvoice } from '@erechnung/core';
import { loadNodeAssets } from '@erechnung/core/assets/node';

const assets = await loadNodeAssets();            // Schriften + sRGB-Profil
const { pdf, xml } = await renderZugferdPdf(rechnung, { assets });
```

| Unterpfad | Inhalt |
|---|---|
| `@erechnung/core` | Modell, XML, PDF, Empfang, DATEV, Übernahme |
| `@erechnung/core/fixtures` | Beispielrechnungen für Tests und Vorschauen |
| `@erechnung/core/lizenz` | Lizenzschlüssel (kein E-Rechnungsthema, siehe unten) |
| `@erechnung/core/assets` | sRGB-Profil, Pfade der Schriftdateien |
| `@erechnung/core/assets/node` | derselbe Satz, aus dem Dateisystem geladen |
| `@erechnung/core/files/*` | die Dateien selbst, für Bundler und `require` |

In React Native kommen die Schriften über den Bundler:

```ts
const SCHRIFTEN = {
  regular: require('@erechnung/core/files/Inter-Rechnung-Regular.ttf'),
  bold: require('@erechnung/core/files/Inter-Rechnung-Bold.ttf'),
};
```

## Was hier **nicht** liegt

**Die Konformitätsprüfung.** Schematron-Regeln, veraPDF und die
Vergleichsläufe gegen fremde Rechnungen bleiben in
[rechnungswerk](https://github.com/conct/rechnungswerk) unter
`tools/validate`. Der Grund ist Gewicht: Dort hängen Java, die
Prüfregelsätze und etliche Megabyte Testbestand dran. Wer an der Ausgabe
dieses Pakets etwas ändert, prüft dort nach.

Mitgekommen ist nur, was ohne Zubehör läuft: 254 Tests über 23 Dateien, die
jeden Weg einmal gehen, und `npm run probe` — eine Rechnung durch XML, PDF,
Anhang und zurück ins Modell, gegen das **gebaute** Paket.

## Entwickeln

```bash
npm install
npm test          # vitest, 254 Tests
npm run typecheck # zwei Durchgänge, siehe unten
npm run build     # tsup -> dist/ (ESM + Typdeklarationen)
npm run probe     # die gebaute Fassung in nacktem Node
```

**Warum zwei Typprüfungen.** `tsconfig.json` prüft alles mit Node-Typen,
`tsconfig.kern.json` prüft den Kern **ohne** sie. Nur der zweite Durchgang
merkt, wenn sich in die isomorphe Hälfte eine Node-Eigenheit einschleicht —
und die fällt sonst erst in der App auf, also beim Nutzer.

**Warum tsup und nicht tsc.** Die Quellen importieren einander ohne
Dateiendung. Ein Bundler versteht das, Node im ESM-Betrieb nicht. tsup löst
die Pfade beim Bauen auf; die Quellen bleiben unberührt und laufen weiter
unter Metro, Vite und vitest.

## Schriften und Farbprofil

Unter `files/` liegen zwei vorbereitete Teilmengen von **Inter** — 30 statt
334 kB je Schnitt — und das Profil **sRGB IEC61966-2.1**, ohne das eine Datei
kein gültiges PDF/A ist. Erneuert werden die Schriften mit `npm run schrift`;
welche Zeichen sie abdecken, steht in `tools/schrift-erzeugen.mjs`.

Inter steht unter der SIL Open Font License, der Text liegt als
`files/Inter-OFL.txt` daneben. **Die Weitergabebedingungen des ICC-Profils
sind noch nicht geprüft** — das muss geschehen, bevor dieses Repository
öffentlich wird.

## Zwei Dinge, die hier eigentlich nicht hingehören

`lizenz/schluessel` und `lizenz/dienstadresse` stellen Lizenzschlüssel aus und
prüfen sie. Das ist kein E-Rechnungsthema, aber die Stelle, die
Ausstellungswerkzeug und App gemeinsam einbinden müssen — lägen sie
auseinander, könnte das Werkzeug etwas ausstellen, das die App ablehnt. Wer
dieses Paket nur für Rechnungen benutzt, lässt den Unterpfad einfach liegen.

## Herkunft

Herausgelöst aus [conct/rechnungswerk](https://github.com/conct/rechnungswerk)
(Stand 6cb69c0, 08.10.2026), vorher `packages/einvoice-core` und
`packages/einvoice-assets`. Die Geschichte beider Pakete ist mitgenommen, die
Commits davor stehen also hier. Aus den zwei Paketen ist eines geworden, weil
npm ein Repository nur als **ein** Paket einbinden kann: Es gibt keinen Weg,
auf ein Unterverzeichnis zu zeigen.

Rechnungswerk bindet dieses Repository seitdem über einen Tag ein. Änderungen
gehören hierher, nicht in eine Kopie — die lief dort schon einmal auseinander.

## Lizenz

UNLICENSED. Alle Rechte vorbehalten, Daniel von Lühmann.
