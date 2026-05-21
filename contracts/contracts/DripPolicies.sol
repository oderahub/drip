// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/*
 * ███████████████████████████████████████████████████████████████████████████
 *
 *   DripPolicies — the agent-control layer for Drip
 *
 *   This contract holds per-stream policy data and coordinates the agent
 *   invocation chain that classifies contributor activity. It is the only
 *   contract permitted to call Drip.pause() / Drip.resume().
 *
 *   Agent call chain:
 *     [Drip._onEvent fires]
 *           ↓
 *     startPolicyCheck(streamId)
 *           ↓
 *     [JSON API Request agent → callback]
 *           ↓
 *     handleGithubResponse → invoke LLM Inference
 *           ↓
 *     [LLM Inference agent → callback]
 *           ↓
 *     handleClassificationResponse → apply action → schedule next check
 *
 *   READ FIRST: skills/skill-agents.md and skills/skill-streaming.md
 *   before editing this file.
 *
 * ███████████████████████████████████████████████████████████████████████████
 */

import {
    IAgentRequester,
    IAgentRequesterHandler,
    Response,
    Request,
    ResponseStatus
} from "./interfaces/IAgentRequester.sol";
import {IJsonApiAgent} from "./interfaces/IJsonApiAgent.sol";
import {ILLMAgent} from "./interfaces/ILLMAgent.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

interface IDrip {
    function pause(uint256 streamId, string calldata reason) external;
    function resume(uint256 streamId) external;
}

contract DripPolicies is IAgentRequesterHandler {
    // ─────────────────────────────────────────────────────────────────────
    //  Agent constants — verified addresses from skill-agents.md
    // ─────────────────────────────────────────────────────────────────────

    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant LLM_INFERENCE_AGENT_ID = 12847293847561029384;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant JSON_API_PRICE_PER_AGENT = 0.03 ether;
    uint256 public constant LLM_PRICE_PER_AGENT = 0.07 ether;

    // ─────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────

    struct Policy {
        uint256 streamId;
        string githubUsername;
        string githubRepo;
        uint256 checkIntervalSeconds;
        uint256 lastCheckTime;
        uint256 activeSubscriptionId;
        bool enabled;
    }

    enum CheckPhase {
        None,
        FetchingGithub,
        Classifying,
        Completed
    }

    struct ActiveCheck {
        uint256 streamId;
        CheckPhase phase;
        string githubData; // populated after JSON API response
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────

    /// @notice The Drip contract this policy module controls.
    IDrip public immutable drip;

    /// @notice The Somnia Agents platform contract.
    IAgentRequester public immutable platform;

    /// @notice Per-stream policy configuration.
    mapping(uint256 streamId => Policy) public policies;

    /// @notice Tracks active multi-step agent checks by request ID.
    mapping(uint256 requestId => ActiveCheck) public activeChecks;

    /// @notice Maps subscription IDs back to the stream they belong to.
    mapping(uint256 subscriptionId => uint256 streamId) public subscriptionToStream;

    /// @notice Pending request ID tracking (used in callback gating).
    mapping(uint256 requestId => bool) public pendingRequests;

    // ─────────────────────────────────────────────────────────────────────
    //  Events — these drive the demo's "agent decision feed" frontend
    // ─────────────────────────────────────────────────────────────────────

    event PolicyRegistered(uint256 indexed streamId, string githubUsername, string githubRepo, uint256 checkIntervalSeconds);
    event PolicyCheckScheduled(uint256 indexed streamId, uint256 indexed subscriptionId, uint256 scheduledFor);
    event PolicyCheckStarted(uint256 indexed streamId);
    event GithubDataFetched(uint256 indexed streamId, uint256 indexed requestId, string activityJson);
    event ClassificationReceived(uint256 indexed streamId, uint256 indexed requestId, string verdict);
    event PolicyActionTaken(uint256 indexed streamId, string verdict, string action);

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    error NotDrip();
    error NotPlatform();
    error UnknownRequest();
    error PolicyExists();
    error PolicyMissing();
    error InvalidPhase();

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor(address dripAddress, address platformAddress) {
        drip = IDrip(dripAddress);
        platform = IAgentRequester(platformAddress);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Policy registration — TODO: implement
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Registers a GitHub-activity policy for a stream.
    /// @dev    Schedules the first policy check via Reactivity.
    function registerPolicy(
        uint256 streamId,
        string calldata githubUsername,
        string calldata githubRepo,
        uint256 checkIntervalSeconds
    ) external {
        // TODO: revert if policy already exists for streamId
        // TODO: write Policy struct
        // TODO: schedule first check via SomniaExtensions.scheduleSubscriptionAtTimestamp
        // TODO: emit PolicyRegistered and PolicyCheckScheduled
        revert("TODO: implement registerPolicy");
    }

    /// @notice Removes a policy and stops further checks.
    function disablePolicy(uint256 streamId) external {
        // TODO: revert if no policy exists
        // TODO: mark policy.enabled = false (subscription chain naturally ends after next firing)
        // TODO: optionally unsubscribe via SomniaExtensions.unsubscribe
        revert("TODO: implement disablePolicy");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Policy check loop — TODO: implement
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Called by Drip._onEvent when a scheduled check fires.
    /// @dev    Only callable by the Drip contract.
    function startPolicyCheck(uint256 streamId) external {
        if (msg.sender != address(drip)) revert NotDrip();
        // TODO: revert if policy is not enabled
        // TODO: build the GitHub API URL from policy data
        // TODO: compute deposit = platform.getRequestDeposit() + JSON_API_PRICE_PER_AGENT * SUBCOMMITTEE_SIZE
        // TODO: ABI-encode IJsonApiAgent.fetchString payload (URL + selector)
        // TODO: platform.createRequest{value: deposit}(...)
        // TODO: record ActiveCheck with phase = FetchingGithub
        // TODO: pendingRequests[requestId] = true
        // TODO: emit PolicyCheckStarted
        revert("TODO: implement startPolicyCheck");
    }

    /// @notice Unified callback for both JSON API and LLM Inference responses.
    /// @dev    Dispatches based on activeChecks[requestId].phase.
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) external override {
        if (msg.sender != address(platform)) revert NotPlatform();
        if (!pendingRequests[requestId]) revert UnknownRequest();
        delete pendingRequests[requestId];

        ActiveCheck storage check = activeChecks[requestId];

        if (check.phase == CheckPhase.FetchingGithub) {
            _onGithubFetched(requestId, responses, status, check);
        } else if (check.phase == CheckPhase.Classifying) {
            _onClassified(requestId, responses, status, check);
        } else {
            revert InvalidPhase();
        }
    }

    function _onGithubFetched(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        ActiveCheck storage check
    ) internal {
        // TODO: handle non-Success status (log error, schedule next check, return)
        // TODO: decode activity JSON from responses[0].result
        // TODO: store in check.githubData
        // TODO: emit GithubDataFetched
        // TODO: build classifier prompt (see skill-streaming.md for canonical wording)
        // TODO: compute deposit = floor + LLM_PRICE_PER_AGENT * SUBCOMMITTEE_SIZE
        // TODO: ABI-encode ILLMAgent.inferString payload with allowedValues
        // TODO: platform.createRequest{value: deposit}(...)
        // TODO: update check.phase = Classifying
        // TODO: pendingRequests[newRequestId] = true
        // silence unused-var warning until implemented
        requestId; responses; status; check;
        revert("TODO: implement _onGithubFetched");
    }

    function _onClassified(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        ActiveCheck storage check
    ) internal {
        // TODO: handle non-Success status
        // TODO: decode verdict string from responses[0].result
        // TODO: emit ClassificationReceived
        // TODO: dispatch on verdict:
        //   - "active" → ensure not paused (call drip.resume if currently paused)
        //   - "dormant" → drip.pause(streamId, "agent classified as dormant")
        //   - "inconclusive" → no state change
        // TODO: emit PolicyActionTaken
        // TODO: schedule the next check via SomniaExtensions.scheduleSubscriptionAtTimestamp
        // TODO: update policy.lastCheckTime, policy.activeSubscriptionId
        // TODO: emit PolicyCheckScheduled
        // TODO: mark check.phase = Completed
        // silence unused-var warning until implemented
        requestId; responses; status; check;
        revert("TODO: implement _onClassified");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Helpers — TODO: implement
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Build the GitHub REST API URL for a contributor's activity.
    function _buildGithubUrl(
        string memory /* username */,
        string memory /* repo */,
        uint256 /* windowSeconds */
    ) internal pure returns (string memory) {
        // TODO: format the GitHub REST API URL with date params
        return "";
    }

    /// @dev Build the classifier prompt incorporating the activity JSON.
    function _buildClassifierPrompt(
        string memory /* activityJson */
    ) internal pure returns (string memory) {
        // TODO: return the canonical prompt from skill-streaming.md, with
        //       the activity JSON inlined at {activity_json}
        return "";
    }

    /// @dev Schedules a Reactivity Schedule subscription for the next check.
    function _scheduleNextCheck(uint256 streamId, uint256 inSeconds) internal returns (uint256 subscriptionId) {
        // TODO: build SubscriptionOptions
        // TODO: call SomniaExtensions.scheduleSubscriptionAtTimestamp
        // TODO: record subscriptionToStream[subscriptionId] = streamId
        streamId; inSeconds; // silence unused-var warning
        return 0;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Receive — required for agent rebates and policy funding
    // ─────────────────────────────────────────────────────────────────────

    receive() external payable {}
}
