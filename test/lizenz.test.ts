import { beforeAll, describe, expect, it } from 'vitest';

import {
  erzeugeSchluesselpaar,
  anschlussBis,
  laufzeitBis,
  pruefeSchluessel,
  stelleSchluesselAus,
  PRODUKTE,
  type LizenzInhalt,
  type Schluesselmaterial,
} from '../src/lizenz/schluessel';

/**
 * Ein Lizenzschluessel ist die einzige Stelle, an der Geld und Software sich
 * beruehren. Geprueft wird deshalb nicht nur, dass ein echter Schluessel
 * angenommen wird, sondern vor allem, dass die falschen abgewiesen werden -
 * ein Test, der nur den guten Fall kennt, findet nichts.
 */
let privat: Schluesselmaterial;
let oeffentlich: Schluesselmaterial;
let fremdOeffentlich: Schluesselmaterial;

beforeAll(async () => {
  const paar = await erzeugeSchluesselpaar();
  privat = paar.privat;
  oeffentlich = paar.oeffentlich;
  fremdOeffentlich = (await erzeugeSchluesselpaar()).oeffentlich;
});

const HEUTE = '2026-08-25';

const inhalt = (aenderung: Partial<Parameters<typeof stelleSchluesselAus>[0]> = {}) => ({
  v: 1 as const,
  stufe: 'pro' as const,
  email: 'kundin@example.de',
  kauf: 'pi_3Test123',
  ab: HEUTE,
  ...aenderung,
});

describe('Lizenzschluessel annehmen', () => {
  it('nimmt einen echten unbefristeten Schluessel an', async () => {
    const schluessel = await stelleSchluesselAus(inhalt(), privat);
    const befund = await pruefeSchluessel(schluessel, oeffentlich, HEUTE);

    expect(befund.gueltig).toBe(true);
    if (!befund.gueltig) return;
    expect(befund.stufe).toBe('pro');
    expect(befund.email).toBe('kundin@example.de');
    expect(befund.bis).toBeUndefined();
  });

  it('nimmt einen befristeten Schluessel bis zum letzten Tag an', async () => {
    const schluessel = await stelleSchluesselAus(
      inhalt({ stufe: 'buero', bis: '2026-09-25' }),
      privat,
    );

    // Am letzten Gueltigkeitstag muss er noch gelten, nicht schon fallen.
    const amLetztenTag = await pruefeSchluessel(schluessel, oeffentlich, '2026-09-25');
    expect(amLetztenTag.gueltig).toBe(true);
  });

  it('vertraegt Zeilenumbrueche und Leerzeichen aus der E-Mail', async () => {
    const schluessel = await stelleSchluesselAus(inhalt(), privat);
    const zerpflueckt = `  ${schluessel.slice(0, 40)}\n${schluessel.slice(40)}  `;

    const befund = await pruefeSchluessel(zerpflueckt, oeffentlich, HEUTE);
    expect(befund.gueltig).toBe(true);
  });
});

describe('Lizenzschluessel abweisen', () => {
  it('weist einen abgelaufenen Schluessel ab und nennt das Datum', async () => {
    const schluessel = await stelleSchluesselAus(
      inhalt({ stufe: 'buero', bis: '2026-09-25' }),
      privat,
    );

    const befund = await pruefeSchluessel(schluessel, oeffentlich, '2026-09-26');
    expect(befund.gueltig).toBe(false);
    if (befund.gueltig) return;
    expect(befund.grund).toContain('2026-09-25');
  });

  it('weist einen veraenderten Inhalt ab', async () => {
    const schluessel = await stelleSchluesselAus(
      inhalt({ stufe: 'buero', bis: '2026-09-25' }),
      privat,
    );
    const [kennung, rumpf, signatur] = schluessel.split('.') as [string, string, string];

    // Die Laufzeit im Rumpf verlaengern, Signatur unveraendert lassen - der
    // naheliegendste Angriff ueberhaupt.
    const daten = JSON.parse(
      Buffer.from(rumpf.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as Record<string, unknown>;
    daten.bis = '2099-12-31';
    const gefaelscht = Buffer.from(JSON.stringify(daten), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const befund = await pruefeSchluessel(
      `${kennung}.${gefaelscht}.${signatur}`,
      oeffentlich,
      HEUTE,
    );
    expect(befund.gueltig).toBe(false);
    if (befund.gueltig) return;
    expect(befund.grund).toContain('Signatur');
  });

  it('weist einen Schluessel aus fremder Hand ab', async () => {
    const schluessel = await stelleSchluesselAus(inhalt(), privat);

    const befund = await pruefeSchluessel(schluessel, fremdOeffentlich, HEUTE);
    expect(befund.gueltig).toBe(false);
  });

  it('weist eine unbekannte Fassung ab', async () => {
    const schluessel = await stelleSchluesselAus(inhalt(), privat);
    const befund = await pruefeSchluessel(schluessel.replace(/^EW1/, 'EW9'), oeffentlich, HEUTE);

    expect(befund.gueltig).toBe(false);
    if (befund.gueltig) return;
    expect(befund.grund).toContain('Schluesselfassung');
  });

  it.each([
    ['leer', ''],
    ['Unsinn', 'hallo welt'],
    ['zu wenige Teile', 'EW1.abc'],
    ['Rumpf kein Base64', 'EW1.!!!!.!!!!'],
  ])('weist %s ab, ohne zu werfen', async (_name, eingabe) => {
    const befund = await pruefeSchluessel(eingabe, oeffentlich, HEUTE);
    expect(befund.gueltig).toBe(false);
  });
});

describe('Laufzeiten', () => {
  it('rechnet einen Monat in Monaten und nicht in dreissig Tagen', () => {
    // Wer am 31. Januar bucht, erwartet den 28. Februar - nicht den 2. Maerz.
    expect(laufzeitBis('2026-01-31', 1)).toBe('2026-02-28');
    expect(laufzeitBis('2026-08-25', 1)).toBe('2026-09-25');
  });

  it('rechnet zwoelf Monate auf den Tag genau', () => {
    expect(laufzeitBis('2026-08-25', 12)).toBe('2027-08-25');
    // Schaltjahr: der 29. Februar hat im Folgejahr keine Entsprechung.
    expect(laufzeitBis('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('ordnet den Produkten die vereinbarten Laufzeiten zu', () => {
    expect(PRODUKTE.pro.monate).toBeUndefined();
    expect(PRODUKTE['buero-monat'].monate).toBe(1);
    expect(PRODUKTE['buero-jahr'].monate).toBe(12);
    expect(PRODUKTE['buero-monat'].stufe).toBe('buero');
  });

  it('haelt Pro unbefristet nutzbar und befristet nur die Pflege', () => {
    // Der Unterschied, der die Zielgruppe schuetzt: Eine Rechnung schreiben zu
    // muessen ist eine gesetzliche Pflicht. Wer dafuer bezahlt hat, darf nicht
    // an einem Stichtag stehenbleiben - nachgekauft wird fuer neue Fassungen.
    expect(PRODUKTE.pro.monate).toBeUndefined();
    expect(PRODUKTE.pro.pflegeMonate).toBe(12);
  });
});

describe('Pflegezeitraum im Schluessel', () => {
  it('traegt ein Pflegedatum, ohne die Nutzung zu befristen', async () => {
    const schluessel = await stelleSchluesselAus(inhalt({ pflege: '2027-08-25' }), privat);

    const befund = await pruefeSchluessel(schluessel, oeffentlich, '2028-01-01');
    expect(befund.gueltig).toBe(true);
    if (!befund.gueltig) return;

    // Zwei Jahre spaeter, Pflege laengst abgelaufen - und trotzdem nutzbar.
    expect(befund.pflege).toBe('2027-08-25');
    expect(befund.bis).toBeUndefined();
  });
});

/**
 * Nachkaufen von Buero.
 *
 * Die Regel ist eine Zusage aus Paragraf 4 Absatz 3 der
 * Geschaeftsbedingungen: gezahlt wird ein Zeitraum im Voraus. Wer nachkauft,
 * waehrend noch Laufzeit uebrig ist, darf sie nicht verlieren - genau das
 * waere der naheliegende Fehler, und er faellt erst dem Kunden auf.
 */
describe('Anschlusslaufzeit beim Nachkaufen', () => {
  it('rechnet ab heute, wenn nichts laeuft', () => {
    expect(anschlussBis(1, '2027-03-15')).toBe('2027-04-15');
    expect(anschlussBis(12, '2027-03-15')).toBe('2028-03-15');
  });

  it('haengt an die laufende Zeit an, statt sie zu verwerfen', () => {
    // Am 15.03. nachgekauft, laeuft noch bis 30.11. - der neue Monat gehoert
    // hinten dran, nicht auf den heutigen Tag.
    expect(anschlussBis(1, '2027-03-15', '2027-11-30')).toBe('2027-12-30');
    expect(anschlussBis(12, '2027-03-15', '2027-11-30')).toBe('2028-11-30');
  });

  it('ignoriert eine abgelaufene Zeit', () => {
    expect(anschlussBis(1, '2027-03-15', '2026-12-31')).toBe('2027-04-15');
  });

  it('rechnet ab heute, wenn die Zeit genau heute endet', () => {
    // Der letzte Gueltigkeitstag zaehlt ganz. Wer am letzten Tag nachkauft,
    // bekommt einen Monat ab diesem Tag - nicht ab gestern.
    expect(anschlussBis(1, '2027-03-15', '2027-03-15')).toBe('2027-04-15');
  });

  it('faellt auf den letzten Tag des Zielmonats zurueck', () => {
    // 31.01. plus ein Monat gibt es nicht. Erwartet wird der 28., nicht der
    // 2. Maerz - dieselbe Regel wie bei laufzeitBis.
    expect(anschlussBis(1, '2027-01-15', '2027-01-31')).toBe('2027-02-28');
  });
});

/**
 * Die Dienstadresse im Schluessel.
 *
 * Sie richtet die App auf einen fremden Server - dorthin gehen dann in der
 * kostenlosen Stufe Rechnungsdaten. Deshalb sind die Schranken eng, und
 * deshalb werden sie hier geprueft: Ein Fehler an dieser Stelle leitet Daten
 * um, ohne dass es jemand merkt.
 */
describe('Dienstadresse im Lizenzschluessel', () => {
  const heute = '2027-03-15';

  async function schluessel(zusatz: Partial<LizenzInhalt>) {
    const inhalt = {
      v: 1 as const,
      stufe: 'buero' as const,
      email: 'kundin@example.de',
      kauf: 'pi_3ABC',
      ab: heute,
      bis: '2028-03-15',
      ...zusatz,
    } as LizenzInhalt;
    return stelleSchluesselAus(inhalt, privat);
  }

  it('nimmt eine https-Adresse bei Buero an', async () => {
    const befund = await pruefeSchluessel(
      await schluessel({ dienst: 'https://rechnungen.firma.de/api' }),
      oeffentlich,
      heute,
    );
    expect(befund.gueltig).toBe(true);
    if (!befund.gueltig) return;
    expect(befund.dienst).toBe('https://rechnungen.firma.de/api');
  });

  it('weist http ab', async () => {
    // Unverschluesselt liest jeder mit, der dazwischen sitzt - und es stuenden
    // Kundennamen, Preise und Margen darin.
    const befund = await pruefeSchluessel(
      await schluessel({ dienst: 'http://rechnungen.firma.de/api' }),
      oeffentlich,
      heute,
    );
    expect(befund.gueltig).toBe(false);
  });

  it('weist eine Adresse bei Pro ab', async () => {
    // Pro erzeugt auf dem Geraet und haette von einem Dienst nichts. Ein Feld
    // dort ist deshalb kein Sonderfall, sondern ein Verdachtsfall.
    const befund = await pruefeSchluessel(
      await schluessel({ stufe: 'pro', bis: undefined, dienst: 'https://fremd.example/api' }),
      oeffentlich,
      heute,
    );
    expect(befund.gueltig).toBe(false);
  });

  it('bleibt ohne Feld unveraendert gueltig', async () => {
    const befund = await pruefeSchluessel(await schluessel({}), oeffentlich, heute);
    expect(befund.gueltig).toBe(true);
    if (!befund.gueltig) return;
    expect(befund.dienst).toBeUndefined();
  });
});
