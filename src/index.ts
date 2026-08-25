export { SRGB_ICC_BASE64, SRGB_ICC_BYTE_LENGTH } from './icc';

import { SRGB_ICC_BASE64, SRGB_ICC_BYTE_LENGTH } from './icc';
import { fromBase64 } from '@erechnung/core';

/**
 * Dekodiert das sRGB-Profil. Das Ergebnis wird gecached, weil der Renderer es
 * bei jeder Rechnung erneut anfordert.
 */
let cached: Uint8Array | undefined;
export function loadSrgbIcc(): Uint8Array {
  if (!cached) {
    cached = fromBase64(SRGB_ICC_BASE64);
    if (cached.length !== SRGB_ICC_BYTE_LENGTH) {
      throw new Error(
        `ICC-Profil beschaedigt: ${cached.length} statt ${SRGB_ICC_BYTE_LENGTH} Bytes`,
      );
    }
  }
  return cached;
}

/**
 * Pfade der eingebetteten Schriftdateien.
 *
 * Das sind vorbereitete Teilmengen von Inter, keine vollstaendigen Schnitte -
 * 30 statt 334 kB je Schnitt. Erzeugt werden sie von Hand mit
 * `npm run schrift --workspace @erechnung/assets`; welche Zeichen darin
 * enthalten sind, steht in tools/schrift-erzeugen.mjs.
 */
export const FONT_MODULES = {
  regular: '@erechnung/assets/files/Inter-Rechnung-Regular.ttf',
  bold: '@erechnung/assets/files/Inter-Rechnung-Bold.ttf',
} as const;
