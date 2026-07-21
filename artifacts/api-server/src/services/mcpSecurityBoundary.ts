import { createHash } from "node:crypto";

export type ApprovalMode = "none" | "human" | "multisig" | "hardware" | "custody-policy";
export type McpSecurityRisk = "observe" | "simulate" | "prepare" | "execute" | "critical";

export type AuthenticatedAgentSession = {
  sessionId: string;
  agentId: string;
  agentCardVersion: number;
  issued