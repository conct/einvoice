import type { IsoDate } from '../util/date';
import { isIsoDate } from '../util/date';

/**
 * Spezifikationskennungen mit Verfallsdatum.
 *
 * Das Problem, das dieses Modul loest: Die Kennung nach BT-24 wird in jedes
 * erzeugte Dokument geschrieben, und sie ist versionsgebunden. Steht sie fest
 * im App-Bundle, schreibt eine App, die ein Jahr nicht aktualisiert wurde, nach
 * einem Versionssprung eine veraltete Kennung in jede Rechnung - und der
 * Empfaenger lehnt sie ab. Der Nutzer merkt davon nichts, bis das Geld ausbleibt.
 *
 * Deshalb ist die Kennung hier Daten und keine Konstante: die gebuendelte
 * Fassung ist nur der Rueckfall, und sie weiss, wann sie zu alt ist.
 *
 * Wichtig fuer die Pflege: Die Kennung traegt Haupt- und Nebenversion, nicht
 * die Fehlerkorrekturstufe. XRechnung 3.0.1 und 3.0.2 schreiben beide
 * "xrechnung_3.0" - die halbjaehrlichen Bugfix-Bundles der KoSIT aendern also
 * die Regeln, aber nicht diese Zeichenkette.
 */

export interface SpecificationEntry {
  /** Vollstaendige Kennung fuer BT-24 */
  id: string;
  /** Menschenlesbare Fassung, z.B. "3.0" */
  version: string;
}

export interface SpecificationSet {
  /** Kennzeichnung dieses Standes, fuer Protokolle und Fehlermeldungen */
  label: string;
  /** Tag, an dem dieser Stand zusammengestellt wurde */
  publishedAt: IsoDate;
  /**
   * Tag, ab dem dieser Stand als veraltet gilt. Die KoSIT veroeffentlicht etwa
   * halbjaehrlich; ein Jahr ohne Aktualisierung ist die Grenze, ab der die App
   * warnen muss.
   */
  staleAfter: IsoDate;
  xrechnung: SpecificationEntry;
  zugferdEn16931: SpecificationEntry;
  zugferdExtended: SpecificationEntry;
  /** Womit dieser Stand geprueft wurde - gehoert in jedes Pruefprotokoll */
  validatedAgainst?: {
    kositConfiguration?: string;
    validatorTool?: string;
    zugferdVersion?: string;
  };
}

/**
 * Gebuendelter Stand vom 24.08.2026.
 *
 * Geprueft gegen die KoSIT-Konfiguration v2026-01-31 (Prueftool 1.6.0). Zu
 * diesem Zeitpunkt ist XRechnung 3.0.2 verbindlich, die Kennung lautet
 * unveraendert xrechnung_3.0.
 */
export const BUNDLED_SPECIFICATIONS: SpecificationSet = {
  label: 'gebuendelt-2026-08-24',
  publishedAt: '2026-08-24',
  staleAfter: '2027-08-24',
  xrechnung: {
    id: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
    version: '3.0',
  },
  zugferdEn16931: {
    id: 'urn:cen.eu:en16931:2017',
    version: 'EN 16931',
  },
  zugferdExtended: {
    id: 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended',
    version: 'EXTENDED',
  },
  validatedAgainst: {
    kositConfiguration: 'v2026-01-31',
    validatorTool: '1.6.0',
    zugferdVersion: '2.3',
  },
};

let active: SpecificationSet = BUNDLED_SPECIFICATIONS;

/** Der aktuell verwendete Stand. Ohne Nachladen der gebuendelte. */
export function activeSpecifications(): SpecificationSet {
  return active;
}

/**
 * Setzt einen nachgeladenen Stand.
 *
 * Der Aufrufer muss ihn vorher durch parseSpecificationSet() geschickt haben -
 * eine Kennung aus einer Fernquelle landet ungeprueft in jedem erzeugten
 * Dokument, deshalb wird ihre Form hier eng gefasst und nicht blind vertraut.
 */
export function setActiveSpecifications(set: SpecificationSet): void {
  active = set;
}

/** Zurueck auf den gebuendelten Stand, etwa nach einem fehlerhaften Nachladen. */
export function resetSpecifications(): void {
  active = BUNDLED_SPECIFICATIONS;
}

export interface SpecificationAge {
  /** Stand ist ueber sein Verfallsdatum hinaus */
  stale: boolean;
  /** Tage seit der Zusammenstellung */
  ageInDays: number;
  /** Tage bis zum Verfall, negativ wenn bereits ueberschritten */
  daysUntilStale: number;
  label: string;
}

export function specificationAge(
  now: IsoDate,
  set: SpecificationSet = active,
): SpecificationAge {
  const days = (from: IsoDate, to: IsoDate): number =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

  const daysUntilStale = days(now, set.staleAfter);
  return {
    stale: daysUntilStale < 0,
    ageInDays: days(set.publishedAt, now),
    daysUntilStale,
    label: set.label,
  };
}

/**
 * Prueft und uebernimmt einen nachgeladenen Stand.
 *
 * Eine Fernquelle darf hier nicht beliebige Zeichenketten einschleusen: jede
 * Kennung muss mit dem EN-16931-Praefix beginnen, sonst waere das erzeugte
 * Dokument fuer den Empfaenger unbrauchbar - und der Fehler faellt erst beim
 * Kunden auf. Bei jedem Zweifel bleibt der gebuendelte Stand aktiv.
 */
export function parseSpecificationSet(input: unknown): SpecificationSet {
  const raw = input as Partial<SpecificationSet> | null;
  if (!raw || typeof raw !== 'object') {
    throw new SpecificationError('Kein Objekt.');
  }

  const entry = (value: unknown, name: string): SpecificationEntry => {
    const candidate = value as Partial<SpecificationEntry> | undefined;
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.version !== 'string') {
      throw new SpecificationError(`Eintrag "${name}" fehlt oder ist unvollstaendig.`);
    }
    if (!candidate.id.startsWith('urn:cen.eu:en16931:2017')) {
      throw new SpecificationError(
        `Kennung "${candidate.id}" beginnt nicht mit dem EN-16931-Praefix.`,
      );
    }
    if (candidate.id.length > 200) {
      throw new SpecificationError(`Kennung "${name}" ist unplausibel lang.`);
    }
    return { id: candidate.id, version: candidate.version };
  };

  const date = (value: unknown, name: string): IsoDate => {
    if (typeof value !== 'string' || !isIsoDate(value)) {
      throw new SpecificationError(`Feld "${name}" ist kein Datum im Format YYYY-MM-DD.`);
    }
    return value;
  };

  return {
    label: typeof raw.label === 'string' && raw.label ? raw.label.slice(0, 64) : 'nachgeladen',
    publishedAt: date(raw.publishedAt, 'publishedAt'),
    staleAfter: date(raw.staleAfter, 'staleAfter'),
    xrechnung: entry(raw.xrechnung, 'xrechnung'),
    zugferdEn16931: entry(raw.zugferdEn16931, 'zugferdEn16931'),
    zugferdExtended: entry(raw.zugferdExtended, 'zugferdExtended'),
    validatedAgainst: raw.validatedAgainst,
  };
}

export class SpecificationError extends Error {
  constructor(message: string) {
    super(`Spezifikationsstand ungueltig: ${message}`);
    this.name = 'SpecificationError';
  }
}
