import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  familienkern,
  MAX_SCHRIFT_BYTES,
  pruefeSchrift,
  pruefeSchriftpaar,
  schriftmangelText,
} from '../src/pdf/eigenschrift';

/**
 * Geprueft wird gegen die eigenen Schriftdateien - sie sind echte,
 * vorbereitete Teilmengen und decken genau den lateinischen Vorrat ab, den
 * eine Rechnung braucht. Eine erfundene Datei taugte hier nicht: Der ganze
 * Zweck der Pruefung ist, echte Schriftdateien zu beurteilen.
 */
const datei = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../einvoice-assets/files/${name}`, import.meta.url)));

const REGULAR = datei('Inter-Rechnung-Regular.ttf');
const FETT = datei('Inter-Rechnung-Bold.ttf');

describe('pruefeSchrift', () => {
  it('nimmt eine Schrift an, die den Rechnungsvorrat abdeckt', () => {
    const befund = pruefeSchrift(REGULAR);
    expect(befund.mangel).toBeUndefined();
    expect(befund.fehlend).toBe('');
    expect(befund.zeichen).toBeGreaterThan(300);
    expect(befund.name.length).toBeGreaterThan(0);
  });

  it('weist zurueck, was keine Schrift ist', () => {
    const befund = pruefeSchrift(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]));
    expect(befund.mangel).toBe('unlesbar');
    expect(schriftmangelText({ regular: befund, mangel: befund.mangel })).toContain('TrueType');
  });

  it('weist zurueck, was zu gross ist', () => {
    /*
     * Die Datei steckt in jeder erzeugten Rechnung - PDF/A verlangt
     * Einbettung, und die Teilmengenbildung von pdf-lib bleibt aus. Eine
     * Schrift mit Tausenden Zeichen traegt jede Rechnung dann mit sich.
     */
    const befund = pruefeSchrift(new Uint8Array(MAX_SCHRIFT_BYTES + 1));
    expect(befund.mangel).toBe('zu-gross');
  });
});

describe('pruefeSchriftpaar', () => {
  it('nimmt zwei Schnitte derselben Familie an', () => {
    expect(pruefeSchriftpaar(REGULAR, FETT).mangel).toBeUndefined();
  });

  it('kommt ohne fetten Schnitt aus', () => {
    /*
     * Kein Mangel: Dann wird der magere fuer beides benutzt. Eine kuenstlich
     * fett gerechnete Schrift waere schlechter - sie sieht auf jedem Drucker
     * anders aus.
     */
    const befund = pruefeSchriftpaar(REGULAR);
    expect(befund.mangel).toBeUndefined();
    expect(befund.fett).toBeUndefined();
  });

  it('meldet einen fehlenden Text zu jedem Mangel', () => {
    const befund = pruefeSchriftpaar(new Uint8Array([1, 2, 3, 4]), FETT);
    expect(befund.mangel).toBe('unlesbar');
    expect(schriftmangelText(befund)).toBeTruthy();
  });
});

describe('familienkern', () => {
  it('erkennt getrennte Schnittdateien als eine Familie', () => {
    /*
     * Getrennte Schnittdateien tragen den Schnitt oft im Familiennamen:
     * fontkit meldet "Alexandria Light" und "Alexandria SemiBold", und die
     * vermessene Vorlage benutzt "National Light" neben "National Semibold".
     * Ein roher Namensvergleich haette genau diese Paare abgewiesen - also
     * die, um die es ueberhaupt geht.
     */
    expect(familienkern('National Light')).toBe(familienkern('National Semibold'));
    expect(familienkern('Alexandria Light')).toBe(familienkern('Alexandria SemiBold'));
    expect(familienkern('Inter')).toBe(familienkern('Inter-Bold'));
  });

  it('haelt verschiedene Familien auseinander', () => {
    expect(familienkern('National Light')).not.toBe(familienkern('Inter Light'));
    expect(familienkern('Clash')).not.toBe(familienkern('Alexandria'));
  });

  it('zieht den laengeren Schnittnamen zuerst ab', () => {
    // Sonst bliebe von "SemiBold" nach dem Abzug von "Bold" ein "Semi" stehen,
    // und "Foo SemiBold" waere eine andere Familie als "Foo Bold".
    expect(familienkern('Foo SemiBold')).toBe('foo');
    expect(familienkern('Foo ExtraLight')).toBe('foo');
  });
});
