import { ethers } from "hardhat";
import { SmartAccount } from "@ethers-v6";

export function wei(value: string | number | bigint, decimal: number = 18): bigint {
  if (typeof value == "number" || typeof value == "bigint") {
    value = value.toString();
  }

  return ethers.parseUnits(value as string, decimal);
}

export function fromWei(value: string | number | bigint, decimal: number = 18): string {
  return (BigInt(value) / 10n ** BigInt(decimal)).toString();
}

export function encodeIdentityProof(proof_: SmartAccount.IdentityProofStruct): string {
  const encoder = new ethers.AbiCoder();

  const inputs = {
    components: [
      {
        components: [
          {
            internalType: "uint256[2]",
            name: "a",
            type: "uint256[2]",
          },
          {
            internalType: "uint256[2][2]",
            name: "b",
            type: "uint256[2][2]",
          },
          {
            internalType: "uint256[2]",
            name: "c",
            type: "uint256[2]",
          },
        ],
        internalType: "struct VerifierHelper.ProofPoints",
        name: "identityProof",
        type: "tuple",
      },
    ],
    internalType: "struct SmartAccount.IdentityProof",
    name: "proof_",
    type: "tuple",
  };

  return encoder.encode([ethers.ParamType.from(inputs)], [proof_]);
}
