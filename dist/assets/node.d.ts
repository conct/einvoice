/**
 * Laedt Schriften und Farbprofil im Node-Prozess. Nur fuer Server und
 * Werkzeuge - die App laedt die Schriften ueber den Bundler bzw. expo-asset.
 */
declare function loadNodeAssets(): Promise<{
    fontRegular: Uint8Array;
    fontBold: Uint8Array;
    iccProfile: Uint8Array;
}>;

export { loadNodeAssets };
