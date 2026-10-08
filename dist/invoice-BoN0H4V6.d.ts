import { z } from 'zod';

/** BG-5 / BG-8 Postanschrift */
declare const AddressSchema: z.ZodObject<{
    /** BT-35 / BT-50 Strasse und Hausnummer */
    line1: z.ZodDefault<z.ZodString>;
    /** BT-36 / BT-51 Adresszusatz */
    line2: z.ZodOptional<z.ZodString>;
    /** BT-37 / BT-52 Ort */
    city: z.ZodString;
    /** BT-38 / BT-53 Postleitzahl */
    postcode: z.ZodOptional<z.ZodString>;
    /** BT-39 / BT-54 Bundesland */
    subdivision: z.ZodOptional<z.ZodString>;
    /** BT-40 / BT-55 Laendercode ISO 3166-1 alpha-2 */
    countryCode: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    line1: string;
    city: string;
    countryCode: string;
    line2?: string | undefined;
    postcode?: string | undefined;
    subdivision?: string | undefined;
}, {
    city: string;
    line1?: string | undefined;
    line2?: string | undefined;
    postcode?: string | undefined;
    subdivision?: string | undefined;
    countryCode?: string | undefined;
}>;
type Address = z.infer<typeof AddressSchema>;
/** BG-6 / BG-9 Kontaktangaben */
declare const ContactSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
}, {
    name?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
}>;
/** BT-34 / BT-49 elektronische Adresse mit Schemakennung */
declare const ElectronicAddressSchema: z.ZodObject<{
    value: z.ZodString;
    /** EAS-Code, z.B. "EM" fuer E-Mail oder "0204" fuer die Leitweg-ID */
    scheme: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    scheme: string;
}, {
    value: string;
    scheme: string;
}>;
/** BG-4 Verkaeufer / BG-7 Kaeufer */
declare const PartySchema: z.ZodObject<{
    /** BT-27 / BT-44 eingetragener Name */
    name: z.ZodString;
    /** BT-28 / BT-45 abweichender Handelsname */
    tradingName: z.ZodOptional<z.ZodString>;
    address: z.ZodObject<{
        /** BT-35 / BT-50 Strasse und Hausnummer */
        line1: z.ZodDefault<z.ZodString>;
        /** BT-36 / BT-51 Adresszusatz */
        line2: z.ZodOptional<z.ZodString>;
        /** BT-37 / BT-52 Ort */
        city: z.ZodString;
        /** BT-38 / BT-53 Postleitzahl */
        postcode: z.ZodOptional<z.ZodString>;
        /** BT-39 / BT-54 Bundesland */
        subdivision: z.ZodOptional<z.ZodString>;
        /** BT-40 / BT-55 Laendercode ISO 3166-1 alpha-2 */
        countryCode: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        line1: string;
        city: string;
        countryCode: string;
        line2?: string | undefined;
        postcode?: string | undefined;
        subdivision?: string | undefined;
    }, {
        city: string;
        line1?: string | undefined;
        line2?: string | undefined;
        postcode?: string | undefined;
        subdivision?: string | undefined;
        countryCode?: string | undefined;
    }>;
    /** BT-31 / BT-48 Umsatzsteuer-Identifikationsnummer */
    vatId: z.ZodOptional<z.ZodString>;
    /** BT-32 Steuernummer des Verkaeufers (Alternative zur USt-IdNr.) */
    taxNumber: z.ZodOptional<z.ZodString>;
    /** BT-29 / BT-46 Kennung des Geschaeftspartners, z.B. Kundennummer */
    identifier: z.ZodOptional<z.ZodString>;
    /** BT-30 / BT-47 Registereintrag, z.B. Handelsregisternummer */
    legalRegistrationId: z.ZodOptional<z.ZodString>;
    electronicAddress: z.ZodOptional<z.ZodObject<{
        value: z.ZodString;
        /** EAS-Code, z.B. "EM" fuer E-Mail oder "0204" fuer die Leitweg-ID */
        scheme: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        scheme: string;
    }, {
        value: string;
        scheme: string;
    }>>;
    contact: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name?: string | undefined;
        phone?: string | undefined;
        email?: string | undefined;
    }, {
        name?: string | undefined;
        phone?: string | undefined;
        email?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    address: {
        line1: string;
        city: string;
        countryCode: string;
        line2?: string | undefined;
        postcode?: string | undefined;
        subdivision?: string | undefined;
    };
    tradingName?: string | undefined;
    vatId?: string | undefined;
    taxNumber?: string | undefined;
    identifier?: string | undefined;
    legalRegistrationId?: string | undefined;
    electronicAddress?: {
        value: string;
        scheme: string;
    } | undefined;
    contact?: {
        name?: string | undefined;
        phone?: string | undefined;
        email?: string | undefined;
    } | undefined;
}, {
    name: string;
    address: {
        city: string;
        line1?: string | undefined;
        line2?: string | undefined;
        postcode?: string | undefined;
        subdivision?: string | undefined;
        countryCode?: string | undefined;
    };
    tradingName?: string | undefined;
    vatId?: string | undefined;
    taxNumber?: string | undefined;
    identifier?: string | undefined;
    legalRegistrationId?: string | undefined;
    electronicAddress?: {
        value: string;
        scheme: string;
    } | undefined;
    contact?: {
        name?: string | undefined;
        phone?: string | undefined;
        email?: string | undefined;
    } | undefined;
}>;
type Party = z.infer<typeof PartySchema>;
/** Steuerliche Einordnung einer Position oder eines Zu-/Abschlags */
declare const VatSchema: z.ZodObject<{
    /** BT-151 Kategorie nach UNTDID 5305 */
    category: z.ZodEnum<["S", "Z", "E", "AE", "K", "G", "O"]>;
    /** BT-152 Satz in Prozent, z.B. 19 */
    rate: z.ZodNumber;
    /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
    exemptionReason: z.ZodOptional<z.ZodString>;
    /** BT-121 codierter Befreiungsgrund nach VATEX */
    exemptionReasonCode: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
    rate: number;
    exemptionReason?: string | undefined;
    exemptionReasonCode?: string | undefined;
}, {
    category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
    rate: number;
    exemptionReason?: string | undefined;
    exemptionReasonCode?: string | undefined;
}>;
type Vat = z.infer<typeof VatSchema>;
/** BG-20 / BG-21 Zu- und Abschlag */
declare const AllowanceChargeSchema: z.ZodObject<{
    /** true = Zuschlag (BG-21), false = Abschlag (BG-20) */
    isCharge: z.ZodDefault<z.ZodBoolean>;
    /** BT-92 / BT-99 Betrag, immer positiv angegeben */
    amount: z.ZodNumber;
    /** BT-93 / BT-100 Basisbetrag fuer prozentuale Angaben */
    baseAmount: z.ZodOptional<z.ZodNumber>;
    /** BT-94 / BT-101 Prozentsatz */
    percentage: z.ZodOptional<z.ZodNumber>;
    /** BT-97 / BT-104 Grund im Klartext */
    reason: z.ZodOptional<z.ZodString>;
    /** BT-98 / BT-105 codierter Grund */
    reasonCode: z.ZodOptional<z.ZodString>;
    vat: z.ZodObject<{
        /** BT-151 Kategorie nach UNTDID 5305 */
        category: z.ZodEnum<["S", "Z", "E", "AE", "K", "G", "O"]>;
        /** BT-152 Satz in Prozent, z.B. 19 */
        rate: z.ZodNumber;
        /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
        exemptionReason: z.ZodOptional<z.ZodString>;
        /** BT-121 codierter Befreiungsgrund nach VATEX */
        exemptionReasonCode: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
        rate: number;
        exemptionReason?: string | undefined;
        exemptionReasonCode?: string | undefined;
    }, {
        category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
        rate: number;
        exemptionReason?: string | undefined;
        exemptionReasonCode?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    vat: {
        category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
        rate: number;
        exemptionReason?: string | undefined;
        exemptionReasonCode?: string | undefined;
    };
    isCharge: boolean;
    amount: number;
    baseAmount?: number | undefined;
    percentage?: number | undefined;
    reason?: string | undefined;
    reasonCode?: string | undefined;
}, {
    vat: {
        category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
        rate: number;
        exemptionReason?: string | undefined;
        exemptionReasonCode?: string | undefined;
    };
    amount: number;
    isCharge?: boolean | undefined;
    baseAmount?: number | undefined;
    percentage?: number | undefined;
    reason?: string | undefined;
    reasonCode?: string | undefined;
}>;
type AllowanceCharge = z.infer<typeof AllowanceChargeSchema>;
/** BG-25 Rechnungsposition */
declare const LineSchema: z.ZodObject<{
    /** BT-126 Positionsnummer, eindeutig im Dokument */
    id: z.ZodString;
    /** BT-153 Artikelname */
    name: z.ZodString;
    /** BT-154 Beschreibung */
    description: z.ZodOptional<z.ZodString>;
    /** BT-155 Artikelnummer des Verkaeufers */
    sellerItemId: z.ZodOptional<z.ZodString>;
    /** BT-157 GTIN oder EAN */
    globalItemId: z.ZodOptional<z.ZodString>;
    /** BT-129 Menge */
    quantity: z.ZodNumber;
    /** BT-130 Mengeneinheit nach UN/ECE Rec. 20 */
    unitCode: z.ZodDefault<z.ZodString>;
    /** BT-146 Nettoeinzelpreis */
    unitPrice: z.ZodNumber;
    /** BT-149 Preisbasismenge, falls der Einzelpreis fuer mehrere Einheiten gilt */
    priceBaseQuantity: z.ZodOptional<z.ZodNumber>;
    /** BT-147 Rabatt auf den Bruttoeinzelpreis */
    unitPriceDiscount: z.ZodOptional<z.ZodNumber>;
    /** BT-148 Bruttoeinzelpreis vor Rabatt */
    grossUnitPrice: z.ZodOptional<z.ZodNumber>;
    vat: z.ZodObject<{
        /** BT-151 Kategorie nach UNTDID 5305 */
        category: z.ZodEnum<["S", "Z", "E", "AE", "K", "G", "O"]>;
        /** BT-152 Satz in Prozent, z.B. 19 */
        rate: z.ZodNumber;
        /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
        exemptionReason: z.ZodOptional<z.ZodString>;
        /** BT-121 codierter Befreiungsgrund nach VATEX */
        exemptionReasonCode: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
        rate: number;
        exemptionReason?: string | undefined;
        exemptionReasonCode?: string | undefined;
    }, {
        category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
        rate: number;
        exemptionReason?: string | undefined;
        exemptionReasonCode?: string | undefined;
    }>;
    /** BG-27 / BG-28 Zu- und Abschlaege auf Positionsebene */
    allowancesCharges: z.ZodDefault<z.ZodArray<z.ZodObject<{
        /** true = Zuschlag (BG-21), false = Abschlag (BG-20) */
        isCharge: z.ZodDefault<z.ZodBoolean>;
        /** BT-92 / BT-99 Betrag, immer positiv angegeben */
        amount: z.ZodNumber;
        /** BT-93 / BT-100 Basisbetrag fuer prozentuale Angaben */
        baseAmount: z.ZodOptional<z.ZodNumber>;
        /** BT-94 / BT-101 Prozentsatz */
        percentage: z.ZodOptional<z.ZodNumber>;
        /** BT-97 / BT-104 Grund im Klartext */
        reason: z.ZodOptional<z.ZodString>;
        /** BT-98 / BT-105 codierter Grund */
        reasonCode: z.ZodOptional<z.ZodString>;
        vat: z.ZodObject<{
            /** BT-151 Kategorie nach UNTDID 5305 */
            category: z.ZodEnum<["S", "Z", "E", "AE", "K", "G", "O"]>;
            /** BT-152 Satz in Prozent, z.B. 19 */
            rate: z.ZodNumber;
            /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
            exemptionReason: z.ZodOptional<z.ZodString>;
            /** BT-121 codierter Befreiungsgrund nach VATEX */
            exemptionReasonCode: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        }, {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        isCharge: boolean;
        amount: number;
        baseAmount?: number | undefined;
        percentage?: number | undefined;
        reason?: string | undefined;
        reasonCode?: string | undefined;
    }, {
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        amount: number;
        isCharge?: boolean | undefined;
        baseAmount?: number | undefined;
        percentage?: number | undefined;
        reason?: string | undefined;
        reasonCode?: string | undefined;
    }>, "many">>;
    /** BT-134 Beginn des Abrechnungszeitraums der Position */
    periodStart: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /** BT-135 Ende des Abrechnungszeitraums der Position */
    periodEnd: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /** BT-132 Referenz auf die Bestellposition */
    orderLineReference: z.ZodOptional<z.ZodString>;
    /** BG-32 Artikelattribute, z.B. Farbe oder Groesse */
    attributes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        name: string;
    }, {
        value: string;
        name: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    quantity: number;
    unitCode: string;
    unitPrice: number;
    vat: {
        category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
        rate: number;
        exemptionReason?: string | undefined;
        exemptionReasonCode?: string | undefined;
    };
    allowancesCharges: {
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        isCharge: boolean;
        amount: number;
        baseAmount?: number | undefined;
        percentage?: number | undefined;
        reason?: string | undefined;
        reasonCode?: string | undefined;
    }[];
    attributes: {
        value: string;
        name: string;
    }[];
    periodStart?: string | undefined;
    periodEnd?: string | undefined;
    description?: string | undefined;
    sellerItemId?: string | undefined;
    globalItemId?: string | undefined;
    priceBaseQuantity?: number | undefined;
    unitPriceDiscount?: number | undefined;
    grossUnitPrice?: number | undefined;
    orderLineReference?: string | undefined;
}, {
    name: string;
    id: string;
    quantity: number;
    unitPrice: number;
    vat: {
        category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
        rate: number;
        exemptionReason?: string | undefined;
        exemptionReasonCode?: string | undefined;
    };
    periodStart?: string | undefined;
    periodEnd?: string | undefined;
    description?: string | undefined;
    sellerItemId?: string | undefined;
    globalItemId?: string | undefined;
    unitCode?: string | undefined;
    priceBaseQuantity?: number | undefined;
    unitPriceDiscount?: number | undefined;
    grossUnitPrice?: number | undefined;
    allowancesCharges?: {
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        amount: number;
        isCharge?: boolean | undefined;
        baseAmount?: number | undefined;
        percentage?: number | undefined;
        reason?: string | undefined;
        reasonCode?: string | undefined;
    }[] | undefined;
    orderLineReference?: string | undefined;
    attributes?: {
        value: string;
        name: string;
    }[] | undefined;
}>;
type Line = z.infer<typeof LineSchema>;
/** BG-16 Zahlungsangaben */
declare const PaymentSchema: z.ZodObject<{
    /** BT-81 Zahlungsart nach UNTDID 4461 */
    meansCode: z.ZodDefault<z.ZodString>;
    /** BT-82 Zahlungsart im Klartext */
    meansText: z.ZodOptional<z.ZodString>;
    /** BT-84 IBAN des Zahlungsempfaengers */
    iban: z.ZodOptional<z.ZodString>;
    /** BT-86 BIC */
    bic: z.ZodOptional<z.ZodString>;
    /** BT-85 Kontoinhaber */
    accountName: z.ZodOptional<z.ZodString>;
    /** BT-83 Verwendungszweck */
    remittanceInformation: z.ZodOptional<z.ZodString>;
    /** BT-89 Mandatsreferenz bei SEPA-Lastschrift */
    mandateReference: z.ZodOptional<z.ZodString>;
    /** BT-90 Glaeubiger-Identifikationsnummer */
    creditorIdentifier: z.ZodOptional<z.ZodString>;
    /** BT-20 Zahlungsbedingungen im Klartext */
    terms: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    meansCode: string;
    meansText?: string | undefined;
    iban?: string | undefined;
    bic?: string | undefined;
    accountName?: string | undefined;
    remittanceInformation?: string | undefined;
    mandateReference?: string | undefined;
    creditorIdentifier?: string | undefined;
    terms?: string | undefined;
}, {
    meansCode?: string | undefined;
    meansText?: string | undefined;
    iban?: string | undefined;
    bic?: string | undefined;
    accountName?: string | undefined;
    remittanceInformation?: string | undefined;
    mandateReference?: string | undefined;
    creditorIdentifier?: string | undefined;
    terms?: string | undefined;
}>;
type Payment = z.infer<typeof PaymentSchema>;
/** BG-24 rechnungsbegruendende Unterlage */
declare const AttachmentSchema: z.ZodObject<{
    /** BT-122 Kennung der Unterlage */
    id: z.ZodString;
    /** BT-123 Beschreibung */
    description: z.ZodOptional<z.ZodString>;
    /** BT-125-1 Dateiname */
    filename: z.ZodOptional<z.ZodString>;
    /** BT-125-2 MIME-Typ, zulaessig sind u.a. application/pdf, image/png, text/csv */
    mimeType: z.ZodOptional<z.ZodString>;
    /** Binaerinhalt der Unterlage */
    data: z.ZodOptional<z.ZodType<Uint8Array<ArrayBuffer>, z.ZodTypeDef, Uint8Array<ArrayBuffer>>>;
    /** BT-124 externe Fundstelle statt eingebetteter Datei */
    uri: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    description?: string | undefined;
    filename?: string | undefined;
    mimeType?: string | undefined;
    data?: Uint8Array<ArrayBuffer> | undefined;
    uri?: string | undefined;
}, {
    id: string;
    description?: string | undefined;
    filename?: string | undefined;
    mimeType?: string | undefined;
    data?: Uint8Array<ArrayBuffer> | undefined;
    uri?: string | undefined;
}>;
type Attachment = z.infer<typeof AttachmentSchema>;
/** Zielformat - bestimmt Profilkennung, Syntax und Validierungsregeln */
declare const InvoiceProfileSchema: z.ZodEnum<["zugferd-en16931", "xrechnung-cii", "xrechnung-ubl"]>;
type InvoiceProfile = z.infer<typeof InvoiceProfileSchema>;
declare const InvoiceSchema: z.ZodObject<{
    profile: z.ZodDefault<z.ZodEnum<["zugferd-en16931", "xrechnung-cii", "xrechnung-ubl"]>>;
    /** BT-1 Rechnungsnummer */
    number: z.ZodString;
    /** BT-3 Rechnungsart nach UNTDID 1001 */
    typeCode: z.ZodDefault<z.ZodString>;
    /** BT-2 Rechnungsdatum */
    issueDate: z.ZodEffects<z.ZodString, string, string>;
    /** BT-9 Faelligkeitsdatum */
    dueDate: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /** BT-72 Liefer- oder Leistungsdatum */
    deliveryDate: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /** BG-14 Beginn des Abrechnungszeitraums */
    periodStart: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /** BG-14 Ende des Abrechnungszeitraums */
    periodEnd: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /** BT-5 Waehrung nach ISO 4217 */
    currency: z.ZodDefault<z.ZodString>;
    /** BT-10 Kaeuferreferenz - bei XRechnung die Leitweg-ID und Pflichtfeld */
    buyerReference: z.ZodOptional<z.ZodString>;
    /** BT-13 Bestellnummer des Kaeufers */
    orderReference: z.ZodOptional<z.ZodString>;
    /** BT-12 Vertragsnummer */
    contractReference: z.ZodOptional<z.ZodString>;
    /** BT-11 Projektnummer */
    projectReference: z.ZodOptional<z.ZodString>;
    /** BT-14 Auftragsnummer des Verkaeufers */
    sellerOrderReference: z.ZodOptional<z.ZodString>;
    /** BT-25 / BT-26 vorausgegangene Rechnung, Pflicht bei Storno und Korrektur */
    precedingInvoice: z.ZodOptional<z.ZodObject<{
        number: z.ZodString;
        issueDate: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    }, "strip", z.ZodTypeAny, {
        number: string;
        issueDate?: string | undefined;
    }, {
        number: string;
        issueDate?: string | undefined;
    }>>;
    seller: z.ZodObject<{
        /** BT-27 / BT-44 eingetragener Name */
        name: z.ZodString;
        /** BT-28 / BT-45 abweichender Handelsname */
        tradingName: z.ZodOptional<z.ZodString>;
        address: z.ZodObject<{
            /** BT-35 / BT-50 Strasse und Hausnummer */
            line1: z.ZodDefault<z.ZodString>;
            /** BT-36 / BT-51 Adresszusatz */
            line2: z.ZodOptional<z.ZodString>;
            /** BT-37 / BT-52 Ort */
            city: z.ZodString;
            /** BT-38 / BT-53 Postleitzahl */
            postcode: z.ZodOptional<z.ZodString>;
            /** BT-39 / BT-54 Bundesland */
            subdivision: z.ZodOptional<z.ZodString>;
            /** BT-40 / BT-55 Laendercode ISO 3166-1 alpha-2 */
            countryCode: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        }, {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        }>;
        /** BT-31 / BT-48 Umsatzsteuer-Identifikationsnummer */
        vatId: z.ZodOptional<z.ZodString>;
        /** BT-32 Steuernummer des Verkaeufers (Alternative zur USt-IdNr.) */
        taxNumber: z.ZodOptional<z.ZodString>;
        /** BT-29 / BT-46 Kennung des Geschaeftspartners, z.B. Kundennummer */
        identifier: z.ZodOptional<z.ZodString>;
        /** BT-30 / BT-47 Registereintrag, z.B. Handelsregisternummer */
        legalRegistrationId: z.ZodOptional<z.ZodString>;
        electronicAddress: z.ZodOptional<z.ZodObject<{
            value: z.ZodString;
            /** EAS-Code, z.B. "EM" fuer E-Mail oder "0204" fuer die Leitweg-ID */
            scheme: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            scheme: string;
        }, {
            value: string;
            scheme: string;
        }>>;
        contact: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            phone: z.ZodOptional<z.ZodString>;
            email: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        }, {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        address: {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        };
        tradingName?: string | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    }, {
        name: string;
        address: {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        };
        tradingName?: string | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    }>;
    buyer: z.ZodObject<{
        /** BT-27 / BT-44 eingetragener Name */
        name: z.ZodString;
        /** BT-28 / BT-45 abweichender Handelsname */
        tradingName: z.ZodOptional<z.ZodString>;
        address: z.ZodObject<{
            /** BT-35 / BT-50 Strasse und Hausnummer */
            line1: z.ZodDefault<z.ZodString>;
            /** BT-36 / BT-51 Adresszusatz */
            line2: z.ZodOptional<z.ZodString>;
            /** BT-37 / BT-52 Ort */
            city: z.ZodString;
            /** BT-38 / BT-53 Postleitzahl */
            postcode: z.ZodOptional<z.ZodString>;
            /** BT-39 / BT-54 Bundesland */
            subdivision: z.ZodOptional<z.ZodString>;
            /** BT-40 / BT-55 Laendercode ISO 3166-1 alpha-2 */
            countryCode: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        }, {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        }>;
        /** BT-31 / BT-48 Umsatzsteuer-Identifikationsnummer */
        vatId: z.ZodOptional<z.ZodString>;
        /** BT-32 Steuernummer des Verkaeufers (Alternative zur USt-IdNr.) */
        taxNumber: z.ZodOptional<z.ZodString>;
        /** BT-29 / BT-46 Kennung des Geschaeftspartners, z.B. Kundennummer */
        identifier: z.ZodOptional<z.ZodString>;
        /** BT-30 / BT-47 Registereintrag, z.B. Handelsregisternummer */
        legalRegistrationId: z.ZodOptional<z.ZodString>;
        electronicAddress: z.ZodOptional<z.ZodObject<{
            value: z.ZodString;
            /** EAS-Code, z.B. "EM" fuer E-Mail oder "0204" fuer die Leitweg-ID */
            scheme: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            scheme: string;
        }, {
            value: string;
            scheme: string;
        }>>;
        contact: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            phone: z.ZodOptional<z.ZodString>;
            email: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        }, {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        address: {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        };
        tradingName?: string | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    }, {
        name: string;
        address: {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        };
        tradingName?: string | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    }>;
    /** BG-10 abweichender Zahlungsempfaenger */
    payee: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        tradingName: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodObject<{
            /** BT-35 / BT-50 Strasse und Hausnummer */
            line1: z.ZodDefault<z.ZodString>;
            /** BT-36 / BT-51 Adresszusatz */
            line2: z.ZodOptional<z.ZodString>;
            /** BT-37 / BT-52 Ort */
            city: z.ZodString;
            /** BT-38 / BT-53 Postleitzahl */
            postcode: z.ZodOptional<z.ZodString>;
            /** BT-39 / BT-54 Bundesland */
            subdivision: z.ZodOptional<z.ZodString>;
            /** BT-40 / BT-55 Laendercode ISO 3166-1 alpha-2 */
            countryCode: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        }, {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        }>>;
        vatId: z.ZodOptional<z.ZodString>;
        taxNumber: z.ZodOptional<z.ZodString>;
        identifier: z.ZodOptional<z.ZodString>;
        legalRegistrationId: z.ZodOptional<z.ZodString>;
        electronicAddress: z.ZodOptional<z.ZodObject<{
            value: z.ZodString;
            /** EAS-Code, z.B. "EM" fuer E-Mail oder "0204" fuer die Leitweg-ID */
            scheme: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            scheme: string;
        }, {
            value: string;
            scheme: string;
        }>>;
        contact: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            phone: z.ZodOptional<z.ZodString>;
            email: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        }, {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        tradingName?: string | undefined;
        address?: {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        } | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    }, {
        name: string;
        tradingName?: string | undefined;
        address?: {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        } | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    }>>;
    /** BG-13 abweichende Lieferanschrift */
    deliveryAddress: z.ZodOptional<z.ZodObject<{
        /** BT-35 / BT-50 Strasse und Hausnummer */
        line1: z.ZodDefault<z.ZodString>;
        /** BT-36 / BT-51 Adresszusatz */
        line2: z.ZodOptional<z.ZodString>;
        /** BT-37 / BT-52 Ort */
        city: z.ZodString;
        /** BT-38 / BT-53 Postleitzahl */
        postcode: z.ZodOptional<z.ZodString>;
        /** BT-39 / BT-54 Bundesland */
        subdivision: z.ZodOptional<z.ZodString>;
        /** BT-40 / BT-55 Laendercode ISO 3166-1 alpha-2 */
        countryCode: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        line1: string;
        city: string;
        countryCode: string;
        line2?: string | undefined;
        postcode?: string | undefined;
        subdivision?: string | undefined;
    }, {
        city: string;
        line1?: string | undefined;
        line2?: string | undefined;
        postcode?: string | undefined;
        subdivision?: string | undefined;
        countryCode?: string | undefined;
    }>>;
    /** BT-70 Name des Lieferorts */
    deliveryName: z.ZodOptional<z.ZodString>;
    lines: z.ZodArray<z.ZodObject<{
        /** BT-126 Positionsnummer, eindeutig im Dokument */
        id: z.ZodString;
        /** BT-153 Artikelname */
        name: z.ZodString;
        /** BT-154 Beschreibung */
        description: z.ZodOptional<z.ZodString>;
        /** BT-155 Artikelnummer des Verkaeufers */
        sellerItemId: z.ZodOptional<z.ZodString>;
        /** BT-157 GTIN oder EAN */
        globalItemId: z.ZodOptional<z.ZodString>;
        /** BT-129 Menge */
        quantity: z.ZodNumber;
        /** BT-130 Mengeneinheit nach UN/ECE Rec. 20 */
        unitCode: z.ZodDefault<z.ZodString>;
        /** BT-146 Nettoeinzelpreis */
        unitPrice: z.ZodNumber;
        /** BT-149 Preisbasismenge, falls der Einzelpreis fuer mehrere Einheiten gilt */
        priceBaseQuantity: z.ZodOptional<z.ZodNumber>;
        /** BT-147 Rabatt auf den Bruttoeinzelpreis */
        unitPriceDiscount: z.ZodOptional<z.ZodNumber>;
        /** BT-148 Bruttoeinzelpreis vor Rabatt */
        grossUnitPrice: z.ZodOptional<z.ZodNumber>;
        vat: z.ZodObject<{
            /** BT-151 Kategorie nach UNTDID 5305 */
            category: z.ZodEnum<["S", "Z", "E", "AE", "K", "G", "O"]>;
            /** BT-152 Satz in Prozent, z.B. 19 */
            rate: z.ZodNumber;
            /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
            exemptionReason: z.ZodOptional<z.ZodString>;
            /** BT-121 codierter Befreiungsgrund nach VATEX */
            exemptionReasonCode: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        }, {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        }>;
        /** BG-27 / BG-28 Zu- und Abschlaege auf Positionsebene */
        allowancesCharges: z.ZodDefault<z.ZodArray<z.ZodObject<{
            /** true = Zuschlag (BG-21), false = Abschlag (BG-20) */
            isCharge: z.ZodDefault<z.ZodBoolean>;
            /** BT-92 / BT-99 Betrag, immer positiv angegeben */
            amount: z.ZodNumber;
            /** BT-93 / BT-100 Basisbetrag fuer prozentuale Angaben */
            baseAmount: z.ZodOptional<z.ZodNumber>;
            /** BT-94 / BT-101 Prozentsatz */
            percentage: z.ZodOptional<z.ZodNumber>;
            /** BT-97 / BT-104 Grund im Klartext */
            reason: z.ZodOptional<z.ZodString>;
            /** BT-98 / BT-105 codierter Grund */
            reasonCode: z.ZodOptional<z.ZodString>;
            vat: z.ZodObject<{
                /** BT-151 Kategorie nach UNTDID 5305 */
                category: z.ZodEnum<["S", "Z", "E", "AE", "K", "G", "O"]>;
                /** BT-152 Satz in Prozent, z.B. 19 */
                rate: z.ZodNumber;
                /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
                exemptionReason: z.ZodOptional<z.ZodString>;
                /** BT-121 codierter Befreiungsgrund nach VATEX */
                exemptionReasonCode: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
                rate: number;
                exemptionReason?: string | undefined;
                exemptionReasonCode?: string | undefined;
            }, {
                category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
                rate: number;
                exemptionReason?: string | undefined;
                exemptionReasonCode?: string | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            vat: {
                category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
                rate: number;
                exemptionReason?: string | undefined;
                exemptionReasonCode?: string | undefined;
            };
            isCharge: boolean;
            amount: number;
            baseAmount?: number | undefined;
            percentage?: number | undefined;
            reason?: string | undefined;
            reasonCode?: string | undefined;
        }, {
            vat: {
                category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
                rate: number;
                exemptionReason?: string | undefined;
                exemptionReasonCode?: string | undefined;
            };
            amount: number;
            isCharge?: boolean | undefined;
            baseAmount?: number | undefined;
            percentage?: number | undefined;
            reason?: string | undefined;
            reasonCode?: string | undefined;
        }>, "many">>;
        /** BT-134 Beginn des Abrechnungszeitraums der Position */
        periodStart: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        /** BT-135 Ende des Abrechnungszeitraums der Position */
        periodEnd: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        /** BT-132 Referenz auf die Bestellposition */
        orderLineReference: z.ZodOptional<z.ZodString>;
        /** BG-32 Artikelattribute, z.B. Farbe oder Groesse */
        attributes: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            name: string;
        }, {
            value: string;
            name: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id: string;
        quantity: number;
        unitCode: string;
        unitPrice: number;
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        allowancesCharges: {
            vat: {
                category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
                rate: number;
                exemptionReason?: string | undefined;
                exemptionReasonCode?: string | undefined;
            };
            isCharge: boolean;
            amount: number;
            baseAmount?: number | undefined;
            percentage?: number | undefined;
            reason?: string | undefined;
            reasonCode?: string | undefined;
        }[];
        attributes: {
            value: string;
            name: string;
        }[];
        periodStart?: string | undefined;
        periodEnd?: string | undefined;
        description?: string | undefined;
        sellerItemId?: string | undefined;
        globalItemId?: string | undefined;
        priceBaseQuantity?: number | undefined;
        unitPriceDiscount?: number | undefined;
        grossUnitPrice?: number | undefined;
        orderLineReference?: string | undefined;
    }, {
        name: string;
        id: string;
        quantity: number;
        unitPrice: number;
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        periodStart?: string | undefined;
        periodEnd?: string | undefined;
        description?: string | undefined;
        sellerItemId?: string | undefined;
        globalItemId?: string | undefined;
        unitCode?: string | undefined;
        priceBaseQuantity?: number | undefined;
        unitPriceDiscount?: number | undefined;
        grossUnitPrice?: number | undefined;
        allowancesCharges?: {
            vat: {
                category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
                rate: number;
                exemptionReason?: string | undefined;
                exemptionReasonCode?: string | undefined;
            };
            amount: number;
            isCharge?: boolean | undefined;
            baseAmount?: number | undefined;
            percentage?: number | undefined;
            reason?: string | undefined;
            reasonCode?: string | undefined;
        }[] | undefined;
        orderLineReference?: string | undefined;
        attributes?: {
            value: string;
            name: string;
        }[] | undefined;
    }>, "many">;
    /** Zu- und Abschlaege auf Dokumentebene */
    allowancesCharges: z.ZodDefault<z.ZodArray<z.ZodObject<{
        /** true = Zuschlag (BG-21), false = Abschlag (BG-20) */
        isCharge: z.ZodDefault<z.ZodBoolean>;
        /** BT-92 / BT-99 Betrag, immer positiv angegeben */
        amount: z.ZodNumber;
        /** BT-93 / BT-100 Basisbetrag fuer prozentuale Angaben */
        baseAmount: z.ZodOptional<z.ZodNumber>;
        /** BT-94 / BT-101 Prozentsatz */
        percentage: z.ZodOptional<z.ZodNumber>;
        /** BT-97 / BT-104 Grund im Klartext */
        reason: z.ZodOptional<z.ZodString>;
        /** BT-98 / BT-105 codierter Grund */
        reasonCode: z.ZodOptional<z.ZodString>;
        vat: z.ZodObject<{
            /** BT-151 Kategorie nach UNTDID 5305 */
            category: z.ZodEnum<["S", "Z", "E", "AE", "K", "G", "O"]>;
            /** BT-152 Satz in Prozent, z.B. 19 */
            rate: z.ZodNumber;
            /** BT-120 Grund der Steuerbefreiung, bei allen Nullsatz-Kategorien Pflicht */
            exemptionReason: z.ZodOptional<z.ZodString>;
            /** BT-121 codierter Befreiungsgrund nach VATEX */
            exemptionReasonCode: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        }, {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        isCharge: boolean;
        amount: number;
        baseAmount?: number | undefined;
        percentage?: number | undefined;
        reason?: string | undefined;
        reasonCode?: string | undefined;
    }, {
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        amount: number;
        isCharge?: boolean | undefined;
        baseAmount?: number | undefined;
        percentage?: number | undefined;
        reason?: string | undefined;
        reasonCode?: string | undefined;
    }>, "many">>;
    payment: z.ZodOptional<z.ZodObject<{
        /** BT-81 Zahlungsart nach UNTDID 4461 */
        meansCode: z.ZodDefault<z.ZodString>;
        /** BT-82 Zahlungsart im Klartext */
        meansText: z.ZodOptional<z.ZodString>;
        /** BT-84 IBAN des Zahlungsempfaengers */
        iban: z.ZodOptional<z.ZodString>;
        /** BT-86 BIC */
        bic: z.ZodOptional<z.ZodString>;
        /** BT-85 Kontoinhaber */
        accountName: z.ZodOptional<z.ZodString>;
        /** BT-83 Verwendungszweck */
        remittanceInformation: z.ZodOptional<z.ZodString>;
        /** BT-89 Mandatsreferenz bei SEPA-Lastschrift */
        mandateReference: z.ZodOptional<z.ZodString>;
        /** BT-90 Glaeubiger-Identifikationsnummer */
        creditorIdentifier: z.ZodOptional<z.ZodString>;
        /** BT-20 Zahlungsbedingungen im Klartext */
        terms: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        meansCode: string;
        meansText?: string | undefined;
        iban?: string | undefined;
        bic?: string | undefined;
        accountName?: string | undefined;
        remittanceInformation?: string | undefined;
        mandateReference?: string | undefined;
        creditorIdentifier?: string | undefined;
        terms?: string | undefined;
    }, {
        meansCode?: string | undefined;
        meansText?: string | undefined;
        iban?: string | undefined;
        bic?: string | undefined;
        accountName?: string | undefined;
        remittanceInformation?: string | undefined;
        mandateReference?: string | undefined;
        creditorIdentifier?: string | undefined;
        terms?: string | undefined;
    }>>;
    /**
     * Anrede und Anschreiben ueber den Positionen.
     *
     * "Sehr geehrter Herr Ranacher," und darunter "wir bedanken uns fuer Ihren
     * Auftrag und stellen Ihnen folgende Leistungen in Rechnung:" - so haelt es
     * die vermessene Vorlage, und so halten es die meisten Rechnungen, die ein
     * Mensch geschrieben hat.
     *
     * ## Warum von Hand und nicht erzeugt
     *
     * Eine Anrede aus dem Namen abzuleiten hiesse, aus "Christian Ranacher" auf
     * eine Anredeform zu schliessen. Das geht bei genug Namen schief, und der
     * Fehler steht dann gedruckt beim Empfaenger. Wer eine Anrede will,
     * schreibt sie; wer keine will, laesst das Feld leer und bekommt keine.
     *
     * ## Warum sie auch im XML steht
     *
     * Als BT-22 (`ram:IncludedNote`). Das gedruckte Blatt und der Datensatz
     * sind nach ZUGFeRD gleichrangig; Text, der nur auf einem von beiden steht,
     * ist eine Abweichung, auch wenn er nur hoeflich ist.
     *
     * Ein Leerzeilenumbruch (zwei Zeilenumbrueche) trennt Absaetze.
     */
    intro: z.ZodOptional<z.ZodString>;
    /** BG-1 Bemerkungen zur Rechnung */
    notes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        subjectCode: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        subjectCode?: string | undefined;
    }, {
        text: string;
        subjectCode?: string | undefined;
    }>, "many">>;
    /** BT-113 bereits gezahlter Betrag */
    paidAmount: z.ZodDefault<z.ZodNumber>;
    /** BT-114 Rundungsbetrag */
    roundingAmount: z.ZodDefault<z.ZodNumber>;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        /** BT-122 Kennung der Unterlage */
        id: z.ZodString;
        /** BT-123 Beschreibung */
        description: z.ZodOptional<z.ZodString>;
        /** BT-125-1 Dateiname */
        filename: z.ZodOptional<z.ZodString>;
        /** BT-125-2 MIME-Typ, zulaessig sind u.a. application/pdf, image/png, text/csv */
        mimeType: z.ZodOptional<z.ZodString>;
        /** Binaerinhalt der Unterlage */
        data: z.ZodOptional<z.ZodType<Uint8Array<ArrayBuffer>, z.ZodTypeDef, Uint8Array<ArrayBuffer>>>;
        /** BT-124 externe Fundstelle statt eingebetteter Datei */
        uri: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        description?: string | undefined;
        filename?: string | undefined;
        mimeType?: string | undefined;
        data?: Uint8Array<ArrayBuffer> | undefined;
        uri?: string | undefined;
    }, {
        id: string;
        description?: string | undefined;
        filename?: string | undefined;
        mimeType?: string | undefined;
        data?: Uint8Array<ArrayBuffer> | undefined;
        uri?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    number: string;
    profile: "zugferd-en16931" | "xrechnung-cii" | "xrechnung-ubl";
    typeCode: string;
    issueDate: string;
    currency: string;
    seller: {
        name: string;
        address: {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        };
        tradingName?: string | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    };
    buyer: {
        name: string;
        address: {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        };
        tradingName?: string | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    };
    allowancesCharges: {
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        isCharge: boolean;
        amount: number;
        baseAmount?: number | undefined;
        percentage?: number | undefined;
        reason?: string | undefined;
        reasonCode?: string | undefined;
    }[];
    lines: {
        name: string;
        id: string;
        quantity: number;
        unitCode: string;
        unitPrice: number;
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        allowancesCharges: {
            vat: {
                category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
                rate: number;
                exemptionReason?: string | undefined;
                exemptionReasonCode?: string | undefined;
            };
            isCharge: boolean;
            amount: number;
            baseAmount?: number | undefined;
            percentage?: number | undefined;
            reason?: string | undefined;
            reasonCode?: string | undefined;
        }[];
        attributes: {
            value: string;
            name: string;
        }[];
        periodStart?: string | undefined;
        periodEnd?: string | undefined;
        description?: string | undefined;
        sellerItemId?: string | undefined;
        globalItemId?: string | undefined;
        priceBaseQuantity?: number | undefined;
        unitPriceDiscount?: number | undefined;
        grossUnitPrice?: number | undefined;
        orderLineReference?: string | undefined;
    }[];
    notes: {
        text: string;
        subjectCode?: string | undefined;
    }[];
    paidAmount: number;
    roundingAmount: number;
    attachments: {
        id: string;
        description?: string | undefined;
        filename?: string | undefined;
        mimeType?: string | undefined;
        data?: Uint8Array<ArrayBuffer> | undefined;
        uri?: string | undefined;
    }[];
    dueDate?: string | undefined;
    deliveryDate?: string | undefined;
    periodStart?: string | undefined;
    periodEnd?: string | undefined;
    buyerReference?: string | undefined;
    orderReference?: string | undefined;
    contractReference?: string | undefined;
    projectReference?: string | undefined;
    sellerOrderReference?: string | undefined;
    precedingInvoice?: {
        number: string;
        issueDate?: string | undefined;
    } | undefined;
    payee?: {
        name: string;
        tradingName?: string | undefined;
        address?: {
            line1: string;
            city: string;
            countryCode: string;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
        } | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    } | undefined;
    deliveryAddress?: {
        line1: string;
        city: string;
        countryCode: string;
        line2?: string | undefined;
        postcode?: string | undefined;
        subdivision?: string | undefined;
    } | undefined;
    deliveryName?: string | undefined;
    payment?: {
        meansCode: string;
        meansText?: string | undefined;
        iban?: string | undefined;
        bic?: string | undefined;
        accountName?: string | undefined;
        remittanceInformation?: string | undefined;
        mandateReference?: string | undefined;
        creditorIdentifier?: string | undefined;
        terms?: string | undefined;
    } | undefined;
    intro?: string | undefined;
}, {
    number: string;
    issueDate: string;
    seller: {
        name: string;
        address: {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        };
        tradingName?: string | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    };
    buyer: {
        name: string;
        address: {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        };
        tradingName?: string | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    };
    lines: {
        name: string;
        id: string;
        quantity: number;
        unitPrice: number;
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        periodStart?: string | undefined;
        periodEnd?: string | undefined;
        description?: string | undefined;
        sellerItemId?: string | undefined;
        globalItemId?: string | undefined;
        unitCode?: string | undefined;
        priceBaseQuantity?: number | undefined;
        unitPriceDiscount?: number | undefined;
        grossUnitPrice?: number | undefined;
        allowancesCharges?: {
            vat: {
                category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
                rate: number;
                exemptionReason?: string | undefined;
                exemptionReasonCode?: string | undefined;
            };
            amount: number;
            isCharge?: boolean | undefined;
            baseAmount?: number | undefined;
            percentage?: number | undefined;
            reason?: string | undefined;
            reasonCode?: string | undefined;
        }[] | undefined;
        orderLineReference?: string | undefined;
        attributes?: {
            value: string;
            name: string;
        }[] | undefined;
    }[];
    profile?: "zugferd-en16931" | "xrechnung-cii" | "xrechnung-ubl" | undefined;
    typeCode?: string | undefined;
    dueDate?: string | undefined;
    deliveryDate?: string | undefined;
    periodStart?: string | undefined;
    periodEnd?: string | undefined;
    currency?: string | undefined;
    buyerReference?: string | undefined;
    orderReference?: string | undefined;
    contractReference?: string | undefined;
    projectReference?: string | undefined;
    sellerOrderReference?: string | undefined;
    precedingInvoice?: {
        number: string;
        issueDate?: string | undefined;
    } | undefined;
    payee?: {
        name: string;
        tradingName?: string | undefined;
        address?: {
            city: string;
            line1?: string | undefined;
            line2?: string | undefined;
            postcode?: string | undefined;
            subdivision?: string | undefined;
            countryCode?: string | undefined;
        } | undefined;
        vatId?: string | undefined;
        taxNumber?: string | undefined;
        identifier?: string | undefined;
        legalRegistrationId?: string | undefined;
        electronicAddress?: {
            value: string;
            scheme: string;
        } | undefined;
        contact?: {
            name?: string | undefined;
            phone?: string | undefined;
            email?: string | undefined;
        } | undefined;
    } | undefined;
    deliveryAddress?: {
        city: string;
        line1?: string | undefined;
        line2?: string | undefined;
        postcode?: string | undefined;
        subdivision?: string | undefined;
        countryCode?: string | undefined;
    } | undefined;
    deliveryName?: string | undefined;
    allowancesCharges?: {
        vat: {
            category: "S" | "Z" | "E" | "AE" | "K" | "G" | "O";
            rate: number;
            exemptionReason?: string | undefined;
            exemptionReasonCode?: string | undefined;
        };
        amount: number;
        isCharge?: boolean | undefined;
        baseAmount?: number | undefined;
        percentage?: number | undefined;
        reason?: string | undefined;
        reasonCode?: string | undefined;
    }[] | undefined;
    payment?: {
        meansCode?: string | undefined;
        meansText?: string | undefined;
        iban?: string | undefined;
        bic?: string | undefined;
        accountName?: string | undefined;
        remittanceInformation?: string | undefined;
        mandateReference?: string | undefined;
        creditorIdentifier?: string | undefined;
        terms?: string | undefined;
    } | undefined;
    intro?: string | undefined;
    notes?: {
        text: string;
        subjectCode?: string | undefined;
    }[] | undefined;
    paidAmount?: number | undefined;
    roundingAmount?: number | undefined;
    attachments?: {
        id: string;
        description?: string | undefined;
        filename?: string | undefined;
        mimeType?: string | undefined;
        data?: Uint8Array<ArrayBuffer> | undefined;
        uri?: string | undefined;
    }[] | undefined;
}>;
type Invoice = z.infer<typeof InvoiceSchema>;
/** Eingabeform vor Anwendung der Defaults */
type InvoiceInput = z.input<typeof InvoiceSchema>;
/** Validiert die Struktur und ergaenzt Defaults. Wirft bei Strukturfehlern. */
declare function parseInvoice(input: InvoiceInput): Invoice;

export { type Address as A, ContactSchema as C, ElectronicAddressSchema as E, type Invoice as I, type Line as L, type Party as P, type Vat as V, type InvoiceProfile as a, type InvoiceInput as b, AddressSchema as c, type AllowanceCharge as d, AllowanceChargeSchema as e, type Attachment as f, AttachmentSchema as g, InvoiceProfileSchema as h, InvoiceSchema as i, LineSchema as j, PartySchema as k, type Payment as l, PaymentSchema as m, VatSchema as n, parseInvoice as p };
