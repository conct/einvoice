import { findeStammdaten } from '../parse/stammdaten';
import type { Briefpapier } from '../parse/pdf-gestaltung';
import { zeilenImBogen } from './zahlungsklausel';
import type { Identitaet } from './profil';

/**
 * Wer im Briefkopf als Absender steht.
 *
 * ## Warum eine Liste und keine Antwort
 *
 * Weil auf einer Rechnung immer zwei Anschriften stehen: die des Ausstellers
 * und die des Empfaengers. Welche welche ist, laesst sich aus der Lage allein
 * nicht sicher sagen - manche Boegen setzen den Absender unten, manche
 * zweizeilig neben das Zeichen. Waehlen soll deshalb ein Mensch; wer hier
 * raet, laesst jemanden unter dem Briefkopf seines Kunden verschicken.
 *
 * ## Warum nur vollstaendige Anschriften
 *
 * Genommen wird nur, was Name, Postleitzahl und Ort traegt. Eine Anschrift
 * ohne Namen taugt nicht zur Zuordnung, und eine Auswahl anzubieten, die
 * hinterher abgewiesen wird, waere nur aergerlich.
 */
export function anschriftenAus(papier: Briefpapier): { identitaet: Identitaet; beleg: string }[] {
  return findeStammdaten(zeilenImBogen(papier))
    .anschriften.map((anschrift) => {
      const wert = (feld: string) => anschrift.felder.find((f) => f.feld === feld)?.wert;
      const name = wert('name');
      const plz = wert('plz');
      const ort = wert('ort');
      if (!name || !plz || !ort) return undefined;

      return {
        identitaet: {
          name,
          plz,
          ort,
          ...(wert('ustId') ? { ustId: wert('ustId') } : {}),
          ...(wert('steuernummer') ? { steuernummer: wert('steuernummer') } : {}),
        } as Identitaet,
        beleg: anschrift.beleg.join(' · '),
      };
    })
    .filter((eintrag): eintrag is { identitaet: Identitaet; beleg: string } => Boolean(eintrag));
}
