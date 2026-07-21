# PARALLAX Ethereum All-Markets Architecture

PARALLAX is the intelligence, policy, and execution layer for a governed multi-market trading system. Ethereum is the settlement and smart-account root. OnChain provides the public dapp, agent identity, receipts, credentials, analytics, and operator surfaces.

## Product Surfaces

### 1. Market Command

A unified market terminal for:

- spot assets;
- perpetual and options venues through approved adapters;
- lending and borrowing markets;
- staking and liquid-staking positions;
- prediction markets;
- tokenized real-world assets;
- tokenized foreign-exchange instruments;
- commodity and index representations;
- cross-chain liquidity and settlement paths.

The terminal must distinguish observed market data, inferred opportunity, simulated execution, signed execution, broadcast transaction, and finalized receipt.

### 2. PARALLAX Intelligence

The intelligence service compares eligible markets by symbol, venue, market type, price, liquidity, volume, funding, borrow cost, volatility, oracle freshness, and confidence.

Initial opportunity classes:

- price dislocation;
- funding divergence;
- yield spread;
- liquidity routing.

Every opportunity includes evidence, confidence, risk flags, a maximum policy-bounded notional, and whether human approval is required.

### 3. Strategy Registry

Each strategy receives:

- immutable strategy identifier;
- version;
- supported market types;
- risk doctrine;
- execution limits;
- evidence requirements;
- active Agent Card version;
- runtime commitment;
- performance receipt chain.

Strategies are claims and software artifacts, not guaranteed returns.

### 4. Ethereum Execution

`ParallaxMarketRouter` is the governed transaction boundary. It supports only approved operators and market adapters. Every intent binds:

- Ethereum chain ID;
- router address;
- strategy ID;
- market ID;
- account;
- sell and buy assets;
- amount and minimum output;
- deadline;
- replay-protection nonce;
- evidence hash.

The router rejects inactive venues, expired intents, reused nonces, oversized notionals, zero commitments, and outputs below the declared minimum.

### 5. Treasury and Smart Accounts

The existing treasury policy contract supplies:

- maximum value per action;
- daily spend ceilings;
- concentration limits;
- stable-reserve requirements;
- operator permissions;
- human-approval gates.

Production execution should use a smart account with modular permissions, simulation, session-key limits, emergency pause, and multisig recovery. No backend service receives unrestricted custody keys.

### 6. OnChain Showcase

The public dapp should expose:

- Agent Card and credential explorer;
- PARALLAX strategy catalog;
- live market matrix;
- opportunity feed;
- portfolio intelligence;
- risk and treasury dashboard;
- transaction simulator;
- execution intent inspector;
- Ethereum and Monad receipt decoder;
- ICP passport and evidence history;
- service marketplace;
- completed-job credentials;
- deployment and bytecode verification receipts.

## Required Ethereum Adapters

Adapters should be isolated contracts with narrow interfaces and explicit allowlists:

1. ERC-20 spot swap adapter.
2. Concentrated-liquidity DEX adapter.
3. Lending market adapter.
4. Perpetual venue adapter.
5. Staking adapter.
6. Prediction-market adapter.
7. Tokenized-RWA adapter.
8. Bridge and cross-chain messaging observer.

Adapters must not be treated as safe merely because they compile. Each requires protocol-specific tests, fork simulation, allowance controls, reentrancy review, price-impact checks, and emergency deactivation.

## Competitive Doctrine

PARALLAX should not compete as another interface that forwards user orders. Its advantage is the complete intelligence-to-proof chain:

1. observe multiple markets;
2. generate evidence-backed opportunities;
3. apply strategy and treasury doctrine;
4. simulate the exact transaction;
5. require the correct approval tier;
6. execute through an allowlisted adapter;
7. decode and seal the receipt;
8. anchor evidence to ICP;
9. update the agent and strategy performance history;
10. expose the complete lifecycle in the OnChain dapp.

## Release Gate

No Ethereum trading release is live until all of the following exist:

- passing Solidity tests;
- mainnet-fork integration tests;
- adapter-specific invariant and fuzz tests;
- smart-account permission tests;
- oracle-freshness and price-impact checks;
- verified contract bytecode;
- deployment transactions and JSON receipt;
- public addresses installed as application bindings;
- wallet simulation before signing;
- final receipt decoding and evidence anchoring;
- emergency pause and incident procedure.

No profitability, execution-quality, market-access, or competitor-superiority claim should be published without measured evidence.