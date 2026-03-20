import { type Component, Show } from 'solid-js';

export interface DashboardCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: string;
}

export const DashboardCard: Component<DashboardCardProps> = (props) => {
  return (
    <div class="bg-white rounded-xl border p-6 flex flex-col gap-1">
      <span class="text-sm text-gray-500">{props.label}</span>
      <span class="text-3xl font-bold tracking-tight">{props.value}</span>
      <Show when={props.subtitle}>
        <span class="text-sm text-gray-400">{props.subtitle}</span>
      </Show>
    </div>
  );
};
