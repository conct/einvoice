import { readFile } from 'node:fs/promises';
import { loadSrgbIcc } from './index';

const datei = (name: string) => new URL(`../../files/${name}`, import.meta.url);

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
    readFile(datei('Inter-Rechnung-Regular.ttf')),
    readFile(datei('Inter-Rechnung-Bold.ttf')),
  ]);
  return {
    fontRegular: new Uint8Array(fontRegular),
    fontBold: new Uint8Array(fontBold),
    iccProfile: loadSrgbIcc(),
  };
}
