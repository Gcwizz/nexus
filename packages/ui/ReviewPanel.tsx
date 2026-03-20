import { type Component, type JSX, For, Show, createSignal } from 'solid-js';

/**
 * Shared review panel used by Modules 2, 4, 5, 6, 7, 8.
 * Each module configures it with domain-specific content renderers.
 */

export interface ReviewItem {
  id: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ReviewPanelProps {
  items: ReviewItem[];
  renderItem: (item: ReviewItem) => JSX.Element;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  title?: string;
  emptyMessage?: string;
}

export const ReviewPanel: Component<ReviewPanelProps> = (props) => {
  const [commentText, setCommentText] = createSignal('');
  const [activeCommentId, setActiveCommentId] = createSignal<string | null>(null);

  return (
    <div class="flex flex-col gap-4">
      <Show when={props.title}>
        <h2 class="text-lg font-semibold">{props.title}</h2>
      </Show>

      <Show
        when={props.items.length > 0}
        fallback={
          <div class="text-center py-8 text-gray-500">
            {props.emptyMessage ?? 'No items to review'}
          </div>
        }
      >
        <For each={props.items}>
          {(item) => (
            <div class="border rounded-lg p-4 flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <span class="font-medium">{item.title}</span>
                <Show when={item.confidence !== undefined}>
                  <span
                    class="text-sm px-2 py-1 rounded"
                    classList={{
                      'bg-green-100 text-green-800': item.confidence! >= 0.8,
                      'bg-yellow-100 text-yellow-800': item.confidence! >= 0.5 && item.confidence! < 0.8,
                      'bg-red-100 text-red-800': item.confidence! < 0.5,
                    }}
                  >
                    {Math.round(item.confidence! * 100)}% confidence
                  </span>
                </Show>
              </div>

              {props.renderItem(item)}

              <div class="flex gap-2 pt-2 border-t">
                <button
                  class="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  onClick={() => props.onApprove(item.id)}
                >
                  Approve
                </button>
                <button
                  class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                  onClick={() => props.onReject(item.id)}
                >
                  Reject
                </button>
                <button
                  class="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300"
                  onClick={() => setActiveCommentId(activeCommentId() === item.id ? null : item.id)}
                >
                  Comment
                </button>
              </div>

              <Show when={activeCommentId() === item.id}>
                <div class="flex gap-2">
                  <input
                    type="text"
                    class="flex-1 border rounded px-3 py-1 text-sm"
                    placeholder="Add a comment..."
                    value={commentText()}
                    onInput={(e) => setCommentText(e.currentTarget.value)}
                  />
                  <button
                    class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    onClick={() => {
                      props.onComment(item.id, commentText());
                      setCommentText('');
                      setActiveCommentId(null);
                    }}
                  >
                    Send
                  </button>
                </div>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};
