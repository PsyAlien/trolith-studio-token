// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import { TokenShop } from "../src/TokenShop.sol";
import { ITRI } from "../src/interfaces/ITRI.sol";

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

        // TRI token address (deployed by Masha's wallet-with-taxes project)
        // Set this env var to the address of the deployed TRI contract
        address triAddress = vm.envAddress("TRI");

        // ---------------- Broadcast ----------------
        uint256 deployerPk = vm.envUint("PK");
        address deployer = vm.addr(deployerPk);

        vm.startBroadcast(deployerPk);

        // 1) Connect to existing TRI token
        ITRI token = ITRI(triAddress);

        // 2) Deploy TokenShop
        TokenShop shop = new TokenShop(
            token,
            maxEthIn,
            maxGenIn,
            buyRateEth,
            sellRateEth
        );

        // 3) Grant roles to TokenShop on TRI
        //    NOTE: The deployer must have DEFAULT_ADMIN_ROLE on TRI for this to work.
        //    If Masha is the TRI admin, she needs to run these two calls separately.
        //    Uncomment these lines only if the deployer is the TRI admin:
        //
        // bytes32 MINTER_ROLE = keccak256("MINTER_ROLE");
        // bytes32 BURNER_ROLE = keccak256("BURNER_ROLE");
        // AccessControl(triAddress).grantRole(MINTER_ROLE, address(shop));
        // AccessControl(triAddress).grantRole(BURNER_ROLE, address(shop));

        // 4) Optional: configure USDT support if USDT env var provided
        if (usdt != address(0)) {
            shop.setSupportedToken(usdt, true);
            shop.setAssetDecimals(usdt, usdtDecimals);
            shop.setRates(usdt, buyRateUsdt, sellRateUsdt);
        }

        vm.stopBroadcast();

        // ---------------- Output ----------------
        console2.log("Deployer:", deployer);
        console2.log("TRI token (Masha):", triAddress);
        console2.log("TokenShop:", address(shop));
        console2.log("");
        console2.log("IMPORTANT: TokenShop needs MINTER_ROLE and BURNER_ROLE on TRI.");
        console2.log("Ask the TRI admin to run:");
        console2.log("  TRI.grantRole(MINTER_ROLE, TokenShop)");
        console2.log("  TRI.grantRole(BURNER_ROLE, TokenShop)");

        if (usdt != address(0)) {
            console2.log("USDT configured:", usdt);
        } else {
            console2.log("USDT not configured (set env USDT=0x... to enable).");
        }
    }
}
