import { type NormalisedEntity, EntityType } from '@nexus/contracts/entities';
import { FileCorruptError, FileSizeLimitError } from '@nexus/contracts/errors';

// ── Constants ────────────────────────────────────────────────────

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
const MAX_COMPRESSION_RATIO = 100; // Zip bomb detection
const SUPPORTED_ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'ascii', 'latin1'] as const;

// ── Parser Interface ─────────────────────────────────────────────

export interface ParseOptions {
  orgId: string;
  sourceId: string;
  filename: string;
  mimeType?: string;
}

export interface FileParser {
  readonly supportedExtensions: string[];
  readonly supportedMimeTypes: string[];
  canParse(filename: string, mimeType?: string): boolean;
  parse(data: Uint8Array, options: ParseOptions): Promise<NormalisedEntity[]>;
}

// ── Security Checks ──────────────────────────────────────────────

function enforceFileSize(data: Uint8Array, filename: string, orgId: string): void {
  if (data.byteLength > MAX_FILE_SIZE) {
    throw new FileSizeLimitError(
      `File ${filename} is ${(data.byteLength / (1024 * 1024)).toFixed(1)}MB, exceeding 1GB limit`,
      { orgId },
    );
  }
}

function detectZipBomb(compressedSize: number, uncompressedSize: number, filename: string, orgId: string): void {
  if (compressedSize > 0) {
    const ratio = uncompressedSize / compressedSize;
    if (ratio > MAX_COMPRESSION_RATIO) {
      throw new FileCorruptError(
        `Suspicious compression ratio (${ratio.toFixed(0)}:1) in ${filename} — possible zip bomb`,
        { orgId },
      );
    }
  }
}

// ── Encoding Detection ───────────────────────────────────────────

function detectEncoding(data: Uint8Array): string {
  // BOM detection
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return 'utf-8';
  }
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return 'utf-16le';
  }
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return 'utf-16be';
  }

  // Heuristic: check for null bytes (indicates binary or UTF-16)
  let nullCount = 0;
  const sampleSize = Math.min(data.length, 1024);
  for (let i = 0; i < sampleSize; i++) {
    if (data[i] === 0) nullCount++;
  }

  if (nullCount > sampleSize * 0.1) {
    // Likely UTF-16 or binary
    return 'utf-16le';
  }

  // Check for valid UTF-8 sequences
  let isUtf8 = true;
  for (let i = 0; i < sampleSize; i++) {
    const byte = data[i];
    if (byte > 0x7f) {
      if ((byte & 0xe0) === 0xc0) {
        if (i + 1 >= sampleSize || (data[i + 1] & 0xc0) !== 0x80) { isUtf8 = false; break; }
        i += 1;
      } else if ((byte & 0xf0) === 0xe0) {
        if (i + 2 >= sampleSize || (data[i + 1] & 0xc0) !== 0x80 || (data[i + 2] & 0xc0) !== 0x80) { isUtf8 = false; break; }
        i += 2;
      } else if ((byte & 0xf8) === 0xf0) {
        if (i + 3 >= sampleSize || (data[i + 1] & 0xc0) !== 0x80 || (data[i + 2] & 0xc0) !== 0x80 || (data[i + 3] & 0xc0) !== 0x80) { isUtf8 = false; break; }
        i += 3;
      } else {
        isUtf8 = false;
        break;
      }
    }
  }

  return isUtf8 ? 'utf-8' : 'latin1';
}

function decodeText(data: Uint8Array): string {
  const encoding = detectEncoding(data);
  const decoder = new TextDecoder(encoding);
  return decoder.decode(data);
}

// ── CSV Parser ───────────────────────────────────────────────────

export class CSVParser implements FileParser {
  readonly supportedExtensions = ['.csv', '.tsv'];
  readonly supportedMimeTypes = ['text/csv', 'text/tab-separated-values'];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType));
  }

  async parse(data: Uint8Array, options: ParseOptions): Promise<NormalisedEntity[]> {
    enforceFileSize(data, options.filename, options.orgId);

    let text: string;
    try {
      text = decodeText(data);
    } catch (err) {
      throw new FileCorruptError(
        `Unable to decode ${options.filename}: ${(err as Error).message}`,
        { orgId: options.orgId, cause: err as Error },
      );
    }

    const delimiter = this.detectDelimiter(text);
    const rows = this.parseCSVText(text, delimiter);
    if (rows.length < 2) {
      return []; // Header only or empty
    }

    const headers = rows[0];
    const schema = inferSpreadsheetSchema(headers);
    const entities: NormalisedEntity[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.every((cell) => cell.trim() === '')) continue; // Skip empty rows

      const properties: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j++) {
        properties[headers[j]] = row[j] ?? '';
      }

      const entityType = schema.inferredEntityType;
      const name = this.extractRowName(properties, headers) ?? `Row ${i}`;

      entities.push({
        id: `csv-${options.sourceId}-${i}`,
        orgId: options.orgId,
        sourceId: options.sourceId,
        sourceSystem: `file:${options.filename}`,
        entityType,
        name,
        properties: { ...properties, _rowIndex: i, _schema: schema },
        extractedAt: new Date().toISOString(),
        confidence: schema.confidence,
      });
    }

    return entities;
  }

  private detectDelimiter(text: string): string {
    const firstLine = text.split('\n')[0] ?? '';
    const commas = (firstLine.match(/,/g) ?? []).length;
    const tabs = (firstLine.match(/\t/g) ?? []).length;
    const semicolons = (firstLine.match(/;/g) ?? []).length;
    const pipes = (firstLine.match(/\|/g) ?? []).length;

    const max = Math.max(commas, tabs, semicolons, pipes);
    if (max === 0) return ',';
    if (max === tabs) return '\t';
    if (max === semicolons) return ';';
    if (max === pipes) return '|';
    return ',';
  }

  private parseCSVText(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let current: string[] = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i++; // Skip escaped quote
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          current.push(cell);
          cell = '';
        } else if (ch === '\r' && next === '\n') {
          current.push(cell);
          cell = '';
          rows.push(current);
          current = [];
          i++; // Skip \n
        } else if (ch === '\n') {
          current.push(cell);
          cell = '';
          rows.push(current);
          current = [];
        } else {
          cell += ch;
        }
      }
    }

    // Last cell/row
    if (cell || current.length > 0) {
      current.push(cell);
      rows.push(current);
    }

    return rows;
  }

  private extractRowName(properties: Record<string, unknown>, headers: string[]): string | undefined {
    const nameFields = ['name', 'full_name', 'fullname', 'company', 'company_name', 'title', 'description', 'label', 'subject'];
    for (const field of nameFields) {
      const match = headers.find((h) => h.toLowerCase().replace(/[\s_-]/g, '') === field.replace(/_/g, ''));
      if (match && properties[match]) {
        return String(properties[match]);
      }
    }
    // Fall back to first non-empty text column
    for (const header of headers) {
      const val = properties[header];
      if (typeof val === 'string' && val.trim() && !/^\d+$/.test(val.trim())) {
        return val.trim();
      }
    }
    return undefined;
  }
}

// ── Excel Parser (.xlsx) ─────────────────────────────────────────

export class ExcelParser implements FileParser {
  readonly supportedExtensions = ['.xlsx', '.xls'];
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType));
  }

  async parse(data: Uint8Array, options: ParseOptions): Promise<NormalisedEntity[]> {
    enforceFileSize(data, options.filename, options.orgId);

    // Check for password-protected files (ZIP magic number but encrypted)
    if (!this.isValidZip(data)) {
      throw new FileCorruptError(
        `File ${options.filename} appears to be corrupt or password-protected`,
        { orgId: options.orgId },
      );
    }

    // Use Bun's built-in unzip to read XLSX (which is a ZIP of XML files)
    let sheets: ExcelSheet[];
    try {
      sheets = await this.extractSheets(data, options);
    } catch (err) {
      if (err instanceof FileCorruptError || err instanceof FileSizeLimitError) throw err;
      throw new FileCorruptError(
        `Failed to parse ${options.filename}: ${(err as Error).message}`,
        { orgId: options.orgId, cause: err as Error },
      );
    }

    const entities: NormalisedEntity[] = [];

    for (const sheet of sheets) {
      if (sheet.rows.length < 2) continue;

      const headers = sheet.rows[0];
      const schema = inferSpreadsheetSchema(headers);

      for (let i = 1; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (row.every((cell) => cell.trim() === '')) continue;

        const properties: Record<string, unknown> = {};
        for (let j = 0; j < headers.length; j++) {
          properties[headers[j]] = row[j] ?? '';
        }

        const name = this.extractName(properties, headers) ?? `${sheet.name} Row ${i}`;

        entities.push({
          id: `xlsx-${options.sourceId}-${sheet.name}-${i}`,
          orgId: options.orgId,
          sourceId: options.sourceId,
          sourceSystem: `file:${options.filename}`,
          entityType: schema.inferredEntityType,
          name,
          properties: {
            ...properties,
            _sheetName: sheet.name,
            _rowIndex: i,
            _schema: schema,
          },
          extractedAt: new Date().toISOString(),
          confidence: schema.confidence,
        });
      }
    }

    return entities;
  }

  private isValidZip(data: Uint8Array): boolean {
    // ZIP magic number: PK (0x504b0304)
    return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
  }

  private async extractSheets(data: Uint8Array, options: ParseOptions): Promise<ExcelSheet[]> {
    // Lightweight XLSX parser using Bun's built-in ZIP support
    // XLSX is a ZIP containing XML files:
    //   xl/sharedStrings.xml — shared string table
    //   xl/worksheets/sheet1.xml, sheet2.xml — cell data
    //   xl/workbook.xml — sheet names

    const blob = new Blob([data]);
    // Use DecompressionStream for zip entry extraction
    // We use a manual approach to parse the XLSX ZIP structure

    const zipEntries = await this.readZipEntries(data, options);

    // Parse shared strings
    const sharedStringsXml = zipEntries.get('xl/sharedStrings.xml') ?? '';
    const sharedStrings = this.parseSharedStrings(sharedStringsXml);

    // Parse workbook for sheet names
    const workbookXml = zipEntries.get('xl/workbook.xml') ?? '';
    const sheetNames = this.parseSheetNames(workbookXml);

    // Parse each worksheet
    const sheets: ExcelSheet[] = [];
    for (let idx = 0; idx < sheetNames.length; idx++) {
      const sheetXml = zipEntries.get(`xl/worksheets/sheet${idx + 1}.xml`);
      if (!sheetXml) continue;

      const rows = this.parseWorksheet(sheetXml, sharedStrings);
      sheets.push({ name: sheetNames[idx], rows });
    }

    return sheets;
  }

  private async readZipEntries(data: Uint8Array, options: ParseOptions): Promise<Map<string, string>> {
    const entries = new Map<string, string>();

    // Minimal ZIP parser: read local file headers and extract entries
    let offset = 0;
    let totalUncompressed = 0;

    while (offset < data.length - 4) {
      // Check for local file header signature (PK\x03\x04)
      if (data[offset] !== 0x50 || data[offset + 1] !== 0x4b || data[offset + 2] !== 0x03 || data[offset + 3] !== 0x04) {
        break; // No more local file headers
      }

      const compressionMethod = data[offset + 8] | (data[offset + 9] << 8);
      const compressedSize = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24);
      const uncompressedSize = data[offset + 22] | (data[offset + 23] << 8) | (data[offset + 24] << 16) | (data[offset + 25] << 24);
      const filenameLen = data[offset + 26] | (data[offset + 27] << 8);
      const extraLen = data[offset + 28] | (data[offset + 29] << 8);

      const filename = new TextDecoder().decode(data.slice(offset + 30, offset + 30 + filenameLen));
      const dataStart = offset + 30 + filenameLen + extraLen;

      // Zip bomb check
      totalUncompressed += uncompressedSize;
      detectZipBomb(data.byteLength, totalUncompressed, options.filename, options.orgId);

      if (compressedSize > 0 && (filename.endsWith('.xml') || filename.endsWith('.rels'))) {
        const compressed = data.slice(dataStart, dataStart + compressedSize);

        if (compressionMethod === 0) {
          // Stored (no compression)
          entries.set(filename, new TextDecoder().decode(compressed));
        } else if (compressionMethod === 8) {
          // Deflated — use DecompressionStream
          try {
            const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            const decompressed = await new Response(stream).text();
            entries.set(filename, decompressed);
          } catch {
            // Skip corrupt entries
          }
        }
      }

      offset = dataStart + compressedSize;
    }

    return entries;
  }

  private parseSharedStrings(xml: string): string[] {
    const strings: string[] = [];
    // Extract <t>...</t> elements from shared strings
    const regex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(xml)) !== null) {
      strings.push(this.decodeXmlEntities(match[1]));
    }
    return strings;
  }

  private parseSheetNames(xml: string): string[] {
    const names: string[] = [];
    const regex = /<sheet[^>]+name="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(xml)) !== null) {
      names.push(this.decodeXmlEntities(match[1]));
    }
    return names;
  }

  private parseWorksheet(xml: string, sharedStrings: string[]): string[][] {
    const rows: string[][] = [];

    // Match each <row> element
    const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(xml)) !== null) {
      const rowContent = rowMatch[1];
      const cells: string[] = [];

      // Match each <c> element
      const cellRegex = /<c\s+r="([A-Z]+)(\d+)"[^>]*(?:\s+t="([^"]*)")?[^>]*>(?:[\s\S]*?<v>([\s\S]*?)<\/v>)?[\s\S]*?<\/c>/g;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        const colLetters = cellMatch[1];
        const cellType = cellMatch[3];
        const rawValue = cellMatch[4] ?? '';

        const colIndex = this.columnLetterToIndex(colLetters);

        // Pad cells array to ensure correct column positioning
        while (cells.length <= colIndex) {
          cells.push('');
        }

        if (cellType === 's') {
          // Shared string reference
          const idx = parseInt(rawValue, 10);
          cells[colIndex] = sharedStrings[idx] ?? '';
        } else {
          cells[colIndex] = this.decodeXmlEntities(rawValue);
        }
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    return rows;
  }

  private columnLetterToIndex(letters: string): number {
    let index = 0;
    for (let i = 0; i < letters.length; i++) {
      index = index * 26 + (letters.charCodeAt(i) - 64);
    }
    return index - 1; // 0-based
  }

  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  private extractName(properties: Record<string, unknown>, headers: string[]): string | undefined {
    const nameFields = ['name', 'full_name', 'fullname', 'company', 'company_name', 'title', 'label'];
    for (const field of nameFields) {
      const match = headers.find((h) => h.toLowerCase().replace(/[\s_-]/g, '') === field.replace(/_/g, ''));
      if (match && properties[match]) {
        return String(properties[match]);
      }
    }
    return undefined;
  }
}

interface ExcelSheet {
  name: string;
  rows: string[][];
}

// ── PDF Parser ───────────────────────────────────────────────────

export class PDFParser implements FileParser {
  readonly supportedExtensions = ['.pdf'];
  readonly supportedMimeTypes = ['application/pdf'];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType));
  }

  async parse(data: Uint8Array, options: ParseOptions): Promise<NormalisedEntity[]> {
    enforceFileSize(data, options.filename, options.orgId);

    // Validate PDF header
    const header = new TextDecoder().decode(data.slice(0, 5));
    if (!header.startsWith('%PDF-')) {
      throw new FileCorruptError(
        `File ${options.filename} is not a valid PDF (missing %PDF- header)`,
        { orgId: options.orgId },
      );
    }

    // Check for encrypted PDF
    const textSample = new TextDecoder('latin1').decode(data.slice(0, Math.min(data.length, 10240)));
    if (textSample.includes('/Encrypt')) {
      throw new FileCorruptError(
        `File ${options.filename} is password-protected — cannot parse encrypted PDFs`,
        { orgId: options.orgId },
      );
    }

    // Extract text content from PDF using a stream-based approach
    const textContent = this.extractPDFText(data);

    if (!textContent.trim()) {
      // Possibly a scanned/image-only PDF
      return [{
        id: `pdf-${options.sourceId}-0`,
        orgId: options.orgId,
        sourceId: options.sourceId,
        sourceSystem: `file:${options.filename}`,
        entityType: EntityType.Document,
        name: options.filename.replace('.pdf', ''),
        properties: {
          _fileType: 'pdf',
          _textContent: '',
          _isImageOnly: true,
          _pageCount: this.estimatePageCount(data),
        },
        extractedAt: new Date().toISOString(),
        confidence: 0.3,
      }];
    }

    // Split by pages or logical sections
    const sections = this.splitIntoSections(textContent);
    const entities: NormalisedEntity[] = [];

    // Create one entity for the whole document
    entities.push({
      id: `pdf-${options.sourceId}-doc`,
      orgId: options.orgId,
      sourceId: options.sourceId,
      sourceSystem: `file:${options.filename}`,
      entityType: EntityType.Document,
      name: options.filename.replace('.pdf', ''),
      properties: {
        _fileType: 'pdf',
        _textContent: textContent.slice(0, 100_000), // Cap at 100K chars
        _sections: sections.slice(0, 100),
        _pageCount: this.estimatePageCount(data),
      },
      extractedAt: new Date().toISOString(),
      confidence: 0.7,
    });

    // Try to detect if this PDF contains structured data (tables, invoices, etc.)
    const detectedType = this.detectDocumentType(textContent);
    if (detectedType !== EntityType.Document) {
      entities[0].entityType = detectedType;
      entities[0].confidence = 0.6;
    }

    return entities;
  }

  private extractPDFText(data: Uint8Array): string {
    // Lightweight text extraction: find text streams and decode them
    // This handles the common case of text-based PDFs without requiring a full parser
    const text: string[] = [];
    const raw = new TextDecoder('latin1').decode(data);

    // Extract text from BT...ET (Begin Text / End Text) operators
    const btRegex = /BT\s([\s\S]*?)ET/g;
    let match: RegExpExecArray | null;

    while ((match = btRegex.exec(raw)) !== null) {
      const block = match[1];
      // Extract text from Tj and TJ operators
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        text.push(this.decodePDFString(tjMatch[1]));
      }

      // TJ operator: array of strings and positioning
      const tjArrayRegex = /\[((?:[^[\]]*|\([^)]*\))*)\]\s*TJ/g;
      let arrMatch: RegExpExecArray | null;
      while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
        const parts = arrMatch[1];
        const strRegex = /\(([^)]*)\)/g;
        let strMatch: RegExpExecArray | null;
        while ((strMatch = strRegex.exec(parts)) !== null) {
          text.push(this.decodePDFString(strMatch[1]));
        }
      }
    }

    // Also try to extract text from decoded streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    while ((match = streamRegex.exec(raw)) !== null) {
      const streamData = match[1];
      // Simple text extraction from uncompressed streams
      const btInStream = /BT\s([\s\S]*?)ET/g;
      let btMatch: RegExpExecArray | null;
      while ((btMatch = btInStream.exec(streamData)) !== null) {
        const block = btMatch[1];
        const tjRegex2 = /\(([^)]*)\)\s*Tj/g;
        let tjMatch2: RegExpExecArray | null;
        while ((tjMatch2 = tjRegex2.exec(block)) !== null) {
          text.push(this.decodePDFString(tjMatch2[1]));
        }
      }
    }

    return text.join(' ').replace(/\s+/g, ' ').trim();
  }

  private decodePDFString(s: string): string {
    // Handle PDF escape sequences
    return s
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\\([()])/g, '$1');
  }

  private estimatePageCount(data: Uint8Array): number {
    const raw = new TextDecoder('latin1').decode(data);
    // Count /Type /Page occurrences (not /Pages)
    const matches = raw.match(/\/Type\s*\/Page\b(?!s)/g);
    return matches?.length ?? 1;
  }

  private splitIntoSections(text: string): string[] {
    // Split on common section markers
    const sections = text.split(/(?:\n\s*\n|\r\n\s*\r\n)/);
    return sections.filter((s) => s.trim().length > 10);
  }

  private detectDocumentType(text: string): EntityType {
    const lower = text.toLowerCase();

    if (lower.includes('invoice') && (lower.includes('total') || lower.includes('amount due'))) {
      return EntityType.Invoice;
    }
    if (lower.includes('contract') || lower.includes('agreement') || lower.includes('terms and conditions')) {
      return EntityType.Document;
    }
    if (lower.includes('resume') || lower.includes('curriculum vitae') || lower.includes('cv')) {
      return EntityType.Person;
    }
    if (lower.includes('purchase order') || lower.includes('p.o.')) {
      return EntityType.Transaction;
    }

    return EntityType.Document;
  }
}

// ── Word (.docx) Parser ──────────────────────────────────────────

export class WordParser implements FileParser {
  readonly supportedExtensions = ['.docx'];
  readonly supportedMimeTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType));
  }

  async parse(data: Uint8Array, options: ParseOptions): Promise<NormalisedEntity[]> {
    enforceFileSize(data, options.filename, options.orgId);

    // DOCX is a ZIP file containing XML
    if (!this.isValidZip(data)) {
      throw new FileCorruptError(
        `File ${options.filename} appears to be corrupt or password-protected`,
        { orgId: options.orgId },
      );
    }

    let documentXml: string;
    try {
      documentXml = await this.extractDocumentXml(data, options);
    } catch (err) {
      if (err instanceof FileCorruptError || err instanceof FileSizeLimitError) throw err;
      throw new FileCorruptError(
        `Failed to parse ${options.filename}: ${(err as Error).message}`,
        { orgId: options.orgId, cause: err as Error },
      );
    }

    const textContent = this.extractTextFromDocXml(documentXml);

    return [{
      id: `docx-${options.sourceId}-doc`,
      orgId: options.orgId,
      sourceId: options.sourceId,
      sourceSystem: `file:${options.filename}`,
      entityType: EntityType.Document,
      name: options.filename.replace('.docx', ''),
      properties: {
        _fileType: 'docx',
        _textContent: textContent.slice(0, 100_000),
        _wordCount: textContent.split(/\s+/).length,
      },
      extractedAt: new Date().toISOString(),
      confidence: 0.75,
    }];
  }

  private isValidZip(data: Uint8Array): boolean {
    return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
  }

  private async extractDocumentXml(data: Uint8Array, options: ParseOptions): Promise<string> {
    // Read ZIP and find word/document.xml
    let offset = 0;
    let totalUncompressed = 0;

    while (offset < data.length - 4) {
      if (data[offset] !== 0x50 || data[offset + 1] !== 0x4b || data[offset + 2] !== 0x03 || data[offset + 3] !== 0x04) {
        break;
      }

      const compressionMethod = data[offset + 8] | (data[offset + 9] << 8);
      const compressedSize = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24);
      const uncompressedSize = data[offset + 22] | (data[offset + 23] << 8) | (data[offset + 24] << 16) | (data[offset + 25] << 24);
      const filenameLen = data[offset + 26] | (data[offset + 27] << 8);
      const extraLen = data[offset + 28] | (data[offset + 29] << 8);

      const filename = new TextDecoder().decode(data.slice(offset + 30, offset + 30 + filenameLen));
      const dataStart = offset + 30 + filenameLen + extraLen;

      totalUncompressed += uncompressedSize;
      detectZipBomb(data.byteLength, totalUncompressed, options.filename, options.orgId);

      if (filename === 'word/document.xml' && compressedSize > 0) {
        const compressed = data.slice(dataStart, dataStart + compressedSize);

        if (compressionMethod === 0) {
          return new TextDecoder().decode(compressed);
        } else if (compressionMethod === 8) {
          const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return await new Response(stream).text();
        }
      }

      offset = dataStart + compressedSize;
    }

    throw new FileCorruptError(
      `Could not find word/document.xml in ${options.filename}`,
      { orgId: options.orgId },
    );
  }

  private extractTextFromDocXml(xml: string): string {
    // Extract text from <w:t> elements
    const parts: string[] = [];
    const regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      parts.push(match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
      );
    }

    // Also detect paragraph breaks
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
}

// ── Schema Inference ─────────────────────────────────────────────

export interface InferredSchema {
  inferredEntityType: EntityType;
  confidence: number;
  isShadowCRM: boolean;
  detectedFields: {
    personFields: string[];
    companyFields: string[];
    financialFields: string[];
    dateFields: string[];
    contactFields: string[];
  };
}

const PERSON_FIELD_PATTERNS = /^(first.?name|last.?name|full.?name|employee|staff|contact.?name|person|salutation|title|job.?title|role|department|manager|supervisor)/i;
const COMPANY_FIELD_PATTERNS = /^(company|organisation|organization|org|business|employer|vendor|supplier|customer|client|account.?name)/i;
const FINANCIAL_FIELD_PATTERNS = /^(amount|total|price|cost|revenue|profit|tax|vat|invoice|balance|payment|debit|credit|currency|rate)/i;
const DATE_FIELD_PATTERNS = /^(date|created|updated|modified|timestamp|due|start|end|expiry|deadline|born|hired|joined)/i;
const CONTACT_FIELD_PATTERNS = /^(email|phone|tel|mobile|fax|address|city|state|country|postcode|zip|website|url|linkedin)/i;

export function inferSpreadsheetSchema(headers: string[]): InferredSchema {
  const normalised = headers.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));

  const personFields = headers.filter((_, i) => PERSON_FIELD_PATTERNS.test(normalised[i]));
  const companyFields = headers.filter((_, i) => COMPANY_FIELD_PATTERNS.test(normalised[i]));
  const financialFields = headers.filter((_, i) => FINANCIAL_FIELD_PATTERNS.test(normalised[i]));
  const dateFields = headers.filter((_, i) => DATE_FIELD_PATTERNS.test(normalised[i]));
  const contactFields = headers.filter((_, i) => CONTACT_FIELD_PATTERNS.test(normalised[i]));

  // Shadow CRM detection: spreadsheet being used as a CRM
  const isShadowCRM = (personFields.length > 0 || companyFields.length > 0) &&
    contactFields.length >= 1 &&
    headers.length >= 4;

  // Determine entity type based on field distribution
  let inferredEntityType: EntityType;
  let confidence: number;

  if (financialFields.length >= 2) {
    inferredEntityType = EntityType.Invoice;
    confidence = 0.8;
  } else if (personFields.length >= 2 && contactFields.length >= 1) {
    inferredEntityType = EntityType.Person;
    confidence = 0.85;
  } else if (companyFields.length >= 1 && contactFields.length >= 1) {
    inferredEntityType = EntityType.Company;
    confidence = 0.8;
  } else if (personFields.length >= 1) {
    inferredEntityType = EntityType.Employee;
    confidence = 0.6;
  } else if (companyFields.length >= 1) {
    inferredEntityType = EntityType.Company;
    confidence = 0.6;
  } else {
    inferredEntityType = EntityType.Document;
    confidence = 0.3;
  }

  if (isShadowCRM) {
    confidence = Math.min(confidence + 0.1, 1.0);
  }

  return {
    inferredEntityType,
    confidence,
    isShadowCRM,
    detectedFields: {
      personFields,
      companyFields,
      financialFields,
      dateFields,
      contactFields,
    },
  };
}

// ── Parser Registry ──────────────────────────────────────────────

const parsers: FileParser[] = [
  new CSVParser(),
  new ExcelParser(),
  new PDFParser(),
  new WordParser(),
];

export function getParser(filename: string, mimeType?: string): FileParser | undefined {
  return parsers.find((p) => p.canParse(filename, mimeType));
}

export function getSupportedExtensions(): string[] {
  return parsers.flatMap((p) => p.supportedExtensions);
}

export async function parseFile(
  data: Uint8Array,
  options: ParseOptions,
): Promise<NormalisedEntity[]> {
  const parser = getParser(options.filename, options.mimeType);
  if (!parser) {
    throw new FileCorruptError(
      `Unsupported file type: ${options.filename}`,
      { orgId: options.orgId },
    );
  }
  return parser.parse(data, options);
}
