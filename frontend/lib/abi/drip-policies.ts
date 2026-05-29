// AUTO-GENERATED from contracts/artifacts/dripPolicies.json — do not edit by hand.
// Regenerate via scripts/extract-abi.mjs in the project root.

export const dripPoliciesAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "dripAddress",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "platformAddress",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "IntervalTooSmall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPhase",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidStreamForPolicy",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotDrip",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotPlatform",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotStreamSender",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PolicyDisabledErr",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PolicyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PolicyMissing",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "needed",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "have",
        "type": "uint256"
      }
    ],
    "name": "UnderfundedForAgentCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnknownRequest",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "verdict",
        "type": "string"
      }
    ],
    "name": "ClassificationReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "activityJson",
        "type": "string"
      }
    ],
    "name": "GithubDataFetched",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "verdict",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "action",
        "type": "string"
      }
    ],
    "name": "PolicyActionTaken",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum DripPolicies.CheckPhase",
        "name": "phase",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "enum ResponseStatus",
        "name": "status",
        "type": "uint8"
      }
    ],
    "name": "PolicyCheckAborted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "subscriptionId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "scheduledForMs",
        "type": "uint256"
      }
    ],
    "name": "PolicyCheckScheduled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      }
    ],
    "name": "PolicyCheckStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      }
    ],
    "name": "PolicyDisabled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "githubUsername",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "githubRepo",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "checkIntervalSeconds",
        "type": "uint256"
      }
    ],
    "name": "PolicyRegistered",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "chainOfThought",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      }
    ],
    "name": "disablePolicy",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      }
    ],
    "name": "policies",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "githubUsername",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "githubRepo",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "dataUrl",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "dataSelector",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "checkIntervalSeconds",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastCheckTime",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "activeSubscriptionId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "activeScheduledMs",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "enabled",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "promptPrefix",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "string",
            "name": "githubUsername",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "githubRepo",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "dataUrl",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "dataSelector",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "checkIntervalSeconds",
            "type": "uint256"
          }
        ],
        "internalType": "struct DripPolicies.PolicyConfig",
        "name": "cfg",
        "type": "tuple"
      }
    ],
    "name": "registerPolicy",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "subscriptionId",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "streamId",
        "type": "uint256"
      }
    ],
    "name": "startPolicyCheck",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "systemMessage",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
] as const;
