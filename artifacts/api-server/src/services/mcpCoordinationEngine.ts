import { createHash } from "node:crypto";

export type McpRiskTier = "observe" | "simulate" | "prepare" | "execute" | "critical";

export type AgentDescriptor = {
  agentId: string;
  namespace: string;
  cardVersion: number;
  capabilities: string[];
  trustScore: number;
  online: boolean;
};

export type McpToolDescriptor = {
  serverId: string;
  toolName: string;
  capability