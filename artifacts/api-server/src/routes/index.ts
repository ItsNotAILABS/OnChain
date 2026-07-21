import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import templatesRouter from "./templates";
import statsRouter from "./stats";
import { workspaceRouter } from "./workspace";
import { aiRouter, chainRouter } from "./ai";
import proxyRouter from "./proxy";
import walletsRouter from "./wallets";
import { authRouter } from "./auth";
import agentRouter from "./agent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(templatesRouter);
router.use(statsRouter);
router.use(workspaceRouter);
router.use("/ai", aiRouter);
router.use("/chain", chainRouter);
router.use("/agent", agentRouter);
router.use(proxyRouter);
router.use(walletsRouter);
router.use("/auth", authRouter);

export default router;
