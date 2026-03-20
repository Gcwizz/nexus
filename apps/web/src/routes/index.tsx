import { A } from '@solidjs/router';

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
        <ModuleCard href="/connect" number={1} title="Connect" description="Universal Connector Hub" />
        <ModuleCard href="/ontology" number={2} title="Map" description="Ontology Engine" />
        <ModuleCard href="/graph" number={3} title="Explore" description="Knowledge Graph" />
        <ModuleCard href="/canvas" number={4} title="Processes" description="Process Canvas" />
        <ModuleCard href="/optimise" number={5} title="Optimise" description="AI Recommendations" />
        <ModuleCard href="/design" number={6} title="Design" description="Target State" />
        <ModuleCard href="/spec" number={7} title="Specify" description="Software Specs" />
        <ModuleCard href="/build" number={8} title="Build" description="AI Build Engine" />
        <ModuleCard href="/migrate" number={9} title="Populate" description="Data Migration" />
      </div>
    </main>
  );
}

function ModuleCard(props: { href: string; number: number; title: string; description: string }) {
  return (
    <A
      href={props.href}
      class="border rounded-xl p-6 bg-white hover:border-blue-400 hover:shadow-md transition-all flex flex-col gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    >
      <span class="text-xs text-gray-400 font-mono">Module {props.number}</span>
      <span class="text-lg font-semibold">{props.title}</span>
      <span class="text-sm text-gray-500">{props.description}</span>
    </A>
  );
}
