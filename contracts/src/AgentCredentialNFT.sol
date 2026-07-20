// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal job-market view used by credential issuance.
interface IAgentJobProofSource {
    /// @return client The wallet that funded/requested the job.
    /// @return provider The wallet/agent that performed the job.
    /// @return completed True only after the market finalized successful completion.
    function credentialJob(uint256 jobId)
        external
        view
        returns (address client, address provider, bool completed);
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 is IERC165 {
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

interface IERC721Metadata is IERC721 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IERC5192 is IERC165 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
    function locked(uint256 tokenId) external view returns (bool);
}

/// @title AgentCredentialNFT
/// @notice Non-transferable ERC-721 credentials for governed agents and completed jobs.
/// @dev Implements ERC-721 metadata and ERC-5192 locked-token behavior without transfer authority.
contract AgentCredentialNFT is IERC721Metadata, IERC5192 {
    enum CredentialKind {
        Identity,
        CompletedJob
    }

    struct Credential {
        CredentialKind kind;
        address subject;
        uint256 jobId;
        address issuer;
        uint64 issuedAt;
        bytes32 evidenceHash;
    }

    error Unauthorized();
    error ZeroAddress();
    error NonexistentToken(uint256 tokenId);
    error Soulbound();
    error InvalidMetadataURI();
    error DuplicateCredential();
    error JobNotCompleted(uint256 jobId);
    error NotJobParticipant(uint256 jobId);
    error InvalidSubject();
    error Reentrancy();

    event GovernorTransferred(address indexed previousGovernor, address indexed newGovernor);
    event JobProofSourceUpdated(address indexed previousSource, address indexed newSource);
    event CredentialMinted(
        uint256 indexed tokenId,
        CredentialKind indexed kind,
        address indexed subject,
        uint256 jobId,
        address issuer,
        bytes32 evidenceHash,
        string metadataURI
    );

    string private constant _NAME = "OnChain Agent Credentials";
    string private constant _SYMBOL = "AGENTCRED";

    address public governor;
    IAgentJobProofSource public jobProofSource;
    uint256 public totalSupply;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => Credential) private _credentials;
    mapping(address => uint256) public identityCredentialOf;
    mapping(uint256 => mapping(address => uint256)) public jobCredentialOf;

    uint256 private _entered;

    constructor(address governor_, address jobProofSource_) {
        if (governor_ == address(0) || jobProofSource_ == address(0)) revert ZeroAddress();
        governor = governor_;
        jobProofSource = IAgentJobProofSource(jobProofSource_);
    }

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_entered != 0) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    function name() external pure returns (string memory) { return _NAME; }
    function symbol() external pure returns (string memory) { return _SYMBOL; }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC721).interfaceId
            || interfaceId == type(IERC721Metadata).interfaceId
            || interfaceId == type(IERC5192).interfaceId;
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
        return _tokenURIs[tokenId];
    }

    function credential(uint256 tokenId) external view returns (Credential memory) {
        ownerOf(tokenId);
        return _credentials[tokenId];
    }

    function locked(uint256 tokenId) external view returns (bool) {
        ownerOf(tokenId);
        return true;
    }

    function transferGovernor(address newGovernor) external onlyGovernor {
        if (newGovernor == address(0)) revert ZeroAddress();
        emit GovernorTransferred(governor, newGovernor);
        governor = newGovernor;
    }

    function setJobProofSource(address newSource) external onlyGovernor {
        if (newSource == address(0)) revert ZeroAddress();
        emit JobProofSourceUpdated(address(jobProofSource), newSource);
        jobProofSource = IAgentJobProofSource(newSource);
    }

    /// @notice Mints the canonical identity credential for an agent wallet.
    /// @dev Only the governor wallet can establish protocol-level agent identity.
    function mintIdentityCredential(
        address agent,
        string calldata metadataURI,
        bytes32 evidenceHash
    ) external onlyGovernor nonReentrant returns (uint256 tokenId) {
        if (agent == address(0)) revert ZeroAddress();
        if (identityCredentialOf[agent] != 0) revert DuplicateCredential();
        tokenId = _mint(agent, CredentialKind.Identity, 0, evidenceHash, metadataURI);
        identityCredentialOf[agent] = tokenId;
    }

    /// @notice Mints proof that an agent/provider completed a finalized market job.
    /// @dev The caller must be the job client or provider; the subject must be the provider.
    function mintCompletedJobCredential(
        uint256 jobId,
        string calldata metadataURI,
        bytes32 evidenceHash
    ) external nonReentrant returns (uint256 tokenId) {
        (address client, address provider, bool completed) = jobProofSource.credentialJob(jobId);
        if (!completed) revert JobNotCompleted(jobId);
        if (msg.sender != client && msg.sender != provider) revert NotJobParticipant(jobId);
        if (provider == address(0)) revert InvalidSubject();
        if (jobCredentialOf[jobId][provider] != 0) revert DuplicateCredential();

        tokenId = _mint(provider, CredentialKind.CompletedJob, jobId, evidenceHash, metadataURI);
        jobCredentialOf[jobId][provider] = tokenId;
    }

    function _mint(
        address subject,
        CredentialKind kind,
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata metadataURI
    ) internal returns (uint256 tokenId) {
        if (!_validMetadataURI(metadataURI)) revert InvalidMetadataURI();
        tokenId = ++totalSupply;
        _owners[tokenId] = subject;
        _balances[subject] += 1;
        _tokenURIs[tokenId] = metadataURI;
        _credentials[tokenId] = Credential({
            kind: kind,
            subject: subject,
            jobId: jobId,
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            evidenceHash: evidenceHash
        });

        emit Transfer(address(0), subject, tokenId);
        emit Locked(tokenId);
        emit CredentialMinted(tokenId, kind, subject, jobId, msg.sender, evidenceHash, metadataURI);
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

    // ERC-721 approval and transfer entry points intentionally revert.
    function approve(address, uint256) external pure { revert Soulbound(); }
    function setApprovalForAll(address, bool) external pure { revert Soulbound(); }
    function getApproved(uint256 tokenId) external view returns (address) { ownerOf(tokenId); return address(0); }
    function isApprovedForAll(address, address) external pure returns (bool) { return false; }
    function transferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256, bytes calldata) external pure { revert Soulbound(); }
}
