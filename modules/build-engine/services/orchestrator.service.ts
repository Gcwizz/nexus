import { getQueue } from '@nexus/events';
import {
  AgentDeadlockError,
  TokenBudgetError,
  MergeConflictError,
} from '@nexus/contracts/errors';
import type { SpecBundle } from '@nexus/contracts/specs';
import type {
  BuildPlan,
  BuildProgress,
  BuildPhase,
  DAGNode,
  AgentState,
  AgentJobData,
  BuildLogEntry,
} from '../types.js';

// ── Constants ────────────────────────────────────────────────────

const MAX_CONCURRENT_AGENTS = 3;
const DEADLOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_BUDGET_PER_AGENT = 200_000;
const TOKEN_ALERT_THRESHOLD = 0.8;
const BUILD_AGENT_QUEUE = 'build:agent';

// ── In-memory build state (per-process) ──────────────────────────
// In production, this would be in Redis. For the modular monolith
// single-process model, in-memory maps suffice with BullMQ persistence.

const buildPlans = new Map<string, BuildPlan>();
const buildProgress = new Map<string, BuildProgress>();
const buildLogs = new Map<string, BuildLogEntry[]>();
const conflictQueues = new Map<string, string[]>();

// ── Build Plan Creation ──────────────────────────────────────────

export function createBuildPlan(
  buildId: string,
  orgId: string,
  specBundle: SpecBundle,
): BuildPlan {
  const dag = resolveDependencyDAG(specBundle);
  const totalBudget = specBundle.modules.length * TOKEN_BUDGET_PER_AGENT;

  const agents: AgentState[] = specBundle.modules.map((mod) => ({
    id: `agent-${buildId}-${mod.id}`,
    buildId,
    moduleId: mod.id,
    moduleName: mod.name,
    status: 'queued',
    currentTask: 'Waiting in queue',
    filesGenerated: [],
    testsTotal: 0,
    testsPassing: 0,
    testsFailing: 0,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      budgetLimit: TOKEN_BUDGET_PER_AGENT,
      thresholdAlerted: false,
    },
  }));

  const plan: BuildPlan = {
    buildId,
    orgId,
    specBundleId: specBundle.id,
    dag,
    agents,
    tokenBudget: totalBudget,
    tokenUsed: 0,
    createdAt: new Date(),
  };

  buildPlans.set(buildId, plan);
  buildProgress.set(buildId, {
    buildId,
    orgId,
    phase: 'planning',
    modulesTotal: specBundle.modules.length,
    modulesComplete: 0,
    modulesFailed: 0,
    agents,
    tokenBudget: totalBudget,
    tokenUsed: 0,
    startedAt: new Date(),
  });
  buildLogs.set(buildId, []);

  addLog(buildId, 'info', `Build plan created with ${specBundle.modules.length} modules`);

  return plan;
}

// ── DAG Resolution ───────────────────────────────────────────────

export function resolveDependencyDAG(specBundle: SpecBundle): DAGNode[] {
  const graph = specBundle.dependencyGraph;
  const moduleIds = specBundle.modules.map((m) => m.id);
  const nodes: DAGNode[] = [];

  // Build reverse dependency map (dependents)
  const dependentsMap: Record<string, string[]> = {};
  for (const id of moduleIds) {
    dependentsMap[id] = [];
  }
  for (const [id, deps] of Object.entries(graph)) {
    for (const dep of deps) {
      if (dependentsMap[dep]) {
        dependentsMap[dep].push(id);
      }
    }
  }

  // Compute depth via topological sort
  const depths: Record<string, number> = {};

  function computeDepth(id: string, visited: Set<string>): number {
    if (depths[id] !== undefined) return depths[id];
    if (visited.has(id)) {
      // Circular dependency detected
      throw new AgentDeadlockError(
        `Circular dependency detected involving module ${id}`,
        { orgId: specBundle.orgId },
      );
    }

    visited.add(id);
    const deps = graph[id] ?? [];
    const maxDepDpeth = deps.length === 0
      ? 0
      : Math.max(...deps.map((d) => computeDepth(d, visited) + 1));

    visited.delete(id);
    depths[id] = maxDepDpeth;
    return maxDepDpeth;
  }

  for (const id of moduleIds) {
    computeDepth(id, new Set());
  }

  for (const id of moduleIds) {
    nodes.push({
      moduleId: id,
      dependencies: graph[id] ?? [],
      dependents: dependentsMap[id] ?? [],
      depth: depths[id] ?? 0,
    });
  }

  // Sort by depth (independent modules first)
  nodes.sort((a, b) => a.depth - b.depth);

  return nodes;
}

// ── Agent Scheduling ─────────────────────────────────────────────

export async function scheduleAgents(
  buildId: string,
  architecture: import('../types.js').ProjectArchitecture,
  specBundle: SpecBundle,
): Promise<void> {
  const plan = buildPlans.get(buildId);
  if (!plan) throw new Error(`No build plan found for ${buildId}`);

  updatePhase(buildId, 'generating');
  addLog(buildId, 'info', 'Scheduling agents for code generation');

  const queue = getQueue(BUILD_AGENT_QUEUE);

  // Schedule agents in dependency order, respecting concurrency
  const readyModules = getReadyModules(plan);

  for (const moduleId of readyModules) {
    const specModule = specBundle.modules.find((m) => m.id === moduleId);
    if (!specModule) continue;

    const agent = plan.agents.find((a) => a.moduleId === moduleId);
    if (!agent) continue;

    const jobData: AgentJobData = {
      buildId,
      orgId: plan.orgId,
      agentId: agent.id,
      specModule,
      architecture,
      tokenBudget: TOKEN_BUDGET_PER_AGENT,
    };

    await queue.add(`agent:${moduleId}`, jobData, {
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    });

    agent.status = 'running';
    agent.currentTask = 'Starting code generation';
    agent.startedAt = new Date();
    addLog(buildId, 'info', `Agent ${agent.id} scheduled for module ${specModule.name}`, agent.id, moduleId);
  }

  // Start deadlock watchdog
  startDeadlockWatchdog(buildId);
}

function getReadyModules(plan: BuildPlan): string[] {
  const completedModules = new Set(
    plan.agents
      .filter((a) => a.status === 'complete')
      .map((a) => a.moduleId),
  );

  const runningCount = plan.agents.filter((a) => a.status === 'running').length;
  const availableSlots = MAX_CONCURRENT_AGENTS - runningCount;

  if (availableSlots <= 0) return [];

  const ready: string[] = [];

  for (const node of plan.dag) {
    if (ready.length >= availableSlots) break;

    const agent = plan.agents.find((a) => a.moduleId === node.moduleId);
    if (!agent || agent.status !== 'queued') continue;

    // Check if module is in conflict queue
    const conflicts = conflictQueues.get(plan.buildId) ?? [];
    if (conflicts.includes(node.moduleId)) continue;

    // Check if all dependencies are complete
    const allDepsComplete = node.dependencies.every((dep) => completedModules.has(dep));
    if (allDepsComplete) {
      ready.push(node.moduleId);
    }
  }

  return ready;
}

// ── Agent Completion Handling ────────────────────────────────────

export async function handleAgentComplete(
  buildId: string,
  agentId: string,
  files: string[],
  testResults: { total: number; passing: number; failing: number },
  tokenUsage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  const plan = buildPlans.get(buildId);
  if (!plan) throw new Error(`No build plan found for ${buildId}`);

  const agent = plan.agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`No agent found: ${agentId}`);

  agent.status = 'complete';
  agent.currentTask = 'Complete';
  agent.filesGenerated = files;
  agent.testsTotal = testResults.total;
  agent.testsPassing = testResults.passing;
  agent.testsFailing = testResults.failing;
  agent.tokenUsage.inputTokens = tokenUsage.inputTokens;
  agent.tokenUsage.outputTokens = tokenUsage.outputTokens;
  agent.completedAt = new Date();

  // Update overall token usage
  plan.tokenUsed += tokenUsage.inputTokens + tokenUsage.outputTokens;

  const progress = buildProgress.get(buildId);
  if (progress) {
    progress.modulesComplete += 1;
    progress.tokenUsed = plan.tokenUsed;
    progress.agents = plan.agents;
  }

  addLog(buildId, 'info', `Agent ${agentId} completed: ${files.length} files, ${testResults.passing}/${testResults.total} tests passing`, agentId, agent.moduleId);

  // Check if all agents are done
  const allDone = plan.agents.every((a) => a.status === 'complete' || a.status === 'failed');
  if (allDone) {
    const anyFailed = plan.agents.some((a) => a.status === 'failed');
    updatePhase(buildId, anyFailed ? 'failed' : 'testing');
    addLog(buildId, anyFailed ? 'warn' : 'info', `All agents completed. ${anyFailed ? 'Some agents failed.' : 'Moving to testing phase.'}`);
  }
}

export async function handleAgentFailed(
  buildId: string,
  agentId: string,
  error: string,
): Promise<void> {
  const plan = buildPlans.get(buildId);
  if (!plan) throw new Error(`No build plan found for ${buildId}`);

  const agent = plan.agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`No agent found: ${agentId}`);

  agent.status = 'failed';
  agent.currentTask = 'Failed';
  agent.error = error;
  agent.completedAt = new Date();

  const progress = buildProgress.get(buildId);
  if (progress) {
    progress.modulesFailed += 1;
    progress.agents = plan.agents;
  }

  addLog(buildId, 'error', `Agent ${agentId} failed: ${error}`, agentId, agent.moduleId);

  // Block dependent modules
  const node = plan.dag.find((n) => n.moduleId === agent.moduleId);
  if (node) {
    for (const depId of node.dependents) {
      const depAgent = plan.agents.find((a) => a.moduleId === depId);
      if (depAgent && depAgent.status === 'queued') {
        depAgent.status = 'blocked';
        depAgent.currentTask = `Blocked: dependency ${agent.moduleName} failed`;
        addLog(buildId, 'warn', `Agent for ${depAgent.moduleName} blocked due to failed dependency`, depAgent.id, depId);
      }
    }
  }
}

// ── Token Budget Management ──────────────────────────────────────

export function trackTokenUsage(
  buildId: string,
  agentId: string,
  inputTokens: number,
  outputTokens: number,
): void {
  const plan = buildPlans.get(buildId);
  if (!plan) return;

  const agent = plan.agents.find((a) => a.id === agentId);
  if (!agent) return;

  agent.tokenUsage.inputTokens += inputTokens;
  agent.tokenUsage.outputTokens += outputTokens;

  const totalAgentTokens = agent.tokenUsage.inputTokens + agent.tokenUsage.outputTokens;

  // 80% threshold alert
  if (!agent.tokenUsage.thresholdAlerted && totalAgentTokens >= agent.tokenUsage.budgetLimit * TOKEN_ALERT_THRESHOLD) {
    agent.tokenUsage.thresholdAlerted = true;
    addLog(buildId, 'warn', `Agent ${agentId} reached 80% token budget (${totalAgentTokens}/${agent.tokenUsage.budgetLimit})`, agentId, agent.moduleId);
  }

  // Budget exceeded
  if (totalAgentTokens > agent.tokenUsage.budgetLimit) {
    throw new TokenBudgetError(
      `Agent ${agentId} exceeded token budget: ${totalAgentTokens} > ${agent.tokenUsage.budgetLimit}`,
      { orgId: plan.orgId },
    );
  }

  // Update overall
  plan.tokenUsed = plan.agents.reduce((sum, a) => sum + a.tokenUsage.inputTokens + a.tokenUsage.outputTokens, 0);
}

// ── Merge Conflict Detection ─────────────────────────────────────

export function handleMergeConflict(
  buildId: string,
  conflictingModuleId: string,
  conflictDetails: string,
): void {
  const plan = buildPlans.get(buildId);
  if (!plan) return;

  // Queue the conflicting module for sequential execution
  const conflicts = conflictQueues.get(buildId) ?? [];
  conflicts.push(conflictingModuleId);
  conflictQueues.set(buildId, conflicts);

  addLog(buildId, 'warn', `Merge conflict detected for module ${conflictingModuleId}: ${conflictDetails}. Queued for sequential resolution.`, undefined, conflictingModuleId);

  throw new MergeConflictError(
    `Merge conflict in module ${conflictingModuleId}: ${conflictDetails}`,
    { orgId: plan.orgId },
  );
}

// ── Deadlock Detection ───────────────────────────────────────────

const deadlockTimers = new Map<string, ReturnType<typeof setTimeout>>();

function startDeadlockWatchdog(buildId: string): void {
  // Clear any existing timer
  const existing = deadlockTimers.get(buildId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    checkForDeadlock(buildId);
  }, DEADLOCK_TIMEOUT_MS);

  deadlockTimers.set(buildId, timer);
}

function checkForDeadlock(buildId: string): void {
  const plan = buildPlans.get(buildId);
  if (!plan) return;

  const allDone = plan.agents.every((a) =>
    a.status === 'complete' || a.status === 'failed' || a.status === 'blocked',
  );
  if (allDone) return;

  // If no agents are running but some are still queued, it's a deadlock
  const runningAgents = plan.agents.filter((a) => a.status === 'running');
  const queuedAgents = plan.agents.filter((a) => a.status === 'queued');

  if (runningAgents.length === 0 && queuedAgents.length > 0) {
    addLog(buildId, 'error', `Deadlock detected: ${queuedAgents.length} agents queued but none running`);
    updatePhase(buildId, 'failed');

    throw new AgentDeadlockError(
      `Deadlock detected in build ${buildId}: ${queuedAgents.length} agents stuck in queue with no running agents`,
      { orgId: plan.orgId },
    );
  }

  // Restart watchdog if still running
  if (runningAgents.length > 0) {
    startDeadlockWatchdog(buildId);
  }
}

export function clearDeadlockWatchdog(buildId: string): void {
  const timer = deadlockTimers.get(buildId);
  if (timer) {
    clearTimeout(timer);
    deadlockTimers.delete(buildId);
  }
}

// ── Status Queries ───────────────────────────────────────────────

export function getBuildPlan(buildId: string): BuildPlan | undefined {
  return buildPlans.get(buildId);
}

export function getBuildProgress(buildId: string): BuildProgress | undefined {
  return buildProgress.get(buildId);
}

export function getBuildLogs(buildId: string, agentFilter?: string, moduleFilter?: string): BuildLogEntry[] {
  const logs = buildLogs.get(buildId) ?? [];
  return logs.filter((log) => {
    if (agentFilter && log.agentId !== agentFilter) return false;
    if (moduleFilter && log.moduleId !== moduleFilter) return false;
    return true;
  });
}

export function getAgentStates(buildId: string): AgentState[] {
  const plan = buildPlans.get(buildId);
  return plan?.agents ?? [];
}

// ── Phase Management ─────────────────────────────────────────────

export function updatePhase(buildId: string, phase: BuildPhase): void {
  const progress = buildProgress.get(buildId);
  if (progress) {
    progress.phase = phase;
    if (phase === 'complete' || phase === 'failed') {
      progress.completedAt = new Date();
    }
  }
}

// ── Logging ──────────────────────────────────────────────────────

export function addLog(
  buildId: string,
  level: BuildLogEntry['level'],
  message: string,
  agentId?: string,
  moduleId?: string,
  details?: Record<string, unknown>,
): void {
  const logs = buildLogs.get(buildId) ?? [];
  logs.push({
    timestamp: new Date(),
    level,
    agentId,
    moduleId,
    message,
    details,
  });
  buildLogs.set(buildId, logs);
}
