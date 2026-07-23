export type AgentTrustInput = {
  cardVersion: number;
  identityVerified: boolean;
  commitmentPlanesPresent: number;
  completedJobs: number;
  disputedJobs: number;
  settledVolumeWei: string;
  receiptCoverageBps: number;
  credentialCount: number;
  runtimeReachable: boolean;
  doctrinePublished: boolean;
  latestEvidenceAgeSeconds?: number;
};

export type AgentTrustProfile = {
  score: number;
  tier: "unverified" | "emerging" | "established" | "high-assurance";
  eligible: boolean;
  reasons: string[];
  riskFlags: string[];
  components: {
    identity: number;
    execution: number;
    evidence: number;
    continuity: number;
    governance: number;
  };
  policy: {
    minimumEscrowBps: number;
    requireHumanApproval: boolean;
    maximumRecommendedJobValueWei: string;
  };
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function buildAgentTrustProfile(input: AgentTrustInput): AgentTrustProfile {
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const jobs = Math.max(0, Math.floor(input.completedJobs));
  const disputes = Math.max(0, Math.floor(input.disputedJobs));
  const disputeRate = jobs + disputes === 0 ? 0 : disputes / (jobs + disputes);

  const identity = clamp(
    (input.identityVerified ? 55 : 0) +
    clamp(input.cardVersion, 0, 10) * 2 +
    clamp(input.commitmentPlanesPresent, 0, 4) * 6.25,
  );
  const execution = clamp(Math.log2(jobs + 1) * 18 + Math.max(0, 30 - disputeRate * 100));
  const evidence = clamp(input.receiptCoverageBps / 100 + Math.min(input.credentialCount * 5, 25));
  const continuity = clamp(
    (input.runtimeReachable ? 50 : 0) +
    (input.latestEvidenceAgeSeconds === undefined
      ? 0
      : input.latestEvidenceAgeSeconds < 86_400
        ? 35
        : input.latestEvidenceAgeSeconds < 604_800
          ? 20
          : 5) +
    Math.min(input.cardVersion * 3, 15),
  );
  const governance = clamp((input.doctrinePublished ? 50 : 0) + (input.commitmentPlanesPresent === 4 ? 30 : 0) + (input.identityVerified ? 20 : 0));

  const score = Math.round(
    identity * 0.25 + execution * 0.25 + evidence * 0.2 + continuity * 0.15 + governance * 0.15,
  );

  if (!input.identityVerified) riskFlags.push("identity-not-verified");
  if (input.commitmentPlanesPresent < 4) riskFlags.push("incomplete-agent-card");
  if (!input.runtimeReachable) riskFlags.push("runtime-unreachable");
  if (!input.doctrinePublished) riskFlags.push("governing-doctrine-missing");
  if (input.receiptCoverageBps < 8_000) riskFlags.push("insufficient-receipt-coverage");
  if (disputeRate > 0.1) riskFlags.push("elevated-dispute-rate");
  if (jobs === 0) riskFlags.push("no-completed-job-history");

  if (input.identityVerified) reasons.push("verified identity credential present");
  if (jobs > 0) reasons.push(`${jobs} completed job${jobs === 1 ? "" : "s"} reported`);
  if (input.receiptCoverageBps >= 9_500) reasons.push("near-complete receipt-chain coverage");
  if (input.commitmentPlanesPresent === 4) reasons.push("all four Agent Card commitment planes present");
  if (input.runtimeReachable) reasons.push("declared runtime endpoint is reachable");

  const tier = score >= 85 ? "high-assurance" : score >= 65 ? "established" : score >= 40 ? "emerging" : "unverified";
  const eligible = input.identityVerified && input.commitmentPlanesPresent === 4 && input.doctrinePublished && score >= 55;

  let settledVolume = 0n;
  try { settledVolume = BigInt(input.settledVolumeWei); } catch { riskFlags.push("invalid-settled-volume"); }
  const historyCap = jobs === 0 ? 0n : settledVolume / BigInt(Math.max(1, jobs));
  const multiplier = tier === "high-assurance" ? 5n : tier === "established" ? 2n : tier === "emerging" ? 1n : 0n;
  const maximumRecommendedJobValueWei = (historyCap * multiplier).toString();

  return {
    score,
    tier,
    eligible,
    reasons,
    riskFlags,
    components: { identity: Math.round(identity), execution: Math.round(execution), evidence: Math.round(evidence), continuity: Math.round(continuity), governance: Math.round(governance) },
    policy: {
      minimumEscrowBps: tier === "high-assurance" ? 2_500 : tier === "established" ? 5_000 : 10_000,
      requireHumanApproval: tier !== "high-assurance" || riskFlags.length > 0,
      maximumRecommendedJobValueWei,
    },
  };
}
