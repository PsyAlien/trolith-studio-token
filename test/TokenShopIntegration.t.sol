// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import { TokenShop } from "../src/TokenShop.sol";
import { ITRI } from "../src/interfaces/ITRI.sol";
import { ITaxProcessor } from "../src/interfaces/ITaxProcessor.sol";
import { ERC20 } from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import { AccessControl } from "openzeppelin-contracts/contracts/access/AccessControl.sol";

// -------- Mock TRI (matches Masha's TRI interface) --------
contract MockTRI is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor() ERC20("Triolith Token", "TRI") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }
}

// -------- Mock TaxProcessor (mimics Masha's TaxProcessor) --------
contract MockTaxProcessor {
    struct TaxEvent {
        address user;
        int256 gainOrLossSEK;
        string metadata;
        uint256 timestamp;
    }

    TaxEvent[] public events;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Simplified: no access control, just logs events
    function logTaxEvent(address user, int256 gainOrLossSEK, string calldata metadata) external {
        events.push(TaxEvent({
            user: user,
            gainOrLossSEK: gainOrLossSEK,
            metadata: metadata,
            timestamp: block.timestamp
        }));
    }

    function eventCount() external view returns (uint256) {
        return events.length;
    }

    function getEvent(uint256 index) external view returns (
        address user,
        int256 gainOrLossSEK,
        string memory metadata,
        uint256 timestamp
    ) {
        TaxEvent storage e = events[index];
        return (e.user, e.gainOrLossSEK, e.metadata, e.timestamp);
    }
}

// -------- Mock USDT (6 decimals) --------
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ================================================================
// TAX INTEGRATION TESTS
//
// These tests cover the integration between TokenShop and
// Masha's TaxProcessor contract. They verify:
//   - setTaxProcessor admin function
//   - Tax events logged on buy/sell (all 4 trade functions)
//   - Tax metadata format
//   - gainOrLossSEK is always 0 (backend calculates real value)
//   - Shop works normally without TaxProcessor connected
//   - TaxProcessorSet event emission
// ================================================================
contract TokenShopIntegrationTest is Test {
    MockTRI token;
    TokenShop shop;
    MockTaxProcessor taxProcessor;
    MockUSDT usdt;

    address admin = address(this);
    address alice = address(0xA11CE);

    uint256 constant MAX_ETH_IN = 1 ether;
    uint256 constant MAX_GEN_IN = 1000e18;
    uint256 constant BUY_RATE_ETH = 1000e18;   // 1 ETH = 1000 GEN
    uint256 constant SELL_RATE_ETH = 1000e18;

    event TaxProcessorSet(address indexed taxProcessor);

    function setUp() public {
        // Deploy TRI
        token = new MockTRI();

        // Deploy TokenShop
        shop = new TokenShop(
            ITRI(address(token)),
            MAX_ETH_IN,
            MAX_GEN_IN,
            BUY_RATE_ETH,
            SELL_RATE_ETH
        );

        // Grant shop mint/burn roles
        token.grantRole(token.MINTER_ROLE(), address(shop));
        token.grantRole(token.BURNER_ROLE(), address(shop));

        // Deploy TaxProcessor
        taxProcessor = new MockTaxProcessor();

        // Deploy and configure USDT
        usdt = new MockUSDT();
        shop.setSupportedToken(address(usdt), true);
        shop.setAssetDecimals(address(usdt), 6);
        shop.setRates(address(usdt), 2e18, 2e18); // 1 USDT = 2 GEN

        // Fund alice
        vm.deal(alice, 10 ether);
        usdt.mint(alice, 1000e6);
    }

    // ================================================================
    // 1. SET TAX PROCESSOR
    // ================================================================

    function test_setTaxProcessor_byOwner() public {
        shop.setTaxProcessor(address(taxProcessor));
        assertEq(address(shop.taxProcessor()), address(taxProcessor));
    }

    function test_setTaxProcessor_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit TaxProcessorSet(address(taxProcessor));

        shop.setTaxProcessor(address(taxProcessor));
    }

    function test_setTaxProcessor_toZero_disconnects() public {
        shop.setTaxProcessor(address(taxProcessor));
        assertEq(address(shop.taxProcessor()), address(taxProcessor));

        shop.setTaxProcessor(address(0));
        assertEq(address(shop.taxProcessor()), address(0));
    }

    function test_setTaxProcessor_nonOwner_reverts() public {
        vm.expectRevert();
        vm.prank(alice);
        shop.setTaxProcessor(address(taxProcessor));
    }

    // ================================================================
    // 2. TAX LOGGING ON BUY ETH
    // ================================================================

    function test_buyETH_logsTaxEvent() public {
        shop.setTaxProcessor(address(taxProcessor));

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        assertEq(taxProcessor.eventCount(), 1);

        (address user, int256 gainOrLoss, string memory metadata, ) = taxProcessor.getEvent(0);
        assertEq(user, alice);
        assertEq(gainOrLoss, 0); // Always 0 — backend calculates real SEK
        assertGt(bytes(metadata).length, 0); // Metadata is not empty
    }

    function test_buyETH_taxMetadata_containsBUY() public {
        shop.setTaxProcessor(address(taxProcessor));

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        (, , string memory metadata, ) = taxProcessor.getEvent(0);

        // Metadata should start with "BUY:"
        bytes memory metaBytes = bytes(metadata);
        assertEq(metaBytes[0], "B");
        assertEq(metaBytes[1], "U");
        assertEq(metaBytes[2], "Y");
    }

    // ================================================================
    // 3. TAX LOGGING ON BUY TOKEN (ERC-20)
    // ================================================================

    function test_buyToken_logsTaxEvent() public {
        shop.setTaxProcessor(address(taxProcessor));

        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();

        assertEq(taxProcessor.eventCount(), 1);

        (address user, int256 gainOrLoss, , ) = taxProcessor.getEvent(0);
        assertEq(user, alice);
        assertEq(gainOrLoss, 0);
    }

    // ================================================================
    // 4. TAX LOGGING ON SELL TO ETH
    // ================================================================

    function test_sellToETH_logsTaxEvent() public {
        shop.setTaxProcessor(address(taxProcessor));
        vm.deal(address(shop), 1 ether);

        // Buy first
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        assertEq(taxProcessor.eventCount(), 1); // Buy event

        // Sell
        vm.startPrank(alice);
        token.approve(address(shop), 10e18);
        shop.sellToETH(10e18, 0);
        vm.stopPrank();

        assertEq(taxProcessor.eventCount(), 2); // Buy + Sell

        (address user, , string memory metadata, ) = taxProcessor.getEvent(1);
        assertEq(user, alice);
        // Metadata should start with "SELL:"
        bytes memory metaBytes = bytes(metadata);
        assertEq(metaBytes[0], "S");
        assertEq(metaBytes[1], "E");
        assertEq(metaBytes[2], "L");
        assertEq(metaBytes[3], "L");
    }

    // ================================================================
    // 5. TAX LOGGING ON SELL TO TOKEN (ERC-20)
    // ================================================================

    function test_sellToToken_logsTaxEvent() public {
        shop.setTaxProcessor(address(taxProcessor));

        // Buy first with USDT
        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();

        // Add liquidity for sell payout
        usdt.mint(address(shop), 500e6);

        assertEq(taxProcessor.eventCount(), 1); // Buy event

        // Sell
        vm.startPrank(alice);
        token.approve(address(shop), 100e18);
        shop.sellToToken(address(usdt), 50e18, 0);
        vm.stopPrank();

        assertEq(taxProcessor.eventCount(), 2); // Buy + Sell

        (address user, int256 gainOrLoss, , ) = taxProcessor.getEvent(1);
        assertEq(user, alice);
        assertEq(gainOrLoss, 0);
    }

    // ================================================================
    // 6. NO TAX PROCESSOR — SHOP STILL WORKS
    // ================================================================

    function test_buyETH_worksWithoutTaxProcessor() public {
        // taxProcessor is NOT set (default address(0))
        assertEq(address(shop.taxProcessor()), address(0));

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        assertEq(token.balanceOf(alice), 10e18);
    }

    function test_sellToETH_worksWithoutTaxProcessor() public {
        assertEq(address(shop.taxProcessor()), address(0));
        vm.deal(address(shop), 1 ether);

        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        vm.startPrank(alice);
        token.approve(address(shop), 10e18);
        shop.sellToETH(10e18, 0);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 0);
    }

    function test_buyToken_worksWithoutTaxProcessor() public {
        assertEq(address(shop.taxProcessor()), address(0));

        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 100e18);
    }

    function test_sellToToken_worksWithoutTaxProcessor() public {
        assertEq(address(shop.taxProcessor()), address(0));

        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();

        usdt.mint(address(shop), 500e6);

        vm.startPrank(alice);
        token.approve(address(shop), 100e18);
        shop.sellToToken(address(usdt), 50e18, 0);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 50e18);
    }

    // ================================================================
    // 7. DISCONNECT TAX PROCESSOR — STOPS LOGGING
    // ================================================================

    function test_disconnectTaxProcessor_stopsLogging() public {
        shop.setTaxProcessor(address(taxProcessor));

        // Buy with tax logging active
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);
        assertEq(taxProcessor.eventCount(), 1);

        // Disconnect
        shop.setTaxProcessor(address(0));

        // Buy again — no new tax event
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);
        assertEq(taxProcessor.eventCount(), 1); // Still 1, not 2
    }

    // ================================================================
    // 8. MULTIPLE TRADES — SEQUENTIAL TAX EVENTS
    // ================================================================

    function test_multipleTrades_logMultipleTaxEvents() public {
        shop.setTaxProcessor(address(taxProcessor));
        vm.deal(address(shop), 5 ether);

        // Trade 1: Buy ETH
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        // Trade 2: Buy ETH again
        vm.prank(alice);
        shop.buyETH{value: 0.02 ether}(0);

        // Trade 3: Sell ETH
        vm.startPrank(alice);
        token.approve(address(shop), 30e18);
        shop.sellToETH(10e18, 0);
        vm.stopPrank();

        // All 3 trades should be logged
        assertEq(taxProcessor.eventCount(), 3);

        // Verify each event has the correct user
        for (uint256 i = 0; i < 3; i++) {
            (address user, , , ) = taxProcessor.getEvent(i);
            assertEq(user, alice);
        }
    }

    // ================================================================
    // 9. GAIN OR LOSS IS ALWAYS ZERO (OPTION C)
    // ================================================================

    function test_allTaxEvents_haveZeroGainOrLoss() public {
        shop.setTaxProcessor(address(taxProcessor));
        vm.deal(address(shop), 5 ether);
        usdt.mint(address(shop), 500e6);

        // Buy ETH
        vm.prank(alice);
        shop.buyETH{value: 0.01 ether}(0);

        // Buy USDT
        vm.startPrank(alice);
        usdt.approve(address(shop), 50e6);
        shop.buyToken(address(usdt), 50e6, 0);
        vm.stopPrank();

        // Sell ETH
        vm.startPrank(alice);
        token.approve(address(shop), 110e18);
        shop.sellToETH(10e18, 0);
        vm.stopPrank();

        // Sell USDT
        vm.prank(alice);
        shop.sellToToken(address(usdt), 50e18, 0);

        // All 4 events should have gainOrLossSEK = 0
        assertEq(taxProcessor.eventCount(), 4);
        for (uint256 i = 0; i < 4; i++) {
            (, int256 gainOrLoss, , ) = taxProcessor.getEvent(i);
            assertEq(gainOrLoss, 0, "gainOrLossSEK must be 0 for all events");
        }
    }
}
