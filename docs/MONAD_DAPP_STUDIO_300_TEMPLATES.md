# Monad dApp Studio — 300 Preloaded Templates

## Product objective

Turn a natural-language product idea into a governed, editable dApp specification and assembly manifest using drag-and-drop components pre-wired for Monad. The studio is a builder, not an unrestricted deployment bot: contract deployment, wallet signing, treasury movement, and production release remain separate governed stages.

## Builder surfaces

1. **Prompt-to-Spec** — converts intent into product requirements, actors, roles, pages, contracts, data flows, policies, test plan, and deployment manifest.
2. **Canvas** — drag-and-drop component graph with pages, contracts, data sources, MCP tools, policies, and receipt flows.
3. **Component Library** — wallet connect, network switching, balances, swaps, bridges, NFT minting/marketplaces, DAOs, treasuries, staking, lending, perpetuals, prediction markets, RWA, payments, subscriptions, escrow, crowdfunding, social, gaming, identity, credentials, agent marketplace, MCP console, analytics, receipts, oracle, IoT, science lab, and admin.
4. **Template Vault** — 300 preloaded templates generated from 15 domains × 20 sophisticated operating variants.
5. **Contract Workbench** — contract requirements, ABI bindings, roles, upgrade posture, deployment plan, and verification status.
6. **Simulation Gate** — transaction simulation and policy checks before any signing step.
7. **Deployment Console** — environment readiness, contract addresses, verification receipts, frontend release, and rollback plan.
8. **Evidence Explorer** — specification hash, template hash, generated-code hash, test receipts, deployment receipts, and ICP anchors.

## Preloaded catalog

The catalog contains exactly 300 deterministic templates:

- 15 domains: DeFi, Lending, Staking, Perpetuals, NFT, DAO, Payments, Crowdfunding, Gaming, Social, RWA, Prediction, Agent Economy, Scientific Lab, Infrastructure.
- 20 variants: Command Center, Institutional Console, Autonomous Studio, Research Terminal, Creator Suite, Treasury Hub, Marketplace, Protocol Launchpad, Governance OS, Mobile Control, Analytics Grid, Compliance Desk, Agent Workspace, Operator Station, Enterprise Portal, Simulation Lab, Settlement Network, Liquidity Engine, Community Stack, Sovereign Runtime.

Each template includes:

- deterministic ID and manifest hash
- sophistication level
- component graph
- Monad readiness
- optional Ethereum target
- contract requirement
- risk profile
- pages and default component placement
- environment-variable placeholders
- security controls
- receipt plan

## API

### List templates

`GET /api/dapp/templates/catalog`

Filters: `category`, `component`, `risk`, `ethereumReady`, `search`.

### Read template

`GET /api/dapp/templates/catalog/:templateId`

### Assemble dApp manifest

`POST /api/dapp/templates/assemble`

```json
{
  "templateId": "defi-command-center",
  "appName": "PARALLAX Markets"
}
```

The response contains the template, page graph, component instances, chain targets, environment bindings, contract plan, security controls, receipt plan, and deterministic assembly hash.

## Code-generation worker contract

A subsequent worker should consume the assembly manifest and materialize:

- React/Next.js frontend
- component registry and drag/drop canvas
- wallet connector configuration
- Monad chain configuration
- typed contract clients
- Solidity contracts and tests where required
- API bindings
- MCP tool bindings
- policy configuration
- simulation scripts
- deployment scripts
- verification scripts
- CI workflow
- operator README

Generated code must never embed private keys. Deployments must be explicit, environment-bound, simulated, tested, approved, and receipt-producing.

## Production gates

A template is **preloaded** when present in the catalog. It is **assembled** when a deterministic manifest exists. It is **materialized** only after source files are generated. It is **verified** only after tests and static analysis pass. It is **deployed** only after chain receipts and addresses exist. The UI must show these states separately.
