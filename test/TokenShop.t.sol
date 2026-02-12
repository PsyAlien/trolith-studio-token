// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import { StudioToken } from "../src/StudioToken.sol";
import { TokenShop } from "../src/TokenShop.sol";

import { ERC20 } from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

// ---------------- Mock USDT (6 decimals) ----------------
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

contract TokenShopTest is Test {
    StudioToken token;
    TokenShop shop;
    MockUSDT usdt;

    address admin = address(this);      // test contract is the platform admin
    address alice = address(0xA11CE);   // user
    address bob   = address(0xB0B);     // user

    // Limits
    uint256 maxEthIn = 0.05 ether;
    uint256 maxGenIn = 50e18;

    // ETH rates (scaled by 1e18): 1 ETH = 1000 GEN
    uint256 initialBuyRateEth  = 1000e18;
    uint256 initialSellRateEth = 1000e18;

    function setUp() public {
        // Deploy token with admin
        token = new StudioToken("Triolith Studio Token", "TST", admin);

        // Deploy shop
        shop = new TokenShop(
            token,
            maxEthIn,
            maxGenIn,
            initialBuyRateEth,
            initialSellRateEth
        );

        // Grant shop mint/burn roles (this is the new “permission system”)
        token.grantRole(token.MINTER_ROLE(), address(shop));
        token.grantRole(token.BURNER_ROLE(), address(shop));

        // Give users ETH
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        // Deploy mock USDT
        usdt = new MockUSDT();

        // Enable USDT in shop + set decimals
        shop.setSupportedToken(address(usdt), true);
        shop.setAssetDecimals(address(usdt), 6);

        // Rates: 1 USDT = 2 GEN
        shop.setRates(address(usdt), 2e18, 2e18);

        // Give Alice 100 USDT
        usdt.mint(alice, 100 * 1e6);
    }

    // ------------------------------------------------------------
    // Rates sanity
    // ------------------------------------------------------------

    function test_getQuoteBuyETH_matchesRate() public view {
        uint256 genOut = shop.getQuoteBuyETH(0.01 ether);
        assertEq(genOut, 10e18);
    }

    function test_getQuoteSellToETH_matchesRate() public view {
        uint256 ethOut = shop.getQuoteSellToETH(10e18);
        assertEq(ethOut, 0.01 ether);
    }

    function test_setRates_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        shop.setRates(address(0), 123e18, 456e18);
    }

    function test_setRates_updatesQuotes() public {
        shop.setRates(address(0), 2000e18, 1000e18);

        uint256 genOut = shop.getQuoteBuyETH(0.01 ether);
        assertEq(genOut, 20e18);

        uint256 ethOut = shop.getQuoteSellToETH(10e18);
        assertEq(ethOut, 0.01 ether);
    }

    // ------------------------------------------------------------
    // BUY ETH
    // ------------------------------------------------------------

    function test_buyETH_mintsTokens() public {
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(10e18);

        assertEq(token.balanceOf(alice), 10e18);
        assertEq(token.totalSupply(), 10e18);
    }

    function test_buyETH_revertsIfPaused() public {
        shop.setPaused(true);

        vm.prank(alice);
        vm.expectRevert(bytes("paused"));
        shop.buyETH{value: 0.01 ether}(0);
    }

    function test_buyETH_revertsIfOverMaxEthIn() public {
        vm.prank(alice);
        vm.expectRevert(bytes("over maxEthIn"));
        shop.buyETH{value: 0.06 ether}(0);
    }

    function test_buyETH_revertsOnSlippage() public {
        vm.prank(alice);
        vm.expectRevert(bytes("slippage"));
        shop.buyETH{value: 0.01 ether}(11e18);
    }

    // ------------------------------------------------------------
    // SELL ETH (now burns BEFORE payout)
    // ------------------------------------------------------------

    function _buyForAlice(uint256 ethAmount) internal {
        vm.prank(alice);
        shop.buyETH{value: ethAmount}(0);
    }

    function test_sellToETH_paysEthBack_andBurnsSupply() public {
        // Prefund shop with ETH so it can pay out sells
        vm.deal(address(shop), 1 ether);

        _buyForAlice(0.01 ether);
        uint256 gen = token.balanceOf(alice);
        assertEq(gen, 10e18);

        uint256 supplyBefore = token.totalSupply();

        vm.prank(alice);
        token.approve(address(shop), gen);

        uint256 aliceEthBefore = alice.balance;

        vm.prank(alice);
        shop.sellToETH(gen, 0.01 ether);

        // Alice got ETH back
        assertEq(alice.balance, aliceEthBefore + 0.01 ether);

        // Alice GEN is gone
        assertEq(token.balanceOf(alice), 0);

        // Total supply decreased (burn happened)
        assertEq(token.totalSupply(), supplyBefore - gen);
    }

    function test_sellToETH_revertsIfNoAllowance() public {
        vm.deal(address(shop), 1 ether);
        _buyForAlice(0.01 ether);

        uint256 gen = token.balanceOf(alice);

        vm.prank(alice);
        vm.expectRevert();
        shop.sellToETH(gen, 0);
    }

    function test_sellToETH_revertsIfNoLiquidity() public {
        _buyForAlice(0.01 ether);

        uint256 gen = token.balanceOf(alice);

        vm.prank(alice);
        token.approve(address(shop), gen);

        vm.deal(address(shop), 0);

        vm.prank(alice);
        vm.expectRevert(bytes("no liquidity"));
        shop.sellToETH(gen, 0);
    }

    function test_sellToETH_revertsIfOverMaxGenIn() public {
        vm.deal(address(shop), 1 ether);
        _buyForAlice(0.01 ether);

        uint256 gen = token.balanceOf(alice);

        vm.prank(alice);
        token.approve(address(shop), gen);

        shop.setMaxGenIn(5e18);

        vm.prank(alice);
        vm.expectRevert(bytes("over maxGenIn"));
        shop.sellToETH(gen, 0);
    }

    function test_sellToETH_revertsOnSlippage() public {
        vm.deal(address(shop), 1 ether);
        _buyForAlice(0.01 ether);

        uint256 gen = token.balanceOf(alice);

        vm.prank(alice);
        token.approve(address(shop), gen);

        vm.prank(alice);
        vm.expectRevert(bytes("slippage"));
        shop.sellToETH(gen, 0.02 ether);
    }

    // ------------------------------------------------------------
    // BUY/SELL USDT
    // ------------------------------------------------------------

    function test_getQuoteBuyToken_usdtDecimalsNormalization() public view {
        // 10 USDT => 20 GEN
        uint256 genOut = shop.getQuoteBuyToken(address(usdt), 10 * 1e6);
        assertEq(genOut, 20e18);
    }

    function test_buyToken_usdt_mintsGen() public {
        vm.prank(alice);
        usdt.approve(address(shop), 10 * 1e6);

        vm.prank(alice);
        shop.buyToken(address(usdt), 10 * 1e6, 20e18);

        assertEq(token.balanceOf(alice), 20e18);
        assertEq(usdt.balanceOf(address(shop)), 10 * 1e6);
    }

    function test_sellToToken_usdt_paysOut_andBurnsSupply() public {
        // Buy GEN first: shop receives 10 USDT
        vm.prank(alice);
        usdt.approve(address(shop), 10 * 1e6);

        vm.prank(alice);
        shop.buyToken(address(usdt), 10 * 1e6, 0);

        uint256 gen = token.balanceOf(alice);
        assertEq(gen, 20e18);

        uint256 supplyBefore = token.totalSupply();

        vm.prank(alice);
        token.approve(address(shop), gen);

        uint256 aliceUsdtBefore = usdt.balanceOf(alice);

        // Sell 20 GEN => 10 USDT out (rate 2 GEN/USDT)
        vm.prank(alice);
        shop.sellToToken(address(usdt), gen, 10 * 1e6);

        assertEq(usdt.balanceOf(alice), aliceUsdtBefore + 10 * 1e6);

        // Burn happened
        assertEq(token.totalSupply(), supplyBefore - gen);
    }

    function test_sellToToken_revertsIfNoLiquidity() public {
        // Buy 20 GEN using 10 USDT (shop ends with 10 USDT)
        vm.prank(alice);
        usdt.approve(address(shop), 10 * 1e6);

        vm.prank(alice);
        shop.buyToken(address(usdt), 10 * 1e6, 0);

        uint256 gen = token.balanceOf(alice);
        vm.prank(alice);
        token.approve(address(shop), gen);

        // Change SELL rate so payout needs MORE USDT than shop has
        // sellRate = 1 GEN per 1 USDT => 20 GEN -> 20 USDT out, but shop only has 10
        shop.setRates(address(usdt), 2e18, 1e18);

        vm.prank(alice);
        vm.expectRevert(bytes("no liquidity"));
        shop.sellToToken(address(usdt), gen, 0);
    }

    // ------------------------------------------------------------
    // Events (same shape)
    // ------------------------------------------------------------

    function test_buyETH_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit TokenShop.Bought(alice, address(0), 0.01 ether, 10e18);

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(10e18);
    }
}
