// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "openzeppelin-contracts/contracts/access/Ownable.sol";
import { IERC20 } from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import { StudioToken } from "./StudioToken.sol";

contract TokenShop is Ownable {
    using SafeERC20 for IERC20;

    StudioToken public immutable token;

    // Limits (still useful safety rails)
    uint256 public maxEthIn; // max msg.value for buyETH
    uint256 public maxGenIn; // max GEN units for sellToETH / sellToToken

    bool public paused;

    // Supported payment assets (ETH = address(0))
    mapping(address => bool) public supportedTokens;

    // Asset decimals (ETH treated as 18)
    mapping(address => uint8) public assetDecimals;

    // Rates scaled by 1e18:
    // buyRate[asset]  = GEN units per 1 asset unit (normalized to 18 decimals)
    // sellRate[asset] = GEN units per 1 asset unit (normalized to 18 decimals)
    mapping(address => uint256) public buyRate;
    mapping(address => uint256) public sellRate;

    // Fees
    uint256 public feeBps;
    uint256 public constant BPS = 10_000;

    // Unified events (multi-asset friendly)
    event Bought(address indexed user, address indexed payAsset, uint256 amountIn, uint256 genOut);
    event Sold(address indexed user, address indexed payAsset, uint256 genIn, uint256 amountOut);

    event RatesUpdated(address indexed asset, uint256 buyRate, uint256 sellRate);
    event FeeUpdated(uint256 feeBps);
    event EthWithdrawn(address indexed to, uint256 amount);

    // Ops / admin change events (helps debugging + indexer + audits)
    event PausedSet(bool paused);
    event SupportedTokenSet(address indexed asset, bool isSupported);
    event AssetDecimalsSet(address indexed asset, uint8 decimals);
    event LimitsUpdated(uint256 maxEthIn, uint256 maxGenIn);

    constructor(
        StudioToken token_,
        uint256 maxEthIn_,
        uint256 maxGenIn_,
        uint256 initialBuyRateEth,
        uint256 initialSellRateEth
    ) Ownable(msg.sender) {
        require(address(token_) != address(0), "token=0");
        require(initialBuyRateEth > 0, "buyRate=0");
        require(initialSellRateEth > 0, "sellRate=0");

        token = token_;
        maxEthIn = maxEthIn_;
        maxGenIn = maxGenIn_;

        // Enable ETH by default
        supportedTokens[address(0)] = true;
        assetDecimals[address(0)] = 18;

        buyRate[address(0)] = initialBuyRateEth;
        sellRate[address(0)] = initialSellRateEth;
        emit RatesUpdated(address(0), initialBuyRateEth, initialSellRateEth);

        feeBps = 0;
        emit FeeUpdated(0);

        emit LimitsUpdated(maxEthIn_, maxGenIn_);
    }

    // ---------------- Admin controls ----------------

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setSupportedToken(address asset, bool isSupported) external onlyOwner {
        supportedTokens[asset] = isSupported;
        emit SupportedTokenSet(asset, isSupported);
    }

    function setAssetDecimals(address asset, uint8 decimals_) external onlyOwner {
        require(asset != address(0), "eth fixed");
        require(decimals_ <= 18, "dec>18");
        assetDecimals[asset] = decimals_;
        emit AssetDecimalsSet(asset, decimals_);
    }

    function setRates(address asset, uint256 newBuyRate, uint256 newSellRate) external onlyOwner {
        require(newBuyRate > 0, "buyRate=0");
        require(newSellRate > 0, "sellRate=0");

        buyRate[asset] = newBuyRate;
        sellRate[asset] = newSellRate;

        emit RatesUpdated(asset, newBuyRate, newSellRate);
    }

    function setMaxEthIn(uint256 newMaxEthIn) external onlyOwner {
        maxEthIn = newMaxEthIn;
        emit LimitsUpdated(maxEthIn, maxGenIn);
    }

    function setMaxGenIn(uint256 newMaxGenIn) external onlyOwner {
        maxGenIn = newMaxGenIn;
        emit LimitsUpdated(maxEthIn, maxGenIn);
    }

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1_000, "fee too high"); // cap at 10% for MVP safety
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function withdrawETH(address to, uint256 amountWei) external onlyOwner {
        require(to != address(0), "to=0");
        require(address(this).balance >= amountWei, "insufficient");

        (bool ok, ) = payable(to).call{value: amountWei}("");
        require(ok, "withdraw failed");

        emit EthWithdrawn(to, amountWei);
    }

    // ---------------- Math helpers ----------------

    function _applyFee(uint256 amount) internal view returns (uint256) {
        return (amount * (BPS - feeBps)) / BPS;
    }

    function _to18(address asset, uint256 amount) internal view returns (uint256) {
        if (asset == address(0)) return amount; // ETH already 18
        uint8 d = assetDecimals[asset];
        require(d != 0, "decimals not set");
        if (d == 18) return amount;
        return amount * (10 ** (18 - d)); // d < 18
    }

    function _from18(address asset, uint256 amount18) internal view returns (uint256) {
        if (asset == address(0)) return amount18; // ETH already 18
        uint8 d = assetDecimals[asset];
        require(d != 0, "decimals not set");
        if (d == 18) return amount18;
        return amount18 / (10 ** (18 - d));
    }

    // ---------------- Quotes (gross, before fees) ----------------

    function getQuoteBuyETH(uint256 ethInWei) public view returns (uint256 genOut) {
        uint256 r = buyRate[address(0)];
        genOut = (ethInWei * r) / 1e18;
    }

    function getQuoteSellToETH(uint256 genIn) public view returns (uint256 ethOutWei) {
        uint256 r = sellRate[address(0)];
        ethOutWei = (genIn * 1e18) / r;
    }

    function getQuoteBuyToken(address asset, uint256 amountIn) public view returns (uint256 genOut) {
        uint256 r = buyRate[asset];
        uint256 amount18 = _to18(asset, amountIn);
        genOut = (amount18 * r) / 1e18;
    }

    function getQuoteSellToToken(address asset, uint256 genIn) public view returns (uint256 amountOut) {
        uint256 r = sellRate[asset];
        uint256 grossOut18 = (genIn * 1e18) / r;
        amountOut = _from18(asset, grossOut18);
    }

    // ============================================================
    // 4 USER FUNCTIONS (Masha scope)
    // ============================================================

    // ---------------- BUY FLOWS (mint to user) ----------------

    function buyETH(uint256 minGenOut) external payable {
        require(!paused, "paused");
        require(supportedTokens[address(0)], "eth not supported");

        require(msg.value > 0, "no payment");
        require(msg.value <= maxEthIn, "over maxEthIn");

        uint256 grossGenOut = getQuoteBuyETH(msg.value);
        require(grossGenOut > 0, "too little");

        uint256 netGenOut = _applyFee(grossGenOut);
        require(netGenOut >= minGenOut, "slippage");

        token.mint(msg.sender, netGenOut);

        emit Bought(msg.sender, address(0), msg.value, netGenOut);
    }

    function buyToken(address asset, uint256 amountIn, uint256 minGenOut) external {
        require(asset != address(0), "use buyETH");
        require(!paused, "paused");
        require(supportedTokens[asset], "asset not supported");
        require(amountIn > 0, "amountIn=0");

        uint256 grossGenOut = getQuoteBuyToken(asset, amountIn);
        require(grossGenOut > 0, "too little");

        uint256 netGenOut = _applyFee(grossGenOut);
        require(netGenOut >= minGenOut, "slippage");

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amountIn);
        token.mint(msg.sender, netGenOut);

        emit Bought(msg.sender, asset, amountIn, netGenOut);
    }

    // ---------------- SELL FLOWS (burn in shop BEFORE payout) ----------------

    function sellToETH(uint256 genIn, uint256 minEthOut) external {
        require(!paused, "paused");
        require(supportedTokens[address(0)], "eth not supported");

        require(genIn > 0, "zero genIn");
        require(genIn <= maxGenIn, "over maxGenIn");

        uint256 grossEthOut = getQuoteSellToETH(genIn);
        require(grossEthOut > 0, "too little");

        uint256 netEthOut = _applyFee(grossEthOut);
        require(netEthOut >= minEthOut, "slippage");
        require(address(this).balance >= netEthOut, "no liquidity");

        bool ok = token.transferFrom(msg.sender, address(this), genIn);
        require(ok, "transferFrom failed");

        token.burn(genIn);

        (bool success, ) = payable(msg.sender).call{value: netEthOut}("");
        require(success, "eth transfer failed");

        emit Sold(msg.sender, address(0), genIn, netEthOut);
    }

    function sellToToken(address asset, uint256 genIn, uint256 minTokenOut) external {
        require(asset != address(0), "use sellToETH");
        require(!paused, "paused");
        require(supportedTokens[asset], "asset not supported");

        require(genIn > 0, "zero genIn");
        require(genIn <= maxGenIn, "over maxGenIn");

        uint256 grossTokenOut = getQuoteSellToToken(asset, genIn);
        require(grossTokenOut > 0, "too little");

        uint256 grossOut18 = _to18(asset, grossTokenOut);
        uint256 netOut18 = _applyFee(grossOut18);
        uint256 netTokenOut = _from18(asset, netOut18);

        require(netTokenOut >= minTokenOut, "slippage");
        require(IERC20(asset).balanceOf(address(this)) >= netTokenOut, "no liquidity");

        bool ok = token.transferFrom(msg.sender, address(this), genIn);
        require(ok, "transferFrom failed");

        token.burn(genIn);

        IERC20(asset).safeTransfer(msg.sender, netTokenOut);

        emit Sold(msg.sender, asset, genIn, netTokenOut);
    }

    receive() external payable {}
}
