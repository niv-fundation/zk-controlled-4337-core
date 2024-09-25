// LICENSE: MIT
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

template BuildNullifier() {
    signal output nullifier;

    signal input sk_i;
    signal input eventID;

    component hasher1 = Poseidon(1);
    component hasher3 = Poseidon(3);

    sk_i ==> hasher1.inputs[0];

    sk_i ==> hasher3.inputs[0];
    hasher1.out ==> hasher3.inputs[1];
    eventID ==> hasher3.inputs[2];

    nullifier <== hasher3.out;
}
