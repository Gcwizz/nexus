import type {
  FieldMapping,
  MappingSet,
  SourceRecord,
  TransformedRecord,
  TransformationRule,
} from '../types.js';

// ── Transform Service ───────────────────────────────────────────

export class TransformService {
  /**
   * Transform a batch of source records using field mappings.
   */
  transformBatch(
    records: SourceRecord[],
    mappingSets: MappingSet[],
  ): TransformedRecord[] {
    return records.map((record) => this.transformRecord(record, mappingSets));
  }

  /**
   * Transform a single source record to the target schema.
   */
  transformRecord(
    record: SourceRecord,
    mappingSets: MappingSet[],
  ): TransformedRecord {
    // Find the mapping set for this entity type
    const relevantSets = mappingSets.filter(
      (s) => s.sourceEntityType === record.entityType,
    );

    if (relevantSets.length === 0) {
      return {
        sourceId: record.sourceId,
        sourceSystem: record.sourceSystem,
        targetEntityType: record.entityType,
        data: {},
        transformationsApplied: [],
        warnings: [`No mapping set found for entity type "${record.entityType}"`],
      };
    }

    // Use the first relevant mapping set (highest confidence)
    const mappingSet = relevantSets.sort(
      (a, b) => b.overallConfidence - a.overallConfidence,
    )[0];

    const targetData: Record<string, unknown> = {};
    const transformationsApplied: string[] = [];
    const warnings: string[] = [];

    for (const mapping of mappingSet.mappings) {
      const sourceValue = this.getNestedValue(record.data, mapping.sourceField);

      if (sourceValue === undefined || sourceValue === null) {
        // Null/empty field handling
        if (mapping.transformations.some((t) => t.type === 'default_value')) {
          const defaultRule = mapping.transformations.find((t) => t.type === 'default_value')!;
          targetData[mapping.targetField] = defaultRule.params.value;
          transformationsApplied.push(`default_value:${mapping.targetField}`);
        }
        // Leave as undefined if no default — validation will catch required fields
        continue;
      }

      let transformedValue: unknown = sourceValue;

      // Apply transformation rules in order
      for (const rule of mapping.transformations) {
        try {
          transformedValue = this.applyTransformation(transformedValue, rule);
          transformationsApplied.push(`${rule.type}:${mapping.sourceField}->${mapping.targetField}`);
        } catch (err) {
          warnings.push(
            `Transformation "${rule.type}" failed for field "${mapping.sourceField}": ${(err as Error).message}`,
          );
        }
      }

      // Ensure UTF-8 encoding for strings
      if (typeof transformedValue === 'string') {
        transformedValue = this.normaliseEncoding(transformedValue);
      }

      targetData[mapping.targetField] = transformedValue;
    }

    return {
      sourceId: record.sourceId,
      sourceSystem: record.sourceSystem,
      targetEntityType: mappingSet.targetEntityType,
      data: targetData,
      transformationsApplied,
      warnings,
    };
  }

  /**
   * Apply a single transformation rule to a value.
   */
  applyTransformation(value: unknown, rule: TransformationRule): unknown {
    switch (rule.type) {
      case 'type_cast':
        return this.typeCast(value, rule.params.to as string);

      case 'date_format':
        return this.formatDate(value, rule.params.format as string);

      case 'currency_convert':
        return this.convertCurrency(
          value as number,
          rule.params.from as string,
          rule.params.to as string,
          rule.params.rate as number | undefined,
        );

      case 'string_format':
        return this.formatString(value, rule.params.format as string);

      case 'computed':
        return this.computeField(value, rule.params);

      case 'default_value':
        return value ?? rule.params.value;

      case 'lookup':
        return this.lookupValue(value, rule.params.map as Record<string, unknown>);

      case 'concatenate':
        return this.concatenateValues(value, rule.params);

      case 'split':
        return this.splitValue(value as string, rule.params);

      case 'regex_extract':
        return this.regexExtract(value as string, rule.params.pattern as string);

      default:
        return value;
    }
  }

  // ── Private transformation methods ──────────────────────────────

  private typeCast(value: unknown, targetType: string): unknown {
    switch (targetType) {
      case 'string':
        return String(value);

      case 'number': {
        if (typeof value === 'string') {
          // Strip currency symbols, commas
          const cleaned = value.replace(/[^0-9.\-]/g, '');
          const num = Number(cleaned);
          if (Number.isNaN(num)) throw new Error(`Cannot cast "${value}" to number`);
          return num;
        }
        return Number(value);
      }

      case 'boolean': {
        if (typeof value === 'string') {
          const lower = value.toLowerCase().trim();
          if (['true', 'yes', '1', 'y', 'on'].includes(lower)) return true;
          if (['false', 'no', '0', 'n', 'off', ''].includes(lower)) return false;
          throw new Error(`Cannot cast "${value}" to boolean`);
        }
        return Boolean(value);
      }

      case 'date':
      case 'datetime': {
        const d = new Date(value as string | number);
        if (Number.isNaN(d.getTime())) throw new Error(`Cannot cast "${value}" to date`);
        return targetType === 'date'
          ? d.toISOString().split('T')[0]
          : d.toISOString();
      }

      case 'json':
        return typeof value === 'string' ? JSON.parse(value) : value;

      case 'array':
        return Array.isArray(value) ? value : [value];

      default:
        return value;
    }
  }

  private formatDate(value: unknown, format: string): string {
    const d = new Date(value as string | number);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date value: ${value}`);

    // Simple format token replacement
    return format
      .replace('YYYY', String(d.getFullYear()))
      .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(d.getDate()).padStart(2, '0'))
      .replace('HH', String(d.getHours()).padStart(2, '0'))
      .replace('mm', String(d.getMinutes()).padStart(2, '0'))
      .replace('ss', String(d.getSeconds()).padStart(2, '0'));
  }

  private convertCurrency(
    value: number,
    fromCurrency: string,
    toCurrency: string,
    rate?: number,
  ): number {
    if (fromCurrency === toCurrency) return value;
    if (!rate) throw new Error(`No conversion rate provided for ${fromCurrency} to ${toCurrency}`);
    return Math.round(value * rate * 100) / 100;
  }

  private formatString(value: unknown, format: string): string {
    const str = String(value);
    switch (format) {
      case 'uppercase':
        return str.toUpperCase();
      case 'lowercase':
        return str.toLowerCase();
      case 'trim':
        return str.trim();
      case 'title':
        return str.replace(/\b\w/g, (c) => c.toUpperCase());
      default:
        return str;
    }
  }

  private computeField(value: unknown, params: Record<string, unknown>): unknown {
    const expression = params.expression as string;
    if (!expression) return value;

    // Simple expression evaluation for common patterns
    if (expression === 'full_name') {
      const data = value as Record<string, unknown>;
      return [data.firstName, data.middleName, data.lastName].filter(Boolean).join(' ');
    }

    if (expression === 'year_from_date') {
      const d = new Date(value as string);
      return d.getFullYear();
    }

    return value;
  }

  private lookupValue(value: unknown, map: Record<string, unknown>): unknown {
    const key = String(value);
    return map[key] ?? value;
  }

  private concatenateValues(value: unknown, params: Record<string, unknown>): string {
    const separator = (params.separator as string) ?? ' ';
    const fields = params.fields as string[];
    if (Array.isArray(value) && !fields) {
      return (value as unknown[]).map(String).join(separator);
    }
    if (fields && typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      return fields.map((f) => String(obj[f] ?? '')).filter(Boolean).join(separator);
    }
    return String(value);
  }

  private splitValue(value: string, params: Record<string, unknown>): string[] | string {
    const separator = (params.separator as string) ?? ',';
    const index = params.index as number | undefined;
    const parts = value.split(separator).map((s) => s.trim());
    return index !== undefined ? parts[index] ?? '' : parts;
  }

  private regexExtract(value: string, pattern: string): string | null {
    const match = value.match(new RegExp(pattern));
    return match ? match[1] ?? match[0] : null;
  }

  private normaliseEncoding(value: string): string {
    // Ensure valid UTF-8 by encoding and decoding
    try {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder('utf-8', { fatal: false });
      return decoder.decode(encoder.encode(value));
    } catch {
      return value;
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}

export const transformService = new TransformService();
