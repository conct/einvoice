import { describe, expect, it } from 'vitest';

import { bankverbindungImBogen, findeZahlungsklausel } from '../src/absender/zahlungsklausel';
import type { Briefpapier } from '../src/parse/pdf-gestaltung';

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

describe('bankverbindungImBogen', () => {
  const bogenMit = (texte: string[]): Briefpapier =>
    ({
      seite: { breite: 595, hoehe: 842 },
      pfade: [],
      laeufe: [],
      striche: [],
      kreise: [],
      flaechen: [],
      texte: texte.map((text, nummer) => ({
        x: 100,
        y: 800 - nummer * 12,
        groesse: 9,
        breite: text.length * 4,
        text,
      })),
      falzmarken: [],
      grenze: 700,
      fussgrenze: 0,
      ungedeutet: 0,
      ausgelassen: 0,
      inhaltFuellungen: 0,
      inhaltSchrift: { median: 9, groesste: 9 },
    }) as unknown as Briefpapier;

  it('erkennt die Bankverbindung an ihrer Beschriftung', () => {
    /*
     * Bewusst ohne Pruefsumme: Die IBAN der vermessenen Vorlage kommt beim
     * Auslesen eine Ziffer zu kurz, weil die Schrift einen Glyphen nicht
     * zurueckuebersetzt. Auf dem Blatt steht sie trotzdem vollstaendig - und
     * nur darum geht es hier.
     */
    expect(
      bankverbindungImBogen(bogenMit(['IBAN DE61 8504 0000 0582 426 00', 'BIC COBADEFFXXX'])),
    ).toBe(true);
  });

  it('laesst sich von einer blossen Erwaehnung nicht taeuschen', () => {
    // Nur eine der beiden Beschriftungen genuegt nicht - sonst reichte ein
    // Satz wie "IBAN auf Anfrage", um die Bankverbindung von der Rechnung zu
    // nehmen. Eine Rechnung ohne Konto ist nicht zu bezahlen.
    expect(bankverbindungImBogen(bogenMit(['Bankverbindung auf Anfrage']))).toBe(false);
    expect(bankverbindungImBogen(bogenMit(['IBAN auf Anfrage']))).toBe(false);
  });
});
