import { publishEvent } from '@nexus/events';
import { EventName } from '@nexus/contracts/events';
import type {
  OntologyReadyPayload,
  OntologyValidatedPayload,
  DriftDetectedPayload,
} from '@nexus/contracts/events';

/**
 * Publish OntologyReady event.
 * Consumed by Modules 3 (Graph Visualiser) and 4 (Process Canvas).
 */
export async function publishOntologyReady(payload: OntologyReadyPayload): Promise<void> {
  await publishEvent(EventName.OntologyReady, payload);
  console.info(
    `[ontology-engine] Published OntologyReady for org=${payload.orgId} ` +
    `version=${payload.ontologyVersion} entities=${payload.entityCount} ` +
    `relationships=${payload.relationshipCount} ghosts=${payload.ghostProcessCount}`,
  );
}

/**
 * Publish OntologyValidated event.
 * Consumed by Modules 3, 4, 5 — signals that the ontology has been human-reviewed.
 */
export async function publishOntologyValidated(payload: OntologyValidatedPayload): Promise<void> {
  await publishEvent(EventName.OntologyValidated, payload);
  console.info(
    `[ontology-engine] Published OntologyValidated for org=${payload.orgId} ` +
    `version=${payload.ontologyVersion} by=${payload.validatedBy}`,
  );
}

/**
 * Publish DriftDetected event.
 * Part of the Living Digital Twin expansion.
 * Notifies downstream modules that the ontology has diverged from reality.
 */
export async function publishDriftDetected(payload: DriftDetectedPayload): Promise<void> {
  await publishEvent(EventName.DriftDetected, payload);
  console.info(
    `[ontology-engine] Published DriftDetected for org=${payload.orgId} ` +
    `type=${payload.driftType} significance=${payload.significance}`,
  );
}
