// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "openzeppelin-contracts/contracts/access/Ownable.sol";
import { IERC20 } from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract GameSpender is Ownable {
    IERC20 public immutable gen;
    address public treasury;
    bool public paused;

    // Who is allowed to call spend()
    mapping(address => bool) public operators;

    event OperatorSet(address indexed operator, bool allowed);
    event TreasurySet(address indexed treasury);
    event PausedSet(bool paused);

    // reason = bytes32 tag like keccak256("SKIN_DRAGON") or keccak256("BATTLEPASS_S1")
    event Spent(
        address indexed user,
        address indexed operator,
        address indexed treasury,
        uint256 amount,
        bytes32 reason
    );

    constructor(IERC20 gen_, address treasury_) Ownable(msg.sender) {
        require(address(gen_) != address(0), "gen=0");
        require(treasury_ != address(0), "treasury=0");
        gen = gen_;
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    modifier onlyOperator() {
        require(operators[msg.sender], "not operator");
        _;
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        operators[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    function spend(address user, uint256 amount, bytes32 reason) external onlyOperator {
        require(!paused, "paused");
        require(user != address(0), "user=0");
        require(amount > 0, "amount=0");

        // User must have approved this contract to spend their GEN.
        bool ok = gen.transferFrom(user, treasury, amount);
        require(ok, "transferFrom failed");

        emit Spent(user, msg.sender, treasury, amount, reason);
    }
}
