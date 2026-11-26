import { describe, expect, it } from 'vitest';

import { parseInvoice } from '../src/model/invoice';
import { readEInvoice } from '../src/parse/receive';
import { utf8Encode } from '../src/util/base64';
import { buildCii } from '../src/xml/cii';
import { sampleInvoice } from '../src/fixtures/sample';

import {
  absenderzugAusParty,
  ausEInvoice,
  ausFoto,
  dateiname,
  imZeitraum,
  paketplan,
  paketumfang,
  type Eingangsrechnung,
  type Erfassung,
  type Lieferant,
} from '../src/kanzlei/index';

const JETZT = new Date('2026-11-26T09:00:00Z');

async function ausXml(
  id: string,
  aenderung: Partial<ReturnType<typeof sampleInvoice>> = {},
  zusatz: Partial<Eingangsrechnung> = {},
): Promise<Eingangsrechnung> {
  const xml = buildCii(parseInvoice({ ...sampleInvoice(), ...aenderung }));
  const gelesen = await readEInvoice(utf8Encode(xml), 'rechnung.xml');
  // Mit Lieferant, wie es die Ablage anlegt: Der Name im Dateinamen kommt
  // von dort und nicht aus dem Handelsnamen der Rechnung.
  return {
    id,
    ...ausEInvoice(gelesen, 'rechnung.xml', JETZT),
    anlage: id,
    lieferantId: 'lf_1',
    ...zusatz,
  };
}

function ausBild(id: string, erfasst: Partial<Erfassung> = {}): Eingangsrechnung {
  const vollstaendig: Erfassung = {
    nummer: '2026-0417',
    datum: '2026-11-12',
    faellig: '2026-11-26',
    absender: 'Elektro Brandt GmbH',
    waehrung: 'EUR',
    brutto: 596.9,
    netto: 501.6,
    steuer: 95.3,
    ustId: 'DE812345679',
    ...erfasst,
  };
  return {
    id,
    ...ausFoto(vollstaendig, { dateiname: 'beleg.jpg', zuversicht: 92, text: '' }, JETZT),
    anlage: id,
  };
}

/*
 * Was 'lieferantAusParty' in rechnungswerk zusammensetzt - die Zuordnung
 * selbst bleibt dort, hier steht nur ein Lieferant, wie ihn eine Ablage
 * anlegt.
 */
const alsLieferant = (id: string): Lieferant => {
  const party = parseInvoice(sampleInvoice()).seller;
  return {
    id,
    party,
    ...absenderzugAusParty(party),
    createdAt: JETZT.toISOString(),
    updatedAt: JETZT.toISOString(),
  };
};

const LIEFERANTEN = [
  alsLieferant('lf_1'),
  {
    id: 'lf_2',
    name: 'Elektro Brandt GmbH',
    ustId: 'DE812345679',
    kreditor: '70001',
    createdAt: '',
    updatedAt: '',
  },
];

describe('Zeitraum', () => {
  it('nimmt nur Belege im Fenster und sortiert nach Belegdatum', async () => {
    const alt = await ausXml('er_1', { number: 'RE-1', issueDate: '2026-01-05' });
    const neu = await ausXml('er_2', { number: 'RE-2', issueDate: '2026-11-20' });
    const drin = imZeitraum([neu, alt], { von: '2026-10-01', bis: '2026-12-31' });
    expect(drin.map((e) => e.id)).toEqual(['er_2']);
    expect(imZeitraum([neu, alt]).map((e) => e.id)).toEqual(['er_1', 'er_2']);
  });

  it('zaehlt, was im Paket laege, und wie viel davon offen ist', async () => {
    const offen = await ausXml('er_1', { number: 'RE-1' });
    const bezahlt = await ausXml('er_2', { number: 'RE-2' }, { bezahltAm: '2026-09-02' });
    expect(paketumfang([offen, bezahlt], {}, '2026-12-01')).toEqual({ anzahl: 2, offen: 1 });
  });
});

describe('Dateinamen', () => {
  it('schreibt Umlaute um, statt sie wegzuwerfen', () => {
    expect(dateiname('Müller & Söhne GmbH')).toBe('Mueller-Soehne-GmbH');
  });

  it('entfernt, was ein Archiv oder Windows missversteht', () => {
    expect(dateiname('RE/2026:0001')).toBe('RE-2026-0001');
  });
});

describe('Das Paket planen', () => {
  it('benennt jede Datei nach Datum, Lieferant und Nummer', async () => {
    const plan = paketplan([await ausXml('er_1')], LIEFERANTEN, {}, JETZT);
    expect(plan.stuecke).toHaveLength(1);
    expect(plan.stuecke[0]?.name).toBe('2026-08-24_Nordlicht-Digitalwerk-GmbH_RE-2026-0042.xml');
    expect(plan.archivname).toBe('eingangsrechnungen_anfang_bis_2026-11-26.zip');
  });

  /*
   * Zwei Belege mit demselben Namen gab es im ersten Entwurf - im Archiv
   * haette der zweite den ersten ueberschrieben, und zwar lautlos.
   */
  it('vergibt jeden Namen nur einmal', async () => {
    const a = await ausXml('er_1');
    const b = await ausXml('er_2');
    const plan = paketplan([a, b], LIEFERANTEN, {}, JETZT);
    const namen = plan.stuecke.map((s) => s.name);
    expect(new Set(namen).size).toBe(2);
    expect(namen[1]).toMatch(/-2\.xml$/);
  });

  it('laesst Vorgaenge ohne Original nicht verschwinden, sondern nennt sie', async () => {
    const ohne = await ausXml('er_3');
    delete ohne.anlage;
    const plan = paketplan([ohne], LIEFERANTEN, {}, JETZT);
    expect(plan.stuecke).toHaveLength(0);
    expect(plan.ohneOriginal).toHaveLength(1);
    expect(plan.liesmich).toMatch(/kein Original beiliegt|kein Original bei/);
  });
});

describe('Die Liste', () => {
  it('nennt Kopfzeile, Betraege in deutscher Schreibweise und die Datei', async () => {
    const plan = paketplan([await ausXml('er_1')], LIEFERANTEN, {}, JETZT);
    const zeilen = plan.liste.trim().split('\r\n');
    expect(zeilen[0]).toContain('Belegdatum;Rechnungsnummer;Lieferant');
    expect(zeilen[1]).toContain('2026-08-24;RE-2026-0042;Nordlicht Digitalwerk GmbH');
    expect(zeilen[1]).toContain('12846,19');
    expect(zeilen[1]).toContain('2026-08-24_Nordlicht-Digitalwerk-GmbH_RE-2026-0042.xml');
  });

  /*
   * Die wichtigste Spalte fuer die Kanzlei: Zahlen aus einem Datensatz sind
   * etwas anderes als Zahlen von einem Bild.
   */
  it('sagt, ob die Zahlen aus einem Datensatz oder von einem Foto stammen', async () => {
    const plan = paketplan([await ausXml('er_1'), ausBild('er_2')], LIEFERANTEN, {}, JETZT);
    expect(plan.liste).toContain(';E-Rechnung;');
    expect(plan.liste).toContain(';Foto, 92 % erkannt;');
  });

  /*
   * Nicht jede Anwendung hat eine Zuversicht in Prozent: CHOOZY urteilt in
   * Worten ('geprueft', wenn Netto plus Steuer aufgeht und die IBAN-
   * Pruefsumme stimmt). Wer das Feld nicht setzt, bekommt die Prozentzahl
   * wie vorher - das steht im Test darueber.
   */
  it('nimmt den Wortlaut, wo einer mitgegeben ist', async () => {
    const beleg = ausBild('er_3');
    if (beleg.quelle.art === 'foto') beleg.quelle.sicherheit = 'geprueft';
    expect(paketplan([beleg], [], {}, JETZT).liste).toContain(';Foto, geprueft;');
  });

  it('nimmt den Handelsnamen, wo kein Lieferant zugeordnet ist', async () => {
    const ohne = await ausXml('er_1', {}, { lieferantId: undefined });
    const zeile = paketplan([ohne], LIEFERANTEN, {}, JETZT).liste.split(/\r?\n/)[1];
    expect(zeile).toContain(';Nordlicht;');
    // Die Kennzeichen stehen dann aus der Rechnung selbst da.
    expect(zeile).toContain('DE812345678');
  });

  it('setzt Semikolon und Anfuehrungszeichen in Klammern, statt die Spalte zu sprengen', async () => {
    const heikel = ausBild('er_9', { absender: 'Meier; Sohn "Elektro"' });
    expect(paketplan([heikel], [], {}, JETZT).liste).toContain('"Meier; Sohn ""Elektro"""');
  });

  it('schreibt die Hinweise mit, statt sie zu verschlucken', async () => {
    const schief = ausBild('er_8', { brutto: 700 });
    expect(paketplan([schief], [], {}, JETZT).liste).toMatch(/ergeben 596\.90/);
  });
});

describe('Die Beilage', () => {
  it('erklaert die Herkunftsspalte und sagt, dass nichts kontiert ist', async () => {
    const plan = paketplan([await ausXml('er_1'), ausBild('er_2')], LIEFERANTEN, {}, JETZT);
    expect(plan.liesmich).toContain('2 Beleg(e)');
    expect(plan.liesmich).toContain('Erzeugt am 26.11.2026');
    expect(plan.liesmich).toContain('Kontiert ist nichts.');
  });

  /*
   * Im ersten Durchlauf stand hier das Ende des Zeitraums: Ein Paket fuer
   * 2025 behauptete, es sei am 31.12.2025 erzeugt worden.
   */
  it('datiert auf heute und nennt den Zeitraum getrennt', async () => {
    const plan = paketplan([await ausXml('er_1', { issueDate: '2025-03-01' })], LIEFERANTEN, {
      von: '2025-01-01',
      bis: '2025-12-31',
    }, JETZT);
    expect(plan.liesmich).toContain('Erzeugt am 26.11.2026');
    expect(plan.liesmich).toContain('Zeitraum 01.01.2025 bis 31.12.2025');
  });

  it('sagt ohne Zeitraum, dass alles drin ist', async () => {
    const plan = paketplan([await ausXml('er_1')], LIEFERANTEN, {}, JETZT);
    expect(plan.liesmich).toContain('ohne Einschraenkung des Zeitraums');
  });
});
