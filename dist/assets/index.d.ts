/**
 * sRGB IEC61966-2.1 als ICC-Profil, eingebettet als Base64.
 *
 * PDF/A verlangt einen OutputIntent mit Farbprofil. Das Profil ist mit 3 KB
 * klein genug, um es direkt im Bundle mitzufuehren - so braucht weder die
 * native App noch der Browser einen Ladepfad fuer Binaerdateien.
 *
 * Quelle: files/sRGB-IEC61966-2.1.icc (siehe LIZENZEN.md).
 * Generiert von scripts/build-icc.mjs - nicht von Hand aendern.
 */
declare const SRGB_ICC_BASE64: string;
/** Laenge des dekodierten Profils in Bytes, zur Kontrolle beim Laden */
declare const SRGB_ICC_BYTE_LENGTH = 3144;

declare function loadSrgbIcc(): Uint8Array;
/**
 * Pfade der eingebetteten Schriftdateien.
 *
 * Das sind vorbereitete Teilmengen von Inter, keine vollstaendigen Schnitte -
 * 30 statt 334 kB je Schnitt. Erzeugt werden sie von Hand mit
 * `npm run schrift`; welche Zeichen darin
 * enthalten sind, steht in tools/schrift-erzeugen.mjs.
 */
declare const FONT_MODULES: {
    readonly regular: "@erechnung/core/files/Inter-Rechnung-Regular.ttf";
    readonly bold: "@erechnung/core/files/Inter-Rechnung-Bold.ttf";
};

export { FONT_MODULES, SRGB_ICC_BASE64, SRGB_ICC_BYTE_LENGTH, loadSrgbIcc };
