// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import { StudioToken } from "../src/StudioToken.sol";
import { TokenShop } from "../src/TokenShop.sol";

contract DeployShop is Script {
    function run() external {
        // Limits
        uint256 maxEthIn = 0.05 ether;
        uint256 maxGenIn = 50e18;

        // Rates (scaled by 1e18)
        // 1 ETH = 1000 GEN => buyRateEth = 1000e18, sellRateEth = 1000e18
        uint256 buyRateEth = 1000e18;
        uint256 sellRateEth = 1000e18;

        vm.startBroadcast();

        StudioToken token = new StudioToken("Triolith Studio Token", "TST");

        TokenShop shop = new TokenShop(
            token,
            maxEthIn,
            maxGenIn,
            buyRateEth,
            sellRateEth
        );

        // Give shop mint rights
        token.transferOwnership(address(shop));

        // Allow the deployer to use the shop
        shop.setAllowed(msg.sender, true);

        vm.stopBroadcast();

        console2.log("StudioToken:", address(token));
        console2.log("TokenShop:", address(shop));
    }
}