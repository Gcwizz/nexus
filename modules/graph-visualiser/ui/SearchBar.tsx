import { type Component, createSignal, createEffect, Show, For, onCleanup } from 'solid-js';
import type { SearchResult } from '../services/search.service.js';

export interface SearchBarProps {
  orgId: string;
  onSelect: (nodeId: string) => void;
}

export const SearchBar: Component<SearchBarProps> = (props) => {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<SearchResult[]>([]);
  const [isOpen, setIsOpen] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [selectedIndex, setSelectedIndex] = createSignal(-1);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inputRef!: HTMLInputElement;

  // Debounced search
  createEffect(() => {
    const q = query();

    if (debounceTimer) clearTimeout(debounceTimer);

    if (!q || q.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceTimer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/graph/${encodeURIComponent(props.orgId)}/search?q=${encodeURIComponent(q.trim())}&limit=10`,
        );
        if (response.ok) {
          const data = await response.json() as { results: SearchResult[] };
          setResults(data.results);
          setIsOpen(data.results.length > 0);
          setSelectedIndex(-1);
        }
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen()) return;

    const r = results();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(Math.min(selectedIndex() + 1, r.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(Math.max(selectedIndex() - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = selectedIndex();
      if (idx >= 0 && idx < r.length) {
        selectResult(r[idx]!);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.blur();
    }
  };

  const selectResult = (result: SearchResult) => {
    props.onSelect(result.node.id);
    setQuery(result.node.name);
    setIsOpen(false);
  };

  // Close dropdown on outside click
  const handleDocClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-search-container]')) {
      setIsOpen(false);
    }
  };

  // Register global click listener
  createEffect(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('click', handleDocClick);
    }
  });
  onCleanup(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', handleDocClick);
    }
  });

  return (
    <div class="relative" data-search-container>
      {/* Input */}
      <div class="relative">
        <svg
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef!}
          type="text"
          placeholder="Search entities..."
          class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results().length > 0) setIsOpen(true);
          }}
        />
        <Show when={isLoading()}>
          <div class="absolute right-3 top-1/2 -translate-y-1/2">
            <div class="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          </div>
        </Show>
      </div>

      {/* Results dropdown */}
      <Show when={isOpen() && results().length > 0}>
        <div class="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border shadow-lg z-50 max-h-80 overflow-y-auto">
          <For each={results()}>
            {(result, index) => (
              <button
                class={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  index() === selectedIndex() ? 'bg-blue-50' : ''
                } ${index() > 0 ? 'border-t border-gray-50' : ''}`}
                onClick={() => selectResult(result)}
              >
                <div
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: getTypeColor(result.node.entityType) }}
                />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900 truncate">
                    {result.node.name}
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-xs text-gray-500">{result.node.entityType}</span>
                    <Show when={result.node.department}>
                      <span class="text-xs text-gray-400">{result.node.department}</span>
                    </Show>
                  </div>
                  <div class="text-xs text-gray-400 mt-0.5 truncate" innerHTML={formatHighlight(result.highlight)} />
                </div>
                <div class="text-xs text-gray-400 shrink-0">
                  {Math.round(result.score * 100)}%
                </div>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────

function formatHighlight(highlight: string): string {
  return highlight
    .replace(/\*\*(.*?)\*\*/g, '<mark class="bg-yellow-100 text-yellow-800 px-0.5 rounded">$1</mark>');
}

const TYPE_COLORS: Record<string, string> = {
  person: '#3b82f6',
  employee: '#3b82f6',
  department: '#8b5cf6',
  team: '#a78bfa',
  tool: '#f59e0b',
  software: '#f59e0b',
  process: '#10b981',
  document: '#6366f1',
  system: '#ef4444',
  role: '#ec4899',
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? '#64748b';
}
