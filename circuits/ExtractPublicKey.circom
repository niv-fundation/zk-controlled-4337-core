// LICENSE: MIT
pragma circom 2.1.6;

include "circomlib/circuits/escalarmulfix.circom";

template ExtractPublicKey() {
    signal input  privateKey;
    signal output Ax;
    signal output Ay;

    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];

    component privateKeyBits = Num2Bits(254);
    privateKeyBits.in <== privateKey;

    component mulFix = EscalarMulFix(254, BASE8);

    for (var i = 0; i < 254; i++) {
        mulFix.e[i] <== privateKeyBits.out[i];
    }

    Ax  <== mulFix.out[0];
    Ay  <== mulFix.out[1];
}
