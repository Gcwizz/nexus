import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@nexus/config';
import * as schema from './schema/index';

let _db: ReturnType<typeof drizzle> | null = null;

export function db() {
  if (!_db) {
    const client = postgres(env().DATABASE_URL);
    _db = drizzle(client, { schema });
  }
  return _db;
}

export { schema };
export * from './schema/index';
