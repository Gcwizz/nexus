import { publishEvent } from '@nexus/events';
import { EventName, type OptimisationCompletePayload } from '@nexus/contracts/events';

/**
 * Publishes the OptimisationComplete event after the full analysis pipeline
 * has completed and all recommendations have been stored.
 *
 * Consumers:
 * - Module 4 (Process Canvas): Adds recommendation annotations to the canvas
 * - Module 6 (Target Designer): Uses recommendations as input for target state design
 */
export async function publishOptimisationComplete(
  payload: OptimisationCompletePayload,
): Promise<void> {
  await publishEvent(EventName.OptimisationComplete, payload);
}
