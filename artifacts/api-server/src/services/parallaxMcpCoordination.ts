import { createHash } from "node:crypto";

export type McpRiskTier = "observe" | "simulate" | "prepare" | "execute" | "critical";
export type McpTransport = "stdio" | "sse" | "streamable-http" | "websocket" | "local-http";

export type McpToolDescriptor = {
  namespace: string;
  serverId: string;
  description: string;
  transport: McpTransport;
  riskTier: McpRiskTier;
  inputSchemaHash: string;
  outputSchemaHash: string;
  timeoutMs: number;
  requiresSandbox: boolean;
  requiresHumanApproval: boolean;
  allowedChains?: string[];
  maximumValueUsd?: number;
};

export type AgentNode = {
  agentId: string;
  cardVersion: number;
  capabilities: string[];
  trustScore: number;
  runtimeReachable: boolean;
};

export type CoordinationTask = {
  taskId: string;
  objective: string;
  requestedCapability: string;
  targetChain?: string;
  estimatedValueUsd?: number;
  dependencies?: string[];
  evidenceHash: string;
};

export type CoordinationPolicy = {
  minimumTrustScore: number;
  maximumExecutionValueUsd: number;
  allowCriticalTools: boolean;
  requireHumanApprovalForExecution: boolean;
  maximumParallelTasks: number;
};

export type CoordinationDecision = {
  accepted: boolean;
  intentHash: string;
  assignedAgentId?: string;
  selectedTool?: McpToolDescriptor;
  executionMode: "denied" | "automatic" | "sandboxed" | "approval-required";
  reasons: string[];
  riskFlags: string[];
  receiptPlan: string[];
};

const riskWeight: Record<McpRiskTier, number> = {
  observe: 0,
  simulate: 1,
  prepare: 2,
  execute: 3,
  critical: 4,
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: unknown): string => `0x${createHash("sha256").update(stableStringify(value)).digest("hex")}`;

export function coordinateMcpTask(
  task: CoordinationTask,
  agents: AgentNode[],
  tools: McpToolDescriptor[],
  policy: CoordinationPolicy,
): CoordinationDecision {
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const intentHash = sha256({ task, policy });

  const candidates = agents
    .filter((agent) => agent.runtimeReachable)
    .filter((agent) => agent.trustScore >= policy.minimumTrustScore)
    .filter((agent) => agent.capabilities.includes(task.requestedCapability))
    .sort((a, b) => b.trustScore - a.trustScore || b.cardVersion - a.cardVersion || a.agentId.localeCompare(b.agentId));

  if (candidates.length === 0) {
    riskFlags.push("no-eligible-agent");
    return {
      accepted: false,
      intentHash,
      executionMode: "denied",
      reasons,
      riskFlags,
      receiptPlan: ["intent-denial-receipt"],
    };
  }

  const matchingTools = tools
    .filter((tool) => tool.namespace === task.requestedCapability)
    .filter((tool) => !task.targetChain || !tool.allowedChains || tool.allowedChains.includes(task.targetChain))
    .sort((a, b) => riskWeight[a.riskTier] - riskWeight[b.riskTier] || a.namespace.localeCompare(b.namespace));

  if (matchingTools.length === 0) {
    riskFlags.push("capability-not-exposed-by-bridge");
    return {
      accepted: false,
      intentHash,
      assignedAgentId: candidates[0]?.agentId,
      executionMode: "denied",
      reasons,
      riskFlags,
      receiptPlan: ["intent-denial-receipt"],
    };
  }

  const selectedTool = matchingTools[0]!;
  const assignedAgent = candidates[0]!;
  const valueUsd = task.estimatedValueUsd ?? 0;

  if (selectedTool.riskTier === "critical" && !policy.allowCriticalTools) riskFlags.push("critical-tool-disabled");
  if (valueUsd > policy.maximumExecutionValueUsd) riskFlags.push("execution-value-exceeds-policy");
  if (selectedTool.maximumValueUsd !== undefined && valueUsd > selectedTool.maximumValueUsd) riskFlags.push("tool-value-limit-exceeded");
  if (task.targetChain && selectedTool.allowedChains && !selectedTool.allowedChains.includes(task.targetChain)) riskFlags.push("chain-not-allowed");

  if (riskFlags.length > 0) {
    return {
      accepted: false,
      intentHash,
      assignedAgentId: assignedAgent.agentId,
      selectedTool,
      executionMode: "denied",
      reasons,
      riskFlags,
      receiptPlan: ["intent-denial-receipt", "policy-decision-receipt"],
    };
  }

  reasons.push(`assigned to ${assignedAgent.agentId} at trust score ${assignedAgent.trustScore}`);
  reasons.push(`selected ${selectedTool.namespace} from ${selectedTool.serverId}`);
  reasons.push(`active Agent Card version ${assignedAgent.cardVersion}`);

  const approvalRequired = selectedTool.requiresHumanApproval
    || selectedTool.riskTier === "execute"
    || selectedTool.riskTier === "critical"
    || (policy.requireHumanApprovalForExecution && riskWeight[selectedTool.riskTier] >= riskWeight.execute);

  const executionMode = approvalRequired
    ? "approval-required"
    : selectedTool.requiresSandbox || selectedTool.riskTier === "simulate"
      ? "sandboxed"
      : "automatic";

  return {
    accepted: true,
    intentHash,
    assignedAgentId: assignedAgent.agentId,
    selectedTool,
    executionMode,
    reasons,
    riskFlags,
    receiptPlan: [
      "intent-receipt",
      "agent-selection-receipt",
      "tool-schema-receipt",
      "policy-decision-receipt",
      ...(executionMode === "sandboxed" ? ["sandbox-execution-receipt"] : []),
      ...(executionMode === "approval-required" ? ["approval-receipt"] : []),
      "tool-result-receipt",
      "receipt-chain-seal",
      "icp-evidence-anchor",
    ],
  };
}
