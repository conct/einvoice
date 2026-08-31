import { describe, expect, it } from 'vitest';

import { schlageVorlageVor } from '../src/absender/vorlage';
import type { Textseite, Textstueck } from '../src/parse/pdf-text';

const A4_HOEHE = 841.89;

const stueck = (
  x: number,
  y: number,
  text: string,
  fett = false,
  schnitt = fett ? 'Muster-Semibold' : 'Muster-Light',
): Textstueck => ({
  x,
  y,
  groesse: 9,
  breite: text.length * 4,
  fett,
  schnitt,
  text,
});

const seiteAus = (zeilen: Textstueck[][]): Textseite => ({
  zeilen: zeilen.map((stuecke) => ({
    y: stuecke[0]!.y,
    stuecke,
    text: stuecke.map((s) => s.text).join(' '),
  })),
});

describe('Auszeichnung', () => {
  it('uebernimmt, welche Kennzahlen die Vorlage betont', () => {
    /*
     * Sie zeichnet nicht alle gleich aus: Nummer und Kundennummer halbfett,
     * das Datum mager - alle drei in derselben Zeile. Wer das einebnet, setzt
     * drei gleichrangige Angaben, wo die Vorlage zwei betont.
     */
    const vorschlag = schlageVorlageVor(
      seiteAus([
        [
          stueck(181, 539, 'Rechnungs-Nr. 2026/7910', true),
          stueck(337, 539, 'Kunden-Nr. 2008', true),
          stueck(456, 539, 'Rechnungsdatum: 12.8.2026'),
        ],
      ]),
      A4_HOEHE,
    );

    expect([...vorschlag.kennzahlenFett].sort()).toEqual(['kundennummer', 'rechnungsnummer']);
    expect(vorschlag.kennzahlenFett).not.toContain('rechnungsdatum');
  });
});

describe('was die Vorlage nicht braucht', () => {
  it('meldet fehlende Spaltenkoepfe', () => {
    // Die vermessene Vorlage nennt eine Position und ihren Preis - mehr
    // braucht es dort nicht, also auch keine Kopfzeile.
    const ohne = schlageVorlageVor(
      seiteAus([
        [stueck(215, 375, 'Plakate > Elternabend #Medien'), stueck(528, 375, '65,00 Euro')],
      ]),
      A4_HOEHE,
    );
    expect(ohne.tabellenkopf).toBe(false);

    const mit = schlageVorlageVor(
      seiteAus([
        [stueck(57, 467, 'Pos.'), stueck(90, 467, 'Bezeichnung'), stueck(400, 467, 'Menge')],
      ]),
      A4_HOEHE,
    );
    expect(mit.tabellenkopf).toBe(true);
  });

  it('nennt nur die Kennzahlen, die die Vorlage fuehrt', () => {
    const vorschlag = schlageVorlageVor(
      seiteAus([
        [
          stueck(181, 539, 'Rechnungs-Nr. 2026/7910'),
          stueck(337, 539, 'Kunden-Nr. 2008'),
          stueck(456, 539, 'Rechnungsdatum: 12.8.2026'),
        ],
      ]),
      A4_HOEHE,
    );

    expect([...vorschlag.kennzahlenfelder].sort()).toEqual([
      'kundennummer',
      'rechnungsdatum',
      'rechnungsnummer',
    ]);
    // Leitweg-ID und Bestellnummer stehen weiterhin im XML, nur nicht auf dem
    // Blatt - dort liest sie der Empfaenger maschinell.
    expect(vorschlag.kennzahlenfelder).not.toContain('leitwegId');
  });

  it('erkennt, ob die Steuerzeile ihre Grundlage nennt', () => {
    const ohne = schlageVorlageVor(seiteAus([[stueck(355, 291, 'zzgl. 19 % MwSt.')]]), A4_HOEHE);
    expect(ohne.steuergrundlage).toBe(false);

    const mit = schlageVorlageVor(
      seiteAus([[stueck(355, 291, 'zzgl. 19 % USt. auf 10.381,50')]]),
      A4_HOEHE,
    );
    expect(mit.steuergrundlage).toBe(true);

    // Ohne Steuerzeile bleibt die Frage offen - eine Vorlage ohne
    // Steuerausweis sagt nichts darueber, wie wir einen setzen sollen.
    const stumm = schlageVorlageVor(seiteAus([[stueck(181, 483, 'Sehr geehrte Damen')]]), A4_HOEHE);
    expect(stumm.steuergrundlage).toBeUndefined();
  });
});

describe('schlageVorlageVor', () => {
  it('liest die Wortwahl einer gestalteten Fremdrechnung', () => {
    // Genau so steht es auf der Vorlage - eine Zeile, drei Angaben.
    const seite = seiteAus([
      [
        stueck(181, 539, 'Rechnungs-Nr. 2026/7910'),
        stueck(337, 539, 'Kunden-Nr. 2008'),
        stueck(456, 539, 'Rechnungsdatum: 12.8.2026'),
      ],
    ]);

    const vorschlag = schlageVorlageVor(seite, A4_HOEHE);

    expect(vorschlag.beschriftungen.rechnungsnummer).toBe('Rechnungs-Nr.');
    expect(vorschlag.beschriftungen.kundennummer).toBe('Kunden-Nr.');
    expect(vorschlag.beschriftungen.rechnungsdatum).toBe('Rechnungsdatum:');
  });

  it('liest auch die Woerter des Summenblocks', () => {
    /*
     * Die Vorlage schreibt "Ueberweisungsbetrag", nicht "Zahlbetrag", und
     * kuerzt die Steuer mit "MwSt." ab. Beides ist Hausbrauch und beides
     * gehoert uebernommen.
     */
    const seite = seiteAus([
      [stueck(344, 315, 'Gesamtbetrag netto'), stueck(528, 315, '65,00 Euro')],
      [stueck(355, 291, 'zzgl. 19 % MwSt.'), stueck(527, 291, '12,35 Euro')],
      [stueck(337, 267, 'Überweisungsbetrag'), stueck(526, 267, '77,35 Euro')],
    ]);

    const vorschlag = schlageVorlageVor(seite, A4_HOEHE);

    expect(vorschlag.beschriftungen.zwischensummeNetto).toBe('Gesamtbetrag netto');
    expect(vorschlag.beschriftungen.gesamtbetrag).toBe('Überweisungsbetrag');
    // Das Kuerzel steht mitten im Stueck, nicht am Anfang.
    expect(vorschlag.beschriftungen.steuerkuerzel).toBe('MwSt.');
  });

  it('haelt die Zwischensumme von der Endsumme auseinander', () => {
    // "Gesamtbetrag netto" und "Gesamtbetrag" unterscheiden sich nur durch
    // das Wort danach - ohne dieses Merkmal bekaeme der Block zweimal
    // dasselbe Wort.
    const netto = schlageVorlageVor(seiteAus([[stueck(344, 315, 'Gesamtbetrag netto')]]), A4_HOEHE);
    expect(netto.beschriftungen.zwischensummeNetto).toBe('Gesamtbetrag netto');
    expect(netto.beschriftungen.gesamtbetrag).toBeUndefined();

    const brutto = schlageVorlageVor(seiteAus([[stueck(344, 267, 'Gesamtbetrag')]]), A4_HOEHE);
    expect(brutto.beschriftungen.gesamtbetrag).toBe('Gesamtbetrag');
    expect(brutto.beschriftungen.zwischensummeNetto).toBeUndefined();
  });

  it('erkennt an drei Angaben in einer Zeile den quer gesetzten Block', () => {
    const seite = seiteAus([
      [
        stueck(181, 539, 'Rechnungs-Nr. 2026/7910'),
        stueck(337, 539, 'Kunden-Nr. 2008'),
        stueck(456, 539, 'Rechnungsdatum: 12.8.2026'),
      ],
    ]);

    expect(schlageVorlageVor(seite, A4_HOEHE).kennzahlen).toBe('unter-anschrift');
  });

  it('erkennt den Block neben dem Anschriftenfeld', () => {
    // Untereinander, auf Hoehe des Anschriftenfeldes (45 mm von oben).
    const seite = seiteAus([
      [stueck(354, 720, 'Rechnungsnummer'), stueck(475, 720, 'RE-2026-0042')],
      [stueck(354, 708, 'Rechnungsdatum'), stueck(475, 708, '24.08.2026')],
    ]);

    expect(schlageVorlageVor(seite, A4_HOEHE).kennzahlen).toBe('neben-anschrift');
  });

  it('haelt ein Wort aus dem Fliesstext nicht fuer eine Beschriftung', () => {
    /*
     * Die Fusszeile einer echten Rechnung endet mit "Rechnungsdatum ist
     * Leistungsdatum." Ohne die Schranken wurde daraus die Beschriftung des
     * Leistungsdatums - auf jeder kuenftigen Rechnung.
     */
    const seite = seiteAus([
      [
        stueck(
          181,
          29,
          'kannt. Es gelten unsere Allgemeinen Geschäftsbedingungen. Rechnungsdatum ist Leistungsdatum.',
        ),
      ],
    ]);

    expect(schlageVorlageVor(seite, A4_HOEHE).beschriftungen.leistungsdatum).toBeUndefined();
    expect(schlageVorlageVor(seite, A4_HOEHE).beschriftungen.rechnungsdatum).toBeUndefined();
  });

  it('uebernimmt keine Werte, nur die Woerter davor', () => {
    const vorschlag = schlageVorlageVor(
      seiteAus([[stueck(181, 539, 'Rechnungs-Nr. 2026/7910')]]),
      A4_HOEHE,
    );

    // Eine uebernommene Rechnungsnummer verstiesse gegen Paragraf 14 Abs. 4
    // UStG, sobald sie ein zweites Mal vergeben wird.
    expect(JSON.stringify(vorschlag.beschriftungen)).not.toContain('2026/7910');
  });

  it('meldet keine Stellung, wo keine zu erkennen ist', () => {
    const seite = seiteAus([[stueck(60, 400, 'Sehr geehrte Damen und Herren,')]]);
    expect(schlageVorlageVor(seite, A4_HOEHE).kennzahlen).toBeUndefined();
  });
});

describe('Positionen der Vorlage', () => {
  /*
   * Nachgebaut aus der vermessenen Rechnung: Fliesstext bei 181, Positionen
   * bei 215, der Summenblock darunter. Die Positionszeile traegt ihren Betrag
   * erst in der letzten Zeile - der Name steht ohne.
   */
  const wieVorlage = (fett = false): Textseite =>
    seiteAus([
      [stueck(181, 483, 'Sehr geehrter Herr Ranacher,')],
      [stueck(215, 423, 'Gestaltungsarbeiten', fett)],
      [stueck(215, 411, 'nach Vorgaben des Auftraggebers', fett)],
      [stueck(215, 363, 'Gestaltung/Satz'), stueck(528, 363, '65,00 Euro')],
      [stueck(344, 315, 'Gesamtbetrag netto'), stueck(528, 315, '65,00 Euro')],
      [stueck(355, 291, 'zzgl. 19 % MwSt.'), stueck(527, 291, '12,35 Euro')],
      [stueck(337, 267, 'Überweisungsbetrag', true), stueck(526, 267, '77,35 Euro', true)],
    ]);

  it('misst den Einzug an der Positionszeile, nicht am Anschreiben', () => {
    /*
     * Am Anschreiben gemessen waere der Einzug immer null - es steht am
     * Satzrand. Die Positionen stehen 34 Punkte weiter rechts, und diese
     * leere Spalte gehoert zum Raster: Wer sie streicht, weil nichts darin
     * steht, schiebt die Positionen unter das Anschreiben.
     */
    expect(schlageVorlageVor(wieVorlage(), A4_HOEHE, 181).positionsEinzug).toBeCloseTo(34, 1);
  });

  it('haelt den Summenblock aus den Positionen heraus', () => {
    /*
     * Der Summenblock endet ebenfalls auf Betraege, seine Beschriftungen
     * stehen aber bei 337 bis 355. Zaehlten seine Zeilen mit, waere der
     * gemessene Einzug nicht 34, sondern immer noch 34 - aber nur, weil die
     * Positionszeile zufaellig weiter links steht. Ohne die Grenze bliebe das
     * Zufall; deshalb wird sie hier ausdruecklich geprueft.
     */
    const ohneSummen = seiteAus([
      [stueck(215, 363, 'Gestaltung/Satz'), stueck(528, 363, '65,00 Euro')],
      [stueck(344, 315, 'Gesamtbetrag netto'), stueck(528, 315, '65,00 Euro')],
    ]);
    expect(schlageVorlageVor(ohneSummen, A4_HOEHE, 181).positionsEinzug).toBeCloseTo(34, 1);
  });

  it('erkennt, ob die Vorlage den Positionsnamen auszeichnet', () => {
    expect(schlageVorlageVor(wieVorlage(false), A4_HOEHE, 181).positionsauszeichnung).toBe(false);
    expect(schlageVorlageVor(wieVorlage(true), A4_HOEHE, 181).positionsauszeichnung).toBe(true);
  });

  it('raet nicht, wenn der Satzrand unbekannt ist', () => {
    const vorschlag = schlageVorlageVor(wieVorlage(), A4_HOEHE);
    expect(vorschlag.positionsEinzug).toBeUndefined();
    expect(vorschlag.positionsauszeichnung).toBeUndefined();
  });

  it('raet nicht, wenn die Vorlage keinen Summenblock nennt', () => {
    /*
     * Ohne eine seiner Beschriftungen ist nicht zu sagen, wo die Positionen
     * aufhoeren. Eine falsch gezogene Grenze machte jede Summenzeile zur
     * Position - und die stehen weiter rechts, der Einzug waere grob falsch.
     */
    const ohneKante = seiteAus([
      [stueck(215, 363, 'Gestaltung/Satz'), stueck(528, 363, '65,00 Euro')],
    ]);
    expect(schlageVorlageVor(ohneKante, A4_HOEHE, 181).positionsEinzug).toBeUndefined();
  });

  it('nimmt keinen Einzug an, wo keiner ist', () => {
    const buendig = seiteAus([
      [stueck(181, 363, 'Beratung'), stueck(528, 363, '65,00 Euro')],
      [stueck(344, 315, 'Gesamtbetrag netto'), stueck(528, 315, '65,00 Euro')],
    ]);
    expect(schlageVorlageVor(buendig, A4_HOEHE, 181).positionsEinzug).toBeUndefined();
  });
});

describe('Senkrechte Anker der Vorlage', () => {
  const wieVorlage = (): Textseite =>
    seiteAus([
      [
        stueck(181, 539, 'Rechnungs-Nr. 2026/7910', true),
        stueck(337, 539, 'Kunden-Nr. 2008', true),
        stueck(456, 539, 'Rechnungsdatum: 12.8.2026'),
      ],
      [stueck(181, 483, 'Sehr geehrter Herr Ranacher,')],
      [stueck(181, 459, 'wir bedanken uns für Ihren Auftrag.')],
      [stueck(215, 363, 'Gestaltung/Satz'), stueck(528, 363, '65,00 Euro')],
      [stueck(344, 315, 'Gesamtbetrag netto'), stueck(528, 315, '65,00 Euro')],
      [stueck(355, 291, 'zzgl. 19 % MwSt.'), stueck(527, 291, '12,35 Euro')],
      [stueck(337, 267, 'Überweisungsbetrag', true), stueck(526, 267, '77,35 Euro', true)],
    ]);

  it('merkt sich, auf welcher Hoehe die Kennzahlen stehen', () => {
    /*
     * Unser Satz stellte den Block 45 Millimeter unter die Oberkante des
     * Anschriftenfeldes - ein rundes Mass, das mit dieser Vorlage nichts zu
     * tun hat. Ihres sind 42,3, und die Differenz schob den ganzen Rumpf.
     */
    expect(schlageVorlageVor(wieVorlage(), A4_HOEHE, 181).kennzahlenOben).toBe(539);
  });

  it('merkt sich, wo ihr Anschreiben beginnt', () => {
    // Die erste Zeile unter der letzten Kennzahl. Zwischen beiden liegen 56
    // Punkt - kein Vielfaches ihres Rasters, sondern eine Setzerentscheidung.
    expect(schlageVorlageVor(wieVorlage(), A4_HOEHE, 181).textOben).toBe(483);
  });

  it('merkt sich die Kanten der Kennzahlenspalten', () => {
    /*
     * Gleiche Drittel gaben je 130 Punkt, und "Rechnungs-Nr. 2026/7910"
     * passte nicht hinein - gerendert stand da "Rechnungs-Nr. 2026/7...".
     * Eine unvollstaendige Rechnungsnummer ist kein Schoenheitsfehler,
     * sondern ein Verstoss gegen Paragraf 14 UStG.
     */
    expect(schlageVorlageVor(wieVorlage(), A4_HOEHE, 181).kennzahlenSpalten).toEqual({
      rechnungsnummer: 181,
      kundennummer: 337,
      rechnungsdatum: 456,
    });
  });

  it('liest die Fluchtlinie der Summenbeschriftungen', () => {
    // Alle drei enden rechtsbuendig auf derselben Kante; genommen wird die
    // groesste. `breite` ist im Testhelfer vier Punkt je Zeichen.
    const vorschlag = schlageVorlageVor(wieVorlage(), A4_HOEHE, 181);
    expect(vorschlag.summenlabelRechts).toBe(355 + 'zzgl. 19 % MwSt.'.length * 4);
  });

  it('raet keine Anker ohne Kennzahlen', () => {
    const stumm = schlageVorlageVor(
      seiteAus([[stueck(181, 483, 'Sehr geehrte Damen und Herren')]]),
      A4_HOEHE,
      181,
    );
    expect(stumm.kennzahlenOben).toBeUndefined();
    expect(stumm.textOben).toBeUndefined();
    expect(stumm.kennzahlenSpalten).toBeUndefined();
  });

  it('liest keine Fluchtlinie aus einer einzigen Beschriftung', () => {
    // Aus einer allein laesst sich keine Buendigkeit ablesen - sie koennte
    // ebenso gut mittig stehen.
    const eine = schlageVorlageVor(
      seiteAus([[stueck(337, 267, 'Überweisungsbetrag', true)]]),
      A4_HOEHE,
      181,
    );
    expect(eine.summenlabelRechts).toBeUndefined();
  });
});

describe('Wo der Betrag einer Position steht', () => {
  /*
   * Zweizeilige Position. Der Betrag steht in **einer** Zeile mit dem Text -
   * die Frage ist nur, mit welcher: der obersten oder der untersten.
   */
  const block = (betragAufLetzter: boolean): Textseite =>
    seiteAus([
      betragAufLetzter
        ? [stueck(215, 423, 'Gestaltungsarbeiten')]
        : [stueck(215, 423, 'Gestaltungsarbeiten'), stueck(528, 423, '65,00 Euro')],
      betragAufLetzter
        ? [stueck(215, 411, 'Gestaltung/Satz'), stueck(528, 411, '65,00 Euro')]
        : [stueck(215, 411, 'Gestaltung/Satz')],
      [stueck(344, 315, 'Gesamtbetrag netto'), stueck(528, 315, '65,00 Euro')],
    ]);

  it('erkennt den Betrag auf der letzten Zeile', () => {
    /*
     * Die vermessene Vorlage setzt ihn dorthin - auf Hoehe der letzten
     * Beschreibungszeile, nicht neben den Namen. Bei einer einzeiligen
     * Position ist das dasselbe; bei einer vierzeiligen stand der Betrag drei
     * Zeilen zu hoch.
     */
    expect(schlageVorlageVor(block(true), A4_HOEHE, 181).betragUnten).toBe(true);
  });

  it('erkennt den Betrag auf der ersten Zeile', () => {
    expect(schlageVorlageVor(block(false), A4_HOEHE, 181).betragUnten).toBe(false);
  });
});

describe('Schnitte der Vorlage', () => {
  const seite = (): Textseite =>
    seiteAus([
      [stueck(181, 539, 'Rechnungs-Nr. 2026/7910', true)],
      [stueck(181, 483, 'Sehr geehrter Herr Ranacher,', false, 'National-Light')],
      [stueck(215, 363, 'Gestaltung/Satz', false, 'National-Light')],
      [stueck(344, 315, 'Gesamtbetrag netto', false, 'National-Book')],
      [stueck(337, 267, 'Überweisungsbetrag', true, 'National-Semibold')],
    ]);

  it('nennt alle Schnitte, die im Rechnungsteil vorkommen', () => {
    /*
     * "Vielleicht mehrere Schriften" ist keine Auskunft. Wer seine Vorlage
     * uebernehmen will, soll erfahren, **welche** Dateien er beibringen muss -
     * und sie in seiner Lizenz wiederfinden.
     */
    expect(schlageVorlageVor(seite(), A4_HOEHE, 181).schnitte).toEqual([
      'National-Book',
      'National-Light',
      'National-Semibold',
      'Muster-Semibold',
    ].sort());
  });

  it('erkennt einen eigenen Schnitt fuer die Summenbeschriftungen', () => {
    /*
     * Der Fliesstext steht in Light, "Gesamtbetrag netto" in Book - ein
     * dritter Schnitt zwischen mager und halbfett. Ohne ihn setzten wir die
     * Zeile drei Prozent zu schmal.
     */
    expect(schlageVorlageVor(seite(), A4_HOEHE, 181).summenlabelKraeftig).toBe(true);
  });

  it('nimmt keinen dritten Schnitt an, wo alles gleich gesetzt ist', () => {
    const einheitlich = seiteAus([
      [stueck(181, 483, 'Sehr geehrter Herr Ranacher,', false, 'Muster-Light')],
      [stueck(344, 315, 'Gesamtbetrag netto', false, 'Muster-Light')],
    ]);
    expect(schlageVorlageVor(einheitlich, A4_HOEHE, 181).summenlabelKraeftig).toBeUndefined();
  });
});
