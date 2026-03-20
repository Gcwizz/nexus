/**
 * Event consumers for the Connector Hub module.
 *
 * Module 1 is the start of the event chain — it does not consume events
 * from other modules. This file serves as the registration point for any
 * future event consumers this module may need.
 *
 * Potential future consumers:
 * - OntologyReady: could trigger schema evolution detection by comparing
 *   the inferred ontology against raw connector schemas
 * - DriftDetected: could trigger re-sync of affected sources
 */

import { createWorker } from '@nexus/events';

/**
 * Register all event consumers for the connector-hub module.
 * Currently a no-op — Module 1 is the start of the pipeline.
 */
export function registerConsumers(): void {
  // No consumers yet. Module 1 is the producer at the start of the chain.
  //
  // When Living Twin drift detection is implemented, add:
  //
  // createWorker<DriftDetectedPayload>(
  //   EventName.DriftDetected,
  //   async (job) => {
  //     // Re-sync affected sources when drift is detected
  //   },
  // );

  console.info('[connector-hub] Event consumers registered (none active)');
}
