# @erechnung/core

Deutsche E-Rechnungen erzeugen, lesen und prüfen — ein Paket, das überall
dasselbe tut: in Node, im Browser und in React Native.

[![Lizenz: Apache 2.0](https://img.shields.io/badge/Lizenz-Apache%202.0-blue.svg)](LICENSE)

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
npm install github:conct/einvoice#v2.0.0
```

Keine Registry im Spiel, und **`dist/` liegt im Repository** — Installieren
heißt klonen, nicht bauen. Ohne SSH-Schlüssel auf dem Rechner geht es über
HTTPS:

```bash
npm install git+https://github.com/conct/einvoice.git#v2.0.0
```

Der erste Versuch ging den üblichen Weg: `prepare` baut beim Installieren.
Auf dem Uberspace wurde der Bau mitten in der Typdeklaration **vom System
abgeschossen** (SIGKILL, Speichergrenze) — und zwar in der Auslieferung,
nachdem das Zielverzeichnis schon gelöscht war. Ein geteilter Host gibt keinem
Installationsschritt ein halbes Gigabyte RAM. Seitdem gilt: gebaut wird hier,
ausgeliefert wird das Ergebnis.

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

Mitgekommen ist nur, was ohne Zubehör läuft: 222 Tests über 21 Dateien, die
jeden Weg einmal gehen, und `npm run probe` — eine Rechnung durch XML, PDF,
Anhang und zurück ins Modell, gegen das **gebaute** Paket.

## Entwickeln

```bash
npm install
npm test          # vitest, 222 Tests
npm run typecheck # zwei Durchgänge, siehe unten
npm run build     # tsup -> dist/ (ESM + Typdeklarationen)
npm run probe     # die gebaute Fassung in nacktem Node
```

### Eine neue Fassung herausgeben

```bash
npm run release                      # Typen, Tests, Bau, Probe
git add -A dist && git commit -m "…"
git tag -a v1.0.2 -m "…" && git push origin main --tags
```

Danach im einbindenden Projekt `npm install github:conct/einvoice#v1.0.2`
(oder die Fassung in `package.json` heraufsetzen und `npm update
@erechnung/core`) — die Sperrdatei merkt sich den Commit, nicht den Tag.

**`dist/` muss zum Quellstand passen.** Die Tests laufen gegen `src/`, der
Bau ist ein eigener Schritt: Wer Quellen ändert und `dist/` nicht neu baut,
gibt eine Fassung heraus, in der beides auseinanderläuft. Dafür ist
`npm run release` da — ein Befehl, der alles vier macht.

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
334 kB je Schnitt — und das sRGB-Profil, ohne das eine Datei kein gültiges
PDF/A ist. Erneuert werden die Schriften mit `npm run schrift`, das Profil mit
`npm run icc`; welche Zeichen die Schriften abdecken, steht in
`tools/schrift-erzeugen.mjs`.

Beides darf weitergegeben werden, und beides ist belegt: Inter steht unter der
SIL Open Font License (Text in `files/Inter-OFL.txt`), das Farbprofil ist das
v2-sRGB-Profil des **International Color Consortium**, dessen Bedingungen das
Weitergeben und Einbetten ausdrücklich ohne Einschränkung erlauben. Wortlaut
und Fundstellen in [LIZENZEN.md](LIZENZEN.md).

Bis zum 08.10.2026 lag hier stattdessen das Systemprofil von Windows —
derselbe Farbraum, aber eine Kopie, deren Weitergabebedingungen sich nicht
zitieren ließen. Für ein offenes Repository ist das der falsche Nachweis.

## Mitmachen und mittragen

Fehlerberichte und Verbesserungen sind willkommen — am liebsten mit dem
Dokument, das falsch herauskam, oder dem, das sich nicht lesen ließ. Eine
Rechnung sagt mehr als eine Beschreibung.

Wer diese Bibliothek geschäftlich einsetzt, kann ihre Pflege mitfinanzieren:
**[GitHub Sponsors](https://github.com/sponsors/conct)**. Was dadurch nicht
passiert: Die Bibliothek bleibt Apache-2.0, die Prüfläufe bleiben öffentlich,
und niemand bekommt einen Vorrang bei Fehlern, der Geld kostet. Bezahlt wird
damit das, was an einer Normbibliothek wirklich Arbeit macht — jeder
Korrigendum, jede neue XRechnung-Fassung, jeder Prüfregelsatz, der sich ändert.

Getragen wird die Pflege vom Produkt, das auf dieser Bibliothek aufsetzt:
**[Rechnungswerk](https://rechnungswerk.conct.de)**. Dort liegen Oberflächen,
Dienste und der laufende Konformitätsnachweis; hier liegt die Formatschicht,
und die ist offen, weil eine Pflicht, die alle trifft, kein Geschäftsmodell
sein sollte.

## Herkunft

Herausgelöst aus `conct/rechnungswerk` (privates Repository, Stand 6cb69c0,
08.10.2026), vorher `packages/einvoice-core` und `packages/einvoice-assets`. Die Geschichte beider Pakete ist mitgenommen, die
Commits davor stehen also hier. Aus den zwei Paketen ist eines geworden, weil
npm ein Repository nur als **ein** Paket einbinden kann: Es gibt keinen Weg,
auf ein Unterverzeichnis zu zeigen.

Rechnungswerk bindet dieses Repository seitdem über einen Tag ein. Änderungen
gehören hierher, nicht in eine Kopie — die lief dort schon einmal auseinander.

Zwei Fassungen und ihr Grund:

- **v1.0.1** ist die erste installierbare. `v1.0.0` ist gelöscht — sie baute
  beim Installieren und ließ sich auf einem geteilten Host nicht installieren.
- **v2.0.0** ist die erste öffentliche. Zwei Dinge haben sich geändert: Der
  Unterpfad `./lizenz` ist fort — er stellte die Produktschlüssel von
  Rechnungswerk aus, enthielt dessen Preisliste und gehört nicht in eine
  offene Bibliothek. Und das Farbprofil ist das des ICC, nicht mehr das von
  Windows.

## Lizenz

**Apache License 2.0** — Text in [LICENSE](LICENSE). Verwenden, verändern und
weitergeben ist erlaubt, auch geschäftlich und in geschlossenen Produkten;
verlangt sind Namensnennung und der Hinweis auf Änderungen.

Die Dateien unter `files/` stammen nicht von hier und haben eigene
Bedingungen: Inter unter der SIL Open Font License, das Farbprofil vom
International Color Consortium. Beides erlaubt die Weitergabe; Fundstellen und
Wortlaut stehen in [LIZENZEN.md](LIZENZEN.md).
