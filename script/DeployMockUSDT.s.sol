// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import { ERC20 } from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    uint8 private immutable _decimals;

    constructor() ERC20("Mock USDT", "mUSDT") {
        _decimals = 6;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployMockUSDT is Script {
    function run() external {
        vm.startBroadcast();
        MockUSDT usdt = new MockUSDT();
        vm.stopBroadcast();

        console2.log("MockUSDT:", address(usdt));
    }
}
