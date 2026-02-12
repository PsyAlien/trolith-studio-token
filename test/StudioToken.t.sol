// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import { StudioToken } from "../src/StudioToken.sol";
import { IAccessControl } from "openzeppelin-contracts/contracts/access/IAccessControl.sol";

contract StudioTokenTest is Test {
    StudioToken token;

    address admin = address(this);    // deployer = platform admin
    address shop  = address(0xBEEF);  // pretend this is TokenShop
    address alice = address(0xA11CE); // normal user

    function setUp() public {
        // Admin is explicitly passed in constructor
        token = new StudioToken(
            "Triolith Studio Token",
            "TST",
            admin
        );
    }

    // ------------------------------------------------------------
    // ROLE MANAGEMENT
    // ------------------------------------------------------------

    function test_adminCanGrantRoles() public {
        token.grantRole(token.MINTER_ROLE(), shop);
        token.grantRole(token.BURNER_ROLE(), shop);

        assertTrue(token.hasRole(token.MINTER_ROLE(), shop));
        assertTrue(token.hasRole(token.BURNER_ROLE(), shop));
    }

    function test_nonAdminCannotGrantRoles() public {
        bytes32 minterRole = token.MINTER_ROLE();
        bytes32 adminRole = token.DEFAULT_ADMIN_ROLE();
        
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                adminRole
            )
        );
        vm.prank(alice);
        token.grantRole(minterRole, alice);
    }

    // ------------------------------------------------------------
    // MINTING
    // ------------------------------------------------------------

    function test_minterRoleCanMint() public {
        // Admin gives MINTER_ROLE to shop
        token.grantRole(token.MINTER_ROLE(), shop);

        // Pretend the shop calls mint
        vm.prank(shop);
        token.mint(alice, 100);

        assertEq(token.balanceOf(alice), 100);
        assertEq(token.totalSupply(), 100);
    }

    function test_nonMinterCannotMint() public {
        bytes32 minterRole = token.MINTER_ROLE();
        
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                minterRole
            )
        );
        vm.prank(alice);
        token.mint(alice, 100);
    }

    // ------------------------------------------------------------
    // BURNING
    // ------------------------------------------------------------

    function test_burnerRoleCanBurnOwnBalance() public {
        // Give roles to shop
        token.grantRole(token.MINTER_ROLE(), shop);
        token.grantRole(token.BURNER_ROLE(), shop);

        // Mint tokens to shop
        vm.prank(shop);
        token.mint(shop, 200);

        assertEq(token.balanceOf(shop), 200);

        // Shop burns its own tokens
        vm.prank(shop);
        token.burn(50);

        assertEq(token.balanceOf(shop), 150);
        assertEq(token.totalSupply(), 150);
    }

    function test_nonBurnerCannotBurn() public {
        // Mint some tokens to alice (admin can mint to anyone)
        token.grantRole(token.MINTER_ROLE(), admin);
        token.mint(alice, 100);

        bytes32 burnerRole = token.BURNER_ROLE();
        
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                burnerRole
            )
        );
        vm.prank(alice);
        token.burn(10);
    }
}