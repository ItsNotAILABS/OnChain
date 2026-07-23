// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title ParallaxMarketRouter
/// @notice Governed execution boundary for PARALLAX strategies across approved Ethereum venues.
/// @dev This contract never invents strategy decisions. It enforces policy around externally produced intents.
contract ParallaxMarketRouter {
    struct Market {
        address adapter;
        bytes32 marketType;
        bool active;
        uint32 maxSlippageBps;
        uint128 maxNotionalWei;
    }

    struct ExecutionIntent {
        bytes32 strategyId;
        bytes32 marketId;
        address account;
        address sellToken;
        address buyToken;
        uint256 sellAmount;
        uint256 minimumBuyAmount;
        uint256 deadline;
        uint64 nonce;
        bytes32 evidenceHash;
    }

    error Unauthorized();
    error ZeroAddress();
    error MarketInactive(bytes32 marketId);
    error InvalidIntent();
    error DeadlineExpired();
    error NonceUsed(address account, uint64 nonce);
    error NotionalTooLarge(uint256 requested, uint256 maximum);
    error SlippageLimitExceeded();
    error AdapterCallFailed(bytes reason);
    error Reentrancy();

    event GovernorTransferred(address indexed previousGovernor, address indexed newGovernor);
    event OperatorUpdated(address indexed operator, bool allowed);
    event MarketConfigured(
        bytes32 indexed marketId,
        address indexed adapter,
        bytes32 indexed marketType,
        bool active,
        uint32 maxSlippageBps,
        uint128 maxNotionalWei
    );
    event IntentExecuted(
        bytes32 indexed intentHash,
        bytes32 indexed strategyId,
        bytes32 indexed marketId,
        address account,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minimumBuyAmount,
        uint256 amountBought,
        bytes32 evidenceHash
    );

    address public governor;
    mapping(address => bool) public operators;
    mapping(bytes32 => Market) public markets;
    mapping(address => mapping(uint64 => bool)) public usedNonce;
    uint256 private _entered;

    constructor(address governor_) {
        if (governor_ == address(0)) revert ZeroAddress();
        governor = governor_;
    }

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != governor) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_entered != 0) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    function transferGovernor(address newGovernor) external onlyGovernor {
        if (newGovernor == address(0)) revert ZeroAddress();
        emit GovernorTransferred(governor, newGovernor);
        governor = newGovernor;
    }

    function setOperator(address operator, bool allowed) external onlyGovernor {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    function configureMarket(
        bytes32 marketId,
        address adapter,
        bytes32 marketType,
        bool active,
        uint32 maxSlippageBps,
        uint128 maxNotionalWei
    ) external onlyGovernor {
        if (marketId == bytes32(0) || adapter == address(0) || marketType == bytes32(0)) revert InvalidIntent();
        if (maxSlippageBps > 10_000 || maxNotionalWei == 0) revert InvalidIntent();
        markets[marketId] = Market({
            adapter: adapter,
            marketType: marketType,
            active: active,
            maxSlippageBps: maxSlippageBps,
            maxNotionalWei: maxNotionalWei
        });
        emit MarketConfigured(marketId, adapter, marketType, active, maxSlippageBps, maxNotionalWei);
    }

    function hashIntent(ExecutionIntent calldata intent) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                intent.strategyId,
                intent.marketId,
                intent.account,
                intent.sellToken,
                intent.buyToken,
                intent.sellAmount,
                intent.minimumBuyAmount,
                intent.deadline,
                intent.nonce,
                intent.evidenceHash
            )
        );
    }

    /// @notice Executes a pre-authorized strategy intent against an approved market adapter.
    /// @param adapterCalldata Encoded adapter-specific call. The adapter must return amountBought as uint256.
    function executeIntent(ExecutionIntent calldata intent, bytes calldata adapterCalldata)
        external
        onlyOperator
        nonReentrant
        returns (uint256 amountBought)
    {
        Market memory market = markets[intent.marketId];
        if (!market.active) revert MarketInactive(intent.marketId);
        if (
            intent.strategyId == bytes32(0) || intent.account == address(0) || intent.sellToken == address(0)
                || intent.buyToken == address(0) || intent.sellToken == intent.buyToken || intent.sellAmount == 0
                || intent.minimumBuyAmount == 0 || intent.evidenceHash == bytes32(0)
        ) revert InvalidIntent();
        if (block.timestamp > intent.deadline) revert DeadlineExpired();
        if (usedNonce[intent.account][intent.nonce]) revert NonceUsed(intent.account, intent.nonce);
        if (intent.sellAmount > market.maxNotionalWei) {
            revert NotionalTooLarge(intent.sellAmount, market.maxNotionalWei);
        }

        usedNonce[intent.account][intent.nonce] = true;

        if (!IERC20Minimal(intent.sellToken).transferFrom(intent.account, address(this), intent.sellAmount)) {
            revert InvalidIntent();
        }
        if (!IERC20Minimal(intent.sellToken).approve(market.adapter, intent.sellAmount)) revert InvalidIntent();

        (bool ok, bytes memory result) = market.adapter.call(adapterCalldata);
        if (!ok) revert AdapterCallFailed(result);
        if (result.length < 32) revert AdapterCallFailed(result);
        amountBought = abi.decode(result, (uint256));
        if (amountBought < intent.minimumBuyAmount) revert SlippageLimitExceeded();

        emit IntentExecuted(
            hashIntent(intent),
            intent.strategyId,
            intent.marketId,
            intent.account,
            intent.sellToken,
            intent.buyToken,
            intent.sellAmount,
            intent.minimumBuyAmount,
            amountBought,
            intent.evidenceHash
        );
    }
}