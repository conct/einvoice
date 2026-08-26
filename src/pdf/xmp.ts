import { escapeXml } from '../util/xml';

/** Konformitaetsstufe im Sinne von ZUGFeRD/Factur-X, landet so im XMP */
export type FacturXConformanceLevel =
  'MINIMUM' | 'BASIC WL' | 'BASIC' | 'EN 16931' | 'EXTENDED' | 'XRECHNUNG';

export interface XmpOptions {
  title: string;
  author: string;
  subject: string;
  keywords?: string;
  creatorTool: string;
  producer: string;
  /** ISO-8601 mit Zeitzone, muss mit CreationDate im Info-Dictionary uebereinstimmen */
  createDate: string;
  modifyDate: string;
  /** PDF/A-Teil, fuer ZUGFeRD immer 3 */
  pdfaPart?: 1 | 2 | 3 | 4;
  /** A = barrierefrei getaggt, B = visuell, U = B plus Unicode-Zuordnung */
  pdfaConformance?: 'A' | 'B' | 'U';
  /** Dateiname der eingebetteten XML-Rechnung */
  documentFileName: string;
  /** Profil der eingebetteten Rechnung */
  conformanceLevel: FacturXConformanceLevel;
  /** Version des Factur-X-Namensraums, fuer ZUGFeRD 2.x immer 1.0 */
  facturxVersion?: string;
}

const BOM = String.fromCharCode(0xfeff);

/** Eigenschaften des Factur-X-Erweiterungsschemas, in fester Reihenfolge */
const FX_PROPERTIES: Array<[name: string, description: string]> = [
  ['DocumentFileName', 'name of the embedded XML invoice file'],
  ['DocumentType', 'INVOICE'],
  ['Version', 'The actual version of the standard applying to the embedded XML document'],
  ['ConformanceLevel', 'The conformance level of the embedded XML document'],
];

/**
 * Baut das XMP-Paket fuer ein ZUGFeRD-/Factur-X-PDF.
 *
 * Drei Dinge muessen hier stimmen, sonst faellt die Datei bei veraPDF oder
 * beim Empfaenger durch:
 *  1. pdfaid:part und pdfaid:conformance kennzeichnen das PDF als PDF/A-3.
 *  2. Der Namensraum urn:factur-x:... darf nicht einfach benutzt werden - jedes
 *     PDF/A-fremde Schema muss im pdfaExtension-Block selbst beschrieben sein.
 *  3. dc:title, dc:creator, dc:description, xmp:CreateDate und pdf:Producer
 *     muessen zum Info-Dictionary des PDF passen.
 */
export function buildXmp(options: XmpOptions): string {
  const part = options.pdfaPart ?? 3;
  const conformance = options.pdfaConformance ?? 'B';
  const version = options.facturxVersion ?? '1.0';
  const e = escapeXml;

  const properties = FX_PROPERTIES.map(
    ([name, description]) => `          <rdf:li rdf:parseType="Resource">
           <pdfaProperty:name>${e(name)}</pdfaProperty:name>
           <pdfaProperty:valueType>Text</pdfaProperty:valueType>
           <pdfaProperty:category>external</pdfaProperty:category>
           <pdfaProperty:description>${e(description)}</pdfaProperty:description>
          </rdf:li>`,
  ).join('\n');

  return `<?xpacket begin="${BOM}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="erechnung-core">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${e(options.title)}</rdf:li>
    </rdf:Alt>
   </dc:title>
   <dc:creator>
    <rdf:Seq>
     <rdf:li>${e(options.author)}</rdf:li>
    </rdf:Seq>
   </dc:creator>
   <dc:description>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${e(options.subject)}</rdf:li>
    </rdf:Alt>
   </dc:description>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>${e(options.creatorTool)}</xmp:CreatorTool>
   <xmp:CreateDate>${e(options.createDate)}</xmp:CreateDate>
   <xmp:ModifyDate>${e(options.modifyDate)}</xmp:ModifyDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>${e(options.producer)}</pdf:Producer>
   <pdf:Keywords>${e(options.keywords ?? '')}</pdf:Keywords>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>${part}</pdfaid:part>
   <pdfaid:conformance>${conformance}</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about=""
    xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
    xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
    xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
${properties}
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>${e(options.documentFileName)}</fx:DocumentFileName>
   <fx:Version>${e(version)}</fx:Version>
   <fx:ConformanceLevel>${e(options.conformanceLevel)}</fx:ConformanceLevel>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;
}

/**
 * Formatiert ein Datum als XMP-Zeitstempel mit Zeitzonenversatz.
 * Das Info-Dictionary bekommt denselben Moment im PDF-Format D:YYYYMMDDHHmmSS+HH'mm'.
 */
export function xmpDate(date: Date): string {
  const pad = (n: number, size = 2) => String(Math.floor(Math.abs(n))).padStart(size, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}
