import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

import { EInvoiceError } from './error';

/**
 * Ein Word-Dokument aufschluesseln.
 *
 * Wozu: Die Zielgruppe schreibt ihre Rechnungen heute in Word - das ist die
 * Ausgangslage, von der docs/monetarisierung.md ausgeht. Wer umsteigen soll,
 * darf nicht alles abtippen muessen. Der Empfang kennt bereits den Fall
 * "PDF ohne eingebettetes XML" und weist ihn ab; hier entsteht die Grundlage,
 * daraus statt einer Absage ein Angebot zu machen.
 *
 * **Was diese Datei tut und was nicht.** Sie holt heraus, was im Dokument
 * steht: Absaetze und Tabellen, in der Reihenfolge des Dokuments. Sie deutet
 * **nichts**. Welche Zahl die Rechnungsnummer ist und welche Spalte die Menge
 * enthaelt, entscheidet nicht dieser Code - eine falsch geratene Zahl ergaebe
 * eine falsche Rechnung, und das ist der eine Fehler, den dieses Produkt nicht
 * haben darf.
 *
 * Warum ausgerechnet Word und nicht das gewohnte PDF: Eine .docx ist ein ZIP
 * mit XML darin, und beides ist ohnehin an Bord. Ein PDF hat keinen Text,
 * sondern Zeichenanweisungen - Textextraktion hiesse Inhaltsstroeme parsen und
 * Zeichenkodierungen aufloesen. Dieses Projekt weiss, wie unangenehm das ist;
 * es erzeugt selbst Schriftteilmengen.
 */

export interface WordAbsatz {
  art: 'absatz';
  text: string;
}

export interface WordTabelle {
  art: 'tabelle';
  /** Zeilen mit Zellen, jede Zelle als reiner Text. */
  zeilen: string[][];
}

export type WordBlock = WordAbsatz | WordTabelle;

export interface WordDokument {
  /** Absaetze und Tabellen in der Reihenfolge des Dokuments. */
  bloecke: WordBlock[];
  /** Alle Absaetze aneinandergehaengt - fuer eine schnelle Suche. */
  text: string;
  /** Nur die Tabellen, weil dort die Positionen stehen. */
  tabellen: WordTabelle[];
}

/**
 * Nur mit `preserveOrder`: Absaetze und Tabellen sind Geschwister unter
 * `w:body`, und ihre Reihenfolge ist die Information. Ohne die Einstellung
 * wuerde der Parser sie in zwei Listen sortieren, und man wuesste nicht mehr,
 * welche Tabelle zu welcher Ueberschrift gehoert.
 *
 * `trimValues: false`, weil Word Leerzeichen mit `xml:space="preserve"`
 * transportiert - "Rechnung " und "Nr. 4" ergeben sonst "RechnungNr. 4".
 */
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
});

/** Ein Knoten in der geordneten Darstellung: genau ein Tag, dazu seine Kinder. */
type Knoten = Record<string, unknown>;

function kinder(knoten: Knoten, name: string): Knoten[] {
  const wert = knoten[name];
  return Array.isArray(wert) ? (wert as Knoten[]) : [];
}

function nameVon(knoten: Knoten): string | undefined {
  // ":@" traegt die Attribute und ist kein Tag.
  return Object.keys(knoten).find((schluessel) => schluessel !== ':@');
}

/**
 * Sammelt den sichtbaren Text eines Teilbaums.
 *
 * Gezaehlt wird nur, was in `w:t` steht - `#text` kommt in einer .docx auch an
 * Stellen vor, die niemand sieht. `w:tab` und `w:br` werden mitgenommen, weil
 * sie in Tabellenzellen und Anschriften den Unterschied zwischen zwei Werten
 * und einem ausmachen.
 */
function textAus(knoten: Knoten[]): string {
  let gesammelt = '';

  for (const eintrag of knoten) {
    const name = nameVon(eintrag);
    if (!name) continue;

    if (name === 'w:t') {
      for (const stueck of kinder(eintrag, 'w:t')) {
        const inhalt = stueck['#text'];
        if (typeof inhalt === 'string') gesammelt += inhalt;
      }
      continue;
    }
    if (name === 'w:tab') {
      gesammelt += '\t';
      continue;
    }
    if (name === 'w:br' || name === 'w:cr') {
      gesammelt += '\n';
      continue;
    }
    // Alles andere wird durchschritten: w:r, w:hyperlink, w:smartTag und was
    // Word sonst um den Text herum legt.
    gesammelt += textAus(kinder(eintrag, name));
  }

  return gesammelt;
}

function tabelleAus(tbl: Knoten[]): WordTabelle {
  const zeilen: string[][] = [];

  for (const eintrag of tbl) {
    if (nameVon(eintrag) !== 'w:tr') continue;
    const zellen: string[] = [];

    for (const zelle of kinder(eintrag, 'w:tr')) {
      if (nameVon(zelle) !== 'w:tc') continue;
      // Eine Zelle enthaelt Absaetze; deren Text wird mit Zeilenumbruch
      // verbunden, damit mehrzeilige Zellen nicht zusammenkleben.
      const absaetze = kinder(zelle, 'w:tc')
        .filter((teil) => nameVon(teil) === 'w:p')
        .map((teil) => textAus(kinder(teil, 'w:p')).trim());
      zellen.push(absaetze.filter(Boolean).join('\n'));
    }

    if (zellen.length > 0) zeilen.push(zellen);
  }

  return { art: 'tabelle', zeilen };
}

/** Findet den Rumpf, unabhaengig davon, was Word oben herum gepackt hat. */
function bodyAus(baum: Knoten[]): Knoten[] | undefined {
  for (const eintrag of baum) {
    const name = nameVon(eintrag);
    if (!name) continue;
    if (name === 'w:body') return kinder(eintrag, 'w:body');
    const tiefer = bodyAus(kinder(eintrag, name));
    if (tiefer) return tiefer;
  }
  return undefined;
}

/**
 * Liest eine .docx und gibt zurueck, was darin steht.
 *
 * Wirft mit einer Meldung, die dem Nutzer etwas sagt - eine .doc aus Word 97
 * oder eine falsch benannte Datei sind der haeufigste Fall, und "unexpected
 * end of data" hilft niemandem.
 */
function beginntMit(bytes: Uint8Array, muster: number[]): boolean {
  return muster.every((byte, stelle) => bytes[stelle] === byte);
}

/**
 * Sagt, was fuer eine Datei das ist - bevor der Entpacker daran scheitert.
 *
 * Ohne diese Pruefung bekam jede Datei, die kein ZIP ist, denselben Hinweis
 * auf das alte .doc-Format. Wer versehentlich ein PDF waehlt, liest dann eine
 * Erklaerung ueber Word 97 und sucht den Fehler an der falschen Stelle.
 */
function erklaereFremdformat(bytes: Uint8Array): string | undefined {
  // OLE2-Verbunddokument: .doc, aber auch .xls und .ppt aus derselben Zeit.
  if (beginntMit(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return (
      'Das ist eine Datei im alten .doc-Format aus Word 97 bis 2003. Sie laesst sich hier nicht ' +
      'lesen - dort gibt es Tabellen nicht als eigene Struktur, sondern nur als markierte ' +
      'Absaetze. In Word: "Speichern unter" und .docx waehlen, dann geht es.'
    );
  }
  if (beginntMit(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return 'Das ist ein PDF. Hier wird eine Word-Datei erwartet - eine .docx.';
  }
  if (beginntMit(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66])) {
    return 'Das ist eine RTF-Datei. In Word: "Speichern unter" und .docx waehlen.';
  }
  // ZIP - dann liegt es nicht am Dateityp, sondern am Inhalt.
  if (beginntMit(bytes, [0x50, 0x4b])) return undefined;
  return 'Diese Datei ist keine Word-Datei. Erwartet wird eine .docx.';
}

export function liesWordDokument(bytes: Uint8Array): WordDokument {
  const fremd = erklaereFremdformat(bytes);
  if (fremd) throw new EInvoiceError(fremd, 'unknown-format');

  let dateien: Record<string, Uint8Array>;
  try {
    dateien = unzipSync(bytes);
  } catch {
    throw new EInvoiceError(
      'Diese Datei ist beschaedigt und laesst sich nicht entpacken.',
      'unknown-format',
    );
  }

  const dokument = dateien['word/document.xml'];
  if (!dokument) {
    throw new EInvoiceError(
      'Die Datei ist zwar ein Archiv, enthaelt aber kein Word-Dokument.',
      'unknown-format',
    );
  }

  const baum = parser.parse(new TextDecoder().decode(dokument)) as Knoten[];
  const body = bodyAus(baum);
  if (!body) {
    throw new EInvoiceError('Das Word-Dokument hat keinen lesbaren Inhalt.', 'unknown-format');
  }

  const bloecke: WordBlock[] = [];
  for (const eintrag of body) {
    const name = nameVon(eintrag);
    if (name === 'w:p') {
      const text = textAus(kinder(eintrag, 'w:p')).trim();
      // Leere Absaetze sind Abstandshalter und tragen nichts bei.
      if (text) bloecke.push({ art: 'absatz', text });
      continue;
    }
    if (name === 'w:tbl') {
      const tabelle = tabelleAus(kinder(eintrag, 'w:tbl'));
      if (tabelle.zeilen.length > 0) bloecke.push(tabelle);
    }
  }

  return {
    bloecke,
    text: bloecke
      .filter((block): block is WordAbsatz => block.art === 'absatz')
      .map((block) => block.text)
      .join('\n'),
    tabellen: bloecke.filter((block): block is WordTabelle => block.art === 'tabelle'),
  };
}
