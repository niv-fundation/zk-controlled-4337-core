// LICENSE: MIT
pragma circom 2.1.6;

include "circomlib/circuits/compconstant.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/escalarmulany.circom";
include "circomlib/circuits/escalarmulfix.circom";

template OptimizedEdDSAPoseidonVerifier() {
    signal input enabled;
    signal input Ax;
    signal input Ay;

    signal input S;
    signal input R8x;
    signal input R8y;

    signal input M;

    // Ensure S < Subgroup Order
    component sNum2Bits = Num2Bits(253);
    sNum2Bits.in <== S;

    component compConstant = CompConstant(2736030358979909402780800718157159386076813972158567259200215660948447373040);

    for (var i = 0; i < 253; i++) {
        sNum2Bits.out[i] ==> compConstant.in[i];
    }

    compConstant.in[253] <== 0;
    compConstant.out * enabled === 0;

    // Calculate the h = H(R, A, msg)
    component hash = Poseidon(5);

    hash.inputs[0] <== R8x;
    hash.inputs[1] <== R8y;
    hash.inputs[2] <== Ax;
    hash.inputs[3] <== Ay;
    hash.inputs[4] <== M;

    component h2bits = Num2Bits_strict();
    h2bits.in <== hash.out;

    component b2Num = Bits2Num_strict();
    h2bits.out ==> b2Num.in;

    // Calculate second part of the right side: right2 = h * A
    component mulAny = EscalarMulAny(254);
    for (var i = 0; i < 254; i++) {
        mulAny.e[i] <== h2bits.out[i];
    }

    mulAny.p[0] <== Ax;
    mulAny.p[1] <== Ay;

    // Compute the right side: right =  R8 + right2
    component addRight = BabyAdd();
    addRight.x1 <== R8x;
    addRight.y1 <== R8y;
    addRight.x2 <== mulAny.out[0];
    addRight.y2 <== mulAny.out[1];

    // Calculate left side of equation left = S * B8
    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];

    component mulFix = EscalarMulFix(253, BASE8);
    for (var i = 0; i < 253; i++) {
        mulFix.e[i] <== sNum2Bits.out[i];
    }

    // Do the comparison left == right if enabled;
    component eqCheckX = ForceEqualIfEnabled();
    eqCheckX.enabled <== enabled;
    eqCheckX.in[0] <== mulFix.out[0];
    eqCheckX.in[1] <== addRight.xout;

    component eqCheckY = ForceEqualIfEnabled();
    eqCheckY.enabled <== enabled;
    eqCheckY.in[0] <== mulFix.out[1];
    eqCheckY.in[1] <== addRight.yout;
}
