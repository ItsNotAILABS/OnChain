// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title AgentCard
/// @notice Versioned, non-transferable agent identity checkpoints.
/// @dev Each mint is a new immutable checkpoint. Prior versions are never overwritten.
contract AgentCard {
    struct Card {
        address agent;
        uint64 version;
        uint64 issuedAt;
        bytes32 identityCommitment;
        bytes32 doctrineCommitment;
        bytes32 capabilityCommitment;
        bytes32 runtimeCommitment;
        string metadataURI