import { ethers, zkit } from "hardhat";

import { setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { encodeIdentityProof, signRawPoseidon } from "@scripts";

import { EntryPoint, Paymaster, SmartAccount, SmartAccount__factory, SmartAccountFactory } from "@ethers-v6";
import { PackedUserOperationStruct } from "@/generated-types/ethers/@account-abstraction/contracts/core/EntryPoint";

export async function getSignature(signerPk: bigint, eventId: bigint, messageHash: string) {
  const signature = signRawPoseidon(signerPk, messageHash);

  const identityAuth = await zkit.getCircuit("IdentityAuth");
  const proofSessionKeyAuth = await identityAuth.generateProof({
    messageHash: BigInt(messageHash),
    sk_i: signerPk,
    eventID: BigInt(eventId),
    signatureR8x: signature.R8[0],
    signatureR8y: signature.R8[1],
    signatureS: signature.S,
  });

  const identityProofStruct: SmartAccount.IdentityProofStruct = {
    identityProof: {
      a: [proofSessionKeyAuth.proof.pi_a[0], proofSessionKeyAuth.proof.pi_a[1]],
      b: [
        [proofSessionKeyAuth.proof.pi_b[0][1], proofSessionKeyAuth.proof.pi_b[0][0]],
        [proofSessionKeyAuth.proof.pi_b[1][1], proofSessionKeyAuth.proof.pi_b[1][0]],
      ],
      c: [proofSessionKeyAuth.proof.pi_c[0], proofSessionKeyAuth.proof.pi_c[1]],
    },
  };

  return encodeIdentityProof(identityProofStruct);
}

export async function executeViaEntryPoint(
  entryPoint: EntryPoint,
  account: SmartAccount,
  paymaster: Paymaster,
  signerPk: bigint,
  eventId: bigint,
  destination: string,
  data: string,
  value: bigint,
) {
  if ((await ethers.provider.getBalance(await account.getAddress())) === 0n) {
    await setBalance(await account.getAddress(), ethers.parseEther("20"));
  }

  const userOp = await getDefaultPackedUserOperation(account, paymaster);
  userOp.callData = SmartAccount__factory.createInterface().encodeFunctionData("execute(address,uint256,bytes)", [
    destination,
    value,
    data,
  ]);

  const userOpHash = await entryPoint.getUserOpHash(userOp);
  userOp.signature = await getSignature(signerPk, eventId, userOpHash);

  await sendSignedPackedUserOperation(entryPoint, userOp);
}

export async function getInitCode(accountFactory: SmartAccountFactory, nullifier: string) {
  const initCode = ethers.concat([
    await accountFactory.getAddress(),
    accountFactory.interface.encodeFunctionData("deploySmartAccount(bytes32)", [nullifier]),
  ]);

  const predictedAddress = await accountFactory.predictSmartAccountAddress(nullifier);

  return { initCode, predictedAddress };
}

export async function getEmptyPackedUserOperation() {
  const verificationGasLimit = 2777216n;
  const callGasLimit = verificationGasLimit;
  const maxPriorityFeePerGas = 256n;
  const maxFeePerGas = maxPriorityFeePerGas;

  return {
    sender: ethers.ZeroAddress,
    nonce: 0n,
    initCode: "0x",
    callData: "0x",
    accountGasLimits: ethers.toBeHex((BigInt(verificationGasLimit) << 128n) | BigInt(callGasLimit), 32),
    preVerificationGas: verificationGasLimit,
    gasFees: ethers.toBeHex((BigInt(maxPriorityFeePerGas) << 128n) | BigInt(maxFeePerGas), 32),
    paymasterAndData: "0x",
    signature: "0x",
  };
}

export async function getDefaultPackedUserOperation(account: SmartAccount, paymaster: Paymaster) {
  const emptyUserOp = await getEmptyPackedUserOperation();

  emptyUserOp.sender = await account.getAddress();
  emptyUserOp.nonce = await account.getCurrentNonce();
  emptyUserOp.paymasterAndData = getPaymasterAndData(await paymaster.getAddress());

  return emptyUserOp;
}

export function getPaymasterAndData(paymaster: string): string {
  return (
    ethers.zeroPadBytes(paymaster + ethers.toBeHex("0x10000", 16).slice(2, 32), 36) +
    ethers.zeroPadValue("0x1000", 16).slice(2)
  );
}

export async function getSignedPackedUserOperation(
  entryPoint: EntryPoint,
  signerPk: bigint,
  eventId: bigint,
  userOp: PackedUserOperationStruct,
) {
  const userOpHash = await entryPoint.getUserOpHash(userOp);
  userOp.signature = await getSignature(signerPk, eventId, userOpHash);

  return userOp;
}

export async function sendSignedPackedUserOperation(entryPoint: EntryPoint, userOp: PackedUserOperationStruct) {
  const [sender] = await ethers.getSigners();
  await entryPoint.handleOps([userOp], await sender.getAddress(), { gasLimit: 10000000 });
}
