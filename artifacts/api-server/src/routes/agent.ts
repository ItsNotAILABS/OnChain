import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { decodeMonadTransaction } from "../services/monadAgentDecoder";
import { buildAgentTrustProfile } from "../services/agentTrustEngine";

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

router.post("/decode-transaction", async (req: Request, res: Response) => {
  const parsed = decodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid Monad transaction hash",
      issues: parsed.error.issues,
    });
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
    return res.status(400).json({
      ok: false,
      error: "Invalid agent trust inputs",
      issues: parsed.error.issues,
    });
  }

  const profile = buildAgentTrustProfile(parsed.data);
  return res.status(200).json({
    ok: true,
    profile,
    notice: "This deterministic procurement profile is a policy aid, not a transferable reputation token or financial guarantee.",
  });
});

export default router;
