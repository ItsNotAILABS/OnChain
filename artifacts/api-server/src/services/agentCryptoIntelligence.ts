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
  minimumLiquidityUsd: