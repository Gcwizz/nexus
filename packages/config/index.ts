import { z } from 'zod';

const envSchema = z.object({
  // Core
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // PostgreSQL
  DATABASE_URL: z.string().url(),

  // Neo4j
  NEO4J_URI: z.string(),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // S3
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().default('nexus-data'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  // Claude API
  ANTHROPIC_API_KEY: z.string(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

  // Optional
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function env(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
      throw new Error('Invalid environment variables');
    }
    _env = result.data;
  }
  return _env;
}

export { envSchema };
