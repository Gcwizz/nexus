import type {
  TransformedRecord,
  ValidationResult,
  ValidationError,
  ValidationReport,
  TargetSchema,
  TargetEntitySchema,
  TargetFieldSchema,
} from '../types.js';

// ── Validation Service ──────────────────────────────────────────

export class ValidationService {
  /**
   * Validate a batch of transformed records against the target schema.
   */
  validateBatch(
    records: TransformedRecord[],
    targetSchema: TargetSchema,
  ): ValidationResult[] {
    return records.map((record) => this.validateRecord(record, targetSchema));
  }

  /**
   * Validate a single record against its target entity schema.
   */
  validateRecord(
    record: TransformedRecord,
    targetSchema: TargetSchema,
  ): ValidationResult {
    const entitySchema = targetSchema.entities.find(
      (e) => e.entityType === record.targetEntityType,
    );

    if (!entitySchema) {
      return {
        valid: false,
        record,
        errors: [
          {
            field: '_entityType',
            constraint: 'schema_exists',
            message: `No target schema found for entity type "${record.targetEntityType}"`,
          },
        ],
        warnings: [],
      };
    }

    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    for (const fieldSchema of entitySchema.fields) {
      const value = record.data[fieldSchema.name];
      const fieldErrors = this.validateField(value, fieldSchema);
      errors.push(...fieldErrors);

      // Warn about empty optional fields
      if (
        !fieldSchema.required &&
        (value === undefined || value === null || value === '') &&
        fieldSchema.defaultValue === undefined
      ) {
        warnings.push(`Optional field "${fieldSchema.name}" is empty`);
      }
    }

    // Check for extra fields not in schema
    const schemaFieldNames = new Set(entitySchema.fields.map((f) => f.name));
    for (const key of Object.keys(record.data)) {
      if (!schemaFieldNames.has(key)) {
        warnings.push(`Field "${key}" is not defined in target schema and will be ignored`);
      }
    }

    // Check referential integrity
    const refErrors = this.checkReferentialIntegrity(record, entitySchema);
    errors.push(...refErrors);

    return {
      valid: errors.length === 0,
      record,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single field value against its schema.
   */
  private validateField(value: unknown, schema: TargetFieldSchema): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required check
    if (schema.required && (value === undefined || value === null || value === '')) {
      if (schema.defaultValue === undefined) {
        errors.push({
          field: schema.name,
          constraint: 'required',
          message: `Required field "${schema.name}" is missing or empty`,
          value,
        });
      }
      return errors; // Skip further validation if required field is missing
    }

    // Skip validation for null/undefined optional fields
    if (value === undefined || value === null) return errors;

    // Type checks
    const typeError = this.checkType(value, schema);
    if (typeError) {
      errors.push(typeError);
      return errors; // Skip further checks if type is wrong
    }

    // String constraints
    if (typeof value === 'string') {
      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push({
          field: schema.name,
          constraint: 'max_length',
          message: `Field "${schema.name}" exceeds max length of ${schema.maxLength} (actual: ${value.length})`,
          value,
        });
      }
      if (schema.minLength && value.length < schema.minLength) {
        errors.push({
          field: schema.name,
          constraint: 'min_length',
          message: `Field "${schema.name}" is shorter than min length of ${schema.minLength} (actual: ${value.length})`,
          value,
        });
      }
      if (schema.pattern) {
        try {
          const regex = new RegExp(schema.pattern);
          if (!regex.test(value)) {
            errors.push({
              field: schema.name,
              constraint: 'pattern',
              message: `Field "${schema.name}" does not match pattern "${schema.pattern}"`,
              value,
            });
          }
        } catch {
          // Invalid regex pattern in schema, skip
        }
      }
    }

    // Enum validation
    if (schema.enumValues && schema.enumValues.length > 0) {
      if (!schema.enumValues.includes(String(value))) {
        errors.push({
          field: schema.name,
          constraint: 'enum',
          message: `Field "${schema.name}" value "${value}" is not in allowed values: [${schema.enumValues.join(', ')}]`,
          value,
        });
      }
    }

    // Unique constraint is checked at the batch level in the loader
    return errors;
  }

  /**
   * Check if a value matches the expected type.
   */
  private checkType(value: unknown, schema: TargetFieldSchema): ValidationError | null {
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            field: schema.name,
            constraint: 'type',
            message: `Field "${schema.name}" expected string, got ${typeof value}`,
            value,
          };
        }
        break;

      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return {
            field: schema.name,
            constraint: 'type',
            message: `Field "${schema.name}" expected number, got ${typeof value}`,
            value,
          };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            field: schema.name,
            constraint: 'type',
            message: `Field "${schema.name}" expected boolean, got ${typeof value}`,
            value,
          };
        }
        break;

      case 'date':
      case 'datetime': {
        if (typeof value === 'string') {
          const d = new Date(value);
          if (Number.isNaN(d.getTime())) {
            return {
              field: schema.name,
              constraint: 'type',
              message: `Field "${schema.name}" expected valid date, got "${value}"`,
              value,
            };
          }
        } else {
          return {
            field: schema.name,
            constraint: 'type',
            message: `Field "${schema.name}" expected date string, got ${typeof value}`,
            value,
          };
        }
        break;
      }

      case 'json':
        if (typeof value !== 'object') {
          return {
            field: schema.name,
            constraint: 'type',
            message: `Field "${schema.name}" expected object/JSON, got ${typeof value}`,
            value,
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            field: schema.name,
            constraint: 'type',
            message: `Field "${schema.name}" expected array, got ${typeof value}`,
            value,
          };
        }
        break;

      case 'enum':
        if (typeof value !== 'string') {
          return {
            field: schema.name,
            constraint: 'type',
            message: `Field "${schema.name}" expected string (enum), got ${typeof value}`,
            value,
          };
        }
        break;
    }

    return null;
  }

  /**
   * Check referential integrity (target references exist).
   * This is a basic check — full integrity is enforced by the loader's FK ordering.
   */
  private checkReferentialIntegrity(
    record: TransformedRecord,
    entitySchema: TargetEntitySchema,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const field of entitySchema.fields) {
      if (field.referencesEntity && field.referencesField) {
        const value = record.data[field.name];
        if (value !== undefined && value !== null && value === '') {
          errors.push({
            field: field.name,
            constraint: 'referential_integrity',
            message: `Field "${field.name}" references "${field.referencesEntity}.${field.referencesField}" but value is empty`,
            value,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Generate a validation report from a set of validation results.
   */
  generateReport(
    migrationId: string,
    results: ValidationResult[],
  ): ValidationReport {
    const passCount = results.filter((r) => r.valid).length;
    const failCount = results.filter((r) => !r.valid).length;
    const warningCount = results.reduce((sum, r) => sum + r.warnings.length, 0);

    // Group common issues
    const issueMap = new Map<string, { count: number; fields: Set<string> }>();
    for (const result of results) {
      for (const error of result.errors) {
        const key = `${error.constraint}:${error.message.replace(error.field, '{field}')}`;
        if (!issueMap.has(key)) {
          issueMap.set(key, { count: 0, fields: new Set() });
        }
        const entry = issueMap.get(key)!;
        entry.count++;
        entry.fields.add(error.field);
      }
    }

    const commonIssues = Array.from(issueMap.entries())
      .map(([issue, data]) => ({
        issue,
        count: data.count,
        sampleFields: Array.from(data.fields).slice(0, 5),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Include sample failed records (first 50)
    const failedRecords = results.filter((r) => !r.valid).slice(0, 50);

    return {
      migrationId,
      totalRecords: results.length,
      passCount,
      failCount,
      warningCount,
      commonIssues,
      failedRecords,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const validationService = new ValidationService();
