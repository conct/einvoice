import {
  rgb,
  type PDFFont,
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
import { merkeSchriftquelle } from './kerning';
import { fromBase64 } from '../util/base64';
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
   * Ein dritter, kraeftiger Schnitt zwischen mager und fett.
   *
   * Gestaltete Rechnungen benutzen ihn fuer Zwischenueberschriften und
   * Summenbeschriftungen: Die vermessene Vorlage setzt "Gesamtbetrag netto" in
   * National Book, ihren Fliesstext in National Light und ihre Auszeichnung in
   * National Semibold. Fehlt er, wird der magere benutzt - drei Prozent zu
   * schmal, aber nicht falsch.
   */
  fontKraeftig?: Uint8Array;
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
   * tools/schrift-erzeugen.mjs.
   *
   * Bleibt als Schalter erhalten, weil der Vergleich beider Wege der einzige
   * Weg ist, den Fehler vorzufuehren: npm run schriftprobe
   * in den Pruefwerkzeugen von rechnungswerk
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
  /**
   * Die senkrechten Anker der Vorlage, in Hoehen **ihrer** Seite.
   *
   * Hier wird die Verschiebung auf unsere Seite aufgeschlagen - dieselbe, mit
   * der auch der Bogen gesetzt wird. Ohne Bogen bleiben sie wirkungslos: Zu
   * einer Seite, die wir selbst aufbauen, gehoeren keine fremden Hoehen.
   */
  kennzahlenOben?: number;
  textOben?: number;
  /** Die linken Kanten der Kennzahlenspalten, in Masen ihrer Seite. */
  kennzahlenSpalten?: Partial<Record<keyof Beschriftungen, number>>;
  /** Die Fluchtlinie der Summenbeschriftungen, in Masen ihrer Seite. */
  summenlabelRechts?: number;
  /** Einzug der Positionen vom Satzrand, wenn die Vorlage einen hat. */
  positionsEinzug?: number;
  /**
   * Menge und Einzelpreis zeigen. Ohne Angabe entscheidet der Inhalt: Sie
   * entfallen, wenn jede Position genau ein Stueck ist und der Einzelpreis
   * deshalb die Zeilensumme wiederholt.
   */
  mengenspalten?: boolean;
  /**
   * Die Steuerspalte zeigen. Ohne Angabe entscheidet der Inhalt: Sie
   * entfaellt, wenn alle Positionen unter demselben Satz laufen - der steht
   * dann im Summenblock.
   */
  steuerspalte?: boolean;
  /** Positionsnamen fett, Beschreibung grau. Aus, wenn die Vorlage gleich setzt. */
  positionsauszeichnung?: boolean;
  /** Summenbeschriftungen im kraeftigen Schnitt, wie es die Vorlage haelt. */
  summenlabelKraeftig?: boolean;
  /** Betrag auf die letzte Zeile der Position, wie es die Vorlage haelt. */
  betragUnten?: boolean;
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
/**
 * Um wie viel unsere Schrift schmaler gesetzt werden muss, um die Laufweite
 * der Vorlage zu treffen.
 *
 * ## Wie
 *
 * Fuer jede Textprobe der Vorlage steht ihre gemessene Breite fest. Dieselbe
 * Zeichenfolge in unserer Schrift bei derselben Groesse ergibt eine zweite
 * Breite; ihr Verhaeltnis ist der gesuchte Faktor. Genommen wird der **Median**
 * ueber alle Proben: Ein Ausreisser - eine Zeile aus lauter Ziffern etwa, die
 * in beiden Schriften gleich breit laufen - soll den Satz nicht bestimmen.
 *
 * ## Die Schranken
 *
 * Zwischen 0,75 und 1,15. Darueber hinaus stimmt etwas anderes nicht: Der
 * Text der Probe wurde falsch gelesen, oder die Vorlage benutzt eine
 * Laufweitenaenderung, die wir nicht nachbauen. Dann bleibt es beim Nennwert -
 * eine falsch gesetzte Rechnung ist schlimmer als eine, die etwas zu breit
 * laeuft.
 *
 * Unter drei Proben wird gar nicht erst gerechnet.
 */
function laufweitenfaktor(
  schrift: PDFFont,
  proben: { text: string; breite: number; groesse: number; fett: boolean }[],
): number {
  /*
   * Gemessen wird nur an Fliesstext.
   *
   * Nachgerechnet mit der echten Schrift der Vorlage, die also eins ergeben
   * muss: Ihre Fliesstextproben lagen zwischen 0,99 und 1,03 - richtig. Ihre
   * halbfetten Zeilen lagen bei 1,08 bis 1,11, weil ein schwererer Schnitt
   * breiter laeuft als unser magerer. Und ihre Betraege bei 1,18, weil die
   * Vorlage **Tabellenziffern** benutzt (im Schriftprogramm als "five.LT" zu
   * sehen) und die breiter sind als die gewoehnlichen.
   *
   * Der Median ueber alles landete dadurch bei 1,04, und der ganze Rumpf kam
   * vier Prozent zu gross heraus. Beide Verzerrungen ziehen in dieselbe
   * Richtung - nach oben -, deshalb genuegt es, die verzerrten Proben
   * wegzulassen statt gegenzurechnen.
   */
  const brauchbar = proben.filter((probe) => {
    if (probe.fett) return false;
    const ziffern = [...probe.text].filter((zeichen) => zeichen >= '0' && zeichen <= '9').length;
    return ziffern / probe.text.length <= 0.3;
  });

  const faktoren: number[] = [];
  for (const probe of brauchbar.length >= 3 ? brauchbar : proben) {
    let unser = 0;
    try {
      unser = schrift.widthOfTextAtSize(probe.text, probe.groesse);
    } catch {
      // Zeichen, die unsere Schrift nicht kennt - die Probe faellt weg.
      continue;
    }
    if (unser > 0 && probe.breite > 0) faktoren.push(probe.breite / unser);
  }
  if (faktoren.length < 3) return 1;

  faktoren.sort((eins, zwei) => eins - zwei);
  const median = faktoren[Math.floor(faktoren.length / 2)] ?? 1;
  return median >= 0.75 && median <= 1.15 ? median : 1;
}

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
  /*
   * Tabellenziffern, wo die Schrift sie mitbringt.
   *
   * Auf einer Rechnung stehen Zahlen untereinander - Betraege, Steuersaetze,
   * Datumsangaben. Gewoehnliche Ziffern sind verschieden breit; die Eins ist
   * schmal, die Null breit. Untereinander gesetzt franst die Spalte dann aus,
   * und zwei gleich lange Betraege sind verschieden lang.
   *
   * Nachgemessen an der vermessenen Vorlage: Sie waehlt genau dieses Merkmal.
   * Im Schriftprogramm stehen die Ziffern als "five.LT", "three.LT" - die
   * tabellarischen Schnitte. Ohne sie lief unser Satz an jeder Zahl aus der
   * Flucht: "12,35 Euro" war 38,6 Punkt breit statt 44,7.
   *
   * Kennt eine Schrift das Merkmal nicht, wird es stillschweigend ignoriert -
   * fontkit laesst unbekannte Merkmale fallen.
   */
  const merkmale = ['tnum'];
  const regular = await doc.embedFont(options.assets.fontRegular, {
    subset,
    features: merkmale as never,
  });
  const bold = await doc.embedFont(options.assets.fontBold, {
    subset,
    features: merkmale as never,
  });

  /*
   * Die Schriftdateien fuer die Unterschneidung anmelden.
   *
   * pdf-lib gibt seine eigene fontkit-Instanz nicht heraus und fragt beim
   * Zeichnen auch nicht danach: Es setzt ein `Tj` und ueberlaesst die
   * Vorschuebe der /Widths-Tabelle, die keine Unterschneidung kennt. Mit den
   * Bytes hier laesst sie sich nachrechnen - siehe pdf/kerning.ts.
   */
  merkeSchriftquelle(regular, options.assets.fontRegular, merkmale);
  merkeSchriftquelle(bold, options.assets.fontBold, merkmale);

  const kraeftig = options.assets.fontKraeftig
    ? await doc.embedFont(options.assets.fontKraeftig, { subset, features: merkmale as never })
    : undefined;
  if (kraeftig && options.assets.fontKraeftig) {
    merkeSchriftquelle(kraeftig, options.assets.fontKraeftig, merkmale);
  }
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

  /*
   * Woraus die Schriften des Briefkopfs kommen.
   *
   * Erste Wahl ist die uebergebene Vorlage - wer das Original-PDF zur Hand
   * hat, bekommt die genaueste Wiedergabe. Sonst der Schriftbogen, den der
   * Bogen selbst mitbringt: dieselben Schriftobjekte, aber ohne die alte
   * Rechnung darum herum. Fehlt beides, wird der Briefkopf nachgezeichnet.
   */
  const schriftquelle =
    options.briefpapierVorlage ??
    (bogen?.schriftbogen ? fromBase64(bogen.schriftbogen) : undefined);
  const setzer =
    bogen && schriftquelle
      ? await bereiteVorlagenschrift(doc, bogen, schriftquelle)
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
  /*
   * Spalten, die nichts sagen, werden nicht gesetzt.
   *
   * ## Menge und Einzelpreis
   *
   * Steht in jeder Zeile ein Stueck und ist der Einzelpreis deshalb dieselbe
   * Zahl wie die Zeilensumme, sagen beide Spalten nichts, was rechts nicht
   * schon steht - "1 Stk. 65,00 ... 65,00". Die vermessene Vorlage setzt sie
   * aus genau diesem Grund nicht.
   *
   * Die Einheit muss dabei das dimensionslose Stueck sein. "1 Monat" oder
   * "1 Pauschale" traegt eine Angabe, die sonst nirgends steht; die zu
   * streichen, weil die Zahl davor eine Eins ist, waere ein Verlust.
   *
   * ## Der Steuersatz
   *
   * Laufen alle Positionen unter demselben Satz, nennt ihn der Summenblock.
   * Die Spalte wiederholte ihn dann Zeile fuer Zeile. Bei gemischten Saetzen
   * bleibt sie stehen - dort ist sie die einzige Stelle, an der die Zuordnung
   * ueberhaupt sichtbar wird.
   */
  const stummeMengen = invoice.lines.every(
    (zeile, nummer) =>
      zeile.quantity === 1 &&
      zeile.unitCode === 'C62' &&
      Math.abs(zeile.unitPrice - (totals.lineAmounts[nummer] ?? Number.NaN)) < 0.005,
  );
  const einSteuersatz =
    new Set(invoice.lines.map((zeile) => `${zeile.vat.category}-${zeile.vat.rate ?? ''}`)).size === 1;

  /*
   * Die Grundgroesse des Rumpfes - nach **Laufweite**, nicht nach Nennwert.
   *
   * Die Vorlage setzt zehn Punkt. Unsere Hausschrift braucht bei zehn Punkt
   * neunzehn Prozent mehr Platz je Zeile als ihre; eins zu eins uebernommen
   * bricht das Anschreiben um, wo im Original eine Zeile steht, und alles
   * darunter rutscht. Gesucht ist die Groesse, in der unsere Schrift dieselbe
   * Strecke belegt wie ihre.
   */
  const grundgroesse = ((): number | undefined => {
    if (!bogen) return undefined;
    const median = bogen.inhaltSchrift.median;
    if (!(median >= 7 && median <= 14)) return undefined;
    return Math.round(median * laufweitenfaktor(regular, bogen.inhaltProben) * 10) / 10;
  })();

  const grundthema =
    options.theme ?? (bogen?.akzent ? themaMitAkzent(bogen.akzent) : DEFAULT_THEME);

  /*
   * Bleibt es schlicht, gehoert die Hausfarbe auch nicht in die Summenlinien.
   * Die vermessene Vorlage setzt in ihrem Inhalt nur Schwarz und siebzig
   * Prozent Grau; das Rot kommt genau einmal vor, im Firmenzeichen. Dort
   * gehoert es hin - und nur dorthin.
   */
  /*
   * Und die Textfarbe des Bogens.
   *
   * Unsere ist ein sehr dunkles Grau - eine Gestaltungsentscheidung, die auf
   * unserem eigenen Entwurf richtig ist. Auf einem Bogen, der durchgehend in
   * hundert Prozent Schwarz gesetzt ist, steht der Rumpf damit sichtbar
   * blasser da als der Briefkopf darueber; gemessen zwoelf Prozent heller.
   */
  const strichfarbe = bogen?.inhaltStriche?.farbe;
  const mitFarbe =
    !options.theme && (bogen?.textfarbe || strichfarbe)
      ? {
          ...grundthema,
          ...(bogen?.textfarbe
            ? { text: rgb(bogen.textfarbe.r, bogen.textfarbe.g, bogen.textfarbe.b) }
            : {}),
          /*
           * Und die Haarlinie. Unsere ist ein helles Grau; die Vorlage zieht
           * ihre Summenlinien voll deckend, und unsere standen daneben kaum
           * sichtbar.
           */
          ...(strichfarbe
            ? { hairline: rgb(strichfarbe.r, strichfarbe.g, strichfarbe.b) }
            : {}),
        }
      : grundthema;

  const thema = schlicht && !options.theme ? { ...mitFarbe, accent: mitFarbe.text } : mitFarbe;

  drawInvoice(addPage, invoice, totals, {
    fonts: { regular, bold, ...(kraeftig ? { kraeftig } : {}) },
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
    /*
     * Das Anschriftenfeld: wo die Vorlage ihre erste Zeile hat, sonst ein
     * fester Abstand unter der Kante. Der feste war elf Punkt, ihrer ist
     * zehn - alle vier Zeilen standen einen Punkt zu tief.
     */
    ...(bogen
      ? {
          anschriftOben:
            (bogen.anschriftZeile ?? bogen.grenze - ANSCHRIFT_LUFT) + versatz.y,
        }
      : {}),
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
    ...(options.positionsEinzug !== undefined
      ? { positionsEinzug: options.positionsEinzug }
      : {}),
    ...(options.positionsauszeichnung !== undefined
      ? { positionsauszeichnung: options.positionsauszeichnung }
      : {}),
    ...(options.betragUnten !== undefined ? { betragUnten: options.betragUnten } : {}),
    ...(options.summenlabelKraeftig !== undefined
      ? { summenlabelKraeftig: options.summenlabelKraeftig }
      : {}),
    mengenspalten: options.mengenspalten ?? !stummeMengen,
    steuerspalte: options.steuerspalte ?? !einSteuersatz,
    /*
     * Die Strichstaerken des Summenblocks kommen aus der Vorlage: Sie zieht
     * 0,25 pt unter den gewoehnlichen Zeilen und 1,00 pt unter der Endsumme.
     */
    ...(bogen?.inhaltStriche ? { striche: bogen.inhaltStriche } : {}),
    /*
     * Und das senkrechte Raster des Rumpfes. Die Schriftgroesse nur, wenn sie
     * plausibel ist: Ein Median aus zwei Zeilen Kleingedrucktem saehe aus wie
     * eine Grundgroesse und setzte die ganze Rechnung in Sechspunkt.
     */
    ...(grundgroesse !== undefined ? { inhaltGroesse: grundgroesse } : {}),
    ...(bogen?.inhaltRaster.zeile !== undefined ? { inhaltZeile: bogen.inhaltRaster.zeile } : {}),
    ...(bogen?.inhaltRaster.absatz !== undefined
      ? { inhaltAbsatz: bogen.inhaltRaster.absatz }
      : {}),
    ...(bogen && options.kennzahlenOben !== undefined
      ? { kennzahlenOben: options.kennzahlenOben + versatz.y }
      : {}),
    ...(bogen && options.textOben !== undefined
      ? { textOben: options.textOben + versatz.y }
      : {}),
    ...(bogen && options.summenlabelRechts !== undefined
      ? { summenlabelRechts: options.summenlabelRechts + versatz.x }
      : {}),
    ...(bogen && options.kennzahlenSpalten
      ? {
          kennzahlenSpalten: Object.fromEntries(
            Object.entries(options.kennzahlenSpalten).map(([feld, x]) => [feld, x + versatz.x]),
          ),
        }
      : {}),
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
