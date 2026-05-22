// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/*
 * TestableDrip — Hardhat-local subclass of Drip that bypasses the
 * reactivity precompile.
 *
 * Hardhat's EDR reserves address 0x0100 (the precompile address that
 * SomniaExtensions hardcodes) and short-circuits any installed bytecode
 * there — calls return empty data, decode-reverting on any contract that
 * expects a return value. That makes it impossible to mock the precompile
 * at the address level.
 *
 * This contract instead overrides Drip's `_subscribeSchedule` and
 * `_unsubscribe` virtual hooks with deterministic deterministic-id
 * implementations. The rest of Drip (storage, scheduling logic, _onEvent
 * dispatch, all the streaming math) is exercised exactly as in production.
 *
 * Tests deploy this in place of Drip and observe the emitted
 * TestableDrip_Subscribed / TestableDrip_Unsubscribed events to confirm
 * the scheduling calls were made.
 */

import {Drip} from "../Drip.sol";

contract TestableDrip is Drip {
    uint256 public testNextSubId = 1;

    event TestableDrip_Subscribed(uint256 indexed subscriptionId, uint256 scheduledMs);
    event TestableDrip_Unsubscribed(uint256 indexed subscriptionId);

    constructor() payable Drip() {}

    function _subscribeSchedule(uint256 scheduledMs)
        internal
        override
        returns (uint256 subscriptionId)
    {
        subscriptionId = testNextSubId++;
        emit TestableDrip_Subscribed(subscriptionId, scheduledMs);
    }

    function _unsubscribe(uint256 subscriptionId) internal override {
        emit TestableDrip_Unsubscribed(subscriptionId);
    }
}
