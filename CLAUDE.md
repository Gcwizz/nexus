# Nexus Platform

Autonomous Business Intelligence & Software Generation Platform — 9 modular components that connect to an SME's entire software ecosystem, auto-generate a business ontology, map and optimise processes, write specifications, build custom enterprise software, and populate it with migrated data.

## Tech Stack

- **Runtime:** Bun (not Node)
- **Framework:** SolidStart with SolidJS (not React, not Next.js)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Database:** PostgreSQL via Drizzle ORM
- **Graph Database:** Neo4j (Cypher queries, property graph model)
- **Auth:** Better Auth
- **Cache/Queue:** Redis + BullMQ
- **Object Storage:** S3-compatible
- **Canvas:** Custom WebGL (Three.js / PixiJS) + bpmn.js
- **3D Graph:** Three.js + 3d-force-graph
- **Collaboration:** Yjs (CRDT)
- **Monorepo:** Turborepo
- **LLM:** Claude API (Opus for complex inference, Sonnet for high-volume extraction)
- **Testing:** bun test (unit/integration) + Playwright (E2E)

Do not use React patterns (`useState`, `useEffect`, JSX component conventions). Use SolidJS equivalents (`createSignal`, `createEffect`, `<Show>`, `<For>`, etc.).

## Architecture

### Modular Monolith

One SolidStart app serves all module UIs and API routes. Separate Bun worker processes handle background jobs via BullMQ. Do not create separate services per module — all modules live in the same process with clean boundaries.

```
apps/web/         — SolidStart frontend + API routes (all modules)
apps/workers/     — Bun background job processors (BullMQ)
packages/         — Shared infrastructure libraries
modules/          — Per-module business logic
infra/            — Terraform, Docker, K8s
```

### Graph Ownership Model

Neo4j is shared across modules but each graph domain has exactly one writer:

| Graph Domain | Owner (writes)  | Consumers (reads)        |
|-------------|-----------------|--------------------------|
| Ontology    | Module 2        | Modules 3, 4, 5, 6, 7   |
| Processes   | Module 4        | Modules 5, 6, 7         |
| Target State| Module 6        | Module 7                 |

Access the graph only through `packages/graph/` typed APIs:
- `graph.ontology.write()` — Module 2 only
- `graph.ontology.read()` — any module
- `graph.processes.write()` — Module 4 only
- `graph.processes.read()` — any module
- `graph.targetState.write()` — Module 6 only
- `graph.targetState.read()` — Module 7

Never write to a graph domain you don't own. Never query Neo4j directly — always go through the graph package.

### Event Bus (BullMQ)

All inter-module communication goes through BullMQ queues. Event types are defined in `packages/contracts/events/`.

```
Event Chain:
Module 1 → DataIngestionComplete   → Module 2
Module 2 → OntologyReady           → Modules 3, 4
Module 2 → OntologyValidated       → Modules 3, 4, 5
Module 4 → ProcessCanvasReady      → Module 5
Module 5 → OptimisationComplete    → Modules 4, 6
Module 6 → TargetStateApproved     → Module 7
Module 7 → SpecificationReady      → Module 8
Module 8 → BuildComplete           → Module 9
Module 9 → MigrationComplete       → Dashboard
```

### Ontology Format

Neo4j native property graph + typed JSON for inter-module contracts. Do NOT use JSON-LD or RDF for internal storage. Export to JSON-LD/OWL only when external interop is needed.

## Monorepo Structure

```
nexus/
├── apps/
│   ├── web/                        # SolidStart (frontend + API routes)
│   └── workers/                    # Bun BullMQ worker processes
├── packages/
│   ├── contracts/                  # Shared TypeScript types
│   │   ├── events/                 # Event bus payload types
│   │   ├── entities/               # Normalised entity types
│   │   ├── ontology/               # Ontology graph types
│   │   ├── processes/              # BPMN + canvas types
│   │   ├── specs/                  # Specification bundle types
│   │   └── errors.ts               # NexusError base class
│   ├── db/                         # Drizzle schema + migrations
│   ├── graph/                      # Neo4j typed client (ownership model)
│   ├── auth/                       # Better Auth config + middleware
│   ├── events/                     # BullMQ publish/subscribe/schedule
│   ├── llm/                        # Claude API wrapper (P0 security layer)
│   ├── storage/                    # S3 client + per-org partitioning
│   ├── canvas/                     # Shared WebGL rendering primitives
│   ├── ui/                         # Shared SolidJS components + Tailwind
│   └── config/                     # Env validation + shared config
├── modules/
│   ├── connector-hub/              # Module 1: Universal Connector Hub
│   ├── ontology-engine/            # Module 2: Ontology Engine
│   ├── graph-visualiser/           # Module 3: Knowledge Graph Visualiser
│   ├── process-canvas/             # Module 4: Process Canvas
│   ├── optimisation-engine/        # Module 5: AI Optimisation Engine
│   ├── target-designer/            # Module 6: Target State Designer
│   ├── spec-generator/             # Module 7: Specification Generator
│   ├── build-engine/               # Module 8: Autonomous Build Engine
│   └── migration-engine/           # Module 9: Data Migration Engine
├── infra/
│   ├── terraform/
│   ├── docker/
│   └── k8s/
├── docs/
│   └── designs/
│       └── nexus-platform.md
├── turbo.json
├── package.json
└── CLAUDE.md
```

## Module Structure Convention

Every module follows this structure:

```
modules/{module-name}/
├── api/                    # API route handlers
│   └── {resource}.ts
├── workers/                # BullMQ job processors
│   └── {job}.worker.ts
├── services/               # Business logic (pure functions + classes)
│   └── {domain}.service.ts
├── ui/                     # SolidJS components for this module
│   └── {Component}.tsx
├── events/                 # Event producers and consumers
│   ├── producers.ts
│   └── consumers.ts
├── types.ts                # Module-specific types (extends contracts/)
└── index.ts                # Public API (what other modules can import)
```

Only import from another module via its `index.ts`. Never reach into another module's internals.

## Error Handling

Typed error hierarchy. Every module has its own error subclass:

```typescript
// packages/contracts/errors.ts
abstract class NexusError extends Error {
  abstract module: string;
  abstract code: string;
  abstract httpStatus: number;
  abstract retryable: boolean;
  orgId?: string;
  cause?: Error;
}

// modules/connector-hub/errors.ts
class ConnectorError extends NexusError { module = 'connector-hub' as const; }
class OAuthProviderError extends ConnectorError { code = 'OAUTH_PROVIDER_DOWN'; httpStatus = 502; retryable = true; }

// modules/ontology-engine/errors.ts
class OntologyError extends NexusError { module = 'ontology-engine' as const; }
class LLMParseError extends OntologyError { code = 'LLM_PARSE_FAILED'; httpStatus = 502; retryable = true; }
```

Rules:
- Never catch generic `Error` — catch specific error classes
- Every caught error must either: retry with backoff, degrade gracefully with a user-visible message, or re-raise with added context
- Never swallow errors silently
- Log full context: what was attempted, with what arguments, for which org/user

## LLM Calls

All LLM calls go through `packages/llm/`. Never call the Claude API directly from module code.

```typescript
import { llmCall } from '@nexus/llm';

const result = await llmCall({
  model: 'sonnet',
  systemPrompt: '...',
  inputSchema: MyInputSchema,   // Zod schema
  outputSchema: MyOutputSchema, // Zod schema — structured output enforced
  sanitise: true,               // Strip prompt injection patterns from input
  orgId: org.id,                // Per-org context isolation
}, input);
```

The LLM wrapper handles:
- Input sanitisation (prompt injection defence) — P0 security
- Structured output validation (Zod schema enforcement)
- Per-org context isolation (never mix org data in a single call)
- Token usage tracking (accumulated per org, exposed to dashboard)
- Retry with exponential backoff on timeout/rate-limit
- Refusal detection (retry with anonymised input)
- Context overflow detection (chunk and retry)

### LLM Cost Optimisation

Use the cheapest model that works for each task:
- **Sonnet:** Entity extraction, deduplication, BPMN generation, field mapping
- **Opus:** Relationship inference, hierarchy detection, ghost process detection, process optimisation analysis, specification generation

## Security (P0)

These are non-negotiable. Every PR must maintain these invariants:

1. **LLM prompt injection defence:** All user-sourced data sanitised before LLM input. Structured output enforced. Per-org context isolation.
2. **IDOR protection:** Every API endpoint validates `orgId` against the authenticated user's organisation. Middleware-level, not per-handler.
3. **File parsing sandboxing:** File parsers (Tika or Bun-native) run with resource limits. Reject zip bombs (compression ratio check), strip macros, enforce file size limits.
4. **OWASP scanning:** All Module 8 generated code must pass automated security scanning before deployment.
5. **Audit logging:** Every data access, LLM call, and graph mutation logged with orgId, userId, timestamp, and action.

## Testing

- **Unit/Integration:** `bun test` — every service gets unit tests, every module gets integration tests
- **E2E:** Playwright — browser tests for WebGL canvas, 3D graph, collaborative editing, full pipeline flows
- **LLM tests:** Mock Claude responses with recorded fixtures for unit/integration. Live LLM test suite runs nightly in CI, not on every commit.
- **WebGL tests:** Playwright visual regression snapshots for 3D graph and canvas rendering

Test files live next to the code they test: `{name}.test.ts` alongside `{name}.ts`.

## The Nine Modules

| # | Module | Function | Key Tech |
|---|--------|----------|----------|
| 1 | connector-hub | Connect to SME tools, ingest data | Merge.dev, Apache Tika, OAuth |
| 2 | ontology-engine | Generate business knowledge graph | Claude API, Neo4j |
| 3 | graph-visualiser | 3D interactive entity explorer | Three.js, 3d-force-graph, WebGL |
| 4 | process-canvas | Auto-generate process maps | Custom WebGL canvas, bpmn.js |
| 5 | optimisation-engine | Identify improvement opportunities | Claude API (LEAN, Six Sigma) |
| 6 | target-designer | Collaborative process redesign | Custom WebGL canvas, Yjs |
| 7 | spec-generator | Department-level software specs | Claude API |
| 8 | build-engine | AI agent team builds software | Claude Code, Agent SDK |
| 9 | migration-engine | Populate with existing data | Drizzle, batch processing |

## Accepted Expansions (from CEO Review)

These are in scope for the build:

1. **Living Digital Twin** — Modules 1, 2, 4 gain continuous sync + drift detection. Connectors stay live after initial ingestion. Module 2 detects when the ontology drifts from reality.
2. **Process Archaeology** — Module 2 detects "ghost processes" from email patterns, file modification timestamps, and calendar recurring events.
3. **Business in Numbers** — Module 3 gains an executive summary dashboard (entity counts, department breakdown, tool inventory).
4. **What If Calculator** — Module 4/5 gain ROI overlay on process steps ("automating this saves ~X hours/week = £Y/year").
5. **Onboarding as Theatre** — Module 1 shows real-time entity discovery feed as tools connect (live counters, graph forming in background).
6. **Before/After Video** — Module 6 auto-generates narrated comparison video of current vs. target state.

## Shared UI Components

`packages/ui/` contains reusable SolidJS components:
- `ReviewPanel` — Used by Modules 2, 4, 5, 6, 7, 8 for human review workflows. Configurable with module-specific content renderers.
- `ProgressFeed` — Real-time event feed (used in Theatre onboarding, build dashboard, migration monitor).
- `DashboardCard` — Stats card for Business in Numbers and other dashboards.
- `EmptyState` — Consistent empty states across all modules.

## Performance Guidelines

- **Neo4j queries:** Always use the `packages/graph/` API. Never query relationships per-node in a loop (N+1). Use single Cypher queries with depth-limited expansion. Cache full graph reads in Redis with per-org TTL.
- **WebGL rendering:** Viewport culling is mandatory for canvas (Modules 4, 6). Only render elements within viewport + 1 screen buffer. At zoom-out levels, render aggregated blocks not individual BPMN elements. For 3D graph (Module 3), pre-compute force-directed layout server-side for graphs above 3,000 nodes.
- **LLM calls:** Use Sonnet for high-volume extraction, Opus only for complex inference. Track token usage per org. Budget alerts at 80% of per-org threshold.
- **BullMQ workers:** Limit `build:agent` to 2-3 concurrent per worker. Single concurrency per org for `ontology:generate`. Migration batches start at 1,000 records.
- **WebSocket:** Use Vinxi WebSocket support. Per-org rooms for collaboration. Heartbeat + auto-reconnection with state replay from last event.

## Git Conventions

- Branch naming: `feature/{module-name}/{description}` or `fix/{module-name}/{description}`
- Commit messages: conventional commits (`feat(connector-hub): add Salesforce OAuth flow`)
- One module per PR when possible. Cross-module changes (shared packages) get their own PR.
