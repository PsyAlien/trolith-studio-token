// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ERC20 } from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import { AccessControl } from "openzeppelin-contracts/contracts/access/AccessControl.sol";

contract StudioToken is ERC20, AccessControl {
    // Roles (badges)
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor(
        string memory name_,
        string memory symbol_,
        address admin_
    ) ERC20(name_, symbol_) {
        require(admin_ != address(0), "admin=0");

        // The admin gets the "master key"
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    // Mint: only MINTER_ROLE can create new tokens
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    // Burn: only BURNER_ROLE can destroy tokens from *its own balance*
    // (This is perfect for TokenShop: it will transfer GEN to itself, then burn.)
    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(msg.sender, amount);
    }
}