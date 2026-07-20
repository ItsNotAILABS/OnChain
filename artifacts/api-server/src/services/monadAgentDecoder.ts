import { Interface, JsonRpcProvider, formatEther, isHexString } from "ethers";

const EVENT_FRAGMENTS = [
  "event ServicePublished(uint256 indexed serviceId,address indexed provider,string metadataURI,uint256 price)",
  "event ServiceUpdated(uint256 indexed serviceId,address indexed provider,string metadataURI,uint256 price,bool active)",
  "event JobFunded(uint256 indexed jobId,uint256 indexed serviceId,address indexed client,address provider,uint256 amount)",
  "event MultiAgentJobFunded(uint256 indexed jobId,address indexed client,address[] providers,uint256 amount)",
  "event JobAccepted(uint256 indexed jobId,address indexed provider)",
  "event ResultSubmitted(uint256 indexed jobId,address indexed provider,bytes32 resultHash,string resultURI)",
  "event ReceiptSealed(uint256 indexed jobId,bytes32 indexed receiptHash,address indexed sealer,string receiptURI)",
  "event DisputeOpened(uint256 indexed jobId,address indexed opener,bytes32 reasonHash,string evidenceURI)",
  "event DisputeResolved(uint256 indexed jobId,address indexed resolver,uint8 outcome,uint256 clientAmount,uint256 providerAmount)",
  "event JobSettled(uint256 indexed jobId,address indexed client,address indexed provider,uint256 providerAmount,uint256 protocolFee)",
  "event ProtocolFeePaid(uint256 indexed jobId,address indexed payer,address indexed treasury,uint256 amount)",
  "event JobRefunded(uint256 indexed jobId,address indexed client,uint256 amount)",
  "event CredentialMinted(uint256 indexed tokenId,uint8 indexed kind,address indexed subject,uint256 jobId,address issuer,bytes32 evidenceHash,string metadataURI)",
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  "event Locked(uint256 tokenId)",
  "event Unlocked(uint256 tokenId)",
] as const;

const decoder = new Interface(EVENT_FRAGMENTS);

export type DecodedMonadLog = {
  index: number;
  address: string;
  known: boolean;
  event?: string;
  signature?: string;
  args?: Record<string, unknown>;
  topics: readonly string[];
  data: string;
};

function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!/^\d+$/.test(key)) out[key] = serialize(item);
    }
    return out;
  }
  return value;
}

export function decodeMonadLogs(logs: readonly {
  index?: number;
  logIndex?: number;
  address: string;
  topics: readonly string[];
  data: string;
}[]): DecodedMonadLog[] {
  return logs.map((log, position) => {
    const index = Number(log.index ?? log.logIndex ?? position);
    try {
      const parsed = decoder.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) throw new Error("unrecognized log");
      const args: Record<string, unknown> = {};
      parsed.fragment.inputs.forEach((input, inputIndex) => {
        args[input.name || `arg${inputIndex}`] = serialize(parsed.args[inputIndex]);
      });
      return {
        index,
        address: log.address,
        known: true,
        event: parsed.name,
        signature: parsed.signature,
        args,
        topics: log.topics,
        data: log.data,
      };
    } catch {
      return {
        index,
        address: log.address,
        known: false,
        topics: log.topics,
        data: log.data,
      };
    }
  });
}

export async function decodeMonadTransaction(transactionHash: string) {
  if (!isHexString(transactionHash, 32)) {
    throw Object.assign(new Error("A valid 32-byte Monad transaction hash is required"), { status: 400 });
  }

  const rpcUrl = process.env["MONAD_RPC_URL"] ?? "https://testnet-rpc.monad.xyz";
  const expectedChainId = BigInt(process.env["MONAD_CHAIN_ID"] ?? "10143");
  const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: false });
  const [network, transaction, receipt] = await Promise.all([
    provider.getNetwork(),
    provider.getTransaction(transactionHash),
    provider.getTransactionReceipt(transactionHash),
  ]);

  if (!transaction || !receipt) {
    throw Object.assign(new Error("Transaction or receipt was not found on the configured Monad RPC"), { status: 404 });
  }
  if (network.chainId !== expectedChainId) {
    throw Object.assign(
      new Error(`Configured RPC chain ${network.chainId.toString()} does not match expected Monad chain ${expectedChainId.toString()}`),
      { status: 502 },
    );
  }

  const events = decodeMonadLogs(receipt.logs);
  const knownEvents = events.filter((event) => event.known);
  const unknownEvents = events.filter((event) => !event.known);

  return {
    transactionHash,
    chainId: network.chainId.toString(),
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    status: receipt.status === 1 ? "success" : "reverted",
    from: transaction.from,
    to: transaction.to,
    nonce: transaction.nonce,
    valueWei: transaction.value.toString(),
    valueMon: formatEther(transaction.value),
    gasLimit: transaction.gasLimit.toString(),
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.gasPrice?.toString() ?? null,
    contractAddress: receipt.contractAddress,
    confirmations: await receipt.confirmations(),
    eventSummary: knownEvents.reduce<Record<string, number>>((summary, event) => {
      const key = event.event ?? "Unknown";
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    }, {}),
    events,
    knownEventCount: knownEvents.length,
    unknownEventCount: unknownEvents.length,
    decodedAt: new Date().toISOString(),
  };
}
