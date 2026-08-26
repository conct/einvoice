import { describe, expect, it } from 'vitest';

import { findeZahlungsklausel } from '../src/absender/zahlungsklausel';

describe('findeZahlungsklausel', () => {
  it('findet die Frist im Fusstext einer echten Rechnung', () => {
    const fund = findeZahlungsklausel([
      'Bitte überweisen Sie den oben genannten Betrag innerhalb von 8 Tagen ohne Abzug mit Angabe der Rechnungs-',
      'und Kundennummern auf unser oben stehendes Bankkonto.',
    ]);

    expect(fund?.tage).toBe(8);
    expect(fund?.merkmal).toBe('Frist in Tagen');
    expect(fund?.beleg).toContain('innerhalb von 8 Tagen');
  });

  it('erkennt die knappe Schreibweise', () => {
    expect(findeZahlungsklausel(['14 Tage netto'])?.tage).toBe(14);
    expect(findeZahlungsklausel(['Zahlbar sofort ohne Abzug'])?.merkmal).toBe('Zahlbar-Klausel');
    expect(findeZahlungsklausel(['binnen 30 Tagen'])?.tage).toBe(30);
  });

  it('meldet nichts bei einem Bogen ohne Klausel', () => {
    const fund = findeZahlungsklausel([
      'SCHÖNE | SCHÖNE • Büro für Gestaltung',
      'Steuer-Nr. 210 271 01159',
      'Es gelten unsere Allgemeinen Geschäftsbedingungen.',
    ]);

    expect(fund).toBeUndefined();
  });

  it('haelt "ohne Abzug" allein nicht fuer eine Frist', () => {
    // Der Ausdruck kommt auch in Saetzen vor, die nichts befristen.
    // Gesucht ist die Frist, nicht der Ton.
    expect(findeZahlungsklausel(['Der Betrag ist ohne Abzug zu begleichen.'])).toBeUndefined();
  });
});
