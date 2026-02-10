// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import { GameSpender } from "../src/GameSpender.sol";
import { IERC20 } from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract DeploySpender is Script {
    function run() external {
        // You pass GEN + TREASURY from env vars when broadcasting
        address gen = vm.envAddress("GEN");
        address treasury = vm.envAddress("TREASURY");

        vm.startBroadcast();
        GameSpender spender = new GameSpender(IERC20(gen), treasury);
        vm.stopBroadcast();

        console2.log("GameSpender:", address(spender));
        console2.log("GEN:", gen);
        console2.log("Treasury:", treasury);
    }
}
