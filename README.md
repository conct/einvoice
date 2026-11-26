# @erechnung/core

Deutsche E-Rechnungen erzeugen, lesen und prüfen — ein Paket, das überall
dasselbe tut: in Node, im Browser und in React Native.

[![Lizenz: Apache 2.0](https://img.shields.io/badge/Lizenz-Apache%202.0-blue.svg)](LICENSE)

- **Datenmodell** nach EN 16931 mit den Codelisten, die dazugehören
- **XML** als CII (ZUGFeRD 2.3 / Factur-X, XRechnung CII) und UBL (XRechnung UBL)
- **PDF/A-3** mit eingebetteter Rechnung, Briefkopf, Tabelle und Summenblock
- **Empfang**: Anhänge aus einem hybriden PDF holen, XML einlesen, Summen
  nachrechnen, statt sie zu glauben
- **Papierbelege**: aus dem Text einer Texterkennung Nummer, Datum, Frist,
  Beträge und IBAN lesen — jede Angabe mit ihrer Sicherheit; Kassenbons
  eingeschlossen
- **Skonto** in der Schreibweise der XRechnung, mehrstufig
- **Fremdwährungen** samt Steuerbetrag in der Meldewährung (BT-6, BT-111)
- **Briefbogen zeichnen**: Wer einen Bogen beschreibt — Farben, Striche,
  Textläufe —, bekommt ihn unter jeder Seite gesetzt
- **Text und Breiten** aus einem PDF lesen, als Handwerkszeug für eigene Leser

Kein Zugriff auf Dateisystem, DOM oder plattformeigene Krypto. Binärdaten —
Schriften, Farbprofil, Logo — reicht die aufrufende Schicht herein. Genau
deshalb läuft derselbe Code in der App und auf dem Server.

## Einbinden

```bash
npm install github:conct/einvoice#v5.4.3
```

Keine Registry im Spiel, und **`dist/` liegt im Repository** — Installieren
heißt klonen, nicht bauen. Ohne SSH-Schlüssel auf dem Rechner geht es über
HTTPS:

```bash
npm install git+https://github.com/conct/einvoice.git#v5.4.3
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
| `@erechnung/core` | Modell, XML, PDF, Empfang |
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

## Skonto

EN 16931 kennt kein Feld dafür. Es gibt nur BT-20, die Zahlungsbedingungen als
Fließtext — und Fließtext liest keine Buchhaltung aus. Die KoSIT hat deshalb
eine Schreibweise festgelegt, die darin steht und sich trotzdem maschinell
lesen lässt:

```ts
payment: {
  iban: 'DE02…',
  terms: 'Zahlbar ohne Abzug bis zum Fälligkeitstag.',
  skonto: [
    { tage: 10, prozent: 3 },
    { tage: 20, prozent: 1.5, basisbetrag: 5000 },   // nur ein Teil ist skontierfähig
  ],
}
```

Daraus wird in BT-20:

```
#SKONTO#TAGE=10#PROZENT=3.00#
#SKONTO#TAGE=20#PROZENT=1.50#BASISBETRAG=5000.00#
Zahlbar ohne Abzug bis zum Fälligkeitstag.
```

und im PDF ein Satz, den ein Mensch lesen kann — mit ausgerechnetem Abzug und
dem Betrag, der dann zu überweisen ist:

> Bei Zahlung bis 03.09.2026 abzüglich 3 % Skonto (355,39 EUR) = 11.490,80 EUR,
> bis 13.09.2026 abzüglich 1,5 % (177,70 EUR) = 11.669,09 EUR, sonst bis
> 21.09.2026 ohne Abzug.

`readEInvoice` und `parseInvoiceXml` lösen die Zeilen beim Empfang wieder zu
`skonto` auf; der übrige Text bleibt `terms`. Wer die Teile einzeln braucht —
etwa für eine Mahnung —, nimmt `skontofrist`, `skontobetrag` und `skontosatz`.

**Zwei Dinge, die der Prüfer der KoSIT hart durchsetzt** (BR-DE-18, am
23.11.2026 gegen XRechnung 3.0.2 nachgemessen):

- Hinter dem **letzten** Block muss ein Zeilenumbruch stehen, auch wenn kein
  Text folgt. Eine Fassung ohne ihn wird abgewiesen — `zahlungsbedingungen`
  setzt ihn deshalb immer.
- **Keine** Textzeile in BT-20 darf mit `#` beginnen. Ein Hinweis wie
  „#2 Nachtrag" lässt die ganze Rechnung durchfallen, obwohl mit dem Skonto
  alles stimmt; `validateInvoice` meldet das vorher.

Verrechnet wird der Abzug **nicht**: Die Rechnung weist den vollen Betrag aus,
denn die Summen müssen ohne Bedingung stimmen. Nutzt der Empfänger den Abzug,
mindert das die Bemessungsgrundlage nachträglich (§ 17 UStG) — ein Vorgang in
der Buchhaltung, kein Feld in diesem Dokument.

## Papierbelege

Nicht jede Rechnung kommt als Datensatz. `liesBeleg` nimmt den Text, den eine
Texterkennung aus einem Foto gemacht hat, und sucht darin die Angaben, die
einen Eingangsbeleg ausmachen:

```ts
import { liesBeleg, vollstaendig } from '@erechnung/core';

const befund = liesBeleg(erkannterText);
befund.vorschlag; // { nummer, datum, faellig, absender, waehrung, brutto, ... }
befund.funde;     // je Angabe: Wert, Sicherheit, die Zeile, in der sie stand
befund.hinweise;  // was fehlt oder nicht zusammenpasst
```

**Nichts davon ist ein Befund.** Eine E-Rechnung sagt, was sie enthält; ein
Foto zeigt Pixel. Deshalb trägt jede Angabe ihre Sicherheit:

| | |
|---|---|
| `geprueft` | Ein Verfahren bestätigt es — die IBAN-Prüfsumme, oder Netto + Steuer = Brutto |
| `muster` | Die Form stimmt, geprüft ist sie nicht |
| `geraten` | Aus der Umgebung geschlossen — der Absender ist die oberste Zeile, die nach einem Namen aussieht |

### Kassenbons

Ein Bon ist anders gebaut als eine Rechnung, und zwar genau an den Stellen,
auf die es ankommt: Oben steht der erste Artikel statt des Händlers (eine
Texterkennung liest spaltenweise), es gibt kein „Gesamtbetrag", sondern eine
Steuertabelle, und statt der Rechnungsnummer steht dort eine Bonnummer.

`liesBeleg` erkennt das selbst und liest dann anders — am Händler aus der
Adresszeile, am Betrag aus den Steuersätzen, an der Bonnummer. Erkannt wird
ein Bon nur an eindeutigen Merkmalen (`Bon:`, `Kasse:`, `Filiale`,
`Rückgeld`, `EC-Cash`), damit eine Rechnung nie in diesen Durchgang gerät.

Netto und Steuer werden dabei aus dem Bruttobetrag je Satz zurückgerechnet.
Das heißt auch: Die Probe „Netto + Steuer = Brutto" taugt hier **nicht** als
Bestätigung, sie ginge immer auf. Der Betrag heißt deshalb erst `geprueft`,
wenn die Summe anderswo im Text noch einmal frei dasteht.

### Der QR-Code auf dem Bon

Auf den meisten deutschen Bons steht der Betrag noch ein zweites Mal,
maschinenlesbar: im Code der technischen Sicherheitseinrichtung (§ 146a AO).
`liesKassenbonCode` zerlegt ihn — Umsätze je Steuersatz, Zahlungen,
Vorgangsnummer, Zeitstempel:

```ts
import { istKassenbonCode, liesKassenbonCode } from '@erechnung/core';

const bon = liesKassenbonCode(scan);
bon?.brutto;  // 65.81, nicht gelesen sondern von der Kasse geschrieben
bon?.saetze;  // [{ satz: 19, brutto: 61.51, netto: 51.69, steuer: 9.82 }, ...]
```

**Die Signatur wird nicht geprüft** — dazu bräuchte es das Zertifikat der
Kasse, und das steht nicht auf dem Bon. Der Code beweist hier also nicht, dass
niemand ihn gefälscht hat; er beweist, dass die Zahlen nicht aus einer
Texterkennung stammen.

Gedacht ist das für eine Oberfläche, die jedes Feld zum Nachbessern zeigt:
`vollstaendig()` sagt, ob Nummer, Datum, Absender und Betrag beisammen sind.
Positionen, Steuersätze je Zeile und Skonto werden **nicht** gelesen — sie
stehen auf dem Blatt in tausend Gestalten, und was eine Maschine daraus macht,
wäre geraten.

Vier Dinge, die beim ersten Durchlauf gegen echte Belegbilder schiefgingen und
seitdem festgenagelt sind: Zahlen dürfen keine Leerzeichen enthalten, sonst
wird aus „58,00 377,00" die Zahl 5.800.377. Beträge zählen nur am Zeilenende,
sonst liest „Kein Ausweis der Umsatzsteuer gemäß § 19 UStG" eine Steuer von
19,00 heraus. Die IBAN steht in Vierergruppen und ist wortweise nicht zu
finden. Und ein Datum wie der 31. Februar fällt durch.

## Das Paket für die Kanzlei

Ein eigener Einstieg, eine Stufe über dem Kern: Er kennt keine Formate und
keine Normen, sondern einen Vorgang in einem Betrieb — eine Eingangsrechnung,
die man behält, deren Zahlungsstand man kennt, und am Ende die Lieferung an
den Steuerberater.

```ts
import { ausFoto, paketplan } from '@erechnung/core/kanzlei';

const plan = paketplan(rechnungen, lieferanten, { von: '2026-01-01', bis: '2026-12-31' });
plan.stuecke;      // je Beleg: der Name, unter dem das Original ins Archiv gehört
plan.liste;        // rechnungen.csv, Semikolon, deutsche Zahlen
plan.liesmich;     // die Beilage, die erklärt, was im Paket liegt
plan.ohneOriginal; // Vorgänge, zu denen kein Bild abgelegt ist — benannt, nicht verschwiegen
plan.archivname;
```

**Gepackt wird hier nicht.** `paketplan` ist rein und sagt nur, welche Datei
wie heißt und was in der Liste steht — das ZIP schnürt die Anwendung, denn
nur sie weiß, ob die Originale in einer Ablage, einer Datenbank oder auf
einem Server liegen. So lässt sich der ganze Inhalt prüfen, ohne eine Datei
anzufassen. **Kontiert wird auch nichts:** Die Liste sagt, was auf dem Beleg
steht, und die Kanzlei bucht.

Den Namen in der Beilage — „Erzeugt am … mit …“ — gibt `werkzeug` vor; ohne
Angabe steht dort Rechnungswerk, wo die Zusammenstellung entstanden ist.

Die wichtigste Spalte ist `Herkunft`. Sie sagt, ob die Zahlen aus einem
Datensatz ausgelesen oder von einem Bild gelesen wurden, und wie sicher — als
Prozentzahl der Texterkennung, oder in Worten, wo eine Anwendung in Worten
urteilt (`quelle.sicherheit`). Wer danach bucht, muss diesen Unterschied
sehen, ohne zu fragen.

Dazu `zahlungsstand`, `ueberfaelligTage`, `offeneSummen` je Währung und
`skontochance` — letzteres nur bei einer E-Rechnung: Auf einem Foto steht
Skonto irgendwo im Fließtext, und daraus eine Frist zu errechnen hieße raten,
und zwar bei Geld.

Gewachsen ist das in Rechnungswerk und dort gegen echte Belege gelaufen. Hier
liegt es, seit es ein zweites Haus braucht — zwei Kopien derselben Liste
laufen auseinander, sobald eine davon eine Spalte dazubekommt.

## Währung

`currency` nimmt jeden Code nach ISO 4217; gerechnet und geschrieben wird
damit durchgehend. Zwei Dinge sind dabei zu wissen.

**Die Steuer in einer zweiten Währung.** Wer in Franken abrechnet, die
Umsatzsteuer aber in Euro meldet, setzt beides:

```ts
currency: 'CHF',
vatAccountingCurrency: 'EUR',          // BT-6
vatTotalInAccountingCurrency: 1880.52, // BT-111
```

Umgerechnet wird hier nichts — welcher Kurs gilt, ist eine Entscheidung, keine
Rechnung. Beide Felder gehören zusammen: `validateInvoice` meldet BT-6 ohne
BT-111 als Fehler, denn genau daran scheitert sonst **BR-53** beim Prüfer. Im
CII steht BT-6 zwingend **vor** BT-5 und der Steuerbetrag zweimal, je Währung
einmal; in UBL kommt ein zweiter `cac:TaxTotal` ohne Aufschlüsselung dazu. Das
klingt nach Kleinigkeit und ist der Unterschied zwischen gültig und
zurückgewiesen.

Ob der Steuerbetrag bei einer Fremdwährungsrechnung **zusätzlich in Euro**
auszuweisen ist, sagt diese Bibliothek nicht: § 14 UStG, der die
Pflichtangaben aufzählt, enthält keine Währungsregel (im Gesetzestext
nachgelesen), und der Prüfer der KoSIT nimmt eine XRechnung in Franken ohne
BT-6/BT-111 an. `validateInvoice` gibt deshalb einen **Hinweis** statt eines
Fehlers und verweist auf den Steuerberater.

**Zeichen oder Kode auf dem Blatt.** Seit 5.0.0 ist das Zeichen die Vorgabe —
Positionen, Summen, Skontosatz, Lastschriftsatz. Auf einer deutschen Rechnung
ist „119,00 €“ die übliche Schreibweise. Wer den Kode braucht, sagt es:

```ts
await renderZugferdPdf(rechnung, { assets, waehrungsdarstellung: 'code' });
```

Im XML steht immer der Code (BT-5); ein Empfänger, der „€" einliest, weiß
nicht, ob EUR gemeint war. Drei Dinge entscheiden mit:

- Ein **Währungswort aus einem übernommenen Briefbogen** hat Vorrang — es ist
  gemessen, nicht geraten.
- Nicht jede Währung bekommt ein Zeichen. CHF, SEK, DKK, NOK, ISK, CAD, AUD
  und NZD behalten den Code, weil „Fr.", „kr" und „$" zu wenig sagen.
- Das Zeichen muss die **eingebettete Schrift** kennen. Von den zwanzig
  hinterlegten Zeichen kennen die mitgelieferten Inter-Teilmengen achtzehn;
  `฿` (THB) und `лв` (BGN) fehlen, dort bleibt der Code stehen. Nachsehen mit
  `npm run zeichen`.

Wo ausgewichen wurde, steht in `RenderResult.befunde` — ein unsichtbares
Währungszeichen unter einem Betrag wäre schlimmer als „THB".

## Was hier **nicht** liegt

**Die Übernahme aus fremden Dokumenten.** Eine vorhandene Rechnung
auslesen und vermessen — Hausfarbe, Striche, Fluchtlinien, Satzspiegel, Raster
—, eine Word-Datei in Positionen übersetzen, Stammdaten aus einem fremden
Beleg holen, einen eingescannten Beleg zugänglich machen: Das lag bis v3.0.0
hier und ist mit v4.0.0 beim Produkt. Es ist der Teil, für den Leute zahlen.

Was davon offen bleibt, ist die andere Hälfte: **einen beschriebenen Bogen
zeichnen**. `renderZugferdPdf` nimmt ihn als Angabe entgegen und setzt ihn
unter jede Seite; die Typen dafür stehen in `pdf/briefpapier-typen.ts`, und mit
`liesPdfText`, `liefereBreiten` und `leseInhalt` liegt auch das Handwerkszeug
bereit, um selbst einen Leser zu schreiben.

**Der DATEV-Buchungsstapel.** Er lag bis v2.0.0 hier und ist mit v3.0.0
herausgenommen: Ein Buchungsstapel ist kein E-Rechnungsformat, sondern eine
Leistung des Produkts. Wer ihn braucht, baut ihn aus dem Datenmodell dieser
Bibliothek — die Summen, Steuerfälle und Positionen stehen alle darin.

**Die Konformitätsprüfung.** Schematron-Regeln, veraPDF und die
Vergleichsläufe gegen fremde Rechnungen bleiben in
[rechnungswerk](https://github.com/conct/rechnungswerk) unter
`tools/validate`. Der Grund ist Gewicht: Dort hängen Java, die
Prüfregelsätze und etliche Megabyte Testbestand dran. Wer an der Ausgabe
dieses Pakets etwas ändert, prüft dort nach.

**Die Texterkennung selbst.** `liesBeleg` nimmt fertigen Text entgegen, es
erkennt ihn nicht: Dafür braucht es WebAssembly im Browser oder das
Betriebssystem auf dem Telefon, und beides gehört einer Anwendung, nicht einer
Bibliothek ohne Plattformbezug.

Mitgekommen ist nur, was ohne Zubehör läuft: 212 Tests über 13 Dateien, die
jeden Weg einmal gehen, und `npm run probe` — eine Rechnung durch XML, PDF,
Anhang und zurück ins Modell, gegen das **gebaute** Paket.

## Entwickeln

```bash
npm install
npm test          # vitest, 212 Tests
npm run typecheck # zwei Durchgänge, siehe unten
npm run build     # tsup -> dist/ (ESM + Typdeklarationen)
npm run zeichen   # welche Waehrungszeichen die Schrift kennt
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
Rechnung sagt mehr als eine Beschreibung. Als
[Issue](https://github.com/conct/einvoice/issues) oder per Post an
<mail@feif.space>.

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
- **v3.0.0** nimmt den DATEV-Stapel heraus, samt Kontenrahmen und der
  CP1252-Kodierung, die nur er brauchte. Dieselbe Überlegung: Format offen,
  Buchhaltung beim Produkt.
- **v4.0.0** nimmt die Übernahme heraus — Vorlagenleser, Word-Import,
  Stammdatenerkennung, Scanaufbereitung und die Absenderprofile. Dafür waren
  drei kleine Nähte zu bauen: die Typen des Bogens stehen jetzt in
  `pdf/briefpapier-typen.ts`, `alsHex` bei den Farbhilfen, und der
  Zahlungsblock wird nicht mehr von der Bibliothek entschieden — wer einen
  Bogen mit Bankverbindung hereingibt, setzt `zahlungsblock: false` selbst.

## Lizenz

**Apache License 2.0** — Text in [LICENSE](LICENSE). Verwenden, verändern und
weitergeben ist erlaubt, auch geschäftlich und in geschlossenen Produkten;
verlangt sind Namensnennung und der Hinweis auf Änderungen.

Die Dateien unter `files/` stammen nicht von hier und haben eigene
Bedingungen: Inter unter der SIL Open Font License, das Farbprofil vom
International Color Consortium. Beides erlaubt die Weitergabe; Fundstellen und
Wortlaut stehen in [LIZENZEN.md](LIZENZEN.md).
