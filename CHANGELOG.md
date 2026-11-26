# Änderungen

Jede Fassung ist ein Tag; eingebunden wird über den Tag, nie über `main`:

```
npm install git+https://github.com/conct/einvoice.git#v5.4.2
```

Die Nummern folgen semver. **Bricht** markiert, was bei einem Update ohne
Zutun anders wird – eine Schnittstelle oder ein sichtbares Ergebnis.
Ausführlich steht jede Änderung in der Commit-Nachricht des Tags.

Gepflegt von der Rechnungswerk-Seite (seit 26.11.2026). Wünsche aus anderen
Anwendungen kommen hier hinein; kleine Korrekturen dürfen sie selbst
einbringen.

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
