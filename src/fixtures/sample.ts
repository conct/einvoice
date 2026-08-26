import { parseInvoice, type Invoice, type InvoiceProfile } from '../model/invoice';

/**
 * Beispielrechnung fuer Tests, Validierungslaeufe und den Demo-Modus der App.
 * Deckt bewusst die Faelle ab, an denen Erzeuger ueblicherweise scheitern:
 * zwei Steuersaetze, ein Abschlag auf Dokumentebene, eine Anzahlung, eine
 * Position mit Preisbasismenge und eine mit Zeitraum.
 */
export function sampleInvoice(profile: InvoiceProfile = 'zugferd-en16931'): Invoice {
  return parseInvoice({
    profile,
    number: 'RE-2026-0042',
    typeCode: '380',
    issueDate: '2026-08-24',
    dueDate: '2026-09-07',
    deliveryDate: '2026-08-21',
    currency: 'EUR',
    buyerReference: profile === 'zugferd-en16931' ? '04011000-12345-67' : '991-01234-56',
    orderReference: 'BST-2026-889',
    seller: {
      name: 'Nordlicht Digitalwerk GmbH',
      tradingName: 'Nordlicht',
      address: {
        line1: 'Speicherstrasse 14',
        city: 'Hamburg',
        postcode: '20457',
        countryCode: 'DE',
      },
      vatId: 'DE812345678',
      taxNumber: '22/815/01234',
      legalRegistrationId: 'HRB 123456',
      electronicAddress: { value: 'rechnung@nordlicht-digitalwerk.de', scheme: 'EM' },
      contact: {
        name: 'Marie Sandberg',
        phone: '+49 40 1234567',
        email: 'rechnung@nordlicht-digitalwerk.de',
      },
    },
    buyer: {
      name: 'Stadtwerke Buchholz AoeR',
      address: {
        line1: 'Rathausplatz 3',
        city: 'Buchholz in der Nordheide',
        postcode: '21244',
        countryCode: 'DE',
      },
      vatId: 'DE987654321',
      identifier: 'KD-10032',
      electronicAddress: { value: '991-01234-56', scheme: '0204' },
      contact: { name: 'Einkauf', email: 'einkauf@stadtwerke-buchholz.de' },
    },
    lines: [
      {
        id: '1',
        name: 'Konzeption und Umsetzung Kundenportal',
        description: 'Frontend, Anbindung an das Abrechnungssystem, Abnahmetests',
        quantity: 84,
        unitCode: 'HUR',
        unitPrice: 118,
        vat: { category: 'S', rate: 19 },
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      },
      {
        id: '2',
        name: 'Betrieb und Wartung',
        quantity: 1,
        unitCode: 'MON',
        unitPrice: 480,
        vat: { category: 'S', rate: 19 },
        allowancesCharges: [
          {
            isCharge: false,
            amount: 48,
            baseAmount: 480,
            percentage: 10,
            reason: 'Rahmenvertragsrabatt',
            vat: { category: 'S', rate: 19 },
          },
        ],
      },
      {
        id: '3',
        name: 'Handbuch Kundenportal, gedruckt',
        description: 'Ermäßigter Steuersatz nach § 12 Abs. 2 Nr. 1 UStG',
        sellerItemId: 'DOC-2026-01',
        quantity: 25,
        unitCode: 'C62',
        unitPrice: 18.4,
        vat: { category: 'S', rate: 7 },
      },
      {
        id: '4',
        name: 'Reisekosten Bahn',
        quantity: 3,
        unitCode: 'C62',
        unitPrice: 62.5,
        vat: { category: 'S', rate: 19 },
        attributes: [{ name: 'Strecke', value: 'Hamburg - Buchholz' }],
      },
    ],
    allowancesCharges: [
      {
        isCharge: false,
        amount: 150,
        reason: 'Skonto bei Sofortzahlung, bereits berücksichtigt',
        reasonCode: '95',
        vat: { category: 'S', rate: 19 },
      },
    ],
    payment: {
      meansCode: '58',
      iban: 'DE02100500000054540402',
      bic: 'BELADEBEXXX',
      accountName: 'Nordlicht Digitalwerk GmbH',
      remittanceInformation: 'RE-2026-0042',
      terms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
    },
    notes: [
      {
        text: 'Vielen Dank für die Zusammenarbeit. Rückfragen zur Rechnung bitte unter Angabe der Rechnungsnummer.',
      },
    ],
    paidAmount: 1000,
  });
}

/** Kleinstmoegliche gueltige Rechnung, fuer Grenzfalltests */
export function minimalInvoice(): Invoice {
  return parseInvoice({
    number: 'RE-1',
    issueDate: '2026-01-15',
    dueDate: '2026-02-15',
    deliveryDate: '2026-01-15',
    seller: {
      name: 'Einzelunternehmen Meyer',
      address: { line1: 'Hauptstrasse 1', city: 'Kiel', postcode: '24103' },
      vatId: 'DE111111111',
      identifier: 'MEYER-KI',
      contact: { name: 'Jo Meyer', phone: '+49 431 1', email: 'jo@meyer.example' },
    },
    buyer: {
      name: 'Kundin GmbH',
      address: { line1: 'Nebenweg 2', city: 'Lue' + 'beck', postcode: '23552' },
    },
    lines: [
      { id: '1', name: 'Beratung', quantity: 1, unitPrice: 100, vat: { category: 'S', rate: 19 } },
    ],
    payment: { meansCode: '58', iban: 'DE02100500000054540402' },
  });
}

/** Kleinunternehmerrechnung nach Paragraf 19 UStG, ohne Steuerausweis */
export function smallBusinessInvoice(): Invoice {
  return parseInvoice({
    number: 'RE-2026-7',
    issueDate: '2026-03-02',
    dueDate: '2026-03-16',
    deliveryDate: '2026-02-27',
    seller: {
      name: 'Atelier Lindgren',
      address: { line1: 'Werftweg 8', city: 'Flensburg', postcode: '24937' },
      taxNumber: '15/123/45678',
      // Ohne USt-IdNr. verlangt BR-CO-26 eine eigene Kennung (BT-29) oder einen
      // Registereintrag (BT-30) - die Steuernummer zaehlt dafuer nicht.
      identifier: 'ATELIER-LINDGREN-FL',
      contact: {
        name: 'Ari Lindgren',
        phone: '+49 461 22222',
        email: 'post@atelier-lindgren.example',
      },
    },
    buyer: {
      name: 'Cafe Hafenblick',
      address: { line1: 'Am Kai 3', city: 'Flensburg', postcode: '24937' },
    },
    lines: [
      {
        id: '1',
        name: 'Illustration Speisekarte',
        quantity: 1,
        unitPrice: 640,
        vat: {
          category: 'E',
          rate: 0,
          exemptionReason: 'Kein Ausweis von Umsatzsteuer gemäß § 19 UStG (Kleinunternehmer).',
          exemptionReasonCode: 'VATEX-EU-O',
        },
      },
    ],
    payment: { meansCode: '58', iban: 'DE02100500000054540402' },
  });
}
