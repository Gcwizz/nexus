import { llmCall } from '@nexus/llm';
import { z } from 'zod';
import type { SpecBundle, SpecModule } from '@nexus/contracts/specs';
import type { ProjectArchitecture, DirectoryEntry, SharedLibrary, GeneratedFile } from '../types.js';

// ── Architecture Generation ──────────────────────────────────────

export async function generateArchitecture(
  specBundle: SpecBundle,
): Promise<ProjectArchitecture> {
  const projectName = `${specBundle.orgId}-app`;

  // Generate directory structure
  const structure = generateProjectStructure(specBundle);

  // Generate package.json
  const packageJson = generatePackageJson(projectName, specBundle);

  // Generate tsconfig
  const tsconfig = generateTsConfig();

  // Generate shared libraries
  const sharedLibraries = generateSharedLibraries(specBundle);

  // Generate database schema from spec data models
  const dbSchema = await generateDatabaseSchema(specBundle);

  // Add root config files to structure
  structure.push(
    { path: 'package.json', type: 'file', content: JSON.stringify(packageJson, null, 2) },
    { path: 'tsconfig.json', type: 'file', content: JSON.stringify(tsconfig, null, 2) },
    { path: 'drizzle.config.ts', type: 'file', content: generateDrizzleConfig() },
    { path: 'tailwind.config.ts', type: 'file', content: generateTailwindConfig() },
    { path: '.env.example', type: 'file', content: generateEnvExample() },
    { path: 'src/db/schema.ts', type: 'file', content: dbSchema },
  );

  // Add shared library files to structure
  for (const lib of sharedLibraries) {
    for (const file of lib.files) {
      structure.push({ path: file.path, type: 'file', content: file.content });
    }
  }

  return {
    name: projectName,
    structure,
    packageJson,
    tsconfig,
    sharedLibraries,
    dbSchema,
  };
}

// ── Project Structure ────────────────────────────────────────────

function generateProjectStructure(specBundle: SpecBundle): DirectoryEntry[] {
  const dirs: DirectoryEntry[] = [
    // Root directories
    { path: 'src', type: 'directory' },
    { path: 'src/routes', type: 'directory' },
    { path: 'src/routes/api', type: 'directory' },
    { path: 'src/components', type: 'directory' },
    { path: 'src/lib', type: 'directory' },
    { path: 'src/lib/auth', type: 'directory' },
    { path: 'src/lib/rbac', type: 'directory' },
    { path: 'src/lib/audit', type: 'directory' },
    { path: 'src/lib/notifications', type: 'directory' },
    { path: 'src/lib/files', type: 'directory' },
    { path: 'src/db', type: 'directory' },
    { path: 'src/db/migrations', type: 'directory' },
    { path: 'src/services', type: 'directory' },
    { path: 'tests', type: 'directory' },
    { path: 'public', type: 'directory' },
    { path: '.github', type: 'directory' },
    { path: '.github/workflows', type: 'directory' },
    { path: 'infra', type: 'directory' },
  ];

  // Module-specific directories
  for (const mod of specBundle.modules) {
    const slug = slugify(mod.name);
    dirs.push(
      { path: `src/routes/api/${slug}`, type: 'directory' },
      { path: `src/routes/${slug}`, type: 'directory' },
      { path: `src/components/${slug}`, type: 'directory' },
      { path: `src/services/${slug}`, type: 'directory' },
      { path: `tests/${slug}`, type: 'directory' },
    );
  }

  // Root app entry point
  dirs.push({
    path: 'src/app.tsx',
    type: 'file',
    content: generateAppEntry(specBundle),
  });

  // Root layout
  dirs.push({
    path: 'src/routes/layout.tsx',
    type: 'file',
    content: generateRootLayout(),
  });

  return dirs;
}

// ── Package.json ─────────────────────────────────────────────────

function generatePackageJson(name: string, specBundle: SpecBundle): Record<string, unknown> {
  return {
    name,
    type: 'module',
    scripts: {
      dev: 'vinxi dev',
      build: 'vinxi build',
      start: 'vinxi start',
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'drizzle-kit migrate',
      'db:push': 'drizzle-kit push',
      test: 'bun test',
      'test:coverage': 'bun test --coverage',
      lint: 'eslint src/',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@solidjs/router': '^0.14.0',
      '@solidjs/start': '^1.0.0',
      'solid-js': '^1.9.0',
      vinxi: '^0.4.0',
      'drizzle-orm': '^0.33.0',
      postgres: '^3.4.0',
      'better-auth': '^1.0.0',
      tailwindcss: '^4.0.0',
      zod: '^3.23.0',
    },
    devDependencies: {
      'drizzle-kit': '^0.24.0',
      typescript: '^5.6.0',
      '@types/bun': 'latest',
      eslint: '^9.0.0',
    },
  };
}

// ── TSConfig ─────────────────────────────────────────────────────

function generateTsConfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'preserve',
      jsxImportSource: 'solid-js',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      paths: {
        '~/*': ['./src/*'],
      },
    },
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    exclude: ['node_modules', 'dist'],
  };
}

// ── Database Schema Generation (via LLM) ─────────────────────────

const DbSchemaInput = z.object({
  modules: z.array(z.object({
    name: z.string(),
    entities: z.array(z.object({
      name: z.string(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        constraints: z.array(z.string()).optional(),
      })),
      relationships: z.array(z.object({
        target: z.string(),
        type: z.string(),
        required: z.boolean(),
      })),
    })),
  })),
});

const DbSchemaOutput = z.object({
  schema: z.string(),
});

export async function generateDatabaseSchema(specBundle: SpecBundle): Promise<string> {
  const input = {
    modules: specBundle.modules.map((mod) => ({
      name: mod.name,
      entities: mod.dataModel.entities,
    })),
  };

  const result = await llmCall({
    model: 'sonnet',
    systemPrompt: `You are a database schema generator. Given data model entities, generate a Drizzle ORM schema file for PostgreSQL.

Rules:
- Use pgTable, text, integer, timestamp, boolean, jsonb, pgEnum from drizzle-orm/pg-core
- Use relations from drizzle-orm
- Every table gets an "id" text primary key
- Every table gets createdAt and updatedAt timestamps
- Map "string" → text, "number" → integer, "boolean" → boolean, "date" → timestamp, "json"/"object" → jsonb
- Create proper foreign key references for relationships
- Use camelCase for TypeScript, snake_case for DB columns
- Include proper imports at the top
- Output valid TypeScript only

Return a JSON object with a single "schema" key containing the full TypeScript file content.`,
    inputSchema: DbSchemaInput,
    outputSchema: DbSchemaOutput,
    sanitise: true,
    orgId: specBundle.orgId,
  }, input);

  return result.data.schema;
}

// ── Shared Libraries ─────────────────────────────────────────────

function generateSharedLibraries(specBundle: SpecBundle): SharedLibrary[] {
  const libraries: SharedLibrary[] = [];

  for (const component of specBundle.sharedComponents) {
    const files: GeneratedFile[] = [];

    switch (component.type) {
      case 'auth':
        files.push({
          path: 'src/lib/auth/index.ts',
          content: generateAuthLibrary(),
          target: 'backend-service',
          moduleId: 'shared',
        });
        files.push({
          path: 'src/lib/auth/middleware.ts',
          content: generateAuthMiddleware(),
          target: 'backend-service',
          moduleId: 'shared',
        });
        break;

      case 'rbac':
        files.push({
          path: 'src/lib/rbac/index.ts',
          content: generateRbacLibrary(specBundle),
          target: 'backend-service',
          moduleId: 'shared',
        });
        break;

      case 'audit':
        files.push({
          path: 'src/lib/audit/index.ts',
          content: generateAuditLibrary(),
          target: 'backend-service',
          moduleId: 'shared',
        });
        break;

      case 'notifications':
        files.push({
          path: 'src/lib/notifications/index.ts',
          content: generateNotificationsLibrary(),
          target: 'backend-service',
          moduleId: 'shared',
        });
        break;

      case 'file-handling':
        files.push({
          path: 'src/lib/files/index.ts',
          content: generateFileHandlingLibrary(),
          target: 'backend-service',
          moduleId: 'shared',
        });
        break;
    }

    libraries.push({
      name: component.name,
      type: component.type,
      files,
    });
  }

  return libraries;
}

// ── Template Generators ──────────────────────────────────────────

function generateAuthLibrary(): string {
  return `import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '~/db';

export const auth = betterAuth({
  database: drizzleAdapter(db),
  emailAndPassword: { enabled: true },
  session: { expiresIn: 60 * 60 * 24 * 7 }, // 7 days
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
`;
}

function generateAuthMiddleware(): string {
  return `import { type APIEvent } from '@solidjs/start/server';
import { auth } from './index';

export async function requireAuth(event: APIEvent): Promise<{ userId: string; orgId: string }> {
  const session = await auth.api.getSession({ headers: event.request.headers });
  if (!session?.user) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return {
    userId: session.user.id,
    orgId: (session.user as Record<string, unknown>).orgId as string,
  };
}

export async function requireRole(event: APIEvent, requiredRole: string): Promise<{ userId: string; orgId: string }> {
  const user = await requireAuth(event);
  const role = (await auth.api.getSession({ headers: event.request.headers }))?.user as Record<string, unknown>;
  if (role?.role !== requiredRole) {
    throw new Response('Forbidden', { status: 403 });
  }
  return user;
}
`;
}

function generateRbacLibrary(specBundle: SpecBundle): string {
  // Collect all roles from all modules
  const allRoles = new Set<string>();
  const allPermissions = new Set<string>();

  for (const mod of specBundle.modules) {
    for (const role of mod.roles) {
      allRoles.add(role.name);
      for (const perm of role.permissions) {
        allPermissions.add(perm);
      }
    }
  }

  const rolesArray = Array.from(allRoles).map((r) => `'${r}'`).join(' | ');
  const permsArray = Array.from(allPermissions).map((p) => `'${p}'`).join(' | ');

  return `export type Role = ${rolesArray || 'string'};
export type Permission = ${permsArray || 'string'};

const rolePermissions: Record<Role, Permission[]> = {
${specBundle.modules.flatMap((m) => m.roles).reduce((acc, role) => {
  acc[role.name] = role.permissions;
  return acc;
}, {} as Record<string, string[]>)
  ? Array.from(allRoles).map((role) => {
      const perms = specBundle.modules
        .flatMap((m) => m.roles)
        .filter((r) => r.name === role)
        .flatMap((r) => r.permissions);
      const uniquePerms = [...new Set(perms)];
      return `  '${role}': [${uniquePerms.map((p) => `'${p}'`).join(', ')}]`;
    }).join(',\n')
  : ''
}
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = rolePermissions[role];
  if (!perms) return false;
  return perms.includes(permission);
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Response('Forbidden: insufficient permissions', { status: 403 });
  }
}
`;
}

function generateAuditLibrary(): string {
  return `import { db } from '~/db';

export interface AuditEntry {
  userId: string;
  orgId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  console.log('[AUDIT]', JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  }));
  // In production, write to audit_logs table
}

export function withAudit<T extends (...args: unknown[]) => Promise<unknown>>(
  action: string,
  resourceType: string,
  fn: T,
): T {
  return (async (...args: unknown[]) => {
    const result = await fn(...args);
    // Audit logging would be captured here
    return result;
  }) as T;
}
`;
}

function generateNotificationsLibrary(): string {
  return `export type NotificationType = 'info' | 'warning' | 'error' | 'success';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export async function sendNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
): Promise<void> {
  console.log('[NOTIFICATION]', { userId, type, title, message });
  // In production, push to notification queue / WebSocket
}

export async function sendBulkNotification(
  userIds: string[],
  type: NotificationType,
  title: string,
  message: string,
): Promise<void> {
  for (const userId of userIds) {
    await sendNotification(userId, type, title, message);
  }
}
`;
}

function generateFileHandlingLibrary(): string {
  return `import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  path: string;
  uploadedAt: Date;
}

export async function handleUpload(file: File): Promise<UploadedFile> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(\`File too large: \${file.size} bytes (max \${MAX_FILE_SIZE})\`);
  }

  const id = randomUUID();
  const path = \`uploads/\${id}/\${file.name}\`;

  // In production, upload to S3-compatible storage
  const buffer = await file.arrayBuffer();
  await Bun.write(path, buffer);

  return {
    id,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    path,
    uploadedAt: new Date(),
  };
}

export async function getFile(path: string): Promise<Uint8Array> {
  const file = Bun.file(path);
  return new Uint8Array(await file.arrayBuffer());
}
`;
}

function generateAppEntry(specBundle: SpecBundle): string {
  return `import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';

export default function App() {
  return (
    <Router root={(props) => <>{props.children}</>}>
      <FileRoutes />
    </Router>
  );
}
`;
}

function generateRootLayout(): string {
  return `import type { ParentProps } from 'solid-js';

export default function RootLayout(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body class="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {props.children}
      </body>
    </html>
  );
}
`;
}

function generateDrizzleConfig(): string {
  return `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
`;
}

function generateTailwindConfig(): string {
  return `import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
} satisfies Config;
`;
}

function generateEnvExample(): string {
  return `DATABASE_URL=postgres://user:pass@localhost:5432/app
BETTER_AUTH_SECRET=change-me
BETTER_AUTH_URL=http://localhost:3000
`;
}

// ── Helpers ──────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
