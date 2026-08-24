import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { loadSrgbIcc } from './index';

const require = createRequire(import.meta.url);

/**
 * Laedt Schriften und Farbprofil im Node-Prozess. Nur fuer Server und
 * Werkzeuge - die App laedt die Schriften ueber den Bundler bzw. expo-asset.
 */
export async function loadNodeAssets(): Promise<{
  fontRegular: Uint8Array;
  fontBold: Uint8Array;
  iccProfile: Uint8Array;
}> {
  const [fontRegular, fontBold] = await Promise.all([
    readFile(require.resolve('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf')),
    readFile(require.resolve('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf')),
  ]);
  return {
    fontRegular: new Uint8Array(fontRegular),
    fontBold: new Uint8Array(fontBold),
    iccProfile: loadSrgbIcc(),
  };
}
