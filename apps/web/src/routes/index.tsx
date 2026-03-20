import { A } from '@solidjs/router';

const modules = [
  { href: '/connect', number: 1, title: 'Connect', description: 'Universal Connector Hub', status: '3 tools synced', statusType: 'active' as const },
  { href: '/ontology', number: 2, title: 'Map', description: 'Ontology Engine', status: '78% validated', statusType: 'active' as const },
  { href: '/graph', number: 3, title: 'Explore', description: 'Knowledge Graph', status: '1,923 entities', statusType: 'active' as const },
  { href: '/canvas', number: 4, title: 'Processes', description: 'Process Canvas', status: '5 processes', statusType: 'active' as const },
  { href: '/optimise', number: 5, title: 'Optimise', description: 'AI Recommendations', status: '4 quick wins', statusType: 'warning' as const },
  { href: '/design', number: 6, title: 'Design', description: 'Target State', status: '2 collaborators', statusType: 'active' as const },
  { href: '/spec', number: 7, title: 'Specify', description: 'Software Specs', status: '5 modules', statusType: 'active' as const },
  { href: '/build', number: 8, title: 'Build', description: 'AI Build Engine', status: '55% complete', statusType: 'active' as const },
  { href: '/migrate', number: 9, title: 'Populate', description: 'Data Migration', status: '69% migrated', statusType: 'active' as const },
];

const statusDot = { active: 'bg-emerald-500', warning: 'bg-amber-500', idle: 'bg-gray-300' };

export default function Home() {
  return (
    <main class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <h1 class="text-4xl font-bold tracking-tight text-gray-900 mb-2">
        Nexus
      </h1>
      <p class="text-lg text-gray-500 mb-12 max-w-lg text-center">
        Autonomous Business Intelligence & Software Generation
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl w-full">
        {modules.map((m) => (
          <A
            href={m.href}
            class="border rounded-lg p-6 bg-white hover:border-blue-400 hover:shadow-md transition-all flex flex-col gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <span class="text-xs text-gray-400 font-mono">Module {m.number}</span>
            <span class="text-lg font-semibold">{m.title}</span>
            <span class="text-sm text-gray-500">{m.description}</span>
            <span class="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
              <span class={`w-1.5 h-1.5 rounded-full ${statusDot[m.statusType]}`} />
              {m.status}
            </span>
          </A>
        ))}
      </div>
    </main>
  );
}
