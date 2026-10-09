import { rgb } from 'pdf-lib';

import { DEFAULT_THEME, type Theme } from './layout';
import type { Farbe } from './briefpapier-typen';

/**
 * Gestaltung der Rechnung, soweit sie sich gefahrlos einstellen laesst.
 *
 * Bewusst nur die Akzentfarbe und nicht das ganze Farbschema: Text, Grauton,
 * Linien und Zebrastreifen sind aufeinander abgestimmte Neutraltoene, die mit
 * jedem Akzent funktionieren. Wer sie einzeln einstellen darf, baut sich
 * frueher oder later eine Rechnung, die niemand lesen kann - und der
 * Empfaenger muss sie lesen koennen, das ist der Zweck des Dokuments.
 *
 * Die Anordnung bleibt ebenfalls fest. Das Anschriftenfeld sitzt 45 mm von
 * oben, damit es im Fensterumschlag steht (DIN 5008); wer daran rueckt,
 * verliert die Kuvert-Tauglichkeit, ohne es zu merken.
 */

/** Wandelt "#0f4c81" oder "0f4c81" in eine Farbe. Ungueltiges ergibt undefined. */
export function farbeAusHex(hex: string): ReturnType<typeof rgb> | undefined {
  const sauber = hex.trim().replace(/^#/, '');

  const voll =
    sauber.length === 3
      ? sauber
          .split('')
          .map((z) => z + z)
          .join('')
      : sauber;

  if (!/^[0-9a-fA-F]{6}$/.test(voll)) return undefined;

  const wert = parseInt(voll, 16);
  return rgb(((wert >> 16) & 0xff) / 255, ((wert >> 8) & 0xff) / 255, (wert & 0xff) / 255);
}

/**
 * Baut das Farbschema aus einer Akzentfarbe.
 *
 * Ist die Angabe unbrauchbar, kommt das Standardschema zurueck - eine
 * unleserliche Rechnung waere der schlechtere Ausgang als eine, die nicht ganz
 * nach Hausfarbe aussieht.
 */
export function themaMitAkzent(hex: string | undefined): Theme {
  if (!hex) return DEFAULT_THEME;
  const akzent = farbeAusHex(hex);
  return akzent ? { ...DEFAULT_THEME, accent: akzent } : DEFAULT_THEME;
}

/**
 * Prueft, ob die Bytes ein PNG sind.
 *
 * pdf-lib bettet nur PNG und JPEG ein, und PDF/A verlangt einen definierten
 * Farbraum - der OutputIntent des Dokuments ist sRGB. Ein Logo aus einer
 * Druckvorlage liegt haeufig in CMYK vor; das waere kein gueltiges PDF/A mehr.
 * Deshalb wird hier abgewiesen, was nicht sicher passt, statt es einzubetten
 * und die Konformitaet stillschweigend zu verlieren.
 */
export function istPng(bytes: Uint8Array): boolean {
  const kennung = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < kennung.length) return false;
  return kennung.every((byte, i) => bytes[i] === byte);
}

/**
 * Farbtyp eines PNG aus dem IHDR-Block.
 *
 * 0 = Graustufen, 2 = RGB, 3 = Palette, 4 = Graustufen mit Alpha, 6 = RGBA.
 * Alle davon sind RGB-basiert und damit fuer den sRGB-OutputIntent
 * unbedenklich; CMYK kennt PNG gar nicht. Die Pruefung dient dazu, eine
 * beschaedigte Datei frueh zu erkennen.
 */
export function pngFarbtyp(bytes: Uint8Array): number | undefined {
  // Signatur (8) + Laenge (4) + "IHDR" (4) + Breite (4) + Hoehe (4) + Tiefe (1)
  const stelle = 8 + 4 + 4 + 4 + 4 + 1;
  if (bytes.length <= stelle) return undefined;
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return undefined;
  return bytes[stelle];
}

/**
 * Eine gelesene Farbe als Hexzeichenfolge, etwa "#0F4C81".
 *
 * Stand bis v3.0.0 beim Vorlagenleser. Geblieben ist sie, weil das Zeichnen
 * eines uebernommenen Bogens sie braucht: Das SVG-Vorschaubild schreibt die
 * Farben als Text.
 */
export function alsHex(farbe: Farbe): string {
  const teil = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${teil(farbe.r)}${teil(farbe.g)}${teil(farbe.b)}`;
}
