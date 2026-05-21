// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title ILLMAgent
/// @notice ABI for the Somnia LLM Inference agent (ID 12847293847561029384).
/// @dev Runs Qwen3-30B with deterministic settings (fixed seed, temperature=0).
///      These functions are NOT called directly — their selectors are encoded
///      into the `payload` argument of `IAgentRequester.createRequest`.

interface ILLMAgent {
    /// @notice Single-turn classification, constrainable to a set of values.
    /// @param prompt The full prompt text.
    /// @param allowedValues Array of allowed output strings. If non-empty, the
    ///        model output is constrained to exactly one of these strings.
    /// @return The classified output string.
    function inferString(
        string calldata prompt,
        string[] calldata allowedValues
    ) external returns (string memory);

    /// @notice Single-turn integer output, clamped to a range.
    /// @param prompt The full prompt text.
    /// @param min Minimum allowed output value.
    /// @param max Maximum allowed output value.
    function inferNumber(
        string calldata prompt,
        int256 min,
        int256 max
    ) external returns (int256);

    /// @notice Multi-turn chat with message history.
    /// @param roles Array of role strings ("system", "user", "assistant", "tool").
    /// @param messages Array of message contents, parallel to roles.
    /// @return The model's response string.
    function inferChat(
        string[] calldata roles,
        string[] calldata messages
    ) external returns (string memory);

    /// @notice Multi-turn chat with MCP tool calling and on-chain tool calling.
    /// @dev Returns finishReason, response text, and pending tool calls.
    ///      For full documentation see docs.somnia.network/agents/base-agents/llm-inference
    function inferToolsChat(
        string[] calldata roles,
        string[] calldata messages,
        string[] calldata mcpUrls,
        bytes[] calldata onChainTools,
        uint8 chainOfThought,
        uint8 maxIterations
    )
        external
        returns (
            string memory finishReason,
            string memory response,
            bytes[] memory pendingToolCalls,
            uint256[] memory pendingToolCallIds
        );
}
