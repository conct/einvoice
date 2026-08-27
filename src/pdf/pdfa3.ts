import {
  AFRelationship,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import type { Invoice } from '../model/invoice';
import { computeTotals, type InvoiceTotals } from '../model/totals';
import { buildCii } from '../xml/cii';
import { utf8Encode } from '../util/base64';
import { formatDate } from '../util/date';
import { formatAmount } from '../util/money';
import type { Briefpapier } from '../parse/pdf-gestaltung';
import { zeichneBriefpapier } from './briefpapier';
import type { Beschriftungen } from './beschriftungen';
import { bankverbindungImBogen } from '../absender/zahlungsklausel';
import { themaMitAkzent } from './gestaltung';
import { A4, DEFAULT_THEME, drawInvoice, type Kennzahlenstellung, type Theme } from './layout';
import { bereiteVorlagenschrift } from './vorlagenschrift';
import { buildXmp, xmpDate, type FacturXConformanceLevel } from './xmp';
import { Zeichenpruefung, mitZeichenpruefung } from './zeichenvorrat';

/**
 * Binaerdaten, die der Renderer nicht selbst beschaffen kann. Die
 * Kernbibliothek kennt weder Dateisystem noch Bundler - Schriften und
 * Farbprofil liefert die aufrufende Plattform.
 */
export interface RenderAssets {
  /** TrueType- oder OpenType-Datei fuer den Fliesstext */
  fontRegular: Uint8Array;
  /** Fette Schnitt derselben Familie */
  fontBold: Uint8Array;
  /**
   * ICC-Profil fuer den OutputIntent. PDF/A verlangt einen definierten
   * Farbraum; ohne dieses Profil ist die Datei kein gueltiges PDF/A.
   */
  iccProfile: Uint8Array;
  /** Optionales Logo als PNG */
  logoPng?: Uint8Array;
}

export interface RenderOptions {
  assets: RenderAssets;
  /** Erzeugungszeitpunkt, explizit fuer reproduzierbare Ausgaben */
  now?: Date;
  producer?: string;
  creatorTool?: string;
  /** Profil, das im XMP als ConformanceLevel steht */
  conformanceLevel?: FacturXConformanceLevel;
  /** PDF/A-Konformitaetsstufe. U setzt vollstaendige Unicode-Zuordnung voraus. */
  pdfaConformance?: 'B' | 'U';
  /** Dateiname der eingebetteten Rechnung, ZUGFeRD 2.x erwartet factur-x.xml */
  attachmentName?: string;
  theme?: Theme;
  footerNote?: string;
  /**
   * Nur die tatsaechlich benutzten Zeichen einbetten. Bleibt aus.
   *
   * Die Teilmengenbildung von pdf-lib nummeriert die Glyphen neu, laesst die
   * Textbefehle aber auf den alten Nummern stehen - das Dokument besteht jede
   * Strukturpruefung und zeigt beim Oeffnen Buchstabensalat. Klein wird die
   * Datei stattdessen ueber eine vorbereitete Schrift, siehe
   * packages/einvoice-assets/tools/schrift-erzeugen.mjs.
   *
   * Bleibt als Schalter erhalten, weil der Vergleich beider Wege der einzige
   * Weg ist, den Fehler vorzufuehren: npm run schriftprobe --workspace
   * @erechnung/validate
   */
  subsetFonts?: boolean;
  /**
   * Ein uebernommener Briefbogen, der unter jeder Seite liegt.
   *
   * Ist einer gesetzt, entfaellt der eigene Briefkopf - der Bogen bringt Logo,
   * Absenderzeilen und Rueckabsender bereits mit.
   */
  briefpapier?: Briefpapier;
  /**
   * Die Bytes der Vorlage, aus der der Bogen gelesen wurde.
   *
   * Nur noetig, wenn der Briefkopftext in der **Originalschrift** stehen soll.
   * Ohne sie wird er mit der Hausschrift nachgezeichnet und auf das gemessene
   * Sollmass eingepasst. Das ist der Normalfall: Eine fremde Schriftlizenz
   * deckt die Uebernahme nicht, das muss ein Mensch entscheiden.
   */
  briefpapierVorlage?: Uint8Array;
  /**
   * Das Zahlungsziel steht schon im Briefbogen - im Rumpf weglassen.
   *
   * Nur die Anzeige; im XML bleibt die Angabe stehen, BR-CO-25 verlangt sie.
   */
  zahlungszielImBriefpapier?: boolean;
  /**
   * Eigene Beschriftungen, soweit sie vom Standard abweichen.
   *
   * "Rechnungs-Nr." statt "Rechnungsnummer" etwa. Unbrauchbares wird durch die
   * Vorgabe ersetzt, nicht uebernommen - eine leere Beschriftung liesse einen
   * Wert ohne Erklaerung stehen.
   */
  beschriftungen?: Partial<Beschriftungen>;
  /** Wo der Kennzahlenblock steht - siehe `Kennzahlenstellung`. */
  kennzahlen?: Kennzahlenstellung;
  /**
   * Bloecke und Angaben, die eine Vorlage nicht braucht.
   *
   * Was hier ausgeschaltet wird, steht weiterhin im XML - maschinell gelesen
   * fehlt nichts. Der Zahlungsblock macht davon eine Ausnahme: Er wird nur
   * dann von selbst weggelassen, wenn die Bankverbindung im Briefbogen steht.
   */
  tabellenkopf?: boolean;
  kennzahlenfelder?: (keyof Beschriftungen)[];
  /** Beschriftung und Wert nebeneinander, wie es die Vorlage haelt. */
  kennzahlenInline?: boolean;
  /** Welche Kennzahlen fett gesetzt werden - die Vorlage betont nicht alle. */
  kennzahlenFett?: (keyof Beschriftungen)[];
  /** Positionsnummern zeigen. Aus, wenn die Vorlage nicht nummeriert. */
  positionsnummern?: boolean;
  /** Datum ohne fuehrende Nullen. */
  datumOhneNullen?: boolean;
  steuergrundlage?: boolean;
  zahlungsblock?: boolean;
  hinweise?: boolean;
  /** Fertiges CII-XML verwenden, statt es neu zu erzeugen */
  xml?: string;
  totals?: InvoiceTotals;
}

export interface RenderResult {
  pdf: Uint8Array;
  xml: string;
  totals: InvoiceTotals;
}

/**
 * Abstand zwischen der Grenze des Bogens und unserer ersten Anschriftenzeile.
 *
 * `grenze` markiert die **Oberkante** des Anschriftenfeldes im Bogen, unsere
 * Angabe dagegen die **Grundlinie** der ersten Zeile. Ohne diesen Versatz
 * klebte "Stadtwerke Buchholz AoeR" an der Rueckabsenderzeile darueber - eine
 * Zeilenhoehe zu hoch.
 */
const ANSCHRIFT_LUFT = 11;

/**
 * Wo auf einer Folgeseite Inhalt beginnen darf.
 *
 * Unter dem untersten Teil des Briefkopfs, nicht unter dem Anschriftenfeld:
 * Zum Bogen gehoert auch die Trennlinie darunter, und die lief sonst mitten
 * durch den Zahlungsblock der zweiten Seite. Gesucht wird deshalb das tiefste
 * Element in der oberen Blatthaelfte.
 */
function folgeseitenanfang(bogen: Briefpapier, versatz: { x: number; y: number }): number {
  const mitte = A4.height / 2;

  /*
   * Falz- und Lochmarke stehen im linken Rand und liegen nie im Weg. Sie
   * mitzuzaehlen druckte den Anfang der Folgeseite auf halbe Blatthoehe -
   * eine halbe Seite verschenkt fuer zwei Striche von drei Millimetern.
   */
  const imWeg = (x2: number) => x2 + versatz.x > (bogen.inhaltLinks ?? 0) + versatz.x;

  let tiefstes = Number.POSITIVE_INFINITY;
  for (const pfad of bogen.pfade) {
    const y = pfad.rahmen.y1 + versatz.y;
    if (y > mitte && y < tiefstes && imWeg(pfad.rahmen.x2)) tiefstes = y;
  }
  for (const text of bogen.texte) {
    const y = text.y + versatz.y;
    if (y > mitte && y < tiefstes && imWeg(text.x + text.breite)) tiefstes = y;
  }

  return Number.isFinite(tiefstes) ? tiefstes - FOLGESEITE_LUFT : A4.height * 0.85;
}

/** Abstand zwischen dem Inhalt und der Fusszeile des Bogens. */
const FUSSLUFT = 18;

/** Abstand zwischen dem untersten Briefkopfteil und dem Inhalt der Folgeseite. */
const FOLGESEITE_LUFT = 16;

const DEFAULT_PRODUCER = 'erechnung-core (pdf-lib)';

/**
 * Erzeugt ein ZUGFeRD-2.3-PDF: ein PDF/A-3b mit eingebetteter CII-Rechnung.
 *
 * Die vier Bestandteile, die ein normales PDF von einem ZUGFeRD-PDF trennen:
 *  1. eingebettete Schriften und ein OutputIntent mit ICC-Profil (PDF/A),
 *  2. die XML-Rechnung als Anhang mit AFRelationship "Alternative",
 *  3. ein XMP-Paket mit pdfaid- und Factur-X-Kennzeichnung,
 *  4. ein Info-Dictionary, das exakt zum XMP passt.
 */
export async function renderZugferdPdf(
  invoice: Invoice,
  options: RenderOptions,
): Promise<RenderResult> {
  const now = options.now ?? new Date();
  const totals = options.totals ?? computeTotals(invoice);
  const xml = options.xml ?? buildCii(invoice, { totals });
  const attachmentName = options.attachmentName ?? 'factur-x.xml';
  const producer = options.producer ?? DEFAULT_PRODUCER;
  const creatorTool = options.creatorTool ?? producer;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // Nur eingebettete Schriften sind PDF/A-konform. Standard-14-Schriften
  // waeren kleiner, aber die Datei waere damit ungueltig.
  const subset = options.subsetFonts ?? false;
  const regular = await doc.embedFont(options.assets.fontRegular, { subset });
  const bold = await doc.embedFont(options.assets.fontBold, { subset });
  const logo = options.assets.logoPng ? await doc.embedPng(options.assets.logoPng) : undefined;

  // Die eingebettete Schrift deckt nur das lateinische Schriftsystem ab. Ein
  // Zeichen ausserhalb davon wuerde nicht falsch, sondern gar nicht erscheinen
  // - deshalb faengt die Pruefung jeden Text ab, der ins Dokument geht.
  const pruefung = new Zeichenpruefung([options.assets.fontRegular, options.assets.fontBold]);

  /*
   * Eine Druckvorlage ist oft groesser als A4, weil sie einen Beschnittrand
   * traegt - die vermessene Fremdrechnung misst 214 x 301 mm. Der Rand liegt
   * ringsum gleich, also fuehrt die halbe Differenz den Bogen massgenau auf
   * A4. Skalieren waere schlechter: Es verkleinerte die Schrift, und der Bogen
   * saesse danach trotzdem nicht am Falz.
   */
  const bogen = options.briefpapier;
  const versatz = bogen
    ? {
        x: (A4.width - bogen.seite.breite) / 2,
        y: (A4.height - bogen.seite.hoehe) / 2,
      }
    : { x: 0, y: 0 };

  const setzer =
    bogen && options.briefpapierVorlage
      ? await bereiteVorlagenschrift(doc, bogen, options.briefpapierVorlage)
      : undefined;

  const addPage = (): PDFPage => {
    const seite = mitZeichenpruefung(doc.addPage([A4.width, A4.height]), pruefung);
    if (!bogen) return seite;

    /*
     * Beim Anlegen der Seite, nicht am Ende: So liegt der Bogen unter dem
     * Inhalt - und auf jedem Blatt, denn ein Briefbogen hoert nach Seite eins
     * nicht auf.
     */
    zeichneBriefpapier(seite, setzer ? { ...bogen, texte: [] } : bogen, regular, versatz);
    setzer?.setze(seite, bogen, versatz);
    return seite;
  };

  /*
   * Mit Briefbogen bestimmt der Bogen drei Dinge, die sonst wir bestimmen.
   * Alle drei erst gerendert aufgefallen, keines von einer Pruefung gemeldet.
   */
  /*
   * Die Hausfarbe des Bogens ist die Farbe seines Firmenzeichens, nicht die
   * seines Rechnungskoerpers. Sie als gefuelltes Tabellenband einzusetzen
   * erfindet eine Gestaltung, die die Vorlage nie hatte - gerendert
   * nachgemessen war das ein rotes Band auf einer Rechnung, die in der ganzen
   * Vorlage keine einzige gefuellte Flaeche kennt.
   *
   * Deshalb: Setzt die Vorlage in ihrem Inhalt keine Flaechen, bleibt es
   * schlicht - und die Hausfarbe bleibt ganz auf dem Bogen, wo sie herkommt.
   */
  const schlicht = Boolean(bogen) && bogen!.inhaltFuellungen === 0;

  /*
   * Und setzt die Vorlage keine Ueberschrift, setzen wir auch keine. Ein
   * Viertel Unterschied zum Fliesstext genuegt als Nachweis - darunter ist es
   * eine fette Zeile, keine Ueberschrift.
   */
  const ohneTitel =
    Boolean(bogen) &&
    bogen!.inhaltSchrift.median > 0 &&
    bogen!.inhaltSchrift.groesste <= bogen!.inhaltSchrift.median * 1.25;
  const grundthema =
    options.theme ?? (bogen?.akzent ? themaMitAkzent(bogen.akzent) : DEFAULT_THEME);

  /*
   * Bleibt es schlicht, gehoert die Hausfarbe auch nicht in die Summenlinien.
   * Die vermessene Vorlage setzt in ihrem Inhalt nur Schwarz und siebzig
   * Prozent Grau; das Rot kommt genau einmal vor, im Firmenzeichen. Dort
   * gehoert es hin - und nur dorthin.
   */
  const thema =
    schlicht && !options.theme ? { ...grundthema, accent: grundthema.text } : grundthema;

  drawInvoice(addPage, invoice, totals, {
    fonts: { regular, bold },
    theme: thema,
    logo,
    footerNote: options.footerNote,
    eigenerBriefbogen: Boolean(bogen),
    // Bringt der Bogen eine Fusszeile mit, entfaellt unsere - sonst stehen
    // zwei uebereinander.
    ...(bogen && bogen.fussgrenze > 0
      ? {
          eigeneFusszeile: false,
          // Ohne eigene Fusszeile darf der Inhalt bis kurz ueber die des
          // Bogens reichen - der Platz dazwischen gehoert niemandem.
          inhaltUnten: bogen.fussgrenze + versatz.y + FUSSLUFT,
        }
      : {}),
    /*
     * Und das Anschriftenfeld beginnt dort, wo der Bogen es vorsieht: `grenze`
     * markiert genau die Kante unter seiner Rueckabsenderzeile. Ohne das lag
     * die Empfaengeranschrift auf ihr.
     */
    ...(bogen ? { anschriftOben: bogen.grenze + versatz.y - ANSCHRIFT_LUFT } : {}),
    ...(schlicht ? { schlichteTabelle: true } : {}),
    ...(ohneTitel ? { ohneTitel: true } : {}),
    /*
     * Und der Satzspiegel des Bogens. Ohne ihn stand unser Inhalt fuenf
     * Millimeter links neben seiner Rueckabsenderzeile und zehn Millimeter
     * innerhalb seiner Trennlinien - nichts fluchtete.
     */
    ...(bogen?.satzspiegel
      ? {
          satzspiegel: {
            links: bogen.satzspiegel.links + versatz.x,
            rechts: bogen.satzspiegel.rechts + versatz.x,
          },
        }
      : {}),
    /*
     * Und die Einrueckung des Inhalts, falls die Vorlage eine hat. Getrennt
     * vom Satzspiegel: Das Anschriftenfeld bleibt an der linken Kante, sonst
     * verlaesst es das Fenster des Umschlags.
     */
    ...(bogen?.inhaltLinks !== undefined ? { inhaltLinks: bogen.inhaltLinks + versatz.x } : {}),
    ...(bogen ? { folgeseiteOben: folgeseitenanfang(bogen, versatz) } : {}),
    /*
     * Das Waehrungswort nur, wenn es zur Waehrung der Rechnung passt. "Euro"
     * unter Betraegen in Franken waere schlimmer als der ISO-Kode.
     */
    ...(bogen?.waehrungswort && invoice.currency === 'EUR'
      ? { waehrungswort: bogen.waehrungswort }
      : {}),
    ...(options.beschriftungen ? { beschriftungen: options.beschriftungen } : {}),
    ...(options.kennzahlen ? { kennzahlen: options.kennzahlen } : {}),
    ...(options.tabellenkopf !== undefined ? { tabellenkopf: options.tabellenkopf } : {}),
    ...(options.kennzahlenfelder ? { kennzahlenfelder: options.kennzahlenfelder } : {}),
    ...(options.kennzahlenInline !== undefined
      ? { kennzahlenInline: options.kennzahlenInline }
      : {}),
    ...(options.kennzahlenFett ? { kennzahlenFett: options.kennzahlenFett } : {}),
    ...(options.positionsnummern !== undefined
      ? { positionsnummern: options.positionsnummern }
      : {}),
    /*
     * Die Strichstaerken des Summenblocks kommen aus der Vorlage: Sie zieht
     * 0,25 pt unter den gewoehnlichen Zeilen und 1,00 pt unter der Endsumme.
     */
    ...(bogen?.inhaltStriche ? { striche: bogen.inhaltStriche } : {}),
    ...(options.datumOhneNullen !== undefined ? { datumOhneNullen: options.datumOhneNullen } : {}),
    ...(options.steuergrundlage !== undefined ? { steuergrundlage: options.steuergrundlage } : {}),
    ...(options.hinweise !== undefined ? { hinweise: options.hinweise } : {}),
    /*
     * Der Zahlungsblock entfaellt, wenn die Bankverbindung schon im Bogen
     * steht - sonst nicht. Er ist der einzige dieser Bloecke, dessen Inhalt
     * nirgends sonst auf dem Blatt stehen koennte, und eine Rechnung ohne
     * Kontoangabe waere fuer den Empfaenger nicht zu bezahlen.
     */
    zahlungsblock: options.zahlungsblock ?? (bogen ? !bankverbindungImBogen(bogen) : true),
    zahlungszielImBriefpapier: options.zahlungszielImBriefpapier,
  });
  pruefung.wirfBeiLuecken();

  const title = `Rechnung ${invoice.number}`;
  const subject =
    `Rechnung ${invoice.number} vom ${formatDate(invoice.issueDate)} ueber ` +
    `${formatAmount(totals.grandTotal, invoice.currency)}`;

  doc.setTitle(title);
  doc.setAuthor(invoice.seller.name);
  doc.setSubject(subject);
  doc.setKeywords([invoice.number, 'ZUGFeRD', 'Factur-X', 'E-Rechnung']);
  doc.setProducer(producer);
  doc.setCreator(creatorTool);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  doc.setLanguage('de-DE');

  // Die XML-Rechnung ist die fuehrende Darstellung, deshalb "Alternative".
  await doc.attach(utf8Encode(xml), attachmentName, {
    mimeType: 'text/xml',
    description: 'Rechnungsdaten im ZUGFeRD-Format (UN/CEFACT CII)',
    creationDate: now,
    modificationDate: now,
    afRelationship: AFRelationship.Alternative,
  });

  for (const attachment of invoice.attachments) {
    if (!attachment.data) continue;
    await doc.attach(attachment.data, attachment.filename ?? `${attachment.id}.bin`, {
      mimeType: attachment.mimeType ?? 'application/octet-stream',
      description: attachment.description ?? attachment.id,
      creationDate: now,
      modificationDate: now,
      afRelationship: AFRelationship.Supplement,
    });
  }

  addOutputIntent(doc, options.assets.iccProfile);
  addXmpMetadata(doc, {
    title,
    author: invoice.seller.name,
    subject,
    keywords: `${invoice.number}, ZUGFeRD, Factur-X, E-Rechnung`,
    creatorTool,
    producer,
    createDate: xmpDate(now),
    modifyDate: xmpDate(now),
    pdfaConformance: options.pdfaConformance ?? 'B',
    documentFileName: attachmentName,
    conformanceLevel: options.conformanceLevel ?? 'EN 16931',
  });
  ensureFileIdentifier(doc, `${invoice.number}|${invoice.issueDate}|${now.getTime()}`);

  // Klassische Querverweistabelle statt Objektstroeme: PDF/A-3 erlaubt beides,
  // aeltere Pruefwerkzeuge kommen mit der klassischen Form zuverlaessiger klar.
  const pdf = await doc.save({ useObjectStreams: false });
  return { pdf, xml, totals };
}

/**
 * Haengt den OutputIntent mit ICC-Profil an. Der Schluessel GTS_PDFA1 ist trotz
 * der "1" auch fuer PDF/A-3 der vorgeschriebene Wert.
 */
function addOutputIntent(doc: PDFDocument, iccProfile: Uint8Array): void {
  const profileStream = doc.context.flateStream(iccProfile, {
    N: 3,
    Alternate: 'DeviceRGB',
  });
  const profileRef = doc.context.register(profileStream);

  const outputIntent = doc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB'),
    OutputCondition: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: profileRef,
  });

  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([outputIntent]));
}

/** Schreibt das XMP-Paket unkomprimiert in den Katalog. */
function addXmpMetadata(doc: PDFDocument, options: Parameters<typeof buildXmp>[0]): void {
  const xmp = buildXmp(options);
  const stream = doc.context.stream(utf8Encode(xmp), {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
}

/**
 * PDF/A verlangt eine Datei-Kennung im Trailer. pdf-lib setzt sie nicht von
 * selbst, deshalb wird sie hier aus stabilen Rechnungsmerkmalen abgeleitet.
 */
function ensureFileIdentifier(doc: PDFDocument, seed: string): void {
  const id = PDFHexString.of(hash128(seed));
  doc.context.trailerInfo.ID = doc.context.obj([id, id]);
}

/** FNV-1a in vier Durchgaengen, ergibt 32 Hexzeichen ohne Krypto-Abhaengigkeit. */
function hash128(seed: string): string {
  let out = '';
  for (let round = 0; round < 4; round++) {
    let hash = 0x811c9dc5 ^ round;
    const input = `${seed}#${round}`;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    out += hash.toString(16).padStart(8, '0');
  }
  return out.toUpperCase();
}
