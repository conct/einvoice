# Änderungen

Jede Fassung ist ein Tag; eingebunden wird über den Tag, nie über `main`:

```
npm install git+https://github.com/conct/einvoice.git#v5.4.5
```

Die Nummern folgen semver. **Bricht** markiert, was bei einem Update ohne
Zutun anders wird – eine Schnittstelle oder ein sichtbares Ergebnis.
Ausführlich steht jede Änderung in der Commit-Nachricht des Tags.

Gepflegt von der Rechnungswerk-Seite (seit 26.11.2026). Wünsche aus anderen
Anwendungen kommen hier hinein; kleine Korrekturen dürfen sie selbst
einbringen.

## v5.4.5 – 26.11.2026

- **Ursache hinter v5.4.4:** Text aus PDF-Dateien verlor das Eurozeichen.
  Einfache Schriften ohne ToUnicode-Tabelle (etwa Helvetica als
  Standardschrift) wurden als Latin-1 gelesen statt als WinAnsi; das Byte
  0x80 kam als Steuerzeichen statt als „€“. Ebenso Anführungszeichen „“ und
  Gedankenstriche. Nachgemessen an Angeboten der H2 Solutions GmbH: vorher
  „Gesamtbetrag 2500,00 “, jetzt „Gesamtbetrag 2500,00 €“.
- ToUnicode-Tabellen, die einen Bereich als Liste schreiben
  (`<0020> <0022> [<0034> <20AC> …]`), werden gelesen. Bisher kam jeder so
  beschriebene Glyph als U+FFFD heraus.
- Betrifft `liesPdfText` und alles, was darauf aufbaut. Sichtbar anders
  wird nur Text, der vorher falsch war.

## v5.4.4 – 26.11.2026 · Korrektur aus CHOOZY

- `betragAmZeilenende`: Hinter dem Betrag darf jetzt stehen, was weder Ziffer
  noch Buchstabe ist. An einer echten PDF-Rechnung aus einem Postfach bildet
  die Schrift das Eurozeichen nicht ab, die Textschicht liefert
  „Gesamtbetrag 409,50 �“ – und der Betrag der ganzen Rechnung blieb
  leer. Die Schranke bleibt, wo sie gebraucht wird: „… gemäß Paragraf 19
  UStG.“ endet auf Buchstaben und ergibt weiterhin keine Steuer von 19,00.
- **Für Rechnungswerk, nicht behoben:** Dass das Eurozeichen gar nicht erst
  ankommt, ist ein Mangel der Zeichenentschlüsselung in `parse/pdf-text.ts` –
  die Schrift des Dokuments hat keine brauchbare `ToUnicode`-Tabelle, oder
  sie wird nicht gelesen. Hier ist nur die Folge abgefangen, nicht die
  Ursache.

## v5.4.3 – 26.11.2026

- `validateInvoice`: Skonto zählt für **BR-CO-25** als Zahlungsbedingung.
  Die Stufen stehen ohnehin in BT-20; eine Rechnung mit Skonto und ohne
  Fälligkeit und ohne freien Text meldete bisher einen Fehler, den der
  KoSIT-Prüfer am fertigen Dokument nicht sah. (Verhalten: eine Meldung
  weniger, keine neue.)
- `liesBeleg`: Steht der Händlername auf einer eigenen Zeile über einer
  mehrteiligen Straße („Rottwerndorfer Str. 45“, „Lohmener Straße 13“),
  wird der Name genommen statt der Straße. Sieht die Zeile darüber nicht nach
  einem Namen aus (Doppelpunkt, viele Ziffern), bleibt die Straßenzeile.
- `liesBeleg`: Getrennt wird auch an einem Bindestrich, der am Namen klebt
  („Kauf land- Lohmener Straße 13“ ergibt „Kauf land“). „Rewe-Markt“ bleibt
  ganz.

## v5.4.2 – 26.11.2026

- `liesBeleg`: Die Bonnummer wird auch als Spalte einer Tabelle gefunden
  (Überschrift „Bon“, Zahl eine Zeile tiefer), zuletzt aus der
  Vorgangsnummer der Sicherheitseinrichtung.
- Von der Erkennung zerrissene Namen („Kauf land“) werden nur
  zusammengezogen, wenn derselbe Text das Wort anderswo heil führt.

## v5.4.1 – 26.11.2026

- **Bricht (Verhalten):** `liesBeleg` lässt `brutto` **leer**, wenn der Bon
  einen Steuersatz nennt, zu dem keine Zeile der Steuertabelle gefunden
  wurde, und sagt das in `hinweise`. Vorher kam eine Teilsumme heraus, teils
  mit `geprueft`. Wer `vorschlag.brutto` ungeprüft übernimmt, muss mit
  `undefined` rechnen.
- Steuersätze mit Klammervorsatz („(1) 19,00 %“), mehrfach genannte Sätze,
  die gedruckte Summe vor der eigenen Addition (Rundung je Zeile).
- Belegdatum ohne Beschriftung: TSE-Zeitstempel, sonst eine Zeile mit Datum
  **und** Uhrzeit.

## v5.4.0 – 26.11.2026

- Neu: `liesKassenbonCode`, `istKassenbonCode` – der QR-Code der
  Sicherheitseinrichtung (§ 146a AO, DSFinV-K): Umsätze je Satz, Zahlungen,
  Vorgangsnummer, Zeitpunkt, Datum als Ortstag. Die Signatur wird nicht
  geprüft.
- `liesBeleg` sucht die eine Zuordnung von Brutto zu Netto zu Summe, die der
  Bon selbst bestätigt; ist sie nicht eindeutig, wird nichts genommen. Der
  Briefkopf wird auch am Ende des Textes gefunden (quer liegender Bon).

## v5.3.1 – 26.11.2026

- `liesBeleg` liest die Steuertabelle auch spaltenweise; eine Nettospalte
  wird auf Brutto hochgerechnet; die Summenzeile darf zerlegt sein.

## v5.3.0 – 26.11.2026

- Neu: `istKassenbon`. `liesBeleg` erkennt Kassenbons: Händler aus der
  Adresszeile statt des ersten Artikels, Brutto aus der Steuertabelle,
  Bonnummer, nackte USt-IdNr. nur mit gültiger Prüfziffer.
- `dist/`: fehlender Typ-Brocken nachgereicht.

## v5.2.0 – 26.11.2026

- Neu: eigener Einstieg **`@erechnung/core/kanzlei`** – Eingangsrechnungen
  als Vorgang (`ausEInvoice`, `ausFoto`, `uebersicht`), Zahlungsstand
  (`zahlungsstand`, `ueberfaelligTage`, `skontochance`, `offeneSummen`) und
  `paketplan` für die Lieferung an den Steuerberater. Gewachsen in
  Rechnungswerk.
- `quelle.sicherheit` (optional): Herkunft eines Fotos in Worten statt
  Prozent.
- **Bricht (Verhalten), nur `/kanzlei`:** `heute` und der Paketplan rechnen
  mit dem Kalendertag am Ort statt UTC.
- `liesmich`/`paketplan`: optionales `werkzeug` (Vorgabe „Rechnungswerk“)
  für den Namen in der Beilage.

## v5.1.0 – 26.11.2026

- Neu: `liesBeleg`, `vollstaendig`, `betragAus`, `datumAus`,
  `betragAmZeilenende` – Felder aus dem Text eines Fotos, jedes mit
  Sicherheit (`geprueft`, `muster`, `geraten`) und Fundzeile. Die
  Texterkennung selbst bleibt in der Anwendung.

## v5.0.0 – 26.11.2026

- **Bricht (sichtbares Ergebnis):** `renderZugferdPdf` setzt Beträge
  vorgabemäßig mit Zeichen („119,00 €“). Wer den Kode will, gibt
  `waehrungsdarstellung: 'code'` an. Das XML trägt unverändert den Kode
  (BT-5).

## v4.2.0 und früher

Siehe die Commit-Nachrichten der Tags: Währung je Rechnung und
`waehrungsdarstellung` (4.2.0), Skonto in BT-20 (4.1.0), Zahlungsblock
entscheidet der Aufrufer (4.0.0).
