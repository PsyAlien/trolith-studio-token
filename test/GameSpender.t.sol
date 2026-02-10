// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import { StudioToken } from "../src/StudioToken.sol";
import { TokenShop } from "../src/TokenShop.sol";
import { GameSpender } from "../src/GameSpender.sol";

contract GameSpenderTest is Test {
    StudioToken token;
    TokenShop shop;
    GameSpender spender;

    address alice = address(0xA11CE);
    address operator = address(0xB0B);
    address treasury = address(0xCAFE);


    // Shop config
    uint256 maxEthIn = 0.05 ether;
    uint256 maxGenIn = 50e18;
    uint256 buyRateEth = 1000e18;
    uint256 sellRateEth = 1000e18;

    function setUp() public {
        token = new StudioToken("Triolith Studio Token", "TST");

        shop = new TokenShop(token, maxEthIn, maxGenIn, buyRateEth, sellRateEth);
        token.transferOwnership(address(shop));

        // Allow Alice to buy
        shop.setAllowed(alice, true);

        // Fund Alice ETH + fund shop liquidity for completeness
        vm.deal(alice, 1 ether);
        vm.deal(address(shop), 1 ether);

        // Deploy spender (treasury can be TokenShop, a wallet, or any treasury address)
        spender = new GameSpender(token, treasury);

        // Owner (this test contract) sets operator
        spender.setOperator(operator, true);

        // Give Alice some GEN via buyETH: 0.01 ETH => 10 GEN
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        assertEq(token.balanceOf(alice), 10e18);
    }

    function test_onlyOperatorCanSpend() public {
        vm.prank(alice);
        token.approve(address(spender), 1e18);

        vm.prank(alice);
        vm.expectRevert(bytes("not operator"));
        spender.spend(alice, 1e18, keccak256("SKIN"));
    }

    function test_spend_transfersToTreasury() public {
        vm.prank(alice);
        token.approve(address(spender), 3e18);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 treasuryBefore = token.balanceOf(treasury);

        vm.prank(operator);
        spender.spend(alice, 3e18, keccak256("BATTLEPASS_S1"));

        assertEq(token.balanceOf(alice), aliceBefore - 3e18);
        assertEq(token.balanceOf(treasury), treasuryBefore + 3e18);
    }

    function test_spend_revertsIfPaused() public {
        spender.setPaused(true);

        vm.prank(alice);
        token.approve(address(spender), 1e18);

        vm.prank(operator);
        vm.expectRevert(bytes("paused"));
        spender.spend(alice, 1e18, keccak256("SKIN"));
    }

    function test_spend_revertsIfNoApproval() public {
        vm.prank(operator);
        vm.expectRevert(); // ERC20 transferFrom will revert or return false depending on implementation
        spender.spend(alice, 1e18, keccak256("SKIN"));
    }
}
