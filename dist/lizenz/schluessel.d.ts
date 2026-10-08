/**
 * Lizenzschluessel: ausstellen und pruefen.
 *
 * Warum hier und nicht in der App: Ausgestellt wird auf dem Rechner des
 * Anbieters (tools/lizenz), geprueft wird in der App. Beide Seiten muessen
 * sich ueber Format und Signatur bis aufs Byte einig sein - also gehoert es an
 * die eine Stelle, die beide einbinden. Fachlich ist es kein E-Rechnungsthema;
 * es liegt hier, weil dies die gemeinsame Bibliothek des Projekts ist.
 *
 * Warum ueberhaupt: Auf iOS und Android weist der Store-Beleg den Kauf nach.
 * Im Browser gibt es keinen - dort waere die bezahlte Stufe nur ein Eintrag im
 * localStorage, den jeder mit der Entwicklerkonsole setzen kann. Siehe
 * docs/monetarisierung.md, Abschnitt 11.
 *
 * Was das Verfahren leistet und was nicht:
 *
 *  - Es beweist, dass ein Schluessel von uns stammt und unveraendert ist.
 *  - Es beweist NICHT, dass er dem gehoert, der ihn einloest. Ein Schluessel
 *    laesst sich weitergeben. Dagegen hilft nur, die Kaeufer-E-Mail sichtbar
 *    in der App anzuzeigen - soziale Hemmung statt Technik, passend zur
 *    Haltung "kein DRM".
 *  - Es kann einen ausgegebenen Schluessel nicht zurueckziehen. Deshalb hat
 *    alles Wiederkehrende ein Ablaufdatum.
 *
 * ECDSA ueber P-256 und nicht Ed25519: crypto.subtle kann P-256 in jedem
 * Browser, Ed25519 erst in neueren. Der private Schluessel liegt
 * ausschliesslich beim Anbieter und niemals im App-Bundle.
 */
/**
 * Nur der Ausschnitt von WebCrypto, der hier gebraucht wird.
 *
 * Das Paket bindet bewusst keine DOM-Typen ein (siehe Kopf von index.ts).
 * WebCrypto gibt es in Node ab Fassung 18 und in jedem Browser; die Typen
 * dafuer stecken aber in der DOM-Bibliothek. Statt sie hereinzuholen, steht
 * hier, was benutzt wird - das ist zugleich die Liste dessen, was eine
 * Umgebung koennen muss.
 */
type Schluesselmaterial = Record<string, unknown>;
/** Stufen, die ein Schluessel freischalten kann. Frei braucht keinen. */
type LizenzStufe = 'pro' | 'buero';
interface LizenzInhalt {
    /** Fassung des Formats. Aendert sich das Format, faellt Altes sauber durch. */
    v: 1;
    stufe: LizenzStufe;
    /** E-Mail des Kaeufers - wird in der App angezeigt, nicht geprueft. */
    email: string;
    /** Kennung des Kaufs beim Zahlungsdienst, fuer Rueckfragen und Support. */
    kauf: string;
    /** Ausstellungstag, YYYY-MM-DD */
    ab: string;
    /**
     * Letzter Nutzungstag, YYYY-MM-DD. Fehlt bei unbefristeten Kaeufen.
     *
     * Nach diesem Tag faellt die App auf die kostenlose Stufe zurueck. Nur fuer
     * Wiederkehrendes (Buero) gesetzt.
     */
    bis?: string;
    /**
     * Letzter Tag mit Anspruch auf Aktualisierungen, YYYY-MM-DD.
     *
     * Bewusst getrennt von `bis`: Ein gekaufter Pro-Zugang bleibt unbefristet
     * nutzbar, die Pflege ist befristet. Wer eine Rechnung schreiben muss, darf
     * nicht an einem Stichtag stehenbleiben - E-Rechnung ist eine gesetzliche
     * Pflicht, keine Bequemlichkeit. Der Anreiz zum Nachkaufen liegt in neuen
     * Fassungen, nicht in einer Sperre.
     *
     * Heute wird daraus nichts abgeleitet ausser einer Anzeige. Das Feld steht
     * jetzt im Format, damit spaeter nicht jeder ausgegebene Schluessel neu
     * ausgestellt werden muss.
     */
    pflege?: string;
    /**
     * Adresse des Dienstes, den die App ansprechen soll.
     *
     * Nur fuer Buero. Wer diese Stufe auf einem eigenen Server betreibt, soll
     * die Adresse nicht abtippen muessen - sie kommt mit dem Schluessel, den er
     * ohnehin einloest. Das ist der einzige Weg, der ohne eine Oberflaeche
     * auskommt, die niemand sonst braucht.
     *
     * Sicherheitshalber eng gefasst, denn ein Schluessel, der die App auf einen
     * fremden Server richtet, wuerde dort Rechnungsdaten hinschicken:
     *
     *  - nur https, oder http im eigenen Netz - siehe pruefeDienstadresse
     *  - nur bei stufe 'buero'; Pro erzeugt ohnehin auf dem Geraet und haette
     *    von einem Dienst nichts, ein Feld dort waere also nur verdaechtig
     *  - die App nennt die Adresse beim Einloesen ausdruecklich, damit niemand
     *    unbemerkt umgeleitet wird
     *
     * Faellt das Feld weg, bleibt es beim voreingestellten Dienst.
     */
    dienst?: string;
}
type Lizenzbefund = ({
    gueltig: true;
} & LizenzInhalt) | {
    gueltig: false;
    grund: string;
};
/** Erzeugt ein neues Schluesselpaar. Laeuft einmal, beim Einrichten. */
declare function erzeugeSchluesselpaar(): Promise<{
    privat: Schluesselmaterial;
    oeffentlich: Schluesselmaterial;
}>;
/**
 * Stellt einen Schluessel aus. Nur beim Anbieter, mit dem privaten Schluessel.
 */
declare function stelleSchluesselAus(inhalt: LizenzInhalt, privat: Schluesselmaterial): Promise<string>;
/**
 * Prueft einen Schluessel.
 *
 * Gibt bewusst einen Befund zurueck und wirft nicht: Ein falsch abgetippter
 * Schluessel ist keine Ausnahme, sondern ein Fall, der dem Nutzer erklaert
 * werden muss.
 *
 * `heute` wird hereingereicht statt aus der Uhr gelesen - so laesst sich der
 * Ablauf pruefen, ohne die Systemzeit zu stellen.
 */
declare function pruefeSchluessel(eingabe: string, oeffentlich: Schluesselmaterial, heute: string): Promise<Lizenzbefund>;
/**
 * Laufzeit eines Kaufs in Tagen beziehungsweise Monaten.
 *
 * Die Zuordnung steht hier und nicht im Ausstellungswerkzeug, damit App und
 * Werkzeug dieselbe Vorstellung davon haben, was gekauft wurde.
 */
declare const PRODUKTE: {
    pro: {
        stufe: "pro";
        monate: undefined;
        pflegeMonate: number;
        cent: number;
        beschreibung: string;
    };
    'buero-monat': {
        stufe: "buero";
        monate: number;
        pflegeMonate: number;
        cent: number;
        beschreibung: string;
    };
    'buero-jahr': {
        stufe: "buero";
        monate: number;
        pflegeMonate: number;
        cent: number;
        beschreibung: string;
    };
};
type Produkt = keyof typeof PRODUKTE;
declare function istProdukt(name: unknown): name is Produkt;
/**
 * Preis in Euro, deutsch geschrieben.
 *
 * Gerechnet wird durchgehend in Cent - Zahlungsdienste tun es auch, und ein
 * Gleitkommabetrag fuer Geld ist eine Fehlerquelle, die man nicht braucht.
 */
declare function euroText(cent: number): string;
/**
 * Letzter Gueltigkeitstag bei einer Laufzeit in Monaten.
 *
 * Gerechnet wird in Monaten und nicht in 30-Tage-Schritten: Wer am 31. Januar
 * bucht, erwartet den 28. Februar und nicht den 2. Maerz. Faellt der Stichtag
 * auf einen Tag, den es im Zielmonat nicht gibt, wird auf dessen letzten Tag
 * zurueckgesetzt.
 */
declare function laufzeitBis(ab: string, monate: number): string;
/**
 * Letzter Gueltigkeitstag, wenn ein Zeitraum nachgekauft wird.
 *
 * Gerechnet wird ab heute - oder, wenn noch Laufzeit uebrig ist, ab deren
 * Ende. Wer im letzten Monat seines Jahresbezugs nachkauft, verschenkt so
 * keinen Tag. Das entspricht Paragraf 4 Absatz 3 der Geschaeftsbedingungen:
 * gezahlt wird fuer einen Zeitraum im Voraus, nicht fuer ein Datum.
 *
 * Steht hier und nicht beim Aufrufer, weil es dieselbe Datumsrechnung ist wie
 * laufzeitBis - und weil es dort, wo es gebraucht wird (der Store-Kauf in der
 * App), neben einem nativen Modul liegt und damit nicht pruefbar waere.
 *
 * `bisher` ist der bisherige letzte Gueltigkeitstag oder undefined, wenn nichts
 * laeuft. Liegt er in der Vergangenheit, zaehlt er nicht mehr.
 */
declare function anschlussBis(monate: number, heute: string, bisher?: string): string;

export { type LizenzInhalt, type LizenzStufe, type Lizenzbefund, PRODUKTE, type Produkt, type Schluesselmaterial, anschlussBis, erzeugeSchluesselpaar, euroText, istProdukt, laufzeitBis, pruefeSchluessel, stelleSchluesselAus };
