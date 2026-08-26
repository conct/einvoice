import { describe, expect, it } from 'vitest';

import { buildDatevBuchungsstapel, type DatevOptionen } from '../src/export/datev';
import { abgewandelt, SKR03, SKR04, steuerfallFuer } from '../src/export/kontenrahmen';
import { cp1252 } from '../src/util/cp1252';
import { parseInvoice, type Invoice } from '../src/model/invoice';
import { sampleInvoice, smallBusinessInvoice } from '../src/fixtures/sample';

const MANDANT = { berater: 12345, mandant: 6789, wirtschaftsjahrBeginn: '2026-01-01' };
const FESTER_ZEITPUNKT = new Date('2026-08-26T09:30:00+02:00');

function stapel(rechnungen: Invoice[], zusatz: Partial<DatevOptionen> = {}) {
  const ergebnis = buildDatevBuchungsstapel(rechnungen, {
    mandant: MANDANT,
    kontenrahmen: SKR03,
    now: FESTER_ZEITPUNKT,
    ...zusatz,
  });
  // Die Datei ist ANSI; zum Pruefen zurueck nach Text. Latin-1 genuegt dafuer,
  // weil die Testdaten keine Zeichen aus dem 0x80-Bereich enthalten.
  return { ...ergebnis, text: Buffer.from(ergebnis.bytes).toString('latin1') };
}

function zeilen(text: string): string[] {
  return text.split('\r\n').filter(Boolean);
}

/** Feld n einer Datenzeile, ohne Anfuehrungszeichen. */
function feld(zeile: string, index: number): string {
  return (zeile.split(';')[index] ?? '').replace(/^"|"$/g, '');
}

describe('Kontenzuordnung', () => {
  it('unterscheidet Regelsatz und ermaessigten Satz am Steuersatz', () => {
    // Die Kategorie "S" deckt beide ab - die Kategorie allein reicht nicht.
    expect(steuerfallFuer({ category: 'S', rate: 19 })).toBe('standard');
    expect(steuerfallFuer({ category: 'S', rate: 7 })).toBe('ermaessigt');
  });

  it('bildet die steuerlichen Sonderfaelle auf eigene Konten ab', () => {
    expect(steuerfallFuer({ category: 'AE', rate: 0 })).toBe('reverseCharge');
    expect(steuerfallFuer({ category: 'K', rate: 0 })).toBe('innergemeinschaftlich');
    expect(steuerfallFuer({ category: 'G', rate: 0 })).toBe('ausfuhr');
    expect(steuerfallFuer({ category: 'O', rate: 0 })).toBe('nichtSteuerbar');
    expect(steuerfallFuer({ category: 'E', rate: 0 })).toBe('steuerfrei');
  });

  it('laesst sich abwandeln, ohne die Vorlage zu veraendern', () => {
    const eigen = abgewandelt(SKR03, {
      erloese: { standard: { konto: '8401' } },
      sammeldebitor: '10001',
    });
    expect(eigen.erloese.standard.konto).toBe('8401');
    expect(eigen.sammeldebitor).toBe('10001');
    // Die gemeinsam genutzte Vorlage darf davon nichts mitbekommen.
    expect(SKR03.erloese.standard.konto).toBe('8400');
    expect(SKR03.sammeldebitor).toBe('10000');
    // Nicht genannte Faelle bleiben erhalten.
    expect(eigen.erloese.ermaessigt.konto).toBe('8300');
  });
});

describe('Buchungsstapel', () => {
  it('schreibt Kopf und Spaltenzeile nach DATEV-Format 700', () => {
    const { text } = stapel([sampleInvoice()]);
    const [kopf, spalten] = zeilen(text);

    expect(kopf?.startsWith('"EXTF";700;21;"Buchungsstapel";13;')).toBe(true);
    expect(kopf).toContain(';12345;6789;20260101;4;');
    expect(spalten?.startsWith('"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen"')).toBe(
      true,
    );
  });

  it('bucht je Steuergruppe einen Satz, brutto gegen das Erloeskonto', () => {
    const rechnung = sampleInvoice(); // enthaelt 19 % und 7 %
    const { text, saetze } = stapel([rechnung]);
    const daten = zeilen(text).slice(2);

    expect(saetze).toBe(2);
    expect(daten).toHaveLength(2);

    const konten = daten.map((z) => feld(z, 7)).sort();
    expect(konten).toEqual(['8300', '8400']);

    for (const zeile of daten) {
      expect(feld(zeile, 1)).toBe('S'); // Ausgangsrechnung: Debitor im Soll
      expect(feld(zeile, 6)).toBe('10000'); // Sammeldebitor, kein eigenes Konto
      expect(feld(zeile, 8)).toBe(''); // Automatikkonto traegt die Steuer selbst
      expect(feld(zeile, 10)).toBe('RE-2026-0042');
    }
  });

  it('schreibt das Belegdatum vierstellig als TTMM', () => {
    const { text } = stapel([sampleInvoice()]); // Rechnungsdatum 24.08.2026
    expect(feld(zeilen(text)[2] ?? '', 9)).toBe('2408');
  });

  it('summiert brutto und trifft die Rechnungssumme', () => {
    const rechnung = sampleInvoice();
    const { summe } = stapel([rechnung]);
    // Der Stapel bucht die Steuergruppen brutto - zusammen der Bruttobetrag,
    // nicht der Zahlbetrag: die Anzahlung ist eine eigene Buchung.
    expect(summe).toBeCloseTo(12846.19, 2);
  });

  it('dreht die Richtung bei einer Gutschrift', () => {
    const base = sampleInvoice();
    const gutschrift = parseInvoice({ ...base, typeCode: '381', number: 'GS-1' });
    const { text } = stapel([gutschrift]);
    for (const zeile of zeilen(text).slice(2)) {
      expect(feld(zeile, 1)).toBe('H');
    }
  });

  it('verwendet die Debitorennummer, wenn eine vergeben ist', () => {
    const { text } = stapel([sampleInvoice()], { debitor: () => '10250' });
    expect(feld(zeilen(text)[2] ?? '', 6)).toBe('10250');
  });

  it('bucht den Kleinunternehmer auf das steuerfreie Konto', () => {
    const { text } = stapel([smallBusinessInvoice()], { kontenrahmen: SKR04 });
    const daten = zeilen(text).slice(2);
    expect(daten).toHaveLength(1);
    expect(feld(daten[0] ?? '', 7)).toBe('4200');
  });

  it('setzt bei zwei Steuersaetzen den Satz in den Buchungstext', () => {
    // Sonst stuenden in der Kanzlei zwei gleich aussehende Zeilen.
    const { text } = stapel([sampleInvoice()]);
    const texte = zeilen(text)
      .slice(2)
      .map((z) => feld(z, 13));
    expect(new Set(texte).size).toBe(2);
    expect(texte.some((t) => t.includes('19 %'))).toBe(true);
    expect(texte.some((t) => t.includes('7 %'))).toBe(true);
  });

  it('ueberspringt Fremdwaehrung, statt sie halb zu buchen', () => {
    const base = sampleInvoice();
    const fremd = parseInvoice({ ...base, currency: 'CHF', number: 'RE-CHF-1' });
    const { saetze, uebersprungen } = stapel([fremd]);
    expect(saetze).toBe(0);
    expect(uebersprungen).toHaveLength(1);
    expect(uebersprungen[0]?.grund).toContain('CHF');
  });
});

describe('Kodierung nach Windows-1252', () => {
  it('schreibt Umlaute einbytig, nicht als UTF-8', () => {
    const { bytes, ersetzt } = cp1252('Straße Grün Öl');
    expect(ersetzt).toEqual([]);
    expect(bytes).toContain(0xdf); // ß
    expect(bytes).toContain(0xfc); // ü
    expect(bytes).toContain(0xd6); // Ö
    // UTF-8 wuerde hier 0xC3 als Fuehrungsbyte einstreuen.
    expect([...bytes]).not.toContain(0xc3);
  });

  it('kennt die Zeichen aus dem 0x80-Bereich', () => {
    expect([...cp1252('€').bytes]).toEqual([0x80]);
    expect([...cp1252('„Anker"').bytes.slice(0, 1)]).toEqual([0x84]);
  });

  it('ersetzt Unbekanntes sichtbar und meldet es', () => {
    const { bytes, ersetzt } = cp1252('Preis 5 中');
    expect(ersetzt).toEqual(['中']);
    expect(bytes[bytes.length - 1]).toBe(0x3f);
  });

  it('verdoppelt Anfuehrungszeichen im Kundennamen', () => {
    const base = sampleInvoice();
    const rechnung = parseInvoice({
      ...base,
      buyer: { ...base.buyer, name: 'Meier "Zum Anker" GmbH' },
    });
    const { text } = stapel([rechnung]);
    // Ohne Verdoppelung risse der Name die Zeile auseinander.
    expect(text).toContain('Meier ""Zum Anker"" GmbH');
  });
});
