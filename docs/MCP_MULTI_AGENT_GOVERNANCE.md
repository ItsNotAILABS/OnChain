# MCP Multi-Agent Governance for PARALLAX and OnChain

The MCP Server Bridge is the communication and execution substrate between Sovereign Mind agents, local tools, simulations, IoT systems, wallets, blockchains, and the OnChain evidence layer.

It is not an unrestricted tool proxy. Every request must pass through identity, capability, policy, sandbox, approval, and receipt boundaries.

## Coordination Lifecycle

1. An orchestrator creates an objective and required capability set.
2. Candidate agents are filtered by online state, active Agent Card version, capability declarations, and minimum trust score.
3. The planner selects a bounded team and assigns one capability to one accountable agent per step.
4. The bridge resolves an enabled MCP tool for the capability.
5. Tool risk determines whether the step may run automatically, requires a sandbox, requires approval, or is denied.
6. Dependencies are represented explicitly so execution cannot skip prerequisite observation or simulation.
7. The bridge emits deterministic request, policy, simulation, approval, execution, and result receipts.
8. Ethereum or Monad receipts may be decoded and anchored to the ICP Agent Passport evidence history.

## Risk Tiers

- `observe`: read-only state, telemetry, balances, prices, receipts, files, and device status.
- `simulate`: deterministic or sandboxed previews, quotes, backtests, transaction simulation, and scientific models.
- `prepare`: constructs calldata, user operations, job manifests, proposals, or deployment plans but does not sign or broadcast.
- `execute`: mutates external state such as swaps, jobs, deployments, device commands, or controlled shell operations.
- `critical`: upgrades, ownership transfer, unrestricted shell, unlimited approvals, treasury withdrawal, high leverage, and secret access. Denied by default.

## Multi-Agent Roles

A governed swarm may include:

- `orchestrator`: decomposes objectives and manages dependencies;
- `observer`: gathers market, chain, device, or experiment state;
- `analyst`: evaluates evidence and produces candidate actions;
- `simulator`: validates consequences without mutation;
- `policy-agent`: evaluates doctrine, treasury, risk, and approval requirements;
- `executor`: invokes a previously approved tool through a restricted adapter;
- `verifier`: decodes receipts and compares actual outcomes to the approved intent;
- `archivist`: seals evidence into ReceiptChain and ICP continuity history;
- `drift-detector`: detects repeated failures, policy divergence, or capability misrepresentation.

No agent may silently collapse these roles for high-risk execution.

## Required Bridge Controls

The bridge must enforce:

- authenticated agent and client sessions;
- active Agent Card version and credential lookup;
- server and tool allowlists;
- exact JSON schema validation;
- capability-to-tool mapping;
- risk classification;
- sandbox requirements;
- per-agent, per-tool, per-wallet, and per-device rate limits;
- spend and notional limits;
- nonce and replay protection;
- deadlines and cancellation;
- human or multisig approval for governed actions;
- result-size and context limits;
- secret redaction;
- append-only audit events;
- deterministic hashes for intents and coordination plans;
- decoded blockchain receipts and ICP evidence anchors.

## Web3 Integration

The bridge may expose read, simulation, preparation, and execution adapters for:

- Ethereum RPC and contract reads;
- DEX quotes and simulations;
- lending, staking, perpetual, prediction, RWA, FX, commodity, and index protocols;
- smart-account user operations;
- Agent Treasury Policy checks;
- ParallaxMarketRouter intents;
- Monad agent-market jobs and settlements;
- ReceiptChain evidence;
- ICP Agent Passport continuity.

Private keys must not be stored in MCP tool definitions, browser bundles, public metadata, logs, or Git. Signing belongs to an isolated wallet, smart account, hardware signer, or governed custody boundary.

## IoT and Scientific Lab Integration

Device and experiment commands use the same envelope as financial actions:

- device identity;
- operator identity;
- capability and command namespace;
- input bounds;
- safety classification;
- simulation or calibration receipt;
- approval requirement;
- execution deadline;
- telemetry expectations;
- emergency stop behavior;
- evidence hash.

The Scientific Experiment Lab therefore becomes a closed evidence loop: hypothesis, model, simulation, approved execution, telemetry, comparison, and sealed result.

## API Surface

`POST /api/agent/mcp/coordination-plan` creates a deterministic plan from agents, tools, required capabilities, and policy. It does not invoke tools or modify external state.

A production bridge runtime must later provide authenticated endpoints for registry health, discovery, simulation, approval, invocation, cancellation, and receipt lookup.

## Truth Boundary

Source code and coordination plans do not prove that an MCP server, wallet, device, chain adapter, or sandbox is running. Live status requires reachable authenticated servers, discovered tool schemas, active policy enforcement, verified signer boundaries, execution receipts, and observable outcomes.
