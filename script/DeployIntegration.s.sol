// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import { TokenShop } from "../src/TokenShop.sol";
import { ITRI } from "../src/interfaces/ITRI.sol";
import { ITaxProcessor } from "../src/interfaces/ITaxProcessor.sol";

import { ERC20 } from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import { AccessControl } from "openzeppelin-contracts/contracts/access/AccessControl.sol";

/// @notice Local copy of TRI for integration testing on Anvil.
contract LocalTRI is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor() ERC20("Triolith Token", "TRI") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }
}

/// @notice Local copy of TaxProcessor for integration testing on Anvil.
///         Same logic as Masha's TaxProcessor.sol
contract LocalTaxProcessor is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct TaxEvent {
        address user;
        uint256 timestamp;
        int256 gainOrLossSEK;
        string metadata;
    }

    TaxEvent[] public events;

    event TaxLogged(address indexed user, int256 gainOrLossSEK, string metadata, uint256 timestamp);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    function logTaxEvent(address user, int256 gainOrLossSEK, string calldata metadata) external onlyRole(OPERATOR_ROLE) {
        events.push(TaxEvent({
            user: user,
            timestamp: block.timestamp,
            gainOrLossSEK: gainOrLossSEK,
            metadata: metadata
        }));
        emit TaxLogged(user, gainOrLossSEK, metadata, block.timestamp);
    }

    function eventCount() external view returns (uint256) {
        return events.length;
    }

    function getEvent(uint256 index) external view returns (TaxEvent memory) {
        return events[index];
    }
}

contract DeployIntegration is Script {
    function run() external {
        // ---- Config ----
        uint256 maxEthIn = 0.05 ether;
        uint256 maxGenIn = 50e18;
        uint256 buyRateEth = 1000e18;   // 1 ETH = 1000 TRI
        uint256 sellRateEth = 1000e18;  // 1000 TRI = 1 ETH

        // Anvil's first default private key (account 0)
        uint256 deployerPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployer = vm.addr(deployerPk);

        console2.log("=== Integration Deploy on Anvil ===");
        console2.log("Deployer:", deployer);
        console2.log("");

        vm.startBroadcast(deployerPk);

        // Step 1: Deploy TRI (simulating what Masha would do)
        LocalTRI tri = new LocalTRI();
        console2.log("Step 1 - TRI deployed at:", address(tri));

        // Step 2: Deploy TaxProcessor (simulating what Masha would do)
        LocalTaxProcessor taxProcessor = new LocalTaxProcessor();
        console2.log("Step 2 - TaxProcessor deployed at:", address(taxProcessor));

        // Step 3: Deploy TokenShop, pointing at TRI
        TokenShop shop = new TokenShop(
            ITRI(address(tri)),
            maxEthIn,
            maxGenIn,
            buyRateEth,
            sellRateEth
        );
        console2.log("Step 3 - TokenShop deployed at:", address(shop));

        // Step 4: Grant MINTER and BURNER roles to TokenShop on TRI
        tri.grantRole(tri.MINTER_ROLE(), address(shop));
        tri.grantRole(tri.BURNER_ROLE(), address(shop));
        console2.log("Step 4 - Granted MINTER_ROLE and BURNER_ROLE to TokenShop");

        // Step 5: Grant OPERATOR_ROLE to TokenShop on TaxProcessor
        //         (so TokenShop can write tax events)
        taxProcessor.grantRole(taxProcessor.OPERATOR_ROLE(), address(shop));
        console2.log("Step 5 - Granted OPERATOR_ROLE to TokenShop on TaxProcessor");

        // Step 6: Connect TaxProcessor to TokenShop
        shop.setTaxProcessor(address(taxProcessor));
        console2.log("Step 6 - Connected TaxProcessor to TokenShop");

        vm.stopBroadcast();

        // ---- Summary ----
        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("TRI token:      ", address(tri));
        console2.log("TaxProcessor:   ", address(taxProcessor));
        console2.log("TokenShop:      ", address(shop));
        console2.log("");
        console2.log("Everything is connected! Buy/sell events will be logged for taxes.");
    }
}
