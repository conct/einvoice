import { describe, expect, it } from 'vitest';

import { liesBeleg } from '../src/parse/beleg';

/*
 * EIN BON VON DISKA, 24.11.2026, 17,95 EUR - der Rohtext der Texterkennung
 * auf dem Geraet, Zeile fuer Zeile aus der Datenbank von CHOOZY (27.11.2026).
 * Geschwaerzt sind nur der Name der Kassiererin oder des Kassierers und die
 * letzten Ziffern der Karte; das Repository ist oeffentlich.
 *
 * Unten steht eine Steueruebersicht ueber den UMSATZ vor dem Abzug von
 * Leergut und Rabatt - 18,18 + 1,27 = 19,45 -, und eine Abzugszeile
 * "-1,26 -0,24 -1,50". Bezahlt wurden 17,95.
 */
const DISKA_ROH = `LEERGUT EINW.ALLG.
G&G H-VOLLMIL.3,5%
G&G KOCHSCHIN 1, 49 € x
G&G EDELSALAM 1, 39 € x
G&G GEFLUE.ROULADE
Preisänderung
neuer Preis:
FALA OMA'S HE
MINI ROMANASA
4PAWS RIND
Posten: 15
Diska Dürröhrsdorf
Hauptstraße 109
01833 Dürrröhrsdorf
Tel. 035026-9573 1
G&G WEIZENMEH 0,59 e x
Mastercard
0,15 e x
0,99 € x
DISKA DUERRROEHRSDORF
Terminal1-ID :
TA-Nr 024015
MwSt
A 7%
B 19%
Kartenzahlung
kontakt los
MASTERCARD
PAN
Karte 2
EMV-AID
VU-Nr
Genehmigungs-Nr
Datum 24.11.26
Zahlung erfolgt
-K-U-N-D-E-N-B-E-L-E-G-
AS-Proc-Code = 00 075 00
Capt.-Ref.= 0050
AID59: 80YGMP
EUR 17,95
2
SUMME €17,95
NETTO
4
18,18
EUR
-1,50*8
0,95 A
2,98 A
2,78 A
2,19 A
-0,88
Es bediente Sie:
Herr N. N.
1,31 A
0,30 A
1,98 A
6,79 A
2,36 A
17,95
51616572
BNr 1757
######** ####0000
MwSt
1,27
-1,26 -0,24 -1,50
A0000000041010
804000469
394491
19:21 Uhr
UMSATZ
Für Ihren Einkauf von 19,45 Euro auf
rabattfähige Artikel hätten Sie
9 PAYBACK "P erhalten!
* Position nicht rabattberecht igt
0014847241126102005756
Datum Uhrze it Filiale Pos Bed Bon
24.11.26 19:21 0424847 102 024 5756
Steuernumner: 257/115/33365
19,45
TSE Transaktionsnummer: 89853
TSE Seriennummer: 888FC29F4D5D175CBA071F
1DD3E7ADF2FE61987D28E84F269860990209DA92
`;

const fund = (text: string, feld: string) => liesBeleg(text, '2026-11-27').funde.find((f) => f.feld === feld);

describe('Ein Bon mit Abzug hinter der Steueruebersicht', () => {
  const befund = liesBeleg(DISKA_ROH, '2026-11-27');
  const v = befund.vorschlag;

  it('liest Summe, Nummer, Datum wie bisher', () => {
    expect(v.brutto).toBe(17.95);
    expect(v.nummer).toBe('89853');
    expect(v.datum).toBe('2026-11-24');
  });

  /* 18,18 - 1,26 = 16,92 und 1,27 - 0,24 = 1,03; zusammen 17,95. */
  it('verrechnet die Abzugszeile mit der Uebersicht', () => {
    expect(v.netto).toBe(16.92);
    expect(v.steuer).toBe(1.03);
  });

  it('markiert die verrechneten Felder eine Stufe unter der Uebersicht', () => {
    expect(fund(DISKA_ROH, 'netto')?.sicherheit).toBe('geraten');
    expect(fund(DISKA_ROH, 'steuer')?.sicherheit).toBe('geraten');
    expect(fund(DISKA_ROH, 'netto')?.beleg).toContain('-1,26 -0,24 -1,50');
  });

  /* Die Summe ist in die Rechnung eingegangen - sie darf sich nicht selbst bestaetigen. */
  it('hebt die Summe dadurch nicht auf geprueft', () => {
    expect(fund(DISKA_ROH, 'brutto')?.sicherheit).toBe('muster');
  });

  it('sagt, dass gerechnet wurde', () => {
    expect(befund.hinweise.join(' ')).toContain('verrechnet');
    expect(befund.hinweise.join(' ')).toContain('19,45');
  });
});

describe('Wenn der Abzug nicht aufgeht', () => {
  it('nennt die Zahlen statt still zu schweigen, wenn die Abzugszeile fehlt', () => {
    const text = DISKA_ROH.replace('-1,26 -0,24 -1,50\n', '');
    const befund = liesBeleg(text, '2026-11-27');

    expect(befund.vorschlag.netto).toBeUndefined();
    expect(befund.vorschlag.steuer).toBeUndefined();
    expect(befund.hinweise).toContain(
      'Steuerübersicht passt nicht zur Summe: 18,18 + 1,27 = 19,45, bezahlt 17,95. Netto und Steuer bleiben leer.',
    );
  });

  it('nimmt eine Abzugszeile nicht, deren dritter Betrag keine Summe ist', () => {
    const text = DISKA_ROH.replace('-1,26 -0,24 -1,50', '-1,26 -0,24 -1,60');
    const befund = liesBeleg(text, '2026-11-27');

    expect(befund.vorschlag.netto).toBeUndefined();
    expect(befund.hinweise.join(' ')).toContain('passt nicht zur Summe');
  });

  it('nimmt eine Abzugszeile nicht, die nicht auf die bezahlte Summe fuehrt', () => {
    const text = DISKA_ROH.replace('-1,26 -0,24 -1,50', '-1,00 -0,20 -1,20');
    expect(liesBeleg(text, '2026-11-27').vorschlag.netto).toBeUndefined();
  });

  it('nimmt nichts, wenn zwei Abzugszeilen aufgingen', () => {
    const text = DISKA_ROH.replace('-1,26 -0,24 -1,50', '-1,26 -0,24 -1,50\n-1,27 -0,23 -1,50');
    const befund = liesBeleg(text, '2026-11-27');

    expect(befund.vorschlag.netto).toBeUndefined();
    expect(befund.hinweise.join(' ')).toContain('Mehrere Abzugszeilen');
  });

  it('nimmt nichts, wenn zwei Steueruebersichten verschiedene Werte nennen', () => {
    const text = DISKA_ROH.replace('MwSt\n1,27', 'MwSt\n1,27\nMwSt\n1,28');
    const befund = liesBeleg(text, '2026-11-27');

    expect(befund.vorschlag.netto).toBeUndefined();
    expect(befund.vorschlag.steuer).toBeUndefined();
  });
});

describe('Eine Steueruebersicht ohne Abzug', () => {
  /* Passt sie zur Summe, gilt sie - auch zerrissen. */
  it('nimmt sie, wenn sie zur Summe passt', () => {
    const text = DISKA_ROH
      .replace('-1,26 -0,24 -1,50\n', '')
      .replaceAll('17,95', '19,45');
    const befund = liesBeleg(text, '2026-11-27');

    expect(befund.vorschlag.brutto).toBe(19.45);
    expect(befund.vorschlag.netto).toBe(18.18);
    expect(befund.vorschlag.steuer).toBe(1.27);
    expect(befund.funde.find((f) => f.feld === 'netto')?.sicherheit).toBe('muster');
  });
});
