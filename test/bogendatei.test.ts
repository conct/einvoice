import { describe, expect, it } from 'vitest';

import {
  alsBogendatei,
  bogenmangelText,
  BOGENDATEI_ART,
  BOGENDATEI_FASSUNG,
  liesBogendatei,
} from '../src/absender/bogendatei';
import type { Briefpapier } from '../src/parse/pdf-gestaltung';
import type { Identitaet } from '../src/absender/profil';

const ICH: Identitaet = {
  name: 'SCHÖNE | SCHÖNE Büro für Gestaltung',
  ort: 'Pirna',
  steuernummer: '210 271 01159',
};

const FREMD: Identitaet = { name: 'Nordlicht Digitalwerk GmbH', ort: 'Hamburg' };

const PAPIER = {
  seite: { breite: 606.6, hoehe: 853.2 },
  pfade: [],
  texte: [],
} as unknown as Briefpapier;

const quelle = () => ({
  bezeichnung: 'Briefbogen',
  briefpapier: PAPIER,
  briefpapierHerkunft: { quelle: 'alt.pdf', gelesenAm: '2026-08-27', identitaet: ICH },
  beschriftungen: { rechnungsnummer: 'Rechnungs-Nr.' },
  kennzahlen: 'unter-anschrift' as const,
  vorlage: { positionsEinzug: 34 },
  schriftName: 'National',
  schriftRegular: 'AAAA',
});

describe('alsBogendatei', () => {
  it('nimmt alles Gemessene mit', () => {
    const datei = alsBogendatei(quelle(), '2026-08-27')!;
    expect(datei.art).toBe(BOGENDATEI_ART);
    expect(datei.fassung).toBe(BOGENDATEI_FASSUNG);
    expect(datei.vorlage?.positionsEinzug).toBe(34);
    expect(datei.schrift?.regular).toBe('AAAA');
    expect(datei.herkunft.identitaet.name).toBe(ICH.name);
  });

  it('schreibt nichts ohne Bogen oder Herkunft', () => {
    /*
     * Ohne Herkunft liesse sich beim Einlesen nicht pruefen, wem die Datei
     * gehoert - und genau das ist ihr einziger Schutz davor, unter fremdem
     * Namen benutzt zu werden.
     */
    expect(alsBogendatei({ ...quelle(), briefpapierHerkunft: undefined }, '2026-08-27')).toBeUndefined();
    expect(alsBogendatei({ ...quelle(), briefpapier: undefined }, '2026-08-27')).toBeUndefined();
  });
});

describe('liesBogendatei', () => {
  const text = () => JSON.stringify(alsBogendatei(quelle(), '2026-08-27'));

  it('liest die eigene Datei und ordnet sie zu', () => {
    const befund = liesBogendatei(text(), ICH);
    expect(befund.mangel).toBeUndefined();
    expect(befund.zuordnung?.urteil).toBe('passt');
    expect(befund.datei?.vorlage?.positionsEinzug).toBe(34);
  });

  it('erkennt die Datei eines fremden Absenders', () => {
    /*
     * Eine Briefbogendatei waere sonst das perfekte Werkzeug, um unter
     * fremdem Namen Rechnungen zu stellen. Gelesen wird sie trotzdem - der
     * Nutzer soll erfahren, wessen Bogen er da hat, nicht nur dass es nicht
     * geht.
     */
    const befund = liesBogendatei(text(), FREMD);
    expect(befund.mangel).toBeUndefined();
    expect(befund.zuordnung?.urteil).toBe('fremd');
  });

  it('weist zurueck, was keine Bogendatei ist', () => {
    expect(liesBogendatei('kein json', ICH).mangel).toBe('kein-json');
    expect(liesBogendatei('{"art":"etwas"}', ICH).mangel).toBe('fremde-art');
  });

  it('raet nicht an einer neueren Fassung herum', () => {
    const neuer = JSON.stringify({ ...alsBogendatei(quelle(), '2026-08-27'), fassung: 99 });
    expect(liesBogendatei(neuer, ICH).mangel).toBe('zu-neu');
  });

  it('weist eine Datei ohne Bogen zurueck', () => {
    const ohne = JSON.stringify({ ...alsBogendatei(quelle(), '2026-08-27'), briefpapier: undefined });
    expect(liesBogendatei(ohne, ICH).mangel).toBe('unvollstaendig');
  });

  it('nennt zu jedem Mangel einen Satz', () => {
    for (const mangel of ['kein-json', 'fremde-art', 'zu-neu', 'unvollstaendig'] as const) {
      expect(bogenmangelText(mangel).length).toBeGreaterThan(20);
    }
  });
});
