import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { TEMPLATE_CATALOG, assembleDapp, getTemplateById } from "../services/dappTemplateCatalog";

const router: IRouter = Router();

const listSchema = z.object({
  category: z.string().min(1).max(128).optional(),
  component: z.string().min(1).max(128).optional(),
  risk: z.enum(["low", "medium", "high", "critical"]).optional(),
  ethereumReady: z.coerce.boolean().optional(),
  search: z.string().max(256).optional(),
}).partial();

router.get("/templates/catalog", (req: Request, res: Response) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid template query", issues: parsed.error.issues });
  const { category, component, risk, ethereumReady, search } = parsed.data;
  const needle = search?.toLowerCase();
  const templates = TEMPLATE_CATALOG.filter((template) => !category || template.category.toLowerCase() === category.toLowerCase())
    .filter((template) => !component || template.components.includes(component as never))
    .filter((template) => !risk || template.riskProfile === risk)
    .filter((template) => ethereumReady === undefined || template.ethereumReady === ethereumReady)
    .filter((template) => !needle || [template.name, template.description, template.category, ...template.tags].join(" ").toLowerCase().includes(needle));
  return res.status(200).json({ ok: true, total: templates.length, catalogTotal: TEMPLATE_CATALOG.length, templates });
});

router.get("/templates/catalog/:templateId", (req: Request, res: Response) => {
  const template = getTemplateById(req.params.templateId);
  if (!template) return res.status(404).json({ ok: false, error: "Template not found" });
  return res.status(200).json({ ok: true, template });
});

router.post("/templates/assemble", (req: Request, res: Response) => {
  const parsed = z.object({ templateId: z.string().min(1).max(256), appName: z.string().min(1).max(128).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid assembly request", issues: parsed.error.issues });
  try {
    const assembly = assembleDapp(parsed.data.templateId, parsed.data.appName);
    return res.status(200).json({
      ok: true,
      assembly,
      executionBoundary: {
        sourceFilesGenerated: false,
        contractsDeployed: false,
        transactionsSigned: false,
        reason: "This endpoint emits a deterministic dApp assembly manifest. A code-generation worker must materialize, test, and deploy the project separately.",
      },
    });
  } catch (error) {
    return res.status(404).json({ ok: false, error: error instanceof Error ? error.message : "Assembly failed" });
  }
});

export default router;
