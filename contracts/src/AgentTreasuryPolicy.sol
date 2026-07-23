// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title AgentTreasuryPolicy
/// @notice Non-custodial policy registry for agent wallets and smart accounts.
/// @dev This contract does not hold funds or execute swaps. It records enforceable spending intent
///      that wallets, account modules, relayers, or off-chain planners can consult before execution.
contract AgentTreasuryPolicy {
    struct Policy {
        uint128 maxTransactionValueWei;
        uint128 dailySpendLimitWei;
        uint32 minimumStableReserveBps;
        uint32 maxSingleAssetBps;
        bool humanApprovalRequired;
        bool active;
    }

    error Unauthorized();
    error InvalidBasisPoints();
    error InvalidAddress();
    error PolicyInactive();
    error DailyLimitExceeded(uint256 requested, uint256 remaining);
    error TransactionLimitExceeded(uint256 requested, uint256 maximum);
    error HumanApprovalRequired();

    event PolicyUpdated(address indexed agent, Policy policy);
    event OperatorUpdated(address indexed agent, address indexed operator, bool allowed);
    event SpendRecorded(address indexed agent, address indexed operator, uint256 valueWei, uint64 dayIndex, bytes32 actionHash);

    mapping(address => Policy) public policyOf;
    mapping(address => mapping(address => bool)) public operatorOf;
    mapping(address => mapping(uint64 => uint256)) public spentByDay;

    function setPolicy(Policy calldata policy) external {
        if (policy.minimumStableReserveBps > 10_000 || policy.maxSingleAssetBps > 10_000) revert InvalidBasisPoints();
        policyOf[msg.sender] = policy;
        emit PolicyUpdated(msg.sender, policy);
    }

    function setOperator(address operator, bool allowed) external {
        if (operator == address(0)) revert InvalidAddress();
        operatorOf[msg.sender][operator] = allowed;
        emit OperatorUpdated(msg.sender, operator, allowed);
    }

    function currentDay() public view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    function remainingDailySpend(address agent) external view returns (uint256) {
        Policy memory policy = policyOf[agent];
        uint256 spent = spentByDay[agent][currentDay()];
        return spent >= policy.dailySpendLimitWei ? 0 : uint256(policy.dailySpendLimitWei) - spent;
    }

    function validateAction(address agent, uint256 valueWei, bool humanApproved)
        public
        view
        returns (bool allowed, string memory reason)
    {
        Policy memory policy = policyOf[agent];
        if (!policy.active) return (false, "policy-inactive");
        if (valueWei > policy.maxTransactionValueWei) return (false, "transaction-limit-exceeded");
        uint256 spent = spentByDay[agent][currentDay()];
        if (spent + valueWei > policy.dailySpendLimitWei) return (false, "daily-limit-exceeded");
        if (policy.humanApprovalRequired && !humanApproved) return (false, "human-approval-required");
        return (true, "allowed");
    }

    function recordSpend(address agent, uint256 valueWei, bytes32 actionHash, bool humanApproved) external {
        if (msg.sender != agent && !operatorOf[agent][msg.sender]) revert Unauthorized();
        Policy memory policy = policyOf[agent];
        if (!policy.active) revert PolicyInactive();
        if (valueWei > policy.maxTransactionValueWei) {
            revert TransactionLimitExceeded(valueWei, policy.maxTransactionValueWei);
        }
        uint64 day = currentDay();
        uint256 spent = spentByDay[agent][day];
        uint256 next = spent + valueWei;
        if (next > policy.dailySpendLimitWei) {
            revert DailyLimitExceeded(valueWei, uint256(policy.dailySpendLimitWei) - spent);
        }
        if (policy.humanApprovalRequired && !humanApproved) revert HumanApprovalRequired();
        spentByDay[agent][day] = next;
        emit SpendRecorded(agent, msg.sender, valueWei, day, actionHash);
    }
}
