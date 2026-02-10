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

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    // Limits
    uint256 maxEthIn = 0.05 ether;
    uint256 maxGenIn = 50e18;

    // ETH rates (scaled by 1e18): 1 ETH = 1000 GEN
    uint256 initialBuyRateEth  = 1000e18;
    uint256 initialSellRateEth = 1000e18;

    function setUp() public {
        token = new StudioToken("Triolith Studio Token", "TST");

        shop = new TokenShop(
            token,
            maxEthIn,
            maxGenIn,
            initialBuyRateEth,
            initialSellRateEth
        );

        token.transferOwnership(address(shop));

        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        shop.setAllowed(alice, true);

        // Set fee to 0 by default in tests unless we change it in a specific test
        // (constructor already sets feeBps=0)

        // Deploy mock USDT
        usdt = new MockUSDT();

        // Enable USDT in shop + set decimals
        shop.setSupportedToken(address(usdt), true);
        shop.setAssetDecimals(address(usdt), 6);

        // Set USDT rates:
        // Example: 1 USDT = 2 GEN (rate = 2e18)
        // (rates are per 1 token unit normalized to 18 decimals)
        shop.setRates(address(usdt), 2e18, 2e18);

        // Give Alice 100 USDT (100 * 1e6)
        usdt.mint(alice, 100 * 1e6);
    }

    // ------------------------------------------------------------
    // PHASE 2 (rates) sanity
    // ------------------------------------------------------------

    function test_getQuoteBuyETH_matchesRate() public {
        uint256 genOut = shop.getQuoteBuyETH(0.01 ether);
        assertEq(genOut, 10e18);
    }

    function test_getQuoteSellToETH_matchesRate() public {
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
    // BUY ETH tests
    // ------------------------------------------------------------

    function test_buyETH_mintsTokens() public {
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(10e18);

        assertEq(token.balanceOf(alice), 10e18);
        assertEq(token.totalSupply(), 10e18);
    }

    function test_buyETH_revertsIfNotAllowed() public {
        vm.prank(bob);
        vm.expectRevert();
        shop.buyETH{value: 0.01 ether}(0);
    }

    function test_buyETH_revertsIfPaused() public {
        shop.setPaused(true);

        vm.prank(alice);
        vm.expectRevert();
        shop.buyETH{value: 0.01 ether}(0);
    }

    function test_buyETH_revertsIfOverMaxEthIn() public {
        vm.prank(alice);
        vm.expectRevert();
        shop.buyETH{value: 0.06 ether}(0);
    }

    function test_buyETH_revertsOnSlippage() public {
        vm.prank(alice);
        vm.expectRevert();
        shop.buyETH{value: 0.01 ether}(11e18);
    }

    // ------------------------------------------------------------
    // SELL ETH tests
    // ------------------------------------------------------------

    function _buyForAlice(uint256 ethAmount) internal {
        vm.prank(alice);
        shop.buyETH{value: ethAmount}(0);
    }

    function test_sellToETH_paysEthBack() public {
        vm.deal(address(shop), 1 ether);

        _buyForAlice(0.01 ether);

        uint256 tokens = token.balanceOf(alice);

        vm.prank(alice);
        token.approve(address(shop), tokens);

        uint256 aliceEthBefore = alice.balance;

        vm.prank(alice);
        shop.sellToETH(tokens, 0.01 ether);

        assertEq(alice.balance, aliceEthBefore + 0.01 ether);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_sellToETH_revertsIfNoAllowance() public {
        vm.deal(address(shop), 1 ether);
        _buyForAlice(0.01 ether);

        uint256 tokens = token.balanceOf(alice);

        vm.prank(alice);
        vm.expectRevert();
        shop.sellToETH(tokens, 0);
    }

    function test_sellToETH_revertsIfNoLiquidity() public {
        _buyForAlice(0.01 ether);

        uint256 tokens = token.balanceOf(alice);

        vm.prank(alice);
        token.approve(address(shop), tokens);

        vm.deal(address(shop), 0);

        vm.prank(alice);
        vm.expectRevert();
        shop.sellToETH(tokens, 0);
    }

    function test_sellToETH_revertsIfOverMaxGenIn() public {
        vm.deal(address(shop), 1 ether);
        _buyForAlice(0.01 ether);

        uint256 tokens = token.balanceOf(alice);

        vm.prank(alice);
        token.approve(address(shop), tokens);

        shop.setMaxGenIn(5e18);

        vm.prank(alice);
        vm.expectRevert();
        shop.sellToETH(tokens, 0);
    }

    function test_sellToETH_revertsOnSlippage() public {
        vm.deal(address(shop), 1 ether);
        _buyForAlice(0.01 ether);

        uint256 tokens = token.balanceOf(alice);

        vm.prank(alice);
        token.approve(address(shop), tokens);

        vm.prank(alice);
        vm.expectRevert();
        shop.sellToETH(tokens, 0.02 ether);
    }

    // ------------------------------------------------------------
    // PHASE 3 fees + withdraw (minimal checks)
    // ------------------------------------------------------------

    function test_setFeeBps_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        shop.setFeeBps(100);
    }

    function test_withdrawETH_onlyOwner() public {
        vm.deal(address(shop), 1 ether);

        vm.prank(alice);
        vm.expectRevert();
        shop.withdrawETH(alice, 0.1 ether);
    }

    function test_withdrawETH_transfersFunds() public {
        vm.deal(address(shop), 1 ether);

        uint256 beforeBal = bob.balance;
        shop.withdrawETH(bob, 0.2 ether);
        assertEq(bob.balance, beforeBal + 0.2 ether);
    }

    // ------------------------------------------------------------
    // PHASE 4: USDT support (6 decimals)
    // ------------------------------------------------------------

    function test_getQuoteBuyToken_usdtDecimalsNormalization() public {
        // 10 USDT = 10 * 1e6
        // rate = 2 GEN per 1 USDT => 20 GEN out
        uint256 genOut = shop.getQuoteBuyToken(address(usdt), 10 * 1e6);
        assertEq(genOut, 20e18);
    }

    function test_buyToken_usdt_mintsGen() public {
        // Alice approves USDT to shop
        vm.prank(alice);
        usdt.approve(address(shop), 10 * 1e6);

        // minGenOut = 20 GEN
        vm.prank(alice);
        shop.buyToken(address(usdt), 10 * 1e6, 20e18);

        assertEq(token.balanceOf(alice), 20e18);
        assertEq(usdt.balanceOf(address(shop)), 10 * 1e6);
    }

    function test_buyToken_revertsIfNoAllowance() public {
        vm.prank(alice);
        vm.expectRevert();
        shop.buyToken(address(usdt), 10 * 1e6, 0);
    }

    function test_sellToToken_usdt_paysOut() public {
        // Prefund shop with USDT so it can pay out sells
        usdt.mint(address(shop), 50 * 1e6);

        // Give Alice GEN by buying with USDT
        vm.prank(alice);
        usdt.approve(address(shop), 10 * 1e6);

        vm.prank(alice);
        shop.buyToken(address(usdt), 10 * 1e6, 0);

        uint256 gen = token.balanceOf(alice);
        assertEq(gen, 20e18);

        // Approve GEN to shop for selling
        vm.prank(alice);
        token.approve(address(shop), gen);

        uint256 aliceUsdtBefore = usdt.balanceOf(alice);

        // Sell 20 GEN at rate 2 GEN/USDT => 10 USDT out
        vm.prank(alice);
        shop.sellToToken(address(usdt), gen, 10 * 1e6);

        assertEq(usdt.balanceOf(alice), aliceUsdtBefore + 10 * 1e6);
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

        // Now change SELL rate so payout would require MORE USDT than shop has.
        // If sellRate = 1 GEN per 1 USDT, then 20 GEN -> 20 USDT out (but shop only has 10 USDT).
        shop.setRates(address(usdt), 2e18, 1e18);

        vm.prank(alice);
        vm.expectRevert(bytes("no liquidity"));
        shop.sellToToken(address(usdt), gen, 0);
    }

    // ------------------------------------------------------------
    // EVENT TESTS (updated event shape)
    // ------------------------------------------------------------

    function test_buyETH_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit TokenShop.Bought(alice, address(0), 0.01 ether, 10e18);

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(10e18);
    }

    function test_sellToETH_emitsEvent() public {
        vm.deal(address(shop), 1 ether);
        _buyForAlice(0.01 ether);

        uint256 gen = token.balanceOf(alice);

        vm.prank(alice);
        token.approve(address(shop), gen);

        vm.expectEmit(true, true, false, true);
        emit TokenShop.Sold(alice, address(0), gen, 0.01 ether);

        vm.prank(alice);
        shop.sellToETH(gen, 0.01 ether);
    }

    function test_buyToken_emitsEvent() public {
        vm.prank(alice);
        usdt.approve(address(shop), 10 * 1e6);

        vm.expectEmit(true, true, false, true);
        emit TokenShop.Bought(alice, address(usdt), 10 * 1e6, 20e18);

        vm.prank(alice);
        shop.buyToken(address(usdt), 10 * 1e6, 20e18);
    }

    function test_operatorMint_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        shop.operatorMint(alice, 1e18, keccak256("btc_deposit_1"));
    }

    function test_operatorMint_mintsAndEmits() public {
        bytes32 ref = keccak256("btc_deposit_1");

        vm.expectEmit(true, false, true, true);
        emit TokenShop.OperatorMinted(alice, 5e18, ref);

        shop.operatorMint(alice, 5e18, ref);
        assertEq(token.balanceOf(alice), 5e18);
    }

}
