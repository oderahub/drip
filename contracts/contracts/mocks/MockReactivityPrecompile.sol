// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/*
 * MockReactivityPrecompile — test stand-in for the Somnia reactivity
 * precompile at address 0x0100.
 *
 * Strategy: tests inject this contract's bytecode at 0x0100 via Hardhat's
 * `hardhat_setCode`. SomniaExtensions then calls this for subscribe /
 * unsubscribe / getSubscriptionInfo and gets sensible results back.
 *
 * What it does:
 *   - subscribe(): assigns a sequential subscription ID, records the data
 *   - unsubscribe(): clears the record (idempotent)
 *   - getSubscriptionInfo(): returns the recorded data
 *
 * What it does NOT do:
 *   - Actually fire scheduled callbacks. Tests trigger Drip.onEvent by
 *     impersonating address(0x0100) (the precompile address) and calling
 *     onEvent directly. See DripPolicies.test.ts simulateScheduleFire().
 *
 * Storage layout note: this contract is meant to be loaded at 0x0100, so it
 * shares storage with whatever the chain previously had there. In tests
 * that's nothing (Hardhat's fresh state); storage slots 0..N are ours.
 */

import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

contract MockReactivityPrecompile is ISomniaReactivityPrecompile {
    uint256 public nextSubscriptionId = 1;

    struct StoredSubscription {
        SubscriptionData data;
        address owner;
        bool exists;
    }

    mapping(uint256 => StoredSubscription) public subscriptions;

    function subscribe(SubscriptionData calldata subscriptionData)
        external
        override
        returns (uint256 subscriptionId)
    {
        subscriptionId = nextSubscriptionId++;
        subscriptions[subscriptionId] = StoredSubscription({
            data: subscriptionData,
            owner: msg.sender,
            exists: true
        });
        emit SubscriptionCreated(subscriptionId, msg.sender, subscriptionData);
    }

    function unsubscribe(uint256 subscriptionId) external override {
        StoredSubscription storage s = subscriptions[subscriptionId];
        if (!s.exists) return; // idempotent
        // Note: real precompile requires msg.sender == s.owner. The mock
        // doesn't enforce this — tests only call via SomniaExtensions which
        // routes through the correct owner anyway.
        address owner = s.owner;
        delete subscriptions[subscriptionId];
        emit SubscriptionRemoved(subscriptionId, owner);
    }

    function getSubscriptionInfo(uint256 subscriptionId)
        external
        view
        override
        returns (SubscriptionData memory subscriptionData, address owner)
    {
        StoredSubscription storage s = subscriptions[subscriptionId];
        return (s.data, s.owner);
    }
}
