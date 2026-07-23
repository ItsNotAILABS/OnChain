export type MarketSnapshot = {
  venue: string;
  chainId: string;
  marketType: "spot" | "perpetual" | "lending" | "staking" | "prediction" | "rwa" | "fx" | "commodity" | "index";
  symbol: string;
  price: number;
  liquidityUsd: number;
  volume24hUsd: number;
  fundingRateBps?: number;
  borrowRateBps?: number;
  volatilityBps?: number;
  oracleAgeSeconds?: number;
  confidenceBps?: number;
};

export type StrategyConstraint = {
  maximumNotionalUsd: number;
  maximumSlippageBps: number;
  minimumLiquidityUsd: number;
  maximumOracleAgeSeconds: number;
  allowedMarketTypes: MarketSnapshot["marketType"][];
  requireHumanApprovalAboveUsd: number;
};

export type ParallaxOpportunity = {
  id: string;
  kind: "price-dislocation" | "funding-divergence" | "yield-spread" | "liquidity-routing";
  symbol: string;
  sourceVenue: string;
  targetVenue: string;
  grossEdgeBps: number;
  confidence: number;
  maximumNotionalUsd: number;
  requiresHumanApproval: boolean;
  evidence: string[];
  risks: string[];
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function analyzeParallaxMarkets(markets: MarketSnapshot[], policy: StrategyConstraint) {
  const eligible = markets.filter((market) =>
    policy.allowedMarketTypes.includes(market.marketType)
    && market.liquidityUsd >= policy.minimumLiquidityUsd
    && (market.oracleAgeSeconds ?? 0) <= policy.maximumOracleAgeSeconds
    && market.price > 0,
  );

  const opportunities: ParallaxOpportunity[] = [];
  const grouped = new Map<string, MarketSnapshot[]>();
  for (const market of eligible) {
    grouped.set(market.symbol, [...(grouped.get(market.symbol) ?? []), market]);
  }

  for (const [symbol, group] of grouped) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const mid = (a.price + b.price) / 2;
        const edgeBps = mid === 0 ? 0 : Math.abs(a.price - b.price) / mid * 10_000;
        const liquidityCap = Math.min(a.liquidityUsd, b.liquidityUsd) * 0.01;
        const maxNotionalUsd = Math.min(policy.maximumNotionalUsd, liquidityCap);
        const source = a.price <= b.price ? a : b;
        const target = a.price <= b.price ? b : a;
        if (edgeBps > policy.maximumSlippageBps * 2 && maxNotionalUsd > 0) {
          const oraclePenalty = Math.max(a.oracleAgeSeconds ?? 0, b.oracleAgeSeconds ?? 0) / Math.max(1, policy.maximumOracleAgeSeconds);
          const confidence = clamp(90 - oraclePenalty * 40 + Math.min(edgeBps / 20, 10));
          opportunities.push({
            id: `${symbol}:${source.venue}:${target.venue}:price`,
            kind: "price-dislocation",
            symbol,
            sourceVenue: source.venue,
            targetVenue: target.venue,
            grossEdgeBps: Math.round(edgeBps),
            confidence: Math.round(confidence),
            maximumNotionalUsd: Math.round(maxNotionalUsd * 100) / 100,
            requiresHumanApproval: maxNotionalUsd >= policy.requireHumanApprovalAboveUsd,
            evidence: [
              `${source.venue} price ${source.price}`,
              `${target.venue} price ${target.price}`,
              `combined executable liquidity ${Math.min(source.liquidityUsd, target.liquidityUsd)}`,
            ],
            risks: ["execution-latency", "price-impact", "venue-specific-settlement"],
          });
        }

        if (a.marketType === "perpetual" && b.marketType === "perpetual") {
          const fundingA = a.fundingRateBps ?? 0;
          const fundingB = b.fundingRateBps ?? 0;
          const fundingEdge = Math.abs(fundingA - fundingB);
          if (fundingEdge >= 5) {
            opportunities.push({
              id: `${symbol}:${a.venue}:${b.venue}:funding`,
              kind: "funding-divergence",
              symbol,
              sourceVenue: fundingA <= fundingB ? a.venue : b.venue,
              targetVenue: fundingA <= fundingB ? b.venue : a.venue,
              grossEdgeBps: fundingEdge,
              confidence: Math.round(clamp(70 + Math.min(fundingEdge, 20))),
              maximumNotionalUsd: Math.round(maxNotionalUsd * 100) / 100,
              requiresHumanApproval: maxNotionalUsd >= policy.requireHumanApprovalAboveUsd,
              evidence: [`funding spread ${fundingEdge} bps`, `${a.venue} ${fundingA} bps`, `${b.venue} ${fundingB} bps`],
              risks: ["basis-risk", "funding-regime-change", "liquidation-risk"],
            });
          }
        }
      }
    }
  }

  opportunities.sort((a, b) => (b.grossEdgeBps * b.confidence) - (a.grossEdgeBps * a.confidence));

  return {
    marketCount: markets.length,
    eligibleMarketCount: eligible.length,
    opportunityCount: opportunities.length,
    opportunities,
    executionBoundary: {
      transactionCreated: false,
      transactionSigned: false,
      transactionBroadcast: false,
      reason: "PARALLAX intelligence produces evidence-backed intents. An approved smart account and router must simulate and authorize execution.",
    },
  };
}