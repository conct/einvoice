import { I as InvoiceProfile, a as Invoice } from '../invoice-Diu1WYJB.js';
import 'zod';

/**
 * Beispielrechnung fuer Tests, Validierungslaeufe und den Demo-Modus der App.
 * Deckt bewusst die Faelle ab, an denen Erzeuger ueblicherweise scheitern:
 * zwei Steuersaetze, ein Abschlag auf Dokumentebene, eine Anzahlung, eine
 * Position mit Preisbasismenge und eine mit Zeitraum.
 */
declare function sampleInvoice(profile?: InvoiceProfile): Invoice;
/**
 * Rechnung mit zwei Skontostufen - 10 Tage 3 %, 20 Tage 1,5 % auf einen
 * Teilbetrag.
 *
 * Die zweite Stufe traegt absichtlich einen Basisbetrag: Fracht und Montage
 * sind nach vielen Einkaufsbedingungen nicht skontierfaehig, und genau dieser
 * Fall unterscheidet eine brauchbare Umsetzung von einer, die nur einen
 * Prozentsatz kennt. Mitgeprueft wird sie in den Validierungslaeufen von
 * rechnungswerk, damit die Schreibweise der XRechnung nachweisbar durchgeht.
 */
declare function skontoInvoice(profile?: InvoiceProfile): Invoice;
/**
 * Rechnung in Franken, mit der Umsatzsteuer zusaetzlich in Euro.
 *
 * Der Fall, an dem zwei Dinge haengen, die man sonst erst beim Empfaenger
 * merkt: Im CII muss BT-6 VOR BT-5 stehen, sonst ist das Dokument nicht
 * schema-gueltig, und BR-53 verlangt zu BT-6 auch BT-111. Der Pruefer der
 * KoSIT setzt beides durch - deshalb laeuft dieser Beleg in jedem
 * Validierungslauf von rechnungswerk mit.
 *
 * Der Betrag in Euro ist frei gewaehlt: Welcher Kurs gilt, entscheidet nicht
 * die Bibliothek.
 */
declare function fremdwaehrungInvoice(profile?: InvoiceProfile): Invoice;
/** Kleinstmoegliche gueltige Rechnung, fuer Grenzfalltests */
declare function minimalInvoice(): Invoice;
/** Kleinunternehmerrechnung nach Paragraf 19 UStG, ohne Steuerausweis */
declare function smallBusinessInvoice(): Invoice;

export { fremdwaehrungInvoice, minimalInvoice, sampleInvoice, skontoInvoice, smallBusinessInvoice };
