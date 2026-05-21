// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/*
 * ███████████████████████████████████████████████████████████████████████████
 *
 *   BtcPriceOracle — canonical Somnia Agents smoke test
 *
 *   This contract is intentionally minimal. Its purpose is to verify that the
 *   entire Somnia Agents pipeline works end-to-end from this deployment
 *   environment:
 *
 *     1. createRequest deposit math (floor + perAgentPrice × subcommitteeSize)
 *     2. Callback gating (msg.sender == platform, requestId tracked)
 *     3. Status handling (Success / Failed / TimedOut)
 *     4. receive() so platform rebates land cleanly
 *
 *   It is NOT part of the Drip product. It is checked in as living
 *   documentation of the canonical pattern. Every other agent invocation
 *   in DripPolicies follows this exact shape.
 *
 *   Source: skills/skill-agents.md — "Solidity snippet — canonical first
 *   integration" section. Adapted to use the project's shared interfaces in
 *   contracts/interfaces/ rather than re-declaring them inline.
 *
 *   Reading first: skills/skill-agents.md (deposit formula, status handling).
 *
 * ███████████████████████████████████████████████████████████████████████████
 */

import {
    IAgentRequester,
    IAgentRequesterHandler,
    Response,
    Request,
    ResponseStatus
} from "../interfaces/IAgentRequester.sol";
import {IJsonApiAgent} from "../interfaces/IJsonApiAgent.sol";

contract BtcPriceOracle is IAgentRequesterHandler {
    // ─────────────────────────────────────────────────────────────────────
    //  Constants — verified in skills/skill-agents.md
    // ─────────────────────────────────────────────────────────────────────

    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant PRICE_PER_AGENT = 0.03 ether;

    // ─────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────

    IAgentRequester public immutable platform;

    /// @notice Latest BTC/USD price (8 decimals — set by callback).
    uint256 public latestPrice;

    /// @notice Most recent requestId — useful for receipt URL lookup.
    uint256 public lastRequestId;

    /// @notice Last finalised status — surfaced for the smoke test script
    ///         so it can distinguish Success / Failed / TimedOut without
    ///         having to subscribe to events.
    ResponseStatus public lastStatus;

    /// @notice Pending-request gating (rule #3 from skill-agents.md).
    mapping(uint256 requestId => bool) public pendingRequests;

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    event PriceRequested(uint256 indexed requestId, uint256 deposit);
    event PriceReceived(uint256 indexed requestId, uint256 price);
    event RequestFailed(uint256 indexed requestId);
    event RequestTimedOut(uint256 indexed requestId);

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor(address platform_) {
        platform = IAgentRequester(platform_);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Request
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Request a fresh BTC/USD price from the JSON API agent.
    /// @dev    Caller must send `getRequestDeposit() + PRICE_PER_AGENT *
    ///         SUBCOMMITTEE_SIZE`. The convenience constant is 0.12 STT.
    function requestBitcoinPrice() external payable returns (uint256 requestId) {
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector,
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
            "bitcoin.usd",
            uint8(8)
        );

        uint256 deposit = platform.getRequestDeposit()
                       + PRICE_PER_AGENT * SUBCOMMITTEE_SIZE;
        require(msg.value >= deposit, "Underfunded: send floor + 0.03 * 3");

        requestId = platform.createRequest{value: deposit}(
            JSON_API_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );

        pendingRequests[requestId] = true;
        lastRequestId = requestId;
        emit PriceRequested(requestId, deposit);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Callback
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Platform invokes this when consensus is reached (or failure).
    /// @dev    Rule #3: gate the callback. Rule #4: handle every status.
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) external override {
        require(msg.sender == address(platform), "Only platform");
        require(pendingRequests[requestId], "Unknown request");
        delete pendingRequests[requestId];

        lastStatus = status;

        if (status == ResponseStatus.Success && responses.length > 0) {
            latestPrice = abi.decode(responses[0].result, (uint256));
            emit PriceReceived(requestId, latestPrice);
        } else if (status == ResponseStatus.Failed) {
            emit RequestFailed(requestId);
        } else if (status == ResponseStatus.TimedOut) {
            emit RequestTimedOut(requestId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  receive — rule #2: accept platform rebates on finalisation
    // ─────────────────────────────────────────────────────────────────────

    receive() external payable {}
}
