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

/** Pfade der Schriftdateien im Paket @expo-google-fonts/inter */
export const FONT_MODULES = {
  regular: '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
  bold: '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
} as const;
