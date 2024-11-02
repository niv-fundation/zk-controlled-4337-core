import { ethers, keccak256 } from "ethers";

// @ts-ignore
import { Scalar } from "ffjavascript";

import { babyJub, Poseidon } from "@iden3/js-crypto";

export const EVENT_ID = 5n;

export function poseidonHash(data: string): string {
  data = ethers.hexlify(data);

  const chunks = splitHexIntoChunks(data.replace("0x", ""), 64);
  const inputs = chunks.map((v) => BigInt(v));

  return ethers.toBeHex(Poseidon.hash(inputs), 32);
}

function splitHexIntoChunks(hexString: string, chunkSize = 64) {
  const regex = new RegExp(`.{1,${chunkSize}}`, "g");
  const chunks = hexString.match(regex);

  if (!chunks) {
    throw new Error("Invalid hex string");
  }

  return chunks.map((chunk) => "0x" + chunk);
}

export function buildNullifier(pk: bigint, eventID: bigint): string {
  const secretHash = Poseidon.hash([pk]).toString();

  return poseidonHash(
    ethers.toBeHex(pk, 32) +
      ethers.toBeHex(secretHash, 32).replace("0x", "") +
      ethers.toBeHex(eventID, 32).replace("0x", ""),
  );
}

export function signRawPoseidon(privateKay: bigint, hash: string) {
  const publicKey = babyJub.mulPointEscalar(babyJub.Base8, privateKay);

  let r = Scalar.mod(BigInt(hash), babyJub.subOrder);
  const R8 = babyJub.mulPointEscalar(babyJub.Base8, r);

  const hashedMessage = Poseidon.hash([R8[0], R8[1], publicKey[0], publicKey[1], BigInt(hash)]);
  const hashedMessageScalar = Scalar.e(babyJub.F.toObject(hashedMessage));

  const S = Scalar.mod(Scalar.add(r, Scalar.mul(hashedMessageScalar, privateKay)), babyJub.subOrder);

  return {
    R8: R8,
    S: S,
  };
}

export function getPublicFromPrivateKey(privateKay: string) {
  let s = BigInt(privateKay);

  return babyJub.mulPointEscalar(babyJub.Base8, s);
}

export function verifySignature(
  messageHash: string,
  publicKey: [bigint, bigint],
  signature: { R8: [bigint, bigint]; S: bigint },
) {
  const hashedMessage = Poseidon.hash([
    signature.R8[0],
    signature.R8[1],
    publicKey[0],
    publicKey[1],
    BigInt(messageHash),
  ]);

  const hashedMessageScalar = Scalar.e(babyJub.F.toObject(hashedMessage));

  const mulR = babyJub.mulPointEscalar(publicKey, hashedMessageScalar);
  const P2 = babyJub.addPoint(signature.R8, mulR);

  const P1 = babyJub.mulPointEscalar(babyJub.Base8, signature.S);

  return P1[0] === P2[0] && P1[1] === P2[1];
}

export const hashPersonalMessage = function (message: Uint8Array): string {
  const prefix = Buffer.from(`\u0019Ethereum Signed Message:\n32`, "utf-8");
  return keccak256(Buffer.concat([prefix, message]));
};
