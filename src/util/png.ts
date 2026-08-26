import { zlibSync } from 'fflate';

/**
 * Ein Graustufenbild als PNG schreiben.
 *
 * ## Wofuer
 *
 * Damit entschluesselte Scanseiten weitergereicht werden koennen - an die
 * Texterkennung, die ein Bildformat erwartet, und an eine Vorschau, damit ein
 * Mensch sieht, was die Erkennung zu lesen bekam. Ohne diese zweite
 * Verwendung waere ein Fehler in der Entschluesselung erst am leeren Ergebnis
 * zu erkennen, und dann weiss niemand, ob das Blatt leer war oder der Leser
 * kaputt.
 *
 * ## Warum nur Graustufen
 *
 * Weil mehr nicht gebraucht wird: Eine Faxmaske ist schwarzweiss. Farbe
 * mitzuschreiben hiesse Farbraeume behandeln, und die einzige Anforderung
 * hier ist, dass ein Bild herauskommt, das jeder oeffnen kann.
 */

/** Der Kopf jeder PNG-Datei - acht feste Bytes. */
const SIGNATUR = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABELLE = (() => {
  const tabelle = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let wert = i;
    for (let bit = 0; bit < 8; bit += 1) {
      wert = wert & 1 ? 0xed_b8_83_20 ^ (wert >>> 1) : wert >>> 1;
    }
    tabelle[i] = wert >>> 0;
  }
  return tabelle;
})();

function crc32(daten: Uint8Array): number {
  let wert = 0xff_ff_ff_ff;
  for (const byte of daten) {
    wert = (CRC_TABELLE[(wert ^ byte) & 0xff]! ^ (wert >>> 8)) >>> 0;
  }
  return (wert ^ 0xff_ff_ff_ff) >>> 0;
}

function zahl32(wert: number): Uint8Array {
  return new Uint8Array([(wert >>> 24) & 0xff, (wert >>> 16) & 0xff, (wert >>> 8) & 0xff, wert & 0xff]);
}

function abschnitt(art: string, inhalt: Uint8Array): Uint8Array {
  const kennung = new Uint8Array([...art].map((zeichen) => zeichen.charCodeAt(0)));
  const koerper = new Uint8Array(kennung.length + inhalt.length);
  koerper.set(kennung);
  koerper.set(inhalt, kennung.length);

  const ganz = new Uint8Array(4 + koerper.length + 4);
  ganz.set(zahl32(inhalt.length));
  ganz.set(koerper, 4);
  ganz.set(zahl32(crc32(koerper)), 4 + koerper.length);
  return ganz;
}

/**
 * Baut ein PNG aus einem Byte je Bildpunkt, 0 bis 255 in Grau.
 *
 * Jede Zeile bekommt ein fuehrendes Nullbyte - die Filterart "keine". PNG
 * erlaubt je Zeile eine andere Vorhersage, was Platz spart; darauf zu
 * verzichten kostet hier nichts, weil danach ohnehin komprimiert wird.
 */
export function alsGraustufenPng(breite: number, hoehe: number, grau: Uint8Array): Uint8Array {
  if (grau.length < breite * hoehe) {
    throw new Error(`Zu wenige Bildpunkte: ${grau.length} statt ${breite * hoehe}`);
  }

  const zeilen = new Uint8Array((breite + 1) * hoehe);
  for (let zeile = 0; zeile < hoehe; zeile += 1) {
    zeilen[zeile * (breite + 1)] = 0;
    zeilen.set(grau.subarray(zeile * breite, (zeile + 1) * breite), zeile * (breite + 1) + 1);
  }

  const kopf = new Uint8Array(13);
  kopf.set(zahl32(breite), 0);
  kopf.set(zahl32(hoehe), 4);
  kopf[8] = 8; // Bittiefe
  kopf[9] = 0; // Farbart: Graustufen
  kopf[10] = 0; // Kompression: Deflate
  kopf[11] = 0; // Filter: Standard
  kopf[12] = 0; // kein Zeilensprung

  const teile = [
    SIGNATUR,
    abschnitt('IHDR', kopf),
    abschnitt('IDAT', zlibSync(zeilen, { level: 6 })),
    abschnitt('IEND', new Uint8Array(0)),
  ];

  const gesamt = new Uint8Array(teile.reduce((summe, teil) => summe + teil.length, 0));
  let stelle = 0;
  for (const teil of teile) {
    gesamt.set(teil, stelle);
    stelle += teil.length;
  }
  return gesamt;
}

/** Eine Faxmaske in Graustufen: 1 bedeutet schwarz. */
export function maskeAlsGrau(punkte: Uint8Array): Uint8Array {
  const grau = new Uint8Array(punkte.length);
  for (let i = 0; i < punkte.length; i += 1) grau[i] = punkte[i] ? 0 : 255;
  return grau;
}
