// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import { StudioToken } from "../src/StudioToken.sol";

contract StudioTokenTest is Test {
    StudioToken token;

    address owner = address(this);      // this test contract deploys the token
    address alice = address(0xA11CE);   // a random user

    function setUp() public {
        token = new StudioToken("Triolith Studio Token", "TST");
    }

    function test_ownerCanMint() public {
        token.mint(alice, 100);

        assertEq(token.balanceOf(alice), 100);
        assertEq(token.totalSupply(), 100);
    }

    function test_nonOwnerCannotMint() public {
        vm.prank(alice); // next call is "from alice"

        vm.expectRevert(); // we expect it to revert (fail)
        token.mint(alice, 100);
    }
}