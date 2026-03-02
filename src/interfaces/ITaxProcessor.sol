// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title ITaxProcessor - Interface for Masha's on-chain tax logging
/// @notice Used by TokenShop to log buy/sell events for tax compliance
interface ITaxProcessor {
    function logTaxEvent(address user, int256 gainOrLossSEK, string calldata metadata) external;
    function eventCount() external view returns (uint256);
}
