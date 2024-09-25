// LICENSE: MIT
pragma circom 2.1.6;

include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/poseidon.circom";

include "BuildNullifier.circom";
include "ExtractPublicKey.circom";
include "OptimizedEdDSAPoseidonVerifier.circom";

template IdentityAuth() {
    // Public Outputs
    signal output nullifier; // Poseidon3(sk_i, Poseidon1(sk_i), eventID)

    // Public Inputs
    signal input messageHash;

    // Private Inputs
    signal input sk_i;
    signal input eventID;

    signal input signatureR8x;
    signal input signatureR8y;
    signal input signatureS;

    // Verify Nullifier
    component nullifierVerifier = BuildNullifier();

    sk_i ==> nullifierVerifier.sk_i;
    eventID ==> nullifierVerifier.eventID;

    nullifier <== nullifierVerifier.nullifier;

    component getPubKey = ExtractPublicKey();
    sk_i ==> getPubKey.privateKey;

    component sigVerifier = OptimizedEdDSAPoseidonVerifier();
    sigVerifier.enabled <== 1;

    sigVerifier.Ax <== getPubKey.Ax;
    sigVerifier.Ay <== getPubKey.Ay;
    sigVerifier.S <== signatureS;
    sigVerifier.R8x <== signatureR8x;
    sigVerifier.R8y <== signatureR8y;
    sigVerifier.M <== messageHash;
}

component main {public [messageHash]} = IdentityAuth();
