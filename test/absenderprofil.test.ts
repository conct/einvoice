import { describe, expect, it } from 'vitest';

import {
  kennungVon,
  profilAus,
  pruefeZuordnung,
  uebernimmBriefpapier,
  type Herkunft,
  type Identitaet,
} from '../src/absender/profil';
import type { Briefpapier } from '../src/parse/pdf-gestaltung';

const SCHOENE: Identitaet = {
  name: 'SCHÖNE | SCHÖNE Büro für Gestaltung',
  plz: '01796',
  ort: 'Pirna',
  steuernummer: '210 271 01159',
};

const VHS: Identitaet = {
  name: 'VHS Sächsische Schweiz-Osterzgebirge e. V.',
  plz: '01796',
  ort: 'Pirna',
};

const BOGEN = {
  seite: { breite: 606.61, hoehe: 853.23 },
  akzent: '#FF324B',
  pfade: [],
  laeufe: [],
  striche: [],
  kreise: [],
  flaechen: [],
  texte: [],
  falzmarken: [],
  grenze: 669,
  fussgrenze: 60,
  ungedeutet: 0,
  ausgelassen: 0,
} satisfies Briefpapier;

const herkunftVon = (identitaet: Identitaet): Herkunft => ({
  quelle: 'RE7910.pdf',
  gelesenAm: '2026-08-26',
  identitaet,
});

describe('kennungVon', () => {
  it('ergibt fuer dieselbe Firma dieselbe Kennung, ohne Absprache', () => {
    // Zwei Geraete, zwei Schreibweisen desselben Hauses.
    const geraetA = kennungVon(SCHOENE);
    const geraetB = kennungVon({ ...SCHOENE, name: 'schöne | schöne büro für gestaltung' });

    expect(geraetA).toBe(geraetB);
  });

  it('nimmt die Steuernummer, wo es eine gibt', () => {
    expect(kennungVon(SCHOENE)).toBe('st-210-271-01159');

    // Ein Umzug aendert die Kennung dann nicht - die Firma bleibt dieselbe.
    expect(kennungVon({ ...SCHOENE, ort: 'Dresden', plz: '01067' })).toBe(kennungVon(SCHOENE));
  });

  it('faellt ohne Steuernummer auf Name und Ort zurueck', () => {
    expect(kennungVon(VHS)).toBe('na-vhs-saechsische-schweiz-osterzgebirge-e-v-01796-pirna');
  });

  it('haelt verschiedene Rechtsformen auseinander', () => {
    const gmbh = kennungVon({ name: 'Muster GmbH', plz: '20457', ort: 'Hamburg' });
    const ag = kennungVon({ name: 'Muster AG', plz: '20457', ort: 'Hamburg' });

    expect(gmbh).not.toBe(ag);
  });
});

describe('pruefeZuordnung', () => {
  it('laesst den eigenen Bogen durch', () => {
    const profil = profilAus(SCHOENE);
    expect(pruefeZuordnung(profil, herkunftVon(SCHOENE))).toEqual({ urteil: 'passt' });
  });

  it('haelt einen fremden Bogen auf', () => {
    /*
     * Der Fall, um den es geht: Auf der Vorlage stehen zwei Anschriften, und
     * bestaetigt wurde die falsche. Ohne diese Pruefung verschickt der Nutzer
     * kuenftig Rechnungen unter dem Briefkopf seines Kunden.
     */
    const profil = profilAus(SCHOENE);
    const urteil = pruefeZuordnung(profil, herkunftVon(VHS));

    expect(urteil.urteil).toBe('fremd');
  });

  it('haelt einen selbst gebauten Bogen nicht fuer fremd', () => {
    expect(pruefeZuordnung(profilAus(SCHOENE))).toEqual({ urteil: 'ohne-herkunft' });
  });
});

describe('uebernimmBriefpapier', () => {
  it('haengt den eigenen Bogen an das Profil', () => {
    const ergebnis = uebernimmBriefpapier(profilAus(SCHOENE), BOGEN, herkunftVon(SCHOENE));

    expect('profil' in ergebnis).toBe(true);
    if ('profil' in ergebnis) {
      expect(ergebnis.profil.briefpapier?.akzent).toBe('#FF324B');
      expect(ergebnis.profil.herkunft?.quelle).toBe('RE7910.pdf');
    }
  });

  it('verweigert den fremden Bogen', () => {
    const ergebnis = uebernimmBriefpapier(profilAus(SCHOENE), BOGEN, herkunftVon(VHS));

    expect('fehler' in ergebnis).toBe(true);
    if ('fehler' in ergebnis) expect(ergebnis.fehler.urteil).toBe('fremd');
  });
});
