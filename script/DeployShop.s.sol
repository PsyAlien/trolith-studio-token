// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import { StudioToken } from "../src/StudioToken.sol";
import { TokenShop } from "../src/TokenShop.sol";

contract DeployShop is Script {
    function run() external {
        // ---------------- Config (edit if you want) ----------------
        uint256 maxEthIn = 0.05 ether;
        uint256 maxGenIn = 50e18;

        // Rates are scaled by 1e18
        // 1 ETH -> 1000 GEN
        uint256 buyRateEth = 1000e18;
        uint256 sellRateEth = 1000e18;

        // Optional: configure a mock/real USDT after deploy (set to 0x0 to skip)
        address usdt = vm.envOr("USDT", address(0));

        // Example: 1 USDT -> 2 GEN
        uint256 buyRateUsdt = 2e18;
        uint256 sellRateUsdt = 2e18;
        uint8 usdtDecimals = 6;

        // ---------------- Broadcast ----------------
        uint256 deployerPk = vm.envUint("PK");
        address deployer = vm.addr(deployerPk);

        vm.startBroadcast(deployerPk);

        // 1) Deploy StudioToken with admin = deployer
        StudioToken token = new StudioToken("Triolith Studio Token", "TST", deployer);

        // 2) Deploy TokenShop
        TokenShop shop = new TokenShop(
            token,
            maxEthIn,
            maxGenIn,
            buyRateEth,
            sellRateEth
        );

        // 3) Grant roles to TokenShop (this is the KEY change vs Ownable)
        token.grantRole(token.MINTER_ROLE(), address(shop));
        token.grantRole(token.BURNER_ROLE(), address(shop));

        // 4) Optional: configure USDT support if USDT env var provided
        if (usdt != address(0)) {
            shop.setSupportedToken(usdt, true);
            shop.setAssetDecimals(usdt, usdtDecimals);
            shop.setRates(usdt, buyRateUsdt, sellRateUsdt);
        }

        vm.stopBroadcast();

        // ---------------- Output ----------------
        console2.log("Deployer (admin):", deployer);
        console2.log("StudioToken:", address(token));
        console2.log("TokenShop:", address(shop));

        if (usdt != address(0)) {
            console2.log("USDT configured:", usdt);
        } else {
            console2.log("USDT not configured (set env USDT=0x... to enable).");
        }
    }
}
