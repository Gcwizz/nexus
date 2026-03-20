import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { env } from '@nexus/config';
import type { OntologyNode, OntologyRelationship } from '@nexus/contracts';

let _driver: Driver | null = null;

function driver(): Driver {
  if (!_driver) {
    const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = env();
    _driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  }
  return _driver;
}

function session(): Session {
  return driver().session();
}

async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

// ── Graph Ownership API ──────────────────────────────────────────
//
// Each graph domain has exactly one writer module.
// Read access is open to any module.
//
//   Domain       │ Writer    │ Readers
//   ─────────────┼───────────┼─────────────────────
//   Ontology     │ Module 2  │ Modules 3,4,5,6,7
//   Processes    │ Module 4  │ Modules 5,6,7
//   TargetState  │ Module 6  │ Module 7
//

export const graph = {
  ontology: {
    async write(orgId: string, nodes: OntologyNode[], relationships: OntologyRelationship[]): Promise<void> {
      const s = session();
      try {
        await s.executeWrite(async (tx) => {
          for (const node of nodes) {
            await tx.run(
              `MERGE (n:Entity {id: $id, orgId: $orgId})
               SET n += $props, n.label = $label, n.entityType = $entityType,
                   n.name = $name, n.confidence = $confidence`,
              {
                id: node.id,
                orgId,
                label: node.label,
                entityType: node.entityType,
                name: node.name,
                confidence: node.confidence,
                props: node.properties,
              }
            );
          }
          for (const rel of relationships) {
            await tx.run(
              `MATCH (a:Entity {id: $sourceId, orgId: $orgId})
               MATCH (b:Entity {id: $targetId, orgId: $orgId})
               MERGE (a)-[r:RELATES {id: $id}]->(b)
               SET r.type = $type, r.confidence = $confidence, r.properties = $props`,
              {
                id: rel.id,
                orgId,
                sourceId: rel.sourceNodeId,
                targetId: rel.targetNodeId,
                type: rel.type,
                confidence: rel.confidence,
                props: rel.properties,
              }
            );
          }
        });
      } finally {
        await s.close();
      }
    },

    async read(orgId: string, options?: { depth?: number; entityType?: string }): Promise<{
      nodes: OntologyNode[];
      relationships: OntologyRelationship[];
    }> {
      const s = session();
      const depth = options?.depth ?? 2;
      try {
        const typeFilter = options?.entityType ? `AND n.entityType = $entityType` : '';
        const result = await s.executeRead(async (tx) => {
          return tx.run(
            `MATCH (n:Entity {orgId: $orgId}) ${typeFilter}
             OPTIONAL MATCH (n)-[r*..${depth}]-(m:Entity {orgId: $orgId})
             RETURN n, r, m`,
            { orgId, entityType: options?.entityType }
          );
        });

        const nodesMap = new Map<string, OntologyNode>();
        const relsMap = new Map<string, OntologyRelationship>();

        for (const record of result.records) {
          const n = record.get('n');
          if (n?.properties) {
            nodesMap.set(n.properties.id, n.properties as OntologyNode);
          }
          const m = record.get('m');
          if (m?.properties) {
            nodesMap.set(m.properties.id, m.properties as OntologyNode);
          }
        }

        return {
          nodes: Array.from(nodesMap.values()),
          relationships: Array.from(relsMap.values()),
        };
      } finally {
        await s.close();
      }
    },

    async clear(orgId: string): Promise<void> {
      const s = session();
      try {
        await s.executeWrite(async (tx) => {
          await tx.run('MATCH (n:Entity {orgId: $orgId}) DETACH DELETE n', { orgId });
        });
      } finally {
        await s.close();
      }
    },
  },

  processes: {
    async write(orgId: string, processes: unknown[]): Promise<void> {
      const s = session();
      try {
        await s.executeWrite(async (tx) => {
          for (const process of processes) {
            await tx.run(
              `MERGE (p:Process {id: $id, orgId: $orgId})
               SET p += $props`,
              { id: (process as { id: string }).id, orgId, props: process }
            );
          }
        });
      } finally {
        await s.close();
      }
    },

    async read(orgId: string): Promise<unknown[]> {
      const s = session();
      try {
        const result = await s.executeRead(async (tx) => {
          return tx.run('MATCH (p:Process {orgId: $orgId}) RETURN p', { orgId });
        });
        return result.records.map((r) => r.get('p').properties);
      } finally {
        await s.close();
      }
    },
  },

  targetState: {
    async write(orgId: string, designId: string, state: unknown): Promise<void> {
      const s = session();
      try {
        await s.executeWrite(async (tx) => {
          await tx.run(
            `MERGE (t:TargetState {orgId: $orgId, designId: $designId})
             SET t.state = $state`,
            { orgId, designId, state: JSON.stringify(state) }
          );
        });
      } finally {
        await s.close();
      }
    },

    async read(orgId: string, designId: string): Promise<unknown | null> {
      const s = session();
      try {
        const result = await s.executeRead(async (tx) => {
          return tx.run(
            'MATCH (t:TargetState {orgId: $orgId, designId: $designId}) RETURN t',
            { orgId, designId }
          );
        });
        const record = result.records[0];
        if (!record) return null;
        return JSON.parse(record.get('t').properties.state);
      } finally {
        await s.close();
      }
    },
  },

  close: closeDriver,
};
