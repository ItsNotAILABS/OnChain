import { Contract, JsonRpcProvider, formatEther, formatUnits, getAddress, isAddress } from "ethers";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

export type PortfolioAssetInput = {
  chain: string;
  symbol: string;
  balance: string;
  priceUsd: number;
  volatilityBps: number;
  liquidityUsd: number;
  stablecoin: boolean;
  protocol?: string;
  confidenceBps: number;
};

export type PortfolioIntelligenceInput = {
  assets: PortfolioAssetInput[];
  liabilitiesUsd?: number;
  reserveTargetBps?: number;
  maximumAssetConcentrationBps?: number;
  maximumProtocolConcentrationBps?: number;
};

export type TransactionIntentInput = {
  chain: string;
  kind: "transfer" | "swap" | "approve" | "contract-call" | "bridge" | "stake" | "unstake";
  from: string;
  to: string;
  valueUsd: number;
  portfolioValueUsd: number;
  allowanceUsd?: number;
  slippageBps?: number;
  destinationVerified: boolean;
  contractVerified: boolean;
  simulationSucceeded: boolean;
  protocolRiskScore?: number;
  bridgeFinalitySeconds?: number;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function buildPortfolioIntelligence(input: PortfolioIntelligenceInput) {
  const positions = input.assets.map((asset) => {
    const balance = Number(asset.balance);
    const valueUsd = Number.isFinite(balance) ? balance * asset.priceUsd : 0;
    return { ...asset, valueUsd: Math.max(0, valueUsd) };
  });
  const grossAssetsUsd = positions.reduce((sum, asset) => sum + asset.valueUsd, 0);
  const liabilitiesUsd = Math.max(0, input.liabilitiesUsd ?? 0);
  const netValueUsd = Math.max(0, grossAssetsUsd - liabilitiesUsd);
  const stableValueUsd = positions.filter((asset) => asset.stablecoin).reduce((sum, asset) => sum + asset.valueUsd, 0);
  const reserveBps = grossAssetsUsd === 0 ? 0 : Math.round((stableValueUsd / grossAssetsUsd) * 10_000);

  const assetExposures = positions
    .map((asset) => ({ ...asset, concentrationBps: grossAssetsUsd === 0 ? 0 : Math.round((asset.valueUsd / grossAssetsUsd) * 10_000) }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const protocolMap = new Map<string, number>();
  for (const asset of positions) {
    const protocol = asset.protocol ?? "wallet";
    protocolMap.set(protocol, (protocolMap.get(protocol) ?? 0) + asset.valueUsd);
  }
  const protocolExposures = [...protocolMap.entries()]
    .map(([protocol, valueUsd]) => ({ protocol, valueUsd, concentrationBps: grossAssetsUsd === 0 ? 0 : Math.round((valueUsd / grossAssetsUsd) * 10_000) }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const weightedVolatilityBps = grossAssetsUsd === 0
    ? 0
    : Math.round(positions.reduce((sum, asset) => sum + asset.volatilityBps * asset.valueUsd, 0) / grossAssetsUsd);
  const weightedConfidenceBps = grossAssetsUsd === 0
    ? 0
    : Math.round(positions.reduce((sum, asset) => sum + asset.confidenceBps * asset.valueUsd, 0) / grossAssetsUsd);
  const illiquidValueUsd = positions.filter((asset) => asset.liquidityUsd < Math.max(25_000, asset.valueUsd * 5)).reduce((sum, asset) => sum + asset.valueUsd, 0);
  const illiquidBps = grossAssetsUsd === 0 ? 0 : Math.round((illiquidValueUsd / grossAssetsUsd) * 10_000);

  const concentrationLimit = input.maximumAssetConcentrationBps ?? 4_000;
  const protocolLimit = input.maximumProtocolConcentrationBps ?? 5_000;
  const reserveTarget = input.reserveTargetBps ?? 2_000;
  const riskFlags: string[] = [];
  if ((assetExposures[0]?.concentrationBps ?? 0) > concentrationLimit) riskFlags.push("asset-concentration-limit-exceeded");
  if ((protocolExposures[0]?.concentrationBps ?? 0) > protocolLimit) riskFlags.push("protocol-concentration-limit-exceeded");
  if (reserveBps < reserveTarget) riskFlags.push("stable-reserve-below-target");
  if (weightedVolatilityBps > 8_000) riskFlags.push("portfolio-volatility-elevated");
  if (illiquidBps > 2_500) riskFlags.push("illiquid-exposure-elevated");
  if (weightedConfidenceBps < 8_000) riskFlags.push("market-data-confidence-low");
  if (liabilitiesUsd > grossAssetsUsd * 0.5) riskFlags.push("liability-ratio-elevated");

  const riskScore = Math.round(clamp(
    (assetExposures[0]?.concentrationBps ?? 0) / 100 * 0.25 +
    (protocolExposures[0]?.concentrationBps ?? 0) / 100 * 0.2 +
    weightedVolatilityBps / 100 * 0.25 +
    illiquidBps / 100 * 0.15 +
    Math.max(0, reserveTarget - reserveBps) / 100 * 0.1 +
    Math.max(0, 10_000 - weightedConfidenceBps) / 100 * 0.05,
  ));

  return {
    grossAssetsUsd,
    liabilitiesUsd,
    netValueUsd,
    stableValueUsd,
    reserveBps,
    weightedVolatilityBps,
    weightedConfidenceBps,
    illiquidBps,
    riskScore,
    riskTier: riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "moderate" : "controlled",
    assetExposures,
    protocolExposures,
    riskFlags,
    controls: {
      requireHumanApproval: riskScore >= 35 || riskFlags.length > 0,
      blockAutonomousExecution: riskScore >= 60 || weightedConfidenceBps < 7_500,
      reserveGapUsd: Math.max(0, grossAssetsUsd * reserveTarget / 10_000 - stableValueUsd),
      recommendedMaximumSingleActionUsd: Math.max(0, netValueUsd * (riskScore >= 50 ? 0.01 : riskScore >= 25 ? 0.025 : 0.05)),
    },
  };
}

export function evaluateTransactionIntent(input: TransactionIntentInput) {
  const exposureBps = input.portfolioValueUsd <= 0 ? 10_000 : Math.round((input.valueUsd / input.portfolioValueUsd) * 10_000);
  const reasons: string[] = [];
  let score = 0;
  if (!input.destinationVerified) { score += 30; reasons.push("destination is not verified"); }
  if (!input.contractVerified && input.kind !== "transfer") { score += 25; reasons.push("contract bytecode/source is not verified"); }
  if (!input.simulationSucceeded) { score += 35; reasons.push("transaction simulation did not succeed"); }
  if ((input.slippageBps ?? 0) > 300) { score += 15; reasons.push("slippage exceeds 3 percent"); }
  if (exposureBps > 1_000) { score += 20; reasons.push("action exceeds 10 percent of portfolio value"); }
  if (input.kind === "approve" && (input.allowanceUsd ?? 0) > input.valueUsd * 2) { score += 20; reasons.push("allowance materially exceeds intended spend"); }
  if ((input.protocolRiskScore ?? 0) >= 70) { score += 20; reasons.push("protocol risk score is elevated"); }
  if (input.kind === "bridge" && (input.bridgeFinalitySeconds ?? 0) > 1_800) { score += 10; reasons.push("bridge finality window is extended"); }
  score = Math.round(clamp(score));

  return {
    score,
    tier: score >= 75 ? "deny" : score >= 45 ? "high-review" : score >= 20 ? "review" : "low-risk",
    exposureBps,
    reasons,
    policy: {
      approvedForAutonomousExecution: score < 20 && input.simulationSucceeded && input.destinationVerified,
      requireHumanSignature: score >= 20 || input.kind === "approve" || input.kind === "bridge",
      requireMultisig: score >= 60 || exposureBps > 2_500,
      maximumSlippageBps: Math.min(input.slippageBps ?? 0, 300),
      receiptRequired: true,
      anchorOnIcp: score >= 20 || input.valueUsd >= 1_000,
    },
  };
}

export async function readWeb3WalletSnapshot(address: string, tokenAddresses: string[] = []) {
  if (!isAddress(address)) throw Object.assign(new Error("A valid EVM wallet address is required"), { status: 400 });
  const rpcUrl = process.env["MONAD_RPC_URL"] ?? "https://testnet-rpc.monad.xyz";
  const expectedChainId = BigInt(process.env["MONAD_CHAIN_ID"] ?? "10143");
  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== expectedChainId) throw Object.assign(new Error("Configured RPC chain does not match MONAD_CHAIN_ID"), { status: 502 });
  const wallet = getAddress(address);
  const [nativeBalance, blockNumber] = await Promise.all([provider.getBalance(wallet), provider.getBlockNumber()]);
  const tokens = await Promise.all(tokenAddresses.slice(0, 25).map(async (tokenAddress) => {
    if (!isAddress(tokenAddress)) return { address: tokenAddress, ok: false, error: "invalid-token-address" };
    try {
      const token = new Contract(getAddress(tokenAddress), ERC20_ABI, provider);
      const [balance, decimals, symbol] = await Promise.all([token.balanceOf(wallet), token.decimals(), token.symbol()]);
      return { address: getAddress(tokenAddress), ok: true, symbol, decimals: Number(decimals), balanceRaw: balance.toString(), balance: formatUnits(balance, decimals) };
    } catch (error) {
      return { address: tokenAddress, ok: false, error: error instanceof Error ? error.message : "token-read-failed" };
    }
  }));
  return {
    chain: "monad",
    chainId: network.chainId.toString(),
    wallet,
    blockNumber,
    native: { symbol: "MON", balanceWei: nativeBalance.toString(), balance: formatEther(nativeBalance) },
    tokens,
    observedAt: new Date().toISOString(),
    readOnly: true,
  };
}
