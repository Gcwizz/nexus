import { type Component, type JSX, Show } from 'solid-js';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  icon?: JSX.Element;
}

export const EmptyState: Component<EmptyStateProps> = (props) => {
  return (
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <Show when={props.icon}>
        <div class="mb-4 text-gray-300">{props.icon}</div>
      </Show>
      <h3 class="text-lg font-medium text-gray-900">{props.title}</h3>
      <Show when={props.description}>
        <p class="mt-1 text-sm text-gray-500 max-w-sm">{props.description}</p>
      </Show>
      <Show when={props.action}>
        <button
          class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          onClick={props.action!.onClick}
        >
          {props.action!.label}
        </button>
      </Show>
    </div>
  );
};
