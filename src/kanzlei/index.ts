/**
 * Eingangsrechnungen und das Paket fuer die Kanzlei.
 *
 * ## Warum das hier liegt und nicht in einer Anwendung
 *
 * Nebenan steht `readEInvoice`: aus einem empfangenen Dokument wird ein
 * Datensatz. Daneben `liesBeleg`: aus dem Text eines Fotos werden Felder mit
 * Sicherheitsangabe. Was darauf folgt, ist in jeder Anwendung dasselbe - ein
 * Vorgang, den man behaelt, dessen Zahlungsstand man kennt, und am Ende eine
 * Lieferung an den Steuerberater: die Originale, dazu eine Liste, die sagt,
 * was jedes Bild ist und woher seine Zahlen stammen.
 *
 * Gewachsen ist das in rechnungswerk und dort gegen echte Belege gelaufen.
 * Hier liegt es, weil CHOOZY dasselbe braucht - und zwei Kopien derselben
 * Liste laufen auseinander, sobald eine davon eine Spalte dazubekommt.
 *
 * ## Was hier nicht liegt
 *
 * Alles ist rein. Kein Dateisystem, keine Datenbank, keine Texterkennung und
 * kein ZIP: `paketplan` sagt, welche Datei wie heisst und was in der Liste
 * steht, gepackt wird in der Anwendung - die hat die Originale, und nur sie
 * weiss, ob sie in einer Ablage, einer Datenbank oder auf einem Server
 * liegen. Kontiert wird auch nichts; das bleibt bei der Kanzlei.
 *
 * ## Eigener Einstieg
 *
 *     import { paketplan } from '@erechnung/core/kanzlei';
 *
 * Getrennt vom Hauptindex, weil es eine Stufe darueber liegt: Der Kern kennt
 * Formate und Normen, das hier kennt einen Vorgang in einem Betrieb.
 */

export {
  absenderzug,
  absenderzugAusParty,
  ausEInvoice,
  ausFoto,
  hinweiseAus,
  neueEingangId,
  neueLieferantId,
  uebersicht,
  type Absenderzug,
  type Eingangsrechnung,
  type Erfassung,
  type Lieferant,
  type Quelle,
  type Uebersicht,
} from './modell';

export {
  dateiname,
  imZeitraum,
  liesmich,
  liste,
  paketplan,
  paketumfang,
  type Paketplan,
  type Paketstueck,
  type Zeitraum,
} from './kanzlei';

export {
  heute,
  offeneSummen,
  skontochance,
  tageBis,
  ueberfaelligTage,
  zahlungsstand,
  type Offenstand,
  type Skontochance,
  type Zahlungsstand,
} from './status';
