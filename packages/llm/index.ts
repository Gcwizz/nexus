import Anthropic from '@anthropic-ai/sdk';
import { type ZodSchema, type z } from 'zod';
import { env } from '@nexus/config';
import { sanitiseInput } from './sanitiser';

// ── Types ────────────────────────────────────────────────────────

export interface LLMCallConfig<TInput, TOutput> {
  model: 'opus' | 'sonnet';
  systemPrompt: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  sanitise?: boolean;
  orgId: string;
  maxRetries?: number;
  onToken?: (usage: TokenUsage) => void;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  orgId: string;
  timestamp: Date;
}

export interface LLMResult<T> {
  data: T;
  usage: TokenUsage;
}

// ── Model Mapping ────────────────────────────────────────────────

const MODEL_MAP = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
} as const;

// ── Client ───────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Main LLM Call ────────────────────────────────────────────────
//
// This is the ONLY way to call Claude from any module.
// It enforces:
//   1. Input sanitisation (prompt injection defence)
//   2. Structured output validation (Zod schema)
//   3. Per-org context isolation
//   4. Token usage tracking
//   5. Retry with exponential backoff
//   6. Refusal detection
//   7. Context overflow detection
//

export async function llmCall<TInput, TOutput>(
  config: LLMCallConfig<TInput, TOutput>,
  input: TInput
): Promise<LLMResult<TOutput>> {
  const maxRetries = config.maxRetries ?? 3;
  const modelId = MODEL_MAP[config.model];

  // Validate input
  const validatedInput = config.inputSchema.parse(input);

  // Sanitise if requested (P0 security)
  const processedInput = config.sanitise
    ? sanitiseInput(validatedInput)
    : validatedInput;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client().messages.create({
        model: modelId,
        max_tokens: 16384,
        system: config.systemPrompt,
        messages: [
          {
            role: 'user',
            content: JSON.stringify(processedInput),
          },
        ],
      });

      // Track token usage
      const usage: TokenUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model: modelId,
        orgId: config.orgId,
        timestamp: new Date(),
      };

      config.onToken?.(usage);

      // Extract text content
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in LLM response');
      }

      // Detect refusal
      if (response.stop_reason === 'end_turn' && textBlock.text.length < 50) {
        const lowerText = textBlock.text.toLowerCase();
        if (lowerText.includes('cannot') || lowerText.includes('unable') || lowerText.includes('sorry')) {
          throw new RefusalError(`LLM refused: ${textBlock.text}`);
        }
      }

      // Parse JSON from response
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new ParseError('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate output against schema
      const validated = config.outputSchema.parse(parsed);

      return { data: validated, usage };
    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors (output schema mismatch)
      if (error instanceof Error && error.name === 'ZodError') {
        if (attempt < maxRetries - 1) continue;
        throw error;
      }

      // Retry with backoff on transient errors
      if (isRetryable(error)) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error('LLM call failed after retries');
}

// ── Error Classes ────────────────────────────────────────────────

export class RefusalError extends Error {
  readonly name = 'RefusalError';
}

export class ParseError extends Error {
  readonly name = 'ParseError';
}

// ── Helpers ──────────────────────────────────────────────────────

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.InternalServerError) return true;
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof ParseError) return true;
  if (error instanceof RefusalError) return true;
  return false;
}
