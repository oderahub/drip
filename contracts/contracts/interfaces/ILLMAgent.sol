// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title ILLMAgent
/// @notice ABI for the Somnia LLM Inference agent (ID 12847293847561029384).
///
/// @dev    This interface is verified against the on-chain agent manifest:
///         AgentRegistry: 0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A
///         Manifest URI:  https://storage.googleapis.com/somnia-agents-artifacts/
///                        agents/llm-inference/5a2c2130d07dc031812731e450f6384dc1b358db.json
///         Manifest hash: 5a2c2130d07dc031812731e450f6384dc1b358db
///
///         If LLM Inference invocations begin failing with "agent returned
///         status 400 / Data In 0 / Prompt Tokens 0", the manifest hash may
///         have advanced. Re-verify by running the ABI freshness check
///         documented in skills/skill-agents.md.
///
///         These functions are NOT called directly — their selectors are
///         encoded into the `payload` argument of
///         `IAgentRequester.createRequest`.

/// @notice Tool descriptor used by `inferToolsChat`.
struct InferToolsChatTool {
    string signature;
    string description;
}

interface ILLMAgent {
    /// @notice Single-turn classification, constrainable to a set of values.
    /// @param prompt        The user-facing task and data (treat data as data).
    /// @param system        The system message — agent identity, output
    ///                      discipline, prompt-injection defense. Higher
    ///                      trust than `prompt`.
    /// @param chainOfThought If true, the model emits reasoning text before
    ///                      its final answer (non-deterministic). Drip uses
    ///                      `false` for determinism.
    /// @param allowedValues Hard output constraint. If non-empty, the model
    ///                      output is forced to exactly one of these strings.
    /// @return response The classified output string.
    /// @dev    Selector: 0xfe7ca098
    function inferString(
        string calldata prompt,
        string calldata system,
        bool chainOfThought,
        string[] calldata allowedValues
    ) external returns (string memory response);

    /// @notice Single-turn integer output, clamped to a range.
    /// @param prompt         User-facing task and data.
    /// @param system         System message.
    /// @param minValue       Inclusive lower bound on the output.
    /// @param maxValue       Inclusive upper bound on the output.
    /// @param chainOfThought If true, allows reasoning text (non-deterministic).
    /// @return response The classified output integer.
    /// @dev    Selector: 0xc6833c3d
    function inferNumber(
        string calldata prompt,
        string calldata system,
        int256 minValue,
        int256 maxValue,
        bool chainOfThought
    ) external returns (int256 response);

    /// @notice Multi-turn chat with message history.
    /// @param roles          Array of role strings ("system", "user",
    ///                      "assistant", "tool"), parallel to `messages`.
    /// @param messages       Array of message contents.
    /// @param chainOfThought If true, allows reasoning text.
    /// @return response The model's response string.
    /// @dev    Selector: 0xbee8d139
    function inferChat(
        string[] calldata roles,
        string[] calldata messages,
        bool chainOfThought
    ) external returns (string memory response);

    /// @notice Multi-turn chat with MCP tool calling and on-chain tools.
    /// @param roles            Parallel to `messages`.
    /// @param messages         The conversation so far.
    /// @param mcpServerUrls    URLs of MCP servers the model may call.
    /// @param onchainTools     On-chain tool descriptors. See
    ///                         `InferToolsChatTool`.
    /// @param maxIterations    Maximum iterations of the tool-calling loop.
    /// @param chainOfThought   If true, allows reasoning text.
    /// @return finishReason       Why the loop terminated.
    /// @return response           Final response text.
    /// @return updatedRoles       Updated roles array including tool turns.
    /// @return updatedMessages    Updated messages array including tool turns.
    /// @return pendingToolCallIds IDs of tool calls that did not complete.
    /// @return pendingToolCalls   Encoded calldata for pending tool calls.
    function inferToolsChat(
        string[] calldata roles,
        string[] calldata messages,
        string[] calldata mcpServerUrls,
        InferToolsChatTool[] calldata onchainTools,
        uint256 maxIterations,
        bool chainOfThought
    )
        external
        returns (
            string memory finishReason,
            string memory response,
            string[] memory updatedRoles,
            string[] memory updatedMessages,
            string[] memory pendingToolCallIds,
            bytes[] memory pendingToolCalls
        );
}
