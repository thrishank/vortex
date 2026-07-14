/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/vortex.json`.
 */
export type Vortex = {
  "address": "6G3qPM3Rf4fmEgWRR8Mhv6822RJvrpuqf2aHB6QEzxe3",
  "metadata": {
    "name": "vortex",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "tree",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool.deposit_amount",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.deposit_amount",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "tree",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "depositAmount"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "depositAmount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "depositAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "recipient",
          "writable": true
        },
        {
          "name": "tree",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "pool.deposit_amount",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.deposit_amount",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "nullifierAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  117,
                  108,
                  108,
                  105,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "nullifierHash"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nullifierHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "recipient",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "proofA",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        },
        {
          "name": "proofB",
          "type": {
            "array": [
              "u8",
              128
            ]
          }
        },
        {
          "name": "proofC",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "nullifierAccount",
      "discriminator": [
        250,
        31,
        238,
        177,
        213,
        98,
        48,
        172
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "tree",
      "discriminator": [
        100,
        9,
        213,
        154,
        6,
        136,
        109,
        55
      ]
    }
  ],
  "events": [
    {
      "name": "depositEvent",
      "discriminator": [
        120,
        248,
        61,
        83,
        31,
        142,
        107,
        144
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAdmin",
      "msg": "Admin is only allowed to call this instruction"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid deposit amount, only 0.1 SOL and 1 SOL are allowed."
    },
    {
      "code": 6002,
      "name": "invalidProof",
      "msg": "Invalid proof provided."
    },
    {
      "code": 6003,
      "name": "proofVerificationFailed",
      "msg": "Proof verification failed."
    },
    {
      "code": 6004,
      "name": "treeFull",
      "msg": "Merkle tree is full."
    },
    {
      "code": 6005,
      "name": "hashError",
      "msg": "Hashing error occurred."
    },
    {
      "code": 6006,
      "name": "unknownRoot",
      "msg": "The provided root is not known."
    }
  ],
  "types": [
    {
      "name": "depositEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "leafIndex",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "nullifierAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nullifierHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depositAmount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tree",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "rootHistory",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                100
              ]
            }
          },
          {
            "name": "rootHistoryIndex",
            "type": "u32"
          },
          {
            "name": "filledSubtrees",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                20
              ]
            }
          },
          {
            "name": "zeros",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                20
              ]
            }
          },
          {
            "name": "nextIndex",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          }
        ]
      }
    }
  ]
};
