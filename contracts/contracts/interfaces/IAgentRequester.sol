// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IAgentRequester
/// @notice Interface for the Somnia Agents platform contract.
/// @dev IMPORTANT: this is the CORRECTED interface. The official examples
///      repo (emrestay/somnia-agents-examples) ships an `ISomniaAgents.sol`
///      that is missing the `perAgentBudget` field on the `Request` struct.
///      Using the examples-repo version causes silent ABI decoding issues.
///      The struct below matches the actual platform contract and is the one
///      documented in docs.somnia.network/agents/invoking-agents/from-solidity.

enum ConsensusType {
    Majority,
    Threshold
}

enum ResponseStatus {
    None,      // 0 — uninitialized
    Pending,   // 1 — awaiting responses
    Success,   // 2 — consensus reached normally
    Failed,    // 3 — validators reported failure (also returned for under-funded requests)
    TimedOut   // 4 — request timed out
}

struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

/// @dev The Request struct as it exists on the platform contract.
///      The `perAgentBudget` field is intentionally included here even though
///      the official examples repo's ISomniaAgents.sol omits it.
struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;
    uint256 threshold;
    uint256 createdAt;
    uint256 deadline;
    ResponseStatus status;
    ConsensusType consensusType;
    uint256 remainingBudget;   // escrow remaining at any point in the lifecycle
    uint256 perAgentBudget;    // max each elected member can claim (set at creation)
}

interface IAgentRequester {
    /// @notice Creates a new agent invocation request.
    /// @param agentId The ID of the target agent.
    /// @param callbackAddress Contract that will receive the response callback.
    /// @param callbackSelector Function selector to invoke on callback.
    /// @param payload ABI-encoded payload to send to the agent.
    /// @return requestId The unique ID of the created request.
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    /// @notice Returns the operations-reserve floor amount.
    /// @dev WARNING: this is NOT the practical deposit. Always add
    ///      `pricePerAgent × subcommitteeSize` on top, or your request
    ///      will fail with status=3 (Failed) — runners skip requests where
    ///      perAgentBudget = 0.
    function getRequestDeposit() external view returns (uint256);

    /// @notice Returns the default subcommittee size (currently 3).
    function getSubcommitteeSize() external view returns (uint256);

    /// @notice Returns the details of a request by ID.
    function getRequest(uint256 requestId) external view returns (Request memory);
}

/// @notice Interface that any callback-receiving contract must implement.
interface IAgentRequesterHandler {
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external;
}
