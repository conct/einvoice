import { describe, expect, it } from 'vitest';

import { pruefeDienstadresse } from '../src/lizenz/dienstadresse';

/**
 * Welche Dienstadressen zulaessig sind.
 *
 * Zwei Fehler waeren hier teuer, und sie zeigen in entgegengesetzte
 * Richtungen: Zu streng schliesst den Raspberry Pi im Buero aus - also
 * ausgerechnet den Fall, der bei Rechnungsdaten am ueberzeugendsten ist. Zu
 * lax laesst unverschluesselte Uebertragung ins offene Netz zu, und darin
 * stehen Kundennamen, Preise und Margen.
 */
describe('Dienstadressen', () => {
  it('nimmt https ueberall an', () => {
    for (const adresse of [
      'https://rechnungen.firma.de/api',
      'https://rechnungswerk.conct.de/api',
      'https://192.168.1.50:8788',
    ]) {
      expect(pruefeDienstadresse(adresse).gut, adresse).toBe(true);
    }
  });

  it('nimmt http im eigenen Netz an', () => {
    // Der Fall, den die erste Fassung faelschlich ausgeschlossen hat.
    for (const adresse of [
      'http://192.168.1.50:8788',
      'http://10.0.0.7/buero',
      'http://172.16.5.4:8788',
      'http://172.31.255.255',
      'http://169.254.10.20',
      'http://himbeere.local:8788',
      'http://localhost:8788',
      'http://127.0.0.1:8788',
    ]) {
      const befund = pruefeDienstadresse(adresse);
      expect(befund.gut, adresse).toBe(true);
      if (befund.gut) expect(befund.oertlich, adresse).toBe(true);
    }
  });

  it('weist http im offenen Netz ab', () => {
    for (const adresse of [
      'http://rechnungen.firma.de/api',
      'http://8.8.8.8',
      // 172.15 und 172.32 liegen ausserhalb von 172.16/12 - die haeufigste
      // Verwechslung bei diesem Bereich.
      'http://172.15.0.1',
      'http://172.32.0.1',
      'http://192.169.1.1',
    ]) {
      expect(pruefeDienstadresse(adresse).gut, adresse).toBe(false);
    }
  });

  it('erkennt lokale IPv6-Adressen', () => {
    expect(pruefeDienstadresse('http://[::1]:8788').gut).toBe(true);
    expect(pruefeDienstadresse('http://[fd00::1]:8788').gut).toBe(true);
    expect(pruefeDienstadresse('http://[fe80::1]:8788').gut).toBe(true);
  });

  it('weist Unfug ab', () => {
    for (const adresse of ['', '   ', 'rechnungen.firma.de', 'ftp://firma.de', 'javascript:alert(1)']) {
      expect(pruefeDienstadresse(adresse).gut, JSON.stringify(adresse)).toBe(false);
    }
  });

  it('schneidet abschliessende Schraegstriche ab', () => {
    const befund = pruefeDienstadresse('  https://rechnungen.firma.de/api//  ');
    expect(befund.gut).toBe(true);
    if (befund.gut) expect(befund.adresse).toBe('https://rechnungen.firma.de/api');
  });

  it('meldet https im offenen Netz als nicht oertlich', () => {
    const befund = pruefeDienstadresse('https://rechnungen.firma.de/api');
    expect(befund.gut).toBe(true);
    if (befund.gut) expect(befund.oertlich).toBe(false);
  });
});
