// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/*
 * ███████████████████████████████████████████████████████████████████████████
 *
 *   AggregatorSmoketest — validates fetchString empty-selector semantics
 *
 *   Milestone 4 Step B. Before DripPolicies on testnet depends on the JSON
 *   API Request agent returning the full body of our GitHub activity
 *   aggregator, this contract validates the assumption with a controlled
 *   call.
 *
 *   Open question being answered: does
 *     IJsonApiAgent.fetchString(url, "")
 *   return the entire response body as a string, or does an empty selector
 *   behave specially (e.g., error, return null, return "{}")?
 *
 *   Process:
 *     1. Deploy this contract on testnet with the platform address.
 *     2. Call probe(url, selector) with the aggregator URL + "".
 *     3. Wait for callback. The contract stores the returned string in
 *        `lastBody` and exposes it via the `lastBody()` view.
 *     4. Inspect the receipts UI for token usage + per-validator agreement.
 *
 *   READ FIRST: skills/skill-agents.md (deposit math, callback gating).
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

contract AggregatorSmoketest is IAgentRequesterHandler {
    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant JSON_API_PRICE_PER_AGENT = 0.03 ether;

    IAgentRequester public immutable platform;

    /// @notice The most recently completed request.
    uint256 public lastRequestId;
    /// @notice Status of the most recent callback.
    ResponseStatus public lastStatus;
    /// @notice The decoded string body returned by the agent, or empty on failure.
    string public lastBody;

    mapping(uint256 requestId => bool) public pendingRequests;

    event Probed(uint256 indexed requestId, string url, string selector, uint256 deposit);
    event ProbeResult(uint256 indexed requestId, ResponseStatus status, uint256 bodyLength);

    constructor(address platform_) {
        platform = IAgentRequester(platform_);
    }

    /// @notice Issue a fetchString request and store the result.
    /// @param  url       Full URL to fetch.
    /// @param  selector  JSON path selector ("" for whole body — this is
    ///                   the assumption being tested).
    function probe(string calldata url, string calldata selector)
        external
        payable
        returns (uint256 requestId)
    {
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchString.selector,
            url,
            selector
        );

        uint256 deposit = platform.getRequestDeposit()
                       + JSON_API_PRICE_PER_AGENT * SUBCOMMITTEE_SIZE;
        require(msg.value >= deposit, "Underfunded: send floor + 0.03 * 3");

        requestId = platform.createRequest{value: deposit}(
            JSON_API_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );
        pendingRequests[requestId] = true;
        lastRequestId = requestId;
        emit Probed(requestId, url, selector, deposit);
    }

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
            lastBody = abi.decode(responses[0].result, (string));
            emit ProbeResult(requestId, status, bytes(lastBody).length);
        } else {
            lastBody = "";
            emit ProbeResult(requestId, status, 0);
        }
    }

    receive() external payable {}
}
