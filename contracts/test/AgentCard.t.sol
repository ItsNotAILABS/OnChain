// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AgentCard} from "../src/AgentCard.sol";

contract AgentCardActor {
    function mint(
        AgentCard target,
        uint64 version,
        bytes32 identityCommitment,
        bytes32 doctrineCommitment,
        bytes32 capabilityCommitment,
        bytes32 runtimeCommitment,
        string calldata metadataURI
    ) external returns (uint256) {
        return target.mintCard(
            version,
            identityCommitment,
            doctrineCommitment,
            capabilityCommitment,
            runtimeCommitment,
            metadataURI
        );
    }

    function transfer(AgentCard target, address to, uint256 tokenId) external {
        target.transferFrom(address(this), to, tokenId);
    }
}

contract AgentCardTest {
    AgentCard private card;
    AgentCardActor private agent;

    function setUp() public {
        card = new AgentCard();
        agent = new AgentCardActor();
    }

    function _mint(uint64 version, string memory uri) internal returns (uint256) {
        return agent.mint(
            card,
            version,
            keccak256(abi.encode("identity", version)),
            keccak256(abi.encode("doctrine", version)),
            keccak256(abi.encode("capability", version)),
            keccak256(abi.encode("runtime", version)),
            uri
        );
    }

    function testMintCreatesVersionedLockedCard() public {
        setUp();
        uint256 tokenId = _mint(1, "ipfs://agent-card-v1");
        require(tokenId == 1, "unexpected token id");
        require(card.ownerOf(tokenId) == address(agent), "wrong owner");
        require(card.latestVersion(address(agent)) == 1, "wrong latest version");
        require(card.latestCardOf(address(agent)) == tokenId, "wrong latest card");
        require(card.cardOfVersion(address(agent), 1) == tokenId, "version index missing");
        require(card.locked(tokenId), "card must be locked");
    }

    function testUpgradePreservesPriorCheckpoint() public {
        setUp();
        uint256 first = _mint(1, "ar://agent-card-v1");
        uint256 second = _mint(2, "https://example.com/agent-card-v2.json");
        require(first == 1 && second == 2, "unexpected ids");
        require(card.cardOfVersion(address(agent), 1) == first, "v1 overwritten");
        require(card.cardOfVersion(address(agent), 2) == second, "v2 missing");
        require(card.latestVersion(address(agent)) == 2, "latest version incorrect");
    }

    function testRejectsDuplicateOrDecreasingVersion() public {
        setUp();
        _mint(2, "ipfs://agent-card-v2");
        bool duplicateRejected;
        try agent.mint(
            card,
            2,
            keccak256("identity"),
            keccak256("doctrine"),
            keccak256("capability"),
            keccak256("runtime"),
            "ipfs://duplicate"
        ) returns (uint256) {
            duplicateRejected = false;
        } catch {
            duplicateRejected = true;
        }
        require(duplicateRejected, "duplicate version accepted");
    }

    function testRejectsTransfer() public {
        setUp();
        uint256 tokenId = _mint(1, "ipfs://agent-card-v1");
        bool rejected;
        try agent.transfer(card, address(0xBEEF), tokenId) {
            rejected = false;
        } catch {
            rejected = true;
        }
        require(rejected, "soulbound transfer accepted");
    }

    function testRejectsMutableOrUnsupportedMetadataLocation() public {
        setUp();
        bool rejected;
        try agent.mint(
            card,
            1,
            keccak256("identity"),
            keccak256("doctrine"),
            keccak256("capability"),
            keccak256("runtime"),
            "http://insecure.example/card.json"
        ) returns (uint256) {
            rejected = false;
        } catch {
            rejected = true;
        }
        require(rejected, "unsupported metadata URI accepted");
    }
}
