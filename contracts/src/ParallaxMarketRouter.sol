// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title ParallaxMarketRouter
/// @notice Governed execution boundary for PARALLAX strategies across approved Ethereum venues