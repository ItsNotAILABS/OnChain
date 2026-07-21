import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { decodeMonadTransaction } from "../services/monadAgentDecoder";
import { buildAgentTrustProfile } from "../services/agentTrustEngine";
import { analyzeCryptoPortfolio } from "../services/agentCryptoIntelligence";
import { analyzeParallaxMarkets } from "../services/parallaxMarketIntelligence";
import { coordinateMcpTask } from "../services/parallaxMcpCoordination";
import { evaluateMcpSecurityBoundary } from "../services/mcpSecurityBoundary";

const router: IRouter = Router();

const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const riskSchema = z.enum(["observe", "simulate", "prepare", "execute", "critical"]);
const approvalSchema = z.enum(["none", "human", "multisig", "hardware", "custody-policy"]);

const decodeSchema = z.object({ transactionHash: hashSchema });

const trustProfileSchema = z.object({
  cardVersion: z.number().int().positive(),
  identityVerified: z.boolean(),
  commitmentPlanesPresent: z.number().int().min(0).max(4),
  completedJobs: z.number().int().nonnegative(),
  disputedJobs: z.number().int().nonnegative(),
  settledVolumeWei: z.string().regex(/^\d+$/, "settledVolumeWei must be an unsigned integer string"),
  receiptCoverageBps: z.number().int().min(0).max(10_000),
  credentialCount: z.number().int().nonnegative(),
  runtimeReachable: z.boolean(),
  doctrinePublished: z.boolean(),
  latestEvidenceAgeSeconds: z.number().int().nonnegative().optional(),
});

const cryptoIntelligenceSchema = z.object({
  positions: z.array(z.object({
    chainId: z.string().min(1),
    symbol: z.string().min(1).max(32),
    tokenAddress: z.string().optional(),
    balance: z.string().regex(/^\d+(\.\d+)?$/, "balance must be a non-negative decimal string"),
    priceUsd: z.number().nonnegative(),
    volatilityBps: z.number().int().nonnegative().optional(),
    liquidityUsd: z.number().nonnegative().optional(),
  })).max(500),
  stableSymbols: z.array(z.string().min(1).max(32)).max(50).optional(),
  maxSingleAssetBps: z.number().int().min(1).max(10_000),
  minimumStableReserveBps: z.number().int().min(0).max(10_000),
  minimumLiquidityUsd: z.number().nonnegative(),
});

const parallaxMarketSchema = z.object({
  markets: z.array(z.object({
    venue: z.string().min(1).max(128),
    chainId: z.string().min(1).max(64),
    marketType: z.enum(["spot", "perpetual", "lending", "staking", "prediction", "rwa", "fx", "commodity", "index"]),
    symbol: z.string().min(1).max(64),
    price: z.number().positive(),
    liquidityUsd: z.number().nonnegative(),
    volume24hUsd: z.number().nonnegative(),
    fundingRateBps: z.number().optional(),
    borrowRateBps: z.number().optional(),
    volatilityBps: z.number().nonnegative().optional(),
    oracleAgeSeconds: z.number().int().nonnegative().optional(),
    confidenceBps: z.number().int().min(0).max(10_000).optional(),
  })).min(2).max(2_000),
  policy: z.object({
    maximumNotionalUsd: z.number().positive(),
    maximumSlippageBps: z.number().int().min(1).max(5_000),
    minimumLiquidityUsd: z.number().nonnegative(),
    maximumOracleAgeSeconds: z.number().int().positive(),
    allowedMarketTypes: z.array(z.enum(["spot", "perpetual", "lending", "staking", "prediction", "rwa", "fx", "commodity", "index"])).min(1),
    requireHumanApprovalAboveUsd: z.number().nonnegative(),
  }),
});

const mcpCoordinationSchema = z.object({
  task: z.object({
    taskId: z.string().min(1).max(128),
    objective: z.string().min(3).max(2_000),
    requestedCapability: z.string().min(1).max(128),
    targetChain: z.string().min(1).max(64).optional(),
    estimatedValueUsd: z.number().nonnegative().optional(),
    dependencies: z.array(z.string().min(1).max(128)).max(128).optional(),
    evidenceHash: hashSchema,
  }),
  agents: z.array(z.object({
    agentId: z.string().min(1).max(128),
    cardVersion: z.number().int().positive(),
    capabilities: z.array(z.string().min(1).max(128)).max(256),
    trustScore: z.number().min(0).max(100),
    runtimeReachable: z.boolean(),
  })).min(1).max(256),
  tools: z.array(z.object({
    namespace: z.string().min(1).max(128),
    serverId: z.string().min(1).max(128),
    description: z.string().min(1).max(1_000),
    transport: z.enum(["stdio", "sse", "streamable-http", "websocket", "local-http"]),
    riskTier: riskSchema,
    inputSchemaHash: hashSchema,
    outputSchemaHash: hashSchema,
    timeoutMs: z.number().int().positive().max(3_600_000),
    requiresSandbox: z.boolean(),
    requiresHumanApproval: z.boolean(),
    allowedChains: z.array(z.string().min(1).max(64)).max(64).optional(),
    maximumValueUsd: z.number().nonnegative().optional(),
  })).min(1).max(2_000),
  policy: z.object({
    minimumTrustScore: z.number().min(0).max(100),
    maximumExecutionValueUsd: z.number().nonnegative(),
    allowCriticalTools: z.boolean(),
    requireHumanApprovalForExecution: z.boolean(),
    maximumParallelTasks: z.number().int().positive().max(256),
  }),
});

const mcpSecuritySchema = z.object({
  session: z.object({
    sessionId: z.string().min(8).max(256),
    agentId: z.string().min(1).max(128),
    agentCardVersion: z.number().int().positive(),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    capabilities: z.array(z.string().min(1).max(128)).max(256),
    nonce: z.string().min(16).max(256),
    signatureVerified: z.boolean(),
  }),
  request: z.object({
    requestId: z.string().min(1).max(128),
    serverId: z.string().min(1).max(128),
    toolName: z.string().min(1).max(128),
    capability: z.string().min(1).max(128),
    riskTier: riskSchema,
    targetChain: z.string().min(1).max(64).optional(),
    estimatedValueUsd: z.number().nonnegative().optional(),
    inputSchemaHash: hashSchema,
    outputSchemaHash: hashSchema,
    intentNonce: z.string().min(16).max(256),
    deadline: z.number().int().positive(),
    containsSecrets: z.boolean().optional(),
    sandboxRequested: z.boolean().optional(),
    approvalMode: approvalSchema,
  }),
  policy: z.object({
    allowedServers: z.array(z.string().min(1).max(128)).max(512),
    allowedTools: z.array(z.string().min(3).max(257)).max(4_000),
    allowedCapabilities: z.array(z.string().min(1).max(128)).max(512),
    allowedChains: z.array(z.string().min(1).max(64)).max(128),
    maximumTransactionValueUsd: z.number().nonnegative(),
    maximumRequestsPerMinute: z.number().int().positive().max(100_000),
    requireSandboxFor: z.array(riskSchema).max(5),
    minimumApprovalByRisk: z.record(riskSchema, z.array(approvalSchema).min(1).max(5)).partial(),
    trustedInputSchemaHashes: z.array(hashSchema).max(4_000),
    trustedOutputSchemaHashes: z.array(hashSchema).max(4_000),
    consumedNonces: z.array(z.string().min(16).max(256)).max(100_000),
    recentRequestTimestamps: z.array(z.number().int().nonnegative()).max(100_000),
  }),
  now: z.number().int().nonnegative().optional(),
});

router.post("/decode-transaction", async (req: Request, res: Response) => {
  const parsed = decodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid Monad transaction hash", issues: parsed.error.issues });
  try {
    const decoded = await decodeMonadTransaction(parsed.data.transactionHash);
    return res.status(200).json({ ok: true, decoded });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : 502;
    const message = error instanceof Error ? error.message : "Monad transaction decoding failed";
    return res.status(Number.isInteger(status) ? status : 502).json({ ok: false, error: message });
  }
});

router.post("/trust-profile", (req: Request, res: Response) => {
  const parsed = trustProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid agent trust inputs", issues: parsed.error.issues });
  return res.status(200).json({ ok: true, profile: buildAgentTrustProfile(parsed.data), notice: "This deterministic procurement profile is a policy aid, not a transferable reputation token or financial guarantee." });
});

router.post("/crypto-intelligence", (req: Request, res: Response) => {
  const parsed = cryptoIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid crypto intelligence inputs", issues: parsed.error.issues });
  return res.status(200).json({ ok: true, intelligence: analyzeCryptoPortfolio(parsed.data), executionBoundary: { transactionCreated: false, transactionSigned: false, transactionBroadcast: false, reason: "The intelligence layer proposes governed actions only. A wallet or smart account must independently simulate and authorize execution." } });
});

router.post("/parallax/market-intelligence", (req: Request, res: Response) => {
  const parsed = parallaxMarketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid PARALLAX market inputs", issues: parsed.error.issues });
  return res.status(200).json({ ok: true, intelligence: analyzeParallaxMarkets(parsed.data.markets, parsed.data.policy), product: "PARALLAX Ethereum Market Intelligence", notice: "Opportunities are analytical outputs, not investment advice or executed trades." });
});

router.post("/mcp/coordination-plan", (req: Request, res: Response) => {
  const parsed = mcpCoordinationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid MCP coordination inputs", issues: parsed.error.issues });
  return res.status(200).json({ ok: true, decision: coordinateMcpTask(parsed.data.task, parsed.data.agents, parsed.data.tools, parsed.data.policy), executionBoundary: { toolsInvoked: false, transactionsSigned: false, externalStateChanged: false, reason: "This endpoint produces a deterministic governed coordination decision. A bridge runtime must enforce authentication, sandboxing, approval, and receipt capture before invocation." } });
});

router.post("/mcp/security-decision", (req: Request, res: Response) => {
  const parsed = mcpSecuritySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid MCP security boundary inputs", issues: parsed.error.issues });
  const decision = evaluateMcpSecurityBoundary(parsed.data.session, parsed.data.request, parsed.data.policy, parsed.data.now);
  return res.status(decision.allowed ? 200 : 403).json({
    ok: decision.allowed,
    decision,
    signingBoundary: {
      privateKeysAccepted: false,
      transactionsSigned: false,
      custodyPerformed: false,
      reason: "Financial signing remains isolated in a wallet, smart account, hardware signer, multisig, or governed custody layer.",
    },
  });
});

export default router;
