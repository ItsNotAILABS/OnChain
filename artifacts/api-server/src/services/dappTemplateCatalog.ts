import { createHash } from "node:crypto";

export type DappComponentKind =
  | "wallet-connect" | "network-switch" | "token-balance" | "swap" | "bridge" | "nft-mint"
  | "nft-marketplace" | "dao-governance" | "treasury" | "staking" | "lending" | "perpetuals"
  | "prediction-market" | "rwa" | "payments" | "subscription" | "escrow" | "crowdfunding"
  | "social" | "gaming" | "identity" | "credentials" | "agent-marketplace" | "mcp-console"
  | "analytics" | "receipt-explorer" | "oracle" | "iot-control" | "scientific-lab" | "admin";

export type DappTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  sophistication: "advanced" | "institutional" | "research";
  components: DappComponentKind[];
  monadReady: true;
  ethereumReady: boolean;
  requiresContracts: boolean;
  riskProfile: "low" | "medium" | "high" | "critical";
  tags: string[];
  manifestHash: string;
};

export type DappAssembly = {
  template: DappTemplate;
  app: {
    name: string;
    slug: string;
    chainTargets: string[];
    pages: Array<{ path: string; title: string; components: DappComponentKind[] }>;
    components: Array<{ kind: DappComponentKind; id: string; props: Record<string, unknown> }>;
    environment: Record<string, string>;
    contracts: Array<{ name: string; purpose: string; deploy: false }>;
    security: string[];
    receipts: string[];
  };
  assemblyHash: string;
};

const categories: Array<{ name: string; components: DappComponentKind[]; tags: string[]; risk: DappTemplate["riskProfile"] }> = [
  { name: "DeFi", components: ["wallet-connect", "network-switch", "token-balance", "swap", "analytics", "receipt-explorer"], tags: ["swap", "liquidity", "routing"], risk: "high" },
  { name: "Lending", components: ["wallet-connect", "token-balance", "lending", "oracle", "treasury", "analytics"], tags: ["borrow", "lend", "collateral"], risk: "high" },
  { name: "Staking", components: ["wallet-connect", "staking", "treasury", "analytics", "receipt-explorer"], tags: ["staking", "rewards"], risk: "medium" },
  { name: "Perpetuals", components: ["wallet-connect", "perpetuals", "oracle", "analytics", "receipt-explorer"], tags: ["derivatives", "risk"], risk: "critical" },
  { name: "NFT", components: ["wallet-connect", "nft-mint", "nft-marketplace", "identity", "analytics"], tags: ["nft", "creator"], risk: "medium" },
  { name: "DAO", components: ["wallet-connect", "dao-governance", "treasury", "identity", "credentials"], tags: ["governance", "voting"], risk: "high" },
  { name: "Payments", components: ["wallet-connect", "payments", "subscription", "escrow", "receipt-explorer"], tags: ["payments", "commerce"], risk: "high" },
  { name: "Crowdfunding", components: ["wallet-connect", "crowdfunding", "escrow", "dao-governance", "analytics"], tags: ["fundraising", "escrow"], risk: "high" },
  { name: "Gaming", components: ["wallet-connect", "gaming", "nft-mint", "social", "analytics"], tags: ["gaming", "assets"], risk: "medium" },
  { name: "Social", components: ["wallet-connect", "social", "identity", "credentials", "payments"], tags: ["social", "identity"], risk: "medium" },
  { name: "RWA", components: ["wallet-connect", "rwa", "identity", "credentials", "oracle", "receipt-explorer"], tags: ["rwa", "compliance"], risk: "critical" },
  { name: "Prediction", components: ["wallet-connect", "prediction-market", "oracle", "analytics", "dao-governance"], tags: ["prediction", "oracle"], risk: "high" },
  { name: "Agent Economy", components: ["wallet-connect", "agent-marketplace", "credentials", "treasury", "mcp-console", "receipt-explorer"], tags: ["agents", "mcp"], risk: "critical" },
  { name: "Scientific Lab", components: ["scientific-lab", "mcp-console", "oracle", "iot-control", "receipt-explorer", "analytics"], tags: ["science", "simulation", "iot"], risk: "critical" },
  { name: "Infrastructure", components: ["mcp-console", "admin", "analytics", "receipt-explorer", "identity"], tags: ["infrastructure", "operations"], risk: "critical" },
];

const variants = [
  "Command Center", "Institutional Console", "Autonomous Studio", "Research Terminal", "Creator Suite",
  "Treasury Hub", "Marketplace", "Protocol Launchpad", "Governance OS", "Mobile Control",
  "Analytics Grid", "Compliance Desk", "Agent Workspace", "Operator Station", "Enterprise Portal",
  "Simulation Lab", "Settlement Network", "Liquidity Engine", "Community Stack", "Sovereign Runtime",
];

const sha256 = (value: unknown): string => `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

export const generateTemplateCatalog = (): DappTemplate[] => {
  const templates: DappTemplate[] = [];
  for (const category of categories) {
    for (const variant of variants) {
      const id = `${category.name}-${variant}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const sophistication: DappTemplate["sophistication"] = variant.includes("Research") || variant.includes("Simulation")
        ? "research"
        : variant.includes("Institutional") || variant.includes("Enterprise") || variant.includes("Compliance")
          ? "institutional"
          : "advanced";
      const body = {
        id,
        name: `${category.name} ${variant}`,
        category: category.name,
        description: `Preloaded ${category.name} dApp architecture for Monad with governed wallet, contract, analytics, and receipt surfaces.`,
        sophistication,
        components: category.components,
        monadReady: true as const,
        ethereumReady: ["DeFi", "Lending", "Staking", "Perpetuals", "RWA", "Payments", "Agent Economy"].includes(category.name),
        requiresContracts: !["Infrastructure"].includes(category.name),
        riskProfile: category.risk,
        tags: [...category.tags, variant.toLowerCase().replace(/\s+/g, "-")],
      };
      templates.push({ ...body, manifestHash: sha256(body) });
    }
  }
  return templates;
};

export const TEMPLATE_CATALOG = generateTemplateCatalog();

export const getTemplateById = (id: string): DappTemplate | undefined => TEMPLATE_CATALOG.find((template) => template.id === id);

export const assembleDapp = (templateId: string, appName?: string): DappAssembly => {
  const template = getTemplateById(templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);
  const name = appName?.trim() || template.name;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const components = template.components.map((kind, index) => ({
    kind,
    id: `${slug}-${kind}-${index + 1}`,
    props: {
      chain: "monad",
      prewired: true,
      simulationRequired: ["swap", "bridge", "lending", "perpetuals", "treasury", "iot-control"].includes(kind),
    },
  }));
  const pages = [
    { path: "/", title: "Overview", components: template.components.slice(0, 4) },
    { path: "/operate", title: "Operate", components: template.components.filter((kind) => !["analytics", "receipt-explorer"].includes(kind)) },
    { path: "/analytics", title: "Analytics", components: template.components.filter((kind) => ["analytics", "oracle", "receipt-explorer"].includes(kind)) },
    { path: "/governance", title: "Governance", components: template.components.filter((kind) => ["dao-governance", "treasury", "credentials", "admin"].includes(kind)) },
  ].filter((page) => page.components.length > 0);
  const app = {
    name,
    slug,
    chainTargets: template.ethereumReady ? ["monad", "ethereum"] : ["monad"],
    pages,
    components,
    environment: {
      MONAD_RPC_URL: "${MONAD_RPC_URL}",
      MONAD_CHAIN_ID: "${MONAD_CHAIN_ID}",
      WALLETCONNECT_PROJECT_ID: "${WALLETCONNECT_PROJECT_ID}",
      CONTRACT_REGISTRY_ADDRESS: "${CONTRACT_REGISTRY_ADDRESS}",
      MCP_BRIDGE_URL: "${MCP_BRIDGE_URL}",
    },
    contracts: template.requiresContracts ? [
      { name: "AppRegistry", purpose: "Versioned app and component manifest registry", deploy: false as const },
      { name: "PolicyModule", purpose: "Governed transaction and role policy", deploy: false as const },
      { name: "ReceiptAnchor", purpose: "Execution receipt commitment anchor", deploy: false as const },
    ] : [],
    security: ["wallet-signing-isolated", "simulation-before-execution", "chain-allowlist", "contract-allowlist", "receipt-chain-enabled"],
    receipts: ["template-manifest", "assembly", "simulation", "approval", "execution", "deployment"],
  };
  return { template, app, assemblyHash: sha256({ template: template.manifestHash, app }) };
};
