// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import { StudioToken } from "../src/StudioToken.sol";
import { TokenShop } from "../src/TokenShop.sol";
import { ERC20 } from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

// Mock 6-decimal token (like USDT)
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TokenShopComprehensiveTest is Test {
    StudioToken token;
    TokenShop shop;
    MockUSDT usdt;

    address admin = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant MAX_ETH_IN = 0.05 ether;
    uint256 constant MAX_GEN_IN = 50e18;
    uint256 constant BUY_RATE_ETH = 1000e18;   // 1 ETH = 1000 GEN
    uint256 constant SELL_RATE_ETH = 1000e18;

    uint256 constant BUY_RATE_USDT = 2e18;     // 1 USDT = 2 GEN
    uint256 constant SELL_RATE_USDT = 2e18;

    function setUp() public {
        // Deploy token + shop
        token = new StudioToken("Triolith Studio Token", "TST", admin);
        shop = new TokenShop(token, MAX_ETH_IN, MAX_GEN_IN, BUY_RATE_ETH, SELL_RATE_ETH);

        // Grant roles to shop
        token.grantRole(token.MINTER_ROLE(), address(shop));
        token.grantRole(token.BURNER_ROLE(), address(shop));

        // Deploy mock USDT
        usdt = new MockUSDT();

        // Configure USDT in shop
        shop.setSupportedToken(address(usdt), true);
        shop.setAssetDecimals(address(usdt), 6);
        shop.setRates(address(usdt), BUY_RATE_USDT, SELL_RATE_USDT);

        // Fund alice & bob with ETH
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        // Mint USDT to alice & bob
        usdt.mint(alice, 1000e6);  // 1000 USDT
        usdt.mint(bob, 1000e6);
    }

    // ================================================================
    // 1. FEE TESTS
    // ================================================================

    function test_buyETH_withFee() public {
        shop.setFeeBps(100); // 1% fee

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        // 0.01 ETH * 1000 rate = 10 GEN gross
        // 1% fee = 0.1 GEN fee -> 9.9 GEN net
        assertEq(token.balanceOf(alice), 9.9e18);
    }

    function test_sellETH_withFee() public {
        // First buy some GEN (no fee)
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);
        assertEq(token.balanceOf(alice), 10e18);

        // Set fee, then sell
        shop.setFeeBps(200); // 2% fee

        vm.startPrank(alice);
        token.approve(address(shop), 10e18);
        shop.sellToETH(10e18, 0);
        vm.stopPrank();

        // 10 GEN / 1000 rate = 0.01 ETH gross
        // 2% fee on ETH out = 0.0002 ETH fee -> 0.0098 ETH net
        assertEq(alice.balance, 10 ether - 0.01 ether + 0.0098 ether);
    }

    function test_feeCappedAt10Percent() public {
        vm.expectRevert();
        shop.setFeeBps(1001);
    }

    function test_zeroFeeWorks() public {
        shop.setFeeBps(0);

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);
        assertEq(token.balanceOf(alice), 10e18);
    }

    // ================================================================
    // 2. PAUSE TESTS
    // ================================================================

    function test_buyReverts_whenPaused() public {
        shop.setPaused(true);

        vm.expectRevert();
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);
    }

    function test_sellReverts_whenPaused() public {
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        shop.setPaused(true);

        vm.startPrank(alice);
        token.approve(address(shop), 10e18);
        vm.expectRevert();
        shop.sellToETH(10e18, 0);
        vm.stopPrank();
    }

    function test_adminCanStillConfigureWhenPaused() public {
        shop.setPaused(true);

        shop.setFeeBps(500);
        shop.setRates(address(0), 2000e18, 2000e18);
        shop.setMaxEthIn(1 ether);
        shop.setMaxGenIn(100e18);
    }

    function test_unpauseRestoresTrading() public {
        shop.setPaused(true);
        shop.setPaused(false);

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);
        assertEq(token.balanceOf(alice), 10e18);
    }

    // ================================================================
    // 3. LIMIT TESTS
    // ================================================================

    function test_buyETH_revertsAboveMaxEthIn() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.buyETH{value: 0.06 ether}(0);
    }

    function test_buyETH_atExactLimit() public {
        vm.prank(alice);
        shop.buyETH{value: MAX_ETH_IN}(0);
        assertEq(token.balanceOf(alice), 50e18);
    }

    function test_sellETH_revertsAboveMaxGenIn() public {
        token.grantRole(token.MINTER_ROLE(), admin);
        token.mint(alice, 100e18);

        vm.startPrank(alice);
        token.approve(address(shop), 100e18);
        vm.expectRevert();
        shop.sellToETH(51e18, 0);
        vm.stopPrank();
    }

    function test_updatedLimitsApply() public {
        shop.setMaxEthIn(1 ether);

        vm.prank(alice);
        shop.buyETH{value: 0.5 ether}(0);
        assertEq(token.balanceOf(alice), 500e18);
    }

    // ================================================================
    // 4. ERC-20 BUY/SELL TESTS (USDT with 6 decimals)
    // ================================================================

    function test_buyToken_USDT() public {
        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 100e18);
    }

    function test_sellToToken_USDT() public {
        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();

        usdt.mint(address(shop), 100e6);

        vm.startPrank(alice);
        token.approve(address(shop), 50e18);
        shop.sellToToken(address(usdt), 50e18, 0);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 50e18);
        assertEq(usdt.balanceOf(alice), 975e6);
    }

    function test_buyUnsupportedToken_reverts() public {
        MockUSDT fakeToken = new MockUSDT();
        fakeToken.mint(alice, 100e6);

        vm.startPrank(alice);
        fakeToken.approve(address(shop), 100e6);
        vm.expectRevert();
        shop.buyToken(address(fakeToken), 100e6, 0);
        vm.stopPrank();
    }

    function test_sellToUnsupportedToken_reverts() public {
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        MockUSDT fakeToken = new MockUSDT();

        vm.startPrank(alice);
        token.approve(address(shop), 10e18);
        vm.expectRevert();
        shop.sellToToken(address(fakeToken), 10e18, 0);
        vm.stopPrank();
    }

    // ================================================================
    // 5. EDGE CASE TESTS
    // ================================================================

    function test_buyETH_zeroValue_reverts() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.buyETH{value: 0}(0);
    }

    function test_sellETH_zeroAmount_reverts() public {
        vm.startPrank(alice);
        token.approve(address(shop), 0);
        vm.expectRevert();
        shop.sellToETH(0, 0);
        vm.stopPrank();
    }

    function test_sellMoreThanBalance_reverts() public {
        vm.startPrank(alice);
        token.approve(address(shop), 100e18);
        vm.expectRevert();
        shop.sellToETH(100e18, 0);
        vm.stopPrank();
    }

    // ================================================================
    // 6. SLIPPAGE REVERT TESTS
    // ================================================================

    function test_buyETH_slippageProtection() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(11e18);
    }

    function test_buyETH_exactSlippage() public {
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(10e18);
        assertEq(token.balanceOf(alice), 10e18);
    }

    function test_sellETH_slippageProtection() public {
        vm.deal(address(shop), 1 ether);

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        vm.startPrank(alice);
        token.approve(address(shop), 10e18);
        vm.expectRevert();
        shop.sellToETH(10e18, 0.02 ether);
        vm.stopPrank();
    }

    function test_buyToken_slippageProtection() public {
        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        vm.expectRevert();
        shop.buyToken(address(usdt), 50e6, 101e18);
        vm.stopPrank();
    }

    // ================================================================
    // 7. ADMIN ACCESS TESTS
    // ================================================================

    function test_nonOwner_cannotSetRates() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.setRates(address(0), 5000e18, 5000e18);
    }

    function test_nonOwner_cannotSetFee() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.setFeeBps(500);
    }

    function test_nonOwner_cannotPause() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.setPaused(true);
    }

    function test_nonOwner_cannotSetLimits() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.setMaxEthIn(1 ether);
    }

    function test_nonOwner_cannotWithdraw() public {
        vm.deal(address(shop), 1 ether);

        vm.expectRevert();
        vm.prank(alice);
        shop.withdrawETH(alice, 1 ether);
    }

    function test_nonOwner_cannotSetSupportedToken() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.setSupportedToken(address(usdt), false);
    }

    // ================================================================
    // 8. ETH WITHDRAWAL TESTS
    // ================================================================

    function test_withdrawETH_toAddress() public {
        vm.deal(address(shop), 1 ether);
        uint256 bobBefore = bob.balance;

        shop.withdrawETH(bob, 0.5 ether);

        assertEq(bob.balance, bobBefore + 0.5 ether);
        assertEq(address(shop).balance, 0.5 ether);
    }

    function test_withdrawETH_moreThanBalance_reverts() public {
        vm.deal(address(shop), 0.1 ether);

        vm.expectRevert();
        shop.withdrawETH(bob, 1 ether);
    }

    function test_withdrawETH_entireBalance() public {
        vm.deal(address(shop), 1 ether);

        shop.withdrawETH(bob, 1 ether);
        assertEq(address(shop).balance, 0);
    }

    // ================================================================
    // 9. MULTI-ASSET INTERACTION TESTS
    // ================================================================

    function test_buyETH_then_buyUSDT_then_sellETH_then_sellUSDT() public {
        usdt.mint(address(shop), 500e6);

        // Step 1: Buy 10 GEN with 0.01 ETH
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);
        assertEq(token.balanceOf(alice), 10e18);

        // Step 2: Buy 100 GEN with 50 USDT
        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 110e18);

        // Step 3: Sell 10 GEN -> ETH
        vm.startPrank(alice);
        token.approve(address(shop), 110e18);
        shop.sellToETH(10e18, 0);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 100e18);

        // Step 4: Sell 50 GEN -> USDT (within maxGenIn of 50)
        vm.prank(alice);
        shop.sellToToken(address(usdt), 50e18, 0);

        assertEq(token.balanceOf(alice), 50e18);
        assertEq(usdt.balanceOf(alice), 975e6);
    }

    function test_multiUser_economy() public {
        usdt.mint(address(shop), 500e6);

        // Raise maxGenIn so Bob can sell 100 GEN
        shop.setMaxGenIn(200e18);

        // Alice buys with ETH
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        // Bob buys with USDT
        vm.startPrank(bob);
        usdt.approve(address(shop), 100e6);
        shop.buyToken(address(usdt), 100e6, 0);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 10e18);
        assertEq(token.balanceOf(bob), 200e18);
        assertEq(token.totalSupply(), 210e18);

        // Bob sells half his GEN -> USDT
        vm.startPrank(bob);
        token.approve(address(shop), 100e18);
        shop.sellToToken(address(usdt), 100e18, 0);
        vm.stopPrank();

        assertEq(token.balanceOf(bob), 100e18);
        assertEq(token.totalSupply(), 110e18); // 210 - 100 burned
    }

    // ================================================================
    // 10. EVENT EMISSION TESTS
    // ================================================================

    event Bought(address indexed user, address indexed payAsset, uint256 amountIn, uint256 genOut);
    event Sold(address indexed user, address indexed payAsset, uint256 genIn, uint256 amountOut);

    function test_buyETH_emitsBoughtEvent() public {
        vm.expectEmit(true, true, false, true);
        emit Bought(alice, address(0), 0.01 ether, 10e18);

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);
    }

    function test_sellETH_emitsSoldEvent() public {
        vm.deal(address(shop), 1 ether);
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        // Approve FIRST, then set expectEmit right before the sell call
        vm.startPrank(alice);
        token.approve(address(shop), 10e18);

        vm.expectEmit(true, true, false, true);
        emit Sold(alice, address(0), 10e18, 0.01 ether);

        shop.sellToETH(10e18, 0);
        vm.stopPrank();
    }

    function test_buyToken_emitsBoughtEvent() public {
        // Approve FIRST, then set expectEmit right before the buy call
        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);

        vm.expectEmit(true, true, false, true);
        emit Bought(alice, address(usdt), 50e6, 100e18);

        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();
    }

    function test_sellToken_emitsSoldEvent() public {
        // Buy first
        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();
        usdt.mint(address(shop), 500e6);

        // Approve FIRST, then set expectEmit right before the sell call
        vm.startPrank(alice);
        token.approve(address(shop), 50e18);

        vm.expectEmit(true, true, false, true);
        emit Sold(alice, address(usdt), 50e18, 25e6);

        shop.sellToToken(address(usdt), 50e18, 0);
        vm.stopPrank();
    }

    // ================================================================
    // QUOTE HELPER TESTS
    // ================================================================

    function test_getQuoteBuyETH() public view {
        uint256 genOut = shop.getQuoteBuyETH(0.01 ether);
        assertEq(genOut, 10e18);
    }

    function test_getQuoteSellToETH() public view {
        uint256 ethOut = shop.getQuoteSellToETH(10e18);
        assertEq(ethOut, 0.01 ether);
    }

    function test_getQuoteBuyToken() public view {
        uint256 genOut = shop.getQuoteBuyToken(address(usdt), 50e6);
        assertEq(genOut, 100e18);
    }

    function test_getQuoteSellToToken() public view {
        uint256 usdtOut = shop.getQuoteSellToToken(address(usdt), 100e18);
        assertEq(usdtOut, 50e6);
    }

    // ================================================================
    // RATE CONFIGURATION TESTS
    // ================================================================

    function test_setRates_changesQuotes() public {
        shop.setRates(address(0), 2000e18, 2000e18);

        uint256 genOut = shop.getQuoteBuyETH(0.01 ether);
        assertEq(genOut, 20e18);
    }

    function test_setRates_perAsset() public {
        shop.setRates(address(usdt), 5e18, 5e18);

        uint256 genFromEth = shop.getQuoteBuyETH(0.01 ether);
        assertEq(genFromEth, 10e18);

        uint256 genFromUsdt = shop.getQuoteBuyToken(address(usdt), 10e6);
        assertEq(genFromUsdt, 50e18);
    }
}
