import Array "mo:base/Array";
import Blob "mo:base/Blob";
import Buffer "mo:base/Buffer";
import HashMap "mo:base/HashMap";
import Int "mo:base/Int";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Time "mo:base/Time";

actor AgentPassport {
  public type ChainRef = { namespace : Text; reference : Text };
  public type CommitmentSet = { identity : Blob; doctrine : Blob; capability : Blob; runtime : Blob };
  public type Passport = {
    id : Nat;
    owner : Principal;
    agentPrincipal : Principal;
    version : Nat;
    issuedAt : Nat64;
    commitments : CommitmentSet;
    metadataUri : Text;
    monadCard : ?ChainRef;
    monadCredential : ?ChainRef;
    active : Bool;
  };
  public type PassportInput = {
    agentPrincipal : Principal;
    version : Nat;
    commitments : CommitmentSet;
    metadataUri : Text;
    monadCard : ?ChainRef;
    monadCredential : ?ChainRef;
  };
  public type EvidenceAnchor = {
    id : Nat;
    passportId : Nat;
    submittedBy : Principal;
    sourceChain : ChainRef;
    eventType : Text;
    transactionHash : Text;
    blockNumber : ?Nat;
    evidenceHash : Blob;
    metadataUri : ?Text;
    observedAt : Nat64;
  };

  stable var nextPassportId : Nat = 1;
  stable var nextEvidenceId : Nat = 1;
  stable var stablePassports : [(Nat, Passport)] = [];
  stable var stableEvidence : [(Nat, EvidenceAnchor)] = [];

  var passports = HashMap.HashMap<Nat, Passport>(16, Nat.equal, Nat.hash);
  var evidence = HashMap.HashMap<Nat, EvidenceAnchor>(16, Nat.equal, Nat.hash);

  func now() : Nat64 { Nat64.fromNat(Int.abs(Time.now())) };
  func validUri(uri : Text) : Bool {
    Text.startsWith(uri, #text("ipfs://")) or Text.startsWith(uri, #text("ar://")) or Text.startsWith(uri, #text("https://"));
  };

  func latestFor(agent : Principal) : ?Passport {
    var latest : ?Passport = null;
    for ((_, passport) in passports.entries()) {
      if (passport.agentPrincipal == agent) {
        switch (latest) {
          case null { latest := ?passport };
          case (?current) { if (passport.version > current.version) latest := ?passport };
        };
      };
    };
    latest;
  };

  public shared ({ caller }) func mintPassport(input : PassportInput) : async Result.Result<Passport, Text> {
    if (Principal.isAnonymous(caller)) return #err("anonymous principals cannot mint passports");
    if (input.version == 0) return #err("version must be positive");
    if (not validUri(input.metadataUri)) return #err("metadata URI must use ipfs://, ar://, or https://");
    switch (latestFor(input.agentPrincipal)) {
      case (?current) {
        if (current.owner != caller) return #err("only the existing passport owner can publish a new version");
        if (input.version <= current.version) return #err("version must strictly increase");
      };
      case null {};
    };
    let id = nextPassportId;
    nextPassportId += 1;
    let passport : Passport = {
      id;
      owner = caller;
      agentPrincipal = input.agentPrincipal;
      version = input.version;
      issuedAt = now();
      commitments = input.commitments;
      metadataUri = input.metadataUri;
      monadCard = input.monadCard;
      monadCredential = input.monadCredential;
      active = true;
    };
    passports.put(id, passport);
    #ok(passport);
  };

  public shared ({ caller }) func deactivatePassport(id : Nat) : async Result.Result<Passport, Text> {
    switch (passports.get(id)) {
      case null { #err("passport not found") };
      case (?passport) {
        if (passport.owner != caller) return #err("only the passport owner can deactivate it");
        let updated = { passport with active = false };
        passports.put(id, updated);
        #ok(updated);
      };
    };
  };

  public shared ({ caller }) func anchorEvidence(
    passportId : Nat,
    sourceChain : ChainRef,
    eventType : Text,
    transactionHash : Text,
    blockNumber : ?Nat,
    evidenceHash : Blob,
    metadataUri : ?Text,
  ) : async Result.Result<EvidenceAnchor, Text> {
    if (Principal.isAnonymous(caller)) return #err("anonymous principals cannot anchor evidence");
    let passport = switch (passports.get(passportId)) {
      case null { return #err("passport not found") };
      case (?value) { value };
    };
    if (passport.owner != caller and passport.agentPrincipal != caller) return #err("caller is not authorized for this passport");
    if (Text.size(transactionHash) == 0 or Text.size(eventType) == 0) return #err("event type and transaction hash are required");
    switch (metadataUri) {
      case (?uri) { if (not validUri(uri)) return #err("invalid evidence metadata URI") };
      case null {};
    };
    let id = nextEvidenceId;
    nextEvidenceId += 1;
    let anchor : EvidenceAnchor = {
      id;
      passportId;
      submittedBy = caller;
      sourceChain;
      eventType;
      transactionHash;
      blockNumber;
      evidenceHash;
      metadataUri;
      observedAt = now();
    };
    evidence.put(id, anchor);
    #ok(anchor);
  };

  public query func getPassport(id : Nat) : async ?Passport { passports.get(id) };
  public query func getActivePassport(agent : Principal) : async ?Passport {
    switch (latestFor(agent)) { case (?passport) { if (passport.active) ?passport else null }; case null { null } };
  };
  public query func listPassportHistory(agent : Principal) : async [Passport] {
    let out = Buffer.Buffer<Passport>(8);
    for ((_, passport) in passports.entries()) { if (passport.agentPrincipal == agent) out.add(passport) };
    Array.sort<Passport>(Buffer.toArray(out), func(a, b) {
      if (a.version < b.version) #less else if (a.version > b.version) #greater else #equal;
    });
  };
  public query func listEvidence(passportId : Nat) : async [EvidenceAnchor] {
    let out = Buffer.Buffer<EvidenceAnchor>(8);
    for ((_, anchor) in evidence.entries()) { if (anchor.passportId == passportId) out.add(anchor) };
    Buffer.toArray(out);
  };
  public query func verifyCommitments(id : Nat, expected : CommitmentSet) : async Bool {
    switch (passports.get(id)) {
      case null { false };
      case (?passport) {
        passport.commitments.identity == expected.identity and passport.commitments.doctrine == expected.doctrine and
        passport.commitments.capability == expected.capability and passport.commitments.runtime == expected.runtime;
      };
    };
  };
  public query func stats() : async { passports : Nat; evidenceAnchors : Nat; agents : Nat } {
    let agents = HashMap.HashMap<Principal, Bool>(16, Principal.equal, Principal.hash);
    for ((_, passport) in passports.entries()) { agents.put(passport.agentPrincipal, true) };
    { passports = passports.size(); evidenceAnchors = evidence.size(); agents = agents.size() };
  };

  system func preupgrade() {
    stablePassports := Iter.toArray(passports.entries());
    stableEvidence := Iter.toArray(evidence.entries());
  };
  system func postupgrade() {
    passports := HashMap.fromIter<Nat, Passport>(stablePassports.vals(), 16, Nat.equal, Nat.hash);
    evidence := HashMap.fromIter<Nat, EvidenceAnchor>(stableEvidence.vals(), 16, Nat.equal, Nat.hash);
    stablePassports := [];
    stableEvidence := [];
  };
}
