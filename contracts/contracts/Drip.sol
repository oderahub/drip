// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/*
 * ███████████████████████████████████████████████████████████████████████████
 *
 *   Drip — agentic streaming protocol on Somnia
 *
 *   This is the streaming primitive. It manages stream lifecycle, balance
 *   accounting, and the reactivity handler hook. The agent-control logic
 *   lives in DripPolicies.sol — this contract is intentionally policy-blind
 *   so the primitive can be reused with different policy modules.
 *
 *   READ FIRST: skills/skill-streaming.md and skills/skill-reactivity.md
 *   before editing this file. Drip's invariants and the reactivity wiring
 *   are documented there.
 *
 * ███████████████████████████████████████████████████████████████████████████
 */

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

contract Drip is SomniaEventHandler {
    // ─────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────

    enum StreamStatus {
        None,       // 0
        Active,     // 1
        Paused,     // 2
        Cancelled,  // 3
        Completed   // 4
    }

    struct Stream {
        address sender;
        address recipient;
        uint256 totalAmount;
        uint256 ratePerSecond;
        uint256 startTime;
        uint256 endTime;
        uint256 withdrawn;
        uint256 pausedAt;
        uint256 pausedAccumulated;
        StreamStatus status;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Address of the DripPolicies contract authorised to pause/resume.
    /// @dev    Set by the deployer at deploy time. Only the policy contract
    ///         (or the stream sender, for cancellation) can change stream state.
    address public policies;

    /// @notice Auto-incrementing stream ID. Stream 0 is reserved as "unset".
    uint256 public nextStreamId;

    /// @notice The underlying stream records, keyed by stream ID.
    mapping(uint256 streamId => Stream) public streams;

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 totalAmount,
        uint256 ratePerSecond,
        uint256 startTime,
        uint256 endTime
    );
    event StreamPaused(uint256 indexed streamId, string reason);
    event StreamResumed(uint256 indexed streamId);
    event StreamCancelled(uint256 indexed streamId);
    event StreamCompleted(uint256 indexed streamId);
    event Withdrawal(uint256 indexed streamId, address indexed recipient, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    error NotPolicies();
    error NotSender();
    error NotRecipient();
    error NotAuthorized();
    error InvalidStream();
    error InvalidStatus(StreamStatus current, StreamStatus required);
    error InvalidDuration();
    error InvalidRecipient();
    error InsufficientValue(uint256 provided, uint256 required);
    error InsufficientBalance();
    error NothingToWithdraw();

    // ─────────────────────────────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyPolicies() {
        if (msg.sender != policies) revert NotPolicies();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Deploys the Drip contract.
    /// @dev    Must be deployed with msg.value ≥ 32 STT for the contract to
    ///         later subscribe to Reactivity. The deploy script funds the
    ///         contract with 35 STT to give it a small operational buffer.
    ///         The `policies` address can be set in a separate transaction
    ///         after deploy via `setPolicies`, OR passed here if available.
    constructor() payable {
        nextStreamId = 1;
    }

    /// @notice One-time setter for the DripPolicies contract address.
    /// @dev    Can only be called once (when `policies` is the zero address).
    function setPolicies(address policies_) external {
        if (policies != address(0)) revert NotAuthorized();
        policies = policies_;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Stream lifecycle — TODO: implement
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Creates a new payment stream.
    /// @param recipient The address that will receive the streamed funds.
    /// @param durationSeconds How long the stream should run.
    /// @return streamId The ID of the newly created stream.
    /// @dev    msg.value is the total amount to stream over the duration.
    ///         Reverts if recipient is zero, duration is zero, or msg.value is zero.
    function createStream(
        address recipient,
        uint256 durationSeconds
    ) external payable returns (uint256 streamId) {
        // TODO: validate inputs (recipient != 0, durationSeconds > 0, msg.value > 0)
        // TODO: compute ratePerSecond = msg.value / durationSeconds
        // TODO: write the Stream struct
        // TODO: emit StreamCreated
        // TODO: return the new stream ID
        revert("TODO: implement createStream");
    }

    /// @notice Withdraws available balance to the recipient.
    /// @param streamId The stream to withdraw from.
    /// @param amount The amount to withdraw. Pass type(uint256).max to withdraw all available.
    function withdraw(uint256 streamId, uint256 amount) external {
        // TODO: revert if not recipient
        // TODO: compute available balance using _availableBalance
        // TODO: cap amount at available
        // TODO: transfer to recipient
        // TODO: update withdrawn
        // TODO: emit Withdrawal
        // TODO: if stream is past endTime and all withdrawn, mark Completed
        revert("TODO: implement withdraw");
    }

    /// @notice Pauses a stream. Only callable by the DripPolicies contract.
    /// @param streamId The stream to pause.
    /// @param reason A short human-readable reason (for event log / UI).
    function pause(uint256 streamId, string calldata reason) external onlyPolicies {
        // TODO: revert if status != Active
        // TODO: record pausedAt = block.timestamp
        // TODO: set status to Paused
        // TODO: emit StreamPaused
        revert("TODO: implement pause");
    }

    /// @notice Resumes a paused stream. Only callable by the DripPolicies contract.
    /// @param streamId The stream to resume.
    function resume(uint256 streamId) external onlyPolicies {
        // TODO: revert if status != Paused
        // TODO: pausedAccumulated += (block.timestamp - pausedAt)
        // TODO: clear pausedAt
        // TODO: set status to Active
        // TODO: emit StreamResumed
        revert("TODO: implement resume");
    }

    /// @notice Cancels a stream. Only callable by the original sender.
    /// @dev    Refunds the unstreamed portion to the sender.
    /// @param streamId The stream to cancel.
    function cancel(uint256 streamId) external {
        // TODO: revert if not sender
        // TODO: revert if status is not Active or Paused
        // TODO: compute available balance for recipient
        // TODO: pay recipient the available balance
        // TODO: refund remainder to sender
        // TODO: set status to Cancelled
        // TODO: emit StreamCancelled
        revert("TODO: implement cancel");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views — TODO: implement
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns the amount the recipient can currently withdraw.
    function availableBalance(uint256 streamId) external view returns (uint256) {
        return _availableBalance(streamId);
    }

    /// @notice Returns true if the contract is solvent across all active streams.
    function isSolvent() external view returns (bool) {
        // TODO: sum up all unclaimed balances across active streams
        // TODO: compare to address(this).balance - 32 ether (reactivity reserve)
        return true; // placeholder
    }

    /// @dev Internal balance calculation. Used by withdraw, cancel, views.
    function _availableBalance(uint256 streamId) internal view returns (uint256) {
        // TODO: implement Sablier-style math with paused-time exclusion
        // See skills/skill-streaming.md "Stream math" section.
        streamId; // silence unused-var warning
        return 0; // placeholder
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Reactivity handler hook — TODO: implement
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Called by the reactivity precompile when a scheduled policy
    ///         check fires for a stream.
    /// @dev    Inherited from SomniaEventHandler. The base contract verifies
    ///         msg.sender == 0x0100 before reaching this function.
    function _onEvent(
        address /* emitter */,
        bytes32[] calldata /* eventTopics */,
        bytes calldata /* data */
    ) internal override {
        // TODO: decode the firing subscription ID
        // TODO: look up which stream it belongs to (subscriptionToStream mapping)
        // TODO: delegate to DripPolicies.startPolicyCheck(streamId)
        revert("TODO: implement _onEvent");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Receive — required for agent rebates and stream funding
    // ─────────────────────────────────────────────────────────────────────

    receive() external payable {}
}
