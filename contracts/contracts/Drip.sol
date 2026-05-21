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
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Minimum native-token balance Drip keeps untouched for future
    ///         reactivity-subscription creation (Somnia requires 32 native
    ///         tokens at every `subscribe` call). Used by the solvency view.
    uint256 public constant REACTIVITY_RESERVE = 32 ether;

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

    /// @notice Running total of native-token obligations across non-terminal
    ///         streams. Updated on createStream / withdraw / cancel / pause-time
    ///         is not needed since pause does not change the total commitment.
    ///         This avoids O(n) iteration in isSolvent / treasuryHealth.
    uint256 public totalCommittedUnreleased;

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
    error InvalidAmount();
    error InsufficientValue(uint256 provided, uint256 required);
    error InsufficientBalance();
    error NothingToWithdraw();
    error TransferFailed();

    // ─────────────────────────────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyPolicies() {
        if (msg.sender != policies) revert NotPolicies();
        _;
    }

    modifier streamExists(uint256 streamId) {
        if (streams[streamId].status == StreamStatus.None) revert InvalidStream();
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
    //  Stream lifecycle
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Creates a new payment stream.
    /// @param recipient The address that will receive the streamed funds.
    /// @param durationSeconds How long the stream should run.
    /// @return streamId The ID of the newly created stream.
    /// @dev    msg.value is the total amount to stream over the duration.
    ///         The stream begins immediately at block.timestamp.
    ///         ratePerSecond is computed by integer division; any rounding
    ///         dust (msg.value - ratePerSecond * durationSeconds) sits in
    ///         the contract and is unrecoverable by the recipient. The dust
    ///         is included in the contract's solvency math (it's part of
    ///         this stream's obligation and only this stream's recipient
    ///         could ever receive it, but they can't because rate * duration
    ///         caps below msg.value). Acceptable trade-off for the hackathon.
    function createStream(
        address recipient,
        uint256 durationSeconds
    ) external payable returns (uint256 streamId) {
        if (recipient == address(0)) revert InvalidRecipient();
        if (durationSeconds == 0) revert InvalidDuration();
        if (msg.value == 0) revert InvalidAmount();

        uint256 ratePerSecond = msg.value / durationSeconds;
        if (ratePerSecond == 0) revert InvalidAmount(); // msg.value < durationSeconds

        streamId = nextStreamId++;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + durationSeconds;

        streams[streamId] = Stream({
            sender: msg.sender,
            recipient: recipient,
            totalAmount: msg.value,
            ratePerSecond: ratePerSecond,
            startTime: startTime,
            endTime: endTime,
            withdrawn: 0,
            pausedAt: 0,
            pausedAccumulated: 0,
            status: StreamStatus.Active
        });

        // Track the maximum the recipient can ever withdraw (rate * duration,
        // which is ≤ msg.value due to integer division dust).
        totalCommittedUnreleased += ratePerSecond * durationSeconds;

        emit StreamCreated(
            streamId,
            msg.sender,
            recipient,
            msg.value,
            ratePerSecond,
            startTime,
            endTime
        );
    }

    /// @notice Withdraws available balance to the recipient.
    /// @param streamId The stream to withdraw from.
    /// @param amount The amount to withdraw, or type(uint256).max for all.
    function withdraw(uint256 streamId, uint256 amount)
        external
        streamExists(streamId)
    {
        Stream storage s = streams[streamId];
        if (msg.sender != s.recipient) revert NotRecipient();

        uint256 available = _availableBalance(streamId);
        if (available == 0) revert NothingToWithdraw();

        uint256 toSend = (amount == type(uint256).max || amount > available)
            ? available
            : amount;
        if (toSend == 0) revert InvalidAmount();

        s.withdrawn += toSend;
        totalCommittedUnreleased -= toSend;

        // Lazy completion: if status is Active and the stream has fully
        // accrued and been fully withdrawn, mark Completed. We don't auto-
        // complete a Paused stream — sender or policies still need to act.
        uint256 maxAccruable = s.ratePerSecond * (s.endTime - s.startTime);
        if (
            s.status == StreamStatus.Active &&
            block.timestamp >= s.endTime &&
            s.withdrawn >= maxAccruable
        ) {
            s.status = StreamStatus.Completed;
            emit StreamCompleted(streamId);
        }

        (bool ok, ) = s.recipient.call{value: toSend}("");
        if (!ok) revert TransferFailed();

        emit Withdrawal(streamId, s.recipient, toSend);
    }

    /// @notice Pauses a stream. Only callable by the DripPolicies contract.
    /// @param streamId The stream to pause.
    /// @param reason A short human-readable reason (for event log / UI).
    function pause(uint256 streamId, string calldata reason)
        external
        onlyPolicies
        streamExists(streamId)
    {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.Active) {
            revert InvalidStatus(s.status, StreamStatus.Active);
        }
        s.pausedAt = block.timestamp;
        s.status = StreamStatus.Paused;
        emit StreamPaused(streamId, reason);
    }

    /// @notice Resumes a paused stream. Only callable by the DripPolicies contract.
    /// @param streamId The stream to resume.
    /// @dev    Naive accumulation (does not cap at endTime). The
    ///         _availableBalance view caps pausedSpan at totalSpan so that
    ///         pauses extending past endTime do not under-flow the math.
    function resume(uint256 streamId)
        external
        onlyPolicies
        streamExists(streamId)
    {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.Paused) {
            revert InvalidStatus(s.status, StreamStatus.Paused);
        }
        s.pausedAccumulated += block.timestamp - s.pausedAt;
        s.pausedAt = 0;
        s.status = StreamStatus.Active;
        emit StreamResumed(streamId);
    }

    /// @notice Cancels a stream. Only callable by the original sender.
    /// @dev    Pays the recipient whatever has accrued so far, refunds the
    ///         remainder of the stream's commitment to the sender, and
    ///         transitions to Cancelled. Both transfers can run because
    ///         the contract is solvent by construction.
    /// @param streamId The stream to cancel.
    function cancel(uint256 streamId) external streamExists(streamId) {
        Stream storage s = streams[streamId];
        if (msg.sender != s.sender) revert NotSender();
        if (
            s.status != StreamStatus.Active &&
            s.status != StreamStatus.Paused
        ) {
            revert InvalidStatus(s.status, StreamStatus.Active);
        }

        uint256 recipientShare = _availableBalance(streamId);

        // Outstanding obligation from this stream that we are releasing back
        // to the sender. = (max accruable - already-withdrawn - recipientShare).
        uint256 maxAccruable = s.ratePerSecond * (s.endTime - s.startTime);
        uint256 commitmentReleased = maxAccruable - s.withdrawn - recipientShare;

        // Also refund the integer-division dust to the sender — they're the
        // only party with a claim on it, since the recipient can never reach it.
        uint256 dust = s.totalAmount - maxAccruable;
        uint256 senderRefund = commitmentReleased + dust;

        // Update accounting BEFORE external calls (CEI pattern).
        s.withdrawn += recipientShare;
        s.status = StreamStatus.Cancelled;
        totalCommittedUnreleased -= (recipientShare + commitmentReleased);

        if (recipientShare > 0) {
            (bool okR, ) = s.recipient.call{value: recipientShare}("");
            if (!okR) revert TransferFailed();
            emit Withdrawal(streamId, s.recipient, recipientShare);
        }
        if (senderRefund > 0) {
            (bool okS, ) = s.sender.call{value: senderRefund}("");
            if (!okS) revert TransferFailed();
        }

        emit StreamCancelled(streamId);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns the amount the recipient can currently withdraw.
    function availableBalance(uint256 streamId) external view returns (uint256) {
        return _availableBalance(streamId);
    }

    /// @notice Returns the gross amount accrued to the recipient (including
    ///         what they've already withdrawn). Useful for UI ticker display.
    function streamedAmount(uint256 streamId) external view returns (uint256) {
        Stream storage s = streams[streamId];
        if (s.status == StreamStatus.None) return 0;
        return s.ratePerSecond * _effectiveElapsed(s);
    }

    /// @notice Returns true if the contract is solvent across all active streams.
    function isSolvent() external view returns (bool) {
        return address(this).balance >= totalCommittedUnreleased + REACTIVITY_RESERVE;
    }

    struct TreasuryHealth {
        uint256 contractBalance;
        uint256 totalCommittedUnreleased;
        uint256 reactivityReserve;
        bool isHealthy;
    }

    /// @notice Surfacing function for the frontend dashboard / judges.
    function treasuryHealth() external view returns (TreasuryHealth memory) {
        uint256 bal = address(this).balance;
        uint256 committed = totalCommittedUnreleased;
        return TreasuryHealth({
            contractBalance: bal,
            totalCommittedUnreleased: committed,
            reactivityReserve: REACTIVITY_RESERVE,
            isHealthy: bal >= committed + REACTIVITY_RESERVE
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal math — single source of truth for stream balance
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Available balance for a stream's recipient at the current block.
    ///      Returns 0 for None / Cancelled / Completed (terminal or unset).
    function _availableBalance(uint256 streamId) internal view returns (uint256) {
        Stream storage s = streams[streamId];
        StreamStatus st = s.status;
        if (st == StreamStatus.None) return 0;
        if (st == StreamStatus.Cancelled) return 0;
        if (st == StreamStatus.Completed) return 0;

        uint256 accrued = s.ratePerSecond * _effectiveElapsed(s);
        if (accrued <= s.withdrawn) return 0;
        return accrued - s.withdrawn;
    }

    /// @dev Effective elapsed seconds within [startTime, endTime] minus all
    ///      paused time (both completed and currently-active). Capped so that
    ///      pauses extending past endTime don't underflow.
    function _effectiveElapsed(Stream storage s) private view returns (uint256) {
        if (block.timestamp <= s.startTime) return 0;
        uint256 accrualEnd = block.timestamp < s.endTime ? block.timestamp : s.endTime;
        uint256 totalSpan = accrualEnd - s.startTime;

        uint256 pausedSpan = s.pausedAccumulated;
        if (s.status == StreamStatus.Paused && s.pausedAt < accrualEnd) {
            pausedSpan += accrualEnd - s.pausedAt;
        }
        if (pausedSpan >= totalSpan) return 0;
        return totalSpan - pausedSpan;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Reactivity handler hook — left for Milestone 3
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
        // Implemented in Milestone 3 (reactivity + agent integration).
        revert("TODO: _onEvent - implement in Milestone 3");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Receive — required for agent rebates and stream funding
    // ─────────────────────────────────────────────────────────────────────

    receive() external payable {}
}
