import { createHash } from "node:crypto";

export type DappComponentKind =
  | "wallet-connect" | "network-switch" | "token-balance" | "swap" | "bridge" | "nft-mint"
  | "nft-marketplace" | "dao-governance" | "treasury" | "staking" | "lending" | "perpetuals"
  | "prediction-market" | "rwa" | "payments" | "subscription" | "escrow" | "crowdfunding"
  | "social" | "gaming" | "identity" | "credentials" | "agent-marketplace" | "mcp-console"
  | "analytics" | "receipt-explorer" | "oracle" | "iot-control" | "scient