import { describe, expect, it } from 'vitest';

import {
  betragAus,
  datumAus,
  istKassenbon,
  liesBeleg,
  vollstaendig,
  type Belegdaten,
} from '../src/parse/beleg';

/*
 * Die Texte stammen nicht aus der Luft: So sieht aus, was eine Texterkennung
 * von einer deutschen Papierrechnung liefert - ohne Tabellenstruktur, mit
 * zusammengelaufenen Spalten, teils mit Erkennungsfehlern.
 */
const HANDWERKER = `
Elektro Brandt GmbH
Lange Reihe 14
20099 Hamburg

Rechnung Nr. 2026-0417
Rechnungsdatum: 12.11.2026
Kundennummer: 4711

Pos Leistung Menge Preis Betrag
1 Arbeitszeit Monteur 6,5 Std 58,00 377,00
2 Material laut Anlage 1 124,60 124,60

Nettobetrag 501,60
zzgl. 19 % MwSt. 95,30
Gesamtbetrag 596,90 EUR

Zahlbar bis 26.11.2026 ohne Abzug.
Bankverbindung: DE02100500000054540402
USt-IdNr. DE 812 345 678
`;

const KLEINUNTERNEHMER = `
Gartenpflege Sievers
Dorfstrasse 3
24340 Eckernfoerde

RECHNUNG

Beleg-Nr. GS-2026-88
Datum 03.10.2026

Heckenschnitt und Abfuhr 240,00

Gesamtbetrag 240,00 EUR
Kein Ausweis der Umsatzsteuer gemaess Paragraf 19 UStG.
Steuernummer: 20/123/45678
Zahlbar innerhalb von 14 Tagen.
`;

describe('Zahlen und Daten lesen', () => {
  it('liest deutsche und englische Schreibweise', () => {
    expect(betragAus('Gesamtbetrag 1.234,56 EUR')).toBe(1234.56);
    expect(betragAus('Total 1,234.56')).toBe(1234.56);
    expect(betragAus('Betrag 596,90')).toBe(596.9);
    expect(betragAus('Summe 240')).toBe(240);
    // Ohne Nachkommastellen sind Punkt und Komma Tausendertrenner.
    expect(betragAus('Summe 12.500')).toBe(12500);
    expect(betragAus('ohne Zahl')).toBeUndefined();
  });

  it('nimmt die letzte Zahl der Zeile - der Betrag steht rechts', () => {
    expect(betragAus('zzgl. 19 % MwSt. 95,30')).toBe(95.3);
    expect(betragAus('1 Arbeitszeit Monteur 6,5 Std 58,00 377,00')).toBe(377);
  });

  it('liest Datumsangaben und weist unmoegliche ab', () => {
    expect(datumAus('Rechnungsdatum: 12.11.2026')).toBe('2026-11-12');
    expect(datumAus('vom 3.1.26')).toBe('2026-01-03');
    expect(datumAus('2026-11-12')).toBe('2026-11-12');
    expect(datumAus('31.02.2026')).toBeUndefined();
    expect(datumAus('kein Datum')).toBeUndefined();
  });
});

describe('Eine Handwerkerrechnung lesen', () => {
  const befund = liesBeleg(HANDWERKER, '2026-11-26');
  const v = befund.vorschlag;

  it('findet Nummer, Datum und Frist', () => {
    expect(v.nummer).toBe('2026-0417');
    expect(v.datum).toBe('2026-11-12');
    expect(v.faellig).toBe('2026-11-26');
  });

  it('findet die Betraege und rechnet sie gegeneinander', () => {
    expect(v.netto).toBe(501.6);
    expect(v.steuer).toBe(95.3);
    expect(v.brutto).toBe(596.9);
    expect(v.waehrung).toBe('EUR');
    /*
     * Der Punkt der ganzen Uebung: 501,60 + 95,30 = 596,90. Geht die Probe
     * auf, ist der Betrag kein geratener Wert mehr.
     */
    expect(befund.funde.find((f) => f.feld === 'brutto')?.sicherheit).toBe('geprueft');
  });

  it('prueft die IBAN mit der Pruefsumme und nennt sie deshalb geprueft', () => {
    expect(v.iban).toBe('DE02100500000054540402');
    expect(befund.funde.find((f) => f.feld === 'iban')?.sicherheit).toBe('geprueft');
  });

  /*
   * Auf dem Blatt steht die IBAN in Vierergruppen. Wortweise gesucht, wie es
   * zuerst geschah, findet man sie nie - aufgefallen beim Durchlauf mit einem
   * echten Belegbild.
   */
  it('findet die IBAN auch in Vierergruppen', () => {
    const mitGruppen = liesBeleg('Bankverbindung: DE02 1005 0000 0054 5404 02');
    expect(mitGruppen.vorschlag.iban).toBe('DE02100500000054540402');
  });

  it('nimmt keine Zahlenkolonne fuer eine IBAN', () => {
    expect(liesBeleg('Kundennummer 4711 Auftrag 2026 0417 0001').vorschlag.iban).toBeUndefined();
  });

  it('liest die USt-IdNr. auch mit Leerzeichen', () => {
    expect(v.ustId).toBe('DE812345678');
  });

  /*
   * Der Absender ist die oberste brauchbare Zeile. Das ist schwach, und
   * genau deshalb steht es als "geraten" da - die Oberflaeche zeigt das Feld
   * zum Nachbessern.
   */
  it('raet den Absender aus dem Briefkopf und sagt, dass es geraten ist', () => {
    expect(v.absender).toBe('Elektro Brandt GmbH');
    expect(befund.funde.find((f) => f.feld === 'absender')?.sicherheit).toBe('geraten');
  });

  it('nennt zu jedem Fund die Zeile, in der er stand', () => {
    expect(befund.funde.find((f) => f.feld === 'brutto')?.beleg).toBe('Gesamtbetrag 596,90 EUR');
    expect(befund.hinweise).toEqual([]);
  });
});

describe('Eine Kleinunternehmerrechnung lesen', () => {
  const befund = liesBeleg(KLEINUNTERNEHMER, '2026-11-26');
  const v = befund.vorschlag;

  it('findet Nummer und Betrag ohne Steuerzeile', () => {
    expect(v.nummer).toBe('GS-2026-88');
    expect(v.datum).toBe('2026-10-03');
    expect(v.brutto).toBe(240);
    expect(v.steuer).toBeUndefined();
  });

  /* Ohne Datum im Text, aber mit Zahlungsziel in Tagen. */
  it('rechnet ein Zahlungsziel in Tagen auf ein Datum um', () => {
    expect(v.faellig).toBe('2026-10-17');
    expect(befund.funde.find((f) => f.feld === 'faellig')?.sicherheit).toBe('geraten');
  });

  /* Kleinunternehmer haben keine USt-IdNr. - die Steuernummer ist alles. */
  it('findet die Steuernummer', () => {
    expect(v.steuernummer).toBe('20/123/45678');
    expect(v.ustId).toBeUndefined();
  });
});

describe('Was fehlt, wird gesagt', () => {
  it('meldet fehlende Pflichtangaben, statt sie zu erfinden', () => {
    const befund = liesBeleg('Irgendein Zettel ohne alles');
    expect(befund.hinweise).toContain('Kein Rechnungsbetrag gefunden.');
    expect(befund.hinweise).toContain('Keine Rechnungsnummer gefunden.');
    expect(befund.hinweise).toContain('Kein Rechnungsdatum gefunden.');
    expect(vollstaendig(befund.vorschlag)).toBe(false);
  });

  it('meldet, wenn Netto und Steuer nicht zum Betrag passen', () => {
    const befund = liesBeleg(`
      Rechnung Nr. 5
      Datum 01.11.2026
      Nettobetrag 100,00
      zzgl. 19 % MwSt. 19,00
      Gesamtbetrag 219,00
    `);
    expect(befund.hinweise.join(' ')).toMatch(/ergeben 119\.00/);
    expect(befund.funde.find((f) => f.feld === 'brutto')?.sicherheit).toBe('muster');
  });

  it('meldet ein Zahlungsziel vor dem Rechnungsdatum', () => {
    const befund = liesBeleg(`
      Rechnung Nr. 7
      Rechnungsdatum 10.11.2026
      Zahlbar bis 01.11.2026
      Gesamtbetrag 50,00
    `);
    expect(befund.hinweise.join(' ')).toMatch(/vor dem Rechnungsdatum/);
  });

  it('meldet ein Rechnungsdatum in der Zukunft', () => {
    const befund = liesBeleg('Rechnung Nr. 8\nRechnungsdatum 10.11.2027\nGesamtbetrag 50,00', '2026-11-26');
    expect(befund.hinweise.join(' ')).toMatch(/Zukunft/);
  });

  it('haelt einen Vorschlag erst mit Nummer, Datum, Absender und Betrag fuer vollstaendig', () => {
    const fast: Partial<Belegdaten> = { nummer: '1', datum: '2026-11-01', waehrung: 'EUR' };
    expect(vollstaendig(fast)).toBe(false);
    expect(vollstaendig({ ...fast, absender: 'Jemand', brutto: 10 })).toBe(true);
    expect(vollstaendig({ ...fast, absender: 'Jemand', brutto: 0 })).toBe(false);
  });
});

/*
 * EIN ECHTER KASSENBON, Wort fuer Wort so, wie ML Kit ihn am 26.11.2026 aus
 * dem Foto gelesen hat: Kaufland Pirna, 16.10.2026, 65,81 EUR. Nicht
 * nachgebaut und nicht geglaettet - die zerrissenen Spalten, die
 * Erkennungsfehler ("Sume", "Pfandart ikel", "Kauf land") und die Reihenfolge
 * sind der eigentliche Pruefstein. Genau an ihr scheiterte das Lesen:
 * Absender "Hasseroeder Pils", kein Betrag, keine Nummer.
 */
const KAUFLAND = `
Hasseröder Pils
2 *7,99
Kaufland - Lohmerner Straße 13
01/96 Pirna
Tel. 03501/500920
DE203534318
Pfandart ikel 2 * 3,10
Rotk. Sekt Rose
4 * 0.99
Rotk. Sekt htr.
4 * 0,99
KLC.Minera lwasser
Pfandart ikel
Ger. Oma Glühwein
Paulaner Spezi
2* 10.99
K Card XTRA Rabatt
Pfandart ikel
KLC Streu 60L
Sume
Euro
Rückgeld
2 * 3,10
2 * 2,15
Steuer % Brutto
A 19,00% 61,51
B7,00% 4,30
Kauf land Card XTRA:
EUR
Netto
51,69
Datum:16.10.26 Zeit:
Filiale: 3343 Kasse: 11
Preis EUR
4,02
15,98 A
6,20 A
3,96 A
3,96 A
1,74 A
1,50 A
1,99 A
21,98 A
-2,00
65,81
6,20 A
4,30 B
70,00
4,19
Steuer
9,82
0,28
XXXXX9478
18:00:35 Bon:91385
Durch Kauf land Card XTRA Wurden
2,00 EUR gespart.
9227653839651732822888781951
`;

const zeilenVon = (text: string) =>
  text
    .split(/\r?\n/)
    .map((zeile) => zeile.replace(/\s+/g, ' ').trim())
    .filter((zeile) => zeile.length > 0);

describe('Einen Kassenbon lesen', () => {
  const befund = liesBeleg(KAUFLAND, '2026-11-26');
  const v = befund.vorschlag;

  it('erkennt ueberhaupt, dass es ein Bon ist', () => {
    expect(istKassenbon(zeilenVon(KAUFLAND))).toBe(true);
    // Eine Rechnung ist keiner - sonst richtete der Durchgang Schaden an.
    expect(istKassenbon(zeilenVon(HANDWERKER))).toBe(false);
    expect(istKassenbon(zeilenVon(KLEINUNTERNEHMER))).toBe(false);
  });

  /* Es gibt keine Rechnungsnummer. Es gibt "18:00:35 Bon:91385". */
  it('nimmt die Bonnummer als Nummer', () => {
    expect(v.nummer).toBe('91385');
  });

  it('liest das Datum aus der Zeile mit der Uhrzeit', () => {
    expect(v.datum).toBe('2026-10-16');
  });

  /*
   * DER KERN: Auf dem Bon steht nirgends "Gesamtbetrag". Der Betrag entsteht
   * aus der Steuertabelle - 61,51 zu 19 % und 4,30 zu 7 %.
   */
  it('rechnet den Betrag aus der Steuertabelle zusammen', () => {
    expect(v.brutto).toBe(65.81);
    expect(v.netto).toBe(55.71);
    expect(v.steuer).toBe(10.1);
    expect(v.waehrung).toBe('EUR');
  });

  /*
   * Netto und Steuer je Satz sind zurueckgerechnet - und stehen auf dem Bon
   * trotzdem genau so da: 51,69 + 4,02 und 9,82 + 0,28. Die Rechnung stimmt
   * also gegen das Papier, nicht nur gegen sich selbst.
   */
  it('trifft damit die Zahlen, die auf dem Bon stehen', () => {
    expect(51.69 + 4.02).toBeCloseTo(v.netto ?? 0, 2);
    expect(9.82 + 0.28).toBeCloseTo(v.steuer ?? 0, 2);
  });

  it('nennt den Haendler, nicht den ersten Artikel', () => {
    expect(v.absender).toBe('Kaufland');
    expect(befund.funde.find((f) => f.feld === 'absender')?.sicherheit).toBe('muster');
  });

  it('findet die nackte USt-IdNr. und prueft ihre Pruefziffer', () => {
    expect(v.ustId).toBe('DE203534318');
    expect(befund.funde.find((f) => f.feld === 'ustId')?.sicherheit).toBe('geprueft');
  });

  it('reicht damit zum Buchen', () => {
    expect(vollstaendig(v)).toBe(true);
  });

  it('sagt in den Hinweisen, woher der Betrag kommt', () => {
    expect(befund.hinweise.join(' ')).toMatch(/Als Kassenbon gelesen/);
    expect(befund.hinweise.join(' ')).toMatch(/19,00 % auf 61,51/);
  });
});

describe('Wie sicher der Betrag eines Bons ist', () => {
  /*
   * Die Summe 65,81 steht auf dem Bon noch einmal frei in der Betragsspalte.
   * Das ist ein Zeuge von aussen - erst damit ist der Betrag bestaetigt.
   */
  it('nennt den Betrag geprueft, wenn die Summe im Text noch einmal dasteht', () => {
    const befund = liesBeleg(KAUFLAND);
    expect(befund.funde.find((f) => f.feld === 'brutto')?.sicherheit).toBe('geprueft');
  });

  /*
   * UND DIE EIGENTLICHE FALLE: Ohne diesen Zeugen muss 'muster' stehen
   * bleiben. Netto und Steuer sind aus dem Brutto zurueckgerechnet, also geht
   * die Probe "Netto + Steuer = Brutto" immer auf - eine Bestaetigung, die
   * sich selbst bestaetigt. Wer sie zulaesst, nennt jede Schaetzung geprueft.
   */
  it('bleibt beim Muster, wenn die Summe nur errechnet ist', () => {
    const ohneZeugen = KAUFLAND.split(/\r?\n/)
      .filter((zeile) => zeile.trim() !== '65,81')
      .join('\n');
    const befund = liesBeleg(ohneZeugen);

    expect(befund.vorschlag.brutto).toBe(65.81);
    expect(befund.funde.find((f) => f.feld === 'brutto')?.sicherheit).toBe('muster');
  });
});

describe('Woran der Bondurchgang sich nicht vergreift', () => {
  /*
   * "Musterstrasse 1" steht allein in der Zeile. Wer am Strassenwort trennte,
   * machte daraus den Absender "Muster".
   */
  it('nimmt bei einer reinen Strassenzeile den Namen von darueber', () => {
    const befund = liesBeleg(`
      Getraenke Schmidt
      Musterstraße 1
      01796 Pirna
      Kasse: 3 Bon:4711
      Steuer % Brutto
      A 19,00% 11,90
      Rückgeld 8,10
    `);
    expect(befund.vorschlag.absender).toBe('Getraenke Schmidt');
    expect(befund.vorschlag.brutto).toBe(11.9);
    expect(befund.vorschlag.nummer).toBe('4711');
  });

  /*
   * Die Steuerzeile einer gewoehnlichen Rechnung darf nicht als Bruttospalte
   * durchgehen, auch nicht in einem Text, der sonst nach Bon aussieht.
   */
  it('haelt "zzgl. 19 % MwSt. 95,30" nicht fuer eine Steuertabelle', () => {
    const befund = liesBeleg(`
      Getraenke Schmidt
      Kasse: 3 Bon:4712
      Rückgeld 0,00
      Nettobetrag 501,60
      zzgl. 19 % MwSt. 95,30
      Gesamtbetrag 596,90
    `);
    expect(befund.vorschlag.brutto).toBe(596.9);
    expect(befund.vorschlag.steuer).toBe(95.3);
  });

  /* Eine erfundene Nummer mit falscher Pruefziffer bleibt liegen. */
  it('nimmt eine nackte USt-IdNr. nur mit richtiger Pruefziffer', () => {
    const mitFehler = KAUFLAND.replace('DE203534318', 'DE203534319');
    expect(liesBeleg(mitFehler).vorschlag.ustId).toBeUndefined();
  });
});

/*
 * DERSELBE BON, ZWEITE AUFNAHME - und die Texterkennung zerlegt ihn anders.
 * Gemessen am 26.11.2026, eine halbe Stunde nach der ersten: Diesmal steht
 * der Briefkopf oben (beim ersten Mal kam die Artikelspalte zuerst), der
 * Bindestrich in "Kaufland -" fehlt, und vor allem ist die Steuertabelle
 * spaltenweise zerlegt - erst die Saetze, dann die Betraege. Genau daran
 * blieb der Betrag leer, obwohl das Lesen tags zuvor funktioniert hatte.
 *
 * Deshalb steht dieser zweite Text hier neben dem ersten: Eine Aufnahme ist
 * keine Pruefung. Was die Erkennung aus einem Blatt macht, haengt am Winkel,
 * am Licht und an ihrer Tageslaune.
 */
const KAUFLAND_SPALTEN = `
Kauf land Lohmener Straße 13
01/96 Pirna
Tel. 03501/500920
DE203534318
Hasseröder Pils
2*7,99
Pfandart ikel 2* 3,10
Rotk. Sekt Rose
4* 0.99
Rotk. Sekt htr.
4 * 0,99
KLC.Mineralwasser
Pfandart ikel
Ger. Oma Glühwein
Paulaner Spezi
2* 10,99
K Card XTRA Rabatt
Pfandart ikel
KLC Streu 60L
Summe
Euro
Rückgeld
2 * 3,10
2 * 2,15
Steuer % Brutto
A 19,00%
B7,00%
61,51
4,30
Kauf land Card XTRA:
EUR
Netto
51,69
4,02
Preis EUR
15,98 A
6,20 A
3,96 A
3,96 A
1,74 A
1,50 A
1,99 A
21,98 A
-2,00
6,20 A
4,30 B
65,81
70,00
4,19
Steuer
9,82
0,28
XXXXX9478
Datum:16. 10.26 Zeit: 18:00:35 Bon:91385
Filiale: 3343 Kasse: 11
Durch Kauf land Card XTRA Wurden
2,00 EUR gespart.
`;

describe('Wenn die Erkennung die Steuertabelle in Spalten zerlegt', () => {
  const befund = liesBeleg(KAUFLAND_SPALTEN, '2026-11-26');
  const v = befund.vorschlag;

  /*
   * Der Fehler, der am Geraet auftrat: "Zum Buchen fehlt noch: Brutto."
   * Die Saetze stehen allein, die Betraege kommen erst danach.
   */
  it('findet den Betrag trotzdem', () => {
    expect(v.brutto).toBe(65.81);
    expect(v.netto).toBe(55.71);
    expect(v.steuer).toBe(10.1);
  });

  /* Und die 65,81 stehen auch hier frei im Text - der Betrag ist bezeugt. */
  it('nennt ihn geprueft, weil die Summe im Text steht', () => {
    expect(befund.funde.find((f) => f.feld === 'brutto')?.sicherheit).toBe('geprueft');
  });

  it('liest Nummer, Datum und USt-IdNr. wie bei der ersten Aufnahme', () => {
    expect(v.nummer).toBe('91385');
    expect(v.datum).toBe('2026-10-16');
    expect(v.ustId).toBe('DE203534318');
  });

  it('reicht zum Buchen', () => {
    expect(vollstaendig(v)).toBe(true);
  });

  /*
   * Die Betraege duerfen NICHT aus der Nettospalte kommen, die ein paar
   * Zeilen weiter unten steht: 51,69 und 4,02 waeren beide plausibel und
   * beide falsch.
   */
  it('nimmt die Betraege direkt hinter den Saetzen, nicht die naechstbesten', () => {
    expect(v.brutto).not.toBe(55.71);
    expect(befund.funde.find((f) => f.feld === 'netto')?.wert).toBe('55.71');
  });
});

describe('Wo der Nachschub nicht greifen darf', () => {
  /*
   * Bringt EIN Satz seinen Betrag mit und der andere nicht, ist die Tabelle
   * halb zerlegt - dann ist jede Zuordnung geraten. Gelesen wird nur, was
   * eindeutig dasteht.
   */
  it('laesst eine halb zerlegte Tabelle liegen', () => {
    const befund = liesBeleg(`
      Markt Mueller
      Hauptstraße 2
      Kasse: 1 Bon:7
      Rückgeld 0,00
      Steuer % Brutto
      A 19,00% 11,90
      B 7,00%
      5,35
    `);
    expect(befund.vorschlag.brutto).toBe(11.9);
  });

  /*
   * Steht hinter den Saetzen etwas anderes als Betraege, wird nichts
   * genommen - dann faellt der Bon auf die Summenzeile zurueck.
   */
  it('faellt auf die Summenzeile zurueck, wenn hinter den Saetzen Text steht', () => {
    const befund = liesBeleg(`
      Markt Mueller
      Hauptstraße 2
      Kasse: 1 Bon:8
      Rückgeld 0,00
      Steuer % Brutto
      A 19,00%
      Kartenzahlung
      61,51
      Summe
      11,90
    `);
    expect(befund.vorschlag.brutto).toBe(11.9);
    expect(befund.funde.find((f) => f.feld === 'brutto')?.sicherheit).toBe('muster');
  });

  /* Zeigt die Tabelle Netto, wird auf Brutto hochgerechnet. */
  it('rechnet eine Nettospalte auf den Bruttobetrag hoch', () => {
    const befund = liesBeleg(`
      Markt Mueller
      Hauptstraße 2
      Kasse: 1 Bon:9
      Rückgeld 0,00
      Steuer % Netto
      A 19,00% 100,00
    `);
    expect(befund.vorschlag.brutto).toBe(119);
    expect(befund.vorschlag.netto).toBe(100);
    expect(befund.vorschlag.steuer).toBe(19);
  });
});

/*
 * DERSELBE BON, DRITTE AUFNAHME - diesmal lag er quer auf dem Tisch. Die
 * Erkennung gibt den Text dadurch RUECKWAERTS aus (der Briefkopf steht ganz
 * unten), und sie trennt sogar das Kennzeichen vom Satz: "A" steht allein in
 * einer Zeile, "19,00%" in der naechsten. Gemessen am 26.11.2026.
 *
 * Gegen so etwas hilft keine Regel mehr ueber Zeilen und Nachbarn. Dieser
 * Text ist der Grund, warum die Zuordnung rechnet statt zu zaehlen.
 */
const KAUFLAND_QUER = `
9227663839651732822888781951
Filiale: 3343 Kasse: 11
Datum: 16.10.26 Zeit:
2,00 EUR gespart.
Durch Kauf
land Card XTRA WUurden
18:00:35 Bon:91385
Kauf land Card XTRA:
B7,00%
A
19,00%
Steuer % Brutto
4,30
4,02
XXXXX9478
0,28
61,51
51,69
9,82
Netto
Steuer
Rückgeld
4,19
Euro
EUR
Sme
70,00
65,81
KLC Streu 60L
K Card XTRA Rabatt
Pfandartikel
2 * 2,15
2 * 3,10
4,30 B
6,20 A
-2,00
2 * 10,99
Paulaner Spezi
21,98 A
Ger. Ona Glühwein
1,99 A
Pfandart tkel
4*0,99
KLC.Mineralwasser
Rotk. Sekt htr.
1,50 A
1,74 A
3,96 A
4* 0,99
Rotk. Sekt Rose
3,96 A
Pfandart ikel 2 # 3,10
6,20 A
2*7,99
15,98 A
Hasseröder Pils
Preis EUR
Kauf land- Lohmener Straße 13
DE203534318
Tel. 03501/500920
01/96 Pirna
`;

describe('Wenn der Bon quer liegt und der Text rueckwaerts kommt', () => {
  const befund = liesBeleg(KAUFLAND_QUER, '2026-11-26');
  const v = befund.vorschlag;

  /*
   * DER KERN: Die Zuordnung steht nicht in der Reihenfolge, sondern in der
   * Rechnung. 61,51/1,19 = 51,69 und 4,30/1,07 = 4,02 - beide Nettobetraege
   * stehen im Text, und ihre Summe 65,81 auch. Es gibt genau eine solche
   * Zuordnung, und deshalb ist sie keine Vermutung.
   */
  it('findet den Betrag ueber die Rechnung statt ueber die Zeilen', () => {
    expect(v.brutto).toBe(65.81);
    expect(v.netto).toBe(55.71);
    expect(v.steuer).toBe(10.1);
  });

  it('liest Nummer, Datum und USt-IdNr. wie bei den anderen Aufnahmen', () => {
    expect(v.nummer).toBe('91385');
    expect(v.datum).toBe('2026-10-16');
    expect(v.ustId).toBe('DE203534318');
  });

  /*
   * Der Briefkopf steht hier ganz unten. Vorher gewann "Filiale: 3343
   * Kasse: 11" als oberste namensartige Zeile.
   */
  it('findet den Haendler auch am Ende des Textes', () => {
    expect(v.absender).toBe('Kauf land- Lohmener Straße 13');
  });

  it('reicht zum Buchen', () => {
    expect(vollstaendig(v)).toBe(true);
  });
});

describe('Wo die Rechnung nichts behaupten darf', () => {
  /*
   * Passt keine Zuordnung - kein Netto im Text, keine Summe -, bleibt der
   * Betrag leer. Eine Zahl zu waehlen, weil sie die groesste ist, waere
   * geraten.
   */
  it('nimmt nichts, wenn der Text die Rechnung nicht bestaetigt', () => {
    const befund = liesBeleg(`
      Markt Mueller
      Hauptstraße 2
      Kasse: 1 Bon:21
      Rückgeld 0,00
      Steuer % Brutto
      A 19,00%
      B 7,00%
      Kartenzahlung
    `);
    expect(befund.vorschlag.brutto).toBeUndefined();
    expect(befund.hinweise).toContain('Kein Rechnungsbetrag gefunden.');
  });

  /*
   * Und wenn zwei Zuordnungen aufgehen, ist keine davon gelesen. Hier passen
   * sowohl 11,90 (Netto 10,00) als auch 23,80 (Netto 20,00), und beide Summen
   * stehen im Text.
   */
  it('nimmt nichts, wenn zwei Zuordnungen aufgehen', () => {
    const befund = liesBeleg(`
      Markt Mueller
      Hauptstraße 2
      Kasse: 1 Bon:22
      Rückgeld 0,00
      Steuer % Brutto
      A 19,00%
      10,00
      11,90
      20,00
      23,80
    `);
    expect(befund.vorschlag.brutto).toBeUndefined();
  });
});
