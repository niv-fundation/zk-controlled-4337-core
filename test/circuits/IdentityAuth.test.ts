import { expect } from "chai";
import { ethers, zkit } from "hardhat";

import { buildNullifier, EVENT_ID, poseidonHash, signRawPoseidon } from "@scripts";

import { Reverter } from "@test-helpers";

import { IdentityAuth } from "@/generated-types/zkit";

describe.only("IdentityAuth", () => {
  const reverter = new Reverter();

  let identityAuth: IdentityAuth;

  before(async () => {
    identityAuth = await zkit.getCircuit("IdentityAuth");

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  it("should correctly build nullifier hash and sign some data", async () => {
    const privateKeyRaw = BigInt(poseidonHash(ethers.hexlify(ethers.randomBytes(28)))) >> 1n;

    const messageHash = poseidonHash(ethers.hexlify(ethers.randomBytes(28)));
    const signature = signRawPoseidon(privateKeyRaw, messageHash);

    const nullifier = buildNullifier(privateKeyRaw, EVENT_ID);

    const proof = await identityAuth.generateProof({
      sk_i: privateKeyRaw,
      eventID: BigInt(EVENT_ID),
      messageHash: BigInt(messageHash),
      signatureR8x: signature.R8[0],
      signatureR8y: signature.R8[1],
      signatureS: signature.S,
    });

    expect(proof.publicSignals.nullifier).to.equal(BigInt(nullifier));

    expect(await identityAuth.verifyProof(proof)).to.be.true;

    expect(
      await identityAuth.verifyProof({
        ...proof,
        publicSignals: {
          ...proof.publicSignals,
          nullifier: BigInt(buildNullifier(privateKeyRaw, 10n)),
        },
      }),
    ).to.be.false;
  });

  it("should verify the proof", async () => {
    const eventId = "0x01";
    const privateKeyRaw = BigInt(poseidonHash(ethers.hexlify(ethers.randomBytes(32)))) >> 1n;

    const messageHash = poseidonHash(ethers.hexlify(ethers.randomBytes(32)));
    const signature = signRawPoseidon(privateKeyRaw, messageHash);

    const Verifier = await ethers.getContractFactory("IdentityAuthVerifier");
    const verifier = await Verifier.deploy();

    const proof = await identityAuth.generateProof({
      sk_i: privateKeyRaw,
      eventID: BigInt(eventId),
      messageHash: BigInt(messageHash),
      signatureR8x: signature.R8[0],
      signatureR8y: signature.R8[1],
      signatureS: signature.S,
    });

    expect(identityAuth).to.useSolidityVerifier(verifier).and.verifyProof(proof);
  });
});
