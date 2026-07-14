pragma circom 2.1.9;
include "poseidon.circom";

template Vortex(levels) {
    signal input root;
    signal input nullifierHash;

    // To Prevent validators from transaction hijacking.
    signal input recipient;

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
        nodeTimesIndex[i] <== nodes[i] * pathIndices[i];
        elemTimesIndex[i] <== pathElements[i] * pathIndices[i];

        left[i]  <== nodes[i] - nodeTimesIndex[i] + elemTimesIndex[i];
        right[i] <== nodeTimesIndex[i] + pathElements[i] - elemTimesIndex[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];

        nodes[i + 1] <== hashers[i].out;
    }

    // Root check
    nodes[levels] === root;

    // Nullifier hash check
    component nh = Poseidon(1);
    nh.inputs[0] <== nullifier;
    nh.out === nullifierHash;
}

component main {public [root, nullifierHash, recipient]} = Vortex(20);
