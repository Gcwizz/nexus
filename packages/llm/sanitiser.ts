/**
 * Input sanitisation layer for LLM prompt injection defence.
 *
 * This is a P0 security requirement. All user-sourced data must pass
 * through this before being sent to Claude.
 *
 * Defence strategy:
 *   1. Strip known injection patterns from text fields
 *   2. Escape special characters that could be interpreted as instructions
 *   3. Truncate excessively long fields
 *   4. Flag suspicious content for manual review
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /ignore\s+(all\s+)?above\s+instructions/gi,
  /disregard\s+(all\s+)?previous/gi,
  /forget\s+(all\s+)?previous/gi,
  /you\s+are\s+now\s+a/gi,
  /new\s+instructions?\s*:/gi,
  /system\s*:\s*/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<<SYS>>/gi,
  /<\/SYS>/gi,
  /human\s*:\s*/gi,
  /assistant\s*:\s*/gi,
];

const MAX_FIELD_LENGTH = 50_000;

export function sanitiseInput<T>(input: T): T {
  if (typeof input === 'string') {
    return sanitiseString(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitiseInput(item)) as T;
  }

  if (input !== null && typeof input === 'object') {
    const sanitised: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      sanitised[key] = sanitiseInput(value);
    }
    return sanitised as T;
  }

  return input;
}

function sanitiseString(text: string): string {
  let sanitised = text;

  // Truncate excessively long strings
  if (sanitised.length > MAX_FIELD_LENGTH) {
    sanitised = sanitised.slice(0, MAX_FIELD_LENGTH) + ' [TRUNCATED]';
  }

  // Strip known injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    sanitised = sanitised.replace(pattern, '[FILTERED]');
  }

  return sanitised;
}

export function detectSuspiciousContent(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
