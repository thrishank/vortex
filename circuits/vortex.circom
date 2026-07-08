pragma circom 2.1.9;
include "poseidon.circom";

template Vortex(levels) {
    signal input root;
    signal input nullifierHash;

    // private
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Commitment
    signal commitment;
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    commitment <== commitmentHasher.out;

    // Merkle proof
    signal nodes[levels + 1];
    nodes[0] <== commitment;

    signal nodeTimesIndex[levels];
    signal elemTimesIndex[levels];
    signal left[levels];
    signal right[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        // Isolate each product into its own signal (each is degree-2)
        nodeTimesIndex[i] <== nodes[i] * pathIndices[i];
        elemTimesIndex[i] <== pathElements[i] * pathIndices[i];

        // Now these are purely linear — no degree-3
        left[i]  <== nodes[i] - nodeTimesIndex[i] + elemTimesIndex[i];
        right[i] <== nodeTimesIndex[i] + pathElements[i] - elemTimesIndex[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];

        nodes[i + 1] <== hashers[i].out;
    }

    nodes[levels] === root;

    // Nullifier hash check
    component nh = Poseidon(1);
    nh.inputs[0] <== nullifier;
    nh.out === nullifierHash;
}

component main {public [root, nullifierHash]} = Vortex(20);
