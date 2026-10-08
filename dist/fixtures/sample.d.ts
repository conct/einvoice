import { I as Invoice, a as InvoiceProfile } from '../invoice-BoN0H4V6.js';
import 'zod';

/**
 * Beispielrechnung fuer Tests, Validierungslaeufe und den Demo-Modus der App.
 * Deckt bewusst die Faelle ab, an denen Erzeuger ueblicherweise scheitern:
 * zwei Steuersaetze, ein Abschlag auf Dokumentebene, eine Anzahlung, eine
 * Position mit Preisbasismenge und eine mit Zeitraum.
 */
declare function sampleInvoice(profile?: InvoiceProfile): Invoice;
/** Kleinstmoegliche gueltige Rechnung, fuer Grenzfalltests */
declare function minimalInvoice(): Invoice;
/** Kleinunternehmerrechnung nach Paragraf 19 UStG, ohne Steuerausweis */
declare function smallBusinessInvoice(): Invoice;

export { minimalInvoice, sampleInvoice, smallBusinessInvoice };
