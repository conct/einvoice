import type { IsoDate } from '../util/date';
import { formatAmount } from '../util/money';

import { uebersicht, type Eingangsrechnung, type Lieferant } from './modell';
import { heute, zahlungsstand } from './status';

/**
 * Das Paket fuer die Kanzlei.
 *
 * ## Warum es das gibt
 *
 * Die Fotoerkennung nimmt das Abtippen ab, nicht das Abliefern. Der
 * Steuerberater braucht die Belege selbst, nicht die Zahlen daraus - und wer
 * sie bisher eingescannt und als ZIP geschickt hat, tut das danach immer
 * noch, nur mit einem zusaetzlichen Schritt davor. Erst dieses Paket macht
 * den alten Weg ueberfluessig: dieselbe Lieferung, aber aus dem, was ohnehin
 * schon abgelegt ist, und mit einer Liste, die sagt, was jedes Bild ist.
 *
 * ## Was es nicht ist
 *
 * Kein Buchungsstapel. Hier wird nichts kontiert und kein Konto geraten -
 * die Liste sagt, was auf dem Beleg steht, und die Kanzlei bucht. Der Weg
 * ueber DATEV-Kreditorenbuchungen ist in docs/eingang.md als naechster
 * Schritt vermerkt, mit dem Grund, warum er eigenstaendig geprueft gehoert.
 */

export interface Zeitraum {
  /** Fruehester Beleg, ISO-Datum. Ohne Angabe: alles. */
  von?: IsoDate;
  /** Spaetester Beleg, ISO-Datum. */
  bis?: IsoDate;
}

export interface Paketstueck {
  /** Name im Archiv, z.B. "2026-11-12_Elektro-Brandt_2026-0417.jpg". */
  name: string;
  eingang: Eingangsrechnung;
}

export interface Paketplan {
  stuecke: Paketstueck[];
  /** Vorgaenge im Zeitraum, zu denen kein Original abgelegt ist. */
  ohneOriginal: Eingangsrechnung[];
  /** Die Liste als CSV, Semikolon getrennt. */
  liste: string;
  /** Was in der Beilage steht. */
  liesmich: string;
  /** Vorschlag fuer den Dateinamen des Archivs. */
  archivname: string;
}

/** Nur die Vorgaenge im Zeitraum, nach Belegdatum sortiert. */
export function imZeitraum(
  rechnungen: readonly Eingangsrechnung[],
  zeitraum: Zeitraum = {},
): Eingangsrechnung[] {
  return rechnungen
    .filter((eingang) => {
      const datum = uebersicht(eingang).datum;
      if (zeitraum.von && datum < zeitraum.von) return false;
      if (zeitraum.bis && datum > zeitraum.bis) return false;
      return true;
    })
    .sort((a, b) => uebersicht(a).datum.localeCompare(uebersicht(b).datum));
}

/**
 * Ein Dateiname, den jedes Dateisystem und jedes Mailprogramm vertraegt.
 *
 * Umlaute werden umgeschrieben statt entfernt - "Mueller" findet man wieder,
 * "Mller" nicht. Alles andere ausser Ziffern, Buchstaben, Strich und Punkt
 * faellt weg: Ein Schraegstrich in einer Rechnungsnummer wuerde im Archiv
 * einen Ordner aufmachen, und ein Doppelpunkt macht Windows unbrauchbar.
 */
export function dateiname(text: string): string {
  return text
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

const feld = (wert: string | undefined) => {
  const text = (wert ?? '').replace(/"/g, '""');
  // Semikolon, Anfuehrungszeichen und Zeilenumbrueche muessen in Klammern.
  return /[;"\n\r]/.test(text) ? `"${text}"` : text;
};

const betrag = (wert: number | undefined) =>
  wert === undefined ? '' : formatAmount(wert).replace(/\./g, '');

/** Wie die Spalte "Herkunft" eine abgelesene Quelle nennt. */
const VORLAGE = { foto: 'Foto', pdf: 'PDF', datensatz: 'E-Rechnung (Felder)' } as const;

const SPALTEN = [
  'Belegdatum',
  'Rechnungsnummer',
  'Lieferant',
  'USt-IdNr.',
  'Steuernummer',
  'Netto',
  'Steuer',
  'Brutto',
  'Waehrung',
  'Faellig',
  'Bezahlt am',
  'Herkunft',
  'Datei',
  'Hinweise',
];

/**
 * Die Liste zum Paket.
 *
 * Semikolon und deutsche Zahlen ohne Tausenderpunkt: So liest es jedes
 * Tabellenprogramm in einer deutschen Einstellung ohne Nachfrage, und die
 * Kanzleisoftware ebenso. Die Spalte "Herkunft" ist kein Schmuck - sie sagt,
 * ob die Zahlen aus einem Datensatz stammen oder von einem Foto, und das ist
 * fuer jeden, der danach bucht, der wichtigste Unterschied.
 */
export function liste(
  stuecke: readonly Paketstueck[],
  lieferanten: readonly Lieferant[],
): string {
  const zeilen = [SPALTEN.join(';')];

  for (const stueck of stuecke) {
    const eingang = stueck.eingang;
    const zeile = uebersicht(eingang);
    const lieferant = lieferanten.find((lf) => lf.id === eingang.lieferantId);
    const quelle = eingang.quelle;
    const netto = quelle.art === 'foto' ? quelle.erfasst.netto : quelle.ausgewiesen.taxBasisTotal;
    const steuer = quelle.art === 'foto' ? quelle.erfasst.steuer : quelle.ausgewiesen.taxTotal;

    zeilen.push(
      [
        feld(zeile.datum),
        feld(zeile.nummer),
        feld(lieferant?.name ?? zeile.absender),
        feld(lieferant?.ustId ?? (quelle.art === 'foto' ? quelle.erfasst.ustId : quelle.invoice.seller.vatId)),
        feld(
          lieferant?.steuernummer ??
            (quelle.art === 'foto' ? quelle.erfasst.steuernummer : quelle.invoice.seller.taxNumber),
        ),
        feld(betrag(netto)),
        feld(betrag(steuer)),
        feld(betrag(zeile.brutto)),
        feld(zeile.waehrung),
        feld(zeile.faellig),
        feld(eingang.bezahltAm),
        feld(
          quelle.art === 'foto'
            ? `${VORLAGE[quelle.vorlage ?? 'foto']}, ${quelle.sicherheit ?? `${Math.round(quelle.zuversicht)} % erkannt`}`
            : 'E-Rechnung',
        ),
        feld(stueck.name),
        feld(eingang.hinweise.join(' | ')),
      ].join(';'),
    );
  }

  return zeilen.join('\r\n') + '\r\n';
}

/** Ein ISO-Datum deutsch: "2026-11-26" wird "26.11.2026". */
const deutsch = (datum: string) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.${datum.slice(0, 4)}`;

/**
 * Die Beilage, die erklaert, was in dem Paket liegt.
 *
 * 'werkzeug' ist der Name, der in der Beilage steht. Er hat eine Vorgabe,
 * weil diese Zusammenstellung in Rechnungswerk entstanden ist - aber sie
 * liegt jetzt in der Bibliothek, und ein zweites Haus darf der Kanzlei nicht
 * den Namen eines fremden Programms nennen.
 */
export function liesmich(
  plan: Omit<Paketplan, 'liesmich'>,
  erzeugtAm: string,
  zeitraum: Zeitraum = {},
  werkzeug = 'Rechnungswerk',
): string {
  const spanne =
    zeitraum.von || zeitraum.bis
      ? `Zeitraum ${zeitraum.von ? deutsch(zeitraum.von) : 'Anfang'} bis ${
          zeitraum.bis ? deutsch(zeitraum.bis) : 'heute'
        }.`
      : 'Alle abgelegten Belege, ohne Einschraenkung des Zeitraums.';

  const zeilen = [
    'Eingangsrechnungen',
    '',
    `Erzeugt am ${erzeugtAm} mit ${werkzeug}.`,
    spanne,
    `${plan.stuecke.length} Beleg(e), dazu die Liste rechnungen.csv.`,
    '',
    'Die Liste nennt zu jedem Beleg die Datei, in der er liegt. Die Spalte',
    '"Herkunft" sagt, woher die Zahlen stammen:',
    '',
    '  E-Rechnung  Aus dem strukturierten Datensatz gelesen (XRechnung,',
    '              ZUGFeRD/Factur-X). Massgeblich ist diese Datei selbst.',
    '  E-Rechnung (Felder)',
    '              Aus einer E-Rechnung uebernommen, das Dokument selbst liegt',
    '              nicht bei. Die Zahlen stammen aus dem Datensatz.',
    '  PDF         Aus dem Text einer PDF ohne E-Rechnung abgelesen und von',
    '              Hand bestaetigt.',
    '  Foto        Von einem Bild abgelesen und von Hand bestaetigt.',
    '              Daneben steht, wie sicher die Lesung war - als Zuversicht',
    '              der Texterkennung in Prozent, oder in Worten.',
    '',
    'Betraege stehen so, wie sie auf dem Beleg ausgewiesen sind - nicht',
    'nachgerechnet und nicht berichtigt. Wo beim Einlesen etwas auffiel,',
    'steht es in der Spalte "Hinweise".',
    '',
    'Kontiert ist nichts.',
  ];

  if (plan.ohneOriginal.length > 0) {
    zeilen.push(
      '',
      `Zu ${plan.ohneOriginal.length} Vorgang/Vorgaengen liegt kein Original bei:`,
      ...plan.ohneOriginal.map((eingang) => {
        const zeile = uebersicht(eingang);
        return `  ${zeile.datum} ${zeile.nummer} ${zeile.absender}`;
      }),
    );
  }

  return zeilen.join('\n') + '\n';
}

/**
 * Plant das Paket: welche Datei wie heisst, was in der Liste steht.
 *
 * Rein - gepackt wird woanders, denn dafuer braucht es die Originale aus der
 * Ablage. So laesst sich der ganze Inhalt pruefen, ohne eine Datei anzufassen.
 */
export function paketplan(
  rechnungen: readonly Eingangsrechnung[],
  lieferanten: readonly Lieferant[],
  zeitraum: Zeitraum = {},
  jetzt = new Date(),
  hatOriginal: (eingang: Eingangsrechnung) => boolean = (eingang) => Boolean(eingang.anlage),
  werkzeug?: string,
): Paketplan {
  const gewaehlt = imZeitraum(rechnungen, zeitraum);
  const stuecke: Paketstueck[] = [];
  const ohneOriginal: Eingangsrechnung[] = [];
  const vergeben = new Set<string>();

  for (const eingang of gewaehlt) {
    if (!hatOriginal(eingang)) {
      ohneOriginal.push(eingang);
      continue;
    }
    const zeile = uebersicht(eingang);
    const lieferant = lieferanten.find((lf) => lf.id === eingang.lieferantId);
    const endung = eingang.dateiname.split('.').pop()?.toLowerCase();
    const stamm = dateiname(
      `${zeile.datum}_${lieferant?.name ?? zeile.absender}_${zeile.nummer}`,
    );

    // Zwei Belege koennen denselben Namen ergeben - eine Rechnung, die
    // ueberschrieben wird, faellt in einem Archiv niemandem auf.
    let name = `${stamm}.${endung && /^[a-z0-9]{2,4}$/.test(endung) ? endung : 'bin'}`;
    let zaehler = 2;
    while (vergeben.has(name.toLowerCase())) {
      name = `${stamm}-${zaehler}.${endung ?? 'bin'}`;
      zaehler += 1;
    }
    vergeben.add(name.toLowerCase());
    stuecke.push({ name, eingang });
  }

  const bis = zeitraum.bis ?? heute(jetzt);
  const ohneText: Omit<Paketplan, 'liesmich'> = {
    stuecke,
    ohneOriginal,
    liste: liste(stuecke, lieferanten),
    archivname: `${dateiname(`eingangsrechnungen_${zeitraum.von ?? 'anfang'}_bis_${bis}`)}.zip`,
  };
  // Erzeugt am heute, nicht am Ende des Zeitraums - ein Paket fuer 2025,
  // das "erzeugt am 31.12.2025" behauptet, waere schlicht falsch datiert.
  return { ...ohneText, liesmich: liesmich(ohneText, deutsch(heute(jetzt)), zeitraum, werkzeug) };
}

/** Wie viele Belege, wie viel Geld - fuer den Knopf, bevor jemand packt. */
export function paketumfang(
  rechnungen: readonly Eingangsrechnung[],
  zeitraum: Zeitraum = {},
  stichtag?: string,
): { anzahl: number; offen: number } {
  const gewaehlt = imZeitraum(rechnungen, zeitraum);
  return {
    anzahl: gewaehlt.length,
    offen: gewaehlt.filter((eingang) => zahlungsstand(eingang, stichtag) !== 'bezahlt').length,
  };
}
