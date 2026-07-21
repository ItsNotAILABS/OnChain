import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { decodeMonadTransaction } from "../services/monadAgentDecoder";
import { buildAgentTrustProfile } from "../services/agentTrustEngine";
import { analyzeCryptoPortfolio } from "../services/agentCryptoIntelligence";
import { analyzeParallaxMarkets } from "../services/parallaxMarketIntelligence";
import { buildCoordinationPlan } from "../services/mcpCoordinationEngine";

const router: IRouter = Router();

const decodeSchema = z.object({
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "transactionHash must be a 32-byte hex value"),
});

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
  objective: z.string().min(3).max(2_000),
  requiredCapabilities: z.array(z.string().min(1).max(128)).min(1).max(64),
  agents: z.array(z.object({
    agentId: z.string().min(1).max(128),
    namespace: z.string().min(1).max(128),
    cardVersion: z.number().int().positive(),
    capabilities: z.array(z.string().min(1).max(128)).max(256),
    trustScore: z.number().min(0).max(100),
    online: z.boolean(),
  })).min(1).max(256),
  tools: z.array(z.object({
    serverId: z.string().min(1).max(128),
    toolName: z.string().min(1).max(128),
    capability: z.string().min(1).max(128),
    riskTier: z.enum(["observe", "simulate", "prepare", "execute", "critical"]),
    requiresSandbox: z.boolean(),
    requiresHumanApproval: z.boolean(),
    enabled: z.boolean(),
  })).min(1).max(2_000),
  policy: z.object({
    minimumTrustScore: z.number().min(0).max(100),
    allowExecution: z.boolean(),
    allowCritical: z.boolean(),
    requireSandboxForExecution: z.boolean(),
    maximumAgents: z.number().int().positive().max(256),
  }),
});

router.post("/decode-transaction", async (req: Request, res: Response) => {
  const parsed = decodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid Monad transaction hash", issues: parsed.error.issues });
  }

  try {
    const decoded = await decodeMonadTransaction(parsed.data.transactionHash);
    return res.status(200).json({ ok: true, decoded });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error
      ? Number((error as { status: unknown }).status)
      : 502;
    const message = error instanceof Error ? error.message : "Monad transaction decoding failed";
    return res.status(Number.isInteger(status) ? status : 502).json({ ok: false, error: message });
  }
});

router.post("/trust-profile", (req: Request, res: Response) => {
  const parsed = trustProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid agent trust inputs", issues: parsed.error.issues });
  }

  const profile = buildAgentTrustProfile(parsed.data);
  return res.status(200).json({
    ok: true,
    profile,
    notice: "This deterministic procurement profile is a policy aid, not a transferable reputation token or financial guarantee.",
  });
});

router.post("/crypto-intelligence", (req: Request, res: Response) => {
  const parsed = cryptoIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid crypto intelligence inputs", issues: parsed.error.issues });
  }

  const intelligence = analyzeCryptoPortfolio(parsed.data);
  return res.status(200).json({
    ok: true,
    intelligence,
    executionBoundary: {
      transactionCreated: false,
      transactionSigned: false,
      transactionBroadcast: false,
      reason: "The intelligence layer proposes governed actions only. A wallet or smart account must independently simulate and authorize execution.",
    },
  });
});

router.post("/parallax/market-intelligence", (req: Request, res: Response) => {
  const parsed = parallaxMarketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid PARALLAX market inputs", issues: parsed.error.issues });
  }

  const intelligence = analyzeParallaxMarkets(parsed.data.markets, parsed.data.policy);
  return res.status(200).json({
    ok: true,
    intelligence,
    product: "PARALLAX Ethereum Market Intelligence",
    notice: "Opportunities are analytical outputs, not investment advice or executed trades.",
  });
});

router.post("/mcp/coordination-plan", (req: Request, res: Response) => {
  const parsed = mcpCoordinationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid MCP coordination inputs", issues: parsed.error.issues });
  }

  const plan = buildCoordinationPlan(parsed.data);
  return res.status(200).json({
    ok: true,
    plan,
    executionBoundary: {
      toolsInvoked: false,
      transactionsSigned: false,
      externalStateChanged: false,
      reason: "This endpoint produces a deterministic governed coordination plan. A bridge runtime must enforce policy, sandboxing, authentication, and approval before invocation.",
    },
  });
});

export default router;
