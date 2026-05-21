// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IJsonApiAgent
/// @notice ABI for the Somnia JSON API Request agent (ID 13174292974160097713).
/// @dev These functions are NOT called directly. Their selectors are encoded
///      into the `payload` argument of `IAgentRequester.createRequest`.

interface IJsonApiAgent {
    /// @notice Fetch a value from a JSON API and return it as a uint256.
    /// @param url The full URL of the JSON endpoint to fetch.
    /// @param selector Dot-path selector into the JSON (e.g. "bitcoin.usd").
    /// @param decimals Number of decimal places to encode the result with.
    function fetchUint(
        string calldata url,
        string calldata selector,
        uint8 decimals
    ) external returns (uint256);

    /// @notice Fetch a value from a JSON API and return it as a string.
    function fetchString(
        string calldata url,
        string calldata selector
    ) external returns (string memory);

    /// @notice Fetch an array of uints.
    function fetchUintArray(
        string calldata url,
        string calldata selector,
        uint8 decimals
    ) external returns (uint256[] memory);

    /// @notice Fetch an array of strings.
    function fetchStringArray(
        string calldata url,
        string calldata selector
    ) external returns (string[] memory);
}
