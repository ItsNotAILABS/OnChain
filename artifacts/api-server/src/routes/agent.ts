import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { decodeMonadTransaction } from "../services/monadAgentDecoder";

const router: IRouter = Router();

const decodeSchema = z.object({
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "transactionHash must be a 32-byte hex value"),
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

export default router;
