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

/// @dev Minimal interface the streaming primitive uses to call back into the
///      agent-control layer when a scheduled policy check fires. Defined
///      inline so Drip.sol stays independent of DripPolicies' full surface.
interface IDripPoliciesCallback {
    function startPolicyCheck(uint256 streamId) external;
}

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

    /// @notice Maps a reactivity subscription ID to its stream. Filled by
    ///         scheduleStreamCheck and used for off-chain inspection / cleanup.
    ///         **Not** used inside `_onEvent` — the precompile callback delivers
    ///         a Schedule event whose topics contain the firing timestamp, not
    ///         the subscription ID. See `scheduleTimestampToStream` for that.
    mapping(uint256 subscriptionId => uint256 streamId) public subscriptionToStream;

    /// @notice Maps a scheduled firing timestamp (in ms, the topic the Schedule
    ///         event carries) to its stream. This is the lookup used inside
    ///         `_onEvent`. Timestamps are made unique per scheduling call by
    ///         scheduleStreamCheck's collision-bump loop.
    mapping(uint256 scheduledTimestampMs => uint256 streamId) public scheduleTimestampToStream;

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
    event StreamCheckScheduled(
        uint256 indexed streamId,
        uint256 indexed subscriptionId,
        uint256 scheduledTimestampMs
    );
    event StreamCheckUnscheduled(uint256 indexed streamId, uint256 indexed subscriptionId);
    event PolicyCheckDispatched(uint256 indexed streamId, uint256 scheduledTimestampMs);

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
    error NoPoliciesWired();
    error UnknownSubscriptionTimestamp(uint256 timestampMs);
    error ScheduleInPast();

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

    /// @notice Convenience view: who created this stream. Used by DripPolicies
    ///         for access control on registerPolicy / disablePolicy.
    function streamSender(uint256 streamId) external view returns (address) {
        return streams[streamId].sender;
    }

    /// @notice Convenience view: current lifecycle status as uint8.
    ///         0=None, 1=Active, 2=Paused, 3=Cancelled, 4=Completed.
    ///         Used by DripPolicies action dispatch to decide pause vs no-op.
    function streamStatus(uint256 streamId) external view returns (uint8) {
        return uint8(streams[streamId].status);
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
    //  Reactivity scheduling — DripPolicies calls these
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Schedule a one-shot reactivity callback for a stream's next
    ///         policy check. Called by DripPolicies. Drip owns the
    ///         subscription so the 32-STT minimum balance is held here, not
    ///         in DripPolicies.
    /// @param  streamId         Stream this check belongs to.
    /// @param  secondsFromNow   Seconds until the check fires. Must be > 0.
    /// @return subscriptionId   The precompile-assigned subscription ID.
    /// @return scheduledMs      The actual ms timestamp the subscription
    ///                          fires at — may be a few ms later than the
    ///                          natural value to avoid collisions in
    ///                          scheduleTimestampToStream.
    /// @dev    Schedule events carry only the firing timestamp in
    ///         eventTopics[1], not the subscription ID. We use the timestamp
    ///         as the lookup key, so timestamps must be unique. The
    ///         collision-bump loop guarantees this for up to ~few thousand
    ///         simultaneously-scheduled streams without affecting timing
    ///         (Somnia block time is ~100ms; a few-ms bump is invisible).
    function scheduleStreamCheck(uint256 streamId, uint256 secondsFromNow)
        external
        onlyPolicies
        streamExists(streamId)
        returns (uint256 subscriptionId, uint256 scheduledMs)
    {
        if (secondsFromNow == 0) revert ScheduleInPast();

        uint256 natural = (block.timestamp + secondsFromNow) * 1000;
        scheduledMs = natural;
        // Bump by FULL SECONDS, not 1 ms. The reactivity precompile reports
        // the actual firing time in the Schedule event's topic[1] — with
        // sub-second precision — NOT the requested time. So _onEvent rounds
        // the firing topic DOWN to the nearest second to look up the stream.
        // For that round-down to work, every scheduledMs we store must be a
        // whole-second multiple (ends in 000). Hence: bump by 1000.
        // Trade-off: collisions shift the colliding stream by 1 full second
        // instead of 1 ms. Acceptable — Somnia's block time is ~100 ms, so
        // a 1-second shift just means firing one block later than ideal.
        while (scheduleTimestampToStream[scheduledMs] != 0) {
            unchecked { scheduledMs += 1000; }
        }

        subscriptionId = _subscribeSchedule(scheduledMs);

        subscriptionToStream[subscriptionId] = streamId;
        scheduleTimestampToStream[scheduledMs] = streamId;

        emit StreamCheckScheduled(streamId, subscriptionId, scheduledMs);
    }

    /// @dev Production: route through SomniaExtensions → reactivity precompile.
    ///      Test override: bypass and return a deterministic mock id. Marked
    ///      `internal virtual` ONLY so a Hardhat-local TestableDrip can
    ///      override it — Hardhat's EDR intercepts address 0x0100 (the
    ///      precompile address SomniaExtensions hardcodes) and short-circuits
    ///      any installed bytecode there, so we can't mock at the address
    ///      level. Override point is the next-best thing.
    function _subscribeSchedule(uint256 scheduledMs)
        internal
        virtual
        returns (uint256 subscriptionId)
    {
        return SomniaExtensions.scheduleSubscriptionAtTimestamp(
            address(this),
            scheduledMs,
            SomniaExtensions.SubscriptionOptions({
                priorityFeePerGas: 1,
                maxFeePerGas: 0,             // protocol picks max
                gasLimit: 2_000_000          // 2M — leaves 1M reserve for Somnia storage ops
            })
        );
    }

    /// @notice Cancel an outstanding stream-check subscription. Used by
    ///         DripPolicies.disablePolicy and on stream cancel.
    /// @dev    Unsubscribing while the subscription is firing in the same
    ///         block is forbidden by skill-streaming.md "What NOT to do" #7.
    ///         Only call from administrative paths, never from inside
    ///         `_onEvent`.
    function unsubscribeStreamCheck(uint256 subscriptionId, uint256 scheduledMs)
        external
        onlyPolicies
    {
        uint256 streamId = subscriptionToStream[subscriptionId];
        // Silently no-op on already-cleaned entries so callers don't have to
        // track whether they ever scheduled.
        if (streamId == 0) return;

        _unsubscribe(subscriptionId);
        delete subscriptionToStream[subscriptionId];
        if (scheduleTimestampToStream[scheduledMs] == streamId) {
            delete scheduleTimestampToStream[scheduledMs];
        }
        emit StreamCheckUnscheduled(streamId, subscriptionId);
    }

    /// @dev Override point — see _subscribeSchedule's note.
    function _unsubscribe(uint256 subscriptionId) internal virtual {
        SomniaExtensions.unsubscribe(subscriptionId);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Reactivity handler hook
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Called by the reactivity precompile when a scheduled policy
    ///         check fires.
    /// @dev    Inherited from SomniaEventHandler. The base contract verifies
    ///         msg.sender == 0x0100 before reaching this function.
    ///
    ///         For a Schedule subscription firing:
    ///         - emitter        = 0x100 (system event emitter)
    ///         - eventTopics[0] = keccak256("Schedule(uint256)")
    ///         - eventTopics[1] = scheduled timestamp in ms (uint256 cast)
    ///         - data           = empty
    ///
    ///         We decode the timestamp, look up the stream, clear the
    ///         lookup entry (since the subscription is one-shot and will
    ///         auto-remove from the precompile), and delegate to
    ///         DripPolicies.startPolicyCheck. DripPolicies is responsible
    ///         for scheduling the *next* check from inside its agent
    ///         callback — never from here, per skill-reactivity.md.
    function _onEvent(
        address /* emitter */,
        bytes32[] calldata eventTopics,
        bytes calldata /* data */
    ) internal override {
        if (policies == address(0)) revert NoPoliciesWired();

        // Empirical Somnia behaviour (Milestone 4 testnet-run discovery):
        // the Schedule event's topic[1] is the ACTUAL firing time with
        // sub-second precision, NOT the requested scheduledMs we registered.
        // Our scheduledMs values always end in `000` (whole-second multiples)
        // because scheduleStreamCheck bumps by 1000 on collision. Round
        // the firing time down to the nearest whole second to recover the
        // mapping key.
        //
        // The precompile's filter for Schedule events treats topic[1] as a
        // LOWER BOUND on firing time (per `skill-reactivity.md`: "fires in
        // the first block whose timestamp ≥ topic[1]") — that's why our
        // subscription matched despite the topic mismatch.
        uint256 firingMs = uint256(eventTopics[1]);
        uint256 scheduledMs = (firingMs / 1000) * 1000;
        uint256 streamId = scheduleTimestampToStream[scheduledMs];
        if (streamId == 0) {
            // Edge case: if the precompile slipped into the next second
            // before firing, the requested second is one back.
            unchecked { scheduledMs -= 1000; }
            streamId = scheduleTimestampToStream[scheduledMs];
        }
        if (streamId == 0) revert UnknownSubscriptionTimestamp(firingMs);

        // Clear the timestamp entry — the subscription has fired and is
        // auto-removed precompile-side. We can't safely clear
        // subscriptionToStream here because we don't have the subscription
        // ID; it stays until disablePolicy or scheduling a replacement
        // collides. That's a slow memory leak; acceptable for the hackathon
        // and easy to clean up later.
        delete scheduleTimestampToStream[scheduledMs];

        emit PolicyCheckDispatched(streamId, scheduledMs);
        IDripPoliciesCallback(policies).startPolicyCheck(streamId);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Receive — required for agent rebates and stream funding
    // ─────────────────────────────────────────────────────────────────────

    receive() external payable {}
}
