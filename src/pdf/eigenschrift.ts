import fontkit from '@pdf-lib/fontkit';

/**
 * Die eigene Hausschrift eines Absenders - pruefen, bevor sie gesetzt wird.
 *
 * ## Warum es das gibt
 *
 * Aus einer uebernommenen Fremdrechnung laesst sich die Schrift **nicht**
 * gewinnen. Nachgemessen an einer echten Vorlage: Eingebettet ist nur eine
 * Teilmenge, naemlich die Zeichen, die auf jener einen Seite vorkamen - 67
 * Stueck. Es fehlen j, p, q, x, y, die Ziffer 3, das Eurozeichen und jedes
 * Anfuehrungszeichen. Damit laesst sich kein Kundenname setzen und kein
 * Betrag. Das ist keine Frage des Aufwands; die Buchstaben sind nicht da.
 *
 * Wer seine Rechnung in seiner Schrift will, hinterlegt sie deshalb selbst -
 * die Datei, fuer die er die Lizenz hat. Fehlt sie, bleibt es bei der
 * Hausschrift.
 *
 * ## Warum geprueft und nicht einfach eingebettet
 *
 * Weil eine Schrift, die ein Zeichen nicht kennt, sich nicht beschwert:
 * pdf-lib setzt die Glyphe 0, und die Stelle bleibt im fertigen PDF leer. Kein
 * Validator sieht das - strukturell ist das Dokument in Ordnung. Es faellt
 * erst auf, wenn ein Empfaenger anruft und fragt, warum sein Name fehlt.
 *
 * Deshalb wird beim Hinterlegen geprueft, nicht beim Drucken: Dort steht ein
 * Mensch davor, der die Datei wechseln kann.
 */

/** Fehlerarten, damit die Oberflaeche jeden Fall eigen benennen kann. */
export type Schriftmangel =
  | 'unlesbar'
  | 'zu-gross'
  | 'zeichen-fehlen'
  | 'keine-umrisse'
  | 'schnitte-verschieden';

export interface Schriftbefund {
  /** Der Familienname aus der Datei - fuer die Anzeige im Profil. */
  name: string;
  /** Wie viele Zeichen die Datei kennt. */
  zeichen: number;
  /** Was fehlt, als lesbare Zeichenfolge. Leer, wenn nichts fehlt. */
  fehlend: string;
  mangel?: Schriftmangel;
}

/**
 * Was eine Rechnung an Zeichen braucht.
 *
 * Nicht der ganze lateinische Vorrat - danach gefragt scheiterte fast jede
 * Schrift, und die meisten Zeichen kommen auf einer Rechnung nie vor. Gefordert
 * wird, was auf **jeder** deutschen Rechnung stehen kann: Buchstaben mit
 * Umlauten, Ziffern, die Satzzeichen der Betragsschreibung, das Eurozeichen
 * und der Paragraf - der steht in jedem Befreiungsgrund.
 *
 * Was darueber hinaus in einem Kundennamen auftaucht, faengt die
 * Zeichenpruefung beim Drucken ab. Hier geht es darum, offensichtlich
 * untaugliche Dateien abzuweisen: eine Symbolschrift, ein Schnitt nur in
 * Grossbuchstaben, eine Teilmenge aus einem fremden PDF.
 */
export const RECHNUNGSZEICHEN =
  'abcdefghijklmnopqrstuvwxyz' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'äöüÄÖÜß' +
  '0123456789' +
  ' .,;:!?-–/()[]%&+*=@€§#"\'';

/**
 * Wie gross eine hinterlegte Schriftdatei hoechstens sein darf.
 *
 * Zwei Megabyte je Schnitt. Die Datei wandert in jede erzeugte Rechnung -
 * PDF/A verlangt Einbettung, und die Teilmengenbildung von pdf-lib bleibt aus,
 * weil sie die Glyphen neu nummeriert und Buchstabensalat erzeugt. Eine
 * gewoehnliche Textschrift liegt bei 100 bis 400 Kilobyte; was deutlich
 * darueber liegt, ist eine Schrift mit Tausenden Zeichen, und die traegt jede
 * Rechnung dann mit sich herum.
 */
export const MAX_SCHRIFT_BYTES = 2 * 1024 * 1024;

/**
 * Prueft eine hinterlegte Schriftdatei.
 *
 * Wirft nicht, sondern berichtet: Beim Hinterlegen soll die Oberflaeche sagen
 * koennen, **was** nicht stimmt, statt nur abzulehnen.
 */
export function pruefeSchrift(bytes: Uint8Array): Schriftbefund {
  if (bytes.length > MAX_SCHRIFT_BYTES) {
    return {
      name: '',
      zeichen: 0,
      fehlend: '',
      mangel: 'zu-gross',
    };
  }

  let schrift;
  try {
    schrift = fontkit.create(bytes);
  } catch {
    return { name: '', zeichen: 0, fehlend: '', mangel: 'unlesbar' };
  }

  /*
   * Eine Sammlung mehrerer Schriften (TTC) oder eine Bitmapschrift bringt
   * keinen Zeichenvorrat mit, den wir lesen koennten.
   */
  const vorrat = new Set<number>(schrift.characterSet ?? []);
  if (vorrat.size === 0) {
    return { name: '', zeichen: 0, fehlend: '', mangel: 'keine-umrisse' };
  }

  const name = schrift.familyName ?? schrift.fullName ?? '';
  const fehlend = [...RECHNUNGSZEICHEN]
    .filter((zeichen) => {
      const nummer = zeichen.codePointAt(0);
      return nummer !== undefined && !vorrat.has(nummer);
    })
    .join('');

  return {
    name,
    zeichen: vorrat.size,
    fehlend,
    ...(fehlend.length > 0 ? { mangel: 'zeichen-fehlen' as const } : {}),
  };
}

/**
 * Woerter, die in einem Familiennamen den Schnitt benennen und nicht die
 * Familie.
 *
 * Getrennte Schnittdateien tragen ihn oft im Familiennamen: fontkit meldet
 * "Alexandria Light" und "Alexandria SemiBold", und die vermessene Vorlage
 * benutzt "National Light" neben "National Semibold". Wer die beiden Namen
 * roh vergleicht, weist genau die Paare ab, um die es geht.
 *
 * Lang vor kurz sortiert, damit "SemiBold" nicht als "Bold" mit Rest "Semi"
 * uebrig bleibt.
 */
const SCHNITTWOERTER = [
  'extralight',
  'ultralight',
  'semilight',
  'demilight',
  'extrabold',
  'ultrabold',
  'semibold',
  'demibold',
  'extrablack',
  'italic',
  'oblique',
  'medium',
  'regular',
  'normal',
  'light',
  'black',
  'heavy',
  'thin',
  'book',
  'bold',
  'roman',
  'text',
];

/**
 * Der Kern eines Familiennamens - ohne Schnittbezeichnung, ohne Trennzeichen.
 *
 * "National Light" und "National-SemiBold" ergeben beide "national".
 */
export function familienkern(name: string): string {
  let kern = name.toLowerCase();
  for (const wort of SCHNITTWOERTER) kern = kern.split(wort).join(' ');
  return kern.replace(/[^a-z0-9]+/g, '');
}

/**
 * Prueft beide Schnitte zusammen.
 *
 * Der fette Schnitt muss dieselbe Familie sein - sonst steht auf der Rechnung
 * eine Auszeichnung, die aus einer anderen Schrift stammt, und das sieht
 * schlimmer aus als gar keine. Verglichen wird der Familienname; er ist das
 * Einzige, was die Datei selbst darueber sagt.
 *
 * Fehlt der fette Schnitt ganz, ist das **kein** Mangel: Dann wird der magere
 * fuer beides benutzt, und die Auszeichnung geschieht ueber Farbe und Stellung.
 * Eine kuenstlich fett gerechnete Schrift waere schlechter - sie sieht auf
 * jedem Drucker anders aus.
 */
export function pruefeSchriftpaar(
  regular: Uint8Array,
  fett?: Uint8Array,
): { regular: Schriftbefund; fett?: Schriftbefund; mangel?: Schriftmangel } {
  const einer = pruefeSchrift(regular);
  if (!fett) return { regular: einer, ...(einer.mangel ? { mangel: einer.mangel } : {}) };

  const zwei = pruefeSchrift(fett);
  /*
   * Verglichen wird der Kern, nicht der volle Name: "National Light" und
   * "National Semibold" sind dieselbe Familie, und ein roher Vergleich haette
   * genau dieses Paar abgewiesen. Bleibt nach dem Abziehen der
   * Schnittbezeichnung nichts uebrig, wird nicht geurteilt - dann sagt der
   * Name nichts, und eine Ablehnung auf dieser Grundlage waere geraten.
   */
  const kernEins = familienkern(einer.name);
  const kernZwei = familienkern(zwei.name);
  const verschieden =
    !einer.mangel &&
    !zwei.mangel &&
    kernEins.length > 0 &&
    kernZwei.length > 0 &&
    kernEins !== kernZwei;

  const mangel = einer.mangel ?? zwei.mangel ?? (verschieden ? 'schnitte-verschieden' : undefined);
  return { regular: einer, fett: zwei, ...(mangel ? { mangel } : {}) };
}

/** Was dem Nutzer zu einem Mangel gesagt wird. */
export function schriftmangelText(befund: {
  regular: Schriftbefund;
  fett?: Schriftbefund;
  mangel?: Schriftmangel;
}): string | undefined {
  const fehlend = [befund.regular.fehlend, befund.fett?.fehlend ?? ''].join('');
  switch (befund.mangel) {
    case undefined:
      return undefined;
    case 'unlesbar':
      return 'Die Datei ließ sich nicht als Schrift lesen. Gebraucht wird eine TrueType- oder OpenType-Datei (.ttf oder .otf).';
    case 'zu-gross':
      return `Die Datei ist größer als ${Math.round(MAX_SCHRIFT_BYTES / 1024 / 1024)} MB. Sie steckt in jeder erzeugten Rechnung — das wären sehr große Dateien.`;
    case 'keine-umrisse':
      return 'Die Datei enthält keine lesbaren Zeichen. Schriftsammlungen (.ttc) und Bitmapschriften lassen sich nicht einbetten.';
    case 'schnitte-verschieden':
      return `Magerer und fetter Schnitt stammen aus verschiedenen Familien ("${befund.regular.name}" und "${befund.fett?.name}"). Auf der Rechnung stünde eine Auszeichnung aus einer fremden Schrift.`;
    case 'zeichen-fehlen':
      return `Der Schrift fehlen Zeichen, die auf einer Rechnung vorkommen: ${[...new Set(fehlend)].join(' ')}. Stammt die Datei aus einem PDF? Dort ist meist nur eine Teilmenge eingebettet.`;
  }
}
