export type AssetPosition = {
  chainId: string;
  symbol: string;
  tokenAddress?: string;
  balance: string;
  priceUsd: number;
  volatilityBps?: number;
  liquidityUsd?: number;
};

export type CryptoIntelligenceInput = {
  positions: AssetPosition[];
  stableSymbols?: string[];
  maxSingleAssetBps: number;
  minimumStableReserveBps: number;
  minimumLiquidityUsd: number;
};

export type CryptoIntelligenceResult = {
  totalValueUsd: number;
  stableReserveBps: number;
  concentrationBps: number;
  riskScore: number;
  riskTier: "low" | "moderate" | "high" | "critical";
  policyCompliant: boolean;
  exposures: Array<{
    chainId: string;
    symbol: string;
    valueUsd: number;
    portfolioBps: number;
    volatilityBps: number | null;
    liquidityUsd: number | null;
  }>;
  flags: string[];
  recommendations: string[];
  proposedActions: Array<{
    kind: "hold" | "reduce" | "increase-reserve" | "review-liquidity";
    symbol?: string;
    chainId?: string;
    rationale: string;
    requiresHumanApproval: true;
  }>;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function analyzeCryptoPortfolio(input: CryptoIntelligenceInput): CryptoIntelligenceResult {
  const stableSet = new Set((input.stableSymbols ?? ["USDC", "USDT", "DAI"]).map((s) => s.toUpperCase()));
  const positions = input.positions.map((position) => {
    const balance = Number(position.balance);
    const valueUsd = Number.isFinite(balance) && balance >= 0 && position.priceUsd >= 0
      ? balance * position.priceUsd
      : 0;
    return { ...position, valueUsd };
  });

  const totalValueUsd = positions.reduce((sum, position) => sum + position.valueUsd, 0);
  const exposures = positions.map((position) => ({
    chainId: position.chainId,
    symbol: position.symbol,
    valueUsd: Number(position.valueUsd.toFixed(2)),
    portfolioBps: totalValueUsd === 0 ? 0 : Math.round((position.valueUsd / totalValueUsd) * 10_000),
    volatilityBps: position.volatilityBps ?? null,
    liquidityUsd: position.liquidityUsd ?? null,
  })).sort((a, b) => b.valueUsd - a.valueUsd);

  const stableValue = positions
    .filter((position) => stableSet.has(position.symbol.toUpperCase()))
    .reduce((sum, position) => sum + position.valueUsd, 0);
  const stableReserveBps = totalValueUsd === 0 ? 0 : Math.round((stableValue / totalValueUsd) * 10_000);
  const concentrationBps = exposures[0]?.portfolioBps ?? 0;

  const flags: string[] = [];
  const recommendations: string[] = [];
  const proposedActions: CryptoIntelligenceResult["proposedActions"] = [];

  if (totalValueUsd === 0) flags.push("empty-or-unpriced-portfolio");
  if (concentrationBps > input.maxSingleAssetBps) {
    flags.push("single-asset-concentration-exceeded");
    const largest = exposures[0];
    if (largest) proposedActions.push({
      kind: "reduce",
      symbol: largest.symbol,
      chainId: largest.chainId,
      rationale: `Largest exposure is ${largest.portfolioBps} bps, above the configured ${input.maxSingleAssetBps} bps ceiling.`,
      requiresHumanApproval: true,
    });
  }
  if (stableReserveBps < input.minimumStableReserveBps) {
    flags.push("stable-reserve-below-policy");
    proposedActions.push({
      kind: "increase-reserve",
      rationale: `Stable reserve is ${stableReserveBps} bps, below the configured ${input.minimumStableReserveBps} bps floor.`,
      requiresHumanApproval: true,
    });
  }

  for (const exposure of exposures) {
    if (exposure.liquidityUsd !== null && exposure.liquidityUsd < input.minimumLiquidityUsd) {
      flags.push(`low-liquidity:${exposure.chainId}:${exposure.symbol}`);
      proposedActions.push({
        kind: "review-liquidity",
        symbol: exposure.symbol,
        chainId: exposure.chainId,
        rationale: `Reported liquidity is below the configured $${input.minimumLiquidityUsd} floor.`,
        requiresHumanApproval: true,
      });
    }
    if ((exposure.volatilityBps ?? 0) > 1_500) flags.push(`high-volatility:${exposure.chainId}:${exposure.symbol}`);
  }

  const weightedVolatility = totalValueUsd === 0 ? 0 : positions.reduce(
    (sum, position) => sum + ((position.volatilityBps ?? 0) * position.valueUsd) / totalValueUsd,
    0,
  );
  const riskScore = Math.round(clamp(
    concentrationBps / 100 +
      Math.max(0, input.minimumStableReserveBps - stableReserveBps) / 100 +
      weightedVolatility / 100 +
      flags.filter((flag) => flag.startsWith("low-liquidity:")).length * 10,
    0,
    100,
  ));
  const riskTier = riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : riskScore >= 30 ? "moderate" : "low";

  if (flags.length === 0) {
    recommendations.push("Portfolio satisfies the supplied reserve, concentration, and liquidity policies.");
    proposedActions.push({ kind: "hold", rationale: "No policy breach was detected from the supplied inputs.", requiresHumanApproval: true });
  } else {
    recommendations.push("Do not execute autonomous swaps from this analysis alone.");
    recommendations.push("Revalidate prices, balances, allowances, slippage, bridge risk, and contract addresses before signing any transaction.");
  }

  return {
    totalValueUsd: Number(totalValueUsd.toFixed(2)),
    stableReserveBps,
    concentrationBps,
    riskScore,
    riskTier,
    policyCompliant: flags.length === 0,
    exposures,
    flags,
    recommendations,
    proposedActions,
  };
}
