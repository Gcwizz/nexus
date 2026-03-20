import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@nexus/config';

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    const config = env();
    _client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      credentials: config.S3_ACCESS_KEY && config.S3_SECRET_KEY
        ? { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY }
        : undefined,
      forcePathStyle: true,
    });
  }
  return _client;
}

function bucket(): string {
  return env().S3_BUCKET;
}

// ── Per-org partitioned storage ──────────────────────────────────
//
// All objects are stored under: {orgId}/{category}/{filename}
// This ensures data isolation at the storage level.
//

function orgKey(orgId: string, category: string, filename: string): string {
  return `${orgId}/${category}/${filename}`;
}

export const storage = {
  async put(orgId: string, category: string, filename: string, data: Buffer | string): Promise<void> {
    await client().send(new PutObjectCommand({
      Bucket: bucket(),
      Key: orgKey(orgId, category, filename),
      Body: typeof data === 'string' ? Buffer.from(data) : data,
    }));
  },

  async get(orgId: string, category: string, filename: string): Promise<Buffer | null> {
    try {
      const response = await client().send(new GetObjectCommand({
        Bucket: bucket(),
        Key: orgKey(orgId, category, filename),
      }));
      if (!response.Body) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error: unknown) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  },

  async putJSON(orgId: string, category: string, filename: string, data: unknown): Promise<void> {
    await storage.put(orgId, category, filename, JSON.stringify(data));
  },

  async getJSON<T>(orgId: string, category: string, filename: string): Promise<T | null> {
    const buf = await storage.get(orgId, category, filename);
    if (!buf) return null;
    return JSON.parse(buf.toString()) as T;
  },

  async list(orgId: string, category: string): Promise<string[]> {
    const prefix = `${orgId}/${category}/`;
    const response = await client().send(new ListObjectsV2Command({
      Bucket: bucket(),
      Prefix: prefix,
    }));
    return (response.Contents ?? [])
      .map((obj) => obj.Key?.replace(prefix, '') ?? '')
      .filter(Boolean);
  },

  async delete(orgId: string, category: string, filename: string): Promise<void> {
    await client().send(new DeleteObjectCommand({
      Bucket: bucket(),
      Key: orgKey(orgId, category, filename),
    }));
  },
};
