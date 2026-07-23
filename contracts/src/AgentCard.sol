// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IAgentCardERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IAgentCardERC721 is IAgentCardERC165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IAgentCardMetadata is IAgentCardERC721 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IAgentCardLocked is IAgentCardERC165 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
    function locked(uint256 tokenId) external view returns (bool);
}

/// @title AgentCard
/// @notice Self-issued, versioned, non-transferable agent identity checkpoints.
/// @dev Every material upgrade mints a new immutable card. Previous versions remain queryable.
contract AgentCard is IAgentCardMetadata, IAgentCardLocked {
    struct Card {
        address agent;
        uint64 version;
        uint64 issuedAt;
        bytes32 identityCommitment;
        bytes32 doctrineCommitment;
        bytes32 capabilityCommitment;
        bytes32 runtimeCommitment;
        string metadataURI;
    }

    error ZeroAddress();
    error InvalidVersion();
    error VersionNotIncreasing(uint64 currentVersion, uint64 requestedVersion);
    error InvalidMetadataURI();
    error EmptyCommitment();
    error NonexistentToken(uint256 tokenId);
    error Soulbound();

    event AgentCardMinted(
        uint256 indexed tokenId,
        address indexed agent,
        uint64 indexed version,
        bytes32 identityCommitment,
        bytes32 doctrineCommitment,
        bytes32 capabilityCommitment,
        bytes32 runtimeCommitment,
        string metadataURI
    );

    string private constant _NAME = "OnChain Agent Cards";
    string private constant _SYMBOL = "AGENTCARD";

    uint256 public totalSupply;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => Card) private _cards;
    mapping(address => uint64) public latestVersion;
    mapping(address => uint256) public latestCardOf;
    mapping(address => mapping(uint64 => uint256)) public cardOfVersion;

    function name() external pure returns (string memory) { return _NAME; }
    function symbol() external pure returns (string memory) { return _SYMBOL; }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IAgentCardERC165).interfaceId
            || interfaceId == type(IAgentCardERC721).interfaceId
            || interfaceId == type(IAgentCardMetadata).interfaceId
            || interfaceId == type(IAgentCardLocked).interfaceId;
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = _owners[tokenId];
        if (owner == address(0)) revert NonexistentToken(tokenId);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return _cards[tokenId].metadataURI;
    }

    function card(uint256 tokenId) external view returns (Card memory) {
        ownerOf(tokenId);
        return _cards[tokenId];
    }

    function locked(uint256 tokenId) external view returns (bool) {
        ownerOf(tokenId);
        return true;
    }

    function mintCard(
        uint64 version,
        bytes32 identityCommitment,
        bytes32 doctrineCommitment,
        bytes32 capabilityCommitment,
        bytes32 runtimeCommitment,
        string calldata metadataURI
    ) external returns (uint256 tokenId) {
        if (version == 0) revert InvalidVersion();
        uint64 current = latestVersion[msg.sender];
        if (version <= current) revert VersionNotIncreasing(current, version);
        if (
            identityCommitment == bytes32(0)
                || doctrineCommitment == bytes32(0)
                || capabilityCommitment == bytes32(0)
                || runtimeCommitment == bytes32(0)
        ) revert EmptyCommitment();
        if (!_validMetadataURI(metadataURI)) revert InvalidMetadataURI();

        tokenId = ++totalSupply;
        _owners[tokenId] = msg.sender;
        _balances[msg.sender] += 1;
        _cards[tokenId] = Card({
            agent: msg.sender,
            version: version,
            issuedAt: uint64(block.timestamp),
            identityCommitment: identityCommitment,
            doctrineCommitment: doctrineCommitment,
            capabilityCommitment: capabilityCommitment,
            runtimeCommitment: runtimeCommitment,
            metadataURI: metadataURI
        });
        latestVersion[msg.sender] = version;
        latestCardOf[msg.sender] = tokenId;
        cardOfVersion[msg.sender][version] = tokenId;

        emit Transfer(address(0), msg.sender, tokenId);
        emit Locked(tokenId);
        emit AgentCardMinted(
            tokenId,
            msg.sender,
            version,
            identityCommitment,
            doctrineCommitment,
            capabilityCommitment,
            runtimeCommitment,
            metadataURI
        );
    }

    function _validMetadataURI(string calldata uri) internal pure returns (bool) {
        bytes calldata value = bytes(uri);
        return _startsWith(value, "ipfs://") || _startsWith(value, "ar://") || _startsWith(value, "https://");
    }

    function _startsWith(bytes calldata value, string memory prefix) internal pure returns (bool) {
        bytes memory expected = bytes(prefix);
        if (value.length <= expected.length) return false;
        for (uint256 i; i < expected.length; ++i) {
            if (value[i] != expected[i]) return false;
        }
        return true;
    }

    function approve(address, uint256) external pure { revert Soulbound(); }
    function setApprovalForAll(address, bool) external pure { revert Soulbound(); }
    function getApproved(uint256 tokenId) external view returns (address) { ownerOf(tokenId); return address(0); }
    function isApprovedForAll(address, address) external pure returns (bool) { return false; }
    function transferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256, bytes calldata) external pure { revert Soulbound(); }
}
