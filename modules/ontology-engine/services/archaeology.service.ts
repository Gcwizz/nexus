import { z } from 'zod';
import { llmCall } from '@nexus/llm';
import { storage } from '@nexus/storage';
import {
  LLMParseError,
  LLMRefusalError,
  LLMTimeoutError,
  ContextOverflowError,
  InsufficientDataError,
} from '@nexus/contracts/errors';
import { GhostProcess } from '@nexus/contracts/ontology';
import type { NormalisedEntity } from '@nexus/contracts/entities';
import {
  type EmailPattern,
  type FilePattern,
  type CalendarPattern,
  type ArchaeologyInput,
  ArchaeologyInputSchema,
  GhostProcessLLMOutputSchema,
} from '../types.js';

// ── Pattern Detection ─────────────────────────────────────────────

/**
 * Analyse email entities for recurring communication patterns.
 * Looks for repeated sends/receives between the same participants
 * on similar subjects at regular intervals.
 */
export function detectEmailPatterns(entities: NormalisedEntity[]): EmailPattern[] {
  const emailEntities = entities.filter((e) => e.entityType === 'communication');
  if (emailEntities.length < 3) return [];

  // Group by participant sets
  const byParticipants = new Map<string, Array<{ subject: string; timestamp: string; properties: Record<string, unknown> }>>();

  for (const entity of emailEntities) {
    const props = entity.properties as Record<string, unknown>;
    const from = String(props.from ?? props.sender ?? '');
    const to = normaliseRecipients(props.to ?? props.recipients);
    if (!from || to.length === 0) continue;

    const participantKey = [from, ...to].sort().join('|');
    const existing = byParticipants.get(participantKey) ?? [];
    existing.push({
      subject: String(props.subject ?? entity.name ?? ''),
      timestamp: entity.extractedAt,
      properties: props,
    });
    byParticipants.set(participantKey, existing);
  }

  const patterns: EmailPattern[] = [];

  for (const [participantKey, emails] of byParticipants) {
    if (emails.length < 3) continue;

    // Check for subject similarity (recurring reports, updates, etc.)
    const subjectGroups = groupBySubjectSimilarity(emails.map((e) => e.subject));

    for (const [pattern, subjects] of subjectGroups) {
      if (subjects.length < 3) continue;

      const participants = participantKey.split('|');
      const frequency = estimateFrequency(
        emails
          .filter((e) => subjects.includes(e.subject))
          .map((e) => new Date(e.timestamp)),
      );

      if (frequency) {
        const timestamps = emails
          .filter((e) => subjects.includes(e.subject))
          .map((e) => new Date(e.timestamp));

        patterns.push({
          participants,
          subject_pattern: pattern,
          frequency: frequency.label,
          day_of_week: frequency.dayOfWeek,
          time_of_day: frequency.timeOfDay,
          occurrence_count: subjects.length,
        });
      }
    }
  }

  return patterns;
}

/**
 * Analyse file/document entities for recurring modification patterns.
 * Looks for files modified on a regular schedule by the same people.
 */
export function detectFilePatterns(entities: NormalisedEntity[]): FilePattern[] {
  const fileEntities = entities.filter((e) => e.entityType === 'document');
  if (fileEntities.length < 3) return [];

  // Group by filename similarity pattern
  const byPattern = new Map<string, Array<{ name: string; modifier: string; timestamp: string }>>();

  for (const entity of fileEntities) {
    const props = entity.properties as Record<string, unknown>;
    const modifier = String(props.lastModifiedBy ?? props.author ?? props.owner ?? 'unknown');
    const namePattern = extractFilenamePattern(entity.name);

    const existing = byPattern.get(namePattern) ?? [];
    existing.push({
      name: entity.name,
      modifier,
      timestamp: entity.extractedAt,
    });
    byPattern.set(namePattern, existing);
  }

  const patterns: FilePattern[] = [];

  for (const [filenamePattern, files] of byPattern) {
    if (files.length < 3) continue;

    const modifiers = [...new Set(files.map((f) => f.modifier))];
    const frequency = estimateFrequency(files.map((f) => new Date(f.timestamp)));

    if (frequency) {
      patterns.push({
        filename_pattern: filenamePattern,
        modifiers,
        frequency: frequency.label,
        day_of_week: frequency.dayOfWeek,
        occurrence_count: files.length,
      });
    }
  }

  return patterns;
}

/**
 * Analyse calendar/meeting entities for recurring event patterns.
 * These often represent formalised processes (standups, reviews, handoffs).
 */
export function detectCalendarPatterns(entities: NormalisedEntity[]): CalendarPattern[] {
  const calendarEntities = entities.filter(
    (e) => e.entityType === 'communication' || e.entityType === 'process',
  );
  if (calendarEntities.length < 2) return [];

  // Group by title similarity
  const byTitle = new Map<string, Array<{ title: string; participants: string[]; timestamp: string }>>();

  for (const entity of calendarEntities) {
    const props = entity.properties as Record<string, unknown>;
    if (!props.isCalendarEvent && !props.eventType && !props.recurrence) continue;

    const participants = normaliseRecipients(props.attendees ?? props.participants ?? []);
    const titlePattern = normaliseEventTitle(entity.name);

    const existing = byTitle.get(titlePattern) ?? [];
    existing.push({
      title: entity.name,
      participants,
      timestamp: entity.extractedAt,
    });
    byTitle.set(titlePattern, existing);
  }

  const patterns: CalendarPattern[] = [];

  for (const [titlePattern, events] of byTitle) {
    if (events.length < 2) continue;

    const allParticipants = [...new Set(events.flatMap((e) => e.participants))];
    const frequency = estimateFrequency(events.map((e) => new Date(e.timestamp)));

    if (frequency) {
      patterns.push({
        title_pattern: titlePattern,
        participants: allParticipants,
        frequency: frequency.label,
        day_of_week: frequency.dayOfWeek,
        time_of_day: frequency.timeOfDay,
        occurrence_count: events.length,
      });
    }
  }

  return patterns;
}

// ── Ghost Process Synthesis (Opus LLM) ────────────────────────────

const ARCHAEOLOGY_SYSTEM_PROMPT = `You are an expert business process archaeologist. Your job is to detect "ghost processes" — undocumented business processes that exist only as patterns in email, file, and calendar data.

TASK: Analyse the provided patterns (recurring emails, file modifications, and calendar events) and synthesise them into ghost process descriptions.

A ghost process is a recurring business workflow that:
- Is NOT formally documented anywhere
- Exists as a pattern of repeated human actions
- Involves specific people and data flows
- Happens on a predictable schedule

RULES:
1. Only synthesise ghost processes when multiple pattern types corroborate each other (e.g., a weekly email + a matching calendar event + file updates).
2. Single-pattern processes are acceptable if the pattern is very strong (10+ occurrences).
3. Describe the process in business terms, not technical terms.
4. Map the data flow: who sends what to whom, what gets updated.
5. Confidence scoring:
   - 0.9-1.0: Multiple corroborating patterns, 10+ occurrences each
   - 0.7-0.89: Multiple patterns or single strong pattern (10+ occurrences)
   - 0.5-0.69: Single moderate pattern (5-9 occurrences)
   - 0.3-0.49: Weak pattern, needs human confirmation
6. Name the process descriptively (e.g., "Weekly Sales Report Distribution", "Monthly Invoice Reconciliation").
7. List ALL evidence with source type and occurrence count.

OUTPUT FORMAT: JSON object with array of ghost processes.

EXAMPLE OUTPUT:
{
  "ghostProcesses": [
    {
      "name": "Weekly Sales Report Distribution",
      "description": "Every Monday morning, the Sales Director compiles weekly sales figures and distributes a report to the leadership team via email. The report is also saved to the shared drive as an Excel file.",
      "pattern": {
        "frequency": "weekly",
        "dayOfWeek": 1,
        "timeOfDay": "09:00",
        "involvedEntities": ["Sales Director", "CEO", "CFO", "VP Sales"],
        "dataFlow": [
          {"from": "Sales Director", "to": "Leadership Team", "action": "Sends weekly sales summary email"},
          {"from": "Sales Director", "to": "Shared Drive", "action": "Uploads updated sales report Excel file"}
        ]
      },
      "evidence": [
        {"source": "email", "description": "Weekly email with subject matching 'Sales Report' from sales.director@company.com", "occurrences": 24},
        {"source": "file", "description": "File 'Weekly_Sales_Report_*.xlsx' modified every Monday", "occurrences": 26},
        {"source": "calendar", "description": "Recurring 'Sales Review' meeting every Monday 10:00", "occurrences": 22}
      ],
      "confidence": 0.94
    }
  ]
}`;

/**
 * Run the full ghost process detection pipeline.
 * 1. Detect patterns from email, file, and calendar data
 * 2. Synthesise patterns into ghost processes via Opus LLM
 */
export async function detectGhostProcesses(
  orgId: string,
): Promise<GhostProcess[]> {
  // Load normalised entities from S3
  const entityFiles = await storage.list(orgId, 'entities');
  const allEntities: NormalisedEntity[] = [];
  for (const file of entityFiles) {
    const data = await storage.getJSON<NormalisedEntity[]>(orgId, 'entities', file);
    if (data) allEntities.push(...data);
  }

  if (allEntities.length === 0) {
    return [];
  }

  // Detect patterns across all three dimensions
  const emailPatterns = detectEmailPatterns(allEntities);
  const filePatterns = detectFilePatterns(allEntities);
  const calendarPatterns = detectCalendarPatterns(allEntities);

  const totalPatterns = emailPatterns.length + filePatterns.length + calendarPatterns.length;
  if (totalPatterns === 0) {
    return [];
  }

  // Synthesise patterns into ghost processes via LLM
  const archaeologyInput: ArchaeologyInput = {
    emailPatterns,
    filePatterns,
    calendarPatterns,
  };

  try {
    const result = await llmCall(
      {
        model: 'opus',
        systemPrompt: ARCHAEOLOGY_SYSTEM_PROMPT,
        inputSchema: ArchaeologyInputSchema,
        outputSchema: GhostProcessLLMOutputSchema,
        sanitise: true,
        orgId,
      },
      archaeologyInput,
    );

    // Convert LLM output to GhostProcess contract type
    const ghostProcesses: GhostProcess[] = result.data.ghostProcesses.map((gp, index) => ({
      id: `ghost-${orgId}-${Date.now()}-${index}`,
      orgId,
      name: gp.name,
      description: gp.description,
      pattern: gp.pattern,
      evidence: gp.evidence,
      confidence: gp.confidence,
      status: 'detected' as const,
    }));

    // Persist ghost processes to S3
    await storage.putJSON(orgId, 'ontology', 'ghost-processes.json', ghostProcesses);

    return ghostProcesses;
  } catch (error) {
    const err = error as Error;

    if (err.name === 'RefusalError') {
      throw new LLMRefusalError(
        `LLM refused during ghost process synthesis: ${err.message}`,
        { orgId, cause: err },
      );
    }
    if (err.name === 'ParseError') {
      throw new LLMParseError(
        `LLM output parse failed during ghost process synthesis: ${err.message}`,
        { orgId, cause: err },
      );
    }
    if (err.message?.includes('timeout')) {
      throw new LLMTimeoutError(
        `LLM timeout during ghost process synthesis: ${err.message}`,
        { orgId, cause: err },
      );
    }
    if (err.message?.includes('context_length')) {
      throw new ContextOverflowError(
        `Context overflow during ghost process synthesis: ${err.message}`,
        { orgId, cause: err },
      );
    }

    throw new LLMParseError(
      `Unexpected error during ghost process detection: ${err.message}`,
      { orgId, cause: err },
    );
  }
}

// ── Pattern Analysis Helpers ──────────────────────────────────────

function normaliseRecipients(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') return raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function groupBySubjectSimilarity(
  subjects: string[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const subject of subjects) {
    const normalised = normaliseSubject(subject);
    let matched = false;

    for (const [pattern, group] of groups) {
      if (subjectsSimilar(normalised, pattern)) {
        group.push(subject);
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.set(normalised, [subject]);
    }
  }

  return groups;
}

function normaliseSubject(subject: string): string {
  return subject
    .replace(/^(re:|fwd?:|fw:)\s*/gi, '')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, '{DATE}')
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/gi, '{DATE}')
    .replace(/\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/g, '{DATE}')
    .replace(/\b(week|wk)\s*#?\d+/gi, '{WEEK}')
    .replace(/\bQ[1-4]\b/gi, '{QUARTER}')
    .replace(/\b\d+\b/g, '{NUM}')
    .trim()
    .toLowerCase();
}

function subjectsSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  // Simple Jaccard similarity on words
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 && intersection.size / union.size > 0.6;
}

function extractFilenamePattern(filename: string): string {
  return filename
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, '{DATE}')
    .replace(/\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/g, '{DATE}')
    .replace(/\b(v|version)\s*\d+/gi, '{VERSION}')
    .replace(/\b\d+\b/g, '{NUM}')
    .replace(/\.[^.]+$/, '') // strip extension for pattern matching
    .trim()
    .toLowerCase();
}

function normaliseEventTitle(title: string): string {
  return title
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, '{DATE}')
    .replace(/\b\d+\b/g, '{NUM}')
    .trim()
    .toLowerCase();
}

interface FrequencyResult {
  label: string;
  dayOfWeek?: number;
  timeOfDay?: string;
}

function estimateFrequency(dates: Date[]): FrequencyResult | null {
  if (dates.length < 2) return null;

  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / (1000 * 60 * 60 * 24));
  }

  if (gaps.length === 0) return null;

  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const stdDev = Math.sqrt(gaps.reduce((sum, g) => sum + (g - avgGap) ** 2, 0) / gaps.length);

  // Only consider it a pattern if the standard deviation is reasonable
  if (stdDev > avgGap * 0.5 && gaps.length > 2) return null;

  // Determine the most common day of week
  const dayCounts = new Map<number, number>();
  for (const date of sorted) {
    const day = date.getDay();
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const mostCommonDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Determine common time of day
  const hourCounts = new Map<number, number>();
  for (const date of sorted) {
    hourCounts.set(date.getHours(), (hourCounts.get(date.getHours()) ?? 0) + 1);
  }
  const mostCommonHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const timeOfDay = mostCommonHour !== undefined ? `${String(mostCommonHour).padStart(2, '0')}:00` : undefined;

  if (avgGap <= 1.5) return { label: 'daily', timeOfDay };
  if (avgGap <= 8) return { label: 'weekly', dayOfWeek: mostCommonDay, timeOfDay };
  if (avgGap <= 16) return { label: 'biweekly', dayOfWeek: mostCommonDay, timeOfDay };
  if (avgGap <= 35) return { label: 'monthly', dayOfWeek: mostCommonDay, timeOfDay };
  if (avgGap <= 100) return { label: 'quarterly', timeOfDay };

  return null;
}
