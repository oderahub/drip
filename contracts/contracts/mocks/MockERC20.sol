// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Minimal mintable ERC-20 for testing future Drip ERC-20 streams.
/// @dev    Not used in the v1 hackathon demo (native STT streams only).
///         Included so that ERC-20 stream support can be added without a
///         deployment scaffold change.
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
