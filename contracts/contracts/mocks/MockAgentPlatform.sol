// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/*
 * MockAgentPlatform — test stand-in for the Somnia Agents platform contract.
 *
 * Accepts createRequest, assigns a sequential requestId, and stores the
 * pending request. Tests then call simulateCallback(requestId, status,
 * result) to invoke the requester's callback with synthesized Response[]
 * and Request structs. This lets us exercise DripPolicies' two-agent chain
 * without real agent infrastructure or STT cost.
 *
 * Differences from the real platform that tests should be aware of:
 *   - getRequestDeposit() returns a fixed floor (0.03 ether) regardless of
 *     network state. Real platform may vary.
 *   - No subcommittee election; simulateCallback dictates the result.
 *   - No deposit refund / rebate. Funds stay in this contract.
 *   - getRequest() returns the stored Request (real platform reverts after
 *     finalisation, per skill-agents.md).
 */

import {
    IAgentRequester,
    Response,
    Request,
    ResponseStatus,
    ConsensusType
} from "../interfaces/IAgentRequester.sol";

/// @dev Interface the handler implements (matches IAgentRequesterHandler).
interface IHandlerCallback {
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external;
}

contract MockAgentPlatform is IAgentRequester {
    uint256 public constant FLOOR_DEPOSIT = 0.03 ether;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;

    struct Pending {
        address callbackAddress;
        bytes4  callbackSelector;
        uint256 agentId;
        bytes   payload;
        uint256 deposit;
        bool    finalised;
    }

    uint256 public nextRequestId = 1;
    mapping(uint256 => Pending) public pending;
    mapping(uint256 => Request) private _stored;

    event MockRequestCreated(uint256 indexed requestId, uint256 indexed agentId, address callbackAddress, uint256 deposit);
    event MockCallbackInvoked(uint256 indexed requestId, ResponseStatus status);

    // ─────────────────────────────────────────────────────────────────────
    //  IAgentRequester
    // ─────────────────────────────────────────────────────────────────────

    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable override returns (uint256 requestId) {
        requestId = nextRequestId++;
        pending[requestId] = Pending({
            callbackAddress:  callbackAddress,
            callbackSelector: callbackSelector,
            agentId:          agentId,
            payload:          payload,
            deposit:          msg.value,
            finalised:        false
        });

        // Cache a Request struct we can hand back later.
        Request storage r = _stored[requestId];
        r.id               = requestId;
        r.requester        = msg.sender;
        r.callbackAddress  = callbackAddress;
        r.callbackSelector = callbackSelector;
        r.threshold        = 2; // majority of 3
        r.createdAt        = block.timestamp;
        r.deadline         = block.timestamp + 600;
        r.status           = ResponseStatus.Pending;
        r.consensusType    = ConsensusType.Majority;
        r.remainingBudget  = msg.value;
        r.perAgentBudget   = (msg.value - FLOOR_DEPOSIT) / SUBCOMMITTEE_SIZE;

        emit MockRequestCreated(requestId, agentId, callbackAddress, msg.value);
    }

    function getRequestDeposit() external pure override returns (uint256) {
        return FLOOR_DEPOSIT;
    }

    function getSubcommitteeSize() external pure override returns (uint256) {
        return SUBCOMMITTEE_SIZE;
    }

    function getRequest(uint256 requestId) external view override returns (Request memory) {
        return _stored[requestId];
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Test helper — simulate the validator subcommittee returning a result
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Invoke the requester's callback with a synthesized response.
    /// @param requestId  The request to finalise.
    /// @param status     ResponseStatus the subcommittee would have agreed on.
    /// @param resultBytes The ABI-encoded result of the agent invocation
    ///                   (e.g., `abi.encode(string("active"))` for an
    ///                   inferString response).
    function simulateCallback(
        uint256 requestId,
        ResponseStatus status,
        bytes calldata resultBytes
    ) external {
        Pending storage p = pending[requestId];
        require(p.callbackAddress != address(0), "MockPlatform: unknown request");
        require(!p.finalised, "MockPlatform: already finalised");
        p.finalised = true;

        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator:     address(uint160(uint256(keccak256(abi.encode("v1", requestId))))),
            result:        resultBytes,
            status:        status,
            receipt:       0,
            timestamp:     block.timestamp,
            executionCost: 0
        });

        Request memory details = _stored[requestId];
        details.status = status;

        emit MockCallbackInvoked(requestId, status);

        // Call the handler exactly as the real platform would.
        IHandlerCallback(p.callbackAddress).handleResponse(
            requestId,
            responses,
            status,
            details
        );
    }

    // accept rebates / value
    receive() external payable {}
}
