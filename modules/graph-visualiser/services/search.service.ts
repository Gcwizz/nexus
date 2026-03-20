import { graph } from '@nexus/graph';
import type { OntologyNode } from '@nexus/contracts';

// ── Types ─────────────────────────────────────────────────────────

export interface SearchResult {
  node: OntologyNode;
  score: number;
  matchedField: string;
  highlight: string;
}

// ── Fuzzy matching ────────────────────────────────────────────────

/**
 * Levenshtein distance between two strings.
 * Used for fuzzy matching when exact/substring match fails.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,      // deletion
        dp[i]![j - 1]! + 1,      // insertion
        dp[i - 1]![j - 1]! + cost, // substitution
      );
    }
  }

  return dp[m]![n]!;
}

/**
 * Compute fuzzy match score (0-1). Higher = better match.
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (t === q) return 1.0;

  // Starts with
  if (t.startsWith(q)) return 0.9;

  // Contains
  if (t.includes(q)) return 0.7;

  // Word-level match: any word in target starts with query
  const words = t.split(/[\s_\-./]+/);
  for (const word of words) {
    if (word.startsWith(q)) return 0.6;
  }

  // Levenshtein-based fuzzy match
  const maxLen = Math.max(q.length, t.length);
  if (maxLen === 0) return 0;
  const distance = levenshteinDistance(q, t.substring(0, Math.min(t.length, q.length + 3)));
  const similarity = 1 - distance / maxLen;

  // Only accept fuzzy matches above a threshold
  return similarity >= 0.4 ? similarity * 0.5 : 0;
}

/**
 * Generate a highlighted snippet showing where the match occurred.
 */
function generateHighlight(query: string, text: string): string {
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text.substring(0, 80);

  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + query.length + 20);
  let snippet = '';
  if (start > 0) snippet += '...';
  snippet += text.substring(start, idx);
  snippet += `**${text.substring(idx, idx + query.length)}**`;
  snippet += text.substring(idx + query.length, end);
  if (end < text.length) snippet += '...';
  return snippet;
}

// ── Search service ────────────────────────────────────────────────

export async function searchEntities(
  orgId: string,
  query: string,
  options?: {
    limit?: number;
    entityType?: string;
    department?: string;
    minConfidence?: number;
  },
): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) return [];

  const { nodes } = await graph.ontology.read(orgId, { depth: 1 });
  const limit = options?.limit ?? 20;
  const q = query.trim();

  const results: SearchResult[] = [];

  for (const node of nodes) {
    // Apply pre-filters
    if (options?.entityType && node.entityType !== options.entityType) continue;
    if (options?.department && node.department !== options.department) continue;
    if (options?.minConfidence !== undefined && node.confidence < options.minConfidence) continue;

    let bestScore = 0;
    let matchedField = '';
    let matchText = '';

    // Search name (highest priority)
    const nameScore = fuzzyScore(q, node.name);
    if (nameScore > bestScore) {
      bestScore = nameScore;
      matchedField = 'name';
      matchText = node.name;
    }

    // Search entity type
    const typeScore = fuzzyScore(q, node.entityType) * 0.8;
    if (typeScore > bestScore) {
      bestScore = typeScore;
      matchedField = 'entityType';
      matchText = node.entityType;
    }

    // Search description
    if (node.description) {
      const descScore = fuzzyScore(q, node.description) * 0.6;
      if (descScore > bestScore) {
        bestScore = descScore;
        matchedField = 'description';
        matchText = node.description;
      }
    }

    // Search department
    if (node.department) {
      const deptScore = fuzzyScore(q, node.department) * 0.7;
      if (deptScore > bestScore) {
        bestScore = deptScore;
        matchedField = 'department';
        matchText = node.department;
      }
    }

    // Search properties values
    for (const [key, value] of Object.entries(node.properties)) {
      if (typeof value === 'string') {
        const propScore = fuzzyScore(q, value) * 0.5;
        if (propScore > bestScore) {
          bestScore = propScore;
          matchedField = `properties.${key}`;
          matchText = value;
        }
      }
    }

    if (bestScore > 0) {
      results.push({
        node,
        score: bestScore,
        matchedField,
        highlight: generateHighlight(q, matchText),
      });
    }
  }

  // Sort by score descending, then by name
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.node.name.localeCompare(b.node.name);
  });

  return results.slice(0, limit);
}
