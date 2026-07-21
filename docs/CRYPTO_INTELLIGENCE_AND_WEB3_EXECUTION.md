# Crypto Intelligence and Web3 Execution Architecture

## Purpose

This layer connects OnChain agents to crypto portfolios and Web3 execution without giving an inference service unrestricted custody or signing authority.

The architecture separates four planes:

1. **Observation** — balances, prices, liquidity, volatility, allowances, protocol state, and transaction receipts.
2. **Intelligence** — deterministic portfolio analysis, concentration detection, reserve policy, liquidity risk, and proposed actions.
3. **Policy** — on-chain transaction ceilings, daily limits, human-approval requirements, and operator authorization.
4. **Execution** — wallet or smart-account simulation, signature, broadcast, confirmation, receipt decoding, and ICP evidence anchoring.

## API

`POST /api/agent/crypto-intelligence`

The request supplies already-observed portfolio positions and policy thresholds. The endpoint returns exposure weights, stable reserve, concentration, risk tier, policy flags, and proposed actions.

The endpoint does not create, sign, or broadcast transactions. Every proposed action explicitly requires human approval.

## AgentTreasuryPolicy

`contracts/src/AgentTreasuryPolicy.sol` is a non-custodial policy registry. It records:

- maximum value per transaction;
- maximum daily spend;
- minimum stable reserve basis points;
- maximum single-asset basis points;
- whether human approval is mandatory;
- authorized operators;
- recorded daily spend and action hashes.

It never holds funds and never performs swaps. Wallet modules, account-abstraction validators, relayers, and execution agents should consult or enforce it before sending a transaction.

## Intended execution sequence

1. Read wallet balances and protocol positions from configured RPC/indexer sources.
2. Normalize token decimals and verify contract addresses against an allowlist.
3. Fetch independent price and liquidity observations.
4. Produce the crypto-intelligence report.
5. Convert approved recommendations into unsigned transaction intents.
6. Simulate each intent against the destination chain.
7. Validate the intent against `AgentTreasuryPolicy`.
8. Require wallet or smart-account approval.
9. Broadcast only after simulation and policy approval.
10. Decode the final receipt and preserve unknown logs.
11. Anchor the action hash and receipt evidence to the ICP Agent Passport.

## Next execution adapters

The repository should add adapters rather than embedding protocol-specific logic in the intelligence engine:

- ERC-20 balance and allowance reader;
- native-token balance reader;
- DEX quote adapter;
- transaction simulation adapter;
- smart-account intent adapter;
- bridge risk adapter;
- lending-position adapter;
- staking-position adapter;
- oracle quorum adapter;
- MEV and slippage guard;
- token and protocol allowlists;
- malicious-approval and unlimited-allowance detector.

## Safety boundary

No private key, seed phrase, raw signer, session key, or unrestricted RPC signer belongs in the API server, frontend bundle, metadata, logs, or repository.

An intelligence score is not permission to trade. Transaction execution requires explicit policy validation, fresh simulation, verified contract addresses, bounded slippage, and wallet-level authorization.
