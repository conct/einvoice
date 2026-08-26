import { describe, expect, it } from 'vitest';

import { findeStammdaten } from '../src/parse/stammdaten';

/**
 * Die Faelle stammen aus echten Fremdrechnungen, nicht aus erdachten Vorlagen.
 * Der Grund: Was wir selbst erzeugen, koennen wir ohnehin lesen - die Frage
 * ist, was fremde Setzer tun.
 */

const wert = (fund: ReturnType<typeof findeStammdaten>, feld: string) =>
  fund.anschriften.flatMap((a) => a.felder).find((f) => f.feld === feld)?.wert;

describe('findeStammdaten - Anschriften', () => {
  it('zerlegt die vierzeilige Geschaeftsanschrift', () => {
    const fund = findeStammdaten([
      'VHS Sächsische Schweiz-Osterzgebirge e. V.',
      'Hr. Christian Ranacher',
      'Geschwister-Scholl-Straße 2',
      '01796 Pirna',
    ]);

    expect(wert(fund, 'name')).toBe('VHS Sächsische Schweiz-Osterzgebirge e. V.');
    expect(wert(fund, 'ansprechpartner')).toBe('Hr. Christian Ranacher');
    expect(wert(fund, 'strasse')).toBe('Geschwister-Scholl-Straße 2');
    expect(wert(fund, 'plz')).toBe('01796');
    expect(wert(fund, 'ort')).toBe('Pirna');
  });

  it('nimmt ohne Anrede die Zeile ueber der Strasse als Namen', () => {
    const fund = findeStammdaten([
      'Nordlicht Digitalwerk GmbH',
      'Speicherstraße 14',
      '20457 Hamburg',
    ]);

    expect(wert(fund, 'name')).toBe('Nordlicht Digitalwerk GmbH');
    expect(wert(fund, 'ansprechpartner')).toBeUndefined();
  });

  it('zerlegt den einzeiligen Rueckabsender an seinen Trennern', () => {
    const fund = findeStammdaten([
      'SCHÖNE | SCHÖNE • Büro für Gestaltung • Schmiedestr. 1 • 01796 Pirna',
    ]);

    expect(wert(fund, 'plz')).toBe('01796');
    expect(wert(fund, 'ort')).toBe('Pirna');
  });

  it('haelt Absender und Empfaenger getrennt, statt sie zu deuten', () => {
    const fund = findeStammdaten([
      'Nordlicht Digitalwerk GmbH',
      'Speicherstraße 14',
      '20457 Hamburg',
      '',
      'Möbelwerk Süd GmbH',
      'Industriestraße 8',
      '86167 Augsburg',
    ]);

    // Beide, in der Reihenfolge des Dokuments - die Zuordnung trifft ein Mensch.
    expect(fund.anschriften).toHaveLength(2);
  });
});

describe('findeStammdaten - Kennungen', () => {
  it('nimmt nur IBAN, die die Pruefsumme besteht', () => {
    const gut = findeStammdaten(['IBAN DE02120300000000202051']);
    expect(gut.angaben.find((f) => f.feld === 'iban')?.sicherheit).toBe('geprueft');

    // Eine Ziffer fehlt - genau der Fall aus einer gestalteten Fremdrechnung,
    // deren Schrift einen Glyphen nicht zurueckuebersetzte.
    const kurz = findeStammdaten(['IBAN DE6185040000058242600']);
    expect(kurz.angaben.find((f) => f.feld === 'iban')).toBeUndefined();
  });

  it('findet den BIC auch ohne Abstand hinter der Beschriftung', () => {
    expect(findeStammdaten(['BICCOBADEFFXXX']).angaben.find((f) => f.feld === 'bic')?.wert).toBe(
      'COBADEFFXXX',
    );
  });

  it('haelt ein Bruchstueck der Leitweg-ID nicht fuer eine Steuernummer', () => {
    const fund = findeStammdaten(['Leitweg-ID 04011000-12345-67']);
    expect(fund.angaben.find((f) => f.feld === 'ustId')).toBeUndefined();
    expect(fund.angaben.find((f) => f.feld === 'leitwegId')?.wert).toBe('04011000-12345-67');
  });

  it('liest Rechnungsnummer und Rechnungsdatum bewusst nicht mit', () => {
    const fund = findeStammdaten(['Rechnungs-Nr. 2026/7910', 'Rechnungsdatum: 12.8.2026']);
    expect(fund.angaben).toHaveLength(0);
  });
});
