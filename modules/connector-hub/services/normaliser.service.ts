import { type NormalisedEntity, EntityType, type DataProvenance } from '@nexus/contracts/entities';

// ── Entity Classification ────────────────────────────────────────

interface ClassificationResult {
  entityType: EntityType;
  confidence: number;
  reasoning: string;
}

/**
 * Classify an entity based on its field names and data patterns.
 * Uses heuristics rather than LLM calls for speed at ingestion time.
 */
export function classifyEntity(properties: Record<string, unknown>): ClassificationResult {
  const keys = Object.keys(properties).map((k) => k.toLowerCase().replace(/[\s_-]+/g, ''));
  const values = Object.values(properties).map((v) => String(v ?? '').toLowerCase());

  const scores: Record<string, number> = {};
  const reasons: string[] = [];

  // Person signals
  const personKeywords = ['firstname', 'lastname', 'fullname', 'email', 'phone', 'dob', 'dateofbirth', 'jobtitle', 'role', 'manager'];
  const personScore = keys.filter((k) => personKeywords.some((pk) => k.includes(pk))).length;
  if (personScore > 0) {
    scores[EntityType.Person] = (scores[EntityType.Person] ?? 0) + personScore * 2;
    reasons.push(`person fields: ${personScore}`);
  }

  // Employee signals (person + employment context)
  const employeeKeywords = ['employee', 'employeeid', 'department', 'hiredate', 'salary', 'startdate', 'manager', 'reportsto'];
  const employeeScore = keys.filter((k) => employeeKeywords.some((ek) => k.includes(ek))).length;
  if (employeeScore > 0) {
    scores[EntityType.Employee] = (scores[EntityType.Employee] ?? 0) + employeeScore * 2.5;
    reasons.push(`employee fields: ${employeeScore}`);
  }

  // Company signals
  const companyKeywords = ['company', 'companyname', 'industry', 'revenue', 'employees', 'numberofemployees', 'domain', 'website', 'annualrevenue'];
  const companyScore = keys.filter((k) => companyKeywords.some((ck) => k.includes(ck))).length;
  if (companyScore > 0) {
    scores[EntityType.Company] = (scores[EntityType.Company] ?? 0) + companyScore * 2;
    reasons.push(`company fields: ${companyScore}`);
  }

  // Invoice signals
  const invoiceKeywords = ['invoice', 'invoicenumber', 'invoiceid', 'totalamount', 'subtotal', 'tax', 'vat', 'duedate', 'paymentterms', 'amountdue', 'lineitem'];
  const invoiceScore = keys.filter((k) => invoiceKeywords.some((ik) => k.includes(ik))).length;
  if (invoiceScore > 0) {
    scores[EntityType.Invoice] = (scores[EntityType.Invoice] ?? 0) + invoiceScore * 2;
    reasons.push(`invoice fields: ${invoiceScore}`);
  }

  // Transaction signals
  const transactionKeywords = ['amount', 'dealname', 'dealstage', 'pipeline', 'closedate', 'opportunity', 'stage', 'probability', 'value'];
  const transactionScore = keys.filter((k) => transactionKeywords.some((tk) => k.includes(tk))).length;
  if (transactionScore > 0) {
    scores[EntityType.Transaction] = (scores[EntityType.Transaction] ?? 0) + transactionScore * 1.5;
    reasons.push(`transaction fields: ${transactionScore}`);
  }

  // Product signals
  const productKeywords = ['product', 'productname', 'sku', 'upc', 'price', 'category', 'inventory', 'stock', 'quantity'];
  const productScore = keys.filter((k) => productKeywords.some((pk) => k.includes(pk))).length;
  if (productScore > 0) {
    scores[EntityType.Product] = (scores[EntityType.Product] ?? 0) + productScore * 2;
    reasons.push(`product fields: ${productScore}`);
  }

  // Customer / Supplier disambiguation
  const customerKeywords = ['customer', 'customerid', 'customername', 'purchasehistory', 'loyaltytier'];
  const supplierKeywords = ['supplier', 'supplierid', 'suppliername', 'vendor', 'vendorid'];
  const customerScore = keys.filter((k) => customerKeywords.some((ck) => k.includes(ck))).length;
  const supplierScore = keys.filter((k) => supplierKeywords.some((sk) => k.includes(sk))).length;
  if (customerScore > 0) scores[EntityType.Customer] = (scores[EntityType.Customer] ?? 0) + customerScore * 2.5;
  if (supplierScore > 0) scores[EntityType.Supplier] = (scores[EntityType.Supplier] ?? 0) + supplierScore * 2.5;

  // Project signals
  const projectKeywords = ['project', 'projectname', 'projectid', 'milestone', 'deadline', 'assignee', 'sprint', 'status', 'priority'];
  const projectScore = keys.filter((k) => projectKeywords.some((pk) => k.includes(pk))).length;
  if (projectScore > 0) {
    scores[EntityType.Project] = (scores[EntityType.Project] ?? 0) + projectScore * 2;
    reasons.push(`project fields: ${projectScore}`);
  }

  // Communication signals
  const commKeywords = ['subject', 'from', 'to', 'cc', 'bcc', 'body', 'sentdate', 'receiveddate', 'messageid', 'threadid'];
  const commScore = keys.filter((k) => commKeywords.some((ck) => k.includes(ck))).length;
  if (commScore >= 2) {
    scores[EntityType.Communication] = (scores[EntityType.Communication] ?? 0) + commScore * 2;
    reasons.push(`communication fields: ${commScore}`);
  }

  // Value pattern detection
  const hasEmailPattern = values.some((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  const hasCurrencyPattern = values.some((v) => /^[$\xA3\u20AC]?\s?[\d,]+\.?\d{0,2}$/.test(v));
  const hasPhonePattern = values.some((v) => /^[\d\s+()-]{7,15}$/.test(v));

  if (hasEmailPattern) {
    scores[EntityType.Person] = (scores[EntityType.Person] ?? 0) + 1;
    scores[EntityType.Employee] = (scores[EntityType.Employee] ?? 0) + 0.5;
  }
  if (hasCurrencyPattern) {
    scores[EntityType.Invoice] = (scores[EntityType.Invoice] ?? 0) + 1;
    scores[EntityType.Transaction] = (scores[EntityType.Transaction] ?? 0) + 1;
  }
  if (hasPhonePattern) {
    scores[EntityType.Person] = (scores[EntityType.Person] ?? 0) + 0.5;
    scores[EntityType.Company] = (scores[EntityType.Company] ?? 0) + 0.5;
  }

  // Find the highest scoring type
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return { entityType: EntityType.Document, confidence: 0.2, reasoning: 'No recognisable field patterns' };
  }

  const [bestType, bestScore] = entries[0];
  const secondScore = entries[1]?.[1] ?? 0;

  // Confidence based on how decisive the classification is
  const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);
  const dominance = totalScore > 0 ? bestScore / totalScore : 0;
  const confidence = Math.min(0.95, 0.3 + dominance * 0.6 + Math.min(bestScore, 6) * 0.05);

  return {
    entityType: bestType as EntityType,
    confidence,
    reasoning: reasons.join('; '),
  };
}

// ── Data Normalisation ───────────────────────────────────────────

export interface NormaliseOptions {
  orgId: string;
  sourceId: string;
  sourceSystem: string;
}

/**
 * Takes raw data records from any connector/parser and normalises them
 * into NormalisedEntity format with entity type classification and
 * data provenance tagging.
 */
export function normaliseRecords(
  records: Record<string, unknown>[],
  options: NormaliseOptions,
): { entities: NormalisedEntity[]; provenance: DataProvenance[] } {
  const entities: NormalisedEntity[] = [];
  const provenance: DataProvenance[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const classification = classifyEntity(record);
    const entityId = generateEntityId(options.sourceSystem, options.sourceId, i, record);
    const name = extractEntityName(record, classification.entityType);
    const now = new Date().toISOString();

    // Normalise field names: lowercase, underscored
    const normalisedProperties = normaliseFieldNames(record);

    const entity: NormalisedEntity = {
      id: entityId,
      orgId: options.orgId,
      sourceId: options.sourceId,
      sourceSystem: options.sourceSystem,
      entityType: classification.entityType,
      name,
      properties: normalisedProperties,
      extractedAt: now,
      confidence: classification.confidence,
    };

    entities.push(entity);

    provenance.push({
      entityId,
      sourceSystem: options.sourceSystem,
      sourceId: options.sourceId,
      extractedAt: now,
      transformations: [
        'field_normalisation',
        `entity_classification:${classification.entityType}`,
        `confidence:${classification.confidence.toFixed(2)}`,
      ],
      confidence: classification.confidence,
    });
  }

  return { entities, provenance };
}

/**
 * Re-normalise entities that already have a type but may need
 * provenance tagging or confidence adjustment.
 */
export function tagProvenance(
  entities: NormalisedEntity[],
  transformations: string[] = [],
): DataProvenance[] {
  return entities.map((entity) => ({
    entityId: entity.id,
    sourceSystem: entity.sourceSystem,
    sourceId: entity.sourceId,
    extractedAt: entity.extractedAt,
    transformations: [
      ...transformations,
      `original_type:${entity.entityType}`,
      `confidence:${entity.confidence.toFixed(2)}`,
    ],
    confidence: entity.confidence,
  }));
}

/**
 * Merge entities from multiple sources, deduplicating where possible
 * based on name similarity and property overlap.
 */
export function deduplicateEntities(entities: NormalisedEntity[]): NormalisedEntity[] {
  const seen = new Map<string, NormalisedEntity>();
  const result: NormalisedEntity[] = [];

  for (const entity of entities) {
    const dedupeKey = buildDedupeKey(entity);
    const existing = seen.get(dedupeKey);

    if (existing) {
      // Merge: keep the higher confidence one, merge properties
      if (entity.confidence > existing.confidence) {
        const merged: NormalisedEntity = {
          ...entity,
          properties: { ...existing.properties, ...entity.properties },
        };
        seen.set(dedupeKey, merged);
        const idx = result.indexOf(existing);
        if (idx >= 0) result[idx] = merged;
      } else {
        existing.properties = { ...entity.properties, ...existing.properties };
      }
    } else {
      seen.set(dedupeKey, entity);
      result.push(entity);
    }
  }

  return result;
}

// ── Internal Helpers ─────────────────────────────────────────────

function generateEntityId(
  sourceSystem: string,
  sourceId: string,
  index: number,
  record: Record<string, unknown>,
): string {
  // Try to use existing ID from the record
  const existingId = record['id'] ?? record['Id'] ?? record['ID'] ?? record['_id'];
  if (existingId && typeof existingId === 'string') {
    return `${sourceSystem}-${existingId}`;
  }
  // Fall back to index-based ID
  return `${sourceSystem}-${sourceId}-${index}`;
}

function extractEntityName(record: Record<string, unknown>, entityType: EntityType): string {
  const keys = Object.keys(record);
  const keyMap = new Map(keys.map((k) => [k.toLowerCase().replace(/[\s_-]+/g, ''), k]));

  // Entity-type-specific name extraction
  switch (entityType) {
    case EntityType.Person:
    case EntityType.Employee: {
      const firstName = record[keyMap.get('firstname') ?? ''] ?? record[keyMap.get('first_name') ?? ''];
      const lastName = record[keyMap.get('lastname') ?? ''] ?? record[keyMap.get('last_name') ?? ''];
      if (firstName || lastName) {
        return [firstName, lastName].filter(Boolean).join(' ');
      }
      const fullName = record[keyMap.get('fullname') ?? ''] ?? record[keyMap.get('name') ?? ''] ?? record[keyMap.get('contactname') ?? ''];
      if (fullName) return String(fullName);
      break;
    }
    case EntityType.Company:
    case EntityType.Customer:
    case EntityType.Supplier: {
      const companyName = record[keyMap.get('companyname') ?? ''] ?? record[keyMap.get('company') ?? ''] ?? record[keyMap.get('name') ?? ''] ?? record[keyMap.get('organisationname') ?? ''];
      if (companyName) return String(companyName);
      break;
    }
    case EntityType.Invoice: {
      const invoiceNum = record[keyMap.get('invoicenumber') ?? ''] ?? record[keyMap.get('invoiceid') ?? ''];
      if (invoiceNum) return `Invoice ${invoiceNum}`;
      break;
    }
    case EntityType.Product: {
      const productName = record[keyMap.get('productname') ?? ''] ?? record[keyMap.get('product') ?? ''] ?? record[keyMap.get('name') ?? ''];
      if (productName) return String(productName);
      break;
    }
    case EntityType.Project: {
      const projectName = record[keyMap.get('projectname') ?? ''] ?? record[keyMap.get('project') ?? ''] ?? record[keyMap.get('name') ?? ''];
      if (projectName) return String(projectName);
      break;
    }
    case EntityType.Transaction: {
      const dealName = record[keyMap.get('dealname') ?? ''] ?? record[keyMap.get('opportunityname') ?? ''] ?? record[keyMap.get('name') ?? ''];
      if (dealName) return String(dealName);
      break;
    }
  }

  // Generic fallback: try common name fields
  const genericNameFields = ['name', 'title', 'label', 'description', 'subject', 'displayname'];
  for (const field of genericNameFields) {
    const key = keyMap.get(field);
    if (key && record[key]) return String(record[key]);
  }

  // Last resort
  return `${entityType} (unnamed)`;
}

function normaliseFieldNames(record: Record<string, unknown>): Record<string, unknown> {
  const normalised: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    // Convert to snake_case, preserving existing underscores
    const normalisedKey = key
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase()
      .replace(/__+/g, '_');
    normalised[normalisedKey] = value;
  }
  return normalised;
}

function buildDedupeKey(entity: NormalisedEntity): string {
  // Build a key from entity type + normalised name
  const normalisedName = entity.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return `${entity.entityType}:${normalisedName}`;
}
