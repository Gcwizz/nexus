import { type NormalisedEntity, EntityType } from '@nexus/contracts/entities';
import {
  OAuthProviderError,
  OAuthConsentDeniedError,
  TokenExpiredError,
  RateLimitError,
} from '@nexus/contracts/errors';

// ── Provider Interface ───────────────────────────────────────────

export type AuthType = 'oauth' | 'api_key';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string;
}

export interface ConnectorProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface FetchEntitiesOptions {
  orgId: string;
  sourceId: string;
  tokens: OAuthTokens;
  apiKey?: string;
  since?: Date;
  cursor?: string;
  pageSize?: number;
}

export interface FetchEntitiesResult {
  entities: NormalisedEntity[];
  nextCursor?: string;
  hasMore: boolean;
  rateLimitRemaining?: number;
  rateLimitResetAt?: Date;
}

export interface ConnectorProvider {
  readonly name: string;
  readonly displayName: string;
  readonly authType: AuthType;
  readonly scopes: string[];

  getAuthUrl(state: string, config: ConnectorProviderConfig): string;
  exchangeCode(code: string, config: ConnectorProviderConfig): Promise<OAuthTokens>;
  refreshToken(refreshToken: string, config: ConnectorProviderConfig): Promise<OAuthTokens>;
  fetchEntities(options: FetchEntitiesOptions): Promise<FetchEntitiesResult>;
}

// ── HTTP helpers ─────────────────────────────────────────────────

async function safeFetch(
  url: string,
  init: RequestInit,
  context: { provider: string; orgId?: string },
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new OAuthProviderError(
      `Network error calling ${context.provider}: ${(err as Error).message}`,
      { orgId: context.orgId, cause: err as Error },
    );
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const resetAt = retryAfter
      ? new Date(Date.now() + parseInt(retryAfter, 10) * 1000)
      : undefined;
    throw new RateLimitError(
      `Rate limited by ${context.provider}. Retry after ${retryAfter ?? 'unknown'}s`,
      { orgId: context.orgId },
    );
  }

  if (response.status === 401) {
    throw new TokenExpiredError(
      `Token expired or revoked for ${context.provider}`,
      { orgId: context.orgId },
    );
  }

  if (!response.ok) {
    throw new OAuthProviderError(
      `${context.provider} returned HTTP ${response.status}: ${await response.text()}`,
      { orgId: context.orgId },
    );
  }

  return response;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
}

// ── Salesforce Provider ──────────────────────────────────────────

export class SalesforceProvider implements ConnectorProvider {
  readonly name = 'salesforce';
  readonly displayName = 'Salesforce';
  readonly authType = 'oauth' as const;
  readonly scopes = ['api', 'refresh_token', 'offline_access'];

  private instanceUrl: string = 'https://login.salesforce.com';

  getAuthUrl(state: string, config: ConnectorProviderConfig): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: this.scopes.join(' '),
      state,
      prompt: 'consent',
    });
    return `${this.instanceUrl}/services/oauth2/authorize?${params}`;
  }

  async exchangeCode(code: string, config: ConnectorProviderConfig): Promise<OAuthTokens> {
    const response = await safeFetch(
      `${this.instanceUrl}/services/oauth2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
        }),
      },
      { provider: this.name },
    );

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      instance_url: string;
      issued_at: string;
    };
    this.instanceUrl = data.instance_url;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(parseInt(data.issued_at, 10) + 7200_000), // SF tokens ~2hr
    };
  }

  async refreshToken(refreshToken: string, config: ConnectorProviderConfig): Promise<OAuthTokens> {
    const response = await safeFetch(
      `${this.instanceUrl}/services/oauth2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
      },
      { provider: this.name },
    );

    const data = await response.json() as {
      access_token: string;
      instance_url: string;
      issued_at: string;
    };
    this.instanceUrl = data.instance_url;

    return {
      accessToken: data.access_token,
      refreshToken, // Salesforce doesn't rotate refresh tokens
      expiresAt: new Date(parseInt(data.issued_at, 10) + 7200_000),
    };
  }

  async fetchEntities(options: FetchEntitiesOptions): Promise<FetchEntitiesResult> {
    const { orgId, sourceId, tokens, since, cursor, pageSize = 200 } = options;

    // SOQL query across standard objects
    const sobjects = [
      { type: 'Account', entityType: EntityType.Company },
      { type: 'Contact', entityType: EntityType.Person },
      { type: 'Opportunity', entityType: EntityType.Transaction },
      { type: 'Lead', entityType: EntityType.Person },
      { type: 'Case', entityType: EntityType.Case },
    ];

    const entities: NormalisedEntity[] = [];
    let nextCursor: string | undefined = cursor;
    let hasMore = false;
    let rateLimitRemaining: number | undefined;
    let rateLimitResetAt: Date | undefined;

    // If a cursor is provided, it's a next-page URL from Salesforce
    if (nextCursor) {
      const resp = await safeFetch(
        `${this.instanceUrl}${nextCursor}`,
        { headers: authHeaders(tokens.accessToken) },
        { provider: this.name, orgId },
      );

      rateLimitRemaining = parseIntOr(resp.headers.get('sforce-limit-info')?.split('/')[0]);
      const result = await resp.json() as SalesforceQueryResult;
      entities.push(...this.normaliseSalesforceRecords(result.records, orgId, sourceId));

      if (result.nextRecordsUrl) {
        return { entities, nextCursor: result.nextRecordsUrl, hasMore: true, rateLimitRemaining };
      }
      return { entities, hasMore: false, rateLimitRemaining };
    }

    // Initial fetch: query each object type
    for (const sobj of sobjects) {
      let whereClause = '';
      if (since) {
        whereClause = ` WHERE LastModifiedDate > ${since.toISOString()}`;
      }
      const query = `SELECT FIELDS(STANDARD) FROM ${sobj.type}${whereClause} LIMIT ${pageSize}`;

      const resp = await safeFetch(
        `${this.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
        { headers: authHeaders(tokens.accessToken) },
        { provider: this.name, orgId },
      );

      rateLimitRemaining = parseIntOr(resp.headers.get('sforce-limit-info')?.split('/')[0]);
      const result = await resp.json() as SalesforceQueryResult;

      for (const record of result.records) {
        entities.push({
          id: `sf-${record.Id}`,
          orgId,
          sourceId,
          sourceSystem: 'salesforce',
          entityType: sobj.entityType,
          name: record.Name ?? record.Subject ?? record.Id,
          properties: record,
          extractedAt: new Date().toISOString(),
          confidence: 0.95,
        });
      }

      if (result.nextRecordsUrl) {
        nextCursor = result.nextRecordsUrl;
        hasMore = true;
        break; // Paginate through this type first
      }
    }

    return { entities, nextCursor, hasMore, rateLimitRemaining, rateLimitResetAt };
  }

  private normaliseSalesforceRecords(
    records: SalesforceRecord[],
    orgId: string,
    sourceId: string,
  ): NormalisedEntity[] {
    return records.map((record) => ({
      id: `sf-${record.Id}`,
      orgId,
      sourceId,
      sourceSystem: 'salesforce',
      entityType: this.classifySalesforceRecord(record),
      name: record.Name ?? record.Subject ?? record.Id,
      properties: record,
      extractedAt: new Date().toISOString(),
      confidence: 0.95,
    }));
  }

  private classifySalesforceRecord(record: SalesforceRecord): EntityType {
    const type = record.attributes?.type;
    switch (type) {
      case 'Account': return EntityType.Company;
      case 'Contact':
      case 'Lead': return EntityType.Person;
      case 'Opportunity': return EntityType.Transaction;
      case 'Case': return EntityType.Case;
      case 'Product2': return EntityType.Product;
      default: return EntityType.Document;
    }
  }
}

interface SalesforceRecord {
  Id: string;
  Name?: string;
  Subject?: string;
  attributes?: { type: string; url: string };
  [key: string]: unknown;
}

interface SalesforceQueryResult {
  totalSize: number;
  done: boolean;
  records: SalesforceRecord[];
  nextRecordsUrl?: string;
}

// ── Xero Provider ────────────────────────────────────────────────

export class XeroProvider implements ConnectorProvider {
  readonly name = 'xero';
  readonly displayName = 'Xero';
  readonly authType = 'oauth' as const;
  readonly scopes = ['openid', 'profile', 'email', 'accounting.transactions.read', 'accounting.contacts.read', 'accounting.settings.read'];

  private readonly authBase = 'https://login.xero.com';
  private readonly apiBase = 'https://api.xero.com/api.xro/2.0';

  getAuthUrl(state: string, config: ConnectorProviderConfig): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: this.scopes.join(' '),
      state,
    });
    return `${this.authBase}/identity/connect/authorize?${params}`;
  }

  async exchangeCode(code: string, config: ConnectorProviderConfig): Promise<OAuthTokens> {
    const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
    const response = await safeFetch(
      `${this.authBase}/identity/connect/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.redirectUri,
        }),
      },
      { provider: this.name },
    );

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async refreshToken(refreshToken: string, config: ConnectorProviderConfig): Promise<OAuthTokens> {
    const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
    const response = await safeFetch(
      `${this.authBase}/identity/connect/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      },
      { provider: this.name },
    );

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async fetchEntities(options: FetchEntitiesOptions): Promise<FetchEntitiesResult> {
    const { orgId, sourceId, tokens, since } = options;

    // First, get the tenant ID from connections endpoint
    const connectionsResp = await safeFetch(
      'https://api.xero.com/connections',
      { headers: authHeaders(tokens.accessToken) },
      { provider: this.name, orgId },
    );
    const connections = await connectionsResp.json() as Array<{ tenantId: string; tenantName: string }>;
    if (connections.length === 0) {
      return { entities: [], hasMore: false };
    }
    const tenantId = connections[0].tenantId;

    const entities: NormalisedEntity[] = [];
    const headers = {
      ...authHeaders(tokens.accessToken),
      'xero-tenant-id': tenantId,
    };

    // Fetch invoices
    const invoiceUrl = since
      ? `${this.apiBase}/Invoices?where=UpdatedDateUTC>DateTime(${formatXeroDate(since)})`
      : `${this.apiBase}/Invoices`;

    const invoicesResp = await safeFetch(invoiceUrl, { headers }, { provider: this.name, orgId });
    const invoicesData = await invoicesResp.json() as { Invoices: XeroInvoice[] };

    for (const inv of invoicesData.Invoices) {
      entities.push({
        id: `xero-inv-${inv.InvoiceID}`,
        orgId,
        sourceId,
        sourceSystem: 'xero',
        entityType: EntityType.Invoice,
        name: `Invoice ${inv.InvoiceNumber ?? inv.InvoiceID}`,
        properties: inv as unknown as Record<string, unknown>,
        extractedAt: new Date().toISOString(),
        confidence: 0.98,
      });
    }

    // Fetch contacts
    const contactUrl = since
      ? `${this.apiBase}/Contacts?where=UpdatedDateUTC>DateTime(${formatXeroDate(since)})`
      : `${this.apiBase}/Contacts`;

    const contactsResp = await safeFetch(contactUrl, { headers }, { provider: this.name, orgId });
    const contactsData = await contactsResp.json() as { Contacts: XeroContact[] };

    for (const contact of contactsData.Contacts) {
      const isSupplier = contact.IsSupplier;
      const isCustomer = contact.IsCustomer;
      entities.push({
        id: `xero-con-${contact.ContactID}`,
        orgId,
        sourceId,
        sourceSystem: 'xero',
        entityType: isSupplier ? EntityType.Supplier : isCustomer ? EntityType.Customer : EntityType.Company,
        name: contact.Name,
        properties: contact as unknown as Record<string, unknown>,
        extractedAt: new Date().toISOString(),
        confidence: 0.95,
      });
    }

    return { entities, hasMore: false };
  }
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Type: string;
  Status: string;
  [key: string]: unknown;
}

interface XeroContact {
  ContactID: string;
  Name: string;
  IsSupplier: boolean;
  IsCustomer: boolean;
  [key: string]: unknown;
}

function formatXeroDate(d: Date): string {
  return `${d.getFullYear()},${d.getMonth() + 1},${d.getDate()}`;
}

// ── HubSpot Provider ─────────────────────────────────────────────

export class HubSpotProvider implements ConnectorProvider {
  readonly name = 'hubspot';
  readonly displayName = 'HubSpot';
  readonly authType = 'oauth' as const;
  readonly scopes = ['crm.objects.contacts.read', 'crm.objects.companies.read', 'crm.objects.deals.read'];

  private readonly authBase = 'https://app.hubspot.com';
  private readonly apiBase = 'https://api.hubapi.com';

  getAuthUrl(state: string, config: ConnectorProviderConfig): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: this.scopes.join(' '),
      state,
    });
    return `${this.authBase}/oauth/authorize?${params}`;
  }

  async exchangeCode(code: string, config: ConnectorProviderConfig): Promise<OAuthTokens> {
    const response = await safeFetch(
      `${this.apiBase}/oauth/v1/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
        }),
      },
      { provider: this.name },
    );

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async refreshToken(refreshToken: string, config: ConnectorProviderConfig): Promise<OAuthTokens> {
    const response = await safeFetch(
      `${this.apiBase}/oauth/v1/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
      },
      { provider: this.name },
    );

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async fetchEntities(options: FetchEntitiesOptions): Promise<FetchEntitiesResult> {
    const { orgId, sourceId, tokens, cursor, pageSize = 100 } = options;

    const objectTypes = [
      { type: 'contacts', entityType: EntityType.Person },
      { type: 'companies', entityType: EntityType.Company },
      { type: 'deals', entityType: EntityType.Transaction },
    ];

    const entities: NormalisedEntity[] = [];
    let nextCursor: string | undefined;
    let hasMore = false;

    for (const obj of objectTypes) {
      const params = new URLSearchParams({
        limit: String(pageSize),
        properties: this.getPropertiesForType(obj.type).join(','),
      });
      if (cursor) {
        params.set('after', cursor);
      }

      const response = await safeFetch(
        `${this.apiBase}/crm/v3/objects/${obj.type}?${params}`,
        { headers: authHeaders(tokens.accessToken) },
        { provider: this.name, orgId },
      );

      const rateLimitRemaining = parseIntOr(response.headers.get('x-hubspot-ratelimit-daily-remaining'));
      const data = await response.json() as HubSpotListResult;

      for (const result of data.results) {
        entities.push({
          id: `hs-${obj.type}-${result.id}`,
          orgId,
          sourceId,
          sourceSystem: 'hubspot',
          entityType: obj.entityType,
          name: this.extractHubSpotName(result, obj.type),
          properties: result.properties,
          extractedAt: new Date().toISOString(),
          confidence: 0.93,
        });
      }

      if (data.paging?.next?.after) {
        nextCursor = data.paging.next.after;
        hasMore = true;
        break; // Paginate through this type first
      }
    }

    return { entities, nextCursor, hasMore };
  }

  private getPropertiesForType(type: string): string[] {
    switch (type) {
      case 'contacts':
        return ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'lifecyclestage'];
      case 'companies':
        return ['name', 'domain', 'industry', 'numberofemployees', 'annualrevenue', 'city', 'state'];
      case 'deals':
        return ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline'];
      default:
        return [];
    }
  }

  private extractHubSpotName(result: HubSpotObject, type: string): string {
    const props = result.properties;
    switch (type) {
      case 'contacts':
        return [props.firstname, props.lastname].filter(Boolean).join(' ') || `Contact ${result.id}`;
      case 'companies':
        return (props.name as string) || `Company ${result.id}`;
      case 'deals':
        return (props.dealname as string) || `Deal ${result.id}`;
      default:
        return `${type} ${result.id}`;
    }
  }
}

interface HubSpotObject {
  id: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface HubSpotListResult {
  results: HubSpotObject[];
  paging?: {
    next?: { after: string };
  };
}

// ── Pipedrive Provider (API Key) ─────────────────────────────────

export class PipedriveProvider implements ConnectorProvider {
  readonly name = 'pipedrive';
  readonly displayName = 'Pipedrive';
  readonly authType = 'api_key' as const;
  readonly scopes: string[] = [];

  private readonly apiBase = 'https://api.pipedrive.com/v1';

  // API key providers don't use OAuth — these throw if called
  getAuthUrl(): string {
    throw new OAuthProviderError('Pipedrive uses API key authentication, not OAuth');
  }

  async exchangeCode(): Promise<OAuthTokens> {
    throw new OAuthProviderError('Pipedrive uses API key authentication, not OAuth');
  }

  async refreshToken(): Promise<OAuthTokens> {
    throw new OAuthProviderError('Pipedrive uses API key authentication, not OAuth');
  }

  /**
   * Validate an API key by making a lightweight request.
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    const resp = await fetch(`${this.apiBase}/users/me?api_token=${apiKey}`, {
      headers: { Accept: 'application/json' },
    });
    return resp.ok;
  }

  async fetchEntities(options: FetchEntitiesOptions): Promise<FetchEntitiesResult> {
    const { orgId, sourceId, apiKey, cursor, pageSize = 100 } = options;

    if (!apiKey) {
      throw new OAuthProviderError('Pipedrive requires an API key for data fetching', { orgId });
    }

    const objectTypes = [
      { endpoint: 'persons', entityType: EntityType.Person },
      { endpoint: 'organizations', entityType: EntityType.Company },
      { endpoint: 'deals', entityType: EntityType.Transaction },
      { endpoint: 'activities', entityType: EntityType.Activity },
    ];

    const entities: NormalisedEntity[] = [];
    let nextCursor: string | undefined;
    let hasMore = false;

    // If cursor, it's "endpoint:start" format
    const resumeFrom = cursor ? parsePipedriveCursor(cursor) : null;
    let skipping = !!resumeFrom;

    for (const obj of objectTypes) {
      if (skipping && obj.endpoint !== resumeFrom?.endpoint) continue;
      skipping = false;

      const start = resumeFrom?.endpoint === obj.endpoint ? resumeFrom.start : 0;
      const params = new URLSearchParams({
        api_token: apiKey,
        start: String(start),
        limit: String(pageSize),
      });

      const resp = await safeFetch(
        `${this.apiBase}/${obj.endpoint}?${params}`,
        { headers: { Accept: 'application/json' } },
        { provider: this.name, orgId },
      );

      const data = await resp.json() as PipedriveListResult;

      if (data.data) {
        for (const item of data.data) {
          entities.push({
            id: `pd-${obj.endpoint}-${item.id}`,
            orgId,
            sourceId,
            sourceSystem: 'pipedrive',
            entityType: obj.entityType,
            name: this.extractName(item, obj.endpoint),
            properties: item as unknown as Record<string, unknown>,
            extractedAt: new Date().toISOString(),
            confidence: 0.93,
          });
        }
      }

      if (data.additional_data?.pagination?.more_items_in_collection) {
        const nextStart = data.additional_data.pagination.next_start;
        nextCursor = `${obj.endpoint}:${nextStart}`;
        hasMore = true;
        break; // Paginate through this type first
      }
    }

    return { entities, nextCursor, hasMore };
  }

  private extractName(item: PipedriveItem, endpoint: string): string {
    switch (endpoint) {
      case 'persons':
        return item.name ?? `Person ${item.id}`;
      case 'organizations':
        return item.name ?? `Organization ${item.id}`;
      case 'deals':
        return item.title ?? `Deal ${item.id}`;
      case 'activities':
        return item.subject ?? `Activity ${item.id}`;
      default:
        return `${endpoint} ${item.id}`;
    }
  }
}

interface PipedriveItem {
  id: number;
  name?: string;
  title?: string;
  subject?: string;
  [key: string]: unknown;
}

interface PipedriveListResult {
  success: boolean;
  data: PipedriveItem[] | null;
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
      next_start: number;
    };
  };
}

function parsePipedriveCursor(cursor: string): { endpoint: string; start: number } {
  const [endpoint, startStr] = cursor.split(':');
  return { endpoint, start: parseInt(startStr, 10) };
}

// ── Provider Registry ────────────────────────────────────────────

const providers = new Map<string, ConnectorProvider>();

function registerProvider(provider: ConnectorProvider): void {
  providers.set(provider.name, provider);
}

// Register MVP providers
registerProvider(new SalesforceProvider());
registerProvider(new XeroProvider());
registerProvider(new HubSpotProvider());
registerProvider(new PipedriveProvider());

export function getProvider(name: string): ConnectorProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new OAuthProviderError(`Unknown provider: ${name}. Available: ${[...providers.keys()].join(', ')}`);
  }
  return provider;
}

export function listProviders(): ConnectorProvider[] {
  return [...providers.values()];
}

// ── Utils ────────────────────────────────────────────────────────

function parseIntOr(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
