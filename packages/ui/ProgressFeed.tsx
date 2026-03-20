import { type Component, For, Show, createSignal, onCleanup } from 'solid-js';

/**
 * Real-time event feed for Theatre onboarding, build dashboard, migration monitor.
 */

export interface FeedItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ProgressFeedProps {
  items: FeedItem[];
  title?: string;
  maxVisible?: number;
  showTimestamps?: boolean;
}

const TYPE_STYLES = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  error: 'bg-red-50 border-red-200 text-red-800',
} as const;

export const ProgressFeed: Component<ProgressFeedProps> = (props) => {
  const maxVisible = () => props.maxVisible ?? 50;

  const visibleItems = () => {
    const items = props.items;
    return items.slice(Math.max(0, items.length - maxVisible()));
  };

  return (
    <div class="flex flex-col gap-1 font-mono text-sm">
      <Show when={props.title}>
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          {props.title}
        </h3>
      </Show>

      <For each={visibleItems()}>
        {(item) => (
          <div class={`px-3 py-1.5 border-l-2 ${TYPE_STYLES[item.type]}`}>
            <Show when={props.showTimestamps}>
              <span class="text-xs opacity-60 mr-2">
                {item.timestamp.toLocaleTimeString()}
              </span>
            </Show>
            <span>{item.message}</span>
          </div>
        )}
      </For>

      <Show when={props.items.length === 0}>
        <div class="text-gray-400 text-center py-4">Waiting for events...</div>
      </Show>
    </div>
  );
};
