import { createHash } from "node:crypto";

export type ApprovalMode = "none" | "human" | "multisig" | "hardware" | "custody-policy";
export type McpSecurityRisk = "observe" | "simulate" | "prepare" | "execute" | "critical";

export type AuthenticatedAgentSession = {
  sessionId: string;
  agentId: string;
  agentCardVersion: number;
  issuedAt: number;
  expiresAt: number;
  capabilities: string[];
  nonce: string;
  signatureVerified: boolean;
};

export type McpSecurityRequest = {
  requestId: string;
  serverId: string;
  toolName: string;
  capability: string;
  riskTier: McpSecurityRisk;
  targetChain?: string;
  estimatedValueUsd?: number;
  inputSchemaHash: string;
  outputSchemaHash: string;
  intentNonce: string;
  deadline: number;
  containsSecrets?: boolean;
  sandboxRequested?: boolean;
  approvalMode: ApprovalMode;
};

export type McpSecurityPolicy = {
  allowedServers: string[];
  allowedTools: string[];
  allowedCapabilities: string[];
  allowedChains: string[];
  maximumTransactionValueUsd: number;
  maximumRequestsPerMinute: number;
  requireSandboxFor: McpSecurityRisk[];
  minimumApprovalByRisk: Partial<Record<McpSecurityRisk, ApprovalMode[]>>;
  trustedInputSchemaHashes: string[];
  trustedOutputSchemaHashes: string[];
  consumedNonces: string[];
  recentRequestTimestamps: number[];
};

export type McpSecurityDecision = {
  allowed: boolean;
  decisionHash: string;
  redactedRequest: McpSecurityRequest;
  reasons: string[];
  riskFlags: string[];
  controls: {
    authenticatedSession: boolean;
    serverAllowed: boolean;
    toolAllowed: boolean;
    capabilityAllowed: boolean;
    schemasTrusted: boolean;
    chainAllowed: boolean;
    valueAllowed: boolean;
    sandboxRequired: boolean;
    sandboxSatisfied: boolean;
    approvalSatisfied: boolean;
    rateLimitSatisfied: boolean;
    replayProtected: boolean;
    deadlineSatisfied: boolean;
    secretsRedacted: boolean;
  };
  receiptPlan: string[];
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

const approvalRank: Record<ApprovalMode, number> = {
  none: 0,
  human: 1,
  hardware: 2,
  "custody-policy": 3,
  multisig: 4,
};

const redact = (request: McpSecurityRequest): McpSecurityRequest => ({
  ...request,
  containsSecrets: request.containsSecrets ? true : undefined,
});

export function evaluateMcpSecurityBoundary(
  session: AuthenticatedAgentSession,
  request: McpSecurityRequest,
  policy: McpSecurityPolicy,
  now = Math.floor(Date.now() / 1000),
): McpSecurityDecision {
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  const authenticatedSession = session.signatureVerified
    && session.sessionId.length > 0
    && session.agentId.length > 0
    && session.agentCardVersion > 0
    && session.issuedAt <= now
    && session.expiresAt > now;
  const serverAllowed = policy.allowedServers.includes(request.serverId);
  const toolAllowed = policy.allowedTools.includes(`${request.serverId}:${request.toolName}`);
  const capabilityAllowed = policy.allowedCapabilities.includes(request.capability)
    && session.capabilities.includes(request.capability);
  const schemasTrusted = policy.trustedInputSchemaHashes.includes(request.inputSchemaHash)
    && policy.trustedOutputSchemaHashes.includes(request.outputSchemaHash);
  const chainAllowed = !request.targetChain || policy.allowedChains.includes(request.targetChain);
  const valueAllowed = (request.estimatedValueUsd ?? 0) <= policy.maximumTransactionValueUsd;
  const sandboxRequired = policy.requireSandboxFor.includes(request.riskTier);
  const sandboxSatisfied = !sandboxRequired || request.sandboxRequested === true;

  const acceptedApprovalModes = policy.minimumApprovalByRisk[request.riskTier] ?? ["none"];
  const minimumApprovalRank = Math.min(...acceptedApprovalModes.map((mode) => approvalRank[mode]));
  const approvalSatisfied = acceptedApprovalModes.includes(request.approvalMode)
    || approvalRank[request.approvalMode] >= minimumApprovalRank;

  const recentWindowStart = now - 60;
  const recentCount = policy.recentRequestTimestamps.filter((timestamp) => timestamp >= recentWindowStart).length;
  const rateLimitSatisfied = recentCount < policy.maximumRequestsPerMinute;
  const replayProtected = !policy.consumedNonces.includes(request.intentNonce)
    && request.intentNonce.length >= 16
    && request.intentNonce !== session.nonce;
  const deadlineSatisfied = request.deadline > now;
  const secretsRedacted = request.containsSecrets !== true;

  if (!authenticatedSession) riskFlags.push("agent-session-not-authenticated");
  if (!serverAllowed) riskFlags.push("server-not-allowlisted");
  if (!toolAllowed) riskFlags.push("tool-not-allowlisted");
  if (!capabilityAllowed) riskFlags.push("capability-not-authorized");
  if (!schemasTrusted) riskFlags.push("schema-hash-not-trusted");
  if (!chainAllowed) riskFlags.push("chain-not-allowlisted");
  if (!valueAllowed) riskFlags.push("transaction-value-exceeds-policy");
  if (!sandboxSatisfied) riskFlags.push("sandbox-required");
  if (!approvalSatisfied) riskFlags.push("approval-requirement-not-met");
  if (!rateLimitSatisfied) riskFlags.push("rate-limit-exceeded");
  if (!replayProtected) riskFlags.push("replay-or-invalid-nonce");
  if (!deadlineSatisfied) riskFlags.push("request-expired");
  if (!secretsRedacted) riskFlags.push("secret-bearing-request-denied");

  if (authenticatedSession) reasons.push(`authenticated agent ${session.agentId} using Agent Card v${session.agentCardVersion}`);
  if (capabilityAllowed) reasons.push(`capability ${request.capability} is authorized for the session`);
  if (schemasTrusted) reasons.push("input and output schemas match trusted hashes");
  if (sandboxSatisfied && sandboxRequired) reasons.push("required sandbox isolation is declared");
  if (approvalSatisfied && request.approvalMode !== "none") reasons.push(`${request.approvalMode} approval satisfies policy`);

  const controls = {
    authenticatedSession,
    serverAllowed,
    toolAllowed,
    capabilityAllowed,
    schemasTrusted,
    chainAllowed,
    valueAllowed,
    sandboxRequired,
    sandboxSatisfied,
    approvalSatisfied,
    rateLimitSatisfied,
    replayProtected,
    deadlineSatisfied,
    secretsRedacted,
  };

  const redactedRequest = redact(request);
  const decisionHash = sha256({
    session: {
      sessionId: session.sessionId,
      agentId: session.agentId,
      agentCardVersion: session.agentCardVersion,
      expiresAt: session.expiresAt,
    },
    request: redactedRequest,
    controls,
  });

  const allowed = riskFlags.length === 0;
  return {
    allowed,
    decisionHash,
    redactedRequest,
    reasons,
    riskFlags,
    controls,
    receiptPlan: [
      "authenticated-session-receipt",
      "capability-tool-match-receipt",
      "allowlist-decision-receipt",
      "schema-hash-receipt",
      "rate-limit-receipt",
      "replay-protection-receipt",
      "policy-decision-receipt",
      ...(sandboxRequired ? ["sandbox-receipt"] : []),
      ...(request.approvalMode !== "none" ? ["approval-receipt"] : []),
      ...(allowed ? ["execution-result-receipt", "receipt-chain-seal", "icp-evidence-anchor"] : ["denial-receipt"]),
    ],
  };
}
